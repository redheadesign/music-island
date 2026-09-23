# Consistency and lifecycle verification · 23 September 2026

This report covers the follow-up to [the initial dictation integration](QA_DICTATION_2026-09-22.md).
The working tree includes both passes. Nothing was published, committed or tagged;
the application version remains 2.0.0. Browser examples use mock devices/models.

## Automated checks

- `npm test`: **134 passed, 24 files**.
- `npm run build`: passed (also executed by the final portable build).
- `npm run lint`: no errors; seven existing fox-hook dependency warnings remain.
- Import boundaries: **191 source files**, passed (also part of lint).
- `npm run check:storybook` and `npm run build-storybook`: passed.
- `cargo check --manifest-path src-tauri/Cargo.toml`: passed.
- Rust: **92 host + 259 Handy adapter tests passed**, four live hardware probes
  ignored. Protocol crate has no unit tests. No native source changes followed this run.
- DPAPI round trip passed in the ordinary Windows user session. The restricted
  test token could not decrypt its fixture, so its failure was not reported as a pass.

Coverage added in this pass includes stale overlay completions across 200 rapid
transitions, idempotent concurrent exit requests, stale intro generation rejection,
Russian hesitation cleanup, metadata/session behavior, 160-record history paging,
SQLite fresh/upgrade migrations and recording-path/reparse protection. Existing
seek/navigation, drag and storage regressions remain in the suite.

The frontend/native logs are under `.local/*-iteration.log` and `.local/dpapi-test.log`.
Build warnings include the existing large frontend chunk and upstream/platform
unused native declarations; no new warning-free claim is made.

## Browser review of production components

- Actual `SettingsWindow` shell: 754px host, fixed header/navigation. The right
  region alone scrolls; its bottom equals the window bottom. Scrolling Appearance
  reached the final controls without moving the header or navigation.
- Music Island, Better Voice and Dictation share the same navigation component.
  Dark/light settings reviewed; light canvas, panel and nested surfaces are distinct.
  The accepted fox composition/Paper Warp and real island preview retain their material.
- Shared controls reviewed in light mode; Select opens from the keyboard, arrows
  change the focused option, Enter selects, and focus returns to its trigger.
- About uses the app logo, has a spaced onboarding action and developer-mode toggle.
  Enabling the toggle reveals its page. The Better Voice developer-mode story passes
  its enable/disable round trip through About. Replay actions are distinct.
- Imported GigaAM RNNT story displays **Downloaded + Selected**, without an incorrect
  **In memory** badge. Installed and downloadable models have separate groups.
- Onboarding play traversed all four steps and invoked completion. Light-mode first
  step reviewed with the actual island preview. This does not verify native window replay.
- Rapid Play/Like + keyboard play passed. A click produced a wave under
  `island-feedback__layer`; button transform remained `none`. The reduced-motion
  story has no wave.

One duplicate developer-page heading and the old About update buttons were found
in the last visual pass and corrected; the final frontend/Storybook/portable builds
were repeated afterward. The earlier HMR duplicate-icon error was fixed before the
passing build; it is not a remaining runtime finding. The dictation navigation story
was also updated to use the new metadata-while-disabled flow; its same-page scroll
preservation and page-change reset completed successfully.

## Final artifact and isolated runtime

`release/music-island.exe`: **152,315,392 bytes**, Windows x64, version
2.0.0; built `2026-09-22T22:01:10.252Z`. SHA-256:

`7fffbf9e96152b61cb923b412019353227f095e92ddf8d82964f353367a15740`

Canonical EXE, Cargo output and `release/SHA256.txt` agree. Embedded frontend:
`assets/index-Cap88XLx.js` and `assets/index-STY0AFcb.css`. The final
production build after comment/whitespace cleanup produces those same assets.
Authenticode status: **NotSigned**. Checksum validation is not publisher signing.

The packaging probe runs the final copied EXE in a new `exe-only` directory, with
only `music-island.exe` beside it and separate disposable Roaming/Local profiles.
It extracts and validates ABI 1, runs VAD, recognizes local synthetic RU/EN WAVs
using Whisper Tiny Q8 on CPU, and unloads the model. It does not open the microphone
or run native application windows. The real Handy installation, model cache,
history and service keys were not changed.

| Input | Audio | Init | Model load | Recognition | Sampled peak private memory | Unloaded |
| --- | --- | --- | --- | --- | --- | --- |
| RU | 8.075s | 1302ms | 149ms | 1420ms | 470.9 MiB | True |
| EN | 6.035s | 1106ms | 124ms | 921ms | 470.7 MiB | True |

The final probe overlapped the static Storybook build, so these timings include
competing CPU work and must not be interpreted as a latency regression or benchmark.

Evidence: `.local/consistency-qa/artifact.json`, `embedded-frontend.json`, `probes.json`
and `.local/verify-consistency-build.ps1`. These short probes are packaging checks,
not a statistically controlled performance comparison. The earlier same-hardware
Handy comparison remains documented in the 22 September report and was not rerun.

## Interactive Windows acceptance still required

Native GUI control is unavailable in this session. The following are explicitly
**not established** by browser/unit/CLI checks:

- Actual tray Quit during capture, recognition or download, model release on that
  path, repeated tray clicks, and Better Voice running at the same time.
- Real top-edge hover races, pinning, Windows DPI 100/125/150/200%, multiple monitors,
  and the intro-to-hover cue/replay inside native windows.
- Real microphone input, long RU/EN dictation, device changes, target focus/paste and
  clipboard restoration in different applications.
- A clean Windows machine without Handy/toolchain, prolonged memory profiling,
  external downloads under network loss/disk exhaustion, and live SMTC/CDP regression.

These checks remain in [QA.md](QA.md). Their absence does not invalidate the recorded
automated results, but it prevents claiming complete native acceptance.
