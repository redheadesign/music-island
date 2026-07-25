# Performance budget

Music Island 0.9.8 keeps the 0.9.1 performance model. Locale switching and Settings copy are frontend-only and must stay off the media path. UI-only work from 0.9.5+ also stays off that path:

- active Direct timeline IPC: about 1 compact update/second;
- idle SMTC polling: once every 2 seconds;
- degraded SMTC polling: once every 5 seconds;
- unavailable SMTC recovery probe: once every 15 seconds;
- metadata: at most once every 2 seconds while active;
- artwork: one read per source/track key;
- passive SMTC health while Direct is active: once every 30 seconds, single-flight and never emitted as media;
- UI progress: interpolated locally at 1 Hz, with no backend request per animation frame.
- Active My Wave selection metadata piggybacks on the Direct snapshot. The preset catalog / wheel carousel is disabled in 0.9.5 and must not be polled until re-enabled as an optional Settings feature.
- the wave wheel renders at most nine items, performs no idle animation and coalesces drag style writes into one `requestAnimationFrame`.

## Verification scenarios

Use Task Manager or Windows Performance Recorder with the release executable:

1. idle with no media for 60 seconds;
2. steady playback for 60 seconds;
3. ten track skips;
4. artwork change;
5. deliberately unavailable SMTC broker;
6. Yandex Direct connected and disconnected.
7. expanded Direct wheel idle for 60 seconds and continuously dragged for 10 seconds.

Record average CPU, peak CPU, working set, `media:update`/`timeline:update` rate and metadata/artwork reads. The expected behavior is near-zero idle CPU, no continuous thumbnail decoding, and automatic backoff when the broker fails.

Preview budgets:

- static wheel CPU delta: no more than 0.05%;
- continuous wheel drag CPU delta: no more than 0.3%;
- no residual animation frames or GPU growth after pointer release;
- preset selection emits one Direct command after click/Enter, never one command per scroll tick.

## 0.9.1 implementation

- Blocking WinRT calls run outside the async runtime and have explicit timeouts.
- Metadata is sampled less often than timeline state; artwork is cached by track/source key.
- SMTC health changes polling from active to idle, degraded and unavailable intervals.
- Cursor gesture detection runs natively and emits only state changes instead of making high-frequency frontend IPC calls.
- React interpolates playback progress from the latest snapshot.
- Direct Yandex uses one persistent loopback WebSocket; HTTP discovery happens only on connect/reconnect.
- All SMTC probes and session listings share one in-flight guard. A timed-out WinRT worker blocks replacement workers until it actually exits.
- Settings has no media subscription or progress clock. Its source list uses debounce, in-flight dedupe, equality checks and retains the last non-empty result.
- Timeline events contain only position, duration, playback state, timestamp and provider; metadata/artwork are not serialized every second.
- Animations favor `transform`, `opacity` and CSS variables over layout-heavy properties.

## Local verification

Release builds are produced through `tauri build --no-bundle`, which embeds frontend assets and does not depend on the Vite development server.

The 0.9.1 acceptance run verified:

- all 17 frontend tests and all direct-provider Rust tests;
- SMTC health/backoff and multi-session logic through unit and smoke coverage;
- a live Yandex Music 5.110.1 CDP connection;
- direct metadata/capabilities and a like toggle/restore round trip;
- native button hit-testing, physical hover/click and centered consent-dialog geometry.
- persistent CDP reuse: 10 switches, 1 discovery, 1 WebSocket, 0 reconnects, RPC max 35 ms;
- overlay track update: 911 ms average, 933 ms p95 across 10 switches;
- collapsed idle: 0.14% Task Manager CPU over 60 seconds;
- expanded Direct playback: 0.12% Task Manager CPU over 60 seconds;
- stable resources during expanded playback: 20–25 threads and 463–469 handles;
- active Direct isolation: 0 SMTC media probes, with one separate passive health worker after 30 seconds.

Measurements were captured on an 8-logical-core Windows test machine. CPU and memory vary by WebView2, GPU, source player and Windows state, so repeat the scenarios above on target hardware.

## Diagnostics

Copy Diagnostics includes app/config information, current media provider, independent health/status and counters for media polls/events, SMTC in-flight work, CDP discovery/connections/RTT, gesture events and native bounds sync. Local runtime events are stored in `%APPDATA%\Music Island\logs\app.log`.
