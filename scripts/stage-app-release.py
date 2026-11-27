"""Stage a verified portable Windows build in a GitHub application release draft."""

import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path


def api(route, *, payload=None, paginate=False):
    command = ["gh", "api", route]
    if paginate:
        command.extend(["--paginate", "--slurp"])
    if payload is not None:
        command.extend(["--method", "POST", "--input", "-"])
    result = subprocess.run(
        command, input=json.dumps(payload).encode() if payload is not None else None,
        stdout=subprocess.PIPE, check=True,
    )
    return json.loads(result.stdout)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_draft(release, expected, files):
    if any(release.get(key) != value for key, value in expected.items()):
        raise ValueError("Existing release differs from the expected draft, source commit or release notes")
    uploaded = set()
    for asset in release["assets"]:
        name = asset["name"]
        if (name in uploaded or name not in files or asset["state"] != "uploaded"
                or (asset["size"], asset.get("digest")) != files[name]):
            raise ValueError(f"Unexpected or mismatched release asset: {name}")
        uploaded.add(name)
    return uploaded


def stage(artifact, version):
    repo = os.environ["GITHUB_REPOSITORY"]
    commit = os.environ["GITHUB_SHA"]
    if (repo.lower() != "redheadesign/music-island" or not re.fullmatch(r"[0-9a-f]{40}", commit)
            or not re.fullmatch(r"\d+\.\d+\.\d+", version)):
        raise ValueError("Expected the official repository, an exact commit and a stable application version")
    tag = f"v{version}"
    exe = artifact / "release/music-island.exe"
    checksum = exe.with_name("SHA256.txt")
    paths = [exe, checksum, artifact / "THIRD_PARTY_NOTICES.md"]
    with exe.open("rb") as stream:
        if stream.read(2) != b"MZ":
            raise ValueError("Invalid DOS signature on the Windows EXE")
        stream.seek(0x3C)
        stream.seek(int.from_bytes(stream.read(4), "little"))
        if stream.read(6) != b"PE\x00\x00\x64\x86":
            raise ValueError("Expected a Windows x64 PE executable")
    files = {path.name: (path.stat().st_size, "sha256:" + sha256(path)) for path in paths}
    digest = files[exe.name][1].split(":")[1]
    if not re.fullmatch(digest.encode() + rb"  music-island\.exe(?:\r?\n)?", checksum.read_bytes()):
        raise ValueError("SHA256.txt differs from the independently verified executable digest")
    notes = Path(f"docs/releases/{version}-release-notes.md").read_text(encoding="utf-8")
    if not notes.strip():
        raise ValueError("Empty release notes")

    endpoint = f"repos/{repo}"
    expected = dict(tag_name=tag, target_commitish=commit, name=f"Music Island {version}",
                    body=notes, draft=True, prerelease=False)
    for ref in api(f"{endpoint}/git/matching-refs/tags/{tag}"):
        if ref["ref"] == f"refs/tags/{tag}":
            obj = ref["object"]
            while obj["type"] == "tag":
                obj = api(f"{endpoint}/git/tags/{obj['sha']}")["object"]
            if obj["type"] != "commit" or obj["sha"] != commit:
                raise ValueError(f"{tag} already points to another commit")
    pages = api(f"{endpoint}/releases?per_page=100", paginate=True)
    matches = [release for page in pages for release in page if release["tag_name"] == tag]
    if len(matches) > 1:
        raise ValueError(f"Multiple releases found for {tag}")
    release = matches[0] if matches else api(f"{endpoint}/releases", payload={**expected, "make_latest": "false"})
    release_path = f"{endpoint}/releases/{release['id']}"
    uploaded = verify_draft(api(release_path), expected, files)
    missing = [str(path) for path in paths if path.name not in uploaded]
    if missing:
        subprocess.run(["gh", "release", "upload", tag, *missing, "--repo", repo], check=True)
    if verify_draft(api(release_path), expected, files) != set(files):
        raise ValueError("Draft asset verification incomplete")
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(f"Verified [Music Island {version} draft]({release['html_url']}) at `{commit}`.\n\n")
        for name, (size, file_digest) in files.items():
            summary.write(f"- `{name}` ({size} bytes), `{file_digest}`\n")


if __name__ == "__main__":
    stage(Path(sys.argv[1]), sys.argv[2])
