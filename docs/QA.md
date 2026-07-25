# QA Checklist

## Operating Systems

- Windows 11: primary target.
- Windows 10: best effort with WebView2 and SMTC support.

## Media Sources

- Spotify desktop app.
- Browser players in Chrome or Edge.
- VLC or other desktop apps as universal SMTC sanity checks.
- SMTC seek: compare one timeline release with the Windows Win+A media flyout. An identical click/spike is a player/SMTC buffering limitation; do not add repeated or compensating seeks.

## Window Behavior

- Hover opens the island.
- Auto-collapse works after mouse leave.
- Pin keeps the island expanded.
- Settings and pin controls receive hover/clicks after restart.
- Tray settings, update-check and quit actions work.
- Reset Position in Settings restores top-center placement.
- DPI scaling: 100%, 125%, 150%.
- Expanded content never mounts before native expanded bounds are acknowledged.
- Reveal uses a smooth ease-out path with no clipped first frame.
- Multi-monitor: primary monitor switch and disconnected monitor recovery.

## Portable release

- Starts without a Vite development server.
- Replacing the executable preserves app-data settings.
- Unsigned SmartScreen warning is documented.

## Direct Yandex

- Consent dialog is centered and can be dismissed.
- Existing validated debug endpoint reattaches without changing Yandex Music process IDs.
- Explicit first connection restarts with a random loopback-only debug port only when no endpoint exists.
- Status reaches connected and remains usable during playback changes.
- Metadata, artwork, play/pause, previous/next and seek work.
- Like/dislike capabilities and pressed states match the desktop client.
- Returning to SMTC restarts the desktop client without debug flags.
- Broken SMTC does not change Direct overlay state or receive Direct-path commands.
- Paused Play resumes the same track and never starts My Wave from an unrelated page control.
- Pausing does not add an `Unknown artist` prefix.
- Provider switch and terminal Direct loss clear stale track and selection state.
- Active My Wave selection label matches `RESET_VIBE_CONTEXT_BUTTON`.
- Wheel selection updates Yandex and confirms within one full Direct snapshot.
- Selection chip X invokes the native reset and returns to default My Wave.
- Album/playlist and SMTC states hide the wheel and selection chip.

## Settings preview

- Header contains the settings title plus Ru/En locale toggle on the right; no subtitle, version eyebrow or decorative background blobs.
- Sections and actions use the same borderless translucent-white glass language as the overlay.
- Minimize reaches the taskbar; Close hides; tray/gear reopens the same settings state.
- Title-bar action hit targets never become drag regions.

## Wave wheel performance

- Wheel and pointer drag both move the focused item; release snaps deterministically.
- Focused item is leftmost/largest; neighbors shift right, shrink and fade inside the overlay height.
- At most nine wheel items are mounted.
- Idle wheel runs no animation frame loop.
- Reduced motion disables snap animation.

## Performance

- Collapsed idle CPU ≤1%.
- Expanded Direct playback CPU ≤4%.
- Hover latency.
- Memory after 30-60 minutes.
- Rapid track changes.
- 10-switch Direct run: one discovery/WebSocket, command RPC p95 <100 ms, overlay update ≤1 second.
- Threads/handles remain stable while an SMTC worker is timed out.
- Added idle wheel CPU ≤0.05%; continuous 10-second wheel drag CPU ≤0.3%.

## Accessibility

- Reduced motion.
- Text truncation.
- Keyboard focus in settings.
- Contrast in dark and light themes.
