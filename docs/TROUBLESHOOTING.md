# Troubleshooting

## No Track Is Shown

Start playback in Spotify, a browser player, or another app that exposes Windows media sessions. Some browser players only register with SMTC after playback starts.

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
