# Troubleshooting

## “SMTC недоступен — перезагрузите Windows”

Music Island stops frequent polling after repeated timeouts or `0x80010002` and probes recovery every 15 seconds. Restarting only the player or Island may not repair the Windows media broker; a Windows restart is the reliable recovery. Copy Diagnostics from Settings before restarting if you are reporting the incident.

## Direct Yandex Music connection fails

- Confirm that the desktop client is installed in `%LOCALAPPDATA%\Programs\YandexMusic`.
- Retry from Settings after the client has finished updating.
- If status is `degraded`, `restart-required` or `error`, use **Перезапустить** in the Direct row. That reattaches or restarts the client with a fresh loopback debug endpoint without switching back to SMTC.
- If the client UI changed and the adapter reports `incompatible`, use **Вернуться на SMTC** / **Отключить**. Music Island will restart the client without debug flags.
- The integration listens on a random `127.0.0.1` port only. Security software that blocks local Electron debugging can prevent connection.
- Check `%APPDATA%\Music Island\logs\app.log` for the selected port and the last discovery/evaluation error.
- Connection can take several seconds because Music Island waits for the Electron renderer and player controls, not just an open TCP port.
- `restart-required` means no validated existing endpoint was available. Music Island will not restart the client during application startup; use **Подключить** or **Перезапустить** explicitly if a restart is acceptable.
- A broken SMTC broker does not affect Direct playback. Its health can remain unavailable in Settings while the overlay continues to use Direct metadata, artwork, timeline and commands.

## Direct works on Home but fails on Collection / other pages

0.9.8 rediscovers common desktop PlayerBar layouts each snapshot and dedupes accidental title concatenations. If a specific client build still fails after a route change, use overlay **Быстрая перезагрузка** / **Quick reload** (or Settings **Перезапустить** / **Restart**). Report the desktop client version and route if it still breaks.

If the artist stops updating after skipping many tracks, use quick reload once; 0.9.8 keeps artist by track id when the DOM briefly omits it, but a stuck PlayerBar still needs a reconnect.

## Launch with Windows does nothing (portable exe)

Music Island writes both:

1. `HKCU\...\Run\Music Island` — quoted exe path + `--startup`
2. `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Music Island.lnk`

On every launch with the option enabled it refreshes those paths. If enable fails, Settings shows the error under the toggle. Checklist: enable → confirm `.lnk` exists → reboot → tray icon appears. Turn the toggle off/on once after upgrading if an old unquoted Run entry remains.

## Direct connection works but reactions are missing

Version 0.9.5 exposes like/dislike as soon as the desktop renderer reports those capabilities, even if its timeline still shows `00:00 / 00:00`. If they remain absent, reconnect with **Перезапустить** and include diagnostics plus the desktop-client version in the report.

## No Track Is Shown

Start playback in Spotify, a browser player, or another app that exposes Windows media sessions. Some browser players only register with SMTC after playback starts.

## “No Music Playing” Flashes Briefly

Fixed in v0.8.1 for most cases. During track changes SMTC can drop the session for a few hundred milliseconds; Music Island now holds the last known track instead of flashing the empty state. If it still happens, report the player app and steps.

## Seek Causes an Audio Spike or Click

This is usually **not a bug in Music Island**.

The app sends **one** `TryChangePlaybackPositionAsync` call per timeline release. Windows forwards that to the active player through SMTC/GSMTC (`PlaybackPositionChangeRequested`). Many players — especially Electron/Chromium desktop apps — flush their audio buffer on seek, which produces a short audible spike.

**How to verify:** seek the same track from the native Windows media flyout (Win+A / volume overlay). If the spike is the same, it is a **protocol + player implementation** limitation. We cannot fix player-side buffering without integrating directly into that app.

References: [ModernFlyouts dropped seek support due to unreliable SMTC behavior](https://github.com/ModernFlyouts-Community/ModernFlyouts/issues/97), [Microsoft API docs issue on seek units](https://github.com/MicrosoftDocs/winrt-api/issues/1725).

## Artwork Is Missing

Music Island reads artwork when the source/track key changes. Some SMTC sources do not provide a thumbnail; in that case the UI uses a generated fallback. Direct Yandex reads the current desktop artwork URL.

## Play/Pause Does Not Work

Not every source exposes every command through SMTC. The UI disables commands when Windows reports that they are not available.

## Overlay Is Off Screen

The overlay is automatically centered on the selected monitor. Reset Position is available in Settings if its saved bounds need to be recalculated.

## SmartScreen Warning

Portable builds may be unsigned. Windows SmartScreen can warn until you (or we) apply Authenticode. That is independent of how updates work.

## WebView2 Missing

Tauri uses Microsoft Edge WebView2. Windows 11 usually includes it. Older Windows installs may need the WebView2 runtime from Microsoft.

## Updates

Music Island updates as a portable app: Settings → About → check/download, or the update banner. The new `music-island.exe` replaces the old one; settings stay in `%APPDATA%\Music Island\`. Manual download from [GitHub Releases](https://github.com/redheadesign/music-island/releases) is the same channel.

From **1.3.1**, relaunch after replace is Unicode-safe (non-ASCII folder names such as Cyrillic). On **1.3.0**, updating from a path with non-ASCII characters could show a Windows “file not found” dialog with a garbled path — update manually once to 1.3.1+, or move the portable folder to an ASCII-only path.

## Nothing Appears After Launch

Check the startup log:

```text
%APPDATA%\Music Island\logs\app.log
```

In development, run `npm run logs:open` from the project root. The log records startup, overlay window setup, tray setup and panic messages.
