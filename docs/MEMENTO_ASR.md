# Memento speech recognition on Windows

The installed Disrupt Memento 1.1.4 selects `gigaam / giga-edge/memento.desktop.1.2.0`. Its technical log identifies the native loader as `giga-edge 0c626cea (win32-x64)`, interface `1`, and confirms that it loaded the `memento.desktop.1.2.0.20261023` pack. The pack's `asr/meta.json` identifies the recognizer as `asr.gigaam_duo.v1.1.meeting.v2`.

The Windows pack contains an ONNX encoder with a separate weights file, an ONNX RNN-T decoder and joint network, vocabulary and an opaque model configuration. The six ASR files total about 517 MB. The pack also includes Silero VAD with a separate end-of-utterance model. Its manifest describes `audio`, `stream_start`, `stream_end` and `utterance` inputs and `segment` output. That interface can deliver work incrementally. It does not establish how much inference runs before the recording stops. The installation ships DirectML and the log shows ONNX Runtime CPU sessions. The exact execution provider of the Duo encoder could not be established from those logs.

Memento also contains a manifest for the separate [MIT GigaAM v3 E2E RNN-T ONNX port](https://huggingface.co/istupakov/gigaam-v3-onnx/tree/322c3b29492673eb7d0b434bfa9dfb8653e34d02). Its encoder, vocabulary and hashes differ from the selected Duo pack. The bundled `Nemotron-3-Diarization` identifies speakers. It is not the speech recognition model. Memento lists optional LLM analysis separately from local transcription. [Memento product site](https://get-memento.app/)

## What a downloadable Duo entry needs

The [GigaAM v3 MIT release](https://developers.sber.ru/kak-v-sbere/culture/gigaAM-v3) and Memento's product software notice do not establish permission to distribute the exact Duo checkpoint. This check found no public download with terms for `asr.gigaam_duo.v1.1.meeting.v2`. No installed model or DLL was copied. A catalog entry for this checkpoint requires an authoritative pack URL and terms from its publisher, plus a supported way to load it outside Memento.

1. Obtain the documented checkpoint, its license, download URL and inference interface. Verify versioned filenames, size and SHA-256 before exposing a download. If terms allow only an independently installed local copy, expose an explicit local import instead.
2. Prove recognition on the existing Windows x64 CPU runtime with a public 16 kHz test clip. Check the model graph's input/output schema, preprocessing, tokenizer and encoder/decoder contract. The current GGUF catalog delegates to [transcribe.cpp](https://github.com/handy-computer/transcribe.cpp/blob/main/docs/models/gigaam.md). The existing ONNX GigaAM loader accepts a single-model CTC directory. Neither path has a verified loader for this split Duo RNN-T pack. Use a compatible GGUF conversion only if the publisher supplies sufficient model details and output matches the reference. Otherwise implement a separate, documented native loader and test it before deciding whether DirectML support is needed.
3. Reuse the native model-manager download and installation flow. The pack needs an immutable archive hash and fixed expected files, including external encoder weights. Stage and verify the entire directory before making the entry selectable. Its capability flags must reflect what the tested runtime supports.
4. Compare cold-load time, stop-to-text time, peak memory and transcript quality on the same public Russian clips. Include a short dictation, a minute without pauses and a longer clip with natural pauses. Compare raw recognition with optional LLM processing disabled. Record the resolved execution provider and whether streaming is enabled.

## Models already available for comparison

| Model | What to verify |
| --- | --- |
| [GigaAM v3 E2E-RNN-T Q8](https://huggingface.co/handy-computer/gigaam-v3-e2e-rnnt-gguf) | Existing Russian recommendation and closest same-family baseline. The download is about 274 MB and includes punctuation and text normalization. |
| [Nemotron Streaming 3.5](https://huggingface.co/handy-computer/nemotron-3.5-asr-streaming-0.6b-gguf) | Existing Russian-capable streaming entry for comparing stop-to-text latency. The publisher describes a cache-aware ASR model. [NVIDIA model card](https://huggingface.co/nvidia/nemotron-3.5-asr-streaming-0.6b) |
| [Parakeet TDT 0.6B v3](https://huggingface.co/handy-computer/parakeet-tdt-0.6b-v3-gguf) | Existing multilingual entry for checking Russian speech with English names and terms. |
| [GigaAM Multilingual](https://huggingface.co/ai-sage/GigaAM-Multilingual) | A newer MIT CTC family. A port would still need verified inference compatibility and measured Russian performance. |

## Local import and long recording check

The installed decoder's filename ends in `.onnx`, but the packaged file is not readable as a standard model. We tried the installed `decoder.onnx` directly with [`CreateSession` from Microsoft ONNX Runtime 1.24.2](https://github.com/microsoft/onnxruntime/blob/v1.24.2/include/onnxruntime/core/session/onnxruntime_c_api.h), using the runtime shipped with the Music Island test build. The same CPU loader opened Music Island's Silero ONNX control. It rejected the Duo decoder with code `7`, `Protobuf parsing failed`. Only model files were read for this check. The pack requires a supported loader before Music Island can offer it for local import.

The synthetic test WAV is `.local/memento-bench/ru-repeated-121s.wav` in the primary workspace. It is 121.125 seconds of mono PCM at 16 kHz, made by repeating the existing 8.075-second Russian fixture 15 times. Its SHA-256 is `994e12f01bf9e6f60c63519a7b8cfbe314c2283ddb47703f29aa01279683f8a5`. No private recordings were used.

| Same audio on an AMD Ryzen 7 4700U with Radeon graphics | Inference after the model was loaded | Transcript check |
| --- | ---: | --- |
| Music Island GigaAM v3 E2E RNN-T Q8, Vulkan, one call | 83.524 s | 148 output words for 165 expected from the repeated short fixture |
| Same Music Island model, seven pause-aligned calls | 41.100 s, plus 40 ms to plan the cuts | All 165 words matched the repeated short-fixture transcription in order |
| Memento's installed Duo | Unmeasured | Unmeasured |

These Music Island runs measure inference over an already recorded file. They exclude initial model loading, recording, optional AI processing and text insertion. The transcript check compares with repeated short-fixture recognition, so it measures consistency rather than a human-annotated word error rate. Raw results are in `.local/dictation-long-qa/{auto,chunks-auto}.jsonl`.

The desktop tool timed out while waiting for app-launch approval before the Memento window opened. A supported local audio-file import or scripting interface could not be verified, so the table contains no claim about Duo speed or accuracy. If a supported Memento file flow becomes available, feed it the same WAV, time from starting recognition to the final transcript, and compare the unprocessed text with the same reference.
