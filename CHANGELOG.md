# Changelog

## 0.9.1 — 2026-07-13

### Provider reliability

- Made the configured provider authoritative for snapshots and commands. A Direct failure no longer falls back to SMTC or displays the SMTC-unavailable banner.
- Kept inactive SMTC checks as rare health-only probes which cannot emit playback state.
- Added single-flight WinRT protection so a timed-out SMTC worker cannot create an accumulating thread/handle storm.

### Direct Yandex

- Replaced per-request discovery/WebSocket setup with one serialized persistent CDP actor.
- Added bounded reconnect, increasing request IDs, compact timeline events and immediate commands through the open socket.
- Reattach to a validated running Yandex Music process/loopback endpoint on startup; client restart now requires an explicit Settings action.
- Persisted the last Direct port as a hint and reject non-Yandex targets or non-loopback WebSocket endpoints.

### Performance and UI

- Removed media/timeline subscriptions and the progress clock from the Settings WebView.
- Reduced the progress clock to 1 Hz, moved artwork color interpolation to CSS and deduplicated native bounds work.
- Stopped global cursor-coordinate events while the pointer is outside the overlay and made native gesture polling adaptive.
- Stabilized SMTC source-list refreshes with debounce, single-flight and equality checks.
- Fixed reaction order to dislike — timeline — like.
- Added runtime counters and `scripts/profile-hotfix.mjs` for provider, CDP, event, bounds and resource acceptance.

### Acceptance

- Expanded Direct playback averaged 0.12% Task Manager CPU on the 8-logical-core test machine (0.94% of one core), below the 4% budget.
- A 60-second expanded run stayed stable at 20–25 threads and 463–469 handles; the 0.9.0 baseline grew from 316 to 1414 threads and 1328 to 5111 handles in 30 seconds.
- Ten Direct track switches used one discovery and one WebSocket. CDP RPC max was 35 ms; overlay updates averaged 911 ms with p95 933 ms.
- The same live run had zero SMTC media probes while Direct was active; the isolated 30-second passive health probe remained single-flight.

## 0.9.0 — 2026-07-13

Music Island 0.9 moves the alpha toward a stable beta while deliberately keeping the project below 1.0.

### Media core

- Added SMTC health states (`healthy`, `degraded`, `unavailable`), probe latency/failure diagnostics and automatic polling backoff.
- Moved blocking WinRT probes off the async runtime and bounded them with timeouts.
- Reduced metadata/artwork work during timeline updates and cached artwork by source/track.
- Added multi-session enumeration, playing/current-session arbitration and a preferred-source setting.
- Kept the latest valid session through transient track-change gaps.
- Coalesced rapid seek requests so only the newest position is applied.

### Direct Yandex Music beta

- Added explicit opt-in local control of the installed Yandex Music Desktop client through a random loopback-only CDP endpoint.
- Added renderer discovery, readiness validation, bounded HTTP/WebSocket operations and useful local errors.
- Added play/pause, previous/next, seek, artwork, timeline and capability synchronization.
- Added like/dislike controls with pressed-state synchronization.
- Added safe return to Windows SMTC, including a normal desktop-client restart.

### Settings and overlay

- Rebuilt Settings as a compact glass interface with live width, scale and hover-delay controls.
- Added protocol rows for Windows SMTC and Direct Yandex with current status and health.
- Added a centered first-connect consent dialog.
- Fixed settings/pin hover and clicks by keeping action controls inside WebView2's transformed hit-test box.
- Fixed persisted pinned interaction and native click-through restoration.
- Moved collapsed gesture tracking to the native window layer to avoid continuous frontend IPC.
- Removed Show/Hide and Reset Position from the tray menu; left settings, update check and quit.

### Diagnostics and release

- Added local direct-provider and SMTC health diagnostics.
- Added architecture, media-provider, Yandex integration and performance documentation.
- Added live CDP/hit-test acceptance scripts used against the portable build.
- Release distribution is a single unsigned portable `music-island.exe`.

### Known limitation

- Seeking through Windows SMTC can still produce an audio click or rebuffer in the source player. This is tracked as a protocol/player limitation; Direct Yandex bypasses that path only for Yandex Music Desktop.

## 0.8.1 — 2026-07-08

- Held the previous media session across short SMTC gaps to reduce “No music playing” flashes.
- Documented SMTC seek limitations and shipped the Windows executable release.

## 0.8.0 — 2026-07-08

- First private alpha release.
