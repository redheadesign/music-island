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
- Direct launch persistence: start from Desktop, Start and a pinned taskbar shortcut
  after closing the client; reboot with Yandex autostart both enabled and disabled.
  Existing autostart enablement must not change. Verify update-rewritten shortcuts
  are repaired, then select SMTC and reopen each supported shortcut without debug flags.
- Full data cleanup must restore owned Yandex launch settings before removing the
  backup. A write-protected shortcut must retain a retryable backup and show failure.

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

## Windows console suppression

- No console on manual launch, `--startup`, second launch or handoff to a newer
  portable copy. Include a profile whose install record/Run key points to another
  copy, so startup file-version probes actually run.
- No console during Direct consent/connect, quick reload and return to SMTC.
  Passive Direct recovery only reattaches; it must not restart the client.
- No console during usage enable/Refresh/retry/five-minute polling or legacy
  sidecar startup. Codex stdin/stdout IPC and sidecar log pipes still work.
- Dictation's microphone privacy action opens the Windows Settings page directly.
  Browser links, Spotify and opening the data folder also use native shell opening.
- Autostart changes, portable replacement/relaunch and confirmed data cleanup do
  not flash a terminal. Test updates/cleanup only with disposable copies/profiles.
- VB-Cable INF installation keeps elevated `pnputil` hidden. The UAC prompt and
  interactive official installer remain usable; verify install/cancel/uninstall
  on a disposable Windows environment with an actual driver package.
- Automated Windows tests in `process.rs` query the child's `GetConsoleWindow`
  (must be zero) and verify exit status and stdin/stdout/stderr pipes. These cover
  the shared launcher, not interactive UAC or external applications' behavior.

## Performance

- Collapsed idle CPU ≤1% without voice.
- Expanded Direct playback CPU ≤4%.
- Hover latency acceptable; memory stable after 30–60 minutes.

## Transparent overlay first hover

- Cold manual launch and Windows autostart: after the island appears, hover it
  for the first time. The desktop must never flash white or show a blank
  monitor-sized overlay. Repeat after sleep/wake and display reconnect.
- Repeat opening/closing, pinning and moving between the desktop and island
  controls. Clicks outside the island pass through; controls inside work,
  including settings and transport, without activating an invisible surface.
- Sweep across the entire expanded card, especially its right half and the
  Settings/Pin gutter: both hover feedback and clicks must reach the WebView.
  Layered parent attributes must be alpha 255 with `LWA_ALPHA` only; no color key.
- Repeat at Windows DPI 100/125/150/200% and with the preferred monitor changed.
  Check the intro/onboarding separately from the main overlay.
- Automated native tests verify persistent layered/input bits, initial opacity,
  recovery from zero alpha/color key, and duplicate write suppression on a hidden HWND. They do not establish visible WebView2/DWM
  behavior on the user's GPU; record that interactive result in SESSION_HANDOFF.md.

## Accessibility

- Reduced motion.
- Text truncation.
- Keyboard focus in settings.

## Dictation and graphite settings acceptance

Browser verification covers scoped dark/light tokens, RU/EN, keyboard focus, reduced motion, fixed navigation/right-only scrolling, dialogs, import preview, 0/9/99/100/— quotas, and real preview drag at multiple scales. It does not establish native recording, paste, DPI or SMTC correctness.

Native checks: run the isolated `--dictation-runtime-check` from an EXE-only folder without Handy or adjacent DLLs. Compare identical WAV/model/backend runs with Handy on the same hardware, recording cold load, recognition time and peak/private memory. Test RU/EN short/long recordings, hold/toggle/combined mode, Escape, input device removal/change, playback mute restoration, Better Voice concurrently, and focus-preserving paste into several editors (including closed target and clipboard recovery). Disabled dictation must retain neither an open microphone nor an ASR model. Hidden overlays must not animate.

October 7 Handy fixes need these additional interactive Windows checks:

- Classic/Waves/Fox: hold recording and live capture show no Stop/Cancel;
  releasing the binding finishes. Toggle/combined show one working Finish.
- Classic hold: microphone and waveform have equal 14px horizontal insets.
  Fox/Waves: compare first and repeated hotkey-to-visible latency under Windows
  CPU/GPU load; the character/control must remain visible while effects initialize.
  Check hide/show, hold/toggle, expanded text and GPU context recovery. Retaining
  the canvas must not leave animation running in a hidden overlay.
- Tap/release repeatedly, then use Escape in another app; the cancel binding
  must not remain registered. Repeat with both keyboard backends and a switch.
- In a disposable profile with no usable model, starting dictation must not
  open the microphone. A cold live model load lasting over2s shows the loading
  notice; completion/failure clears it and the next session starts compact.
- With immediate unload selected, an empty or cancelled capture releases the
  model as well as a successful capture. Repeating dictation still works.

Recorded automated checks and the unperformed native interaction checks are
tracked in SESSION_HANDOFF.md; Storybook cannot establish global hotkey/paste
or microphone correctness.

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

### 3.0.3 Windows paste regression

- Copy a distinct marker, dictate a different phrase into the target editor, and
  repeat with the target busy for more than the previous 60ms restore delay.
- Repeat with clipboard history/manager enabled, and Ctrl+V, Ctrl+Shift+V and
  Shift+Insert. The target must receive the transcript, never the saved marker.
- In Restore mode, an acknowledged target read restores the old clipboard after
  the quiet period. Unknown/third-party first readers keep the transcript at
  timeout; this is a deliberate safe fallback for late/manual paste.
- Copy new content while a paste waits: it must survive transaction completion.
- Enable auto-submit, change foreground windows while waiting: Enter must not go
  to the new window. Injection/setup failures must offer the existing Copy action.
- In Classic hold mode, verify both label gaps are 9px and outer insets 14px.
- Reopen General and switch all themes; thumbnails match the production renderer,
  and the selected live preview and settings controls remain functional.
