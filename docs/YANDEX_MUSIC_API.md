# Yandex Music integration options

Status reviewed for v0.9.6 (July 2026).

## Chosen path: local CDP control

Yandex Music Desktop is an Electron application. Music Island can reattach to an already running validated debug endpoint. If no endpoint exists, an explicit user action can restart the installed client with:

```text
--remote-debugging-address=127.0.0.1 --remote-debugging-port=<random-port>
```

It discovers only a local Yandex Music renderer target and executes a fixed Rust-side command set: state, play/pause, previous, next, seek, like/dislike and supported My Wave selection actions. The existing desktop client remains responsible for login, playback, recommendations and audio.

The first restart requires an explicit confirmation in Settings. The endpoint uses a random loopback port, is never exposed to LAN, and cookies/tokens or arbitrary frontend JavaScript are not logged or accepted. Later Music Island launches validate the owning process, `music-application://` target and loopback WebSocket before reattaching without a client restart. Returning to Windows SMTC closes the debug-enabled client and launches it normally after an explicit action. When Direct stays `degraded` after a long client downtime, Settings exposes **Перезапустить** which calls the same enable path without switching providers.

The adapter uses stable `data-test-id` controls where available and rediscovers common desktop PlayerBar class layouts each state evaluate so SPA route changes (Home → Collection, etc.) keep feeding title/artist when the player chrome remounts. It reads Chromium discovery responses by their declared `Content-Length` because the endpoint keeps HTTP connections alive, then keeps one serialized CDP WebSocket open. Client updates can still break this experimental path; failures are reported as Direct degraded/reconnect state and never fall through to SMTC implicitly. Overlay **Быстрая перезагрузка** and Settings **Перезапустить** call the same enable path; overlay also sends Play after a successful reconnect.

## My Wave selections

The July 2026 desktop renderer exposes the current selection and recommendation wheel through:

- `RESET_VIBE_CONTEXT_BUTTON`: active selection label and the native reset action;
- `WHEEL_DESKTOP`: the visible recommendation wheel;
- `WHEEL_VIBE_ITEM`: label, cover and a nested fixed playback button for each visible selection;
- `VIBE_PLAYERBAR`: confirmation that the current renderer is in a Vibe/My Wave context.

Music Island reads the active selection label from the Direct snapshot and shows a centered chip under the island. The wheel carousel and preset-catalog fetch are **disabled in 0.9.5**; they remain in the codebase as a future optional Settings feature. Preset IDs are adapter-owned identifiers; the frontend cannot provide selectors or JavaScript. Clearing the active selection still uses the native reset control when available.

The newer `/rotor/session/{new,tracks,feedback}` API can model long-lived My Wave sessions and settings such as diversity, mood/energy and language. It requires account authorization and would create a new token boundary, so it is research reference only. Music Island neither reads nor stores OAuth tokens, cookies or session API responses.

## Alternatives

### Windows SMTC/GSMTC

Universal, account-free and supported by many players. It is the default provider and an explicit alternative to Direct. Windows owns the broker, so Music Island cannot repair a hung broker. Known failure signals include timeouts and `RPC_E_CALL_REJECTED` (`0x80010002`).

### KM.Yandex.Music.Api

[KM.Yandex.Music.Api](https://yandexmusicapicsharp.readthedocs.io/ru/stable/) is an unofficial C# wrapper around account/catalog endpoints. It is useful for search, playlists, likes and metadata, but it does not control the exact local desktop renderer with low latency. Music Island is Rust/Tauri, so adding this package would also introduce a .NET runtime boundary. It is not used.

### Ynison

Ynison is an internal cross-device state and remote-control protocol. Community clients demonstrate that cloud synchronization is possible, but it is undocumented, authentication-sensitive and can change without notice. It may control an account/device session rather than guarantee immediate control of the local Electron renderer. It is documented but not enabled in 0.9.

### Public catalog/web API

Catalog APIs are appropriate for metadata and library operations, not for controlling a running desktop process. They would require OAuth/token handling and create unnecessary account and Terms-of-Service risk for the core controller.

## Capability matrix

- SMTC: metadata, playback state, timeline, play/pause, next/previous, seek; broad compatibility.
- Local CDP: core playback controls, reactions and renderer-owned My Wave selection state/actions with lower local latency; experimental/version-dependent; currently most reliable on the home surface.
- Catalog API: search, playlists, likes and metadata; no direct local renderer control.
- Ynison: cloud device/session synchronization; internal and unstable.

## Recovery

If direct discovery, target validation or a command fails, Music Island retains the last Direct snapshot, reports reconnect/degraded status and retries the Direct endpoint with bounded delay. It does not call SMTC or enter a restart loop. The user can press **Перезапустить**, retry connection, or switch explicitly to SMTC from Settings.
