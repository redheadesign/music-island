# Performance budget

Music Island keeps a low-frequency native media path. UI-only work (locale, Settings copy, accent) must stay off that path.

## Media / overlay

- Active Direct timeline IPC: about 1 compact update/second
- Idle SMTC polling: once every 2 seconds
- Degraded SMTC polling: once every 5 seconds
- Unavailable SMTC recovery probe: once every 15 seconds
- Metadata: at most once every 2 seconds while active
- Artwork: one read per source/track key
- Passive SMTC health while Direct is active: once every 30 seconds, single-flight
- UI progress: interpolated locally at 1 Hz (no backend request per animation frame)
- Native cursor gesture watcher: ~100 ms idle / ~33 ms while the edge gesture is active; emits state changes only (not continuous frontend IPC)
- Wave catalog carousel remains disabled and must not be polled until re-enabled as an optional Settings feature

## Better Voice (when running)

- Realtime audio thread sleeps are expected (capture/DSP/render)
- Settings meters: ~250 ms stats poll + spectrum `requestAnimationFrame` only while the BV panel is mounted and the engine is running — must stop on unmount / leaving the tab
- Do not start unused BGM stub threads in shipping builds

## Verification scenarios

Use Task Manager or Windows Performance Recorder with the release executable:

1. Idle with no media for 60 seconds
2. Steady playback for 60 seconds
3. Ten track skips
4. Artwork change
5. Deliberately unavailable SMTC broker
6. Yandex Direct connected and disconnected
7. Better Voice Start for 60 seconds with Settings open on the BV tab, then leave the tab

Expected: near-zero idle CPU without voice; no continuous thumbnail decoding; automatic SMTC backoff when the broker fails; voice meters not spinning after leaving Settings.

## Implementation notes

- Blocking WinRT calls run outside the async runtime with timeouts
- Cursor gestures are native; frontend reacts to events
- Direct Yandex uses one persistent loopback WebSocket
- Settings has no media subscription or progress clock when `mediaEnabled: false`
- Timeline events omit metadata/artwork on every tick

## Diagnostics

Copy Diagnostics includes app/config information, media provider, health/status and counters. Local runtime events: `%APPDATA%\Music Island\logs\app.log`.
