# Performance Notes

## Budget

- Idle CPU target: around 0-1%.
- Playing CPU target: low and stable, no busy polling.
- UI response target: under 50 ms for hover/click in normal desktop conditions.
- Expanded animation target: 180-260 ms.
- Memory target for MVP: roughly 100-150 MB for WebView plus Rust backend.

## Decisions

- Prefer SMTC events and throttled snapshots over high-frequency polling.
- Interpolate track progress in React from the latest native snapshot.
- Animate `transform`, `opacity` and CSS variables rather than layout-heavy properties.
- Cache artwork by track key when artwork extraction is implemented.
- Keep future transcription and local LLM work outside the UI thread in a worker or sidecar process.

## Diagnostics

Debug mode should expose app version, OS, config path, current media source and last SMTC error. Logs must be local and redacted.
