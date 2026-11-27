"""Generate offline and live golden transcripts on a public probe WAV."""

import argparse
import gc
import json
import wave
from pathlib import Path

import numpy as np
import onnxruntime as ort
import sentencepiece


def offline_text(pack, manifest, samples, language):
    n_fft, hop = manifest["n_fft"], manifest["hop_length"]
    window = np.fromfile(pack / manifest["window"], dtype="<f4")
    filters = np.fromfile(pack / manifest["filters"], dtype="<f4").reshape(-1, n_fft // 2 + 1)
    frames = np.lib.stride_tricks.sliding_window_view(samples, n_fft)[::hop]
    spectrum = np.fft.rfft(frames * window, axis=1)
    features = np.log(np.clip(np.absolute(spectrum) ** 2 @ filters.T, 1e-9, 1e9)).T
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.log_severity_level = 3
    encoder = ort.InferenceSession(str(pack / manifest["whole"]), options, providers=["CPUExecutionProvider"])
    values = [features.astype(np.float32)[None], np.array([features.shape[1]], dtype=np.int64)]
    if len(encoder.get_inputs()) == 3:
        vector = np.zeros((1, encoder.get_inputs()[2].shape[1]), dtype=np.float32)
        vector[0, ["auto", *manifest["languages"]].index(language)] = 1
        values.append(vector)
    lengths, projected = encoder.run(None, dict(zip([i.name for i in encoder.get_inputs()], values, strict=True)))
    advance = ort.InferenceSession(str(pack / manifest["advance"]), options, providers=["CPUExecutionProvider"])
    tokens, = advance.run(None, {"lengths": lengths, "projected": projected})
    row = tokens.transpose(1, 2, 0)[manifest["head_index"], 0]
    text = sentencepiece.SentencePieceProcessor(model_file=str(pack / manifest["tokenizer"])).decode(
        row[row >= 0].tolist()
    )
    return text


def record(pack, wav, cache, language, offline_only=False):
    manifest = json.loads((pack / "island-gigaam.json").read_text())
    with wave.open(str(wav), "rb") as reader:
        if (reader.getframerate(), reader.getnchannels(), reader.getsampwidth()) != (16000, 1, 2):
            raise ValueError("Expected mono 16 kHz signed PCM16 WAV")
        pcm = np.frombuffer(reader.readframes(reader.getnframes()), dtype="<i2")
    audio = pcm.astype(np.float32) / 32768.0
    golden = {"language": language, "onnx_runtime": ort.__version__, "onnx_offline": offline_text(pack, manifest, audio, language)}
    if offline_only:
        return golden
    gc.collect()
    import gigaam
    import torch
    samples = torch.from_numpy(audio)
    torch.set_num_threads(2)
    model = gigaam.load_model(manifest["model"], download_root=str(cache), device="cpu",
                              fp16_encoder=False, language=None if language == "auto" else language)
    with torch.inference_mode():
        encoded, lengths = model(samples[None], torch.tensor([len(samples)]))
        golden["torch_offline"] = model.decode(encoded, lengths)["e2e"][0]
    from gigaam.streaming import GigaAMStreaming
    streaming = GigaAMStreaming(model, 320, None if language == "auto" else language)
    parts = [streaming.transcribe_partial(chunk)["e2e"].text for chunk in samples.split(5120)]
    parts.append(streaming.flush()["e2e"].text)
    golden["torch_stream_320ms"] = "".join(parts)
    if not all(golden[key].strip() for key in ("torch_offline", "onnx_offline", "torch_stream_320ms")):
        raise ValueError("The speech probe returned an empty transcript")
    return golden


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pack", type=Path, required=True)
    parser.add_argument("--wav", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--language", default="auto")
    parser.add_argument("--offline-only", action="store_true", help="Test only the installed platform's ONNX Runtime")
    args = parser.parse_args()
    text = json.dumps(record(args.pack, args.wav, args.cache, args.language, args.offline_only), ensure_ascii=False, indent=2)
    args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
