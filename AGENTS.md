# Repository guidance

## Project context

- Music Island is a Windows 10/11 top-edge media controller built with React 19, TypeScript, Vite and Tauri 2 / Rust.
- Windows SMTC is the default media source; Direct Yandex Music is an explicit opt-in local CDP integration with the installed desktop client.
- Better Voice runs in-process in Rust; its React settings, meters and fox mascot live in `src/features/plugins/voice`.
- Start with `README.md` and `docs/ARCHITECTURE.md`. Consult `docs/MEDIA_ARCHITECTURE.md`, `docs/YANDEX_MUSIC_API.md`, `docs/BETTER_VOICE.md`, `docs/QA.md` and `docs/RELEASES.md` for the relevant subsystem.
- Use root and nested `AGENTS.md` files for Codex instructions. The original `.cursor/rules` files are retained for reference; do not rely on Cursor rule discovery in Codex.

## Scope

- Keep the React frontend in `src` and native Tauri behavior in `src-tauri`.
- Do not move provider arbitration or Windows media behavior into the frontend.
- Preserve the public `useIslandApp` facade when changing app state internals.
- Keep the configured media provider authoritative; Direct timeouts must not inject SMTC state or commands. Preserve explicit consent for Direct connection and client restarts.
- Keep behavior local-first with no telemetry, and preserve the portable GitHub Releases update channel.

## Frontend boundaries

- `src/shared` contains dependency-free shared types, utilities, tokens, and UI primitives. It must not import `app` or `features`.
- `src/app` owns orchestration and native adapters. It must not import feature UI.
- `src/features` may consume app state through `app/useIslandApp`. Direct `app/tauriApi` imports are reserved for feature-specific native interactions not represented by the app facade.
- Keep configuration, media, and window lifecycles in their corresponding `src/app` subdirectories.
- Run `npm run check:boundaries` when changing imports or layer ownership.

## Verification

- Use `npm run dev` for browser UI preview and `npm run tauri:dev` for native Windows behavior. Browser preview cannot verify SMTC, CDP, window hit-testing or the audio engine.
- Run `npm test`, `npm run build`, and `npm run lint` for frontend changes.
- Add characterization tests before changing timing, seek, session, or overlay-mode behavior.
- For native changes, run `cargo check --manifest-path src-tauri/Cargo.toml` and relevant Rust tests; use `docs/QA.md` for affected Windows behavior and report any checks that could not run.
- `npm run tauri:build` creates the portable build and copies it to `release/music-island.exe`.
- Do not commit generated release artifacts.

## Fox mascot videos

- Magnific exports always have a **black plate**. Ship only WebMs that went through frame flood-fill → RGBA → VP9 alpha (`.local/process_fox_alpha.py`).
- Never invent pack variants by remuxing WebM with `reverse` / `setpts` alone — that re-bakes the black background. Build variants from **already punched** PNG frames.
- Idle targets ~3s (4 live seeded-random + 1 sleep); transitions ~2s (wake / to-sleep single). Start/Stop finish the current clip — do not hard-cut mid-loop.
- Before changing fox assets, playback or `.local/process_fox_alpha.py`, read `src/features/plugins/voice/AGENTS.md` for the complete alpha pipeline and motion QA rules.
- `.local/magnific-fox-mascot.md` contains additional local generation notes. `.local/` is ignored by Git and may be absent from a fresh checkout; do not commit it or assume its tools exist on another machine.
