# QA Checklist

## Operating Systems

- Windows 11: primary target.
- Windows 10: best effort with WebView2 and SMTC support.

## Media Sources

- Spotify desktop app.
- Browser players in Chrome or Edge.
- VLC or other desktop apps as universal SMTC sanity checks.

## Window Behavior

- Hover opens the island.
- Auto-collapse works after mouse leave.
- Pin keeps the island expanded.
- Settings and pin controls receive hover/clicks after restart.
- Tray settings, update-check and quit actions work.
- Reset Position in Settings restores top-center placement.
- DPI scaling: 100%, 125%, 150%.
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

## Performance

- Collapsed idle CPU ≤1%.
- Expanded Direct playback CPU ≤4%.
- Hover latency.
- Memory after 30-60 minutes.
- Rapid track changes.
- 10-switch Direct run: one discovery/WebSocket, command RPC p95 <100 ms, overlay update ≤1 second.
- Threads/handles remain stable while an SMTC worker is timed out.

## Accessibility

- Reduced motion.
- Text truncation.
- Keyboard focus in settings.
- Contrast in dark and light themes.
