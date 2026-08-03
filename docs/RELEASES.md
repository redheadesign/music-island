# Releases

Music Island ships as a **portable** `music-island.exe` under GPL-3.0. That remains the forever distribution model: users download or auto-update the same single file from GitHub Releases. There is no installer requirement.

## Manual release checklist

1. Install prerequisites: Node.js, Rust, Microsoft C++ Build Tools and WebView2 runtime.
2. Bump versions in `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `APP_VERSION` in `src/features/settings/SettingsPanel.tsx`, and the updater `USER_AGENT` in `src-tauri/src/updater/mod.rs`.
3. Refresh `CHANGELOG.md` and the public `README.md` status line.
4. Build:

```powershell
npm install
npm run tauri:build -- --no-bundle
```

5. Use the root `release/` folder. The `posttauri:build` script copies the portable executable there after a successful build.
6. Upload `release/music-island.exe` to GitHub Releases (tag like `v1.3.0`).
7. Put the changelog body on the GitHub Release (the in-app update banner renders that markdown).

If you already built the app and only need to refresh `release/`, run:

```powershell
npm run release:copy
```

## Portable auto-update (shipped)

On start and from Settings → About, the app:

1. Queries `https://api.github.com/repos/redheadesign/music-island/releases/latest`.
2. Compares versions and, when newer, downloads the `music-island.exe` asset.
3. Checks PE magic, stages in temp, replaces the running exe, relaunches, and cleans `.old` / staging.

Config lives in `%APPDATA%\Music Island\`, so replacing the exe preserves settings. Keep `identifier` and `productName` stable across releases.

## Optional later: Authenticode

Code-signing the portable exe reduces SmartScreen friction. It does **not** change the update model (still GitHub → replace exe). Optional SHA256 notes on the Release page are also fine as a nicety.

The Tauri plugin updater with signed `latest.json` bundles is **not** required for Music Island’s portable channel.
