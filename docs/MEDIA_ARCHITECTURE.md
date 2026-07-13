# Media architecture

Music Island has two media providers:

- **Windows SMTC** is the universal default and fallback.
- **Yandex Direct** is an explicit opt-in controller for the already running Yandex Music Desktop client. It does not stream audio or create another playback session.

Both providers produce the same `MediaSnapshot` and accept the same `MediaCommand` enum. Provider-specific behavior stays in Rust; React renders controls from capabilities such as `canSeek`, `canLike` and `canDislike`.

## Patterns adopted from Zen Browser

Reference: [ZenMediaController.mjs](https://github.com/zen-browser/desktop/blob/stable/src/zen/media/ZenMediaController.mjs).

Zen controls Firefox browsing contexts, so its backend cannot be reused outside Firefox. The transferable parts are:

- a session list with stable source selection instead of trusting only the platform's momentary “current” session;
- keeping the playing/previously selected source during short advertisements and transient sessions;
- controls driven by reported capabilities;
- local progress interpolation between low-frequency backend updates;
- no source switch while the user is scrubbing;
- restrained hover disclosure and artwork fallback.

Music Island implements these ideas through `GetSessions()` arbitration, a preferred source setting, capability flags in `MediaSnapshot`, the playback clock, and a latest-wins seek path.

Not adopted:

- Firefox tab focus, PiP and WebRTC internals;
- Zen's pause-then-play seek workaround;
- permanent marquee animation, because it creates avoidable rendering work.

## SMTC performance and health

- Lightweight playback/timeline probes run at up to 2 Hz.
- Metadata is read every fourth active probe.
- Thumbnail bytes are read only when the source/track key changes.
- A failed probe changes health from `healthy` to `degraded`; two consecutive failures produce `unavailable`.
- Degraded polling backs off to 5 seconds. Unavailable polling backs off to 15 seconds.
- `0x80010002`, timeouts and probe latency are included in local diagnostics.

SMTC seek audio spikes remain a player/protocol limitation. Music Island sends one latest-wins seek and does not hide the issue with pause/play sequences.

## Direct provider lifecycle

1. The user confirms the first connection in Settings.
2. Music Island closes the installed desktop client and reserves a random loopback port.
3. The client starts with `--remote-debugging-address=127.0.0.1` and `--remote-debugging-port=<port>`.
4. Rust reads the CDP target list using `Content-Length` instead of waiting for Chromium's keep-alive connection to close.
5. The adapter validates the `music-application://` renderer and waits until player controls are present.
6. State is normalized into the regular media snapshot. Commands are evaluated from fixed Rust-owned expressions.
7. Returning to SMTC restarts the desktop client without debugging flags.

The 0.9 adapter supports metadata, artwork, playback state, previous/next, seek, like/dislike capabilities and pressed states. Reaction controls remain available while the desktop client is still initializing timeline duration.

## UI and window interaction

The native Rust gesture watcher samples cursor/window geometry and emits state changes only when needed. The frontend no longer performs high-frequency Tauri IPC from `requestAnimationFrame`.

Expanded action buttons live inside the transformed hit-test box. This matters on WebView2: descendants can be painted outside a transformed parent while still losing pointer hit-testing. Release diagnostics verify both button centers with `document.elementFromPoint`, physical hover and click.
