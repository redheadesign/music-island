# Troubleshooting

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

Artwork extraction is reserved for the next implementation pass. The MVP shows a generated placeholder when SMTC metadata is available without a thumbnail.

## Play/Pause Does Not Work

Not every source exposes every command through SMTC. The UI disables commands when Windows reports that they are not available.

## Overlay Is Off Screen

Use the tray menu and choose `Reset position`.

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
