# Releases

Music Island ships as a **portable** `music-island.exe` under GPL-3.0-or-later. That remains the forever distribution model: users download or auto-update the same single file from GitHub Releases. There is no installer requirement.

## 3.1.0 release

Release tag
`v3.1.0` and the English body in [3.1.0 release notes](releases/3.1.0-release-notes.md).
Upload the exact `music-island.exe`, `SHA256.txt`, and
`THIRD_PARTY_NOTICES.md` in `release/v3.1.0-ui/`. The Windows x64 executable is
76,886,528 bytes. SHA-256:
`b625365a6357eb31a97926f6ec73436f48b71b731b0150fe61b36b1d24201abe`.
The earlier `release/v3.1.0/` packet is superseded and must not be uploaded.

## 3.0.4 release

The user accepted the tested build and explicitly authorized publication on
2026-10-21. Publish the exact packet under `release/v3.0.4/`: `music-island.exe`,
`SHA256.txt` and `THIRD_PARTY_NOTICES.md`, with tag `v3.0.4` and the English
body in `docs/releases/3.0.4-release-notes.md`. Do not rebuild the accepted EXE.
The executable is 76,377,600 bytes, SHA-256
`be890622ed301005686b6dac765f5c5f86547aa7f415696e492685403557629c`.

Following October 21 dictation regressions, withdraw the
3.0.3 Windows clipboard experiment and hold pipeline ownership through queued
insertion. Preserve appearance and rendering changes. The earlier fixed-delay
limitation and unconfirmed native heap-corruption cause remain documented in
[rollback QA](QA_DICTATION_ROLLBACK_3_0_4.md).

## 3.0.3 release

The user accepted revision 2 after Windows testing and authorized publication on
2026-10-20. Publish the exact accepted packet under `release/v3.0.3-r2/`:
`music-island.exe`, `SHA256.txt` and `THIRD_PARTY_NOTICES.md`, using the English
body in `docs/releases/3.0.3-release-notes.md`. The version tag is `v3.0.3`.
Do not rebuild the accepted executable or commit generated release artifacts.

The executable is 76,403,200 bytes (72.86 MiB), SHA-256
`347a12a958273a84e7b2e1438e84e8072d4ade1a68600a930a7181c22b4e07ca`.
The earlier `release/v3.0.3` packet is superseded and must not be uploaded.
Verification and user acceptance are recorded in
[3.0.3 release QA](QA_RELEASE_3_0_3.md). This patch fixes Windows clipboard timing,
compacts Classic spacing, improves Fox/effect rendering and language formatting,
and defaults the theme picker to Fox, Waves, Classic while preserving saved choices.

## 3.0.2 release

The user accepted the final Windows candidate and authorized publication on
2026-10-12. Publish the exact tested packet under `release/v3.0.2-direct-launch/`:
`music-island.exe`, `SHA256.txt` and `THIRD_PARTY_NOTICES.md`, with the English
body from `docs/releases/3.0.2-release-notes.md`. Generated files stay ignored.

The executable is 76,391,936 bytes (72.85 MiB), SHA-256
`d801d5b05b0ad61a843cc909818bd6c13813dcaabcd2244227bbfb73c550cc84`.
Verification and user acceptance are recorded in
[Direct launch release QA](QA_DIRECT_LAUNCH_3_0_2.md); the optimization review is
in [build review](REVIEW_BUILD_3_0_2.md).

The earlier `release/v3.0.2/`, `release/v3.0.2-input-fix/` and
`release/v3.0.2-optimized/` packets are superseded. Do not publish them.
Reuse the approved executable without rebuilding unless compiled inputs change.

## Manual release checklist

1. Bump versions in `package.json` / `package-lock.json`, `src-tauri/Cargo.toml` / `Cargo.lock`, `src-tauri/tauri.conf.json`, `APP_VERSION` in `src/features/settings/SettingsPanel.tsx`, and the updater `USER_AGENT` in `src-tauri/src/updater/mod.rs`.
2. Refresh `CHANGELOG.md` and the public `README.md` status line.
3. Run the frontend and native checks:

```powershell
npm test
npm run build
npm run lint
npm run check:storybook
npm run build-storybook
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib
```

4. Push the candidate branch. Open [Build Music Island for Windows](https://github.com/redheadesign/music-island/actions/workflows/portable-windows.yml), select **Run workflow**, and choose that branch. Use this workflow for all portable test and release builds.
5. Download the artifact from the successful run. Record the run URL and its source commit. From the extracted artifact directory, verify the executable against the included checksum:

```powershell
$hash = (Get-FileHash -Algorithm SHA256 release/music-island.exe).Hash.ToLowerInvariant()
if ((Get-Content release/SHA256.txt -Raw).Trim() -ne "$hash  music-island.exe") { throw "SHA256 mismatch" }
```

6. Verify the artifact on Windows before upload: embedded frontend assets and version, startup/restart, overlay and Settings windows, real taskbar visibility/input/autohide, configured media-provider authority, and reconnect of each explicitly enabled usage provider without another consent toggle.
7. Draft a GitHub Release with a version tag pointing to the commit from the approved run. Upload that artifact's `music-island.exe`, `SHA256.txt` and `THIRD_PARTY_NOTICES.md`. The updater requires the first two exact, case-sensitive asset names.
8. Use the versioned release notes as the draft body and verify the uploaded files against the artifact. Publish the verified draft after release approval.

Write public release notes and changelog entries in English for the repository's
English-speaking audience. Keep the versioned release-notes file and the published
GitHub Release body in sync when correcting the copy.

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

The Windows workflow sets up CMake, Vulkan SDK, baseline ONNX Runtime 1.24.2 and VC143 redistributable files as described in [DICTATION.md](DICTATION.md). It runs `npm run tauri:build` to embed the native dictation runtime and package the portable EXE. Keep the exact Cargo locks, Handy MIT attribution, native dependency notices and bundle hash manifest. Keep generated runtime bundles and EXEs out of Git.

The `tauri:build` script now supplies `--no-bundle` by default, so the plain command
also creates the portable EXE without downloading NSIS or producing an installer.

The optional recognition weights are separate downloads with their own
licenses. The EXE bundles the small Silero VAD and GigaAM vocabulary.

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
