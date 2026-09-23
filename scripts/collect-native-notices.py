"""Collect notices from the pinned Windows Cargo graphs and upstream source trees.

Run after `cargo fetch`. --fetch-missing obtains license files omitted from crate
archives at the exact published commit; source URLs are retained in the output.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.local/native-license-cache'
OUTPUT = ROOT / 'src-tauri/crates/handy-core/resources/licenses'
PREFIXES = ('LICENSE', 'LICENCE', 'COPYING', 'NOTICE', 'COPYRIGHT')


def metadata(manifest):
    result = subprocess.run(['cargo', 'metadata', '--manifest-path', manifest,
        '--offline', '--locked', '--format-version', '1', '--filter-platform',
        'x86_64-pc-windows-msvc'], cwd=ROOT, check=True, capture_output=True)
    graph = json.loads(result.stdout)
    ids = {node['id'] for node in graph['resolve']['nodes']}
    return [p for p in graph['packages'] if p['id'] in ids and p['source']]


def upstream(p, root):
    vcs = root / '.cargo_vcs_info.json'
    commit = json.loads(vcs.read_text()).get('git', {}).get('sha1') if vcs.exists() else None
    repo = p.get('repository')
    if not repo and p['source'].startswith('git+'):
        repo = p['source'][4:].split('?')[0].split('#')[0]
        commit = p['source'].split('#')[-1]
    if p['name'] == 'ferrous-opencc-compiler':
        repo = 'https://github.com/apoint123/ferrous-opencc'
    return (repo or '').removesuffix('/').removesuffix('.git'), commit


def fetch(url, enabled):
    cache = CACHE / (hashlib.sha256(url.encode()).hexdigest() + '.txt')
    if cache.exists():
        return cache.read_text(encoding='utf-8')
    if not enabled:
        return None
    try:
        with urllib.request.urlopen(url, timeout=15) as response:
            text = response.read().decode('utf-8')
        if '<html' in text.lower()[:200]:
            return None
        cache.write_text(text, encoding='utf-8')
        return text
    except (OSError, UnicodeError):
        return None


def collect(p, fetch_missing):
    root = Path(p['manifest_path']).parent
    repo, commit = upstream(p, root)
    files = [f for f in root.iterdir() if f.is_file() and f.name.upper().startswith(PREFIXES)]
    if p.get('license_file'):
        files.append(root / p['license_file'])
    # C++ vendored code has notices independent of its Rust bindings.
    if p['name'] == 'transcribe-cpp-sys':
        files += [root / 'ggml/LICENSE', root / 'src/third_party/miniz/LICENSE']
    notices = [{'file': str(f.relative_to(root)).replace('\\', '/'), 'text': f.read_text(encoding='utf-8', errors='replace')}
               for f in sorted(set(files)) if f.is_file()]
    if not notices and repo and commit:
        if repo.startswith('https://github.com/'):
            base = repo.replace('https://github.com/', 'https://raw.githubusercontent.com/') + '/' + commit + '/'
        elif repo.startswith('https://codeberg.org/'):
            base = repo + '/raw/commit/' + commit + '/'
        else:
            base = repo + '/-/raw/' + commit + '/'
        for name in ['LICENSE', 'LICENSE-MIT', 'LICENSE-APACHE', 'LICENSE.md', 'LICENSE.txt', 'COPYING', 'LICENSE-MIT.txt', 'LICENSE-APACHE.txt']:
            text = fetch(base + name, fetch_missing)
            if text:
                notices.append({'file': name, 'source': base + name, 'text': text})
                # An available complete upstream license is enough; SPDX below
                # still records every license offered by the package.
                if 'OR' in (p.get('license') or '') or (p.get('license') or '').count('/') or name == 'LICENSE':
                    break
    declaration_only = not notices
    if declaration_only:
        # Some upstream archives/repositories declare SPDX in Cargo.toml but
        # omit a separate notice file. Preserve that distinction and attribution;
        # never label a standard template as an original upstream copyright.
        offered = p.get('license') or ''
        selected = next((name for name in ['MIT', 'Apache-2.0', 'MPL-2.0'] if name in offered), None)
        if selected:
            url = 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/' + selected + '.txt'
            text = fetch(url, fetch_missing)
            if text:
                notices.append({'file': 'SPDX standard text (upstream declaration; no separate license file)', 'source': url, 'text': text})
    return {'name': p['name'], 'version': p['version'], 'license': p.get('license'),
            'authors': p['authors'], 'repository': repo, 'commit': commit,
            'crateSource': p['source'], 'upstreamLicenseFileMissing': declaration_only, 'notices': notices}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch-missing', action='store_true')
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    packages = {}
    for manifest in ['src-tauri/Cargo.toml', 'src-tauri/crates/dictation-runtime/Cargo.toml']:
        for package in metadata(manifest):
            packages[package['name'], package['version']] = package
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda p: collect(p, args.fetch_missing), packages.values()))
    results.sort(key=lambda p: (p['name'].lower(), p['version']))
    parts = ['Music Island — native dependency notices\nGenerated from pinned Windows Cargo graphs, including build dependencies.\nModel weights are not covered by these licenses.\n']
    index = []
    for package in results:
        parts.append('\n' + '=' * 72 + '\n' + package['name'] + ' ' + package['version'])
        parts.append('SPDX: ' + str(package['license']))
        parts.append('Authors: ' + ', '.join(package['authors']))
        parts.append('Source: ' + (package['repository'] or package['crateSource']))
        parts.append('Commit: ' + str(package['commit']))
        for notice in package['notices']:
            parts.append('\n' + notice.get('source', notice['file']) + '\n\n' + notice['text'])
        index.append({k: v for k, v in package.items() if k != 'notices'} | {'licenseFiles': [n.get('source', n['file']) for n in package['notices']]})
    (OUTPUT / 'Native-dependencies.txt').write_text('\n'.join(parts), encoding='utf-8')
    (OUTPUT / 'Native-dependencies.json').write_text(json.dumps(index, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    missing = [p['name'] + '@' + p['version'] for p in results if not p['notices']]
    print(json.dumps({'packages': len(results), 'missingLicenseFiles': missing}))
    if missing:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
