# Releases

Music Island ships as a **portable** `music-island.exe` under GPL-3.0-or-later. That remains the forever distribution model: users download or auto-update the same single file from GitHub Releases. There is no installer requirement.

## Manual release checklist

1. Install prerequisites: Node.js, Rust, Microsoft C++ Build Tools and WebView2 runtime.
2. Bump versions in `package.json` / `package-lock.json`, `src-tauri/Cargo.toml` / `Cargo.lock`, `src-tauri/tauri.conf.json`, `APP_VERSION` in `src/features/settings/SettingsPanel.tsx`, and the updater `USER_AGENT` in `src-tauri/src/updater/mod.rs`.
3. Refresh `CHANGELOG.md` and the public `README.md` status line.
4. Run the frontend and native checks:

```powershell
npm test
npm run build
npm run lint
npm run check:storybook
npm run build-storybook
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

5. Build:

```powershell
npm install
npm run tauri:build -- --no-bundle
```

6. Use the root `release/` folder. The `posttauri:build` script copies the portable executable there after a successful build and creates `SHA256.txt` with exactly one checksum entry for it.
7. Verify that the generated checksum matches the portable executable:

```powershell
$hash = (Get-FileHash -Algorithm SHA256 release/music-island.exe).Hash.ToLowerInvariant()
if ((Get-Content release/SHA256.txt -Raw).Trim() -ne "$hash  music-island.exe") { throw "SHA256 mismatch" }
```

8. Verify the portable file on Windows before upload: embedded frontend assets and version, startup/restart, overlay and Settings windows, real taskbar visibility/input/autohide, configured media-provider authority, and reconnect of each explicitly enabled usage provider without another consent toggle.
9. Upload `release/music-island.exe`, `release/SHA256.txt` and the repository's `THIRD_PARTY_NOTICES.md` to the same GitHub Release (tag like `v2.0.0`). The updater requires the first two exact, case-sensitive asset names and ignores the documentation asset.
10. Put the changelog body on the GitHub Release (the in-app update banner renders that markdown).

If you already built the app and only need to refresh `release/`, run:

```powershell
npm run release:copy
```

## Portable auto-update (shipped)

On start and from Settings → About, the app:

1. Queries `https://api.github.com/repos/redheadesign/music-island/releases/latest`.
2. Compares versions and, when newer, requires the exact `music-island.exe` and `SHA256.txt` assets.
3. Downloads the checksum and executable, verifies the executable's SHA-256 and PE magic, then stages and replaces the running exe, relaunches via a Unicode-safe PowerShell helper, and cleans `.old` / staging.

Config lives in `%APPDATA%\Music Island\`, so replacing the exe preserves settings. Keep `identifier` and `productName` stable across releases.

The 2.0 runtime still uses this single-file channel. The taskbar player is a same-process native Win32 child rather than a WebView, assistant limits remain separate local opt-ins, and island/taskbar layout preferences remain ordinary schema-compatible config values. None of these features adds an installer, account proxy or background service.

## Optional later: Authenticode

Code-signing the portable exe reduces SmartScreen friction. It does **not** change the update model (still GitHub → replace exe). `SHA256.txt` is required for every release consumed by Music Island 2.0 or later. The checksum protects against a mismatched or corrupted asset under the existing GitHub HTTPS trust model; it is not proof of publisher identity.

The Tauri plugin updater with signed `latest.json` bundles is **not** required for Music Island’s portable channel.
