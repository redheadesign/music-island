# Changelog

## 3.0.0 — 2026-09-23

### A new design system

- Rebuilt settings around shared controls, fixed navigation and one scrolling content area. Graphite and light themes use the same documented surface, type and spacing tokens.
- Added quieter dropdown shadows, compact model cards, clear download actions and locale-aware model recommendations: GigaAM for Russian and Parakeet Unified EN for English.
- Added a four-step introduction with real controls, a brighter Paper Warp scene and an explicit Windows autostart option. Existing users can replay it from settings.
- Kept the original orange/white app icon and white startup mark; added the author portrait only to About and large release end cards, without clipping the silhouette.
- Added continuous Play/Pause morphing and island-wide feedback, including an inward wave on Pause and Unlike.

### Local dictation

- Integrated the Windows pipeline from Handy v0.9.7, commit `05e0aedd2906f0d82722735f930465950c476b90`, under its MIT license. Music Island remains GPL-3.0-or-later.
- Added microphone and shortcut selection, model download/import, history with audio, dictionary, filler-word cleanup and optional AI processing with a separate shortcut.
- Added a nonactivating recording overlay and an optional microphone control in the island.
- Embedded the native runtime in the portable EXE. Models, recordings, runtime and private cache stay in Music Island's AppData folder; import copies from Handy without modifying its files.
- Added storage controls and confirmed cleanup, plus DPAPI protection for provider keys. No telemetry was added. Recognition is local; external AI processing is opt-in.

### Interaction and lifecycle fixes

- Added display selection, automatic placement after rotation/resolution changes and remembered preference after reconnect. The overlay starts hidden until its final viewport is ready.
- Settings now comes to the foreground on the first press; changing settings scope opens its first page.
- Unified taskbar/island drag previews and accented drop targets, balanced settings panels, improved preset accent contrast and fixed the model search surface.
- Preserved the pointer's grab point and rendered control appearance when dragging out of a scaled preview; replaced coordinate-sensitive CSS zoom on the preview camera.
- Fixed quota chip spacing, layout reset preserving connected widgets, settings scrolling and first-launch/replay state races.
- Guarded seek and track navigation against stale position events, preserving the accepted fill-only timeline transition.
- Coordinated tray exit, recording cancellation and model unloading outside the Windows event loop, with a bounded shutdown fallback.

The EXE is unsigned. SHA-256 checks validate release integrity, not publisher identity.


## 2.0.0 — 2026-09-14

Music Island 2.0 is a major update to the island, taskbar player, media sources,
usage widgets, Better Voice and Settings. It remains a portable Windows 10/11
application; replacing `music-island.exe` preserves the configuration stored in
`%APPDATA%\Music Island\`.

### Customization and appearance

- Added a live drag-and-drop island editor. Player controls, artwork, progress,
  reactions, usage satellites and actions can be arranged within protected zones;
  required controls remain safe from accidental removal.
- Added direct resizing in the preview and persisted layout, scale and visibility
  preferences.
- Unified the island, assistant usage satellites and active My Wave chip on the
  same artwork-aware surface material.
- Fixed duplicate progress transitions when duration metadata arrives after track
  identity, coalesced rapid navigation updates and settled cancelled animations
  exactly once.
- Reworked Settings with clearer navigation, refreshed light and dark themes,
  accessible keyboard alternatives and reduced-motion behavior.
- Expanded Storybook coverage for production components, layouts, themes and
  interaction states.

### Native taskbar player

- Added an optional native Windows taskbar player beside the notification area.
  Its ordered controls can include artwork, Previous, Play/Pause, Next, Like,
  Shuffle and Repeat, with configurable scale.
- Shuffle and Repeat appear and dispatch only when the active media session
  reports support. Repeat reflects Off, All and One states.
- The taskbar surface uses same-process native Windows controls and cached artwork
  decoding, independent of the island WebView.

### Media sources

- Added Spotify selection through Windows SMTC. Music Island follows Spotify's
  published Windows media session and does not require Spotify credentials.
- Improved Windows SMTC source selection and capability-aware commands.
- Direct Yandex Music remains a separate, explicit opt-in local connection to the
  installed desktop client.

### Codex and Claude usage

- Added optional Codex and Claude usage widgets with compact and detailed styles,
  independent scale and placement around the island.
- Each provider requires a separate explicit connection from Settings. Codex runs
  the installed local `codex.exe app-server` and relies on its login without
  reading its auth files. Claude reads the existing local Claude Code OAuth
  credential and queries Anthropic's usage endpoint directly, without a Music
  Island proxy.
- Credentials and raw responses never reach React or logs. The widgets do not
  claim monetary cost or total ChatGPT usage.
- Disabled providers perform no background polling. Cached states clearly show
  loading, stale, unavailable and authentication conditions.

### Better Voice

- Refined the in-process Better Voice route, device flow, effects, level feedback
  and guide while preserving the fox mascot states.
- The accepted warm graphite Paper Warp material now pauses when hidden,
  offscreen or under reduced motion.

### Notes

- The portable updater now requires `SHA256.txt`, verifies the downloaded
  executable's SHA-256 and PE header, then performs the existing staged replacement.
- The portable executable is unsigned, so Windows SmartScreen may show a warning.
- Better Voice still requires a compatible virtual audio cable such as VB-Cable.
- Player capabilities depend on what each Windows media session publishes.
- See the [project repository](https://github.com/redheadesign/music-island) and
  [issue tracker](https://github.com/redheadesign/music-island/issues) for source,
  documentation and current limitations.

## 1.3.22 — 2026-08-04

### Fixes

- **Small / high-DPI monitors (Settings path):** native keep-alive band is now sized in **physical pixels** (`CSS × devicePixelRatio`) and measured from the real chrome including Settings/Pin. On 125%/150% scaling the old CSS-sized band was too narrow, so moving toward Settings left the hit-band and closed the island. 1.3.21’s “trust hit-band only” change could not help while that band was undersized.

## 1.3.21 — 2026-08-04 (broken — use 1.3.22)

Yanked from GitHub. Did **not** fix the Settings hover path on small/high-DPI monitors: the keep-alive band was still sized in CSS pixels while the native hit-test uses physical pixels, so the band stayed too narrow under Windows scaling. Replaced by **1.3.22**.

## 1.3.2 — 2026-08-03

### Critical

- Overlay window is **fullscreen transparent** with cursor-band click-through — Settings/Pin no longer clipped by a tight HWND (#32).
- Settings/Pin icons use `mix-blend-mode: difference` so they stay visible on light wallpapers (#30).

### UI

- Removed duplicate third accent preset (`#e85d04`) (#31).
- Post-intro one-shot hover coach (peek + cursor hint); dismissed permanently after first open (#28).
- Better Voice fox live phase cycles through a pack of short loops (#27).

### Portable

- Newer builds supersede older copies (kill/delete + `install.json`); older builds show **Open newer version** (#29).
- Autostart path refresh on move remains as before.

## 1.3.1 — 2026-08-03

### Fixes

- Portable updater relaunch no longer breaks on non-ASCII install paths (e.g. Cyrillic folder names). The post-replace helper now uses PowerShell `-EncodedCommand` instead of a UTF-8 `.cmd` misread by `cmd.exe` as OEM.

### Docs

- README architecture diagram aligned with [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (facade, voice engine, Better Voice UI).

## 1.3.0 — 2026-08-03

Public portable release. **GPL-3.0**. Distribution stays a single `music-island.exe` forever (GitHub Releases → download/replace).

### Highlights

- **Better Voice (Beta)** built into Music Island (in-process): denoise, gain/AGC, EQ, FX, meters, fox mascot, in-app guide; needs VB-Cable once.
- **Portable updates** from GitHub Releases: check on start, About progress UI, download → swap running exe → relaunch.
- **Startup intro** splash (skipped on `--startup` autostart).
- **Settings IA:** Music Island | Better Voice scope switch; titlebar «Settings»; primary accent color.
- Single-instance lock + already-running notice.

### Better Voice

- Settings tab marked **Beta**; dismissible beta notice + full guide page.
- Devices, noise models (DeepFilter / RNNoise), AGC, EQ presets, FX chips, live meters/spectrum.
- Sleep / wake / live / to-sleep fox WebM mascot; Start/Stop waits for transitions.
- Engine auto-resume after quit; High process priority + MMCSS Pro Audio while running.
- Voice runtime/models embedded and extracted to `%APPDATA%\Music Island\voice\`.
- VB-Cable not embedded — install via official download + guide.

### Updates UX

- About: version + check/install status on an elevated card; social links with brand icons; GPL mentioned inline in the description.
- Settings update banner: full GitHub release markdown, «See all» expand, Update / Later (no close X).
- Island nag: «Update available» + Update / Later only; Later snoozes for 30 days, then can return.

### App shell / appearance

- Accent swatches + custom picker (default `#F76100`); section titles tinted from accent.
- Intro window; settings window title shows localized Settings.

### Known issues

- Better Voice remains **Beta** (UI/onboarding still evolving; heavy CPU may glitch audio).
- Direct Yandex Music stays opt-in / experimental.
- Builds are unsigned (SmartScreen may warn) — Authenticode is optional later; does not change the portable update model.
- SMTC seek click remains a protocol/player limitation (#3).
- No signed in-house virtual microphone driver (VB-Cable required).

### Development history

Entries **0.9.10–0.9.12** below are intermediate local builds rolled into this public release.

## 0.9.12 — 2026-08-03

Local build toward 1.3.0. **GPL-3.0**.

### Startup intro

- Separate transparent `intro` window; single SVG mark (hold → spin → dip → fly → orange top flash).
- Skipped on Windows autostart (`--startup`); always plays on manual exe launch.
- Brand splash tones from `#F76100`.

### Appearance

- Primary color setting (swatches + custom picker); UI accents derive from it. Default `#F76100`.

### Better Voice

- Remembers whether the engine was running and auto-resumes it on the next app launch.
- VB-Cable driver is no longer embedded — install guide + official download link only.
- Portable still embeds DeepFilter / voice models (one-file delivery); that is most of the size vs pre-voice builds.

### Portable updates (GitHub Releases)

- On every app start, Music Island checks `redheadesign/music-island` latest release.
- About section: **Check for updates**, status text (up to date / available / errors), download progress bar, **Download and install**.
- Portable replace: download to temp → swap running `music-island.exe` → relaunch → delete `.old` and temp staging (no leftover clutter on success or failed download).

### Better Voice UI

- First control block: centered composition — FX chips on top, mascot, Start under it; card substrate removed; more bottom padding.

## 0.9.11 — 2026-08-03

Open beta. Still **GPL-3.0**. Local portable build for testing (not pushed to GitHub yet).

### Better Voice (experimental / in-process)

- Better Voice is built into Music Island (no sidecar plugin process).
- Settings tab **Better Voice** marked **Beta**, with an experimental banner in the panel.
- Voice runtime files are embedded in the exe and extracted once to `%APPDATA%\\Music Island\\voice\\` — no `resources/` folder next to the portable build.
- Control block: fox mascot (sleep / live) + primary Start/Stop.
- Spectrum + level meters, dark custom dropdowns, section headers aligned with Island settings.
- While voice is running: process priority **High** + MMCSS **Pro Audio / Critical** on capture, DSP, and render threads (helps under screen-share / heavy browser load).
- Virtual mic path: VB-Cable (Windows needs a driver; Krisp-style convenience needs a signed in-house driver — not shipped yet).

### Fixes (carried from 0.9.10)

- Tray: removed **Check for updates** (#25).
- Single-instance lock + centered already-running notice (#24).
- Direct soft recovery after long downtime (#19).

### Known issues

- Better Voice UI/UX still rough; quality under extreme CPU load may still glitch.
- SMTC seek click remains a protocol/player limitation (#3).
- Presence animation (#23) and themes (#26) still open.
- Builds are still unsigned (SmartScreen).

## 0.9.10 — 2026-08-02

Local work toward plugin host (superseded by in-process Better Voice in 0.9.11).

## 0.9.9 — 2026-07-29

Open beta. Still **GPL-3.0**.

### Docs / positioning

- README and GitHub repo description highlight **direct connection to the native Yandex Music desktop app** (opt-in local CDP), alongside Windows SMTC.
- Clarified Direct consent flow and SMTC fallback in the public README.

### Known issues

- Long-downtime auto-recovery without a button remains incomplete (#19).
- SMTC seek click remains a protocol/player limitation (#3).
- Builds are still unsigned (SmartScreen).

## 0.9.8 — 2026-07-25

Open beta release. Project stays **GPL-3.0**.

### UX and i18n

- Settings language toggle **Ru / En** (persisted in `appearance.locale`; UI dictionaries on the frontend, protocol states mapped by code).
- About block: version, Telegram, GitHub, GPL note.
- Direct empty / recovery copy clarifies that the user should press quick reload (no fake “reconnecting” loop).

### Direct metadata

- Deduplicate concatenated track titles from DOM double-mounts (`TitleTitle`).
- Prefer leaf title nodes over parent text that merges visible + `aria-hidden` copies.
- Stronger artist scraping; retain artist/cover only for the same track id.
- Frontend merge uses `trackId` so rapid skips no longer glue the previous artist onto a new track forever.

### Autostart / packaging

- Portable autostart status shows exe path; Startup `.lnk` write is quieter when unchanged.
- README trimmed for open beta; media placeholders under `docs/media/`.

### Known issues

- Long-downtime auto-recovery without a button remains incomplete (#19).
- SMTC seek click remains a protocol/player limitation (#3).
- Builds are still unsigned (SmartScreen).

## 0.9.6 — 2026-07-25

### Overlay and settings

- Active My Wave chip uses the same artwork glass background as the island card so it stays readable on light wallpapers; label/× remain `#FFFF00`.
- Removed inert Settings actions **Сбросить позицию** and **Проверить обновления** (tray update stub unchanged).
- Overlay shows **Быстрая перезагрузка** when Direct needs recovery or has no session; after a successful reconnect it sends Play once.

### Direct Yandex

- `STATE_EXPRESSION` rediscovers common desktop PlayerBar layouts (Home, Collection, vibe and class-hash variants) and scopes reads to the active root.
- Metadata can refresh when play controls are briefly missing during SPA navigation; artist falls back to `Artist — Track` splitting and last-known cache.

### Portable autostart

- Enabling launch-at-startup now writes both the HKCU Run entry and a Startup-folder `.lnk` (quoted paths, `--startup`, path refresh).
- Sync failures surface under the Settings toggle instead of failing silently.

### Known issues

- Long-downtime auto-recovery without a button remains incomplete (#19); use overlay quick reload or Settings restart.
- SMTC seek click remains a protocol limitation (#3).

## 0.9.5 — 2026-07-14

### Overlay and settings polish

- Removed the My Wave carousel and right-side window gutter from the overlay. Wave preset catalog fetching is disabled; the active-selection chip remains and is centered under the island.
- Active wave chip uses Yandex Music yellow (`#FFFF00`) for label and dismiss control.
- Settings window: fixed mismatched corner clipping, made the full title bar draggable, and kept minimize/close as non-drag hit targets.
- Added a small **Сбросить** control in the Island settings section (width, scale, hover delay → defaults).
- Like button no longer tints its background with artwork color when active; progress fill uses a stronger artwork tint.

### Portable autostart

- Replaced the generic Tauri autostart plugin path with a Windows registry helper that quotes executable paths (critical for portable folders with spaces), uses a single `Music Island` Run entry, cleans legacy names, and refreshes the path on every launch and config save when autostart is enabled.

### Direct protocol recovery

- Added **Перезапустить** in Settings for Direct Yandex when status is `degraded`, `restart-required`, `error`, or `incompatible`, without forcing a switch back to SMTC.

### Architecture preview carry-over

- Frontend composition split (`config` / `media` / `window` controllers), shared glass UI primitives, import-boundary check, and `AGENTS.md`.
- Earlier preview fixes for Settings controls, Like sync, overlay reveal, provider invalidation, Play/Pause scoping, and paused metadata are included in this release.

### Known issues (tracked)

- Direct controls and metadata can stop working when the Yandex Music Desktop renderer navigates away from the home surface (for example Collection). See GitHub issues for the current tracking entries.
- After a long Yandex Music downtime, Direct may stay `degraded` until the user presses **Перезапустить** (or reconnects). Automatic silent recovery is still incomplete.
- SMTC seek can still produce a player-side audio click (documented limitation, issue #3).

## 0.9.1 — 2026-07-13

### Provider reliability

- Made the configured provider authoritative for snapshots and commands. A Direct failure no longer falls back to SMTC or displays the SMTC-unavailable banner.
- Kept inactive SMTC checks as rare health-only probes which cannot emit playback state.
- Added single-flight WinRT protection so a timed-out SMTC worker cannot create an accumulating thread/handle storm.

### Direct Yandex

- Replaced per-request discovery/WebSocket setup with one serialized persistent CDP actor.
- Added bounded reconnect, increasing request IDs, compact timeline events and immediate commands through the open socket.
- Reattach to a validated running Yandex Music process/loopback endpoint on startup; client restart now requires an explicit Settings action.
- Persisted the last Direct port as a hint and reject non-Yandex targets or non-loopback WebSocket endpoints.

### Performance and UI

- Removed media/timeline subscriptions and the progress clock from the Settings WebView.
- Reduced the progress clock to 1 Hz, moved artwork color interpolation to CSS and deduplicated native bounds work.
- Stopped global cursor-coordinate events while the pointer is outside the overlay and made native gesture polling adaptive.
- Stabilized SMTC source-list refreshes with debounce, single-flight and equality checks.
- Fixed reaction order to dislike — timeline — like.
- Added runtime counters and `scripts/profile-hotfix.mjs` for provider, CDP, event, bounds and resource acceptance.

### Acceptance

- Expanded Direct playback averaged 0.12% Task Manager CPU on the 8-logical-core test machine (0.94% of one core), below the 4% budget.
- A 60-second expanded run stayed stable at 20–25 threads and 463–469 handles; the 0.9.0 baseline grew from 316 to 1414 threads and 1328 to 5111 handles in 30 seconds.
- Ten Direct track switches used one discovery and one WebSocket. CDP RPC max was 35 ms; overlay updates averaged 911 ms with p95 933 ms.
- The same live run had zero SMTC media probes while Direct was active; the isolated 30-second passive health probe remained single-flight.

## 0.9.0 — 2026-07-13

Music Island 0.9 moves the alpha toward a stable beta while deliberately keeping the project below 1.0.

### Media core

- Added SMTC health states (`healthy`, `degraded`, `unavailable`), probe latency/failure diagnostics and automatic polling backoff.
- Moved blocking WinRT probes off the async runtime and bounded them with timeouts.
- Reduced metadata/artwork work during timeline updates and cached artwork by source/track.
- Added multi-session enumeration, playing/current-session arbitration and a preferred-source setting.
- Kept the latest valid session through transient track-change gaps.
- Coalesced rapid seek requests so only the newest position is applied.

### Direct Yandex Music beta

- Added explicit opt-in local control of the installed Yandex Music Desktop client through a random loopback-only CDP endpoint.
- Added renderer discovery, readiness validation, bounded HTTP/WebSocket operations and useful local errors.
- Added play/pause, previous/next, seek, artwork, timeline and capability synchronization.
- Added like/dislike controls with pressed-state synchronization.
- Added safe return to Windows SMTC, including a normal desktop-client restart.

### Settings and overlay

- Rebuilt Settings as a compact glass interface with live width, scale and hover-delay controls.
- Added protocol rows for Windows SMTC and Direct Yandex with current status and health.
- Added a centered first-connect consent dialog.
- Fixed settings/pin hover and clicks by keeping action controls inside WebView2's transformed hit-test box.
- Fixed persisted pinned interaction and native click-through restoration.
- Moved collapsed gesture tracking to the native window layer to avoid continuous frontend IPC.
- Removed Show/Hide and Reset Position from the tray menu; left settings, update check and quit.

### Diagnostics and release

- Added local direct-provider and SMTC health diagnostics.
- Added architecture, media-provider, Yandex integration and performance documentation.
- Added live CDP/hit-test acceptance scripts used against the portable build.
- Release distribution is a single unsigned portable `music-island.exe`.

### Known limitation

- Seeking through Windows SMTC can still produce an audio click or rebuffer in the source player. This is tracked as a protocol/player limitation; Direct Yandex bypasses that path only for Yandex Music Desktop.

## 0.8.1 — 2026-07-08

- Held the previous media session across short SMTC gaps to reduce “No music playing” flashes.
- Documented SMTC seek limitations and shipped the Windows executable release.

## 0.8.0 — 2026-07-08

- First private alpha release.
