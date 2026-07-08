# Contributing

Thanks for helping improve Music Island.

## Development

```powershell
npm install
npm run dev
```

Use browser preview for UI work. Use Tauri for native SMTC testing:

```powershell
npm run tauri:dev
```

Run the standard checks before opening a pull request:

```powershell
npm run test
npm run lint
npm run build
```

## Code Guidelines

- Keep native Windows API work in `src-tauri/src`.
- Keep UI state in `src/app`.
- Keep modules behind the module registry contract.
- Prefer local-first behavior and no telemetry.
- Do not copy assets from Apple, Wispr Flow, RuFlow or other reference projects.

## Pull Requests

- Include a short summary.
- List tested Windows versions and media players.
- Update docs when behavior or settings change.
