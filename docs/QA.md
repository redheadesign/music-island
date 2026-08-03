# QA Checklist (1.3.1)

## Operating Systems

- Windows 11: primary target.
- Windows 10: best effort with WebView2 and SMTC support.

## App shell

- Manual launch shows intro splash; `--startup` / autostart skips intro.
- Second launch shows already-running notice (single-instance).
- Hover opens the island; auto-collapse after mouse leave; pin keeps expanded.
- Settings titlebar shows localized **Settings**; minimize/close/tray reopen work.
- Scope switch Music Island | Better Voice; Ru/En on the right of the same row.
- Accent color changes UI chrome.

## Media

- Spotify / browser / other SMTC sources.
- SMTC seek: compare with Win+A flyout (player limitation is OK).
- Direct Yandex: consent, connect, play/pause/seek/like, quick reload, return to SMTC.

## Better Voice (Beta)

- Open guide from virtual mic section (no duplicate footer button).
- Devices, Start/Stop, fox transitions, meters while running.
- After Stop / leave BV tab, meter polling stops.
- VB-Cable hint + official download link opens in browser.

## Portable updates

- About: version card, Check for updates, progress when downloading.
- Settings banner shows GitHub release markdown; Later dismisses; Update installs.
- Island nag (when shown): title only + Update / Later; Later snoozes ~30 days.
- Replacing the exe preserves `%APPDATA%\Music Island\` settings.

## Portable release

- Starts without Vite.
- SmartScreen may warn on unsigned builds (documented, not a functional failure).

## Performance

- Collapsed idle CPU ≤1% without voice.
- Expanded Direct playback CPU ≤4%.
- Hover latency acceptable; memory stable after 30–60 minutes.

## Accessibility

- Reduced motion.
- Text truncation.
- Keyboard focus in settings.
