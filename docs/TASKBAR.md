# Taskbar mini-player

Enable **Settings → Taskbar → Taskbar mini-player**. The preference is off by default. The top island remains available.

At the default scale the default player is **144 × 40 logical pixels**, with 14–16 px symbols and a 28 px cover. Settings offers independent 75–125% scaling and a visual editor for the ordered row. Cover, Previous, Next, Like, Shuffle and Repeat are optional; Play/Pause is required. The default remains Cover, Previous, Play/Pause, Next. The saved v1 layout lives in `plugins.settings.ui.taskbarLayout`; older `showLike` settings migrate without losing Like.

Each control occupies 32 logical pixels. The row keeps 4 px on the left and 8 px on the right, plus a 4 px gap after Cover when another control follows it. The resulting base width is `12 + 32 × controls + coverGap`, then taskbar scale and Windows DPI are applied once. The cover reveals the top island for at least three seconds, or until the pointer reaches it; it does not open Settings. Transport uses the same authoritative SMTC or explicitly connected Direct provider as the top island; unavailable commands are disabled. Shuffle and Repeat are capability-gated, show their current state, and Repeat distinguishes all tracks from one track.

## Native architecture

The taskbar player no longer uses a Tauri WebView. It is one same-process layered Win32 child of the primary horizontal `Shell_TrayWnd`, built from a `STATIC` host and seven owner-drawn `BUTTON` controls. The normalized layout controls their visibility and position while the HWND set remains stable. The Windows supportedOS manifest is required for the layered child. Windows dispatches pointer input directly to Music Island's HWNDs, avoiding the cross-process WebView2 child hierarchy that rendered correctly but did not receive taskbar input reliably.

Artwork is decoded with Windows Imaging Component away from the window thread and cached. Painting and pointer handling do not start a browser process. Only visual media changes invalidate the cached presentation; unchanged timeline snapshots do not repaint controls. Painting is buffered, child positioning is batched, and already visible reanchors do not repeat show or z-order operations. Button actions route to the existing native media watcher. The surface has no progress display, so timeline IPC and the one-second progress timer stay disabled.

The player sits immediately before the notification area with a **16 logical pixel gap**. Placement uses taskbar-client coordinates and applies Windows scaling once. Explorer owns movement and clipping during taskbar motion. Music Island never injects code into Explorer and never resizes or reparents Explorer-owned windows.

Placement reserves Start, Widgets, app buttons, notification controls and unknown occupied UI Automation elements. The native fast path may be used only in confirmed free space; it is forbidden inside a complete app host whose child buttons were not inspected. If no collision-safe interval for the current dynamic width exists, the player stays hidden and retries discovery. Explorer replacement, DPI or taskbar layout changes invalidate the cached placement.

The window is created only while the setting is enabled and is destroyed when disabled. Taskbar placement and input remain separate from the top island's window bounds and hit testing.

## Component review

`Organisms / TaskbarPlayer` in Storybook documents the React-era presentation reference and its media states. Native taskbar behavior must be checked in the built Windows application because browser preview cannot verify HWND input, Explorer clipping, DPI or media commands. `Screens / Settings / Taskbar` checks the persisted preference without changing Explorer.

## Verification

The native tests cover collision policy, stable placement, Explorer/DPI invalidation, same-process control routing, cached artwork, tray growth/shrink reanchoring, scaling and unchanged-snapshot presentation behavior. Read-only probes may inspect taskbar geometry without moving or clicking Explorer.

Interactive acceptance must capture evidence for:

- hover and clicks for every configured control, including active Shuffle and Repeat states;
- SMTC and explicitly connected Direct routing, including disabled capabilities;
- enable/disable and restart persistence;
- 100%, 125% and 150% scaling;
- auto-hide, tray overflow, fullscreen, Explorer restart and a nearly full taskbar;
- absence of flashing, browser subprocesses and unnecessary timeline work.

Do not ask the user to repeat the same manual cycle. The development pass should capture the running HWND hierarchy, input counters and visible result itself, then ask only for a final judgment when needed.

### Current verification state

The previous WebView implementation rendered inside the taskbar but did not receive hover or clicks. It has been replaced by the same-process Win32 control described above.

Visibility, hover and real native clicks have been confirmed on an actual Windows 11 taskbar with the supportedOS manifest and layered child enabled. The current renderer uses compact symbols, buffered paint, batched child positioning and snapshot diffs to avoid redraw churn. Fullscreen occlusion or an auto-hidden taskbar must not be counted as visible flicker. Non-default DPI, auto-hide and Explorer restart remain release acceptance scenarios rather than assumptions derived from offscreen geometry tests.

## References

- [Microsoft: About Window Classes](https://learn.microsoft.com/en-us/windows/win32/winmsg/about-window-classes)
- [Microsoft: Button control](https://learn.microsoft.com/en-us/windows/win32/controls/buttons)
- [Microsoft: Using Windows Imaging Component](https://learn.microsoft.com/en-us/windows/win32/wic/-wic-about-windows-imaging-codec)
- [Microsoft: Child windows](https://learn.microsoft.com/en-us/windows/win32/winmsg/window-features#child-windows)
- [FluentFlyout taskbar window](https://github.com/unchihugo/FluentFlyout/blob/master/FluentFlyoutWPF/Windows/TaskbarWindow.xaml.cs), used as a behavioral reference for a same-process native child; Music Island's implementation is independent.
