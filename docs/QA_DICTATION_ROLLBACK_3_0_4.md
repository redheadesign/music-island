# Dictation rollback candidate 3.0.4

Prepared following the user's October 21 report. The user accepted the tested
EXE and explicitly authorized publication on October 21: “Ладно, всё окей, публикуй”.

## Scope

Windows delayed-render clipboard workers introduced in 3.0.3 are excluded from
production compilation, including saved experimental opt-ins. The synchronous
3.0.2 path is restored. It checks the clipboard sequence before restoring saved
text/image, and the coordinator waits for actual main-thread insertion completion.
Fox/theme/rendering changes are retained. Inference DLL/ABI and saved settings are
unchanged. A bounded lifecycle log excludes speech and clipboard content; Rust
panic logging additionally captures a backtrace.

This is a rollback, not a complete resolution of the original fixed-delay paste
race. A heavily stalled target can still read after restoration. The sequence
check detects changes before restoration; it is not an atomic compare-and-write
transaction with the clipboard library. Real rapid dictation under the user's
normal workload remains a required acceptance check.

## Observed crashes

Windows Application events 1000/1001 confirm version 3.0.3 heap-corruption
failures (c0000374, detected in ntdll.dll) on October 21 at 13:54:45 and 14:25:37
Moscow. The archived WER reports remain; referenced temporary dumps are gone.
They do not identify the corrupting call or establish that clipboard code caused
these failures. A separate Tao Destroyed-state Rust panic occurred October 20
22:55:09 Moscow. No recent transcription contents were read for this investigation.

`%LOCALAPPDATA%/com.redheadesign.music-island/logs/Music Island.log` was empty;
`dictation/logs` also contained no diagnostics. The new independent lifecycle log
addresses this gap, but cannot replace a native crash dump. No user profile,
clipboard or global crash-dump registry configuration was changed during testing.

## Verification

- 284 core Rust tests passed; one Windows integration test intentionally ignored
  in the normal suite and run separately.
- The isolated Windows test passed, including 60 consecutive synchronous finish/
  restore cycles and a newer copy during insertion. Its own window station and
  desktop keep all clipboard operations away from the interactive user session.
  Its historical delayed-render scenarios exercise the retired implementation
  only in test builds; they do not claim to test Windows keyboard injection.
- New scheduling tests cover delayed execution, discarded work and scheduling
  rejection without prematurely releasing or stranding the pipeline.
- 256 frontend tests across 54 files, production frontend build and lint/import
  boundaries passed. Existing unrelated lint/Rust warnings remain.
- `cargo check --locked` and the optimized Tauri portable build passed.
- Ready packet: `release/v3.0.4/music-island.exe`, version 3.0.4, 76,377,600 bytes.
  SHA-256: `be890622ed301005686b6dac765f5c5f86547aa7f415696e492685403557629c`.
- All 441 frozen source inputs match; embedded HTML/JS/CSS match the frozen
  frontend. PE is Windows GUI/x64. All 52 embedded resources (27 DLLs) verify;
  all 26 dictation bundle DLLs are unchanged. Retired Windows transaction markers
  and window class are absent from the binary; lifecycle diagnostics are present.
- EXE-only probes in fresh profiles passed Russian/English CPU recognition,
  Silero VAD, ABI1, model unload and all 26 extracted DLL checksums. They do not
  verify the user's GigaAM model, real microphone/hotkeys, GUI/window interaction
  or absence of crashes during prolonged normal use.

User acceptance and publication approval apply to the exact EXE above, without
rebuilding. The published 3.0.3 packet retains its original checksum. The root
`release/` copy matches the accepted 3.0.4 packet. README/version documentation and
the changelog date are updated for publication; these documentation-only changes
do not alter the accepted executable or compiled inputs. The unknown crash origin
and fixed-delay limitation remain open despite the user's successful test.

Evidence lives in ignored `.local/dictation-rollback-*.log`,
`.local/dictation-rollback-crashes.json` and `.local/release-3.0.4-input/manifest.json`.
