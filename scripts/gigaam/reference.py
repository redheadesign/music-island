"""Generate offline and live golden transcripts on a public probe WAV."""

import argparse
import gc
import json
from pathlib import Path

import gigaam
import numpy as np
import onnxruntime as ort
import sentencepiece
import torch


def offline_text(pack, manifest, samples, language):
    n_fft, hop = manifest["n_fft"], manifest["hop_length"]
    window = np.fromfile(pack / manifest["window"], dtype="<f4")
    filters = np.fromfile(pack / manifest["filters"], dtype="<f4").reshape(-1, n_fft // 2 + 1)
    frames = np.lib.stride_tricks.sliding_window_view(samples, n_fft)[::hop]
    spectrum = np.fft.rfft(frames * window, axis=1)
    features = np.log(np.clip(np.absolute(spectrum) ** 2 @ filters.T, 1e-9, 1e9)).T
    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
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


def record(pack, wav, cache, language):
    manifest = json.loads((pack / "island-gigaam.json").read_text())
    samples = gigaam.load_audio(str(wav))
    golden = {"language": language, "onnx_offline": offline_text(pack, manifest, samples.numpy(), language)}
    gc.collect()
    torch.set_num_threads(2)
    model = gigaam.load_model(manifest["model"], download_root=str(cache), device="cpu",
                              fp16_encoder=False, language=None if language == "auto" else language)
    golden["torch_offline"] = model.transcribe(str(wav))["e2e"].text
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
    args = parser.parse_args()
    text = json.dumps(record(args.pack, args.wav, args.cache, args.language), ensure_ascii=False, indent=2)
    args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
