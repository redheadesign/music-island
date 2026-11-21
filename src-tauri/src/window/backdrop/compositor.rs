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
        CompositionBackdropBrush, Compositor, ContainerVisual, Desktop::DesktopWindowTarget,
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
            let brush = compositor.CreateHostBackdropBrush()?;
            target.SetRoot(&root)?;
            Ok(Self {
                target,
                root,
                brush,
                compositor,
                hwnd,
                _queue: queue,
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

    pub(super) fn clear(&self) {
        let _ = self.root.SetOpacity(0.0);
        if let Ok(children) = self.root.Children() {
            let _ = children.RemoveAll();
        }
    }

    pub(super) fn update(
        &self,
        width: f32,
        height: f32,
        regions: &[BackdropRegion],
    ) -> windows::core::Result<()> {
        let layer = self.compositor.CreateContainerVisual()?;
        layer.SetSize(Vector2 {
            X: width,
            Y: height,
        })?;
        layer.SetClip(&self.compositor.CreateInsetClip()?)?;
        for region in regions {
            self.add_region(&layer, region)?;
        }
        let children = self.root.Children()?;
        children.RemoveAll()?;
        children.InsertAtTop(&layer)?;
        self.root.SetOpacity(1.0)
    }

    fn add_region(
        &self,
        layer: &ContainerVisual,
        region: &BackdropRegion,
    ) -> windows::core::Result<()> {
        let group = self.compositor.CreateContainerVisual()?;
        group.SetOffset(Vector3 {
            X: region.left as f32,
            Y: region.top as f32,
            Z: 0.0,
        })?;
        group.SetOpacity(region.opacity as f32)?;
        let width = region.width as f32;
        let height = region.height as f32;
        // Common pill/roundrect is one visual. Unequal CSS corner radii use four
        // disjoint quadrants, each clipped to its own rounded source rectangle.
        let uniform = region.radii.iter().all(|radius| *radius == region.radii[0]);
        let corners: &[(f32, f32, usize)] = if uniform {
            &[(0.0, 0.0, 0)]
        } else {
            &[(0.0, 0.0, 0), (0.5, 0.0, 1), (0.5, 0.5, 2), (0.0, 0.5, 3)]
        };
        for &(x, y, corner) in corners {
            let tile = self.compositor.CreateContainerVisual()?;
            let factor = if uniform { 1.0 } else { 0.5 };
            tile.SetSize(Vector2 {
                X: width * factor,
                Y: height * factor,
            })?;
            tile.SetOffset(Vector3 {
                X: width * x,
                Y: height * y,
                Z: 0.0,
            })?;
            tile.SetClip(&self.compositor.CreateInsetClip()?)?;
            let visual = self.compositor.CreateSpriteVisual()?;
            visual.SetSize(Vector2 {
                X: width,
                Y: height,
            })?;
            visual.SetOffset(Vector3 {
                X: -width * x,
                Y: -height * y,
                Z: 0.0,
            })?;
            visual.SetBrush(&self.brush)?;
            let shape = self.compositor.CreateRoundedRectangleGeometry()?;
            shape.SetSize(Vector2 {
                X: width,
                Y: height,
            })?;
            let radius = region.radii[corner] as f32;
            shape.SetCornerRadius(Vector2 {
                X: radius,
                Y: radius,
            })?;
            visual.SetClip(&self.compositor.CreateGeometricClipWithGeometry(&shape)?)?;
            tile.Children()?.InsertAtTop(&visual)?;
            group.Children()?.InsertAtTop(&tile)?;
        }
        layer.Children()?.InsertAtTop(&group)
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
