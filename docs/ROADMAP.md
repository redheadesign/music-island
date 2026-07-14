# Roadmap

## 0.9 beta

- Music module with SMTC metadata and controls.
- Top-edge hover island with compact, expanded, pinned and settings states.
- Live width, scale and hover-delay settings with local persistence.
- SMTC health/backoff, multi-session arbitration and preferred source.
- Experimental opt-in Direct Yandex control with reactions.
- Portable Windows release.

## 0.9.1 hotfix

- Authoritative provider routing and independent health.
- Persistent CDP actor with safe startup reattach.
- Single-flight SMTC protection and stable Settings source refresh.
- CPU/resource acceptance counters and repeatable live profiling.

## 0.9.5

- Overlay UI polish: remove wave carousel, center active-wave chip, settings drag/corners, island reset, reaction/progress visuals.
- Portable Windows autostart with path refresh and quoted registry entries.
- Direct recovery action (**Перезапустить**) when the protocol is degraded or reconnect fails.
- Frontend composition boundaries (`AGENTS.md`, import check, shared glass kit).

## Next

- Make Direct selectors resilient across Yandex Music Desktop routes (home vs Collection and other surfaces).
- Improve automatic Direct recovery after long client downtime; keep explicit restart as the fallback.
- Optional My Wave carousel as a settings-gated feature.
- Better DPI and fullscreen app detection.
- Signed GitHub Releases and Tauri auto-update.

## Future Modules

- `TodoPanel`: local quick tasks inside the expanded island.
- `NotesPanel`: local scratchpad for fast capture.
- `TranscriptionPanel`: RuFlow-inspired push-to-talk transcription using local models or sidecar processes.
- `CommandPalettePanel`: module switching and quick actions.

## Packaging

- Portable `.exe` during beta.
- Authenticode signing before broader distribution.
- Signed installer/updater artifacts after the portable channel is stable.
