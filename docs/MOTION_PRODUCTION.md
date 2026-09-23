# Release 3 motion production · 23 September 2026

Three concepts share actual React components, demo fixtures, the deterministic
Storybook clock and the same image export pipeline. No media exporter or provider
SDK is bundled into the application.

- `classic`: retained 46s composition, RU 1080×1920 and EN 1920×1080. The footer
  uses the standard mark, final uses portrait, QR spacing is 96px RU / 64px EN.
  Handy now has its own animated file-copy scene, rather than a repeated catalog
- `continuous`: «Одно движение», RU 1080×1920, 40s. Fixed focal region, mask
  transitions, real settings rearrangement and theme comparison, download,
  dictation, history, animated Handy copy, eight-second download/QR finale
- `rhythm`: «В своём ритме», RU 1080×1920, 36s. Natural water/stone image pulls
  into the desktop; reed rhythm leads to dictation, sunlight to theme comparison
  and an eight-second dark end card over the slowly moving water. Generated
  inserts contain no UI or logo. Each natural clip stays mounted while shrinking
  into its UI scene; its last decoded frame is held instead of swapping to the
  still image or replaying a reveal. The final water clip runs once at half speed

The user rejected the initial plastic ribbon direction. It is archived only in
`.local/motion-20260923/rejected`. New visuals were made through Strophe, using
Seedream 5.0 Pro then Seedance 2.5. Built-in ImageGen was not used for replacement
images. The previously accepted album cover remains unchanged.

Reference study: the four user-supplied `IMG_7136`–`IMG_7139` videos were visually
sampled throughout at 2fps. Key principles: a real-world shot revealed inside a
screen; stable subject under changing controls; click → visible result; UI
opening into full-bleed content. No reference footage or soundtrack was reused.
This is visual analysis, not a claim that reference audio was auditioned.
The accessible part of the Anshu Chimala article informed concrete directions,
reference comparison and the final removal of decorative clutter; paywalled
content was not treated as read.

## Export

1. Run `npm run storybook` and `npm run media:serve`
2. Open `Screens/Release3Motion`, select Classic / Continuous / Rhythm
3. Review `Export storyboard`, then `Export ... frames`; Start frame resumes a
   stopped capture. Optional End frame limits a replacement range (both bounds
   are inclusive, zero-based). For example, 630–749 replaces 21–25s at 30fps.
   Keep source files unchanged during capture: HMR interrupts it
4. Run `npm run media:encode -- ru en continuous-ru rhythm-ru`

Timeline sources: `release3Motion.config.json` for classic;
`release3Concepts.config.json` for new cuts, posters and storyboard times.
New concepts are RU only. The receiver accepts allowlisted IDs, validates sizes
and frame limits, and writes only below the workspace. It listens on loopback
and accepts only the Storybook origin.

Frames: `.local/release3-frames/{en,ru,continuous-ru,rhythm-ru}`.
Output: `release/media-3.0/music-island-3.0-<id>.mp4`, with matching posters.
Earlier movies/posters/manifests: `release/media-3.0/archive-20260923`.
Native MP4 inserts and JPEG anchors live in `src/stories/release/assets/motion`.
Generated video seeks are awaited before snapshot; a missing/undecoded frame
fails the export instead of silently rendering black.

The retained classic 0–32s frames were reused with an exact-position standard
26px footer replacement (RU x84/y1784; EN x130/y1014). Its old portrait center is
fully covered by the opaque white circle. From 32s, Handy and finale are new
Storybook exports. A full Storybook export reproduces the same compositions.

Encoding: H.264, 30fps, CRF18, yuv420p/BT.709, faststart, AAC192k/48kHz for RU and EN.
All current films share the existing Mixkit recording “Tech House vibes” and real
sea/cricket recordings. See the media-source document and stock-audio.json for
licences, exact download URLs and hashes. No generated music or synthesized action
effects remain in current mixes. Sources are kept only in ignored
`release/media-3.0/audio/stock/`.
The old films/audio are in archive-2026-09-23-before-stock-audio. The audio-only
replacement tool copies H.264 streams without changing their frames; Rhythm is
fully re-exported for the later continuous-transition and natural-finale changes.

## Verification scope

The user explicitly requested no normal application tests or regression pass.
Only the required frontend/native build, image/video export and media inspection
were performed in this iteration. Earlier test results do not validate this build.
No new native microphone, tray exit, autostart or multi-monitor checks are claimed.
Media checks cover readable composition, small/portrait identity, end hold and QR,
complete video decoding, frame count, audio presence and no black shader frames.
Final measured evidence is recorded in SESSION_HANDOFF.md and the ignored manifest.

Export itself never publishes. The user separately authorized the 3.0 GitHub
release on 2026-09-23; Telegram publication remains outside this task.

Audio inspection in this pass is technical: track presence, duration, peak/mean
levels and deterministic interaction cue positions. No real-time listening review
or guarantee about subjective music taste is implied by the automated export check.
