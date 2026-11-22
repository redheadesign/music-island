from tempfile import TemporaryFile
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

source = 'repos/redheadesign/music-island/actions'
artifact_number = '14746784326'
artifact = json.loads(subprocess.check_output(['gh', 'api', f'{source}/artifacts/{artifact_number}']))
assert artifact['workflow_run']['id'] == 45002442330
assert artifact['workflow_run']['head_sha'] == 'defdf733ef6ebd57cf166ce201f4271bb4b3c2fa'
assert artifact['digest'] == 'sha256:68cf15c358526c715501179d6fc031e6de5b57c3cbea32159245063dc7292da5'
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
assert digest == '85bf5267a3f2967646c9a9e946201f2de5baef0ddda02e30b6a7d7f394d0a5ae'
assert (destination / 'release/SHA256.txt').read_text('utf-8-sig').strip() == digest + '  music-island.exe'
print('Verified exact candidate', digest)
