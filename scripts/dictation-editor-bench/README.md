# Windows release-to-editor benchmark

This benchmark plays a known Russian WAV into the dedicated VB-Audio virtual cable. Music Island handles the F24 push-to-talk shortcut, records through CPAL, runs GigaAM, saves History, and delivers its transcript through the supported ExternalScript insertion method. A separate Win32 multiline editor timestamps the first EN_CHANGE. The start timestamp brackets the operating system's F24 key-up injection in that editor. Both endpoints use QueryPerformanceCounter. This measures insertion through ExternalScript. Clipboard paste and physical keyboard hardware latency need separate measurements.

## Running a pair

Use PowerShell 7, Visual Studio C++ desktop tools, the project’s npm dependencies, the portable CI executable, and the local GigaAM v3 E2E RNN-T Q8_0 GGUF. The portable must support the exact-input capture constraint. Close other Music Island instances before starting. Keep the dedicated virtual cable free of other audio and the test editor in the foreground. Get its exact render and capture names with the helper's `list` command.

A JSON manifest contains one object per trial. Adjacent baseline and candidate cases should use the same source and reference. Give every repeat its own ID. WAVs must contain 16 kHz mono PCM16.

```json
[
  {"id":"natural-b1","mode":"baseline","audio":"C:/fixtures/natural.wav","reference":"C:/fixtures/natural.txt"},
  {"id":"natural-c1","mode":"candidate","audio":"C:/fixtures/natural.wav","reference":"C:/fixtures/natural.txt"}
]
```

```powershell
./scripts/dictation-editor-bench/run.ps1 -Executable $portable -SHA256 $verifiedHash -Model $weights -Manifest $manifest -Output "$PWD/.local/editor-e2e-runs" -CaptureName $virtualInput -RenderName $pairedOutput
python ./scripts/dictation-editor-bench/score.py $manifest .local/editor-e2e-runs
```

Each process starts in a fresh profile. Both modes load the same model on Vulkan before pressing F24. The candidate also decodes finalized speech segments while recording. The launcher requires enough room for one staged copy of the model and one temporary runtime. It stops before capture when the capture constraint, editor, model, preferences, endpoint, or build verification fails. Its startup sentinel protects the working installation from the app's normal startup reconciliation. It checks the existing profile index and autorun registration again after exit.

## Reading results

Each trial preserves the input and executable digests in `trial.json`, the actual History WAV, `editor.txt`, native logs and `report.json`. The report includes elapsed milliseconds from F24 release to the first native editor text change, the bound backend, peak working set, dropped-capture warnings, and chunk reuse diagnostics when available. It verifies the native History transcript against the text in the editor. `integrity.json` marks a completed profile check. Only repeatable WebView and runtime caches are removed after the owned process exits.

Use alternating order on repeated pairs. Report the matched-pair median for long fixtures and p95 for short fixtures alongside sample counts. Test natural pauses, reduced pauses and a continuous control. Compare normalized WER against the same reference and inspect changed words at segment boundaries. Persistent output can resume completed trials with matching inputs and executable hashes.
