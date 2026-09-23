# Repository maintenance review · 23 September 2026

This pass inventories tracked and nonignored project files, checks package/Cargo
entrypoints and import boundaries, and reviews settings, dictation persistence and
window/shutdown ownership. [REPOSITORY_INVENTORY.csv](REPOSITORY_INVENTORY.csv) lists
paths and subsystem roles. It is an inventory, not a claim that every vendored line
has received a security audit. Generated caches, models, build output and private
`.local` references are excluded.

## Removed or consolidated

- `.cursor/rules/fox-mascot-alpha.mdc`: its substantive instructions were already in
  `src/features/plugins/voice/AGENTS.md`. Root/nested AGENTS now name the Codex source
  of truth, avoiding a second stale rules file.
- Unused JavaScript/Rust standard Tauri updater dependencies and `updater:default`
  permission. The custom portable GitHub updater remains in use.
- Duplicate settings layout/style ownership in `App.css`, obsolete footer/feature
  switch/About decoration rules, and the old Better Voice dropdown stylesheet.
- Duplicated menus and ordinary controls across settings, Better Voice and dictation:
  shared `SettingsNavigation`, Button, Switch/FeatureToggle, inputs and Select now own
  those states. `DarkSelect.tsx` remains a thin compatibility re-export.
- Dictation field helpers moved out of the screen into `DictationFields.tsx`, removing
  a screen/advanced-settings import cycle.

- Legacy white launch-only `logo-mark.svg` and the unused Vite `favicon.svg`:
  launch, About, onboarding, the browser icon and native ICO now use the canonical
  portrait SVG through `AppLogo` or the icon generator.

## Scripts retained

- `build-dictation-runtime.mjs`, `build-portable.mjs`, `copy-release-artifacts.mjs`,
  `check-import-boundaries.mjs` and `generate-icons.mjs` are live build/check entrypoints.
- `collect-native-notices.py` records native license provenance; it is a manual
  maintenance step, not a runtime import.
- `package-better-voice-plugin.mjs` / `plugin:pack-voice` is legacy companion tooling.
  The optional plugin host still exists and `docs/PLUGINS.md` documents it. It is not
  needed for built-in Better Voice. Remove it only together with that compatibility
  contract; running it writes plugin folders and is not part of this verification.
- The CDP/SMTC/preview inspection and integration scripts are manual Windows QA tools.
  Absence from npm scripts is not evidence that they are dead. They are not shipped.

## Candidates for a later deletion

- `exercise-wave-wheel.mjs`, `test-wave-roundtrip.mjs`, and wave-specific assumptions
  in old diagnostics target the historical carousel experiments. The wave chip and
  compatibility state still exist. Retire these together if that feature is removed.
- Optional companion host/packager and their documentation can be retired if support
  for external plugin manifests is intentionally ended. Do not confuse that path
  with the built-in Better Voice or embedded dictation DLL.
- Historical release screenshots/docs remain provenance for published 2.0.0; they
  do not depict every current uncommitted screen. Regenerate only for a new release.
- `.local`, `src-tauri/target`, `dist`, `storybook-static`, `node_modules` and `release`
  are local/generated data. They are ignored, not unused source files. No automatic
  deletion was performed and no user models/history were removed.

## Persistence and architecture findings

- The app uses native JSON settings and Handy SQLite history, not a frontend database.
  A metadata-only path now shows installed models while dictation is disabled.
- Model installation, selection and in-memory loading are independent states. Late
  session responses no longer hide an imported model or reactivate a disabled view.
- History pagination previously increased a request that native code capped at 100.
  It now uses cursors; the regression test reads 160 records without duplicates.
- Fresh/upgrade SQLite migrations are characterized, lock contention has a busy
  timeout, and audio reads/deletes validate filenames plus symlink/reparse boundaries.
- Shutdown no longer joins recording/model workers on the Windows event loop. A single
  coordinator owns exit, and a generation owns overlay/intro transitions.
- `useIslandApp` remains public; app controllers do not import feature UI. The boundary
  checker covers the current frontend graph. A passing graph check does not establish
  runtime correctness of every Windows integration.

README, Architecture, Design System, Dictation, Privacy, Security, Storybook and QA
were updated against these ownership rules. The Phosphor MIT notice was added.
The build is checksum-verified but **not Authenticode-signed**.

## Reference inspection

SCRN Gallery and the accepted financial-app references informed consistent navigation,
clear feature toggles and restrained transitions. A read-only static inspection of the
provided Type.exe found an Electron/OpenWhispr-derived structure, a local GigaAM worker
and PostHog references. That establishes included components, not proof of what data
is sent at runtime. The competitor executable was not run, and no code/assets were
copied into Music Island. Music Island adds no telemetry.
