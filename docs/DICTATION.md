# Dictation

Music Island adapts the Windows recording, shortcut, model, history and text
processing pipeline of [Handy 0.9.7](https://github.com/cjpais/Handy/tree/v0.9.7),
commit `05e0aedd2906f0d82722735f930465950c476b90`. Recognition remains native Rust/C++.
It does not launch Handy, install a service, create another tray icon or use its updater.

Portable builds compress native libraries, feedback sounds, VAD and notices with
lossless zlib. Extraction checks the original size and SHA-256 before atomically
installing a file. Verified cached files are reused without decompression; CPU
variants, Vulkan and all model families remain available. Build packaging uses
Cargo's active C++ output, and unchanged bundle files keep their timestamps.

## Use

Open **Settings → Dictation** and enable the feature. Choose a model that supports
your language, inspect its download size and model card, then download it. Configure
the microphone and shortcut in General. A short test can be made in an ordinary
text editor. The default recording mode opens the microphone only while recording;
the default idle model timeout is five minutes. Better Voice is independent: select
its virtual input explicitly if you want to recognize processed audio.

In **Dictation → Advanced → Compute**, select Automatic, CPU or Vulkan for
GGML/GGUF models such as GigaAM v3 E2E RNN-T Q8. Vulkan appears when a compatible
GPU is detected and can use a specific graphics card. A change takes effect on
the next recording. If Vulkan cannot initialize the model, dictation retries on
CPU and shows the backend that loaded. ONNX models use CPU.

By default GigaAM GGUF models recognize the recording after you stop. To process
completed phrases while recording, select a GigaAM GGUF model and enable **GigaAM
background recognition** under **Dictation → Advanced → Compute**. This preference
applies to the next recording, persists when switching models or restarting the app,
and leaves text delivery at Stop. The switch is available for both catalog and local
GigaAM GGUF files. Other models retain their normal recognition path.

For recordings over
25 seconds, the app looks for quiet pauses near 17 seconds, within the
[GigaAM utterance window](https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/gigaam.md).
If a continuous passage exceeds 25 seconds, it stays intact until the next
safe pause. The model receives every sample in order and text cleanup runs
once after recognition. The recording overlay receives the real duration of
completed fragments. Cancel stops further fragments after the current call.
With no suitable pause anywhere the model receives the entire recording.

In the Windows acceptance probe, GigaAM v3 E2E RNN-T Q8 ran on a Ryzen 7
4700U's Vulkan backend. A 64.6-second synthetic recording took 25.5–39.1
seconds in one call and 18.2 seconds in four parts. A 121.1-second recording
took 83.5 seconds in one call and 41.1 seconds in seven parts. The split
results matched all 88 and 165 words respectively from the repeated short
reference. These timings include model inference and vary with machine load.

### GigaAM engine comparison · 17 November 2026

The Windows x64 builds of transcribe.cpp 0.2.4 and 0.4.2 ran the same GigaAM v3
E2E RNN-T Q8 weights and Music Island's pause-aligned chunks on Ryzen 7 4700U
Radeon Vulkan. Each measured input ran twice, with the order of both engines
and inputs reversed for the second pass. Times exclude loading and AI processing.
The [LibriVox reading by Luiza Karimova](https://librivox.org/multilingual-short-works-collection-013-by-various/)
was cropped to the story. In the denser copy, intervals of at least 180 ms
below −42 dB were shortened to 70 ms. Word error rate uses the normalized
[published text](https://ru.wikisource.org/wiki/Случай_с_классиком_(Чехов)).

| Input | 0.2.4, seconds | 0.4.2, seconds | WER, both |
| --- | ---: | ---: | ---: |
| Natural pauses, 408.57 s | 127.67 / 100.72 | 82.65 / 109.57 | 5.98% |
| Shortened pauses, 304.28 s | 72.65 / 91.28 | 69.65 / 78.11 | 6.36% |

The first pass varied considerably with run order and workstation load.
Four additional engine runs used the same input hashes, Vulkan device and
chunk boundaries. Both versions warmed up on the same eight-second clip.
Median whole-host CPU load during the four runs was 44.6–45.6%, including
the benchmark.

| Input | 0.2.4 retest, seconds | 0.4.2 retest, seconds | Median change in time |
| --- | ---: | ---: | ---: |
| Natural pauses | 45.059 / 44.620 | 45.195 / 44.923 | +0.49% |
| Shortened pauses | 38.625 / 38.839 | 38.925 / 39.342 | +1.04% |

All transcripts per input were byte-identical across both rounds. The
retest found no speed gain. The bundled engine stays at 0.2.4 with the
existing ONNX path.

### Mixed-pause regression on Windows

The first 83.18 s of the same public reading forms a reproducible mixed input.
In the middle passage (25.00–54.00 s), add a 125 Hz sine with peak amplitude
900 signed PCM16 units at 16 kHz, rounding to the nearest integer and clamping
to PCM16. The little-endian PCM SHA-256 is
`8eff1837a96f5b12a5f989ec0bf4ef0f1c206aba2ae598613dbd45400d7266fb`.
The published reference contains 149 normalized words through «спросила она».
This is a synthetic noise condition over real speech.

Both planners ran on the identical Q8 weights, warmed transcribe.cpp 0.2.4
and Ryzen 7 4700U Radeon Vulkan0. The original planner sent the whole input.
The updated planner preserved consecutive spans of 17.00, 37.36, 16.86 and
11.96 s. The five paired runs used A/B, B/A, B/A, A/B and B/A order:

| Planner | Five runs, seconds | Median | Word error rate |
| --- | --- | --- | --- |
| Whole-input fallback | 54.895, 48.150, 53.607, 53.525, 48.908 | 53.525 s | 14.77% (13 deletions, 9 substitutions) |
| Retained quiet boundaries | 8.862, 8.981, 8.957, 8.830, 8.990 | 8.957 s | 6.04% (7 substitutions, 2 insertions) |

Whole-host CPU utilization ranged from 43.3% to 60.2%. Every repeat within
each variant returned identical normalized words. Each of the final six runs
started a fresh process with the same warm-up. Median peak process working set
was 443.2 MiB with the old plan and 361.1 MiB with the new plan. Median peak
private memory sampled every 100 ms was 604.3 MiB and 540.7 MiB respectively.
These counters cover the benchmark process and omit graphics driver memory
outside that process. These timings cover recognition of loaded audio and exclude microphone
capture, model load, WAV persistence and paste. The two original 408.57 s and
304.28 s fixtures produced exactly their prior sets of 24 and 18 ranges.

An isolated real-time replay also delivered the clean 83.18 s excerpt to a
single warm engine, releasing only the first safe fragment after observing
27 s of its input. Across the replay all fragment boundaries and text matched
the offline pass. Stop to final output was 1.953 s in the replay and 9.000 s
when the entire input was processed after Stop. This one experiment used WAV
playback. A second replay used the full 408.57 s clean reading and all 24
fragment boundaries and texts matched. Stop to final output was 2.601 s
with early fragment recognition and 68.980 s on the offline pass (67.082 s of
inference). Other workstation load was allowed during this trial. Both replays
exclude live VAD, capture-ring contention and paste. By default GigaAM continues
to recognize after Stop. For benchmarks, setting the process environment variable
`MUSIC_ISLAND_GIGAAM_PREDECODE` to `1` or `0` overrides the saved preference for that
process. With background recognition enabled, GigaAM GGUF recognizes completed
fragments of post-VAD audio while recording.
The short-recording path and the original recording buffer are preserved. An
ordinary cut is sealed only after its full 25 s search window and 2 s tail have
arrived. A continuous passage waits for a complete extended search window.
Capture never waits for the decoder. If its bounded queue fills or the pending
passage grows beyond 90 s, background work ends for that recording. On Stop
the normal planner checks every cached cut against the final ranges, SHA-256
of its PCM, loaded model handle and all inference options, then decodes each
remaining range and applies the normal dictionary and output processing once.
Cancellation discards the background results. A new recording can use the
normal batch path while a cancelled engine call finishes. To qualify a change
of default, measure the
native coordinator from the physical Stop shortcut through delivery to a real
Windows editor. Time recognition, first visible insertion and clipboard restore
separately. Include warm and cold models, CPU fallback and Vulkan, VAD on and
off, idle and busy hosts, and multiple Russian speakers with verified references.
Use short, 3–8 minute, noisy and unbroken speech, including names and numbers.
Require at least 30% lower median stop-to-insertion latency on long clips,
short-clip p95 regression at most 100 ms, WER regression at most 0.3 percentage
points, no new cut-boundary omissions/duplications and no additional capture
losses. Record peak memory, check cancel and new sessions, and verify that a
focus change still offers Copy instead of pasting into another window.

For an isolated profile using a dedicated virtual cable and an addressed local
test editor, set `MUSIC_ISLAND_DICTATION_REQUIRED_INPUT` in the application
process to the exact recording endpoint name. A missing or ambiguous device
stops recording before any default microphone opens. Both initial open and
retry enforce the constraint. Before issuing a shortcut, check that
`plugin:dictation|get_status` reports the expected `captureConstraint.requiredInput`
and `captureConstraint.predecode`, and verify the intended editor is foreground.
An older build without these fields is unsuitable for this test.

The [Windows editor harness](../scripts/dictation-editor-bench/run.ps1)
holds and releases F24 through Windows input, addresses its own native EDIT
window via the configured ExternalScript output, and records the first
`EN_CHANGE` with the same performance counter as key-up. For paired entries
with matching source WAVs and UTF-8 references in a local manifest, run
`python scripts/dictation-editor-bench/score.py cases.json path/to/runs --output scores.json`.
The scorer checks source, reference and portable hashes, verifies the capture
constraint and experiment mode, then reports paired WER, word-level
differences, median latency and the nearest-rank 95th percentile. Missing
trials are listed and excluded from paired statistics. Identical normalized
words rule out new boundary omissions or duplications for that pair. Inspect
any differing words alongside that trial's saved WAV before attributing a
change to a boundary.

#### November 18 Windows editor trials

The same portable executable and warm GigaAM v3 E2E RNN-T Q8_0 model ran on
Vulkan0 in both modes. The source was the LibriVox reading above, with a
786-word reference. Each row below represents one pair of independent
captures through the dedicated stereo virtual cable and Silero VAD. The
latency is measured from injected F24 release to the first text change in the
native editor, using ExternalScript delivery.

| Input | Baseline → background | Reduction | Word errors, baseline → background | Chunks reused |
| --- | ---: | ---: | ---: | ---: |
| Natural pauses, 408.57 s | 66.852 → 3.219 s | 95.19% | 44 → 43 (5.60% → 5.47%) | 22/23 |
| Shortened pauses, 304.28 s | 45.945 → 3.813 s | 91.70% | 50 → 56 (6.36% → 7.12%) | 17/18 |
| No acoustic cuts, 304.28 s | No text in either mode | — | — | — |

All four runs reported zero capture-ring drops. The post-VAD lengths differed
between independent captures: 392.52 / 392.76 s with natural pauses and
304.83 / 308.19 s with shortened pauses, in baseline / background order.
The shortened-pause pair exceeded the 0.3 percentage-point WER threshold.
For example, the background transcript omitted «мамаша» after «спросила».
The eight-second smoke produced the same 13 normalized words with both modes
and took 4.935 / 5.197 s. One short pair cannot establish p95.

The same portable also decoded both saved **background-mode History WAVs**
with the normal offline planner on Vulkan0. This replay retains the actual
post-VAD signal at PCM16 precision. The live engine consumed float samples.
The ordinary replay reproduced the missing «а» and «у-у» on the natural
recording, and «мамаша», «и» and «в» on the shortened one. These omissions
therefore also occur when the full captured recording is recognized after Stop.
Natural speech had 43 errors in each path, with differences in three word
groups. Shortened speech differed only at «заливая» / «заливаясь» and had
56 live errors versus 55 on replay. Both replays produced the live number
of segments, 23 and 18 respectively.

The no-cut control added a continuous 125 Hz sine with peak 975 signed PCM16
units to the shortened-pause fixture. The planner found one range. Both
captures completed and saved their WAVs. Vulkan GigaAM returned backend
status 8 in both runs. Recognition time up to the error was 20.952 s for
baseline and 17.295 s for background. Neither editor received any text, so
the release-to-insertion metric is undefined. The experiment remains opt-in.

For a real paste measurement, use a disposable interactive Windows VM with
host clipboard, microphone and network redirection disabled. Map the fixture
and weights read-only. Feed the WAV to a guest-local virtual microphone.
A future test-only PCM input at the recorder ingress could exercise VAD and
the native coordinator without a virtual audio driver. An editor process should
timestamp its first matching text change, verify the captured target PID/HWND
and compare its final text with the reference. Test target loss by closing
only that helper window. Creating a second desktop in the host user's session
still shares the clipboard. [Windows window stations](https://learn.microsoft.com/en-us/windows/win32/winstation/window-stations)
and [Windows Sandbox configuration](https://learn.microsoft.com/en-us/windows/security/application-security/application-isolation/windows-sandbox/windows-sandbox-configure-using-wsb-file)
describe these isolation boundaries.

### Repeat the portable comparison

On Windows with Python 3.11 or later, run the repository's
[benchmark script](../scripts/benchmark_dictation.py) from the project root.
Supply two local portable EXEs, the same local GigaAM GGUF, a mono 16 kHz
PCM16 WAV, and its matching UTF-8 reference transcript. For example:

```powershell
py -3 scripts/benchmark_dictation.py --baseline .\old\music-island.exe --candidate .\new\music-island.exe --model .\fixtures\gigaam.gguf --audio .\fixtures\speech.wav --reference .\fixtures\speech.txt --output .\results\speech.json
```

The default five pairs alternate build order and request Vulkan. Use
`--accelerator cpu` for a CPU comparison. The default baseline strategy is
`raw` (supported by older probes), and the candidate uses `planned`. Set
`--baseline-strategy planned` to compare planners when both builds expose it.
Each invocation loads the model in a fresh process with its own build-specific
temporary application profile. The JSON includes executable/model/input
hashes, actual backend, per-run inference and process time, segment details
where available, normalized WER and median inference time. Model load and
runtime initialization are timed separately. This measures the shipped file
probe; recording and Windows text insertion need the separate checks above.

The optional microphone can be placed in the island layout editor. It is absent
from the default composition. The bottom overlay does not take keyboard focus.
The target window is captured at recording start and checked again before paste.
If it has closed or cannot be activated, the overlay offers native **Copy text**
and remains visible until copied or dismissed. This fallback also works if disk
errors prevented saving the history entry. Saved results remain available in History.

Hold, toggle and combined shortcuts, cancellation, microphone channel selection,
VAD, feedback sounds, mute during recording, language selection, translation and
streaming follow upstream capabilities. Unsupported model capabilities are not
offered as working controls. History supports audio, retry, copying, keeping and
deleting entries, and configurable retention. Cloud text processing starts disabled.
Enabling it reveals the shortcut, connection and prompt settings. Service and prompt
choices are visible buttons. The connection dialog contains the API key and model,
and the prompt editor uses the literal `${output}` placeholder.

**Dictation → History → Latest transcript on the island**
is off by default. When enabled, the most recent completed transcript appears
below the expanded island. Copy uses the full text, including post-processing
when available. The close button hides that entry from the island; it remains
in History. A new recording can appear without enabling the option again.

To check actual insertion, place the cursor in an external text editor and use
the configured shortcut.

## Recorder appearance

Open **Settings → Dictation → General** to select Classic, Waves or Fox. Choices sit
between the dictation preview and the color options, with no visible
section heading or shared background. The radio group retains its accessible name.
Colors use labeled circular swatches from the shared settings
DS control, with native radio/keyboard behavior. The compact
preview renders the same production component as the recording window, restarts
its recording → recognition → done cycle after a theme/color/colored-edge change,
and never starts audio capture. Fox is the default when a profile has no saved theme; explicit saved choices are preserved. The picker order is Fox, Waves, Classic.

**Capsule material** defaults to **Match island**. Choosing **Glass** for the
first time copies the island’s five current settings. Open **Glass material**
to adjust the capsule’s transparency, background blur, parallax, highlight and
edge thickness. The capsule remembers those values through switches to Classic
or Match island. The live preview and recording window use the same material.

Waves use the source recorder's multilayer glow, soft energy limiter, diffuse
material, refraction and full bevel. The central 84 × 44 capsule leaves generous
horizontal space around the artwork in every phase; detached controls are 32 px.
Recognition crossfades the wave into fluid particles; completion changes the material
and indicator to green. The palette includes White; colored edges are
adjustable. Developer mode exposes wave, processing particle and lighting controls in Advanced settings.
The pinned preview follows the settings scroll area and uses the same renderer as the recording window.

Fox is the only pixel character, with tall, outward-tilted ears. Expressions and
recognition games (Pong, Starship, Snake, Breakout) change automatically.
Gaze, blinking, speech and expression gestures drive the ears together with the
face. Games and delivery indicators have no ears. Voice visualization is always
enabled. Developer mode provides a separate brightness control for the fox.
Older saved values for those removed options are ignored by normalization.
During recording every theme has one Finish button in toggle/combined mode;
hold-to-record has no recording buttons and finishes on key release. Fox and
Waves use a 132 × 50 composition with Finish, or 92 × 50 for hold-to-record;
recognition and results remain capsules at 92 × 50. There is no duplicate
recording action on the artwork. Settings preview follows the saved shortcut mode.
Existing cancellation shortcuts remain available.

Cold model loading is distinct from recognition. Classic labels the wait after
recording stops; live capture shows a loading notice after 2s, avoiding a flash on
fast loads. The expanded live panel stays open for that recording.

Artwork preferences live in the normal Music Island config under
`plugins.settings.ui.dictationAppearance`. Switching themes preserves their
options. The reused overlay window subscribes to config changes, including while
hidden; a late initial config read cannot replace a newer theme. No new native
commands or recording states are introduced. The finish control uses the existing
native toggle command. Pointer down preserves the target editor's focus. The
existing compact 256 × 50 and streaming 400 × 120 bounds, shortcuts, cancellation
and copy fallback remain.

Reduced motion produces a static preview. Inactive/hidden previews cancel their
clock; hidden documents suspend artwork frames. Pixels use a local requestAnimationFrame
clock; optical materials render directly into a small WebGL2 canvas at at most
2× density. Speech uses a 25 ms attack / 120 ms release. The reference's .314 s
critical springs crossfade waves/particles; its .32/.28 s quintic completion curve
settles their rotation. Shell geometry uses the original 520 ms resize curve and
subpixel DOM measurements. Fox phases crossfade in a fixed SVG coordinate system,
with continuous bar heights. Preview cycles/colors preserve the canvas and clock
instead of remounting them. Removed Spectrum preferences fall back to Accent.
Each canvas releases its
programs, framebuffers and textures on unmount, and handles context loss with a
simple functional fallback. No additional runtime dependencies are needed.

Visual/state references were studied in [No Type's customization](https://github.com/Darlingfxx02/no-tipe/blob/main/CrossPlatform/src/Customization.tsx),
[pixel motion](https://github.com/Darlingfxx02/no-tipe/blob/main/CrossPlatform/src/recorder/motion.js)
and [recorder lifecycle notes](https://github.com/Darlingfxx02/no-tipe/blob/main/CLOUD-RECORDER.md).
The GLSL passes are adapted from the [approved cloud prototype](https://github.com/Darlingfxx02/no-tipe/blob/main/Prototypes/no-tipe-island-variants.html).
Pixel artwork and fox gestures are implemented locally. Native ownership remains
in Music Island's existing adapter.

## Storage and portability

Owned dictation data is under `%APPDATA%\Music Island\dictation\`:

- `models`: direct downloads and copied custom BIN/GGUF models.
- `huggingface/hub`: private HF cache, including partial downloads and locks.
- `history.db`, `recordings`: recognition history and retained WAV audio.
- `imports`: staged copies before an atomic rename into the model store.
- `runtime/handy-0.9.7/abi1-<hash>`: verified inference DLLs extracted from the EXE.
- `settings_store.json`, `logs`: native preferences and diagnostics.

Deleting the EXE does not remove these files. **System → Data** shows sizes and
can open the folder, delete dictation models, clear history, or remove all Music
Island data and exit. Full removal shows the exact application folders first.
A hidden helper waits for the parent process to exit before deleting those fixed
roots; it does not accept a deletion path. Reparse points are never traversed.
Handy, the shared HF cache and the user's EXE remain outside this operation.

Import first lists candidate Handy models, HF repositories and allowed preference
names. Only selected content is copied. Repeated HF blob references become links
between copies inside the owned store. Originals are not moved or altered.
History and service credentials are never imported automatically. External script
execution and cloud processing are not enabled by import.

## Runtime boundary

`crates/handy-core` is a Tauri plugin adapter. It owns the upstream coordinator,
audio pipeline, model downloader, history database, Windows input and clipboard.
`crates/dictation-runtime` builds `music_island_dictation.dll`, containing
transcribe-rs, transcribe-cpp and Silero. `crates/dictation-protocol` defines ABI 1.
Only C scalars, JSON bytes and PCM slices cross the boundary. The DLL allocates
response buffers and provides their release function. No Rust object, Tauri handle
or allocator crosses it. Loaded models own worker threads; unloading joins them.

The host embeds the complete runtime bundle, extracts to a content-addressed
version directory, verifies SHA-256 and loads absolute paths with restricted
Windows DLL search flags. ONNX uses the baseline CPU runtime; GGML/GGUF can select
Vulkan or CPU with upstream CPU variants. x64 emulation on ARM retains the CPU guard.
Recognition, loading and downloads stay outside the WebView/UI thread.

`app/dictation` exposes typed native adapters and revision-aware controllers through
`useIslandApp`. `features/dictation` contains settings and the separate bottom
overlay. The public app facade and frontend dependency direction are preserved.

## Build

Use Windows x64 with Rust/MSVC, Visual Studio Build Tools C++, Node/npm, CMake,
Vulkan SDK (including `glslc` and SPIRV headers), and the official baseline CPU
[ONNX Runtime 1.24.2](https://github.com/microsoft/onnxruntime/releases/tag/v1.24.2).
Set `CMAKE`, `VULKAN_SDK`, `ORT_LIB_LOCATION` and optionally `MUSIC_ISLAND_VC_REDIST`
to the installed tools and redistributable directories. The script also recognizes
local tools in `.local/tools`; those files are not part of the repository.

`npm run dictation:bundle` builds the pinned inference DLL and writes a manifest
with dependency sizes and hashes. `npm run tauri:build -- --no-bundle` builds that
bundle and embeds it in the portable application. Release builds fail if the
runtime bundle is missing. For native development, build the bundle first, then
set `MUSIC_ISLAND_DICTATION_BUNDLE` to its printed directory before `npm run tauri:dev`.
A plain `cargo check` does not require a packaged engine; enabling dictation in an
unpackaged development build reports that the engine is absent.

For an isolated packaging probe, set APPDATA/LOCALAPPDATA to a disposable test
profile and run `music-island.exe --dictation-runtime-check`. It loads the embedded
runtime, lists devices, runs silence through VAD and writes
`Music Island/dictation/runtime-check.json`. Optional positional model and WAV
paths add recognition and unload checks. WAV input must be mono 16 kHz/16-bit.
After the WAV path, pass `auto`, `cpu` or `vulkan` to compare backends. The
default is `cpu`. After the accelerator, an optional `planned` applies the
production GigaAM pause finder; the default `raw` sends one complete input.
The report includes the actual backend, per-fragment sample offsets, elapsed
inference time and final text. To compare versions or strategies, use the same
weights and WAV, alternate run order, and score both against the same reference.
This command does not open the microphone, show application windows or access
the real profile when those environment paths are isolated.

## Licenses and updates

Music Island remains GPL-3.0-or-later. Handy retains its MIT copyright and full
license text in `THIRD_PARTY_NOTICES.md` and the vendored crate. The GPL compatibility
of the Expat/MIT license is documented by the
[GNU license list](https://www.gnu.org/licenses/license-list.html#Expat).
Model weights are separately licensed: consult the model card, base-model license
and `DICTATION_MODEL_CATALOG.json`. Catalog metadata is attribution information,
not a grant of rights to every model. No ASR weights are embedded in the EXE.
The bundled Silero VAD has its own upstream MIT license.

See `HANDY_ADAPTATIONS.md` before updating upstream. There is no automatic Handy
code update channel and no independent Handy application updater.

## Model state, Russian cleanup and shutdown

The model catalog and saved preferences are readable while dictation is disabled.
This prepares metadata/history managers only; it does not load the inference DLL,
open the microphone or register recording shortcuts. Installed cards carry a
“Downloaded” badge. Downloaded, selected and in-memory are separate states; an
imported selected model remains visible even when a search/language
filter would otherwise hide it. Selecting a model while disabled saves the choice
without starting recognition. Activation is serialized against suspension/shutdown.

The language filter beside model search uses a checkbox menu, with English and
Russian first and the remaining catalog languages sorted by localized name.
The initial selection follows the interface language. Multiple checked languages
match models supporting any of them; clearing every check removes the filter.
Installed/selected models remain discoverable. This catalog filter does not change
the saved speech-recognition language. Recommendation badges name the model's
recommended language independently of the interface locale.

The local Russian catalog recommends GigaAM v3 E2E-RNN-T Q8 and labels GigaAM v3 CTC
as an alternative. This is a UI recommendation, not an automatic model switch or a
claim that one model wins on every microphone. Model cards and capabilities remain
upstream data. Existing model choices are preserved.

The [Memento ASR investigation](MEMENTO_ASR.md) documents the installed Duo
checkpoint and what would be needed to offer it as a model download.

With filler removal enabled and the default list selected, Russian language evidence
enables conservative cleanup of isolated hesitations such as `эээ`, `а-а`, `эм` and
`м-м`. Single letters/conjunctions, ordinary words, quoted fragments and URLs are
preserved. A custom list retains its explicit upstream semantics. Turning cleanup
off preserves the original text. This is deterministic native text cleanup, not a
cloud rewrite; test specialist vocabulary before relying on it for exact quotes.

History is cursor-paged past the first 100 records. SQLite migrations are tested
against fresh and prior schemas; a busy timeout bounds temporary lock contention.
Audio paths must be a local filename under the recording root; traversal, symlinks
and reparse points are rejected. In retention options, **Keep indefinitely** means
no automatic expiry, not “do not save audio”.

Tray exit runs native cleanup off the Windows event loop: cancel active work,
stop capture/downloads, release the model and join the idle worker. Better Voice
stops independently. Repeated exit requests share one coordinator. After an 8s
worker deadline the host requests exit; an additional 2s fallback closes a stuck
process. Ordinary idle unloading and app shutdown are different lifecycle paths.

## Recommendations and AI processing in 3.0

The Russian interface recommends GigaAM v3 E2E-RNN-T Q8; the English interface recommends Parakeet Unified EN 0.6B Q8. The existing pinned catalog supplies capabilities, download addresses and model terms. Language changes do not select, delete or download models automatically. Installed/imported models remain available in either UI language.

Settings → Dictation → **AI processing** connects an explicitly chosen provider and model. Use the dedicated AI shortcut to send recognized text for processing before inserting its response. Regular dictation stays local. The resulting text is also available in History. Provider processing and auto-submit remain off by default; a custom endpoint may itself be local or remote.

## Editing shortcuts and final punctuation

Shortcut editing captures keydown/keyup in the focused Settings WebView using physical key codes, so RU/EN layouts produce the same binding. It temporarily suspends native bindings, commits on key release and restores native shortcuts on save, error, Escape or focus loss. The editor no longer waits for a second global keyboard listener. Handy Keys retains left/right modifiers; Tauri uses generic modifiers. Native validation, registration and persistence remain authoritative.

Advanced → Text insertion includes **Remove trailing period** (off by default). It removes one final full stop after recognition and optional AI processing, before history/result delivery and before the existing trailing-space option. Internal periods, ellipses and other punctuation are preserved. Older settings default to false without migration.

### Windows clipboard timing

Windows publishes the transcript before sending the paste shortcut. If the
clipboard or foreground window changed before the shortcut, the overlay offers
the transcript through **Copy text**. **Keep result** writes the transcript once
and leaves a later copy alone. **Restore** waits at least 400 ms after sending the
shortcut before restoring the saved text or image. It skips restoration if the
clipboard changed. The wait runs off the UI thread and the next recording stays
queued until insertion finishes.

Windows keyboard injection cannot confirm when an editor reads the clipboard.
An editor that stalls beyond the configured pause can still read the restored
value. For that editor, increase the pause or choose **Keep result**. The
delayed-render worker withdrawn in 3.0.4 remains out of the production Windows
path. See [the adaptation journal](HANDY_ADAPTATIONS.md).

Local `dictation/logs/lifecycle.log` records operation phases, insertion duration
and insertion failures, without dictated text or clipboard contents. Completed
recordings also report capture drain, recognition, concurrent WAV persistence,
stop-to-final-text and insertion completion durations. The last duration includes
the configured clipboard restoration wait. The log resets when it reaches
1 MiB. Native panic reports also capture a backtrace in
`logs/app.log`; Windows heap-corruption failures may terminate before that hook.

Classic recording uses content width with 9px on both sides of its listening label
and 14px outer insets. Theme chooser thumbnails and the selected live preview render the production
components. Language names share one memoized formatter per model and locale.
