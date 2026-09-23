# Handy adaptation journal

Baseline: Handy v0.9.7, `05e0aedd2906f0d82722735f930465950c476b90`.
Original copyright: CJ Pais, MIT. Music Island integration changes: GPL-3.0-or-later.

The vendored tree preserves upstream coordinator, audio resampling/VAD gates,
shortcut activation semantics, model capability probing, download verification,
post-processing, clipboard recovery and history migrations. The following are
host adaptations, rather than a new JavaScript implementation of recognition:

- Replace the standalone Tauri entrypoint with a lazy native plugin and typed commands.
- Keep one Music Island tray, startup setting, locale/theme system and portable updater.
- Move heavy ASR and Silero sessions behind an in-process, versioned C ABI; retain
  upstream run plans, language evidence, text corrections and streaming coordination.
- Embed resources and dependency DLLs; extract to a version/hash directory and validate
  files before loading. Baseline CPU ORT avoids an AVX2-only distribution assumption.
- Redirect settings, history, audio, downloads and HF cache to owned application data.
- Protect external service keys with Windows DPAPI and omit them from UI snapshots.
- Capture the target HWND/PID before recording; place the nonactivating overlay on
  its monitor's work area and preserve history when insertion fails.
- Add state revisions and operation IDs, explicit import preview/copy/cancel, model
  cleanup and a fixed-root post-exit cleanup helper. Never migrate credentials/history
  implicitly or mutate Handy's store.
- Replace frontend settings/overlay with Music Island components and Russian/English
  copy. Preserve upstream experimental flags rather than presenting them as stable.
- Register the plugin's explicit Tauri ACL in the host build: settings can access
  the complete 118-command interface, the island can only read state/toggle, and
  the recording overlay can read state/cancel/copy its current result. Frontend/native/ACL parity is
  covered by a contract test; browser mocks do not establish native IPC access.
- Serialize suspension after pending initialization, reject UI completions from a
  disabled session, and prevent shortcut capture cleanup from reactivating a
  suspended feature. Preserve the live overlay mode in late state snapshots.
- Adapt the interrupted-download test to wait for a real partial body, then cancel;
  bypass system proxies only in the test client so loopback stalls remain local.
  Production downloads retain their configured proxy behavior.
- Keep failed insertion results visible with a native clipboard action; validate
  the operation ID before copying and completing the overlay. Do not depend on
  successful audio/history writes to recover the text.

For upgrades, compare manager/shortcut/coordinator diffs, catalog and resources at the
new exact commit; review crate and model licenses separately; refresh the lockfiles;
re-run native unit tests, ABI probe, recording/paste QA, download interruption and
same-hardware performance comparison. Do not copy upstream global app/update controls
back into the host.

## Consistency and lifecycle pass · 23 September 2026

- Separate metadata preparation from engine activation so disabled settings can
  show installed/imported models and history without acquiring microphone/model
  resources. Serialize initialization and model selection against shutdown.
- Refresh model events with session/revision guards, preserve downloaded/selected/
  loaded distinctions, and page native history with its cursor rather than an
  ever-growing capped request limit.
- Add Russian-language-gated hesitation cleanup to the default filler path, with
  tests for repeated/hyphenated vowels, ordinary words, quotes and custom lists.
  Keep the user's enabled/disabled preference and chosen model.
- Make the idle watcher interruptible and joinable. Stop downloads/recording and
  wait for in-flight model ownership during host shutdown; do not block the Windows
  event loop while unloading recognition. The host owns the bounded exit fallback.
- Add SQLite migration/upgrade characterization, a busy timeout and recording-path
  validation at the manager boundary, including symlink/reparse rejection.
- Replace duplicated navigation/fields/buttons with shared Music Island controls.
  Keep the fork's catalog and recognition implementation; no competitor code or
  assets were imported.

## Release 3 presentation pass

Baseline remains **Handy v0.9.7 / 05e0aedd2906f0d82722735f930465950c476b90**; this pass does not upgrade the upstream engine or model catalog.

- A single localized catalog policy ranks GigaAM RNN-T Q8 first for RU and Parakeet Unified EN Q8 first for EN; selected/installed models remain visible and switching UI language never changes recognition settings.
- ModelCard shares installed, download, import and failure states. Model terms stay separate from Handy's MIT license.
- “AI processing” / «Обработка с ИИ» explains the upstream path: local recognition → explicitly configured provider via the dedicated shortcut → result pasted into the active app and saved in history. It is not an automatic forwarding mode for ordinary dictation.
