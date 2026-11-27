//! Optional local material. WGC supplies the monitor texture. Only the body
//! and its sampling margin are copied. The copy and shader both stay on GPU.
use super::super::geometry::{lens_blur_sigma, BackdropRegion, DesktopLensSettings};
use std::sync::{
    mpsc::{self, Sender},
    Arc, Mutex, TryLockError, Weak,
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
            RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED,
        },
        UI::WindowsAndMessaging::{
            GetWindowDisplayAffinity, KillTimer, PostMessageW, SetWindowDisplayAffinity,
            WDA_EXCLUDEFROMCAPTURE, WINDOW_DISPLAY_AFFINITY, WM_APP,
        },
    },
    UI::Composition::{Compositor, ContainerVisual, SpriteVisual},
};
use windows_numerics::{Vector2, Vector3};

#[path = "gaussian.rs"]
mod gaussian;
use gaussian::Gaussian;

pub(crate) const LENS_FRAME: u32 = WM_APP + 0x46;
pub(crate) const LENS_RETRY: u32 = WM_APP + 0x47;
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
    pub(crate) fn capture_band(width: f64, height: f64, scale: f64, frost: f64) -> Self {
        let viewport_width = (width * scale).round() as i32;
        // The body is centered at the top edge. Limit the speculative copy
        // to this band; the native layout still supplies the exact crop.
        let band_width = (1400.0 * scale).min(4096.0).round() as i32;
        let band_width = viewport_width.min(band_width).max(1);
        Self {
            left: (viewport_width - band_width) / 2,
            top: 0,
            width: band_width as u32,
            height: (height.min(320.0) * scale).round().clamp(1.0, 1024.0) as u32,
            radii: [0.0; 4],
            bend: 0.0,
            dispersion: 0.0,
            frost: lens_blur_sigma(frost, scale),
            opacity: 0.0,
            snapshot: false,
            reduced_motion: false,
        }
    }

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
            frost: region.lens_blur_sigma(scale, global_frost),
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
    capture: Option<(Sender<()>, CaptureExclusion)>,
    renderer: Arc<Mutex<LensRenderer>>,
    root: ContainerVisual,
    visual: SpriteVisual,
    visible: bool,
}

/// Owns the immediate GPU context. The capture callback and occasional UI
/// resize or retry serialize GPU access here. The visual tree stays on the UI
/// thread.
struct LensRenderer {
    _lease: Arc<()>,
    window: usize,
    monitor_id: usize,
    source_size: SizeInt32,
    gpu: LensDevice,
    swapchain: IDXGISwapChain1,
    target: Option<ID3D11RenderTargetView>,
    layout: LensLayout,
    preparing: bool,
    source: Option<InputTexture>,
    gaussian: Option<Gaussian>,
    last_frame_time: Option<i64>,
    present_attempts: u8,
    retry_pending: bool,
    redraw: bool,
    submitted: bool,
    stopped: bool,
    failure: Option<windows::core::Error>,
}

struct CaptureStream {
    item: GraphicsCaptureItem,
    pool: Direct3D11CaptureFramePool,
    session: GraphicsCaptureSession,
    frame_token: Option<i64>,
    closed_token: Option<i64>,
}

impl Drop for CaptureStream {
    fn drop(&mut self) {
        if let Some(token) = self.closed_token {
            let _ = self.item.RemoveClosed(token);
        }
        if let Some(token) = self.frame_token {
            let _ = self.pool.RemoveFrameArrived(token);
        }
        let _ = self.session.Close();
        let _ = self.pool.Close();
    }
}

fn notify_capture_failure(renderer: &Weak<Mutex<LensRenderer>>, error: windows::core::Error) {
    let Some(renderer) = renderer.upgrade() else {
        return;
    };
    let Ok(mut renderer) = renderer.lock() else {
        return;
    };
    if !renderer.stopped {
        renderer.failure = Some(error);
        renderer.stopped = true;
        let _ = unsafe { PostMessageW(Some(renderer.hwnd()), LENS_FRAME, WPARAM(0), LPARAM(0)) };
    }
}

impl CaptureStream {
    fn new(
        monitor: HMONITOR,
        device: &ID3D11Device,
        renderer: &Weak<Mutex<LensRenderer>>,
    ) -> Result<Self> {
        if !GraphicsCaptureSession::IsSupported()? {
            return Err(E_FAIL.into());
        }
        let interop: IGraphicsCaptureItemInterop = core::factory::<GraphicsCaptureItem, _>()?;
        let item: GraphicsCaptureItem = unsafe { interop.CreateForMonitor(monitor)? };
        let size = item.Size()?;
        {
            let active = renderer.upgrade().ok_or(E_FAIL)?;
            let mut active = active.lock().map_err(|_| E_FAIL)?;
            if active.stopped {
                return Err(E_FAIL.into());
            }
            active.source_size = size;
        }
        let dxgi: IDXGIDevice = device.cast()?;
        let projected: IDirect3DDevice =
            unsafe { CreateDirect3D11DeviceFromDXGIDevice(&dxgi)?.cast()? };
        let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
            &projected,
            DirectXPixelFormat::B8G8R8A8UIntNormalized,
            CAPTURE_BUFFERS,
            size,
        )?;
        let session = pool.CreateCaptureSession(&item)?;
        let mut capture = Self {
            item,
            pool,
            session,
            frame_token: None,
            closed_token: None,
        };
        let _ = capture.session.SetIsCursorCaptureEnabled(false);
        let _ = capture.session.SetIsBorderRequired(false);
        let dirty_tracking = capture
            .session
            .SetDirtyRegionMode(GraphicsCaptureDirtyRegionMode::ReportOnly)
            .is_ok();
        capture.session.SetMinUpdateInterval(TimeSpan {
            Duration: FRAME_INTERVAL,
        })?;
        let render_target = renderer.clone();
        capture.frame_token =
            Some(capture.pool.FrameArrived(
                &TypedEventHandler::<Direct3D11CaptureFramePool, _>::new(move |sender, _| {
                    if let (Some(renderer), Some(pool)) = (render_target.upgrade(), sender.as_ref())
                    {
                        let mut renderer = renderer.lock().map_err(|_| E_FAIL)?;
                        if !renderer.stopped && !(renderer.layout.snapshot && renderer.submitted) {
                            if let Err(error) = renderer.process(pool, dirty_tracking) {
                                renderer.failure = Some(error);
                                renderer.stopped = true;
                                let _ = unsafe {
                                    PostMessageW(
                                        Some(renderer.hwnd()),
                                        LENS_FRAME,
                                        WPARAM(0),
                                        LPARAM(0),
                                    )
                                };
                            }
                        }
                    }
                    Ok(())
                }),
            )?);
        let target = renderer.clone();
        capture.closed_token =
            Some(capture.item.Closed(&TypedEventHandler::new(move |_, _| {
                notify_capture_failure(&target, E_FAIL.into());
                Ok(())
            }))?);
        Ok(capture)
    }
}

impl DesktopLens {
    pub(super) fn prepare(
        hwnd: HWND,
        compositor: &Compositor,
        root: &ContainerVisual,
        band: LensLayout,
        gpu: LensDevice,
        lease: Arc<()>,
    ) -> Result<Self> {
        let exclusion = CaptureExclusion::for_window(hwnd)?;
        let monitor = unsafe { MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST) };
        let dxgi: IDXGIDevice = gpu.device.cast()?;
        if let Ok(device) = dxgi.cast::<IDXGIDevice1>() {
            let _ = unsafe { device.SetMaximumFrameLatency(1) };
        }
        let factory: IDXGIFactory2 = unsafe { dxgi.GetAdapter()?.GetParent()? };
        let desc = DXGI_SWAP_CHAIN_DESC1 {
            Width: 1,
            Height: 1,
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
        let surface = unsafe {
            compositor
                .cast::<ICompositorInterop>()?
                .CreateCompositionSurfaceForSwapChain(&swapchain)?
        };
        let visual = compositor.CreateSpriteVisual()?;
        visual.SetBrush(&compositor.CreateSurfaceBrushWithSurface(&surface)?)?;
        visual.SetIsVisible(false)?;
        let device = gpu.device.clone();
        let monitor_id = monitor.0 as usize;
        let renderer = Arc::new(Mutex::new(LensRenderer {
            _lease: lease,
            window: hwnd.0 as usize,
            monitor_id,
            source_size: SizeInt32::default(),
            gpu,
            swapchain,
            target: None,
            layout: band,
            preparing: true,
            source: None,
            gaussian: None,
            last_frame_time: None,
            present_attempts: 0,
            retry_pending: false,
            redraw: true,
            submitted: false,
            stopped: false,
            failure: None,
        }));
        let target = Arc::downgrade(&renderer);
        let (stop, stopped) = mpsc::channel();
        let lens = Self {
            hwnd,
            capture: Some((stop, exclusion)),
            renderer,
            root: root.clone(),
            visual,
            visible: false,
        };
        root.Children()?.InsertAtTop(&lens.visual)?;
        // This worker owns the WGC session, including Close, so cancelling a
        // hover never waits on capture initialization or teardown.
        std::thread::Builder::new()
            .name("desktop-glass-capture".into())
            .spawn(move || {
                let result = unsafe { RoInitialize(RO_INIT_MULTITHREADED) }.and_then(|()| {
                    let result = (|| {
                        if !matches!(stopped.try_recv(), Err(mpsc::TryRecvError::Empty)) {
                            return Ok(());
                        }
                        let capture =
                            CaptureStream::new(HMONITOR(monitor_id as _), &device, &target)?;
                        if matches!(stopped.try_recv(), Err(mpsc::TryRecvError::Empty)) {
                            capture.session.StartCapture()?;
                            let _ = stopped.recv();
                        }
                        Ok(())
                    })();
                    unsafe { RoUninitialize() };
                    result
                });
                if let Err(error) = result {
                    notify_capture_failure(&target, error);
                }
            })
            .map_err(|_| E_FAIL)?;
        Ok(lens)
    }

    pub(super) fn configure(&mut self, layout: LensLayout) -> Result<bool> {
        // A WGC callback might be filtering the current frame. Leave the
        // latest geometry pending instead of blocking the window thread.
        let mut renderer = match self.renderer.try_lock() {
            Ok(renderer) => renderer,
            Err(TryLockError::WouldBlock) => return Ok(false),
            Err(TryLockError::Poisoned(_)) => return Err(E_FAIL.into()),
        };
        if let Some(error) = renderer.failure.take() {
            return Err(error);
        }
        if (renderer.preparing && renderer.source.is_none())
            || (self.capture.is_none() && !layout.snapshot)
        {
            return Ok(false);
        }
        if renderer.preparing || layout != renderer.layout {
            validate_size(layout)?;
            renderer.configure(layout)?;
            fit_visual(&self.visual, layout)?;
        } else if !renderer.submitted {
            // Retry a busy swap chain even if the desktop is static and the
            // prepared layout has not changed between requests.
            renderer.present_cached()?;
        }
        let submitted = renderer.submitted;
        drop(renderer);
        self.show_frame(submitted, layout.snapshot)
    }

    pub(super) fn draw(&mut self, retry: bool) -> Result<()> {
        let mut renderer = match self.renderer.try_lock() {
            Ok(renderer) => renderer,
            Err(TryLockError::WouldBlock) => {
                if retry {
                    unsafe { PostMessageW(Some(self.hwnd), LENS_RETRY, WPARAM(0), LPARAM(0))?; }
                }
                return Ok(());
            }
            Err(TryLockError::Poisoned(_)) => return Err(E_FAIL.into()),
        };
        if let Some(error) = renderer.failure.take() {
            return Err(error);
        }
        if retry && std::mem::take(&mut renderer.retry_pending) && renderer.redraw {
            renderer.present_cached()?;
        }
        Ok(())
    }

    fn show_frame(&mut self, submitted: bool, snapshot: bool) -> Result<bool> {
        if submitted && !self.visible {
            self.visual.SetIsVisible(true)?;
            self.visible = true;
        }
        if submitted && snapshot {
            self.capture = None;
        }
        // A geometry update can briefly await another crop or Present.
        // Retain the already selected backend unless it reports an error.
        Ok(self.visible)
    }

    pub(super) fn set_mix(&self, mix: f32) -> Result<()> {
        self.visual.SetOpacity(mix)
    }
}

impl LensRenderer {
    fn hwnd(&self) -> HWND {
        HWND(self.window as _)
    }

    fn monitor(&self) -> HMONITOR {
        HMONITOR(self.monitor_id as _)
    }

    fn configure(&mut self, layout: LensLayout) -> Result<()> {
        let previous = self.layout;
        let moved = (layout.left, layout.top) != (previous.left, previous.top);
        let resized =
            self.preparing || (layout.width, layout.height) != (previous.width, previous.height);
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
        self.layout = layout;
        self.preparing = false;
        self.redraw = true;
        self.present_attempts = 0;
        if moved || resized {
            self.submitted = false;
        }
        self.present_cached()
    }

    fn present_cached(&mut self) -> Result<()> {
        if self.monitor() != unsafe { MonitorFromWindow(self.hwnd(), MONITOR_DEFAULTTONEAREST) } {
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

    fn process(&mut self, pool: &Direct3D11CaptureFramePool, dirty_tracking: bool) -> Result<()> {
        let Ok(mut frame) = pool.TryGetNextFrame() else {
            return Ok(());
        };
        // If a second frame arrived while the GPU was busy, prefer the latest
        // one so rapid switches never leave an older frame stranded.
        let mut coalesced = false;
        for _ in 1..CAPTURE_BUFFERS {
            let Ok(newer) = pool.TryGetNextFrame() else {
                break;
            };
            let _ = frame.Close();
            frame = newer;
            coalesced = true;
        }
        if frame.ContentSize()? != self.source_size
            || self.monitor() != unsafe { MonitorFromWindow(self.hwnd(), MONITOR_DEFAULTTONEAREST) }
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
            || !dirty_tracking
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
            return Ok(());
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
        let _ = frame.Close();
        if self.preparing {
            if needs_texture {
                self.filtered_source()?;
            }
            self.redraw = false;
            return Ok(());
        }
        if crosses_crop {
            self.present_attempts = 0;
        }
        self.submit_frame(origin, tex_width, tex_height)?;
        Ok(())
    }

    fn submit_frame(&mut self, origin: POINT, tex_width: u32, tex_height: u32) -> Result<()> {
        if self.render(origin, tex_width, tex_height)? {
            self.redraw = false;
            self.present_attempts = 0;
            self.submitted = true;
        } else {
            self.redraw = true;
            // The window thread owns the retry timer. A stalled swap chain
            // must not strand the last frame when the desktop is still.
            if !self.retry_pending && self.present_attempts < 3 {
                let posted =
                    unsafe { PostMessageW(Some(self.hwnd()), LENS_RETRY, WPARAM(0), LPARAM(0)) };
                if posted.is_ok() {
                    self.retry_pending = true;
                    self.present_attempts += 1;
                }
            }
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
            ClientToScreen(self.hwnd(), &mut client).ok()?;
            GetMonitorInfoW(self.monitor(), &mut monitor).ok()?;
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

    fn filtered_source(&mut self) -> Result<ID3D11ShaderResourceView> {
        let input = self.source.as_ref().ok_or(E_FAIL)?;
        if self.layout.frost == 0.0 {
            return Ok(input.view.clone());
        }
        let blur = match &mut self.gaussian {
            Some(blur) => blur,
            None => self.gaussian.insert(Gaussian::new(&self.gpu.device)?),
        };
        blur.prepare(
            &self.gpu.device,
            &input.texture,
            input.revision,
            self.layout.frost,
        )
    }

    fn render(&mut self, origin: POINT, tex_width: u32, tex_height: u32) -> Result<bool> {
        let layout = self.layout;
        let crop_top = self.source.as_ref().ok_or(E_FAIL)?.crop.top;
        let view = self.filtered_source()?;
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
            (crop_top + origin.y) as f32,
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
        // The worker can still finish its current frame. Its lease prevents
        // a subsequent opening from using the same context in parallel.
        if let Ok(mut renderer) = self.renderer.try_lock() {
            renderer.stopped = true;
        }
        self.capture = None;
        let _ = unsafe { KillTimer(Some(self.hwnd), LENS_PRESENT_TIMER) };
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
