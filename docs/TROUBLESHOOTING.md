# Troubleshooting

## “SMTC недоступен — перезагрузите Windows”

Music Island stops frequent polling after repeated timeouts or `0x80010002` and probes recovery every 15 seconds. Restarting only the player or Island may not repair the Windows media broker; a Windows restart is the reliable recovery. Copy Diagnostics from Settings before restarting if you are reporting the incident.

## Direct Yandex Music connection fails

- Confirm that the desktop client is installed in `%LOCALAPPDATA%\Programs\YandexMusic`.
- Retry from Settings after the client has finished updating.
- If the client UI changed and the adapter reports `incompatible`, use **Вернуться на SMTC**. Music Island will restart the client without debug flags.
- The integration listens on a random `127.0.0.1` port only. Security software that blocks local Electron debugging can prevent connection.
- Check `%APPDATA%\Music Island\logs\app.log` for the selected port and the last discovery/evaluation error.
- Connection can take several seconds because Music Island waits for the Electron renderer and player controls, not just an open TCP port.

## Direct connection works but reactions are missing

Version 0.9 exposes like/dislike as soon as the desktop renderer reports those capabilities, even if its timeline still shows `00:00 / 00:00`. If they remain absent, reconnect from Settings and include diagnostics plus the desktop-client version in the report.

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

Early builds are unsigned. This is expected until Authenticode signing is configured.

## WebView2 Missing

Tauri uses Microsoft Edge WebView2. Windows 11 usually includes it. Older Windows installs may need the WebView2 runtime from Microsoft.

## Auto-Update Is Disabled

MVP builds update by installing a newer `.exe` over the old one. Signed auto-update will be enabled only after release signing keys are configured.

## Nothing Appears After Launch

Check the startup log:

```text
%APPDATA%\Music Island\logs\app.log
```

In development, run `npm run logs:open` from the project root. The log records startup, overlay window setup, tray setup and panic messages.
