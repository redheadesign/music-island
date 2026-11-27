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
            on_release = item["url"] == BASE + asset
            if not on_release and not item["url"].startswith("https://huggingface.co/" + HF_PINS[model]):
                raise ValueError(f"Asset URL does not match a pinned source: {item['url']}")
            if on_release or name in {"LICENSE", "LICENSE-APACHE-2.0", "NOTICE"}:
                # Include attribution with the public export as well as the
                # canonical copies fetched when the app installs the pack.
                assets[asset] = (file, item)
    return catalog, assets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifacts", type=Path, help="Root containing both extracted Actions artifacts")
    commands = parser.add_mutually_exclusive_group(required=True)
    commands.add_argument("--stage", type=Path, help="Prepare byte-identical files for prerelease upload")
    commands.add_argument("--catalog", type=Path, help="Verify public release digests and write the catalog")
    parser.add_argument("--draft", action="store_true", help="Upload staged assets to the model draft on GitHub Actions")
    args = parser.parse_args()
    if args.draft and (not args.stage or os.environ.get("GITHUB_ACTIONS") != "true"):
        parser.error("--draft requires --stage on GitHub Actions")
    catalog, assets = collect(args.artifacts)
    if args.stage:
        if args.draft:
            embedded = Path("src-tauri/crates/handy-core/src/catalog/gigaam-packs.json")
            if catalog != json.loads(embedded.read_bytes()):
                raise ValueError("Model export locks differ from the tested application catalog")
            notices = {f"{model}-{name}" for model in MODELS for name in ("LICENSE", "LICENSE-APACHE-2.0", "NOTICE")}
            if len(assets) != 26 or not notices.issubset(assets):
                raise ValueError("Expected the 26 November model assets including all six license and notice copies")
        args.stage.mkdir(exist_ok=True, parents=True)
        extra = {path.name for path in args.stage.iterdir()} - set(assets)
        if extra:
            raise ValueError(f"Unexpected files in outgoing model assets: {sorted(extra)}")
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
        if args.draft:
            from draft import upload
            upload(TAG, REPOSITORY, args.stage, assets)
        return
    url = f"https://api.github.com/repos/{REPOSITORY}/releases/tags/{TAG}"
    with urllib.request.urlopen(url, timeout=30) as response:
        release = json.load(response)
    if release["draft"] or not release["prerelease"]:
        raise ValueError("Expected the published model prerelease")
    served = {entry["name"]: entry for entry in release["assets"]}
    if served.keys() != assets.keys():
        raise ValueError("Unexpected asset inventory in the published model prerelease")
    for name, (_, item) in assets.items():
        entry = served.get(name, {})
        if (entry.get("browser_download_url"), entry.get("size"), entry.get("digest")) != (
            BASE + name, item["size"], "sha256:" + item["sha256"]
        ):
            raise ValueError(f"Public asset differs from locked bytes: {name}")
    args.catalog.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8", newline="\n")


if __name__ == "__main__":
    main()
