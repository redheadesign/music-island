# Yandex Music integration options

Status reviewed for Music Island 0.9 (July 2026).

## Chosen path: local CDP control

Yandex Music Desktop is an Electron application. Music Island can restart the installed client with:

```text
--remote-debugging-address=127.0.0.1 --remote-debugging-port=<random-port>
```

It discovers only a local Yandex Music renderer target and executes a fixed Rust-side command set: state, play/pause, previous, next, seek, like and dislike. The existing desktop client remains responsible for login, playback, recommendations and audio.

The first restart requires an explicit confirmation in Settings. The endpoint uses a random loopback port, is never exposed to LAN, and cookies/tokens or arbitrary frontend JavaScript are not logged or accepted. Returning to Windows SMTC closes the debug-enabled client and launches it normally.

The adapter uses stable `data-test-id` controls where available and falls back to SMTC when the player surface is incompatible. It reads Chromium discovery responses by their declared `Content-Length` because the endpoint keeps HTTP connections alive. Client updates can still break this experimental path.

## Alternatives

### Windows SMTC/GSMTC

Universal, account-free and supported by many players. It is the default and fallback. Windows owns the broker, so Music Island cannot repair a hung broker. Known failure signals include timeouts and `RPC_E_CALL_REJECTED` (`0x80010002`).

### KM.Yandex.Music.Api

[KM.Yandex.Music.Api](https://yandexmusicapicsharp.readthedocs.io/ru/stable/) is an unofficial C# wrapper around account/catalog endpoints. It is useful for search, playlists, likes and metadata, but it does not control the exact local desktop renderer with low latency. Music Island is Rust/Tauri, so adding this package would also introduce a .NET runtime boundary. It is not used.

### Ynison

Ynison is an internal cross-device state and remote-control protocol. Community clients demonstrate that cloud synchronization is possible, but it is undocumented, authentication-sensitive and can change without notice. It may control an account/device session rather than guarantee immediate control of the local Electron renderer. It is documented but not enabled in 0.9.

### Public catalog/web API

Catalog APIs are appropriate for metadata and library operations, not for controlling a running desktop process. They would require OAuth/token handling and create unnecessary account and Terms-of-Service risk for the core controller.

## Capability matrix

- SMTC: metadata, playback state, timeline, play/pause, next/previous, seek; broad compatibility.
- Local CDP: core playback controls plus like/dislike state with lower local latency for Yandex Music Desktop; experimental/version-dependent.
- Catalog API: search, playlists, likes and metadata; no direct local renderer control.
- Ynison: cloud device/session synchronization; internal and unstable.

## Recovery

If direct discovery, target validation or a command fails, Music Island reports the error and continues through SMTC. It does not enter a restart loop. The user can retry direct connection or return permanently to SMTC from Settings.
