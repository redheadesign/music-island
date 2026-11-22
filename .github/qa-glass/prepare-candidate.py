from tempfile import TemporaryFile
from pathlib import Path
import hashlib
import json
import re
import subprocess
import zipfile

source = 'repos/redheadesign/music-island/actions'
run = 45024812771
listing = json.loads(subprocess.check_output(['gh', 'api', f'{source}/runs/{run}/artifacts']))
entry, = [item for item in listing['artifacts']
          if item['name'].startswith('music-island-windows-x64-') and not item['expired']]
artifact_number = entry['id']
artifact = json.loads(subprocess.check_output(['gh', 'api', f'{source}/artifacts/{artifact_number}']))
assert artifact['workflow_run']['id'] == run
assert artifact['workflow_run']['head_sha'] == 'd430620db41a8fb9344936a6f46c01c8a88584d4'
assert re.fullmatch(r'sha256:[a-f0-9]{64}', artifact['digest'])
destination = Path('.local/candidate').resolve()
with TemporaryFile() as stream:
    subprocess.run(['gh', 'api', f'{source}/artifacts/{artifact_number}/zip'], stdout=stream, check=True)
    stream.seek(0)
    assert hashlib.file_digest(stream, 'sha256').hexdigest() == artifact['digest'][7:]
    stream.seek(0)
    with zipfile.ZipFile(stream) as archive:
        for name in ('release/music-island.exe', 'release/SHA256.txt'):
            archive.extract(name, destination)
with (destination / 'release/music-island.exe').open('rb') as executable:
    digest = hashlib.file_digest(executable, 'sha256').hexdigest()
assert (destination / 'release/SHA256.txt').read_text('utf-8-sig').strip() == digest + '  music-island.exe'
print('Verified exact candidate', digest)
