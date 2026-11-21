//! Optional local material. WGC supplies the monitor texture. Only the body
//! and its sampling margin are copied. The copy and shader both stay on GPU.
use super::super::geometry::{BackdropRegion, DesktopLensSettings};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use windows::{
    core::{self, s, Interface, Result},
    Foundation::{TimeSpan, TypedEventHandler},
    Graphics::{
        Capture::{
            Direct3D11CaptureFramePool, GraphicsCaptureDirtyRegionMode, GraphicsCaptureItem,
            GraphicsCaptureSession,
        },
        DirectX::{Direct3D11::IDirect3DDevice, DirectXPixelFormat},
        SizeInt32,
    },
    Win32::{
        Foundation::{E_FAIL, HWND, LPARAM, POINT, RECT, WPARAM},
        Graphics::{
            Direct3D::{
                Fxc::D3DCompile, ID3DBlob, D3D_DRIVER_TYPE_HARDWARE,
                D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST,
            },
            Direct3D11::*,
            Dxgi::{Common::*, *},
            Gdi::{
                ClientToScreen, GetMonitorInfoW, MonitorFromWindow, HMONITOR, MONITORINFO,
                MONITOR_DEFAULTTONEAREST,
            },
        },
        System::WinRT::{
            Composition::ICompositorInterop,
            Direct3D11::{CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess},
            Graphics::Capture::IGraphicsCaptureItemInterop,
        },
        UI::WindowsAndMessaging::{
            GetWindowDisplayAffinity, KillTimer, PostMessageW, SetTimer, SetWindowDisplayAffinity,
            WDA_EXCLUDEFROMCAPTURE, WINDOW_DISPLAY_AFFINITY, WM_APP,
        },
    },
    UI::Composition::{
        CompositionBatchTypes, CompositionScopedBatch, Compositor, ContainerVisual, SpriteVisual,
    },
};
use windows_numerics::{Vector2, Vector3};

#[path = "gaussian.rs"]
mod gaussian;
use gaussian::Gaussian;

pub(crate) const LENS_FRAME: u32 = WM_APP + 0x46;
pub(crate) const LENS_PRESENT_TIMER: usize = 0x4d49_4c50;
const CAPTURE_BUFFERS: i32 = 2;
const FRAME_INTERVAL: i64 = 160_000; // 16 ms, in 100 ns ticks
const FORMAT: DXGI_FORMAT = DXGI_FORMAT_B8G8R8A8_UNORM;
const SAMPLE: DXGI_SAMPLE_DESC = DXGI_SAMPLE_DESC {
    Count: 1,
    Quality: 0,
};
const SHADER: &[u8] = include_bytes!("lens.hlsl");

struct CaptureExclusion(HWND, u32);
impl CaptureExclusion {
    fn for_window(window: HWND) -> Result<Self> {
        let mut previous = 0;
        unsafe {
            GetWindowDisplayAffinity(window, &mut previous)?;
            SetWindowDisplayAffinity(window, WDA_EXCLUDEFROMCAPTURE)?;
        }
        Ok(Self(window, previous))
    }
}
impl Drop for CaptureExclusion {
    fn drop(&mut self) {
        let _ = unsafe { SetWindowDisplayAffinity(self.0, WINDOW_DISPLAY_AFFINITY(self.1)) };
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct LensLayout {
    pub left: i32,
    pub top: i32,
    pub width: u32,
    pub height: u32,
    pub radii: [f32; 4],
    pub bend: f32,
    pub dispersion: f32,
    pub frost: f32,
    pub opacity: f32,
    pub snapshot: bool,
    pub reduced_motion: bool,
}

impl LensLayout {
    pub(crate) fn new(
        region: &BackdropRegion,
        scale: f64,
        global_frost: f64,
        lens: DesktopLensSettings,
    ) -> Self {
        let physical = region.physical(scale, global_frost);
        Self {
            left: physical.left.round() as i32,
            top: physical.top.round() as i32,
            width: physical.width.round() as u32,
            height: physical.height.round() as u32,
            radii: physical.radii.map(|value| value as f32),
            bend: lens.bend * (24.0 * scale as f32).min(36.0),
            dispersion: lens.dispersion * (6.0 * scale as f32).min(10.0),
            // The slider expresses a visible blur radius in CSS pixels. The
            // Gaussian standard deviation is one third of that radius.
            frost: (region.frost.unwrap_or(global_frost) * (32.0 / 3.0) * scale).min(16.0) as f32,
            opacity: region.opacity as f32,
            snapshot: lens.snapshot,
            reduced_motion: lens.reduced_motion,
        }
    }
}

struct InputTexture {
    texture: ID3D11Texture2D,
    view: ID3D11ShaderResourceView,
    crop: RECT,
    revision: u64,
}

#[derive(Clone)]
pub(super) struct LensDevice {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    vs: ID3D11VertexShader,
    ps: ID3D11PixelShader,
    sampler: ID3D11SamplerState,
    constants: ID3D11Buffer,
}

impl LensDevice {
    pub(super) fn new() -> Result<Self> {
        let (device, context) = gpu_device()?;
        let (vs, ps, sampler, constants) = pipeline(&device)?;
        Ok(Self {
            device,
            context,
            vs,
            ps,
            sampler,
            constants,
        })
    }
}

pub(super) struct DesktopLens {
    hwnd: HWND,
    monitor: HMONITOR,
    source_size: SizeInt32,
    capture: Option<CaptureStream>,
    gpu: LensDevice,
    swapchain: IDXGISwapChain1,
    target: Option<ID3D11RenderTargetView>,
    root: ContainerVisual,
    visual: SpriteVisual,
    compositor: Compositor,
    revealed: Arc<AtomicBool>,
    reveal_started: bool,
    reveal_batch: Option<CompositionScopedBatch>,
    layout: LensLayout,
    source: Option<InputTexture>,
    gaussian: Option<Gaussian>,
    last_frame_time: Option<i64>,
    present_attempts: u8,
    visible: bool,
    redraw: bool,
}

struct CaptureStream {
    item: GraphicsCaptureItem,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    token: i64,
    closed_token: i64,
    closed: Arc<AtomicBool>,
    queued: Arc<AtomicBool>,
    dirty_tracking: bool,
    _exclusion: CaptureExclusion,
}

impl Drop for CaptureStream {
    fn drop(&mut self) {
        let _ = self.session.Close();
        let _ = self.item.RemoveClosed(self.closed_token);
        let _ = self.pool.RemoveFrameArrived(self.token);
        let _ = self.pool.Close();
    }
}

impl DesktopLens {
    pub(super) fn start(
        hwnd: HWND,
        compositor: &Compositor,
        root: &ContainerVisual,
        layout: LensLayout,
        gpu: LensDevice,
    ) -> Result<Self> {
        validate_size(layout)?;
        if !GraphicsCaptureSession::IsSupported()? {
            return Err(E_FAIL.into());
        }
        let exclusion = CaptureExclusion::for_window(hwnd)?;
        let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let interop: IGraphicsCaptureItemInterop = core::factory::<GraphicsCaptureItem, _>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForMonitor(monitor)? };
        let source_size = item.Size()?;
        let dxgi: IDXGIDevice = gpu.device.cast()?;
        if let Ok(device) = dxgi.cast::<IDXGIDevice1>() {
            let _ = unsafe { device.SetMaximumFrameLatency(1) };
        }
        let projected: IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)?.cast()? };
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &projected,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            CAPTURE_BUFFERS,
            source_size,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        let _ = session.SetIsCursorCaptureEnabled(false);
        // DWM still enforces the user's OS preference and capture permissions.
        // This is the same public session property used by Windhawk and OBS.
        let _ = session.SetIsBorderRequired(false);
        let dirty_tracking = session
            .SetDirtyRegionMode(GraphicsCaptureDirtyRegionMode::ReportOnly)
            .is_ok();
        session.SetMinUpdateInterval(TimeSpan {
            Duration: FRAME_INTERVAL,
        })?;

        let factory: IDXGIFactory2 = unsafe { dxgi.GetAdapter()?.GetParent()? };
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: layout.width,
            Height: layout.height,
            Format: FORMAT,
            SampleDesc: SAMPLE,
            BufferCount: 2,
            BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
            Scaling: DXGI_SCALING_STRETCH,
            SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
            AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
            ..Default::default()
        };
        let swapchain = unsafe { factory.CreateSwapChainForComposition(&gpu.device, &desc, None)? };
        let target = Some(render_target(&gpu.device, &swapchain)?);
        let surface = unsafe {
            compositor
                .cast::<ICompositorInterop>()?
                .CreateCompositionSurfaceForSwapChain(&swapchain)?
        };
        let visual = compositor.CreateSpriteVisual()?;
        visual.SetBrush(&compositor.CreateSurfaceBrushWithSurface(&surface)?)?;
        visual.SetIsVisible(false)?;
        fit_visual(&visual, layout)?;
        let queued = Arc::new(AtomicBool::new(false));
        let pending = queued.clone();
        let window_id = hwnd.0 as usize;
        let token = pool.FrameArrived(&TypedEventHandler::new(move |_, _| {
            if !pending.swap(true, Ordering::AcqRel)
                && unsafe {
                    PostMessageW(Some(HWND(window_id as _)), LENS_FRAME, WPARAM(0), LPARAM(0))
                }
                .is_err()
            {
                pending.store(false, Ordering::Release);
            }
            Ok(())
        }))?;
        let closed = Arc::new(AtomicBool::new(false));
        let stop = closed.clone();
        let closed_token = item.Closed(&TypedEventHandler::new(move |_, _| {
            stop.store(true, Ordering::Release);
            let _ = unsafe {
                PostMessageW(Some(HWND(window_id as _)), LENS_FRAME, WPARAM(0), LPARAM(0))
            };
            Ok(())
        }))?;
        let capture = CaptureStream {
            item,
            pool,
            session,
            token,
            closed_token,
            closed,
            queued,
            dirty_tracking,
            _exclusion: exclusion,
        };
        let lens = Self {
            hwnd,
            monitor,
            source_size,
            capture: Some(capture),
            gpu,
            swapchain,
            target,
            root: root.clone(),
            visual,
            compositor: compositor.clone(),
            revealed: Arc::new(AtomicBool::new(false)),
            reveal_started: false,
            reveal_batch: None,
            layout,
            source: None,
            gaussian: None,
            last_frame_time: None,
            present_attempts: 0,
            visible: false,
            redraw: true,
        };
        root.Children()?.InsertAtTop(&lens.visual)?;
        lens.capture
            .as_ref()
            .ok_or(E_FAIL)?
            .session
            .StartCapture()?;
        Ok(lens)
    }

    pub(super) fn is_snapshot(&self) -> bool {
        self.layout.snapshot
    }

    fn present_visual(&mut self) -> Result<()> {
        if self.visible {
            return Ok(());
        }
        self.visual.SetIsVisible(true)?;
        self.visible = true;
        if self.reveal_started {
            return Ok(());
        }
        self.reveal_started = true;
        if self.layout.reduced_motion {
            self.revealed.store(true, Ordering::Release);
            self.visual.StopAnimation(&"Opacity".into())?;
            self.visual.SetOpacity(1.)?;
            return Ok(());
        }
        let opacity = self.compositor.CreateScalarKeyFrameAnimation()?;
        opacity.InsertKeyFrame(0., 0.)?;
        opacity.InsertKeyFrame(1., 1.)?;
        opacity.SetDuration(TimeSpan {
            Duration: 1_400_000,
        })?;
        self.visual.SetOpacity(1.)?;
        let batch = self
            .compositor
            .CreateScopedBatch(CompositionBatchTypes::Animation)?;
        let done = self.revealed.clone();
        let window_id = self.hwnd.0 as usize;
        batch.Completed(&TypedEventHandler::new(move |_, _| {
            done.store(true, Ordering::Release);
            let _ = unsafe {
                PostMessageW(Some(HWND(window_id as _)), LENS_FRAME, WPARAM(0), LPARAM(0))
            };
            Ok(())
        }))?;
        self.visual.StartAnimation(&"Opacity".into(), &opacity)?;
        batch.End()?;
        self.reveal_batch = Some(batch);
        Ok(())
    }

    pub(super) fn configure(&mut self, layout: LensLayout) -> Result<()> {
        if layout == self.layout {
            return Ok(());
        }
        validate_size(layout)?;
        let previous = self.layout;
        let moved = (layout.left, layout.top) != (previous.left, previous.top);
        let resized = (layout.width, layout.height) != (previous.width, previous.height);
        if resized {
            unsafe {
                self.gpu.context.OMSetRenderTargets(None, None);
                self.target = None;
                self.swapchain.ResizeBuffers(
                    0,
                    layout.width,
                    layout.height,
                    FORMAT,
                    DXGI_SWAP_CHAIN_FLAG(0),
                )?;
            }
            self.target = Some(render_target(&self.gpu.device, &self.swapchain)?);
        }
        if moved || resized {
            self.visual.SetIsVisible(false)?;
            self.visible = false;
        }
        fit_visual(&self.visual, layout)?;
        self.layout = layout;
        self.redraw = true;
        self.present_attempts = 0;
        self.present_cached()?;
        Ok(())
    }

    fn present_cached(&mut self) -> Result<()> {
        if self.monitor != unsafe { MonitorFromWindow(self.hwnd, MONITOR_DEFAULTTONEAREST) } {
            return Err(E_FAIL.into());
        }
        if let Some(input) = &self.source {
            let body = self.body_rect()?;
            let crop = input.crop;
            if body.left.max(0) >= crop.left
                && body.top.max(0) >= crop.top
                && body.right.min(self.source_size.Width) <= crop.right
                && body.bottom.min(self.source_size.Height) <= crop.bottom
            {
                self.submit_frame(
                    POINT {
                        x: body.left - crop.left,
                        y: body.top - crop.top,
                    },
                    (crop.right - crop.left) as u32,
                    (crop.bottom - crop.top) as u32,
                )?;
            }
        }
        Ok(())
    }

    fn covers_body(&self) -> bool {
        self.visible && self.revealed.load(Ordering::Acquire)
    }

    /// Keep DWM behind the lens until a frame has finished fading in.
    pub(super) fn draw(&mut self) -> Result<bool> {
        if self.revealed.load(Ordering::Acquire) {
            self.reveal_batch = None;
        }
        let Some(capture) = &self.capture else {
            if self.present_attempts > 0 {
                self.present_cached()?;
            }
            return Ok(self.covers_body());
        };
        capture.queued.store(false, Ordering::Release);
        if capture.closed.load(Ordering::Acquire) {
            return Err(E_FAIL.into());
        }
        let Ok(mut frame) = capture.pool.TryGetNextFrame() else {
            if self.present_attempts > 0 {
                self.present_cached()?;
            }
            return Ok(self.covers_body());
        };
        // One UI message can represent two arrivals. Leaving the last buffer
        // queued can strand the previous window on screen after an Alt+Tab.
        let mut coalesced = false;
        for _ in 1..CAPTURE_BUFFERS {
            let Ok(newer) = capture.pool.TryGetNextFrame() else {
                break;
            };
            frame = newer;
            coalesced = true;
        }
        if frame.ContentSize()? != self.source_size
            || self.monitor != unsafe { MonitorFromWindow(self.hwnd, MONITOR_DEFAULTTONEAREST) }
        {
            return Err(E_FAIL.into());
        }
        let (crop, origin) = self.crop_rect()?;
        let same_crop = self.source.as_ref().is_some_and(|input| input.crop == crop);
        let frame_time = frame.SystemRelativeTime().ok().map(|time| time.Duration);
        // Dirty rectangles are relative to the preceding capture rather than
        // our last submitted frame. Copy whenever the continuity is unknown.
        let skipped = self
            .last_frame_time
            .zip(frame_time)
            .is_none_or(|(last, next)| next <= last || next - last >= FRAME_INTERVAL * 2);
        self.last_frame_time = frame_time;
        let crosses_crop = coalesced
            || skipped
            || !capture.dirty_tracking
            || frame.DirtyRegions().map_or(true, |regions| {
                regions.into_iter().any(|rect| {
                    rect.X < crop.right
                        && rect.X + rect.Width > crop.left
                        && rect.Y < crop.bottom
                        && rect.Y + rect.Height > crop.top
                })
            });
        if !self.redraw && same_crop && !crosses_crop {
            if self.present_attempts > 0 {
                self.present_cached()?;
            }
            return Ok(self.covers_body());
        }
        let tex_width = (crop.right - crop.left) as u32;
        let tex_height = (crop.bottom - crop.top) as u32;
        let needs_texture = self.source.as_ref().is_none_or(|input| {
            input.crop.right - input.crop.left != tex_width as i32
                || input.crop.bottom - input.crop.top != tex_height as i32
        });
        if needs_texture {
            self.source = Some(self.allocate_crop(crop, tex_width, tex_height)?);
        }
        let input = self.source.as_mut().ok_or(E_FAIL)?;
        if needs_texture || !same_crop || crosses_crop {
            let access: IDirect3DDxgiInterfaceAccess = frame.Surface()?.cast()?;
            let texture: ID3D11Texture2D = unsafe { access.GetInterface()? };
            let area = D3D11_BOX {
                left: crop.left as u32,
                top: crop.top as u32,
                right: crop.right as u32,
                bottom: crop.bottom as u32,
                front: 0,
                back: 1,
            };
            unsafe {
                self.gpu.context.CopySubresourceRegion(
                    &input.texture,
                    0,
                    0,
                    0,
                    0,
                    &texture,
                    0,
                    Some(&area),
                );
            }
            input.crop = crop;
            input.revision = input.revision.wrapping_add(1);
        }
        drop(frame);
        if crosses_crop {
            self.present_attempts = 0;
        }
        self.submit_frame(origin, tex_width, tex_height)?;
        Ok(self.covers_body())
    }

    fn submit_frame(&mut self, origin: POINT, tex_width: u32, tex_height: u32) -> Result<()> {
        if self.render(origin, tex_width, tex_height)? {
            self.redraw = false;
            self.present_attempts = 0;
            if self.layout.snapshot {
                // Retain only the cropped GPU texture. Restore this HWND's
                // recording visibility once the upstream capture has closed.
                self.capture = None;
            }
            self.present_visual()?;
        } else if self.present_attempts < 3 {
            self.present_attempts += 1;
            // Do not stall the UI thread on DXGI. Retry the already filtered
            // frame even if the desktop stops changing before the next tick.
            unsafe { SetTimer(Some(self.hwnd), LENS_PRESENT_TIMER, 16, None) };
        }
        Ok(())
    }

    fn body_rect(&self) -> Result<RECT> {
        let mut client = POINT::default();
        let mut monitor = MONITORINFO {
            cbSize: size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        unsafe {
            ClientToScreen(self.hwnd, &mut client).ok()?;
            GetMonitorInfoW(self.monitor, &mut monitor).ok()?;
        }
        let left = client.x + self.layout.left - monitor.rcMonitor.left;
        let top = client.y + self.layout.top - monitor.rcMonitor.top;
        Ok(RECT {
            left,
            top,
            right: left + self.layout.width as i32,
            bottom: top + self.layout.height as i32,
        })
    }

    fn crop_rect(&self) -> Result<(RECT, POINT)> {
        let RECT {
            left,
            top,
            right,
            bottom,
        } = self.body_rect()?;
        let pad = 64;
        let crop = RECT {
            left: (left - pad).max(0),
            top: (top - pad).max(0),
            right: (right + pad).min(self.source_size.Width),
            bottom: (bottom + pad).min(self.source_size.Height),
        };
        if crop.left >= crop.right || crop.top >= crop.bottom {
            return Err(E_FAIL.into());
        }
        Ok((
            crop,
            POINT {
                x: left - crop.left,
                y: top - crop.top,
            },
        ))
    }

    fn allocate_crop(&self, crop: RECT, width: u32, height: u32) -> Result<InputTexture> {
        let desc = D3D11_TEXTURE2D_DESC {
            Width: width,
            Height: height,
            MipLevels: 1,
            ArraySize: 1,
            Format: FORMAT,
            SampleDesc: SAMPLE,
            BindFlags: D3D11_BIND_SHADER_RESOURCE.0 as u32,
            Usage: D3D11_USAGE_DEFAULT,
            ..Default::default()
        };
        let (mut texture, mut view) = (None, None);
        unsafe {
            self.gpu
                .device
                .CreateTexture2D(&desc, None, Some(&mut texture))?;
            let texture = texture.ok_or(E_FAIL)?;
            self.gpu
                .device
                .CreateShaderResourceView(&texture, None, Some(&mut view))?;
            Ok(InputTexture {
                texture,
                view: view.ok_or(E_FAIL)?,
                crop,
                revision: 0,
            })
        }
    }

    fn render(&mut self, origin: POINT, tex_width: u32, tex_height: u32) -> Result<bool> {
        let layout = self.layout;
        let input = self.source.as_ref().ok_or(E_FAIL)?;
        let view = if layout.frost > 0. {
            let blur = match &mut self.gaussian {
                Some(blur) => blur,
                None => self.gaussian.insert(Gaussian::new(&self.gpu.device)?),
            };
            blur.prepare(
                &self.gpu.device,
                &input.texture,
                input.revision,
                layout.frost,
            )?
        } else {
            input.view.clone()
        };
        let data = [
            layout.width as f32,
            layout.height as f32,
            0.,
            0.,
            1. / tex_width as f32,
            1. / tex_height as f32,
            origin.x as f32,
            origin.y as f32,
            layout.radii[0],
            layout.radii[1],
            layout.radii[2],
            layout.radii[3],
            layout.bend,
            layout.dispersion,
            0.,
            layout.opacity,
        ];
        unsafe {
            self.gpu
                .context
                .OMSetRenderTargets(Some(&[self.target.clone()]), None);
            self.gpu.context.RSSetViewports(Some(&[D3D11_VIEWPORT {
                Width: layout.width as f32,
                Height: layout.height as f32,
                MaxDepth: 1.,
                ..Default::default()
            }]));
            self.gpu.context.UpdateSubresource(
                &self.gpu.constants,
                0,
                None,
                data.as_ptr().cast(),
                0,
                0,
            );
            self.gpu
                .context
                .IASetPrimitiveTopology(D3D_PRIMITIVE_TOPOLOGY_TRIANGLELIST);
            self.gpu.context.VSSetShader(&self.gpu.vs, None);
            self.gpu.context.PSSetShader(&self.gpu.ps, None);
            self.gpu
                .context
                .PSSetConstantBuffers(0, Some(&[Some(self.gpu.constants.clone())]));
            self.gpu
                .context
                .PSSetSamplers(0, Some(&[Some(self.gpu.sampler.clone())]));
            self.gpu
                .context
                .PSSetShaderResources(0, Some(&[Some(view)]));
            self.gpu.context.Draw(3, 0);
            self.gpu.context.PSSetShaderResources(0, Some(&[None]));
            self.gpu.context.OMSetRenderTargets(None, None);
            let presented = self.swapchain.Present(0, DXGI_PRESENT_DO_NOT_WAIT);
            if presented == DXGI_ERROR_WAS_STILL_DRAWING {
                return Ok(false);
            }
            presented.ok().map(|_| true)
        }
    }
}

impl Drop for DesktopLens {
    fn drop(&mut self) {
        let _ = unsafe { KillTimer(Some(self.hwnd), LENS_PRESENT_TIMER) };
        self.capture = None;
        if let Ok(children) = self.root.Children() {
            let _ = children.Remove(&self.visual);
        }
    }
}

fn validate_size(layout: LensLayout) -> Result<()> {
    if !(1..=4096).contains(&layout.width) || !(1..=1024).contains(&layout.height) {
        return Err(E_FAIL.into());
    }
    Ok(())
}

fn fit_visual(visual: &SpriteVisual, layout: LensLayout) -> Result<()> {
    visual.SetOffset(Vector3 {
        X: layout.left as f32,
        Y: layout.top as f32,
        Z: 0.,
    })?;
    visual.SetSize(Vector2 {
        X: layout.width as f32,
        Y: layout.height as f32,
    })
}

fn gpu_device() -> Result<(ID3D11Device, ID3D11DeviceContext)> {
    let (mut device, mut context) = (None, None);
    unsafe {
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_HARDWARE,
            Default::default(),
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        )?;
    }
    Ok((device.ok_or(E_FAIL)?, context.ok_or(E_FAIL)?))
}

fn render_target(
    device: &ID3D11Device,
    swapchain: &IDXGISwapChain1,
) -> Result<ID3D11RenderTargetView> {
    let mut target = None;
    unsafe {
        let buffer: ID3D11Texture2D = swapchain.GetBuffer(0)?;
        device.CreateRenderTargetView(&buffer, None, Some(&mut target))?;
    }
    target.ok_or(E_FAIL.into())
}

fn pipeline(
    device: &ID3D11Device,
) -> Result<(
    ID3D11VertexShader,
    ID3D11PixelShader,
    ID3D11SamplerState,
    ID3D11Buffer,
)> {
    unsafe {
        let compile = |entry, target| -> Result<ID3DBlob> {
            let mut blob = None;
            D3DCompile(
                SHADER.as_ptr().cast(),
                SHADER.len(),
                s!("Music Island lens"),
                None,
                None,
                entry,
                target,
                0,
                0,
                &mut blob,
                None,
            )?;
            Ok(blob.ok_or(E_FAIL)?)
        };
        let vs_blob = compile(s!("vertex"), s!("vs_4_0"))?;
        let ps_blob = compile(s!("pixel"), s!("ps_4_0"))?;
        let (mut vs, mut ps, mut sampler, mut constants) = (None, None, None, None);
        device.CreateVertexShader(
            std::slice::from_raw_parts(vs_blob.GetBufferPointer().cast(), vs_blob.GetBufferSize()),
            None,
            Some(&mut vs),
        )?;
        device.CreatePixelShader(
            std::slice::from_raw_parts(ps_blob.GetBufferPointer().cast(), ps_blob.GetBufferSize()),
            None,
            Some(&mut ps),
        )?;
        device.CreateSamplerState(
            &D3D11_SAMPLER_DESC {
                Filter: D3D11_FILTER_MIN_MAG_LINEAR_MIP_POINT,
                AddressU: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressV: D3D11_TEXTURE_ADDRESS_CLAMP,
                AddressW: D3D11_TEXTURE_ADDRESS_CLAMP,
                MaxAnisotropy: 1,
                ComparisonFunc: D3D11_COMPARISON_NEVER,
                MaxLOD: f32::MAX,
                ..Default::default()
            },
            Some(&mut sampler),
        )?;
        device.CreateBuffer(
            &D3D11_BUFFER_DESC {
                ByteWidth: 64,
                Usage: D3D11_USAGE_DEFAULT,
                BindFlags: D3D11_BIND_CONSTANT_BUFFER.0 as u32,
                ..Default::default()
            },
            None,
            Some(&mut constants),
        )?;
        Ok((
            vs.ok_or(E_FAIL)?,
            ps.ok_or(E_FAIL)?,
            sampler.ok_or(E_FAIL)?,
            constants.ok_or(E_FAIL)?,
        ))
    }
}
