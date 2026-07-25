# Music Island

Windows top-edge media island. Works with any SMTC player; optional Direct mode for Yandex Music Desktop.

**0.9.8 · open beta** · Windows 10/11 · [GPL-3.0](LICENSE) · local-first · no telemetry

## Download

[GitHub Releases](https://github.com/redheadesign/music-island/releases) → `music-island.exe` (portable, unsigned — SmartScreen may warn).

## Preview

<!-- Drop a YouTube / Telegram / Loom link below when the review is ready -->

**Video overview** — *coming soon*

```text
[ video placeholder ]
Paste embed or link here → docs/media/README.md
```

### Screenshots

*Coming soon — drop PNGs into [`docs/media/`](docs/media/) using these names:*

1. `screenshot-01-island.png` — expanded island  
2. `screenshot-02-settings.png` — settings  
3. `screenshot-03-direct.png` — Direct / reactions  
4. `screenshot-04-wave.png` — wave chip  

Then replace this list with a markdown image grid (see `docs/media/README.md`).

## Features

- Hover island: artwork, title/artist, progress, play/pause, prev/next
- Settings: width, scale, open delay, SMTC source, Direct, autostart, **Ru / En**
- SMTC health + preferred source
- Opt-in Direct Yandex (like/dislike, wave chip, quick reload)
- Tray: settings / quit · config in `%APPDATA%\Music Island\`

## Limitations

- Direct is experimental (local CDP, may restart the client once, can break after Yandex updates)
- After long downtime use overlay **Quick reload** / Settings **Restart**
- Seek click/stutter is usually the player/SMTC, not a double-seek from Music Island
- SMTC capabilities vary by app

## Develop

Windows 10/11, WebView2, Node.js, Rust, MSVC Build Tools.

```powershell
npm install
npm run tauri:dev
npm run tauri:build   # → release/music-island.exe
```

Docs: [Architecture](docs/ARCHITECTURE.md) · [Media](docs/MEDIA_ARCHITECTURE.md) · [Direct](docs/YANDEX_MUSIC_API.md) · [Troubleshooting](docs/TROUBLESHOOTING.md) · [Releases](docs/RELEASES.md)

## Author

Telegram [@redheadesigner](https://t.me/redheadesigner) · contact [@redheadesign](https://t.me/redheadesign)

Unofficial project — not affiliated with Apple, Microsoft, Spotify, or Yandex.
