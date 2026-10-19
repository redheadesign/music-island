## Revision 2 accepted — 2026-10-20

The original packet at `release/v3.0.3` remains preserved. A replacement candidate
is ready at `release/v3.0.3-r2`; the user confirmed that it works correctly and
authorized release on 2026-10-20. Only revision 2 is accepted for publication.
This revision adds Windows target-attributed delayed clipboard paste, guarded
clipboard restoration, compact 9px Classic label gaps, memoized language names,
and Fox as the default for profiles without an explicit saved theme. Theme order
is Fox, Waves, Classic. Wave thumbnails use the actual production renderer, with
a nonzero speech sample; no alternate SVG artwork is shipped.

Frontend: 256 tests/54 files, production build, lint/import boundaries (286 files),
Storybook typecheck and final static build passed. Browser checks measured
Classic hold width 148.56px, outer insets 14px and label gaps 9px; General selects
Fox by default and orders the theme radios as requested. Existing saved Classic
is retained by normalization. Screenshots are local under
`.local/release-3.0.3-r2-qa`.

Native core: 280 tests passed; its isolated Windows clipboard test passed
separately. The test delays target reading by 900ms, verifies actual restoration,
checks a mismatched reader PID and preserves a newer copy. The test process uses
its own window station and desktop. The final host tests and packet fingerprints
are recorded below. User Windows testing is accepted; individual manual scenarios
were not itemized by the user, so only the listed automated checks are independently
verified here.

## Exact revision 2 packet

- EXE: `release/v3.0.3-r2/music-island.exe`, version 3.0.3, 76,403,200 bytes.
- SHA-256: `347a12a958273a84e7b2e1438e84e8072d4ade1a68600a930a7181c22b4e07ca`.
- Host Rust: 127 passed/4 interactive ignored; cargo check passed.
- Dictation core: 280 passed/1 isolated test ignored in the normal suite; the
  isolated Windows clipboard regression passed in its own process.
- EXE-only CPU probes: Russian and English recognition, VAD, ABI 1 and unload
  passed; all 26 extracted dependencies matched the verified bundle.
- PE x64 GUI, all 52 embedded resources/27 DLLs verified; unchanged native payload
  is 107,028,593 raw bytes / 40,105,235 packed bytes. Embedded HTML/JS/CSS match
  the frozen frontend, and all 440 frozen inputs still match.
- Build: optimized production EXE, no installer; 10m47s native build. Checks and
  packet fingerprints: `.local/release-3.0.3-r2-candidate.json` and packet
  `CANDIDATE.json`. The original candidate remains byte-for-byte unchanged.

Publication was authorized by the user on 2026-10-20 after successful Windows
testing. Publish this exact EXE and matching checksum without rebuilding. The
first-candidate section below is retained as historical, superseded evidence.

## Preserved first-candidate verification (superseded)

Prepared on 2026-10-20. Publication awaits the user's Windows testing and explicit
approval. No release, tag, commit or push was created during preparation.

## Exact candidate

- File: `release/v3.0.3/music-island.exe`.
- Windows x64 GUI application, file version 3.0.3.
- Size: 76,396,032 bytes (72.86 MiB), 4,096 bytes larger than published 3.0.2.
- SHA-256: `00435754621354dc82ce3e76700beb247f5cc4211d2de19cda550cb693c1c568`.
- `SHA256.txt` contains one entry for this executable. The packet includes
  `THIRD_PARTY_NOTICES.md`, `RELEASE_NOTES.md` and a Russian testing README.
- Public release body: [3.0.3 release notes](releases/3.0.3-release-notes.md).

Publish this exact accepted executable without rebuilding. Check its hash against
the packet and `.local/release-3.0.3-candidate.json` immediately before upload.
Keep the release asset names `music-island.exe`, `SHA256.txt` and
`THIRD_PARTY_NOTICES.md`. Generated artifacts remain ignored.

## Completed checks

- 249 frontend tests in 52 files passed; production build, lint/import boundaries
  (282 files), Storybook typecheck and static build passed. Existing warnings
  remain; this is not a warning-free build.
- `cargo check --manifest-path src-tauri/Cargo.toml --locked` passed.
- Native tests: 127 passed, 4 existing interactive tests ignored. Tests used
  `--release --lib --features tauri/custom-protocol`, with only the application's
  test code set to opt-level 0 to reuse release dependencies without repeating
  the production executable's lengthy optimization.
- PE inspection confirmed AMD64 and the GUI subsystem. Candidate, native build
  output, root release copy and EXE-only probe copy have matching hashes.
- All 439 frozen source/configuration inputs were checked. Embedded HTML,
  `index-DEgZ3WAm.js` and `index-CMeTI3qC.css` match the frozen frontend.
- Verified all 52 embedded compressed resources, including all 27 DLL hashes.
  Raw payload: 107,028,593 bytes; compressed payload: 40,105,235 bytes.
- The unchanged dictation runtime/protocol sources and all 26 inference bundle
  DLL hashes were checked before reusing the previous verified bundle. No
  recognition backend, voice asset or fox video was removed or re-encoded.
- EXE-only runs in fresh, disposable RU/EN profiles passed ABI 1 initialization,
  CPU speech recognition, VAD and unloading. Each run verified 26 extracted DLLs.
  The probe uses WAV fixtures and does not open the microphone or use the real
  application profile.
- Browser review in the preceding implementation pass covered Classic hold
  insets (14/14 px), Fox restart/canvas retention, Fox hold, processing particles
  and live text. Version preparation changes their version labels only.

The portable host was built from the frozen frontend with the verified cached
inference bundle. Its final release compilation took 34m01s after native
dependency recompilation. Previous candidate packets were preserved.

## Manual acceptance still required

Check Classic spacing, first and repeated Fox appearance under the user's normal
Windows CPU/GPU load, hold/toggle shortcuts, ending a recording, live text,
switching themes, focus-preserving insertion and ordinary media controls.
Native UI latency, actual microphone capture, multi-monitor/DPI behavior, Windows
10 and a clean machine were not established by the CLI/browser checks above.

## Local evidence

- `.local/release-3.0.3-input/manifest.json` and its frozen `source/` / `dist/`.
- `.local/release-3.0.3-qa/`: frontend/native build, test and verification logs,
  isolated probe profiles and `probes.json`.
- `.local/release-3.0.3-artifact.json` and
  `.local/release-3.0.3-embedded-frontend/manifest.json`.
- `.local/release-3.0.3-candidate.json`, `release-3.0.3-stage-paths.json` and
  `release-3.0.3-publication.txt` preserve the publication handoff. In particular,
  stage only the version hunk of `package.json`; preserve its pre-existing
  landing scripts and all unrelated landing/media work.
