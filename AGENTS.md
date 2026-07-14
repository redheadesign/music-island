# Repository guidance

## Scope

- Keep the React frontend in `src` and native Tauri behavior in `src-tauri`.
- Do not move provider arbitration or Windows media behavior into the frontend.
- Preserve the public `useIslandApp` facade when changing app state internals.

## Frontend boundaries

- `src/shared` contains dependency-free shared types, utilities, tokens, and UI primitives. It must not import `app` or `features`.
- `src/app` owns orchestration and native adapters. It must not import feature UI.
- `src/features` may consume app state through `app/useIslandApp`. Direct `app/tauriApi` imports are reserved for feature-specific native interactions not represented by the app facade.
- Keep configuration, media, and window lifecycles in their corresponding `src/app` subdirectories.
- Run `npm run check:boundaries` when changing imports or layer ownership.

## Verification

- Run `npm test`, `npm run build`, and `npm run lint` for frontend changes.
- Add characterization tests before changing timing, seek, session, or overlay-mode behavior.
- Do not commit generated release artifacts.
