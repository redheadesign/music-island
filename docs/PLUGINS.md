# Plugins

Music Island stays a light portable music overlay.

**Better Voice ships in-process** (Settings → Better Voice, Beta). It does **not** require a sidecar package for normal use. See [`BETTER_VOICE.md`](BETTER_VOICE.md).

The sidecar host below remains for **optional companions** discovered by `manifest.json` (legacy / future plugins), not for the built-in voice engine.

## Portable paths

| What | Location |
|---|---|
| Core | single `music-island.exe` |
| Enable flags / settings blob | `%APPDATA%\Music Island\config.json` → `plugins` |
| Plugin packages (primary) | `%APPDATA%\Music Island\plugins\<id>\` |
| USB kit (secondary) | `<dir of exe>\plugins\<id>\` |
| Plugin logs | `%APPDATA%\Music Island\logs\plugins\<id>.log` |

Discovery order:

1. `%APPDATA%\Music Island\plugins\*\manifest.json`
2. `dirname(current_exe())/plugins\*\manifest.json`
3. Dev override: `MUSIC_ISLAND_PLUGIN_VOICE` → folder containing `manifest.json`

`entryExe` is always resolved relative to the plugin folder.

## Manifest (v0)

```json
{
  "id": "better-voice",
  "name": "Better Voice",
  "version": "0.3.0",
  "icon": "mic",
  "entryExe": "meowmic.exe",
  "entryArgs": ["--island-sidecar", "--hidden"],
  "ipc": { "kind": "tcp", "host": "127.0.0.1", "port": 38472 },
  "island": { "railActions": ["toggle", "open-settings"], "maxButtons": 2 },
  "settings": { "panel": "voice" }
}
```

Example: [plugins/better-voice.manifest.example.json](plugins/better-voice.manifest.example.json).

## IPC

JSON lines over TCP (`127.0.0.1` only). Request:

```json
{ "id": 1, "method": "ping", "params": {} }
```

Response:

```json
{ "id": 1, "ok": true, "result": { "pong": true } }
```

Better Voice methods: `ping`, `get_status`, `start_denoising`, `stop_denoising`, `update_denoise_config`, `get_audio_stats`.

## Better Voice (first plugin)

### Local test pack (recommended)

From Music Island repo, after both apps are built:

```powershell
npm run plugin:pack-voice
```

This copies `meowmic.exe` + `resources/` + `manifest.json` into:

- `release/plugins/better-voice/` (next to the portable exe)
- `%APPDATA%\Music Island\plugins\better-voice\`

Then:

1. Quit any old Music Island process (tray → Quit).
2. Start `release\music-island.exe` (About should show **0.9.10+**).
3. Settings → Plugins → Enable **Better Voice** → Open → Start.
4. Left rail mic icon toggles the engine when healthy.

### Dev override

```powershell
$env:MUSIC_ISLAND_PLUGIN_VOICE = "C:\path\to\better-voice\island-plugin"
```

Audio route stays: hardware mic → Better Voice → CABLE Input / VoiceMeeter Input; recording apps pick the virtual **recording** endpoint.

## Modules vs plugins

- **Modules** (`src/features/modules`) — content *inside* the island (music, future todo).
- **Plugins** — optional companions with a left rail icon and settings surface.

Handy STT and custom plugins can reuse the same manifest + IPC contract later. No marketplace in this pass.
