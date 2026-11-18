"""Score paired release-to-editor trials against their fixed Russian transcripts."""
import argparse
from difflib import SequenceMatcher
from functools import cache
import json
from math import ceil, isfinite
from pathlib import Path
from statistics import median
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from benchmark_dictation import sha256, word_errors, words


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


@cache
def fixture_hash(path):
    return sha256(path)


def percentile95(values):
    return sorted(values)[ceil(.95 * len(values)) - 1]


def word_changes(baseline, candidate):
    changes = []
    for kind, a, b, c, d in SequenceMatcher(None, baseline, candidate, autojunk=False).get_opcodes():
        if kind != "equal":
            changes.append({
                "operation": kind, "baselineIndex": a, "candidateIndex": c,
                "baselineWords": baseline[a:b], "candidateWords": candidate[c:d],
            })
    return changes


def score(manifest, runs):
    pairs = read_json(manifest)
    if len(pairs) % 2:
        raise ValueError("The manifest must contain complete adjacent pairs")
    groups = {}
    missing = []
    for start in range(0, len(pairs), 2):
        by_mode = {case["mode"]: case for case in pairs[start:start + 2]}
        if set(by_mode) != {"baseline", "candidate"}:
            raise ValueError("Every adjacent pair needs a baseline and a candidate")
        base = by_mode["baseline"]
        paths = tuple(Path(base[key]).resolve(strict=True) for key in ("audio", "reference"))
        candidate_paths = tuple(Path(by_mode["candidate"][key]).resolve(strict=True) for key in ("audio", "reference"))
        if paths != candidate_paths:
            raise ValueError("Paired trials require the same source audio and reference")
        source, reference_file = paths
        reference = words(reference_file.read_text(encoding="utf-8-sig"))
        if not reference:
            raise ValueError(f"Empty reference: {reference_file}")
        file_hash = fixture_hash(source)
        group = groups.setdefault(file_hash, {"audio": str(source), "reference": str(reference_file),
            "referenceSha256": fixture_hash(reference_file), "referenceWords": len(reference), "pairs": []})
        results = {}
        for mode, case in by_mode.items():
            folder = (runs / case["id"]).resolve()
            if folder.parent != runs:
                raise ValueError("Case directory escapes the designated output")
            if not (folder / "report.json").is_file() or not (folder / "integrity.json").is_file():
                missing.append(case["id"])
                continue
            if read_json(folder / "integrity.json").get("registryUnchanged") is not True:
                raise ValueError(f"Profile check failed for {folder}")
            report = read_json(folder / "report.json")
            meta = read_json(folder / "trial.json")
            if meta["audioHash"].lower() != file_hash or meta["referenceHash"].lower() != group["referenceSha256"]:
                raise ValueError(f"Fixture digest mismatch for {folder}")
            if report["mode"] != mode or report["case"] != case["id"]:
                raise ValueError(f"Unexpected report for {folder}")
            if report["captureConstraint"] != {"requiredInput": meta["capture"]["name"], "predecode": mode == "candidate"}:
                raise ValueError(f"Unverified capture device or experiment mode for {folder}")
            if not isfinite(report["latencyMs"]) or report["latencyMs"] <= 0:
                raise ValueError(f"Invalid key-up to insertion measurement for {folder}")
            exe = meta["executableHash"].lower()
            if group.setdefault("exeSha256", exe) != exe:
                raise ValueError("Cannot combine trials from different portable builds")
            hypothesis = words((folder / "editor.txt").read_text(encoding="utf-8-sig"))
            errors = word_errors(reference, hypothesis)
            results[mode] = {
                "case": case["id"], "latencyMs": report["latencyMs"], "wordErrors": errors,
                "werPercent": round(100 * errors / len(reference), 3),
                "exeSha256": exe, "tokens": hypothesis, "captureDropEvents": report.get("captureDropEvents"),
            }
        if len(results) != 2:
            continue
        a, b = results["baseline"], results["candidate"]
        if a["exeSha256"] != b["exeSha256"]:
            raise ValueError("Baseline and candidate must use the same portable executable")
        differences = word_changes(a.pop("tokens"), b.pop("tokens"))
        group["pairs"].append({**results, "allWordsMatch": not differences, "wordChanges": differences})
    for group in groups.values():
        records = group["pairs"]
        if not records:
            continue
        baseline = [p["baseline"]["latencyMs"] for p in records]
        candidate = [p["candidate"]["latencyMs"] for p in records]
        group.update({
            "completedPairs": len(records), "baselineMedianMs": median(baseline), "candidateMedianMs": median(candidate),
            "medianReductionPercent": round(100 * (1 - median(candidate) / median(baseline)), 2),
            "p95DeltaMs": round(percentile95(candidate) - percentile95(baseline), 2),
            "maxPairedWerIncreasePp": round(max(100 * (p["candidate"]["wordErrors"] - p["baseline"]["wordErrors"])
                                               / group["referenceWords"] for p in records), 3),
            "requiresBoundaryReview": any(not p["allWordsMatch"] for p in records),
        })
    return {"groups": list(groups.values()), "missing": missing}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("runs", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = score(args.manifest, args.runs.resolve())
    data = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(data, encoding="utf-8")
    else:
        print(data)
