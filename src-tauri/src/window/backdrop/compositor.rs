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
        UI::WindowsAndMessaging::PostMessageW,
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

const REVEAL_BUDGET: Duration = Duration::from_millis(220);

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
    pending_reveal: Option<(u64, Instant)>,
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
                pending_reveal: None,
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
        self.pending_reveal = None;
        self.stop_lens();
    }

    pub(super) fn hide_visuals(&mut self) {
        if self.visible {
            let _ = self.root.SetOpacity(0.0);
            self.visible = false;
        }
    }

    fn stop_lens(&mut self) {
        self.lens = None;
        if let Some(region) = self
            .lens_region
            .take()
            .and_then(|index| self.regions.get(index))
        {
            let _ = region.group.SetIsVisible(true);
        }
    }

    pub(super) fn prepare_capture(&mut self, band: LensLayout) {
        if self.opening == LensOpening::Pending && self.capture_band != Some(band) {
            self.stop_lens();
            self.capture_band = Some(band);
            self.draw_lens();
        }
    }

    /// True once the hidden reveal has selected a backend. A transient
    /// capture or DXGI miss may be retried until the reveal budget is spent.
    pub(super) fn configure_lens(
        &mut self,
        index: usize,
        layout: LensLayout,
        stage: Option<u64>,
    ) -> bool {
        if self.opening == LensOpening::System || self.device_unavailable {
            return true;
        }
        if let Err(error) = self.poll_preparation() {
            self.lens_error(error);
            return true;
        }
        let wait = stage.is_some_and(|id| {
            if self.pending_reveal.is_none_or(|(current, _)| current != id) {
                self.pending_reveal = Some((id, Instant::now()));
            }
            self.pending_reveal
                .is_some_and(|(_, start)| start.elapsed() < REVEAL_BUDGET)
        });
        let ready = match self
            .lens
            .as_mut()
            .map_or(Ok(false), |lens| lens.configure(layout))
        {
            Ok(ready) => ready,
            Err(error) => {
                self.lens_error(error);
                return true;
            }
        };
        let Some(use_lens) = self.opening.select(ready, wait) else {
            return false;
        };
        self.capture_band = None;
        self.pending_reveal = None;
        if use_lens {
            if self.lens_region != Some(index) {
                if let Some(previous) = self.lens_region.and_then(|old| self.regions.get(old)) {
                    let _ = previous.group.SetIsVisible(true);
                }
                self.lens_region = Some(index);
            }
            if let Some(region) = self.regions.get(index) {
                let _ = region.group.SetIsVisible(false);
            }
        } else {
            self.stop_lens();
            if stage.is_some() {
                log::debug!("Desktop lens was not ready within the hidden reveal budget");
            }
        }
        true
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
        if self.opening == LensOpening::Live {
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
        self.pending_reveal = None;
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
