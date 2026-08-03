# Roadmap

## Shipped (through 1.3.2)

- Music module with SMTC metadata and controls; top-edge hover island.
- Live width, scale, hover-delay, accent color; Ru/En; About.
- SMTC health/backoff, multi-session arbitration, preferred source.
- Opt-in Direct Yandex (local CDP) with reactions and soft recovery paths.
- Single-instance lock + already-running notice.
- Portable Windows release + **portable GitHub auto-update** (download/replace exe; Unicode-safe relaunch from 1.3.1).
- Startup intro splash (skipped on autostart `--startup`).
- **Better Voice (Beta)** in-process: denoise/AGC/EQ/FX, fox mascot, guide, VB-Cable external.
- Settings scope switch: Music Island | Better Voice.

Historical notes for 0.9.x alphas/betas live in [`CHANGELOG.md`](../CHANGELOG.md).

## Next

- Better Voice: onboarding polish, quality under load, UX iteration (still Beta).
- Optional My Wave carousel as a settings-gated feature.
- Better DPI and fullscreen app detection.
- README screenshots + video once assets land in `docs/media/`.
- Curated multi-theme switch (#26).
- Optional Authenticode on the portable exe (less SmartScreen) — does not change the update model.
- Sidecar plugin host for *other* companions (Better Voice no longer requires a sidecar).

## Future Modules

- `TodoPanel`: local quick tasks inside the expanded island.
- `NotesPanel`: local scratchpad for fast capture.
- `TranscriptionPanel` / Handy STT: plugin or in-process companion.
- `CommandPalettePanel`: module switching and quick actions.

## Packaging

- Forever: portable `music-island.exe` via GitHub Releases + in-app replace updater.
- Optional: Authenticode signing for SmartScreen comfort.
