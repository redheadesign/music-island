# Technical Specification

## Goal

Build a Windows top-edge overlay that surfaces the active Windows SMTC media session and behaves like a small native-feeling island. The first module is music control for any SMTC-compatible player; the shell must support future productivity modules.

## MVP Scope

- Always-on-top transparent Tauri window centered at the top edge.
- Hover-driven compact and expanded states.
- SMTC metadata: source app, title, artist, album, playback status, timeline and capabilities.
- Controls: play/pause, previous, next and stop where the active session supports them.
- Settings: size, scale, density, artwork/title/artist/progress/source visibility, theme, opacity, blur, reduced motion and autostart.
- Tray menu: show/hide, settings, reset position, check updates and quit.
- Local settings persistence in app data.
- Windows NSIS installer path and GitHub Releases documentation.

## Out Of Scope For MVP

- Streaming service account login.
- Custom audio playback.
- Track downloads or third-party streaming API integration.
- Third-party plugin marketplace.
- Cloud sync for notes/transcription.

## Acceptance Criteria

- The app starts in dev browser preview with demo data.
- The installed Tauri app can read a current Windows media session on Windows.
- The overlay can be opened by hovering near the top edge.
- Settings survive restart and future installer updates.
- The app has README, architecture, release, QA and troubleshooting documentation suitable for GitHub.
