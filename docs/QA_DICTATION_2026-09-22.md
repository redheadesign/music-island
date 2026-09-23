# Dictation and graphite UI verification · 22 September 2026

This is a local implementation/build report, not a published release or a claim
that every interactive Windows acceptance case has passed.

## Final local artifact

`release/music-island.exe`: x64, 152,123,392 bytes (145.1 MiB).
SHA-256: `84f7e6d54fb284370c7493ecfc779675c00cf2c5f16934d99d6d65d3f3800bd9`.
The canonical copy matches the release target and `release/SHA256.txt`. Its embedded
frontend matches the final production build (`index-DQvyQFBT.js`,
`index-Do-UERFX.css`). The portable build completed successfully. The application
version remains 2.0.0; this is an unpublished local test build.

## Automated checks

- Frontend: 129 tests across 22 files. Includes seek → immediate navigation → late
  position events, source changes, six drag geometry scales, settings scroll reset,
  native shortcut capture lifecycle and completions after disabling dictation.
- Contract: all 118 frontend dictation commands match native registrations and the
  settings allowlist. The generated Tauri ACL includes separate island/overlay
  capabilities with only the required commands.
- Rust: 90 host tests passed, four hardware probes ignored; 255 Handy adapter tests
  passed. Includes download cancellation/resume, storage boundaries, copying
  imports without changing originals, DPAPI and coordinator activation modes.
- Production TypeScript/Vite build, lint, import boundaries, Storybook typecheck
  and static build passed. Seven pre-existing fox lint warnings remain. Native
  adapter dead-code warnings concern retained upstream/platform entry points;
  not every retained function is registered in the host.

The DPAPI tests ran under the normal Windows account: its protected keys are not
available to the restricted sandbox identity. Loopback HTTP cancellation tests
disable the system proxy only for their test client.

## Browser review

Reviewed real components in Storybook: Appearance, dictation Models/Advanced,
download consent, onboarding, light and dark themes, RU/EN and quota edge cases
`0%`, `9%`, `99%`, `100%`, `—`. The island and satellite material stays independent
of the graphite settings palette.

Interactive stories passed for fast mouse/keyboard Play and Like, four onboarding
steps, model dialog cancellation and return focus, keyboard placement, moving Like
between zones/catalog, and preserving a connected Codex widget after layout reset.
The drag geometry story verifies the body portal, off-center grab point, displayed
width/height at 65/100/125/150/200% transforms, and Escape without a save. This is
browser transform coverage, not Windows DPI verification.
An actual browser pointer gesture also moved Shuffle from the catalog into the
island's left reaction group. Import preview passed with no automatic selections
or accessibility violations in the open dialog.

The data deletion confirmation story passed without executing deletion, including
the listed scope, preservation of Handy/shared HF/EXE and return focus on cancel.
The dictation overlay error state passed its copy-result interaction and reported
no accessibility violations. A failed paste keeps the text available independently
of history storage; actual native clipboard/paste behavior still needs the Windows
acceptance below.

Measured settings content scrolling while the header and left menu stayed fixed;
selecting the same page preserved its offset, another page reset it to zero.
Native dialog Escape was also checked with real browser keyboard input.

## Native packaging, recognition and cleanup

The EXE-only CLI probe extracted and verified its own DLL bundle, initialized the
runtime, enumerated CPU/Vulkan devices, ran silent frames through Silero VAD, loaded
an official Handy Tiny GGUF, recognized synthetic Russian and English WAVs, and
unloaded the model. The test folder contained only the application EXE, with
APPDATA/LOCALAPPDATA redirected into disposable repository fixtures. This proves
the bundle can load without adjacent DLLs; it is not a clean Windows VM test.

Model: `whisper-tiny-Q8_0.gguf`, 45,981,088 bytes,
SHA-256 `325b9c7997cd1eff81ef709d55766565e71be696130cc3a3d444713798706834`.
Source: [Handy model, pinned revision](https://huggingface.co/handy-computer/whisper-tiny-gguf/tree/6687f30c99641ee265df421e582354adbc8848fc).
Audio was generated locally with Windows voices; no microphone or personal speech
was captured, uploaded or sent to a cloud provider.

On Ryzen 7 4700U, CPU backend and identical model/audio with other builds stopped:

- Music Island, three fresh processes: Russian 8.075 s → 620/605/577 ms;
  English 6.035 s → 469/493/457 ms. Model load 107–143 ms; sampled peak process
  working set 233.3–233.9 MiB. Backend initialization 299–354 ms after the first
  1,527 ms run, separate from recognition timing.
- Installed Handy, copied to an isolated portable fixture with no user history or
  keys, CPU device index 1, three runs per process: Russian 1,123/1,105/802 ms;
  English 919/901/554 ms. Model load 137–180 ms; sampled peak 134.0–134.3 MiB.
  The installed binary's version was not established, so this is not labeled a
  v0.9.7 performance baseline.

Both produced the same expected sentences. These are different CLI harnesses:
Music Island also probes VAD and maps its embedded bundle. The higher peak memory
is recorded, not explained away as equivalence or proven to be a leak. Full app
idle/recording memory and same-version upstream comparison remain to be measured.
The initial slower run overlapped compilation and is excluded from this comparison.

The final EXE was then copied into a new EXE-only folder and run with fresh isolated
AppData. Russian recognition took 681 ms, English 475 ms; both produced the expected
sentences, passed VAD and reported model unload. Sampled peak private memory was
470.4/470.6 MiB; peak working set was 249.1/233.4 MiB. In an adjacent single-run
comparison, the isolated installed Handy recognized the same Russian audio in
612 ms with 459.8 MiB peak private memory and 132.8 MiB working set. Private memory
and resident working set are different measurements: the observed private-memory
difference was about 11 MiB. These short CLI probes do not establish full-app idle
usage, sustained performance or parity with the pinned upstream version.

The cleanup helper was tested on three owned fixture roots. It waited for a live
parent to exit, removed all three, and preserved separate Handy/HF/EXE sentinels.
A junction pointing out of the owned tree was removed without touching its target.
The real user profile and installed Handy data were not deleted or modified.

Local evidence is in ignored `.local/dictation-qa/`: benchmark JSON, WAV/model
fixtures, isolated runtime reports and `cleanup-result.json`. Build/check logs are
under `.local/`; generated executables remain in ignored `release/`.
Final artifact metadata and sampled CLI measurements are in `final-artifact.json`
and `final-exe-probes.json` in that evidence directory.

## Still requires interactive Windows acceptance

- Actual microphone RU/EN, long recording, device removal/change, all shortcut
  modes, cancellation during long ASR, sound/mute restoration, and concurrent
  Better Voice/music playback.
- Nonactivating overlay on the target monitor, paste into several real editors,
  a closed/inaccessible target, clipboard restoration and fallback copying.
- Native SMTC/CDP seek/navigation, session loss, first-launch/late-intro/hover
  dismissal, autostart and developer replay.
- Windows DPI 100/125/150/200%, taskbar/window hit testing, different monitors,
  actual interrupted external download and insufficient disk space.
- A clean machine without Handy/toolchain dependencies, disabled-feature resource
  measurements and a same-version Handy benchmark over long audio.

Native GUI control was unavailable to the implementation session. Browser and CLI
results above do not stand in for these checks. No public release was published.
