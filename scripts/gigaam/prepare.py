"""Prepare Music Island's CPU RNNT packs using pinned upstream models and graphs.

Run using the packages in requirements.txt. The build only writes to OUTPUT.
The resulting lock file lists exactly the model bytes the Windows client verifies.
"""

import argparse
import hashlib
import json
import os
import shutil
import urllib.request
from pathlib import Path
from unittest.mock import patch

import numpy as np


EXPORT_REV = "e9bbf2e773eedd217c6f0d3b89b9728c41332b7d"
MODELS = {
    "v4_rnnt": ("gigaam-v4-rnnt", "GigaAM-v4", "gigaam-v4-onnx",
                "7cfd40087b6180a83d9ef7fb991bd6813c48952f", "rnnt/"),
    "multilingual_v2_rnnt": ("gigaam-multilingual-v2-rnnt", "GigaAM Multilingual-v2",
                              "gigaam-multilingual-v2-onnx",
                              "47ab61c18615af526e5d0c4484ef2e688027e6ed", ""),
}


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def fetch(url, path, expected=None):
    if path.exists() and expected and digest(path) == expected:
        return
    tmp = path.with_suffix(path.suffix + ".partial")
    with urllib.request.urlopen(url, timeout=120) as source, tmp.open("wb") as output:
        shutil.copyfileobj(source, output, 1024 * 1024)
    if expected and digest(tmp) != expected:
        raise RuntimeError(f"SHA-256 mismatch for {url}")
    tmp.replace(path)


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def lock_file(file, url):
    return {"name": file.name, "url": url, "size": file.stat().st_size, "sha256": digest(file)}


def prepare(model_name, target, cache, release_base, offline_only):
    import gigaam
    import torch

    ident, name, repo, revision, prefix = MODELS[model_name]
    pack = target / ident
    pack.mkdir(parents=True, exist_ok=True)
    workspace = target / "export" / ident
    workspace.mkdir(parents=True, exist_ok=True)
    base = f"https://huggingface.co/ai-babai/{repo}/resolve/{revision}/"
    fetch(base + prefix + "manifest.json", workspace / "offline.json")
    reference = json.loads((workspace / "offline.json").read_text())
    assert reference.get("upstream_revision", reference.get("upstream_code_revision")) == EXPORT_REV
    files = []
    for suffix in ("encoder.int8.onnx", "advance.onnx", "e2e_tokenizer.model"):
        filename = model_name + "_" + suffix
        url = base + prefix + filename
        source = reference["files"][filename]
        fetch(url, pack / filename, source["sha256"])
        files.append(lock_file(pack / filename, url))
    for filename in ("LICENSE", "LICENSE-APACHE-2.0", "NOTICE"):
        fetch(base + filename, pack / filename)
        files.append(lock_file(pack / filename, base + filename))
    mel_name = model_name + "_mel.npz"
    fetch(base + prefix + mel_name, workspace / mel_name, reference["files"][mel_name]["sha256"])
    with np.load(workspace / mel_name, allow_pickle=False) as mel:
        mel["window"].astype("<f4").tofile(pack / "window.f32")
        mel["filterbank"].T.astype("<f4").tofile(pack / "filters.f32")
        n_mels = mel["filterbank"].shape[1]
        n_fft = len(mel["window"])

    langs = ["ru", "en"]
    if model_name == "multilingual_v2_rnnt":
        fetch(base + "config.json", workspace / "config.json", reference["files"]["config.json"]["sha256"])
        cfg = json.loads((workspace / "config.json").read_text())["cfg"]
        langs = cfg["language_conditioning"]["languages"]
    manifest = {
        "version": 1, "model": model_name, "languages": langs,
        "whole": model_name + "_encoder.int8.onnx", "advance": model_name + "_advance.onnx",
        "tokenizer": model_name + "_e2e_tokenizer.model", "head_index": reference["head_order"].index("e2e"),
        "window": "window.f32", "filters": "filters.f32", "n_fft": n_fft,
        "hop_length": 160, "n_mels": n_mels, "stream_manifest": None,
        "blank_ids": [], "pred_hidden": 0,
    }
    local_files = [pack / "window.f32", pack / "filters.f32"]
    if not offline_only:
        model = gigaam.load_model(model_name, download_root=str(cache), device="cpu", fp16_encoder=False)
        # The Triton-native export includes the stateful packet decoder as an ONNX
        # graph. Its CPU execution provider is the one embedded in Music Island.
        model.encoder._triton_native = True
        model.encoder._triton_provider = "CPUExecutionProvider"
        stream_dir = workspace / "stream"
        stream_dir.mkdir(exist_ok=True)
        stream_file = stream_dir / "streaming.json"
        if not stream_file.exists():
            torch.set_num_threads(min(4, os.cpu_count() or 1))
            # Run the pinned exporter on this disposable model in place. Its
            # public API deep-copies the entire FP32 model, exhausting 16 GB
            # runners while tracing the 774M checkpoint. Offline graphs come
            # from a separate full-context export, so omit the redundant graphs.
            from gigaam import utils
            converter = utils.onnx_converter

            def only_required_graphs(name, *args, **kwargs):
                if name.endswith(("_stream_step", "_stream_frontend", "_packet_decode")):
                    converter(name, *args, **kwargs)

            with patch.object(utils, "onnx_converter", only_required_graphs):
                model._to_onnx(str(stream_dir), torch.float32, 320, streaming=True, dynamic_context=True)
        stream = json.loads(stream_file.read_text())
        if stream["future_context_ms"] != 320 or "packet_decode" not in stream:
            raise RuntimeError("Incorrect upstream streaming export")
        parts = [stream["frontend"]["file"], stream["step"]["file"], stream["packet_decode"]]
        # Keep only the graphs actually used by the native packet path. Offline
        # inference uses the full-context encoder, not the limited-context whole graph.
        stream.pop("whole", None)
        stream.pop("advance", None)
        stream["model_name"] = model_name
        for part in parts:
            local_files.extend(copy_graph(stream_dir / part, pack))
        write_json(pack / "streaming.json", stream)
        local_files.append(pack / "streaming.json")
        heads = stream["packet_heads"]
        if heads != reference["head_order"]:
            raise ValueError("Different offline and streaming head order")
        manifest.update(stream_manifest="streaming.json",
                        blank_ids=[model.decodings[h].blank_id for h in heads],
                        pred_hidden=int(model.cfg.heads[heads[0]].decoder.pred_hidden))
    write_json(pack / "island-gigaam.json", manifest)
    local_files.append(pack / "island-gigaam.json")
    for file in local_files:
        files.append(lock_file(file, f"{release_base.rstrip('/')}/{ident}-{file.name}"))
    write_json(target / (ident + ".lock.json"), {
        "id": ident, "name": name, "languages": langs, "streaming": bool(manifest["stream_manifest"]),
        "files": files,
    })


def copy_graph(source, pack):
    """Consolidate external initializers into shards below GitHub's asset limit."""
    import onnx
    from onnx.external_data_helper import _get_all_tensors, set_external_data

    graph = onnx.load(source, load_external_data=False)
    destination = pack / source.name
    shards = []
    stream = None
    try:
        for tensor in _get_all_tensors(graph):
            if not tensor.external_data:
                continue
            spec = {arg.key: arg.value for arg in tensor.external_data}
            data = (source.parent / spec["location"]).resolve()
            if not data.is_relative_to(source.parent.resolve()):
                raise ValueError("External initializer outside export root")
            start = int(spec.get("offset", 0))
            length = int(spec.get("length", data.stat().st_size - start))
            if length > 512 * 1024 * 1024:
                raise ValueError(f"Initializer exceeds shard limit: {tensor.name}")
            if stream is None or stream.tell() + length > 512 * 1024 * 1024:
                if stream:
                    stream.close()
                shards.append(pack / f"{source.stem}-{len(shards):03d}.bin")
                stream = shards[-1].open("wb")
            offset = stream.tell()
            with data.open("rb") as source_bytes:
                source_bytes.seek(start)
                remaining = length
                while remaining:
                    chunk = source_bytes.read(min(1024 * 1024, remaining))
                    if not chunk:
                        raise EOFError(data)
                    stream.write(chunk)
                    remaining -= len(chunk)
            tensor.raw_data = b""
            set_external_data(tensor, shards[-1].name, offset, length)
            tensor.ClearField("raw_data")
    finally:
        if stream:
            stream.close()
    if shards:
        destination.write_bytes(graph.SerializeToString())
    else:
        shutil.copyfile(source, destination)
    return [destination, *shards]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("model", choices=MODELS)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--release-base", required=True)
    parser.add_argument("--offline-only", action="store_true", help="Stage only a full-context test fixture")
    args = parser.parse_args()
    prepare(args.model, args.out.resolve(), args.cache.resolve(), args.release_base, args.offline_only)
