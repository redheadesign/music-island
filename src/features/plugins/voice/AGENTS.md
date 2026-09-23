# Better Voice guidance

This file is the source of truth for Better Voice and the fox pipeline. The duplicate Cursor rule was removed after verifying that its complete body is preserved here. All paths in these rules are relative to the repository root. They apply when changing fox assets, mascot playback or the local alpha-processing pipeline; unrelated voice changes do not require regenerating assets.

# Fox mascot alpha (do not regress)

Magnific / Kling always export **solid black** backgrounds. UI needs **true transparency**.

## Required pipeline

Use `.local/process_fox_alpha.py` (or the same steps):

1. Raw MP4 under `.local/magnific-raw/`
2. Trim slow head (~0.4s) + time-compress (**idle ~3s**, **transitions ~2s**); live: optional `minterpolate` → 30 fps
3. Scale to 640×640
4. Extract PNG frames
5. **Flood-fill near-black from image borders → RGBA** (keeps black tie / dark headphones)
6. Encode WebM VP9 `yuva420p` with `-auto-alt-ref 0`
7. Build **4 live** pack clips from punched RGBA only; sleep stays a **single** punched clip

Local notes: `.local/magnific-fox-mascot.md`

## NEVER do this

- Do **not** create `fox-live-b.webm` / `fox-sleep-c.webm` (or any pack clip) with plain `ffmpeg -vf reverse|setpts` on a WebM **without** decoding alpha and **without** going through punched RGBA frames.
- `alpha_mode=1` / `-pix_fmt yuva420p` alone does **not** remove a baked black plate if the source frames are opaque RGB black.
- Default ffmpeg VP9 decode often **drops** the alpha plane — verify with:
  `ffmpeg -c:v libvpx-vp9 -i fox-….webm -frames:v 1 -pix_fmt rgba out.png`
  then check `(alpha==0).sum() > 100000`.

## Idle packs

- Live: seeded-random pack — `fox-live.webm` + `fox-live-b/c/d.webm`
- Sleep: **single** clip — `fox-sleep.webm` (no b/c/d)
- Wake / to-sleep: single punched clips (`fox-wake.webm`, `fox-to-sleep.webm`)

Build live pack variants from **already punched** `fox-alpha-work/live/frames` — do not remux opaque intermediates.

## Motion quality (QA bar)

- No static hold frames at clip start/end — motion continuous for seamless loops.
- Idle loops: identical start+end keyframe; never head-trim idle raws (`preserve_loop`) — seam spikes otherwise.
- Whole-body life (head + torso/shoulders), not mouth-only or ears-only.
- Sleep FX: soft clouds on `fox-sleep` only — never letter “Z” typography.
- See `.local/magnific-fox-mascot.md` motion bible before regenerating takes.

## After any fox asset change

Verify every shipped `fox-*.webm` has real transparent pixels (libvpx decode), then rebuild the portable.
