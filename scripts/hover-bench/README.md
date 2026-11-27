# Windows hover benchmark

Run on a disposable Windows desktop with WebView2, Python 3 (the Windows `py` launcher), Node and the project's npm dependencies. The benchmark moves the Windows cursor and clicks the actual Settings button. Use a fresh Windows account or Windows Sandbox. Keep the existing desktop and profile available for ordinary work.

Place each portable EXE next to its workflow-generated `SHA256.txt`. Use the Windows Settings display scale to set the disposable desktop to 100%, then run the pair in PowerShell.

```powershell
$env:MUSIC_ISLAND_DISPOSABLE_DESKTOP = '1'
./scripts/hover-bench/compare.ps1 -BaselineExe C:\QA\baseline\music-island.exe -CandidateExe C:\QA\candidate\music-island.exe -Output C:\QA\pair-100 -Dpi 96
```

Repeat after switching Windows to 150%, using a new output directory and `-Dpi 144`. The helper reads the DPI of the actual overlay HWND and the refresh rate of its monitor. The workflow's `hover_benchmark` option runs the approved 3.2.2 baseline and candidate on one hosted runner at its measured scale. The per-build report identifies the physical monitor and configured dwell.

Each run includes the first hover after startup, the next one after five minutes collapsed, and 198 further hovers. In the default `models` scenario the application downloads the same Whisper Small model, verifies its SHA-256 and loads it while hovering continues. Per-span results include only trials whose acceptance-to-first-targetable-frame interval intersects native workload events. The run reports a missing workload when a short hash or load happened entirely between gestures. A failed download or load is recorded as an error. Use `-Scenario idle` to collect an idle-only pair.

For a candidate-only run with a newly published model, set `MUSIC_ISLAND_HOVER_MODEL` to its catalog ID and run `node scripts/hover-bench/run.mjs C:\QA\candidate\music-island.exe $candidateSha C:\QA\new-model 200 auto 300 models`. Its isolated Settings WebView invokes the application's catalog download, checksum and cold-load paths.

Use `-Scenario streaming -IdleSeconds 0` on a disposable desktop equipped with a test audio input. The harness pauses before each build's trials to allow a streaming-capable model, test audio and active live dictation to be prepared in the fresh profile. Only trials overlapping the application's ready streaming state count. No recorded speech or text is included in the report. For live GPU lens QA, enable it in Appearance in the disposable profile and verify the native visual handoff described in the QA guide.

The runner refuses an existing Music Island profile or process. It starts the supplied EXE with separate AppData and WebView2 folders and discovers the debugging endpoint from the new WebView profile. It moves the cursor to the overlay edge and attempts a single OS click at the centre of the first hittable Settings button. A successful trial requires both a trusted DOM click and a visible native Settings window owned by the benchmark process. Coordinates go through the actual window client rectangle, including monitor DPI. The helper skips clicks landing on another window. The runner then closes the owned settings window and moves the pointer off the island.

`report.json` is written after every trial. It includes the OS pointer movement, the first WebView edge contact, configured-gesture acceptance, the first sampled visible and hittable frames, native click injection, trusted click reception and the Settings action outcome. Timestamps use Unix epoch milliseconds. `peekCommit` is a DOM update, and requestAnimationFrame plus computed visibility measures a render opportunity. Measuring physical scanout requires an external display trace. The older build uses the first `opening` DOM commit as its acceptance proxy unless built with the two measurement markers.

Review p99, maximum, every trial over two measured display periods and every missed first click. Keep first-launch, long-idle and workload trials identifiable. Report injection and input-delivery latency separately from accepted-to-frame latency. The five-minute collapsed interval includes CPU time for the native process and continuously present descendants including WebView2. The report flags process turnover. One fully occupied core corresponds to 100%. The debugger remains attached during this interval with frame sampling suspended.
