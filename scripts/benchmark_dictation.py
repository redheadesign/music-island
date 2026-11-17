"""Compare local Windows portable builds using their isolated dictation probe."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
from statistics import median
import subprocess
import sys
import tempfile
from time import perf_counter
import wave


def sha256(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def words(text):
    return re.findall(r"[^\W_]+", text.casefold().replace("ё", "е"))


def word_errors(reference, hypothesis):
    previous = list(range(len(hypothesis) + 1))
    for position, expected in enumerate(reference, start=1):
        current = [position]
        for index, observed in enumerate(hypothesis, start=1):
            current.append(min(previous[index] + 1, current[-1] + 1,
                               previous[index - 1] + (expected != observed)))
        previous = current
    return previous[-1]


def recognize(exe, model, audio, profile, accelerator, strategy, timeout):
    roaming = profile / "Roaming"
    local = profile / "Local"
    roaming.mkdir(parents=True, exist_ok=True)
    local.mkdir(parents=True, exist_ok=True)
    report_path = roaming / "Music Island" / "dictation" / "runtime-check.json"
    # Each application invocation must produce its own fresh report.
    report_path.unlink(missing_ok=True)
    started = perf_counter()
    process = subprocess.run(
        [str(exe), "--dictation-runtime-check", str(model), str(audio), accelerator, strategy],
        env=dict(os.environ, APPDATA=str(roaming), LOCALAPPDATA=str(local)),
        creationflags=subprocess.CREATE_NO_WINDOW, stdout=sys.stderr, timeout=timeout, check=False,
    )
    wall_ms = round((perf_counter() - started) * 1000)
    if not report_path.is_file():
        raise RuntimeError(f"{exe.name} exited {process.returncode} without a probe report")
    result = json.loads(report_path.read_text(encoding="utf-8-sig"))
    if process.returncode or result.get("vad") != "passed" or not result.get("unloaded"):
        raise RuntimeError(f"{exe.name}: {result.get('error', 'incomplete native probe')}")
    # Older builds only support raw inference and omit the strategy field.
    if result.get("strategy", "raw") != strategy:
        raise RuntimeError(f"{exe.name} did not run the requested {strategy} strategy")
    actual = result["backend"].casefold()
    if accelerator != "auto" and not actual.startswith(accelerator):
        raise RuntimeError(f"Requested {accelerator}, loaded {result['backend']}")
    return result, wall_ms


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("baseline", "candidate", "model", "audio", "reference"):
        parser.add_argument(f"--{name}", required=True, type=Path)
    parser.add_argument("--baseline-strategy", choices=("raw", "planned"), default="raw")
    parser.add_argument("--candidate-strategy", choices=("raw", "planned"), default="planned")
    parser.add_argument("--accelerator", choices=("cpu", "vulkan", "auto"), default="vulkan")
    parser.add_argument("--pairs", type=int, default=5)
    parser.add_argument("--timeout", type=int, default=600, help="Maximum seconds per invocation.")
    parser.add_argument("--output", type=Path, help="Write local JSON; otherwise print it.")
    args = parser.parse_args()
    if os.name != "nt" or args.pairs < 1 or args.timeout < 1:
        parser.error("This probe requires Windows, a positive pair count and a positive timeout")
    inputs = {name: getattr(args, name).resolve(strict=True)
              for name in ("baseline", "candidate", "model", "audio", "reference")}
    if args.output and args.output.resolve() in inputs.values():
        parser.error("--output must be a separate file")
    with wave.open(str(inputs["audio"]), "rb") as audio:
        if audio.getparams()[:3] != (1, 2, 16000) or audio.getcomptype() != "NONE":
            parser.error("--audio must be mono PCM16 WAV at 16 kHz")
        frames = audio.getnframes()
    reference = words(inputs["reference"].read_text(encoding="utf-8-sig"))
    if not reference or not frames:
        parser.error("The audio and its reference transcript must both contain content")
    output = {
        "sha256": {name: sha256(path) for name, path in inputs.items()},
        "audioSeconds": frames / 16000, "referenceWords": len(reference),
        "requestedAccelerator": args.accelerator, "pairs": args.pairs, "runs": [],
    }
    scores = {}
    with tempfile.TemporaryDirectory(prefix="music-island-asr-") as temp:
        for pair in range(args.pairs):
            order = ("baseline", "candidate") if pair % 2 == 0 else ("candidate", "baseline")
            for variant in order:
                strategy = getattr(args, f"{variant}_strategy")
                print(f"Pair {pair+1}/{args.pairs}: {variant} ({strategy})", file=sys.stderr, flush=True)
                result, wall_ms = recognize(inputs[variant], inputs["model"], inputs["audio"],
                                            Path(temp) / variant, args.accelerator, strategy, args.timeout)
                if abs(result["audioSeconds"] - frames / 16000) > 1 / 16000:
                    raise RuntimeError("Reported audio duration does not match the supplied WAV")
                transcript = words(result["text"])
                key = hashlib.sha256(" ".join(transcript).encode("utf-8")).hexdigest()
                if key not in scores:
                    scores[key] = word_errors(reference, transcript)
                output["runs"].append({
                    "pair": pair + 1, "variant": variant, "strategy": strategy, "backend": result["backend"],
                    "initializeMs": result["initializeMs"], "loadMs": result["loadMs"],
                    "recognizeMs": result["recognizeMs"], "processWallMs": wall_ms,
                    "segments": result.get("segments"), "wordErrors": scores[key],
                    "wer": scores[key] / len(reference), "normalizedTranscriptSha256": key,
                })
    if len({row["backend"] for row in output["runs"]}) != 1:
        raise RuntimeError("Different backends were used; the timing comparison is inconclusive")
    output["medianRecognizeMs"] = {
        variant: median(row["recognizeMs"] for row in output["runs"] if row["variant"] == variant)
        for variant in ("baseline", "candidate")
    }
    payload = json.dumps(output, indent=2, ensure_ascii=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n", encoding="utf-8")
    else:
        print(payload)


if __name__ == "__main__":
    main()
