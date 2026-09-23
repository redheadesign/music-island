# Dictation

Music Island adapts the Windows recording, shortcut, model, history and text
processing pipeline of [Handy 0.9.7](https://github.com/cjpais/Handy/tree/v0.9.7),
commit `05e0aedd2906f0d82722735f930465950c476b90`. Recognition remains native Rust/C++.
It does not launch Handy, install a service, create another tray icon or use its updater.

## Use

Open **Settings → Dictation** and enable the feature. Choose a model that supports
your language, inspect its download size and model card, then download it. Configure
the microphone and shortcut in General. A short test can be made in an ordinary
text editor. The default recording mode opens the microphone only while recording;
the default idle model timeout is five minutes. Better Voice is independent: select
its virtual input explicitly if you want to recognize processed audio.

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
Prompt templates use the literal `${output}` placeholder.

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
open the microphone or register recording shortcuts. Installed models have their
own “On this computer” group. Downloaded, selected and loaded-in-memory are separate
states; an imported selected model remains visible even when a search/language
filter would otherwise hide it. Selecting a model while disabled saves the choice
without starting recognition. Activation is serialized against suspension/shutdown.

The local Russian catalog recommends GigaAM v3 E2E-RNN-T Q8 and labels GigaAM v3 CTC
as an alternative. This is a UI recommendation, not an automatic model switch or a
claim that one model wins on every microphone. Model cards and capabilities remain
upstream data. Existing model choices are preserved.

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
