//! Same-process Win32 taskbar player.
//!
//! Keeping the input surface in ordinary BUTTON controls avoids the
//! cross-process WebView2 input route entirely. Updates stay on the UI thread;
//! the window procedure never waits on media or configuration work.

use std::{
    ffi::c_void,
    mem::size_of,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, OnceLock,
    },
    time::Duration,
};

use base64::Engine;
use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};
use windows::{
    core::{w, BOOL, PCWSTR},
    Win32::{
        Foundation::{COLORREF, HWND, LPARAM, LRESULT, POINT, RECT, WPARAM},
        Graphics::Gdi::{
            BeginPaint, BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, CreateRoundRectRgn,
            CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, EndPaint, FillRect,
            GetStockObject, InvalidateRect, MapWindowPoints, Polygon, RestoreDC, RoundRect, SaveDC,
            SelectClipRgn, SelectObject, SetBkMode, SetTextColor, SetWindowRgn, StretchDIBits,
            BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DEFAULT_GUI_FONT, DIB_RGB_COLORS, DT_CENTER,
            DT_SINGLELINE, DT_VCENTER, HGDIOBJ, NULL_PEN, PAINTSTRUCT, SRCCOPY, TRANSPARENT,
        },
        Graphics::GdiPlus::{
            DashCapRound, FillModeAlternate, GdipAddPathBezier, GdipAddPathLine,
            GdipClosePathFigure, GdipCreateFromHDC, GdipCreatePath, GdipCreatePen1,
            GdipCreateSolidFill, GdipDeleteBrush, GdipDeleteGraphics, GdipDeletePath,
            GdipDeletePen, GdipDrawPath, GdipFillPath, GdipFillPolygonI, GdipFillRectangleI,
            GdipSetPenLineCap197819, GdipSetPenLineJoin, GdipSetSmoothingMode, GdiplusStartup,
            GdiplusStartupInput, GpBrush, GpGraphics, GpPath, GpPen, GpSolidFill, LineCapRound,
            LineJoinRound, Ok as GdiPlusOk, Point as GdipPoint, SmoothingModeAntiAlias,
            Status as GdiStatus, UnitPixel,
        },
        Graphics::Imaging::{
            CLSID_WICImagingFactory, GUID_WICPixelFormat32bppBGR, IWICImagingFactory, IWICPalette,
            WICBitmapDitherTypeNone, WICBitmapInterpolationModeFant, WICBitmapPaletteTypeCustom,
            WICDecodeMetadataCacheOnLoad,
        },
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_MULTITHREADED,
        },
        UI::{
            Controls::{DRAWITEMSTRUCT, ODS_DISABLED, ODS_SELECTED, WM_MOUSELEAVE},
            Input::KeyboardAndMouse::{EnableWindow, TrackMouseEvent, TME_LEAVE, TRACKMOUSEEVENT},
            Shell::{DefSubclassProc, GetWindowSubclass, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                BeginDeferWindowPos, CreateWindowExW, DeferWindowPos, DestroyWindow,
                EndDeferWindowPos, GetClientRect, GetDlgCtrlID, GetWindowLongPtrW, GetWindowRect,
                IsWindow, SetLayeredWindowAttributes, SetWindowPos, SetWindowTextW, BS_NOTIFY,
                BS_OWNERDRAW, GWL_STYLE, HMENU, HTCLIENT, LWA_ALPHA, MA_NOACTIVATE, SWP_HIDEWINDOW,
                SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE, SWP_NOZORDER,
                SWP_SHOWWINDOW, WM_COMMAND, WM_DRAWITEM, WM_ERASEBKGND, WM_MOUSEACTIVATE,
                WM_MOUSEMOVE, WM_NCDESTROY, WM_NCHITTEST, WM_PAINT, WM_SIZE, WS_CHILD,
                WS_CLIPCHILDREN, WS_CLIPSIBLINGS, WS_EX_LAYERED, WS_EX_NOACTIVATE,
                WS_EX_TOOLWINDOW, WS_TABSTOP, WS_VISIBLE,
            },
        },
    },
};

use crate::media::{MediaCommand, MediaSnapshot, PlaybackStatus, RepeatMode};

const HOST_SUBCLASS_ID: usize = 0x4d49_4e50;
const BUTTON_SUBCLASS_ID: usize = 0x4d49_4e42;

const MAX_ARTWORK_BYTES: usize = 6 * 1024 * 1024;
const MAX_ARTWORK_DIMENSION: u32 = 8192;
const MAX_ARTWORK_PIXELS: u64 = 40_000_000;
const ARTWORK_TIMEOUT: Duration = Duration::from_secs(5);

const COVER_ID: u16 = 101;
const PREVIOUS_ID: u16 = 102;
const PLAY_PAUSE_ID: u16 = 103;
const NEXT_ID: u16 = 104;
const LIKE_ID: u16 = 105;
const SHUFFLE_ID: u16 = 106;
const REPEAT_ID: u16 = 107;

const LOGICAL_HEIGHT: i32 = 40;
const LOGICAL_BUTTON: i32 = 32;
const LOGICAL_COVER: i32 = 28;
const CONTROL_COUNT: usize = 7;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum TaskbarElement {
    Cover,
    Previous,
    Transport,
    Next,
    Like,
    Shuffle,
    Repeat,
}

impl TaskbarElement {
    const fn id(self) -> u16 {
        match self {
            Self::Cover => COVER_ID,
            Self::Previous => PREVIOUS_ID,
            Self::Transport => PLAY_PAUSE_ID,
            Self::Next => NEXT_ID,
            Self::Like => LIKE_ID,
            Self::Shuffle => SHUFFLE_ID,
            Self::Repeat => REPEAT_ID,
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "cover" => Some(Self::Cover),
            "previous" => Some(Self::Previous),
            "transport" => Some(Self::Transport),
            "next" => Some(Self::Next),
            "like" => Some(Self::Like),
            "shuffle" => Some(Self::Shuffle),
            "repeat" => Some(Self::Repeat),
            _ => None,
        }
    }
}

const ALL_ELEMENTS: [TaskbarElement; CONTROL_COUNT] = [
    TaskbarElement::Cover,
    TaskbarElement::Previous,
    TaskbarElement::Transport,
    TaskbarElement::Next,
    TaskbarElement::Like,
    TaskbarElement::Shuffle,
    TaskbarElement::Repeat,
];
const DEFAULT_ELEMENTS: [TaskbarElement; 4] = [
    TaskbarElement::Cover,
    TaskbarElement::Previous,
    TaskbarElement::Transport,
    TaskbarElement::Next,
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) struct TaskbarLayout {
    elements: [TaskbarElement; CONTROL_COUNT],
    len: usize,
}

impl TaskbarLayout {
    pub(super) fn from_config(value: Option<&serde_json::Value>, legacy_show_like: bool) -> Self {
        let source = value
            .filter(|root| root.get("version").and_then(serde_json::Value::as_u64) == Some(1))
            .and_then(|root| root.get("elements"))
            .and_then(serde_json::Value::as_array);
        let mut layout = Self::empty();
        if let Some(source) = source {
            for element in source
                .iter()
                .filter_map(|value| value.as_str().and_then(TaskbarElement::parse))
            {
                layout.push(element);
            }
        } else {
            for element in DEFAULT_ELEMENTS {
                layout.push(element);
            }
            if legacy_show_like {
                layout.push(TaskbarElement::Like);
            }
        }
        layout.push(TaskbarElement::Transport);
        layout
    }

    const fn empty() -> Self {
        Self {
            elements: [TaskbarElement::Transport; CONTROL_COUNT],
            len: 0,
        }
    }

    fn push(&mut self, element: TaskbarElement) {
        if self.len < CONTROL_COUNT && !self.contains(element) {
            self.elements[self.len] = element;
            self.len += 1;
        }
    }

    fn contains(self, element: TaskbarElement) -> bool {
        self.elements[..self.len].contains(&element)
    }

    fn iter(self) -> impl Iterator<Item = TaskbarElement> {
        self.elements.into_iter().take(self.len)
    }
}

impl Default for TaskbarLayout {
    fn default() -> Self {
        Self::from_config(None, false)
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(super) struct PlayerOptions {
    pub scale: f64,
    pub layout: TaskbarLayout,
}

impl Default for PlayerOptions {
    fn default() -> Self {
        Self {
            scale: 1.0,
            layout: TaskbarLayout::default(),
        }
    }
}

impl PlayerOptions {
    fn normalized(self) -> Self {
        Self {
            scale: if self.scale.is_finite() {
                self.scale.clamp(0.75, 1.25)
            } else {
                1.0
            },
            layout: self.layout,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Presentation {
    english: bool,
    is_playing: bool,
    is_liked: bool,
    is_shuffle_active: bool,
    repeat_mode: RepeatMode,
    enabled: [bool; CONTROL_COUNT],
}

struct PlayerState {
    app: AppHandle,
    instance_id: u64,
    dpi: u32,
    snapshot: Option<MediaSnapshot>,
    locale: String,
    options: PlayerOptions,
    presentation: Presentation,
    buttons: [HWND; CONTROL_COUNT],
    region_size: (i32, i32),
    hot_button: Option<u16>,
    artwork_key: Option<String>,
    artwork_revision: u64,
    artwork: Option<Artwork>,
    artwork_task: Option<ArtworkTask>,
}

struct UpdatePayload {
    snapshot: Option<MediaSnapshot>,
    locale: String,
    options: PlayerOptions,
}

#[derive(Clone)]
struct Artwork {
    width: u32,
    height: u32,
    pixels: Vec<u8>,
}

struct ArtworkTask {
    cancelled: Arc<AtomicBool>,
    handle: tauri::async_runtime::JoinHandle<()>,
}

impl ArtworkTask {
    fn cancel(self) {
        self.cancelled.store(true, Ordering::Release);
        self.handle.abort();
    }
}

static GDIPLUS_READY: AtomicBool = AtomicBool::new(false);
static GDIPLUS_TOKEN: OnceLock<usize> = OnceLock::new();
static INPUT_MOVE_LOGGED: AtomicBool = AtomicBool::new(false);
static INPUT_COMMAND_LOGGED: AtomicBool = AtomicBool::new(false);
static NEXT_INSTANCE_ID: AtomicU64 = AtomicU64::new(1);
static ARTWORK_DECODE_GATE: tokio::sync::Semaphore = tokio::sync::Semaphore::const_new(1);

pub(super) fn logical_width(options: PlayerOptions) -> i32 {
    let options = options.normalized();
    let mut width = 12;
    for (index, element) in options.layout.iter().enumerate() {
        width += 32;
        if element == TaskbarElement::Cover && index + 1 < options.layout.len {
            width += 4;
        }
    }
    scale_factor(width, options.scale)
}

pub(super) fn create(
    app: &AppHandle,
    parent: HWND,
    dpi: u32,
    options: PlayerOptions,
) -> anyhow::Result<HWND> {
    anyhow::ensure!(
        unsafe { IsWindow(Some(parent)).as_bool() },
        "Taskbar parent is invalid"
    );

    let options = options.normalized();
    let width = scale(logical_width(options), dpi);
    let height = scale(LOGICAL_HEIGHT, dpi);
    let hwnd = unsafe {
        CreateWindowExW(
            WS_EX_LAYERED | WS_EX_NOACTIVATE | WS_EX_TOOLWINDOW,
            w!("STATIC"),
            w!("Music Island — taskbar"),
            WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS,
            0,
            0,
            width,
            height,
            Some(parent),
            None,
            None,
            None,
        )?
    };
    if let Err(error) = unsafe { SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA) } {
        unsafe {
            let _ = DestroyWindow(hwnd);
        }
        return Err(error.into());
    }

    let state = Box::new(PlayerState {
        app: app.clone(),
        instance_id: NEXT_INSTANCE_ID.fetch_add(1, Ordering::Relaxed),
        dpi: normalize_dpi(dpi),
        snapshot: None,
        locale: "ru".into(),
        options,
        presentation: presentation(None, "ru", options),
        buttons: [HWND::default(); CONTROL_COUNT],
        region_size: (0, 0),
        hot_button: None,
        artwork_key: None,
        artwork_revision: 0,
        artwork: None,
        artwork_task: None,
    });
    let state_ptr = Box::into_raw(state);
    if !unsafe {
        SetWindowSubclass(
            hwnd,
            Some(host_window_proc),
            HOST_SUBCLASS_ID,
            state_ptr as usize,
        )
        .as_bool()
    } {
        unsafe {
            drop(Box::from_raw(state_ptr));
            let _ = DestroyWindow(hwnd);
        }
        anyhow::bail!("Taskbar native player subclass was not installed");
    }

    let result = unsafe { create_buttons(hwnd, state_ptr) };
    if let Err(error) = result {
        unsafe {
            let _ = DestroyWindow(hwnd);
        }
        return Err(error);
    }
    unsafe {
        layout_buttons(hwnd, state_ptr);
        apply_presentation(state_ptr, None);
        apply_host_region(hwnd, state_ptr);
    }
    initialize_gdiplus();
    Ok(hwnd)
}

pub(super) fn update(
    hwnd: HWND,
    snapshot: Option<MediaSnapshot>,
    locale: &str,
    options: PlayerOptions,
) {
    let mut state_ptr = 0;
    if unsafe {
        GetWindowSubclass(
            hwnd,
            Some(host_window_proc),
            HOST_SUBCLASS_ID,
            Some(&mut state_ptr),
        )
        .as_bool()
    } {
        unsafe {
            apply_update(
                hwnd,
                state_ptr as *mut PlayerState,
                UpdatePayload {
                    snapshot,
                    locale: locale.to_owned(),
                    options: options.normalized(),
                },
            )
        };
    }
}

pub(super) fn destroy(hwnd: HWND) {
    unsafe {
        if IsWindow(Some(hwnd)).as_bool() {
            let _ = DestroyWindow(hwnd);
        }
    }
}

unsafe fn create_buttons(parent: HWND, state_ptr: *mut PlayerState) -> anyhow::Result<()> {
    for (index, element) in ALL_ELEMENTS.into_iter().enumerate() {
        let id = element.id();
        let visible_style = if (*state_ptr).options.layout.contains(element) {
            WS_VISIBLE
        } else {
            windows::Win32::UI::WindowsAndMessaging::WINDOW_STYLE(0)
        };
        let hwnd = CreateWindowExW(
            Default::default(),
            w!("BUTTON"),
            PCWSTR::null(),
            WS_CHILD
                | visible_style
                | WS_TABSTOP
                | windows::Win32::UI::WindowsAndMessaging::WINDOW_STYLE(
                    (BS_OWNERDRAW | BS_NOTIFY) as u32,
                ),
            0,
            0,
            1,
            1,
            Some(parent),
            Some(HMENU(id as usize as *mut c_void)),
            None,
            None,
        )?;
        anyhow::ensure!(
            SetWindowSubclass(
                hwnd,
                Some(button_window_proc),
                BUTTON_SUBCLASS_ID,
                state_ptr as usize,
            )
            .as_bool(),
            "Taskbar button subclass was not installed"
        );
        // Do not hold a PlayerState reference while Win32 can synchronously
        // re-enter one of this host's window procedures.
        (*state_ptr).buttons[index] = hwnd;
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct ButtonLayout {
    hwnd: HWND,
    x: i32,
    y: i32,
    size: i32,
    visible: bool,
    was_visible: bool,
}

unsafe fn layout_buttons(hwnd: HWND, state_ptr: *const PlayerState) -> bool {
    let (dpi, buttons, options) = {
        let state = &*state_ptr;
        (state.dpi, state.buttons, state.options)
    };
    let mut client = RECT::default();
    if GetClientRect(hwnd, &mut client).is_err() {
        return false;
    }
    let content_width = scale(logical_width(options), dpi).max(1);
    let x_adjust = ((client.right - client.left) - content_width) / 2;
    let client_height = (client.bottom - client.top).max(1);
    let size = scale_with_options(LOGICAL_BUTTON, dpi, options)
        .max(1)
        .min(client_height);
    let y = (client_height - size) / 2;
    let mut positions = [None; CONTROL_COUNT];
    let mut left = 4;
    for (order, element) in options.layout.iter().enumerate() {
        if let Some(index) = button_index(element.id()) {
            positions[index] = Some(left);
            left += 32;
            if element == TaskbarElement::Cover && order + 1 < options.layout.len {
                left += 4;
            }
        }
    }
    let mut changes = Vec::with_capacity(buttons.len());
    for (index, button) in buttons.iter().enumerate() {
        if button.0.is_null() {
            continue;
        }
        let visible = positions[index].is_some();
        let was_visible = GetWindowLongPtrW(*button, GWL_STYLE) & WS_VISIBLE.0 as isize != 0;
        let x = scale_with_options(positions[index].unwrap_or_default(), dpi, options) + x_adjust;
        let geometry_changed = visible && child_rect(hwnd, *button) != Some((x, y, size, size));
        if visible != was_visible || geometry_changed {
            changes.push(ButtonLayout {
                hwnd: *button,
                x,
                y,
                size,
                visible,
                was_visible,
            });
        }
    }
    if changes.is_empty() {
        return false;
    }

    let applied = BeginDeferWindowPos(changes.len() as i32)
        .and_then(|mut batch| {
            for change in &changes {
                batch = DeferWindowPos(
                    batch,
                    change.hwnd,
                    None,
                    change.x,
                    change.y,
                    change.size,
                    change.size,
                    layout_flags(*change),
                )?;
            }
            EndDeferWindowPos(batch)
        })
        .is_ok();
    if !applied {
        for change in &changes {
            let _ = SetWindowPos(
                change.hwnd,
                None,
                change.x,
                change.y,
                change.size,
                change.size,
                layout_flags(*change),
            );
        }
    }
    true
}

unsafe fn child_rect(parent: HWND, child: HWND) -> Option<(i32, i32, i32, i32)> {
    let mut rect = RECT::default();
    GetWindowRect(child, &mut rect).ok()?;
    let mut points = [
        POINT {
            x: rect.left,
            y: rect.top,
        },
        POINT {
            x: rect.right,
            y: rect.bottom,
        },
    ];
    MapWindowPoints(None, Some(parent), &mut points);
    Some((
        points[0].x,
        points[0].y,
        points[1].x - points[0].x,
        points[1].y - points[0].y,
    ))
}

fn layout_flags(
    change: ButtonLayout,
) -> windows::Win32::UI::WindowsAndMessaging::SET_WINDOW_POS_FLAGS {
    let base = SWP_NOACTIVATE | SWP_NOZORDER | SWP_NOOWNERZORDER;
    if !change.visible {
        base | SWP_NOMOVE | SWP_NOSIZE | SWP_HIDEWINDOW
    } else if !change.was_visible {
        base | SWP_SHOWWINDOW
    } else {
        base
    }
}

unsafe fn invalidate_layout(hwnd: HWND, state_ptr: *const PlayerState) {
    let (buttons, layout) = {
        let state = &*state_ptr;
        (state.buttons, state.options.layout)
    };
    let _ = InvalidateRect(Some(hwnd), None, false);
    for (index, button) in buttons.iter().enumerate() {
        if layout.contains(ALL_ELEMENTS[index]) {
            let _ = InvalidateRect(Some(*button), None, false);
        }
    }
}

unsafe fn apply_presentation(state_ptr: *const PlayerState, previous: Option<Presentation>) {
    let (buttons, next, names) = {
        let state = &*state_ptr;
        (
            state.buttons,
            state.presentation,
            accessible_names(state.presentation),
        )
    };
    let previous_names = previous.map(accessible_names);
    for (index, button) in buttons.iter().enumerate() {
        if previous_names.is_none_or(|old| old[index] != names[index]) {
            set_accessible_name(*button, names[index]);
        }
        if previous.is_none_or(|old| old.enabled[index] != next.enabled[index]) {
            let _ = EnableWindow(*button, next.enabled[index]);
        }
        let visual_changed = previous.is_none_or(|old| {
            old.enabled[index] != next.enabled[index]
                || (index == 2 && old.is_playing != next.is_playing)
                || (index == 4 && old.is_liked != next.is_liked)
                || (index == 5 && old.is_shuffle_active != next.is_shuffle_active)
                || (index == 6 && old.repeat_mode != next.repeat_mode)
        });
        if visual_changed {
            let _ = InvalidateRect(Some(*button), None, false);
        }
    }
}

unsafe fn set_accessible_name(hwnd: HWND, name: &str) {
    let wide = wide(name);
    let _ = SetWindowTextW(hwnd, PCWSTR(wide.as_ptr()));
}

unsafe fn apply_update(hwnd: HWND, state_ptr: *mut PlayerState, payload: UpdatePayload) {
    let (previous_task, artwork_request, previous_presentation, layout_changed, artwork_changed) = {
        let state = &mut *state_ptr;
        let previous_presentation = state.presentation;
        let previous_options = state.options;
        state.snapshot = payload.snapshot;
        state.locale = payload.locale;
        state.options = payload.options;
        state.presentation = presentation(state.snapshot.as_ref(), &state.locale, state.options);
        let next_key = state
            .options
            .layout
            .contains(TaskbarElement::Cover)
            .then(|| {
                state
                    .snapshot
                    .as_ref()
                    .and_then(|snapshot| snapshot.thumbnail_data_url.clone())
            })
            .flatten()
            .filter(|source| !source.is_empty());
        if state.artwork_key == next_key {
            (
                None,
                None,
                previous_presentation,
                previous_options != state.options,
                false,
            )
        } else {
            let previous_task = state.artwork_task.take();
            state.artwork_key = next_key.clone();
            state.artwork = None;
            state.artwork_revision = state.artwork_revision.wrapping_add(1);
            (
                previous_task,
                next_key.map(|source| {
                    (
                        state.app.clone(),
                        state.instance_id,
                        state.artwork_revision,
                        source,
                        scale_with_options(LOGICAL_COVER, state.dpi, state.options).clamp(18, 64)
                            as u32,
                    )
                }),
                previous_presentation,
                previous_options != state.options,
                true,
            )
        }
    };

    if let Some(previous_task) = previous_task {
        previous_task.cancel();
    }
    if layout_changed {
        if layout_buttons(hwnd, state_ptr) {
            invalidate_layout(hwnd, state_ptr);
        }
    }
    apply_presentation(state_ptr, Some(previous_presentation));
    if artwork_changed {
        let cover = (*state_ptr).buttons[0];
        let _ = InvalidateRect(Some(cover), None, false);
    }
    if let Some((app, instance_id, revision, source, size)) = artwork_request {
        let task = load_artwork(app, hwnd, instance_id, revision, source, size);
        (*state_ptr).artwork_task = Some(task);
    }
}

unsafe extern "system" fn host_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    state_ptr: usize,
) -> LRESULT {
    match message {
        WM_COMMAND => {
            let control_id = (wparam.0 & 0xffff) as u16;
            let notification = ((wparam.0 >> 16) & 0xffff) as u32;
            let sender = HWND(lparam.0 as *mut c_void);
            if notification == windows::Win32::UI::WindowsAndMessaging::BN_CLICKED {
                dispatch(state_ptr as *const PlayerState, control_id, sender);
                return LRESULT(0);
            }
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        WM_DRAWITEM => {
            let item = &*(lparam.0 as *const DRAWITEMSTRUCT);
            let (hot, presentation, artwork, dpi, options) = {
                let state = &*(state_ptr as *const PlayerState);
                (
                    state.hot_button == Some(item.CtlID as u16),
                    state.presentation,
                    (item.CtlID as u16 == COVER_ID)
                        .then(|| state.artwork.clone())
                        .flatten(),
                    state.dpi,
                    state.options,
                )
            };
            draw_button(item, hot, presentation, artwork.as_ref(), dpi, options);
            LRESULT(1)
        }
        WM_SIZE => {
            let region_changed = apply_host_region(hwnd, state_ptr as *mut PlayerState);
            let layout_changed = layout_buttons(hwnd, state_ptr as *const PlayerState);
            if region_changed || layout_changed {
                invalidate_layout(hwnd, state_ptr as *const PlayerState);
            }
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        WM_ERASEBKGND => LRESULT(1),
        // The system STATIC procedure returns HTTRANSPARENT. This host owns a
        // real input surface, so keep hit-testing in our same-process subtree.
        WM_NCHITTEST => LRESULT(HTCLIENT as isize),
        WM_PAINT => {
            draw_host(hwnd);
            LRESULT(0)
        }
        WM_NCDESTROY => {
            let artwork_task = (&mut *(state_ptr as *mut PlayerState)).artwork_task.take();
            if let Some(artwork_task) = artwork_task {
                artwork_task.cancel();
            }
            let _ = RemoveWindowSubclass(hwnd, Some(host_window_proc), HOST_SUBCLASS_ID);
            let result = DefSubclassProc(hwnd, message, wparam, lparam);
            drop(Box::from_raw(state_ptr as *mut PlayerState));
            result
        }
        _ => DefSubclassProc(hwnd, message, wparam, lparam),
    }
}

unsafe extern "system" fn button_window_proc(
    hwnd: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
    _id: usize,
    state_ptr: usize,
) -> LRESULT {
    match message {
        WM_MOUSEMOVE => {
            log_input_once(&INPUT_MOVE_LOGGED, "taskbar native input: mouse move");
            let id = GetDlgCtrlID(hwnd) as u16;
            let previous = {
                let state = &mut *(state_ptr as *mut PlayerState);
                if state.hot_button == Some(id) {
                    None
                } else {
                    let previous = state.hot_button.and_then(|id| button_for_id(state, id));
                    state.hot_button = Some(id);
                    Some(previous)
                }
            };
            if let Some(previous) = previous {
                if let Some(previous) = previous {
                    let _ = InvalidateRect(Some(previous), None, false);
                }
                let _ = InvalidateRect(Some(hwnd), None, false);
                let mut tracking = TRACKMOUSEEVENT {
                    cbSize: size_of::<TRACKMOUSEEVENT>() as u32,
                    dwFlags: TME_LEAVE,
                    hwndTrack: hwnd,
                    dwHoverTime: 0,
                };
                let _ = TrackMouseEvent(&mut tracking);
            }
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        WM_MOUSELEAVE => {
            let id = GetDlgCtrlID(hwnd) as u16;
            let changed = {
                let state = &mut *(state_ptr as *mut PlayerState);
                if state.hot_button == Some(id) {
                    state.hot_button = None;
                    true
                } else {
                    false
                }
            };
            if changed {
                let _ = InvalidateRect(Some(hwnd), None, false);
            }
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(button_window_proc), BUTTON_SUBCLASS_ID);
            DefSubclassProc(hwnd, message, wparam, lparam)
        }
        _ => DefSubclassProc(hwnd, message, wparam, lparam),
    }
}

unsafe fn dispatch(state_ptr: *const PlayerState, control_id: u16, sender: HWND) {
    let (app, enabled, expected_sender) = {
        let state = &*state_ptr;
        let index = button_index(control_id);
        (
            state.app.clone(),
            index.is_some_and(|index| state.presentation.enabled[index]),
            index.map(|index| state.buttons[index]),
        )
    };
    if expected_sender != Some(sender) || !enabled {
        return;
    }
    log_input_once(&INPUT_COMMAND_LOGGED, "taskbar native input: command");
    let command = match control_id {
        COVER_ID => {
            if let Err(error) = app.emit_to("main", "island:reveal", ()) {
                log::debug!("Taskbar island reveal failed: {error}");
            }
            return;
        }
        PREVIOUS_ID => MediaCommand::Previous,
        PLAY_PAUSE_ID => MediaCommand::PlayPause,
        NEXT_ID => MediaCommand::Next,
        LIKE_ID => MediaCommand::Like,
        SHUFFLE_ID => MediaCommand::ToggleShuffle,
        REPEAT_ID => MediaCommand::CycleRepeat,
        _ => return,
    };
    tauri::async_runtime::spawn(async move {
        if let Err(error) = crate::media::send_command(command).await {
            log::debug!("Taskbar media command failed: {error}");
        }
    });
}

unsafe fn draw_host(hwnd: HWND) {
    let mut paint = PAINTSTRUCT::default();
    let hdc = BeginPaint(hwnd, &mut paint);
    let mut rect = RECT::default();
    if GetClientRect(hwnd, &mut rect).is_ok() {
        let brush = CreateSolidBrush(rgb(31, 32, 37));
        FillRect(hdc, &rect, brush);
        let _ = DeleteObject(HGDIOBJ(brush.0));
    }
    let _ = EndPaint(hwnd, &paint);
}

unsafe fn apply_host_region(hwnd: HWND, state_ptr: *mut PlayerState) -> bool {
    let mut rect = RECT::default();
    if GetClientRect(hwnd, &mut rect).is_err() {
        return false;
    }
    let size = (rect.right - rect.left, rect.bottom - rect.top);
    if (*state_ptr).region_size == size {
        return false;
    }
    let radius = ((rect.bottom - rect.top) / 2).max(4);
    let region = CreateRoundRectRgn(
        rect.left,
        rect.top,
        rect.right + 1,
        rect.bottom + 1,
        radius,
        radius,
    );
    // SetWindowRgn takes ownership only on success.
    if SetWindowRgn(hwnd, Some(region), false) == 0 {
        let _ = DeleteObject(HGDIOBJ(region.0));
        return false;
    }
    (*state_ptr).region_size = size;
    true
}

unsafe fn draw_button(
    item: &DRAWITEMSTRUCT,
    hot: bool,
    presentation: Presentation,
    artwork: Option<&Artwork>,
    dpi: u32,
    options: PlayerOptions,
) {
    let width = (item.rcItem.right - item.rcItem.left).max(1);
    let height = (item.rcItem.bottom - item.rcItem.top).max(1);
    let buffer = CreateCompatibleDC(Some(item.hDC));
    if !buffer.0.is_null() {
        let bitmap = CreateCompatibleBitmap(item.hDC, width, height);
        if !bitmap.0.is_null() {
            let previous_bitmap = SelectObject(buffer, HGDIOBJ(bitmap.0));
            let rect = RECT {
                left: 0,
                top: 0,
                right: width,
                bottom: height,
            };
            paint_button(
                buffer,
                rect,
                item.CtlID as u16,
                item.itemState.0 & ODS_DISABLED.0 != 0,
                item.itemState.0 & ODS_SELECTED.0 != 0,
                hot,
                presentation,
                artwork,
                dpi,
                options,
            );
            let _ = BitBlt(
                item.hDC,
                item.rcItem.left,
                item.rcItem.top,
                width,
                height,
                Some(buffer),
                0,
                0,
                SRCCOPY,
            );
            SelectObject(buffer, previous_bitmap);
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DeleteDC(buffer);
            return;
        }
        let _ = DeleteDC(buffer);
    }
    paint_button(
        item.hDC,
        item.rcItem,
        item.CtlID as u16,
        item.itemState.0 & ODS_DISABLED.0 != 0,
        item.itemState.0 & ODS_SELECTED.0 != 0,
        hot,
        presentation,
        artwork,
        dpi,
        options,
    );
}

#[allow(clippy::too_many_arguments)]
unsafe fn paint_button(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    rect: RECT,
    id: u16,
    disabled: bool,
    selected: bool,
    hot: bool,
    presentation: Presentation,
    artwork: Option<&Artwork>,
    dpi: u32,
    options: PlayerOptions,
) {
    let active = match id {
        LIKE_ID => presentation.is_liked,
        SHUFFLE_ID => presentation.is_shuffle_active,
        REPEAT_ID => presentation.repeat_mode != RepeatMode::Off,
        _ => false,
    };
    let background = match (selected, hot, active) {
        (true, _, _) | (_, _, true) => rgb(51, 52, 59),
        (false, true, false) => rgb(43, 44, 50),
        _ => rgb(31, 32, 37),
    };
    let foreground = if disabled {
        rgb(106, 109, 121)
    } else if hot || selected || active {
        rgb(235, 236, 239)
    } else {
        rgb(185, 187, 192)
    };

    let base = CreateSolidBrush(rgb(31, 32, 37));
    FillRect(hdc, &rect, base);
    let _ = DeleteObject(HGDIOBJ(base.0));

    if hot || selected || active {
        let brush = CreateSolidBrush(background);
        let old_brush = SelectObject(hdc, HGDIOBJ(brush.0));
        let old_pen = SelectObject(hdc, GetStockObject(NULL_PEN));
        let inset = scale_with_options(3, dpi, options).max(2);
        let radius = ((rect.bottom - rect.top) / 3).max(4);
        let _ = RoundRect(
            hdc,
            rect.left + inset,
            rect.top + inset,
            rect.right - inset,
            rect.bottom - inset,
            radius,
            radius,
        );
        SelectObject(hdc, old_pen);
        SelectObject(hdc, old_brush);
        let _ = DeleteObject(HGDIOBJ(brush.0));
    }

    let cover_size = scale_with_options(LOGICAL_COVER, dpi, options);
    if id == COVER_ID
        && artwork.is_some_and(|artwork| draw_artwork(hdc, rect, artwork, cover_size, selected))
    {
        return;
    }
    let glyph_size = scale_with_options(if id == PLAY_PAUSE_ID { 16 } else { 14 }, dpi, options);
    draw_glyph(
        hdc,
        rect,
        id,
        foreground,
        presentation.is_playing,
        presentation.is_liked,
        presentation.is_shuffle_active,
        presentation.repeat_mode,
        glyph_size,
    );
}

unsafe fn draw_artwork(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    rect: RECT,
    artwork: &Artwork,
    target_size: i32,
    selected: bool,
) -> bool {
    if artwork.pixels.len() != artwork.width as usize * artwork.height as usize * size_of::<u32>() {
        return false;
    }
    let available = (rect.right - rect.left).min(rect.bottom - rect.top).max(1);
    let size = target_size.max(1).min(available);
    let pressed_offset = i32::from(selected);
    let left = rect.left + (rect.right - rect.left - size) / 2 + pressed_offset;
    let top = rect.top + (rect.bottom - rect.top - size) / 2 + pressed_offset;
    let destination = RECT {
        left,
        top,
        right: left + size,
        bottom: top + size,
    };
    let mut bitmap = BITMAPINFO::default();
    bitmap.bmiHeader = BITMAPINFOHEADER {
        biSize: size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: artwork.width as i32,
        // WIC returns top-down rows; a negative DIB height preserves them.
        biHeight: -(artwork.height as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        biSizeImage: artwork.pixels.len() as u32,
        ..Default::default()
    };
    let saved = SaveDC(hdc);
    let radius = ((destination.bottom - destination.top) / 3).max(4);
    let clip = CreateRoundRectRgn(
        destination.left,
        destination.top,
        destination.right + 1,
        destination.bottom + 1,
        radius,
        radius,
    );
    SelectClipRgn(hdc, Some(clip));
    let drawn = StretchDIBits(
        hdc,
        destination.left,
        destination.top,
        destination.right - destination.left,
        destination.bottom - destination.top,
        0,
        0,
        artwork.width as i32,
        artwork.height as i32,
        Some(artwork.pixels.as_ptr() as *const c_void),
        &bitmap,
        DIB_RGB_COLORS,
        SRCCOPY,
    ) != 0;
    let _ = DeleteObject(HGDIOBJ(clip.0));
    if saved != 0 {
        let _ = RestoreDC(hdc, saved);
    } else {
        SelectClipRgn(hdc, None);
    }
    drawn
}

unsafe fn draw_glyph(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    rect: RECT,
    id: u16,
    color: COLORREF,
    is_playing: bool,
    is_liked: bool,
    is_shuffle_active: bool,
    repeat_mode: RepeatMode,
    glyph_size: i32,
) {
    let width = rect.right - rect.left;
    let height = rect.bottom - rect.top;
    let cx = rect.left + width / 2;
    let cy = rect.top + height / 2;
    let extent = glyph_size.min(width).min(height).max(6);
    let unit = (extent / 6).max(1);
    if draw_lucide_gdiplus(
        hdc,
        id,
        color,
        is_playing,
        is_liked,
        repeat_mode,
        cx,
        cy,
        extent,
    ) || draw_transport_gdiplus(hdc, id, color, is_playing, cx, cy, extent)
    {
        return;
    }
    let brush = CreateSolidBrush(color);
    let old_brush = SelectObject(hdc, HGDIOBJ(brush.0));
    let old_pen = SelectObject(hdc, GetStockObject(NULL_PEN));

    match id {
        COVER_ID => {
            SelectObject(hdc, old_pen);
            SelectObject(hdc, old_brush);
            let _ = DeleteObject(HGDIOBJ(brush.0));
            let mut glyph: Vec<u16> = "♪".encode_utf16().collect();
            let font = GetStockObject(DEFAULT_GUI_FONT);
            let old_font = SelectObject(hdc, font);
            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, color);
            let mut text_rect = rect;
            DrawTextW(
                hdc,
                &mut glyph,
                &mut text_rect,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE,
            );
            SelectObject(hdc, old_font);
            return;
        }
        PREVIOUS_ID => {
            fill_rect(
                hdc,
                RECT {
                    left: cx - 3 * unit,
                    top: cy - 2 * unit,
                    right: cx - 2 * unit,
                    bottom: cy + 2 * unit,
                },
                brush,
            );
            let _ = Polygon(
                hdc,
                &[
                    POINT {
                        x: cx + 2 * unit,
                        y: cy - 3 * unit,
                    },
                    POINT {
                        x: cx - 2 * unit,
                        y: cy,
                    },
                    POINT {
                        x: cx + 2 * unit,
                        y: cy + 3 * unit,
                    },
                ],
            );
        }
        PLAY_PAUSE_ID if is_playing => {
            fill_rect(
                hdc,
                RECT {
                    left: cx - 3 * unit,
                    top: cy - 3 * unit,
                    right: cx - unit,
                    bottom: cy + 3 * unit,
                },
                brush,
            );
            fill_rect(
                hdc,
                RECT {
                    left: cx + unit,
                    top: cy - 3 * unit,
                    right: cx + 3 * unit,
                    bottom: cy + 3 * unit,
                },
                brush,
            );
        }
        PLAY_PAUSE_ID => {
            let _ = Polygon(
                hdc,
                &[
                    POINT {
                        x: cx - 2 * unit,
                        y: cy - 3 * unit,
                    },
                    POINT {
                        x: cx + 3 * unit,
                        y: cy,
                    },
                    POINT {
                        x: cx - 2 * unit,
                        y: cy + 3 * unit,
                    },
                ],
            );
        }
        NEXT_ID => {
            let _ = Polygon(
                hdc,
                &[
                    POINT {
                        x: cx - 2 * unit,
                        y: cy - 3 * unit,
                    },
                    POINT {
                        x: cx + 2 * unit,
                        y: cy,
                    },
                    POINT {
                        x: cx - 2 * unit,
                        y: cy + 3 * unit,
                    },
                ],
            );
            fill_rect(
                hdc,
                RECT {
                    left: cx + 2 * unit,
                    top: cy - 2 * unit,
                    right: cx + 3 * unit,
                    bottom: cy + 2 * unit,
                },
                brush,
            );
        }
        LIKE_ID => {
            let mut glyph: Vec<u16> = if is_liked { "♥" } else { "♡" }.encode_utf16().collect();
            SelectObject(hdc, old_pen);
            SelectObject(hdc, old_brush);
            let _ = DeleteObject(HGDIOBJ(brush.0));
            let old_font = SelectObject(hdc, GetStockObject(DEFAULT_GUI_FONT));
            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, color);
            let mut text_rect = rect;
            DrawTextW(
                hdc,
                &mut glyph,
                &mut text_rect,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE,
            );
            SelectObject(hdc, old_font);
            return;
        }
        SHUFFLE_ID | REPEAT_ID => {
            let text = if id == SHUFFLE_ID {
                if is_shuffle_active {
                    "⇄"
                } else {
                    "⇄"
                }
            } else if repeat_mode == RepeatMode::One {
                "↻¹"
            } else {
                "↻"
            };
            let mut glyph: Vec<u16> = text.encode_utf16().collect();
            SelectObject(hdc, old_pen);
            SelectObject(hdc, old_brush);
            let _ = DeleteObject(HGDIOBJ(brush.0));
            let old_font = SelectObject(hdc, GetStockObject(DEFAULT_GUI_FONT));
            SetBkMode(hdc, TRANSPARENT);
            SetTextColor(hdc, color);
            let mut text_rect = rect;
            DrawTextW(
                hdc,
                &mut glyph,
                &mut text_rect,
                DT_CENTER | DT_VCENTER | DT_SINGLELINE,
            );
            SelectObject(hdc, old_font);
            return;
        }
        _ => {}
    }

    SelectObject(hdc, old_pen);
    SelectObject(hdc, old_brush);
    let _ = DeleteObject(HGDIOBJ(brush.0));
}

#[derive(Clone, Copy)]
struct LucideSpace {
    x: f32,
    y: f32,
    scale: f32,
}

impl LucideSpace {
    fn new(cx: i32, cy: i32, extent: i32) -> Self {
        let scale = extent as f32 / 24.0;
        Self {
            x: cx as f32 - 12.0 * scale,
            y: cy as f32 - 12.0 * scale,
            scale,
        }
    }

    fn point(self, point: (f32, f32)) -> (f32, f32) {
        (self.x + point.0 * self.scale, self.y + point.1 * self.scale)
    }
}

unsafe fn draw_lucide_gdiplus(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    id: u16,
    color: COLORREF,
    is_playing: bool,
    is_liked: bool,
    repeat_mode: RepeatMode,
    cx: i32,
    cy: i32,
    extent: i32,
) -> bool {
    if id == COVER_ID || !GDIPLUS_READY.load(Ordering::Acquire) {
        return false;
    }
    let mut graphics = std::ptr::null_mut();
    if GdipCreateFromHDC(hdc, &mut graphics) != GdiPlusOk || graphics.is_null() {
        return false;
    }
    GdipSetSmoothingMode(graphics, SmoothingModeAntiAlias);
    let mut solid = std::ptr::null_mut();
    let mut pen = std::ptr::null_mut();
    let stroke = (extent as f32 / 12.0).max(1.0);
    if GdipCreateSolidFill(argb(color), &mut solid) != GdiPlusOk
        || solid.is_null()
        || GdipCreatePen1(argb(color), stroke, UnitPixel, &mut pen) != GdiPlusOk
        || pen.is_null()
    {
        if !pen.is_null() {
            GdipDeletePen(pen);
        }
        if !solid.is_null() {
            GdipDeleteBrush(solid as *mut GpBrush);
        }
        GdipDeleteGraphics(graphics);
        return false;
    }
    GdipSetPenLineCap197819(pen, LineCapRound, LineCapRound, DashCapRound);
    GdipSetPenLineJoin(pen, LineJoinRound);
    let brush = solid as *mut GpBrush;
    let space = LucideSpace::new(cx, cy, extent);
    let status = match id {
        PREVIOUS_ID => draw_main_navigation(graphics, brush, space, true),
        NEXT_ID => draw_main_navigation(graphics, brush, space, false),
        PLAY_PAUSE_ID if is_playing => draw_lucide_pause(graphics, pen, brush, space),
        PLAY_PAUSE_ID => draw_lucide_play(graphics, pen, brush, space),
        LIKE_ID => draw_lucide_heart(graphics, pen, brush, space, is_liked),
        SHUFFLE_ID => draw_lucide_shuffle(graphics, pen, space),
        REPEAT_ID => draw_lucide_repeat(graphics, pen, space, repeat_mode == RepeatMode::One),
        _ => None,
    };
    GdipDeletePen(pen);
    GdipDeleteBrush(brush);
    GdipDeleteGraphics(graphics);
    status == Some(GdiPlusOk)
}

unsafe fn lucide_path() -> Option<*mut GpPath> {
    let mut path = std::ptr::null_mut();
    (GdipCreatePath(FillModeAlternate, &mut path) == GdiPlusOk && !path.is_null()).then_some(path)
}

unsafe fn lucide_line(path: *mut GpPath, space: LucideSpace, from: (f32, f32), to: (f32, f32)) {
    let (x1, y1) = space.point(from);
    let (x2, y2) = space.point(to);
    GdipAddPathLine(path, x1, y1, x2, y2);
}

unsafe fn lucide_curve(
    path: *mut GpPath,
    space: LucideSpace,
    start: (f32, f32),
    c1: (f32, f32),
    c2: (f32, f32),
    end: (f32, f32),
) {
    let (x1, y1) = space.point(start);
    let (x2, y2) = space.point(c1);
    let (x3, y3) = space.point(c2);
    let (x4, y4) = space.point(end);
    GdipAddPathBezier(path, x1, y1, x2, y2, x3, y3, x4, y4);
}

unsafe fn lucide_finish(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    brush: *mut GpBrush,
    path: *mut GpPath,
    fill: bool,
) -> GdiStatus {
    GdipClosePathFigure(path);
    let filled = fill.then(|| GdipFillPath(graphics, brush, path));
    let stroked = GdipDrawPath(graphics, pen, path);
    GdipDeletePath(path);
    filled
        .filter(|status| *status != GdiPlusOk)
        .unwrap_or(stroked)
}

unsafe fn lucide_strokes(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    space: LucideSpace,
    lines: &[((f32, f32), (f32, f32))],
) -> Option<GdiStatus> {
    let mut result = GdiPlusOk;
    for &(from, to) in lines {
        let path = lucide_path()?;
        lucide_line(path, space, from, to);
        let status = GdipDrawPath(graphics, pen, path);
        GdipDeletePath(path);
        if result == GdiPlusOk {
            result = status;
        }
    }
    Some(result)
}

unsafe fn draw_lucide_shuffle(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    space: LucideSpace,
) -> Option<GdiStatus> {
    lucide_strokes(
        graphics,
        pen,
        space,
        &[
            ((4.0, 6.0), (7.0, 6.0)),
            ((7.0, 6.0), (17.0, 18.0)),
            ((17.0, 18.0), (21.0, 18.0)),
            ((18.0, 15.0), (21.0, 18.0)),
            ((21.0, 18.0), (18.0, 21.0)),
            ((4.0, 18.0), (7.0, 18.0)),
            ((7.0, 18.0), (17.0, 6.0)),
            ((17.0, 6.0), (21.0, 6.0)),
            ((18.0, 3.0), (21.0, 6.0)),
            ((21.0, 6.0), (18.0, 9.0)),
        ],
    )
}

unsafe fn draw_lucide_repeat(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    space: LucideSpace,
    one: bool,
) -> Option<GdiStatus> {
    let outer = lucide_strokes(
        graphics,
        pen,
        space,
        &[
            ((4.0, 10.0), (4.0, 8.0)),
            ((4.0, 8.0), (6.0, 6.0)),
            ((6.0, 6.0), (20.0, 6.0)),
            ((17.0, 3.0), (20.0, 6.0)),
            ((20.0, 6.0), (17.0, 9.0)),
            ((20.0, 14.0), (20.0, 16.0)),
            ((20.0, 16.0), (18.0, 18.0)),
            ((18.0, 18.0), (4.0, 18.0)),
            ((7.0, 15.0), (4.0, 18.0)),
            ((4.0, 18.0), (7.0, 21.0)),
        ],
    )?;
    if !one {
        return Some(outer);
    }
    let badge = lucide_strokes(
        graphics,
        pen,
        space,
        &[
            ((10.5, 12.5), (12.5, 10.5)),
            ((12.5, 10.5), (12.5, 15.5)),
            ((10.5, 15.5), (14.5, 15.5)),
        ],
    )?;
    Some(if outer == GdiPlusOk { badge } else { outer })
}

unsafe fn draw_main_navigation(
    graphics: *mut GpGraphics,
    brush: *mut GpBrush,
    space: LucideSpace,
    previous: bool,
) -> Option<GdiStatus> {
    let path = lucide_path()?;
    // Exact silhouette of MusicControls PreviousFilledIcon/NextFilledIcon:
    // one connected rounded bar + transport wedge in a 24x24 view box.
    let mx = |x: f32| mirror_lucide_x(x, previous);
    lucide_curve(
        path,
        space,
        (mx(6.0), 5.0),
        (mx(6.55), 5.0),
        (mx(7.0), 5.45),
        (mx(7.0), 6.0),
    );
    lucide_line(path, space, (mx(7.0), 6.0), (mx(7.0), 10.22));
    lucide_line(path, space, (mx(7.0), 10.22), (mx(15.48), 5.13));
    lucide_curve(
        path,
        space,
        (mx(15.48), 5.13),
        (mx(16.15), 4.73),
        (mx(17.0), 5.21),
        (mx(17.0), 6.0),
    );
    lucide_line(path, space, (mx(17.0), 6.0), (mx(17.0), 18.0));
    lucide_curve(
        path,
        space,
        (mx(17.0), 18.0),
        (mx(17.0), 18.79),
        (mx(16.15), 19.27),
        (mx(15.48), 18.86),
    );
    lucide_line(path, space, (mx(15.48), 18.86), (mx(7.0), 13.78));
    lucide_line(path, space, (mx(7.0), 13.78), (mx(7.0), 18.0));
    lucide_curve(
        path,
        space,
        (mx(7.0), 18.0),
        (mx(7.0), 18.55),
        (mx(6.55), 19.0),
        (mx(6.0), 19.0),
    );
    lucide_curve(
        path,
        space,
        (mx(6.0), 19.0),
        (mx(5.45), 19.0),
        (mx(5.0), 18.55),
        (mx(5.0), 18.0),
    );
    lucide_line(path, space, (mx(5.0), 18.0), (mx(5.0), 6.0));
    lucide_curve(
        path,
        space,
        (mx(5.0), 6.0),
        (mx(5.0), 5.45),
        (mx(5.45), 5.0),
        (mx(6.0), 5.0),
    );
    GdipClosePathFigure(path);
    let status = GdipFillPath(graphics, brush, path);
    GdipDeletePath(path);
    Some(status)
}

fn mirror_lucide_x(x: f32, back: bool) -> f32 {
    if back {
        x
    } else {
        24.0 - x
    }
}

unsafe fn draw_lucide_play(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    brush: *mut GpBrush,
    space: LucideSpace,
) -> Option<GdiStatus> {
    let path = lucide_path()?;
    lucide_curve(
        path,
        space,
        (5.0, 5.0),
        (5.0, 3.46),
        (6.67, 2.5),
        (8.0, 3.27),
    );
    lucide_line(path, space, (8.0, 3.27), (20.0, 10.27));
    lucide_curve(
        path,
        space,
        (20.0, 10.27),
        (21.33, 11.04),
        (21.33, 12.96),
        (20.0, 13.73),
    );
    lucide_line(path, space, (20.0, 13.73), (8.0, 20.73));
    lucide_curve(
        path,
        space,
        (8.0, 20.73),
        (6.67, 21.5),
        (5.0, 20.54),
        (5.0, 19.0),
    );
    lucide_line(path, space, (5.0, 19.0), (5.0, 5.0));
    Some(lucide_finish(graphics, pen, brush, path, true))
}

unsafe fn draw_lucide_pause(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    brush: *mut GpBrush,
    space: LucideSpace,
) -> Option<GdiStatus> {
    let left = draw_lucide_round_rect(graphics, pen, brush, space, (5.0, 3.0, 5.0, 18.0, 1.0))?;
    let right = draw_lucide_round_rect(graphics, pen, brush, space, (14.0, 3.0, 5.0, 18.0, 1.0))?;
    Some(if left == GdiPlusOk { right } else { left })
}

unsafe fn draw_lucide_round_rect(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    brush: *mut GpBrush,
    space: LucideSpace,
    rect: (f32, f32, f32, f32, f32),
) -> Option<GdiStatus> {
    let (x, y, width, height, radius) = rect;
    let path = lucide_path()?;
    let k = radius * 0.552_284_8;
    lucide_line(path, space, (x + radius, y), (x + width - radius, y));
    lucide_curve(
        path,
        space,
        (x + width - radius, y),
        (x + width - radius + k, y),
        (x + width, y + radius - k),
        (x + width, y + radius),
    );
    lucide_line(
        path,
        space,
        (x + width, y + radius),
        (x + width, y + height - radius),
    );
    lucide_curve(
        path,
        space,
        (x + width, y + height - radius),
        (x + width, y + height - radius + k),
        (x + width - radius + k, y + height),
        (x + width - radius, y + height),
    );
    lucide_line(
        path,
        space,
        (x + width - radius, y + height),
        (x + radius, y + height),
    );
    lucide_curve(
        path,
        space,
        (x + radius, y + height),
        (x + radius - k, y + height),
        (x, y + height - radius + k),
        (x, y + height - radius),
    );
    lucide_line(path, space, (x, y + height - radius), (x, y + radius));
    lucide_curve(
        path,
        space,
        (x, y + radius),
        (x, y + radius - k),
        (x + radius - k, y),
        (x + radius, y),
    );
    Some(lucide_finish(graphics, pen, brush, path, true))
}

unsafe fn draw_lucide_heart(
    graphics: *mut GpGraphics,
    pen: *mut GpPen,
    brush: *mut GpBrush,
    space: LucideSpace,
    filled: bool,
) -> Option<GdiStatus> {
    let path = lucide_path()?;
    lucide_curve(
        path,
        space,
        (2.0, 9.5),
        (2.0, 6.46),
        (4.46, 4.0),
        (7.5, 4.0),
    );
    lucide_curve(
        path,
        space,
        (7.5, 4.0),
        (9.13, 4.0),
        (10.6, 4.71),
        (11.59, 5.824),
    );
    lucide_curve(
        path,
        space,
        (11.59, 5.824),
        (11.81, 6.07),
        (12.19, 6.07),
        (12.409, 5.824),
    );
    lucide_curve(
        path,
        space,
        (12.409, 5.824),
        (14.44, 3.54),
        (17.94, 3.38),
        (20.16, 5.48),
    );
    lucide_curve(
        path,
        space,
        (20.16, 5.48),
        (22.56, 7.75),
        (22.61, 11.28),
        (20.5, 13.61),
    );
    lucide_curve(
        path,
        space,
        (20.5, 13.61),
        (20.04, 14.12),
        (19.52, 14.58),
        (19.0, 15.0),
    );
    lucide_line(path, space, (19.0, 15.0), (13.508, 20.313));
    lucide_curve(
        path,
        space,
        (13.508, 20.313),
        (12.68, 21.11),
        (11.32, 21.12),
        (10.5, 20.33),
    );
    lucide_line(path, space, (10.5, 20.33), (5.0, 15.0));
    lucide_curve(
        path,
        space,
        (5.0, 15.0),
        (3.5, 13.5),
        (2.0, 11.8),
        (2.0, 9.5),
    );
    Some(lucide_finish(graphics, pen, brush, path, filled))
}

unsafe fn draw_transport_gdiplus(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    id: u16,
    color: COLORREF,
    is_playing: bool,
    cx: i32,
    cy: i32,
    extent: i32,
) -> bool {
    if id == COVER_ID || id == LIKE_ID || !GDIPLUS_READY.load(Ordering::Acquire) {
        return false;
    }
    let mut graphics: *mut GpGraphics = std::ptr::null_mut();
    if GdipCreateFromHDC(hdc, &mut graphics) != GdiPlusOk || graphics.is_null() {
        return false;
    }
    GdipSetSmoothingMode(graphics, SmoothingModeAntiAlias);
    let mut solid: *mut GpSolidFill = std::ptr::null_mut();
    let created = GdipCreateSolidFill(argb(color), &mut solid) == GdiPlusOk && !solid.is_null();
    if !created {
        GdipDeleteGraphics(graphics);
        return false;
    }
    let brush = solid as *mut GpBrush;
    let half = (extent / 2).max(3);
    let bar = (extent / 7).max(1);
    let status = match id {
        PREVIOUS_ID => {
            let bar_status = GdipFillRectangleI(
                graphics,
                brush,
                cx - half + 1,
                cy - half + 1,
                bar,
                2 * half - 2,
            );
            let points = [
                GdipPoint {
                    X: cx + half / 2,
                    Y: cy - half,
                },
                GdipPoint {
                    X: cx - half / 2,
                    Y: cy,
                },
                GdipPoint {
                    X: cx + half / 2,
                    Y: cy + half,
                },
            ];
            let triangle = GdipFillPolygonI(
                graphics,
                brush,
                points.as_ptr(),
                points.len() as i32,
                FillModeAlternate,
            );
            if bar_status == GdiPlusOk {
                triangle
            } else {
                bar_status
            }
        }
        PLAY_PAUSE_ID if is_playing => {
            let left = GdipFillRectangleI(
                graphics,
                brush,
                cx - half / 2 - bar,
                cy - half,
                bar + 1,
                2 * half,
            );
            let right =
                GdipFillRectangleI(graphics, brush, cx + half / 2, cy - half, bar + 1, 2 * half);
            if left == GdiPlusOk {
                right
            } else {
                left
            }
        }
        PLAY_PAUSE_ID => {
            let points = [
                GdipPoint {
                    X: cx - half / 2,
                    Y: cy - half,
                },
                GdipPoint {
                    X: cx + half,
                    Y: cy,
                },
                GdipPoint {
                    X: cx - half / 2,
                    Y: cy + half,
                },
            ];
            GdipFillPolygonI(
                graphics,
                brush,
                points.as_ptr(),
                points.len() as i32,
                FillModeAlternate,
            )
        }
        NEXT_ID => {
            let points = [
                GdipPoint {
                    X: cx - half / 2,
                    Y: cy - half,
                },
                GdipPoint {
                    X: cx + half / 2,
                    Y: cy,
                },
                GdipPoint {
                    X: cx - half / 2,
                    Y: cy + half,
                },
            ];
            let triangle = GdipFillPolygonI(
                graphics,
                brush,
                points.as_ptr(),
                points.len() as i32,
                FillModeAlternate,
            );
            let bar_status = GdipFillRectangleI(
                graphics,
                brush,
                cx + half - bar - 1,
                cy - half + 1,
                bar,
                2 * half - 2,
            );
            if triangle == GdiPlusOk {
                bar_status
            } else {
                triangle
            }
        }
        _ => GdiPlusOk,
    };
    GdipDeleteBrush(brush);
    GdipDeleteGraphics(graphics);
    status == GdiPlusOk
}

unsafe fn fill_rect(
    hdc: windows::Win32::Graphics::Gdi::HDC,
    rect: RECT,
    brush: windows::Win32::Graphics::Gdi::HBRUSH,
) {
    FillRect(hdc, &rect, brush);
}

fn load_artwork(
    app: AppHandle,
    hwnd: HWND,
    instance_id: u64,
    revision: u64,
    source: String,
    size: u32,
) -> ArtworkTask {
    let hwnd_value = hwnd.0 as usize;
    let cancelled = Arc::new(AtomicBool::new(false));
    let task_cancelled = cancelled.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let artwork = match download_artwork(&source).await {
            Ok(bytes) if !task_cancelled.load(Ordering::Acquire) => {
                let Ok(permit) = ARTWORK_DECODE_GATE.acquire().await else {
                    return;
                };
                if task_cancelled.load(Ordering::Acquire) {
                    return;
                }
                tauri::async_runtime::spawn_blocking(move || {
                    // A running blocking decode cannot be aborted. Keep its slot
                    // until it ends even if the requesting async task is cancelled.
                    let _permit = permit;
                    decode_artwork(bytes, size)
                })
                .await
                .ok()
                .and_then(Result::ok)
            }
            Ok(_) => return,
            Err(error) => {
                log::debug!("Taskbar artwork download skipped: {error}");
                None
            }
        };
        if task_cancelled.load(Ordering::Acquire) {
            return;
        }
        let apply_cancelled = task_cancelled.clone();
        let _ = app.run_on_main_thread(move || unsafe {
            if apply_cancelled.load(Ordering::Acquire) {
                return;
            }
            let hwnd = HWND(hwnd_value as *mut c_void);
            let mut state_ptr = 0;
            if !GetWindowSubclass(
                hwnd,
                Some(host_window_proc),
                HOST_SUBCLASS_ID,
                Some(&mut state_ptr),
            )
            .as_bool()
            {
                return;
            }
            let cover = {
                let state = &mut *(state_ptr as *mut PlayerState);
                if state.instance_id == instance_id && state.artwork_revision == revision {
                    state.artwork = artwork;
                    Some(state.buttons[0])
                } else {
                    None
                }
            };
            if let Some(cover) = cover {
                let _ = InvalidateRect(Some(cover), None, false);
            }
        });
    });
    ArtworkTask { cancelled, handle }
}

async fn download_artwork(source: &str) -> anyhow::Result<Vec<u8>> {
    if source.starts_with("data:") {
        let (metadata, encoded) = source
            .split_once(',')
            .ok_or_else(|| anyhow::anyhow!("invalid data URL"))?;
        anyhow::ensure!(
            metadata.starts_with("data:image/") && metadata.ends_with(";base64"),
            "unsupported data URL"
        );
        anyhow::ensure!(
            encoded.len() <= MAX_ARTWORK_BYTES.saturating_mul(4) / 3 + 8,
            "data URL exceeds artwork limit"
        );
        let bytes = base64::engine::general_purpose::STANDARD.decode(encoded.as_bytes())?;
        anyhow::ensure!(
            bytes.len() <= MAX_ARTWORK_BYTES,
            "decoded artwork exceeds limit"
        );
        return Ok(bytes);
    }

    let url = reqwest::Url::parse(source)?;
    anyhow::ensure!(
        matches!(url.scheme(), "http" | "https"),
        "unsupported artwork scheme"
    );
    let response = artwork_client()?
        .get(url)
        .send()
        .await?
        .error_for_status()?;
    if let Some(length) = response.content_length() {
        anyhow::ensure!(
            length <= MAX_ARTWORK_BYTES as u64,
            "remote artwork exceeds limit"
        );
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        anyhow::ensure!(
            bytes.len().saturating_add(chunk.len()) <= MAX_ARTWORK_BYTES,
            "remote artwork exceeds limit"
        );
        bytes.extend_from_slice(&chunk);
    }
    anyhow::ensure!(!bytes.is_empty(), "empty artwork response");
    Ok(bytes)
}

fn artwork_client() -> anyhow::Result<&'static reqwest::Client> {
    static CLIENT: OnceLock<Option<reqwest::Client>> = OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder()
                .timeout(ARTWORK_TIMEOUT)
                .redirect(reqwest::redirect::Policy::limited(3))
                .build()
                .ok()
        })
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("artwork HTTP client is unavailable"))
}

fn decode_artwork(bytes: Vec<u8>, size: u32) -> anyhow::Result<Artwork> {
    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    unsafe {
        CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
        let _com = ComGuard;
        let factory: IWICImagingFactory =
            CoCreateInstance(&CLSID_WICImagingFactory, None, CLSCTX_INPROC_SERVER)?;
        let stream = factory.CreateStream()?;
        stream.InitializeFromMemory(&bytes)?;
        let decoder = factory.CreateDecoderFromStream(
            &stream,
            std::ptr::null(),
            WICDecodeMetadataCacheOnLoad,
        )?;
        let frame = decoder.GetFrame(0)?;
        let (mut source_width, mut source_height) = (0, 0);
        frame.GetSize(&mut source_width, &mut source_height)?;
        anyhow::ensure!(
            source_width > 0
                && source_height > 0
                && source_width <= MAX_ARTWORK_DIMENSION
                && source_height <= MAX_ARTWORK_DIMENSION
                && (source_width as u64 * source_height as u64) <= MAX_ARTWORK_PIXELS,
            "artwork dimensions exceed limit"
        );
        let scaler = factory.CreateBitmapScaler()?;
        scaler.Initialize(&frame, size, size, WICBitmapInterpolationModeFant)?;
        let converter = factory.CreateFormatConverter()?;
        converter.Initialize(
            &scaler,
            &GUID_WICPixelFormat32bppBGR,
            WICBitmapDitherTypeNone,
            None::<&IWICPalette>,
            0.0,
            WICBitmapPaletteTypeCustom,
        )?;
        let stride = size
            .checked_mul(size_of::<u32>() as u32)
            .ok_or_else(|| anyhow::anyhow!("artwork stride overflow"))?;
        let byte_count = stride
            .checked_mul(size)
            .ok_or_else(|| anyhow::anyhow!("artwork buffer overflow"))?
            as usize;
        let mut pixels = vec![0; byte_count];
        converter.CopyPixels(std::ptr::null(), stride, &mut pixels)?;
        Ok(Artwork {
            width: size,
            height: size,
            pixels,
        })
    }
}

fn button_for_id(state: &PlayerState, id: u16) -> Option<HWND> {
    button_index(id).map(|index| state.buttons[index])
}

fn button_index(id: u16) -> Option<usize> {
    match id {
        COVER_ID => Some(0),
        PREVIOUS_ID => Some(1),
        PLAY_PAUSE_ID => Some(2),
        NEXT_ID => Some(3),
        LIKE_ID => Some(4),
        SHUFFLE_ID => Some(5),
        REPEAT_ID => Some(6),
        _ => None,
    }
}

fn presentation(
    snapshot: Option<&MediaSnapshot>,
    locale: &str,
    options: PlayerOptions,
) -> Presentation {
    let is_playing =
        snapshot.is_some_and(|value| matches!(value.playback_status, PlaybackStatus::Playing));
    Presentation {
        english: locale.eq_ignore_ascii_case("en"),
        is_playing,
        is_liked: snapshot.is_some_and(|value| value.is_liked),
        is_shuffle_active: snapshot.is_some_and(|value| value.is_shuffle_active),
        repeat_mode: snapshot.map_or(RepeatMode::Off, |value| value.repeat_mode),
        enabled: [
            options.layout.contains(TaskbarElement::Cover),
            options.layout.contains(TaskbarElement::Previous)
                && snapshot.is_some_and(|value| value.has_session && value.can_go_previous),
            options.layout.contains(TaskbarElement::Transport)
                && snapshot.is_some_and(|value| {
                    value.has_session
                        && if is_playing {
                            value.can_pause
                        } else {
                            value.can_play
                        }
                }),
            options.layout.contains(TaskbarElement::Next)
                && snapshot.is_some_and(|value| value.has_session && value.can_go_next),
            options.layout.contains(TaskbarElement::Like)
                && snapshot.is_some_and(|value| value.has_session && value.can_like),
            options.layout.contains(TaskbarElement::Shuffle)
                && snapshot.is_some_and(|value| value.has_session && value.can_shuffle),
            options.layout.contains(TaskbarElement::Repeat)
                && snapshot.is_some_and(|value| value.has_session && value.can_repeat),
        ],
    }
}

fn accessible_names(value: Presentation) -> [&'static str; CONTROL_COUNT] {
    if value.english {
        [
            "Open Music Island",
            "Previous track",
            if value.is_playing { "Pause" } else { "Play" },
            "Next track",
            if value.is_liked {
                "Remove from favorites"
            } else {
                "Add to favorites"
            },
            if value.is_shuffle_active {
                "Turn shuffle off"
            } else {
                "Turn shuffle on"
            },
            match value.repeat_mode {
                RepeatMode::Off => "Turn repeat on",
                RepeatMode::All => "Repeat one track",
                RepeatMode::One => "Turn repeat off",
            },
        ]
    } else {
        [
            "Открыть музыкальный островок",
            "Предыдущий трек",
            if value.is_playing {
                "Пауза"
            } else {
                "Воспроизвести"
            },
            "Следующий трек",
            if value.is_liked {
                "Убрать из любимого"
            } else {
                "Добавить в любимое"
            },
            if value.is_shuffle_active {
                "Выключить перемешивание"
            } else {
                "Включить перемешивание"
            },
            match value.repeat_mode {
                RepeatMode::Off => "Включить повтор",
                RepeatMode::All => "Повторять один трек",
                RepeatMode::One => "Выключить повтор",
            },
        ]
    }
}

fn scale(value: i32, dpi: u32) -> i32 {
    ((value as i64 * normalize_dpi(dpi) as i64 + 48) / 96) as i32
}

fn scale_with_options(value: i32, dpi: u32, options: PlayerOptions) -> i32 {
    scale(scale_factor(value, options.normalized().scale), dpi)
}

fn scale_factor(value: i32, factor: f64) -> i32 {
    (f64::from(value) * factor).round() as i32
}

fn normalize_dpi(dpi: u32) -> u32 {
    if dpi == 0 {
        96
    } else {
        dpi
    }
}

fn initialize_gdiplus() {
    let token = *GDIPLUS_TOKEN.get_or_init(|| unsafe {
        let mut token = 0;
        let input = GdiplusStartupInput {
            GdiplusVersion: 1,
            SuppressExternalCodecs: BOOL(1),
            ..Default::default()
        };
        if GdiplusStartup(&mut token, &input, std::ptr::null_mut()) == GdiPlusOk {
            token
        } else {
            0
        }
    });
    GDIPLUS_READY.store(token != 0, Ordering::Release);
}

fn argb(color: COLORREF) -> u32 {
    let red = color.0 & 0xff;
    let green = (color.0 >> 8) & 0xff;
    let blue = (color.0 >> 16) & 0xff;
    0xff00_0000 | (red << 16) | (green << 8) | blue
}

fn log_input_once(flag: &'static AtomicBool, message: &'static str) {
    if !flag.swap(true, Ordering::AcqRel) {
        tauri::async_runtime::spawn_blocking(move || crate::logging::append_event(message));
    }
}

fn rgb(red: u8, green: u8, blue: u8) -> COLORREF {
    COLORREF(red as u32 | ((green as u32) << 8) | ((blue as u32) << 16))
}

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn options_bound_scale_and_width_tracks_the_ordered_layout() {
        assert_eq!(logical_width(PlayerOptions::default()), 144);
        let with_like = TaskbarLayout::from_config(
            Some(
                &serde_json::json!({ "version": 1, "elements": ["cover", "previous", "transport", "next", "like"] }),
            ),
            false,
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: 1.0,
                layout: with_like,
            }),
            176
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: 99.0,
                layout: TaskbarLayout::default(),
            }),
            180
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: f64::NAN,
                layout: TaskbarLayout::default(),
            }),
            144
        );
    }

    #[test]
    fn layout_normalizes_config_order_duplicates_and_required_transport() {
        let layout = TaskbarLayout::from_config(
            Some(&serde_json::json!({
                "version": 1,
                "elements": ["repeat", "cover", "repeat", "unknown", "shuffle"]
            })),
            false,
        );
        assert_eq!(
            layout.iter().collect::<Vec<_>>(),
            vec![
                TaskbarElement::Repeat,
                TaskbarElement::Cover,
                TaskbarElement::Shuffle,
                TaskbarElement::Transport,
            ]
        );
        assert_eq!(logical_width(PlayerOptions { scale: 1.0, layout }), 144);

        let transport_only = TaskbarLayout::from_config(
            Some(&serde_json::json!({ "version": 1, "elements": [] })),
            true,
        );
        assert_eq!(
            transport_only.iter().collect::<Vec<_>>(),
            vec![TaskbarElement::Transport]
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: 1.0,
                layout: transport_only
            }),
            44
        );

        let cover_last = TaskbarLayout::from_config(
            Some(&serde_json::json!({ "version": 1, "elements": ["transport", "cover"] })),
            false,
        );
        let cover_first = TaskbarLayout::from_config(
            Some(&serde_json::json!({ "version": 1, "elements": ["cover", "transport"] })),
            false,
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: 1.0,
                layout: cover_last
            }),
            76
        );
        assert_eq!(
            logical_width(PlayerOptions {
                scale: 1.0,
                layout: cover_first
            }),
            80
        );
    }

    #[test]
    fn main_navigation_uses_the_reference_viewbox_and_mirrors_exact_endpoints() {
        let space = LucideSpace::new(50, 30, 16);
        let top_left = space.point((0.0, 0.0));
        let bottom_right = space.point((24.0, 24.0));
        assert_eq!(top_left, (42.0, 22.0));
        assert_eq!(bottom_right, (58.0, 38.0));
        assert_eq!(mirror_lucide_x(6.0, true), 6.0);
        assert_eq!(mirror_lucide_x(6.0, false), 18.0);
        assert_eq!(mirror_lucide_x(18.0, false), 6.0);
        assert_eq!(mirror_lucide_x(17.0, false), 7.0);
    }

    #[test]
    fn timeline_only_updates_do_not_change_the_native_presentation() {
        let mut snapshot = MediaSnapshot::no_session();
        snapshot.has_session = true;
        snapshot.can_play = true;
        snapshot.can_go_next = true;
        let before = presentation(Some(&snapshot), "ru", PlayerOptions::default());

        snapshot.position_ms = Some(42_000);
        snapshot.duration_ms = Some(180_000);
        snapshot.updated_at = "later".into();

        assert_eq!(
            presentation(Some(&snapshot), "ru", PlayerOptions::default()),
            before
        );
    }

    #[test]
    fn presentation_disables_every_hidden_control_even_when_provider_supports_it() {
        let mut snapshot = MediaSnapshot::no_session();
        snapshot.has_session = true;
        snapshot.can_play = true;
        snapshot.can_go_previous = true;
        snapshot.can_go_next = true;
        snapshot.can_like = true;
        snapshot.can_shuffle = true;
        snapshot.can_repeat = true;
        let layout = TaskbarLayout::from_config(
            Some(&serde_json::json!({ "version": 1, "elements": ["transport"] })),
            false,
        );

        assert_eq!(
            presentation(Some(&snapshot), "ru", PlayerOptions { scale: 1.0, layout }).enabled,
            [false, false, true, false, false, false, false]
        );
    }

    #[test]
    fn presentation_tracks_transport_locale_and_optional_like_state() {
        let mut snapshot = MediaSnapshot::no_session();
        snapshot.has_session = true;
        snapshot.playback_status = PlaybackStatus::Playing;
        snapshot.can_pause = true;
        snapshot.can_like = true;
        snapshot.is_liked = true;
        snapshot.can_shuffle = true;
        snapshot.is_shuffle_active = true;
        snapshot.can_repeat = true;
        snapshot.repeat_mode = RepeatMode::One;
        let options = PlayerOptions {
            scale: 1.0,
            layout: TaskbarLayout::from_config(
                Some(
                    &serde_json::json!({ "version": 1, "elements": ["cover", "transport", "like", "shuffle", "repeat"] }),
                ),
                false,
            ),
        };

        let value = presentation(Some(&snapshot), "en", options);
        assert!(value.english);
        assert!(value.is_playing);
        assert!(value.is_liked);
        assert!(value.enabled[2]);
        assert!(value.enabled[4]);
        assert!(value.enabled[5]);
        assert!(value.enabled[6]);
        assert_eq!(accessible_names(value)[2], "Pause");
        assert_eq!(accessible_names(value)[4], "Remove from favorites");
        assert_eq!(accessible_names(value)[5], "Turn shuffle off");
        assert_eq!(accessible_names(value)[6], "Turn repeat off");

        assert_ne!(value, presentation(Some(&snapshot), "ru", options));
        assert_ne!(
            value,
            presentation(Some(&snapshot), "en", PlayerOptions::default())
        );
    }
}
