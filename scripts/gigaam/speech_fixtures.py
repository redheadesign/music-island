"""Fetch one short, public FLEURS test utterance per acceptance language."""
import argparse
import csv
import hashlib
import io
import json
import subprocess
import tarfile
from pathlib import Path
from urllib.request import urlopen

REVISION = "70bb2e84b976b7e960aa89f1c648e09c59f894dd"
DATASET = "https://huggingface.co/datasets/google/fleurs"


def fetch_sample(locale, target):
    base = f"{DATASET}/resolve/{REVISION}/data/{locale}/"
    with urlopen(base + "test.tsv", timeout=60) as response:
        rows = csv.reader(io.TextIOWrapper(response, encoding="utf-8"), delimiter="\t")
        references = {r[1]: r[2] for r in rows if 48_000 <= int(r[-2]) <= 144_000}
    with urlopen(base + "audio/test.tar.gz", timeout=90) as response:
        with tarfile.open(fileobj=response, mode="r|gz") as archive:
            for member in archive:
                name = Path(member.name).name
                if not member.isfile() or name not in references:
                    continue
                if not 0 < member.size < 4_000_000:
                    raise ValueError(f"Unexpected WAV size for {name}")
                original = archive.extractfile(member).read()
                break
            else:
                raise ValueError(f"No short utterance found for {locale}")
    destination = target / f"{locale}.wav"
    subprocess.run(["ffmpeg", "-nostdin", "-loglevel", "error", "-y", "-i", "pipe:0",
                    "-map_metadata", "-1", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le",
                    str(destination)], input=original, check=True)
    return {"locale": locale, "original": name, "reference": references[name],
            "sourceSha256": hashlib.sha256(original).hexdigest(),
            "probeSha256": hashlib.sha256(destination.read_bytes()).hexdigest()}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    samples = [fetch_sample(locale, args.output) for locale in ["ru_ru", "en_us", "kk_kz", "de_de"]]
    (args.output / "sources.json").write_text(json.dumps({
        "dataset": DATASET, "revision": REVISION, "license": "CC-BY-4.0", "samples": samples
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
