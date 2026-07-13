# Performance budget

Music Island 0.9 limits media work by design:

- active timeline IPC: at most 2 updates/second;
- idle SMTC polling: once every 2 seconds;
- degraded SMTC polling: once every 5 seconds;
- unavailable SMTC recovery probe: once every 15 seconds;
- metadata: at most once every 2 seconds while active;
- artwork: one read per source/track key;
- UI progress: interpolated locally, with no backend request per animation frame.

## Verification scenarios

Use Task Manager or Windows Performance Recorder with the release executable:

1. idle with no media for 60 seconds;
2. steady playback for 60 seconds;
3. ten track skips;
4. artwork change;
5. deliberately unavailable SMTC broker;
6. Yandex Direct connected and disconnected.

Record average CPU, peak CPU, working set, `media:update`/`timeline:update` rate and metadata/artwork reads. The expected behavior is near-zero idle CPU, no continuous thumbnail decoding, and automatic backoff when the broker fails.

Exact machine-dependent CPU numbers are intentionally not fabricated in this document. They must be captured on the tester's release build and hardware.

## 0.9 implementation

- Blocking WinRT calls run outside the async runtime and have explicit timeouts.
- Metadata is sampled less often than timeline state; artwork is cached by track/source key.
- SMTC health changes polling from active to idle, degraded and unavailable intervals.
- Cursor gesture detection runs natively and emits only state changes instead of making high-frequency frontend IPC calls.
- React interpolates playback progress from the latest snapshot.
- Direct Yandex uses loopback HTTP/WebSocket requests with bounded response and RPC timeouts.
- Animations favor `transform`, `opacity` and CSS variables over layout-heavy properties.

## Local verification

Release builds are produced through `tauri build --no-bundle`, which embeds frontend assets and does not depend on the Vite development server.

The 0.9 acceptance run verified:

- all 17 frontend tests and all direct-provider Rust tests;
- SMTC health/backoff and multi-session logic through unit and smoke coverage;
- a live Yandex Music 5.110.1 CDP connection;
- direct metadata/capabilities and a like toggle/restore round trip;
- native button hit-testing, physical hover/click and centered consent-dialog geometry.

CPU and memory vary by WebView2, GPU, source player and Windows state. Long-duration measurements should still follow the scenarios above rather than treating one machine's short sample as a universal number.

## Diagnostics

Copy Diagnostics includes app/config information, current media provider, SMTC health and direct-provider status. Local runtime events are stored in `%APPDATA%\Music Island\logs\app.log`.
