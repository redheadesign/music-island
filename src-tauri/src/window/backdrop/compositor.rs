use super::geometry::BackdropRegion;
use std::{cell::RefCell, rc::Rc};
use windows::{
    core::Interface,
    System::{DispatcherQueue, DispatcherQueueController},
    Win32::{
        Foundation::HWND,
        Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_USE_HOSTBACKDROPBRUSH},
        System::WinRT::{
            Composition::ICompositorDesktopInterop, CreateDispatcherQueueController,
            DispatcherQueueOptions, DQTAT_COM_STA, DQTYPE_THREAD_CURRENT,
        },
    },
    UI::Composition::{
        CompositionBackdropBrush, CompositionRoundedRectangleGeometry, Compositor, ContainerVisual,
        Desktop::DesktopWindowTarget, SpriteVisual,
    },
};
use windows_numerics::{Vector2, Vector3};

/// One visual tree behind the HWND's child WebView2. HostBackdropBrush samples
/// the desktop inside DWM, and the app has no access to those source pixels.
pub(super) struct HostBackdrop {
    target: DesktopWindowTarget,
    root: ContainerVisual,
    brush: CompositionBackdropBrush,
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
        if self.visible {
            let _ = self.root.SetOpacity(0.0);
            self.visible = false;
        }
    }

    pub(super) fn update(
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
                });
            }
            self.regions[index].update(&self.compositor, &self.brush, region)?;
        }
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
        if previous.is_none_or(|p| {
            (p.width, p.height, p.radii) != (region.width, region.height, region.radii)
        }) {
            self.fit(compositor, brush, region)?;
        }
        self.previous = Some(region.clone());
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
