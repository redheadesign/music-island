# Music Island 3.0 release candidate · 23 September 2026

This is a local candidate, not a published release. The working tree also contains
the earlier dictation and consistency passes; their detailed native evidence is in
[dictation QA](QA_DICTATION_2026-09-22.md) and [consistency QA](QA_CONSISTENCY_2026-09-23.md).

## Automated verification

The final branding/copy pass reran the frontend and Storybook checks and portable
packaging. Native source tests below are retained from the preceding implementation
pass; no Rust lifecycle/audio behavior was changed by the portrait or media work.

- Frontend: 150 tests in 27 files passed. Includes RU/EN catalog ranking and
  installed/selected preservation, immediate playback commands, inward wave
  geometry, rapid press limits and cleanup on unmount.
- Production build, lint and import boundaries passed (210 source files). Seven
  pre-existing fox hook/export warnings and the existing large-chunk warning remain.
- Final Storybook type check and static build passed, including the media tools.
- `cargo check` passed. Host Rust tests: 99 passed, four hardware probes ignored.
- Handy adapter: 258 tests passed in the restricted test context. Its DPAPI round
  trip failed because that Windows token could not decrypt the fixture; the same
  test passed in the ordinary user context (259 distinct tests passed in total).
- New onboarding tests cover explicit startup consent, preserving existing startup
  on skip, partial registration rollback, save failure, stale generations and
  avoiding the wizard for existing users / Windows startup.
- Latest monitor/window pass: `cargo check` and 43 window tests passed (three
  hardware probes ignored). Covers explicit/primary selection, disconnect/reconnect,
  negative origins, rotation/DPI snapshots and rejecting the initial stale viewport.
  Frontend tests cover delayed readiness, cleanup, accent contrast and taskbar drag.

## Browser review

The workshop uses real production components with fictional models, microphones,
history and media. It never activates a microphone or changes Windows startup.

- Shared dropdowns: dark/light, bottom-right viewport placement, list scrolling,
  End/Enter/Escape and restored trigger focus; compact popover shadow.
- Model cards: recommendation, selected/loaded distinctions, progress/cancel,
  retry, compact details and shared action menu. Recommendations do not switch
  the user's selected model or recognition language.
- Onboarding: four-step flow, explicit startup CTA, skip-to-startup, existing
  enabled state and recoverable registration error. Light composition reviewed.
- Drag regression: the arrow SVG and ghost container are both checked at
  65/100/125/150/200% transforms, retaining the grab point and rendered dimensions.
  Escape does not persist a layout. These browser scales are not Windows DPI.
- A real browser pointer drag moved Previous from the preview to the catalog:
  one config commit, no element left in the player, and no ghost after release.
- UI copy now describes the optional dedicated shortcut under “AI processing” /
  «Обработка с ИИ». Regular dictation remains local.
- Latest review: taskbar panel gaps and the shared Appearance controls panel in
  dark/light; recommendation beside title and narrow long-name wrapping; unified
  search surface with filtering, clear and focus restoration; scope reset for all
  three sections; monitor choice/disconnected state. Both editors' SVG geometry
  stories ran after extracting the shared drag clone, without browser errors.

## Release media

Sources: `src/stories/release/Release3*.tsx`, shared ReleaseScene, production UI.
Six README images: 1440×900 WebP plus 2880×1800 PNG masters. Exactly three Russian
Telegram images: 1080×1350. Copy: `docs/releases/telegram-3.0.md`.

The two 46-second storyboards share a source timeline, with EN 1920×1080 and RU
1080×1920 adaptations. Text, model states and audio levels are demo fixtures.
Download/recognition times are editorial demonstrations, not measured performance.
EN is silent. RU uses **Wanderlust — Scott Buckley**, CC BY 4.0, 00:00–00:46,
with attribution in the final frame, metadata and post. See
[media sources](releases/3.0-media-sources.md).

Both videos have 1380 frames, 30 fps, H.264/yuv420p BT.709. The RU AAC container is
46.02 seconds; mean level −22 dB, peak −4.6 dB. Whole-file decoding, black-frame
checks, soundtrack metadata and the repository QR from both compressed MP4s passed.
Decoded contact sheets cover every second of both films; all scenes, the moving
light/dark divider, text, final portrait and QR were reviewed. Nine final seconds
remain for the download steps. No unintended text clipping or empty Warp areas
were observed. This is visual/technical validation, not an acoustic listening test.
The image export now waits for a decoded alpha-video frame so Better Voice's fox
cannot silently disappear from its README image.

No terminal periods in promotional headings/paragraphs. Copy is concrete in the
cards, showreels, About, onboarding, README and Telegram draft. The animated theme
comparison is presentation-only; the app keeps its normal theme toggle.

Evidence: `.local/release3-qa/media.json`, `decoded/contact-*.png` and
`release/media-3.0/manifest.json`. All 17 images passed dimension checks.

## Final portable artifact

`release/music-island.exe`: version **3.0.0**, **153,537,536 bytes**, Windows x64.
SHA-256: `38749f165bbc21b2b0ebaeec39c3c5c4de705bfb1001c957aac827cb7d06716f`.
Canonical EXE, Cargo output and SHA256.txt agree. Authenticode: **NotSigned**.

The final frontend (`index-GDy10p-W.js`, `index-C42JRc7p.css`) and portrait SVG
(`app-icon-XqALtSMW.svg`) are embedded. All six native ICO images (16/32/48/64/128/256)
were matched byte-for-byte against the executable's resources. About's image box
was checked at 80×80 with radius 0 in the browser; dark/light and 16–256px logo
stories were reviewed. Browser icon and launch now use the same canonical source;
legacy Vite/white-only marks were removed.

The EXE was copied alone to a workspace-owned `exe-only` folder. Fresh disposable
Roaming/Local profiles (`profile-portrait-20260923-ru/en`) established runtime
extraction, ABI 1, VAD, Russian/English recognition from synthetic WAVs, and model
unload in both runs. No real microphone or user Handy profile was used.
Recognition took 8731 ms RU / 5011 ms EN in this packaging run, with sampled peak
private memory about 471.1 MiB. These are not controlled performance benchmarks
or a Handy comparison; the machine had just completed native compilation.
Evidence: `.local/release3-qa/artifact.json`, `embedded-frontend.json`, `probes.json`.

Final `npm run tauri:build` completed with the default `--no-bundle` path (native
build 5m46s); no installer or adjacent DLLs are needed. Video encoding then ran
sequentially with two encoder threads. Generated EXEs/masters/frames are ignored.

## Outstanding native acceptance scenarios

Browser stories and CLI inference do **not** establish the following:

- Clean-machine first launch, replay, startup consent/decline/error and actual
  Windows sign-in; persisted hint disappears after opening the island.
- Real tray Exit while recording, recognizing or downloading; model/microphone
  release and window shutdown, with Better Voice active concurrently.
- Real microphone, long dictation, device changes, focus/clipboard insertion in
  different apps; native SMTC/CDP and rapid pointer entry/exit at the top edge.
- Windows DPI 100/125/150/200%, multiple monitors and taskbar work areas.
- Primary/secondary selection on real hardware, unplug/replug, portrait rotation
  while idle, no initial top-left flash; Settings foreground on one press after
  switching to another application. Native GUI behavior is not established by
  the monitor policy tests or the Storybook navigation checks.
- External downloads during network loss, disk exhaustion or model corruption;
  long-run memory/latency comparison on identical hardware, model and input.

Native GUI automation is unavailable in this session. These items remain explicit
manual acceptance work and must not be reported as passed by a browser/CLI probe.

## 2026-09-23 · logo roles and three motion concepts

This entry supersedes the prior portrait-in-tray candidate. The user explicitly
requested skipping normal app automated tests and regression verification for
this iteration. npm test, lint/boundaries, Storybook test/typecheck suites,
cargo check/tests and native smoke/GUI scenarios were NOT rerun. Do not infer
validation of this build from earlier test counts.

The required npm run tauri:build succeeded, including frontend tsc/Vite and
native portable compilation (4m58s). Standard white-center PNG/ICO were generated;
About uses the compressed portrait; intro uses the restored white mark. The
original supplied photo is unchanged. Portrait WebP 768x768 = 23,728 bytes;
complete portrait SVG = 33,261 bytes. Browser composition was inspected.

Candidate: release/music-island.exe, version 3.0.0, 152,837,120 bytes, NotSigned
SHA-256: 3bd18854d827ecb9a08b7b2454e2d5f1f8eab49208412e505ac46ba7cdcb533d
release/SHA256.txt contains the same checksum. It is not an Authenticode signature.

Media production is separately documented in MOTION_PRODUCTION.md; media
inspection/decode checks are export checks, not application regression tests.
Native manual acceptance above remains outstanding. No publication was performed.

Final media exports: classic RU/EN = 1,380 frames each, Continuous RU = 1,200,
Rhythm RU = 1,080; all 30fps/H.264, RU AAC, EN silent. Full decoding, black-frame
detection and final GitHub QR decoding passed for all four. RU audio mean/peak:
classic −19.4/−2.1 dB, Continuous −19.2/−2.3 dB, Rhythm −20.0/−1.6 dB.
Technical levels and cue positions were checked; no real-time listening review.
Full-timeline contact sheets and critical full-size compositions were inspected.
The sunlight insert received a contrast correction before its final encode.
The ignored media manifest records 19 images, four videos and their SHA-256 sums.

Final video SHA-256:
- Continuous RU: 8716da540659594cdbaf4853a40dc39f53cb88db19e0d5b99bc8fe109f6207e7
- Classic RU: 575b4b4da73518a73697ea4ab81c8153318a77a88832325d5a7574579d37fe65
- Classic EN: a272dd84c8de4c227f8fb7987bc596a7e15e78c17ba74c156656bffee1668a60
- Rhythm RU: 3413825ccb401b1626377f6d71ba0d3b196d691dda3e729c53722a660b8230ff

## 2026-09-23 · publication and stock soundtrack revision

The user accepted the application after personal use and explicitly requested
publishing version 3.0 on GitHub. The request to skip normal automated and native
regression checks remains in force. The outstanding native scenarios above are
not claimed as passed; the user acceptance does not establish those individual
results. No application code or portable executable changed in this media pass.
The EXE checksum was rechecked against SHA256.txt and matches the build above.

The preceding media hashes describe the preserved archive, not the published
revision. All four current films, including English, now have AAC audio from the
same existing Mixkit recording, Tech House vibes, with recorded sea/cricket
ambience. No generated music or synthesized interaction effects remain. Raw
stock audio and dated archives are local, ignored inputs. Licensing and download
sources are recorded in releases/3.0-media-sources.md and stock-audio.json.

All six README feature compositions were exported again over the approved dark
Paper Warp: 1440x900 WebP and 2880x1800 local PNG masters. Three Russian Telegram
cards retain 1080x1350 dimensions. The English movie is linked from its refreshed
README poster; GitHub sanitizes raw video HTML, so this is a clickable preview.

The Rhythm film now retains each natural video layer through its transition to
the interface, including its held final frame, without remounting or restarting
the reveal at the scene boundary. The end card uses darkened moving water from
the opening. These are Storybook/export-only changes.

Final media verification passed for all four current movies: full decode,
H.264/30fps, expected frame counts, no black frames and a readable repository QR.
Classic RU/EN contain 1,380 frames each, Continuous 1,200 and Rhythm 1,080.
The final Rhythm is 36.01 seconds and 11,675,476 bytes. Mean/peak audio levels:
classic RU/EN and Continuous -14.9/-2.7 dB; Rhythm -15.0/-2.7 dB. Audio inspection
remains technical; no real-time listening review is claimed.

Full-timeline compositions, all three nature-to-interface seams and the final
eight-second hold were inspected. Source frames and media.json remain local.
The release archive is `release/media-3.0/archive-2026-09-23-before-stock-audio`.
The GitHub-uploaded EXE and first three movie digests match the local artifacts.

Final current video SHA-256:

- Classic RU: e48555a71eeb9f13e9dbc087bfb62e8f3fdf7cf757f79e70757f9fbe4449190c
- Classic EN: d1fe35934c032d0767c06f2d9babbebf228ebb187e9fca5a6bcb88b884d79a45
- Continuous RU: 2b7d48ad3294cca5d2692fdb242d925b10f062beba303f88b0f34d804799e990
- Rhythm RU: 2db22aaadf80d8c1ba4cf427335af32c393f3e1702d710fbb0d2052f65481c17
