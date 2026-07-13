# Changelog

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
