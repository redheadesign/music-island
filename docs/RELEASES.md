# Releases

## Beta manual release

1. Install prerequisites: Node.js, Rust, Microsoft C++ Build Tools and WebView2 runtime.
2. Bump versions in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
3. Build the app:

```powershell
npm install
npm run tauri:build -- --no-bundle
```

4. Use the root `release/` folder. The `posttauri:build` script copies the portable executable there after a successful build.
5. Upload `release/music-island.exe` to GitHub Releases.
6. Include the changelog, verification summary and known limitations.

The 0.9 beta ships as a single portable `.exe`. Installer and updater artifacts are intentionally deferred until signing and update distribution are ready.

If you already built the app and only need to refresh `release/`, run:

```powershell
npm run release:copy
```

## Updating Over Previous Versions

Keep `identifier`, `productName` and bundle identity stable. User config is stored in app data, not next to the portable executable, so replacing the executable preserves settings.

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
