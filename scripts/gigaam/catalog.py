"""Stage tested model artifacts or refresh the embedded catalog from a public release."""

import argparse
import hashlib
import json
import os
import shutil
import urllib.request
from pathlib import Path


TAG = "gigaam-2026-11"
REPOSITORY = "redheadesign/music-island"
BASE = f"https://github.com/{REPOSITORY}/releases/download/{TAG}/"
MODELS = ("gigaam-v4-rnnt", "gigaam-multilingual-v2-rnnt")
HF_PINS = {
    MODELS[0]: "ai-babai/gigaam-v4-onnx/resolve/7cfd40087b6180a83d9ef7fb991bd6813c48952f/",
    MODELS[1]: "ai-babai/gigaam-multilingual-v2-onnx/resolve/47ab61c18615af526e5d0c4484ef2e688027e6ed/",
}


def sha(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def collect(root):
    catalog = []
    assets = {}
    for model in MODELS:
        locks = list(root.rglob(model + ".lock.json"))
        if len(locks) != 1:
            raise ValueError(f"Expected exactly one lock for {model}")
        pack = json.loads(locks[0].read_bytes())
        if pack["id"] != model or not pack["streaming"]:
            raise ValueError(f"Invalid streaming package: {model}")
        catalog.append(pack)
        seen = set()
        for item in pack["files"]:
            name = item["name"]
            if Path(name).name != name or name in seen or not item["size"]:
                raise ValueError(f"Invalid file name or size: {name}")
            seen.add(name)
            file = locks[0].parent / model / name
            if file.stat().st_size != item["size"] or sha(file) != item["sha256"]:
                raise ValueError(f"Local file differs from tested lock: {file}")
            asset = f"{model}-{name}"
            if item["url"] == BASE + asset:
                assets[asset] = (file, item)
            elif not item["url"].startswith("https://huggingface.co/" + HF_PINS[model]):
                raise ValueError(f"Asset URL does not match a pinned source: {item['url']}")
    return catalog, assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path, help="Root containing both extracted Actions artifacts")
    commands = parser.add_mutually_exclusive_group(required=True)
    commands.add_argument("--stage", type=Path, help="Prepare byte-identical files for prerelease upload")
    commands.add_argument("--catalog", type=Path, help="Verify public release digests and write the catalog")
    args = parser.parse_args()
    catalog, assets = collect(args.artifacts)
    if args.stage:
        args.stage.mkdir(exist_ok=True, parents=True)
        for name, (source, item) in assets.items():
            target = args.stage / name
            if target.exists():
                if sha(target) != item["sha256"]:
                    raise ValueError(f"Staged asset differs: {target}")
                continue
            try:
                os.link(source, target)
            except OSError:
                shutil.copyfile(source, target)
        return
    url = f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{TAG}"
    with urllib.request.urlopen(url, timeout=30) as response:
        release = json.load(response)
    if release["draft"] or not release["prerelease"]:
        raise ValueError("Expected the published model prerelease")
    served = {entry["name"]: entry for entry in release["assets"]}
    for name, (_, item) in assets.items():
        entry = served.get(name, {})
        if (entry.get("browser_download_url"), entry.get("size"), entry.get("digest")) != (
            item["url"], item["size"], "sha256:" + item["sha256"]
        ):
            raise ValueError(f"Public asset differs from locked bytes: {name}")
    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")


if __name__ == "__main__":
    main()
