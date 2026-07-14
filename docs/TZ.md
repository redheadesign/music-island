# Technical Specification

## Goal

Build a Windows top-edge overlay that surfaces the active media session and behaves like a small native-feeling island. Windows SMTC is the universal provider; explicit local Yandex Music Desktop control is an experimental low-latency provider. The shell must support future productivity modules.

## MVP Scope

- Always-on-top transparent Tauri window centered at the top edge.
- Hover-driven compact and expanded states.
- SMTC metadata: source app, title, artist, album, playback status, timeline and capabilities.
- Controls: play/pause, previous, next and stop where the active session supports them.
- Settings: live width, scale, open delay, preferred SMTC source, protocol status, Direct reconnect, portable autostart and island reset.
- Tray menu: settings, update check and quit.
- Local settings persistence in app data.
- Portable Windows executable and GitHub Releases documentation.
- Opt-in Direct Yandex metadata, playback, seek and like/dislike control without creating a second audio session.

## Out Of Scope For MVP

- Streaming service account login or token storage.
- Custom audio playback.
- Track downloads or third-party streaming API integration.
- Third-party plugin marketplace.
- Cloud sync for notes/transcription.

## Acceptance Criteria

- The app starts in dev browser preview with demo data.
- The installed Tauri app can read a current Windows media session on Windows.
- The overlay can be opened by hovering near the top edge.
- Settings survive restart and executable replacement.
- The app has README, architecture, release, QA and troubleshooting documentation suitable for GitHub.
