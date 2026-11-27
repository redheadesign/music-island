use super::geometry::{BackdropRegion, LensOpening};
use std::{
    cell::{OnceCell, RefCell},
    rc::Rc,
    sync::{
        mpsc::{self, Receiver, TryRecvError},
        Arc, Weak,
    },
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    System::{DispatcherQueue, DispatcherQueueController},
    Win32::{
        Foundation::{E_FAIL, HWND, LPARAM, WPARAM},
        Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH},
        System::WinRT::{
            Composition::ICompositorDesktopInterop, CreateDispatcherQueueController,
            DispatcherQueueOptions, DQTAT_COM_STA, DQTYPE_THREAD_CURRENT,
        },
        UI::WindowsAndMessaging::{KillTimer, PostMessageW, SetTimer},
    },
    UI::Composition::{
        CompositionBackdropBrush, CompositionEffectBrush, CompositionEffectFactory,
        CompositionRoundedRectangleGeometry, Compositor, ContainerVisual,
        Desktop::DesktopWindowTarget, SpriteVisual,
    },
};
use windows_numerics::{Vector2, Vector3};
#[path = "desktop_lens.rs"]
mod desktop_lens;
#[path = "optics.rs"]
mod optics;
use desktop_lens::{DesktopLens, LensDevice};
pub(super) use desktop_lens::{LensLayout, LENS_FRAME, LENS_PRESENT_TIMER, LENS_RETRY};

pub(super) const LENS_HANDOFF_TIMER: usize = 0x4d49_4c48;
const HANDOFF_DURATION: Duration = Duration::from_millis(90);
const CAPTURE_TIMEOUT: Duration = Duration::from_secs(5);

/// One visual tree behind the HWND's child WebView2. HostBackdropBrush samples
/// the desktop inside DWM, and the app has no access to those source pixels.
pub(super) struct HostBackdrop {
    target: DesktopWindowTarget,
    root: ContainerVisual,
    brush: CompositionBackdropBrush,
    frost_factory: OnceCell<Option<CompositionEffectFactory>>,
    lens: Option<DesktopLens>,
    lens_region: Option<usize>,
    lens_lease: Weak<()>,
    opening: LensOpening,
    pending_layout: Option<(usize, LensLayout)>,
    wait_started: Option<Instant>,
    blend_started: Option<Instant>,
    handoff_timer: bool,
    capture_band: Option<LensLayout>,
    lens_device: Option<LensDevice>,
    device_unavailable: bool,
    lens_preparing: Option<Receiver<windows::core::Result<LensDevice>>>,
    compositor: Compositor,
    hwnd: HWND,
    _queue: Rc<QueueOwner>,
    regions: Vec<Surface>,
    viewport: (f32, f32),
    visible: bool,
}

struct Surface {
    group: ContainerVisual,
    tiles: Vec<(
        ContainerVisual,
        SpriteVisual,
        CompositionRoundedRectangleGeometry,
    )>,
    previous: Option<BackdropRegion>,
    frost: Option<CompositionEffectBrush>,
}

struct QueueOwner(Option<DispatcherQueueController>);
// A current-thread DispatcherQueue cannot be recreated synchronously while its
// shutdown is pending. Keep ours alive for the UI thread, shared by both HWNDs.
thread_local! { static QUEUE: RefCell<Option<Rc<QueueOwner>>> = const { RefCell::new(None) }; }

fn dispatcher() -> windows::core::Result<Rc<QueueOwner>> {
    QUEUE.with(|queue| {
        if let Some(existing) = queue.borrow().as_ref() {
            return Ok(existing.clone());
        }
        let controller = if DispatcherQueue::GetForCurrentThread().is_ok() {
            None
        } else {
            Some(unsafe {
                CreateDispatcherQueueController(DispatcherQueueOptions {
                    dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
                    threadType: DQTYPE_THREAD_CURRENT,
                    apartmentType: DQTAT_COM_STA,
                })?
            })
        };
        let owner = Rc::new(QueueOwner(controller));
        *queue.borrow_mut() = Some(owner.clone());
        Ok(owner)
    })
}

impl Drop for QueueOwner {
    fn drop(&mut self) {
        if let Some(controller) = &self.0 {
            let _ = controller.ShutdownQueueAsync();
        }
    }
}

impl HostBackdrop {
    pub(super) fn new(hwnd: HWND) -> windows::core::Result<Self> {
        let enabled = 1_i32;
        // Windows 11's documented contract. Older Windows return an error and
        // the WebView uses its opaque material instead of a false blur promise.
        unsafe {
            DwmSetWindowAttribute(
                hwnd,
                DWMWA_USE_HOSTBACKDROPBRUSH,
                &enabled as *const _ as _,
                4,
            )?;
        }
        let result = (|| {
            let queue = dispatcher()?;
            let compositor = Compositor::new()?;
            let interop: ICompositorDesktopInterop = compositor.cast()?;
            let target = unsafe { interop.CreateDesktopWindowTarget(hwnd, false)? };
            let root = compositor.CreateContainerVisual()?;
            root.SetClip(&compositor.CreateInsetClip()?)?;
            root.SetOpacity(0.0)?;
            let brush = compositor.CreateHostBackdropBrush()?;
            target.SetRoot(&root)?;
            Ok(Self {
                target,
                root,
                brush,
                frost_factory: OnceCell::new(),
                lens: None,
                lens_region: None,
                lens_lease: Weak::new(),
                opening: LensOpening::default(),
                pending_layout: None,
                wait_started: None,
                blend_started: None,
                handoff_timer: false,
                capture_band: None,
                lens_device: None,
                device_unavailable: false,
                lens_preparing: None,
                compositor,
                hwnd,
                _queue: queue,
                regions: Vec::new(),
                viewport: (0.0, 0.0),
                visible: false,
            })
        })();
        if result.is_err() {
            let disabled = 0_i32;
            let _ = unsafe {
                DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_USE_HOSTBACKDROPBRUSH,
                    &disabled as *const _ as _,
                    4,
                )
            };
        }
        result
    }

    pub(super) fn clear(&mut self) {
        self.clear_lens();
        self.hide_visuals();
    }

    pub(super) fn clear_lens(&mut self) {
        self.capture_band = None;
        self.opening = LensOpening::default();
        self.stop_lens();
    }

    pub(super) fn hide_visuals(&mut self) {
        if self.visible {
            let _ = self.root.SetOpacity(0.0);
            self.visible = false;
        }
    }

    fn stop_lens(&mut self) {
        self.cancel_handoff_timer();
        self.pending_layout = None;
        self.wait_started = None;
        self.blend_started = None;
        self.lens = None;
        let _ = self.restore_system_region();
    }

    pub(super) fn prepare_capture(&mut self, band: LensLayout) {
        if self.opening == LensOpening::Pending && self.capture_band != Some(band) {
            self.stop_lens();
            self.capture_band = Some(band);
            self.draw_lens();
        }
    }

    /// Show DWM immediately. Only the latest requested shape is retried while
    /// the device or capture worker is busy. All timers belong to this HWND.
    pub(super) fn configure_lens(&mut self, index: usize, layout: LensLayout) {
        if self.opening == LensOpening::System || self.device_unavailable {
            return;
        }
        self.pending_layout = Some((index, layout));
        self.update_handoff();
    }

    pub(super) fn update_handoff(&mut self) {
        match self.advance_handoff() {
            Ok(true) => {
                if !self.handoff_timer {
                    self.handoff_timer = unsafe { SetTimer(Some(self.hwnd), LENS_HANDOFF_TIMER, 16, None) != 0 };
                    if !self.handoff_timer { self.lens_error(E_FAIL.into()); }
                }
            }
            Ok(false) => self.cancel_handoff_timer(),
            Err(error) => self.lens_error(error),
        }
    }

    fn advance_handoff(&mut self) -> windows::core::Result<bool> {
        if let Some((index, layout)) = self.pending_layout {
            self.poll_preparation()?;
            let ready = match self.lens.as_mut() {
                Some(lens) => lens.configure(layout)?,
                None => false,
            };
            if ready {
                self.pending_layout = None;
                let was_waiting = self.wait_started.take().is_some();
                self.capture_band = None;
                if self.opening.presented(true) && was_waiting && !layout.reduced_motion {
                    self.blend_started = Some(Instant::now());
                }
                if self.lens_region != Some(index) {
                    self.restore_system_region()?;
                    self.lens_region = Some(index);
                }
            } else if self.wait_started.get_or_insert_with(Instant::now).elapsed() >= CAPTURE_TIMEOUT {
                // A capture that never supplies a frame must not poll forever.
                self.opening = LensOpening::System;
                self.stop_lens();
                return Ok(false);
            }
        }
        if let Some(index) = self.lens_region {
            let mix = self.blend_started.map_or(1.0, |start| {
                (start.elapsed().as_secs_f32() / HANDOFF_DURATION.as_secs_f32()).min(1.0)
            });
            if let Some(lens) = &self.lens { lens.set_mix(mix)?; }
            if let Some(region) = self.regions.get(index) {
                region.group.SetIsVisible(mix < 1.0)?;
                if mix < 1.0 {
                    let opacity = region.previous.as_ref().map_or(1.0, |r| r.opacity as f32);
                    region.group.SetOpacity(opacity * (1.0 - mix))?;
                }
            }
            if mix >= 1.0 { self.blend_started = None; }
        }
        Ok(self.pending_layout.is_some() || self.blend_started.is_some())
    }

    fn restore_system_region(&mut self) -> windows::core::Result<()> {
        if let Some(region) = self.lens_region.take().and_then(|i| self.regions.get(i)) {
            let opacity = region.previous.as_ref().map_or(1.0, |r| r.opacity as f32);
            region.group.SetOpacity(opacity)?;
            region.group.SetIsVisible(true)?;
        }
        Ok(())
    }

    fn cancel_handoff_timer(&mut self) {
        if self.handoff_timer {
            let _ = unsafe { KillTimer(Some(self.hwnd), LENS_HANDOFF_TIMER) };
            self.handoff_timer = false;
        }
    }

    pub(super) fn draw_lens(&mut self) {
        if let Err(error) = self.poll_preparation() {
            self.lens_error(error);
        }
        if self.opening == LensOpening::Live {
            self.refresh_lens(false);
        }
    }

    pub(super) fn retry_lens(&mut self) {
        if self.opening == LensOpening::Live || self.pending_layout.is_some() {
            self.refresh_lens(true);
        }
    }

    fn refresh_lens(&mut self, retry: bool) {
        if let Some(lens) = &mut self.lens {
            if let Err(error) = lens.draw(retry) {
                self.lens_error(error);
            }
        }
    }

    fn poll_preparation(&mut self) -> windows::core::Result<()> {
        if let Some(receiver) = &self.lens_preparing {
            match receiver.try_recv() {
                Ok(result) => {
                    self.lens_preparing = None;
                    self.device_unavailable = result.is_err();
                    self.lens_device = Some(result?);
                }
                Err(TryRecvError::Empty) => return Ok(()),
                Err(TryRecvError::Disconnected) => {
                    self.lens_preparing = None;
                    self.device_unavailable = true;
                    return Err(E_FAIL.into());
                }
            }
        }
        if let (LensOpening::Pending, None, Some(band), Some(device)) = (
            &self.opening,
            &self.lens,
            self.capture_band,
            &self.lens_device,
        ) {
            if self.lens_lease.strong_count() == 0 {
                let lease = Arc::new(());
                self.lens_lease = Arc::downgrade(&lease);
                self.lens = Some(DesktopLens::prepare(
                    self.hwnd,
                    &self.compositor,
                    &self.root,
                    band,
                    device.clone(),
                    lease,
                )?);
            }
        }
        Ok(())
    }

    // Create D3D11 and compile the shaders while the overlay is still idle.
    // Capture itself starts only when the user contacts the top edge.
    pub(super) fn prewarm_lens(&mut self) {
        self.frost_factory
            .get_or_init(|| optics::blur_factory(&self.compositor).ok());
        if self.lens_preparing.is_some() || self.lens_device.is_some() || self.device_unavailable {
            return;
        }
        let (send, receive) = mpsc::channel();
        let window = self.hwnd.0 as usize;
        let worker = std::thread::Builder::new()
            .name("desktop-glass-device".into())
            .spawn(move || {
                if send.send(LensDevice::new()).is_ok() {
                    let _ = unsafe {
                        PostMessageW(Some(HWND(window as _)), LENS_FRAME, WPARAM(0), LPARAM(0))
                    };
                }
            });
        if worker.is_ok() {
            self.lens_preparing = Some(receive);
        } else {
            self.device_unavailable = true;
            self.lens_error(E_FAIL.into());
        }
    }

    fn lens_error(&mut self, error: windows::core::Error) {
        self.opening = LensOpening::System;
        self.stop_lens();
        crate::logging::append_event(&format!("desktop glass lens unavailable: {error}"));
    }

    pub(super) fn update_regions(
        &mut self,
        width: f32,
        height: f32,
        regions: &[BackdropRegion],
    ) -> windows::core::Result<()> {
        if self.viewport != (width, height) {
            self.root.SetSize(Vector2 {
                X: width,
                Y: height,
            })?;
            self.viewport = (width, height);
        }
        while self.regions.len() > regions.len() {
            let last = self.regions.last().unwrap();
            self.root.Children()?.Remove(&last.group)?;
            self.regions.pop();
        }
        for (index, region) in regions.iter().enumerate() {
            if index == self.regions.len() {
                let group = self.compositor.CreateContainerVisual()?;
                self.root.Children()?.InsertAtTop(&group)?;
                self.regions.push(Surface {
                    group,
                    tiles: Vec::new(),
                    previous: None,
                    frost: None,
                });
            }
            let factory = region
                .blur_radius
                .filter(|radius| *radius > 0.0)
                .and_then(|_| {
                    self.frost_factory
                        .get_or_init(|| optics::blur_factory(&self.compositor).ok())
                        .as_ref()
                });
            self.regions[index].update(&self.compositor, &self.brush, factory, region)?;
        }
        Ok(())
    }

    pub(super) fn show_visuals(&mut self) -> windows::core::Result<()> {
        if !self.visible {
            self.root.SetOpacity(1.0)?;
            self.visible = true;
        }
        Ok(())
    }
}

impl Surface {
    fn update(
        &mut self,
        compositor: &Compositor,
        brush: &CompositionBackdropBrush,
        factory: Option<&CompositionEffectFactory>,
        region: &BackdropRegion,
    ) -> windows::core::Result<()> {
        let previous = self.previous.as_ref();
        if previous.is_none_or(|p| (p.left, p.top) != (region.left, region.top)) {
            self.group.SetOffset(Vector3 {
                X: region.left as f32,
                Y: region.top as f32,
                Z: 0.0,
            })?;
        }
        if previous.is_none_or(|p| p.opacity != region.opacity) {
            self.group.SetOpacity(region.opacity as f32)?;
        }
        let resized = previous.is_none_or(|p| {
            (p.width, p.height, p.radii) != (region.width, region.height, region.radii)
        });
        let frost_changed = previous.is_none_or(|p| p.blur_radius != region.blur_radius);
        if resized {
            self.fit(compositor, brush, region)?;
        }
        if resized || frost_changed {
            self.apply_frost(brush, factory, region.blur_radius)?;
        }
        self.previous = Some(region.clone());
        Ok(())
    }

    fn apply_frost(
        &mut self,
        backdrop: &CompositionBackdropBrush,
        factory: Option<&CompositionEffectFactory>,
        radius: Option<f64>,
    ) -> windows::core::Result<()> {
        if let (Some(factory), Some(radius)) = (factory, radius) {
            // Composition can reject the optional effect brush on a device.
            // Keep its normal DWM backdrop if that happens.
            let effect = self
                .frost
                .take()
                .map(Ok)
                .unwrap_or_else(|| optics::bind_frost(factory, backdrop));
            if let Ok(effect) = effect {
                if optics::set_radius(&effect, radius as f32).is_ok()
                    && self
                        .tiles
                        .iter()
                        .all(|(_, sprite, _)| sprite.SetBrush(&effect).is_ok())
                {
                    self.frost = Some(effect);
                    return Ok(());
                }
                for (_, sprite, _) in &self.tiles {
                    sprite.SetBrush(backdrop)?;
                }
            }
        } else if self.frost.take().is_some() {
            for (_, sprite, _) in &self.tiles {
                sprite.SetBrush(backdrop)?;
            }
        }
        Ok(())
    }

    fn fit(
        &mut self,
        compositor: &Compositor,
        brush: &CompositionBackdropBrush,
        region: &BackdropRegion,
    ) -> windows::core::Result<()> {
        let [tl, tr, br, bl] = region.radii;
        // The top-edge island is a single rounded rectangle extended above its
        // tile. This avoids joining four antialiased clips through its center.
        let flat_top = tl == 0.0 && tr == 0.0 && br == bl;
        let single = flat_top || (tl == tr && tr == br && br == bl);
        let tiles = if single { 1 } else { 4 };
        if self.tiles.len() != tiles {
            self.group.Children()?.RemoveAll()?;
            self.tiles.clear();
            for _ in 0..tiles {
                let tile = compositor.CreateContainerVisual()?;
                tile.SetClip(&compositor.CreateInsetClip()?)?;
                let sprite = compositor.CreateSpriteVisual()?;
                sprite.SetBrush(brush)?;
                let shape = compositor.CreateRoundedRectangleGeometry()?;
                sprite.SetClip(&compositor.CreateGeometricClipWithGeometry(&shape)?)?;
                tile.Children()?.InsertAtTop(&sprite)?;
                self.group.Children()?.InsertAtTop(&tile)?;
                self.tiles.push((tile, sprite, shape));
            }
        }
        let width = region.width as f32;
        let height = region.height as f32;
        let top_extension = if flat_top { br as f32 } else { 0.0 };
        let size = Vector2 {
            X: width,
            Y: height + top_extension,
        };
        for (i, (tile, sprite, shape)) in self.tiles.iter().enumerate() {
            let fraction = if single { 1.0 } else { 0.5 };
            let x = if i == 1 || i == 2 { width * 0.5 } else { 0.0 };
            let y = if i >= 2 { height * 0.5 } else { 0.0 };
            tile.SetSize(Vector2 {
                X: width * fraction,
                Y: height * fraction,
            })?;
            tile.SetOffset(Vector3 { X: x, Y: y, Z: 0.0 })?;
            sprite.SetSize(size)?;
            sprite.SetOffset(Vector3 {
                X: -x,
                Y: -y - top_extension,
                Z: 0.0,
            })?;
            shape.SetSize(size)?;
            let radius = if flat_top { br } else { region.radii[i] } as f32;
            shape.SetCornerRadius(Vector2 {
                X: radius,
                Y: radius,
            })?;
        }
        Ok(())
    }
}

impl Drop for HostBackdrop {
    fn drop(&mut self) {
        self.clear();
        let _ = self.target.Close();
        let disabled = 0_i32;
        let _ = unsafe {
            DwmSetWindowAttribute(
                self.hwnd,
                DWMWA_USE_HOSTBACKDROPBRUSH,
                &disabled as *const _ as _,
                4,
            )
        };
    }
}

#[cfg(test)]
#[path = "compositor_tests.rs"]
mod tests;
