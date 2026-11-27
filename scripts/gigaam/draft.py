"""Upload a verified model inventory to a GitHub draft and validate the stored digests."""

import json
import os
import subprocess


def api(endpoint, payload=None):
    command = ["gh", "api", endpoint]
    if payload is not None:
        command.extend(["--method", "POST", "--input", "-"])
    result = subprocess.run(command, input=json.dumps(payload) if payload else None,
                            text=True, capture_output=True)
    if result.returncode:
        raise RuntimeError(f"GitHub request failed for {endpoint}: {result.stderr.strip()}")
    return json.loads(result.stdout)


def check_draft(release, tag, sha, assets, complete):
    if (release["tag_name"], release["target_commitish"], release["draft"], release["prerelease"]) != (
        tag, sha, True, True
    ):
        raise ValueError("Expected a model draft targeting the verified application commit")
    uploaded = set()
    for entry in release["assets"]:
        name = entry["name"]
        if name not in assets or name in uploaded:
            raise ValueError(f"Unexpected asset in model draft: {name}")
        expected = assets[name][1]
        if (entry["state"], entry["size"], entry.get("digest")) != (
            "uploaded", expected["size"], "sha256:" + expected["sha256"]
        ):
            raise ValueError(f"Draft asset differs from the tested bytes: {name}")
        uploaded.add(name)
    if complete and uploaded != set(assets):
        raise ValueError(f"Missing assets in draft: {sorted(set(assets) - uploaded)}")
    return uploaded


def upload(tag, repository, stage, assets):
    if os.environ["GITHUB_REPOSITORY"] != repository:
        raise ValueError("Expected the Music Island repository")
    sha = os.environ["GITHUB_SHA"]
    endpoint = f"repos/{repository}/releases"
    listed = subprocess.check_output(
        ["gh", "api", "--paginate", "--slurp", endpoint + "?per_page=100"], text=True
    )
    matches = [r for page in json.loads(listed) for r in page if r["tag_name"] == tag]
    if len(matches) > 1:
        raise ValueError("More than one release has the model tag")
    if matches:
        release = api(f"{endpoint}/{matches[0]['id']}")
    else:
        release = api(endpoint, {
            "tag_name": tag, "target_commitish": sha, "draft": True, "prerelease": True,
            "make_latest": "false", "name": "GigaAM model assets · November 2026",
            "body": (
                "In a build of Music Island that supports GigaAM, open **Settings → Dictation → Models**. "
                "GigaAM-v4 supports Russian and English (1.22 GB). GigaAM Multilingual-v2 supports "
                "21 languages (3.93 GB). Both run offline on the CPU after the download.\n\n"
                "Settings installs the 320 ms streaming graphs from this release together with the "
                "full-context INT8 models and tokenizers from pinned Hugging Face revisions. Each file "
                "is verified against its SHA-256. MIT and Apache-2.0 licenses and notices accompany the models. "
                f"[Model catalog](https://github.com/{repository}/blob/{sha}/src-tauri/crates/handy-core/src/catalog/gigaam-packs.json)\n\n"
                f"[Model export](https://github.com/{repository}/actions/runs/{os.environ['MODELS_RUN']}) · "
                f"[Windows verification](https://github.com/{repository}/actions/runs/{os.environ['GITHUB_RUN_ID']})"
            ),
        })
    uploaded = check_draft(release, tag, sha, assets, complete=False)
    for name in sorted(set(assets) - uploaded):
        subprocess.run(["gh", "release", "upload", tag, str(stage / name), "--repo", repository], check=True)
    final = api(f"{endpoint}/{release['id']}")
    check_draft(final, tag, sha, assets, complete=True)
    print(f"Verified {len(assets)} model assets in draft {final['id']} at {sha}.")
