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
9. Upload `release/music-island.exe`, `release/SHA256.txt` and the repository's `THIRD_PARTY_NOTICES.md` to the same GitHub Release (tag like `v3.0.0`). The updater requires the first two exact, case-sensitive asset names and ignores the documentation asset.
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

The 3.0 runtime keeps this single-file channel. The taskbar player is a same-process native Win32 child rather than a WebView, assistant limits remain separate local opt-ins, and island/taskbar layout preferences remain ordinary schema-compatible config values. None of these features adds an installer, account proxy or background service.

## Optional later: Authenticode

Code-signing the portable exe reduces SmartScreen friction. It does **not** change the update model (still GitHub → replace exe). `SHA256.txt` is required for every release consumed by Music Island 2.0 or later. The checksum protects against a mismatched or corrupted asset under the existing GitHub HTTPS trust model; it is not proof of publisher identity.

The Tauri plugin updater with signed `latest.json` bundles is **not** required for Music Island’s portable channel.

## Dictation bundle prerequisite

The portable build now also builds and embeds the native dictation runtime. Install/configure CMake, Vulkan SDK, baseline ONNX Runtime 1.24.2 and VC143 redistributable files as described in [DICTATION.md](DICTATION.md). `npm run tauri:build -- --no-bundle` remains the entrypoint. Do not ship only the inference DLL or require Handy to be installed. Keep the exact Cargo locks, Handy MIT attribution, native dependency notices and bundle hash manifest. Never commit generated runtime bundles or EXEs. Model weights are optional separate downloads with their own licenses.

The `tauri:build` script now supplies `--no-bundle` by default, so the plain command
also creates the portable EXE without downloading NSIS or producing an installer.

## 3.0 preparation

Version 3.0.0 was approved for publication by the user on 2026-09-23. Changelog/release copy: `docs/releases/3.0-release-notes.md`; Russian post: `docs/releases/telegram-3.0.md`. The Handy baseline and upgrade checklist remain in HANDY_ADAPTATIONS.md.

`npm run media:serve` starts the local-only export receiver. Open Screens/Release3 in Storybook on 127.0.0.1:6006 and choose “Export all 9 images”. Six English WebPs are saved to docs/media/v3, their 2x PNG masters to release/media-3.0/masters, and exactly three Russian PNGs to docs/releases/3.0.

Screens/Release3Motion provides the EN 16:9 and RU 9:16 timeline. The timing and soundtrack live in `src/stories/release/release3Motion.config.json`. Export 1380 frames (46 seconds at 30 fps) per locale, then run `npm run media:encode`. The start-frame control resumes an interrupted export; source frames live in .local/release3-frames. MP4s and posters are saved to release/media-3.0. All captures use fictional fixtures and actual components. They are demonstrations, not performance benchmarks.

Current RU and EN films use the same existing Mixkit recording, Tech House vibes,
with recorded sea/cricket ambience. No mandatory audio attribution is required. Sources, parameters and disclosure are documented in
[media sources](releases/3.0-media-sources.md). Full instructions for all three
concepts, archives and sound design: [MOTION_PRODUCTION.md](MOTION_PRODUCTION.md).
Use `npm run media:encode -- continuous-ru rhythm-ru` for the two new RU films.
The previous Scott Buckley attribution remains with archived versions only.

Run `node scripts/verify-release-media.mjs` after encoding. It verifies image sizes,
decodes all four complete videos, checks frame count/audio, reads the final QR through
jsQR and writes the ignored media manifest with SHA-256 hashes. Visual review of
all scenes and transitions remains required.

Do not commit native binaries, frame sequences or PNG masters. Keep the versioned web images, Telegram images and editable Storybook sources. Publication is an explicit separate action. For 3.0 the user approved publication after local app use; the latest normal automated/native GUI checks were not rerun, as recorded in QA_RELEASE_3.md.

The theme comparison slider exists only in release scenes: two copies of the same
settings component are clipped by a deterministic wipe. The application still uses
its normal theme toggle. Keep nine seconds for the final download steps and QR.

Encode adaptations sequentially. The exporter uses H.264 CRF 18 / medium with
two encoder threads and one filter thread to keep the desktop responsive. Finish
portable compilation before encoding on machines with limited CPU or memory.

The README leads with the refreshed English video poster linked to the 3.0 MP4
release asset. All six feature images use current components over the approved
dark Paper Warp. Native binaries, full-resolution masters, frame sequences, stock
audio and dated movie archives remain outside Git. Publish only the finished films
as Release assets alongside music-island.exe, SHA256.txt and THIRD_PARTY_NOTICES.md.
