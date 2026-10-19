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

### 2026-10-06 — shortcut capture and trailing period

- Settings shortcut capture now uses focused WebView keyboard events, with native suspend/change/resume commands; no dependency on a secondary handy-keys recording hook. Existing binding validation/storage remain native.
- Added remove_trailing_period (serde default false), settings-only command/ACL and final-output normalization shared by live transcription and history retry. Raw transcription remains available in history; the delivered result is stored as processed text when changed.

### 2026-10-07 — microphone privacy settings without CMD

- Replace upstream `cmd /C start` with the existing Tauri opener for the fixed
  `ms-settings:privacy-microphone` URI. Its Windows `ShellExecuteExW` implementation
  opens Settings directly. Preserve the native command and ACL contract.

### 2026-10-07 — Handy 0.9.8 fixes and October 7 loading notices

Reviewed stable [v0.9.8](https://github.com/cjpais/Handy/releases/tag/v0.9.8),
`14f6f0d31cb22a4268acfbddba3052820fd0a06e`, and main through
`afe5a6310534ffb178794365f31abb8b9fd435a7`. The vendored baseline remains
0.9.7; the following selected fixes are backported into the host adaptation.

| Upstream change | Host finding and result |
| --- | --- |
| #2106, unload after empty recordings | Present: FinishGuard now performs immediate unloading on every pipeline exit, including empty/cancelled captures. The host's memory trim and coordinator completion remain. |
| #2033, unknown reset binding IDs | Present: return an error instead of unwrapping a missing binding. Upstream tests retained. |
| #2158, invalid Tauri accelerators | Present: validation now invokes the real backend parser. Default/side-specific modifier tests retained. |
| #2190, Escape remains after a short recording | Present: reconcile the latest synchronous request under one lock. Track the actual backend/binding, honor host suspension, retry failed registration and reconcile backend switches. Deterministic reversed-task/backend/failure tests added. |
| #2156, removing English “Ha” | Present: remove it from the built-in English filler list. Explicit custom lists still apply. |
| #2157, leading filler loses sentence capital | Present: transfer capitalization to the next kept word at sentence boundaries. Extend the same rule to our Russian hesitation filter, preserving token/quote/language guards. |
| #2161, capture without a usable model | Present: validate the selected model path before microphone capture when no engine is loaded. Background loading and its errors remain native. |
| #2147, transcribe-cpp 0.2.4 | Present: pinned runtime dependency and lockfile upgraded from 0.2.3 to 0.2.4. Includes the upstream Nemotron streaming decoder fixes; Nemotron is in our catalog. ABI1 and CPU/Vulkan choices remain. |
| #2227 / 20a6685 and 417dc6a, slow loading looks stuck | Present: native snapshots expose modelLoading with an RAII notice guard. After stop, Classic labels the wait as loading; live capture opens a loading notice after 2s and keeps the panel open until the session finishes. Terminal failures/panics clear the notice; operation IDs prevent a later session inheriting it. |
| #2011, copy success before clipboard write | Already awaited in our UI. Clipboard failure now also goes through the existing controller error path and clears an earlier success icon. |
| #1862, compound shortcut names | Already canonical in our focused WebView recorder (capslock/pageup/printscreen etc.). No upstream recorder restored. |
| #2082, settings scroll reset | The host owns settings navigation/scroll restoration; the standalone Handy App implementation is not used. |
| #2160, device enumeration on startup | Already absent from host startup: engine activation is lazy and blocking initialization runs on a worker; device listing is an explicit runtime request. |
| #2186, separate Chinese script selector | New settings feature, not a replacement needed by this fix pass. Existing zh-Hans/zh-Hant capability gating is preserved. |
| Main: #1941, custom sound refresh | The host has fixed sound choices and no standalone Handy SoundPicker/custom sound dialog. |
| Main: #2116, legacy portable cache | The host uses owned AppData storage and an explicit copy-only Handy import; the standalone portable directory migration does not apply. |
| Main: #2208 worker process / #2203 transcribe 0.3.0 | Architecture/API changes beyond the stable bug fixes. Host inference already has per-engine workers behind an in-process DLL/ABI; this pass keeps that boundary and the stable 0.2.4 dependency. |
| Linux/Omarchy/Ubuntu notes, translations, installer icon, PR template | No corresponding Windows host subsystem. |

The overlay status also carries shortcutActivation captured at recording start.
Every theme hides its recording controls for push_to_talk. Toggle/combined modes
use one Finish button; Waves no longer has a second cancel button or a duplicate
core action. Cancellation shortcuts and failed-insertion Copy/Dismiss remain.
The existing toggle command is explicitly allowed in the recording overlay ACL;
it previously had a frontend Finish button without permission to invoke it.
Settings preview reads the same saved activation mode. No new IPC command.

## Windows clipboard correction (3.0.3)

Upstream [#502](https://github.com/cjpais/Handy/issues/502) remains open. The latest
stable [Handy 0.9.8](https://github.com/cjpais/Handy/releases/tag/v0.9.8), checked
2026-10-20, does not list a fix for this race; our vendored baseline remains 0.9.7.
Music Island now always uses delayed-render paste on Windows, without the unsafe
60ms legacy fallback. The foreground process must request CF_UNICODETEXT after
injection before restoration is permitted. Clipboard managers and unknown readers
are not target acknowledgements. If no acknowledgement arrives within 8s, or
injection partially fails, leave the transcript available for late/manual paste.
The unique owner HWND is checked while the clipboard is locked, preserving a newer
user copy. Auto-submit also requires an acknowledged paste and original foreground
process. The configurable before delay is retained; after delay is a minimum quiet
period after acknowledged reading (at least 200ms). The old experimental reliable
paste flag remains serialized for compatibility but cannot disable Windows safety.
macOS/Linux behavior and the inference ABI/bundle are unchanged.

The Windows integration regression runs in a dedicated test process with its own
window station and desktop (including the worker thread), so it never borrows the
interactive clipboard. It covers a 900ms delayed target read, actual restoration,
a foreign-process receipt followed by timeout, and a newer user copy. Run it via
`cargo test --manifest-path src-tauri/Cargo.toml -p music-island-handy-core isolated_windows_delayed_read_manager_and_new_copy -- --ignored --test-threads=1`.
The core test binary embeds Common Controls v6, matching the host manifest.
The finished transaction suppresses WM_RENDERALLFORMATS so window teardown cannot
replace a restored snapshot with the transcript again.
