# Assistant usage indicator

The optional usage indicator shows the remaining rate-limit windows reported for Codex and Claude. Both providers are off by default and have separate Connect actions. It reports quota percentages and reset times only; it does not claim to represent all ChatGPT activity or monetary cost.

## Privacy and consent

- Codex runs the installed official `codex.exe app-server --stdio` directly by absolute path. Music Island sends `initialize` and `account/rateLimits/read` over newline-delimited JSON-RPC. It relies on Codex's own login and never reads account identity, its auth file, or an auth token.
- Claude is enabled only after the separate Claude action. Music Island reads the existing Claude CLI OAuth access token from `%USERPROFILE%\.claude\.credentials.json` or `%USERPROFILE%\.claude\credentials.json`. Its native process sends that token directly to Anthropic as a bearer token for `GET https://api.anthropic.com/api/oauth/usage` with `anthropic-beta: oauth-2025-04-20`; there is no Music Island proxy. Redirects are disabled. The token and response body are never logged, returned to React, or copied into Music Island settings.
- No usage data is sent to Music Island servers and there is no telemetry or push connection.

Consent is stored in the generic `plugins.settings.usage` object:

```json
{"codexEnabled": false, "claudeEnabled": false}
```

The native config lifecycle reads these flags only after the saved config is loaded or changed. A secondary window's temporary default config cannot start or stop a provider.

## Runtime contract

The native layer owns one cached snapshot for both windows and at most one polling task per enabled provider. Disabled providers perform no probes. Enabled providers refresh every five minutes. Each Codex probe finds the CLI through `PATH` or a bounded search of the installed Codex `bin`/`resources` directories under `%LOCALAPPDATA%`, starts a short-lived app-server child without a console window, and uses piped stdio, a 15-second deadline, bounded lines, discarded stderr, and guaranteed kill/wait on scope exit. Claude uses a 15-second client timeout and a 256 KiB response cap.

Commands:

- `usage_get_snapshot()`
- `usage_connect({ provider: "codex" | "claude" })`
- `usage_disconnect({ provider })`
- `usage_refresh({ provider })`

All commands return the shared `UsageSnapshot`; updates also emit `usage:snapshot`. Known auth failures clear cached quota and request a new login. Network and timeout failures keep a prior snapshot marked `stale`. Missing values stay null and render as a dash, never as zero.

Codex selects `rateLimitsByLimitId.codex` when present and otherwise uses the legacy `rateLimits` snapshot. Primary and secondary durations are read from the response instead of assuming which one is weekly. Claude accepts the current `five_hour` / `seven_day` response and the observed `limits[]` form. Provider API changes surface as `no-data` or `protocol-error` without exposing raw response text.

## Sources and compatibility

- [Codex app-server protocol README](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md)
- [Codex app-server protocol types](https://github.com/openai/codex/tree/main/codex-rs/app-server-protocol)
- [Anthropic OAuth and rate-limit discussion in Claude Code](https://github.com/anthropics/claude-code/issues/1225)

The Claude usage endpoint is used by Claude clients but is not documented by Anthropic as a stable public API. Reading the local CLI credential and making this direct request therefore remain explicitly opt-in, bounded and fail-closed. The implementation was written independently; no Codenotch source was copied, so no third-party MIT notice is required for these files.
