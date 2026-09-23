# QA Checklist

## Operating Systems

- Windows 11: primary target.
- Windows 10: best effort with WebView2 and SMTC support.

## App shell

- Manual launch shows intro splash; `--startup` / autostart skips intro.
- Second launch shows already-running notice (single-instance).
- Hover opens the island; auto-collapse after mouse leave; pin keeps expanded.
- Settings titlebar shows localized **Settings**; minimize/close/tray reopen work.
- Scope switch Music Island | Better Voice | Dictation; fixed header/navigation and independently scrolling content.
- Accent color changes UI chrome.

## Media

- Taskbar mini-player: use the [Windows taskbar checks](TASKBAR.md#windows-verification), including simultaneous operation with the top island.

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

## Dictation and graphite settings acceptance

Browser verification covers scoped dark/light tokens, RU/EN, keyboard focus, reduced motion, fixed navigation/right-only scrolling, dialogs, import preview, 0/9/99/100/— quotas, and real preview drag at multiple scales. It does not establish native recording, paste, DPI or SMTC correctness.

Native checks: run the isolated `--dictation-runtime-check` from an EXE-only folder without Handy or adjacent DLLs. Compare identical WAV/model/backend runs with Handy on the same hardware, recording cold load, recognition time and peak/private memory. Test RU/EN short/long recordings, hold/toggle/combined mode, Escape, input device removal/change, playback mute restoration, Better Voice concurrently, and focus-preserving paste into several editors (including closed target and clipboard recovery). Disabled dictation must retain neither an open microphone nor an ASR model. Hidden overlays must not animate.

Verify download cancellation/resume, network loss, insufficient space, hash mismatch, corrupt model, import cancellation, unchanged original source, and full cleanup in a disposable profile with sentinel files outside each allowed root. Confirm no paths escape through symlinks/junctions. Never test full cleanup on a real profile.

Media/intro: seek to 60 seconds then immediately Next/Previous; inject late full/timeline updates and switch source/session. Track text/container must remain fixed while only the progress fill transitions. Fresh manual launch gets the four-step wizard; existing profiles and Windows autostart do not. Skip/completion leads to intro and the hover cue; real opening dismisses it, including late event subscriptions. Test developer replay actions separately.

See [the 22 September implementation check](QA_DICTATION_2026-09-22.md) for the
recorded automated/headless results and the interactive Windows checks still open.

## Consistency and lifecycle regression matrix

- Settings: scroll Appearance/Dictation to the bottom; titlebar, scopes and left
  navigation stay fixed, and the right region reaches the window edge. Changing
  pages resets only that region before paint; reselecting the same page preserves it.
- Compare all three menus, shared primary/secondary/danger buttons, selects and
  toggles in RU/EN, dark/light and keyboard/reduced-motion modes. Panels must remain
  visible against the light canvas. Preserve the fox composition and island material.
- About: developer switch exposes/removes its page. Replay onboarding and replay
  startup/hint are separate actions. Repeat rapidly; late completion from an older
  generation must not close the new intro. Autostart must not open the wizard.
- Move rapidly across the top edge at least 200 times, including during opening and
  closing. The collapsed gesture strip must recover; check pin/unpin and settings
  coexistence on Windows DPI 100/125/150/200% and multiple monitors.
- Play feedback covers the island background without moving the Play button. Like
  remains reversible. Check keyboard origin, rapid taps and reduced motion.
- Imported GigaAM appears as downloaded and selected while unloaded, including with
  dictation off and filters active. Enabling/disabling must preserve that distinction.
- History: more than 100 entries, audio expiry versus kept entries, missing audio,
  database upgrade and locked database. Use fixtures for corrupt paths/reparse points.
- Tray Quit: idle, loaded model, active capture, recognition, download, and simultaneous
  Better Voice. Repeated clicks start one cleanup. Expect `shutdown: resources released`
  ordinarily; investigate either deadline log. Process must disappear within 10s.
  Reopen after quitting and confirm devices work and partial downloads remain recoverable.

Latest recorded evidence: [23 September consistency pass](QA_CONSISTENCY_2026-09-23.md).
