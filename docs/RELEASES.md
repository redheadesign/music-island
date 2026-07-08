# Releases

## MVP Manual Release

1. Install prerequisites: Node.js, Rust, Microsoft C++ Build Tools and WebView2 runtime.
2. Bump versions in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. Build the app:

```powershell
npm install
npm run tauri:build
```

4. Use the root `release/` folder for human-friendly artifacts. The `posttauri:build` script copies installers there automatically after a successful build.
5. Upload the NSIS setup `.exe` from `release/` to GitHub Releases.
6. Include changelog, screenshots/gif and known limitations.

We ship **NSIS `.exe` only**. MSI/WiX bundles were removed — they targeted enterprise silent deployment and duplicated locale installers (en-US / ru-RU) without benefit for normal users.

If you already built the app and only need to refresh `release/`, run:

```powershell
npm run release:copy
```

## Updating Over Previous Versions

Keep `identifier`, `productName` and bundle identity stable after the first public release. User config is stored in app data, not in the install folder, so installer updates should preserve settings.

## Future Auto-Update

Tauri updater requires signed update artifacts. Before enabling it:

1. Generate a Tauri signing key.
2. Put the public key into `tauri.conf.json`.
3. Store `TAURI_SIGNING_PRIVATE_KEY` and password in GitHub Secrets.
4. Enable `createUpdaterArtifacts`.
5. Publish signed bundles and `latest.json` through GitHub Releases.

The planned endpoint is:

```text
https://github.com/<user>/music-island/releases/latest/download/latest.json
```

Unsigned updater builds should not be shipped.
