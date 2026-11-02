"""Verify the extracted delivery against MANIFEST.json before running it.

Integrity only, not a signature, a customer contract or authorization to execute.
"""
import hashlib
import json
from pathlib import Path, PurePosixPath


def verify(directory):
    root = Path(directory).resolve()
    manifest = json.loads((root/'MANIFEST.json').read_text(encoding='utf-8'))
    expected = {}
    for item in manifest['files']:
        name = item['path']
        pure = PurePosixPath(name)
        if pure.is_absolute() or '\\' in name or '..' in pure.parts or not pure.parts or name in expected:
            raise ValueError('invalid manifest path')
        file = root.joinpath(*pure.parts)
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(root):
            raise ValueError('missing or unsafe delivery file')
        if hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']:
            raise ValueError('delivery hash mismatch: '+name)
        expected[name] = item['sha256']
    actual = set()
    for file in root.rglob('*'):
        if file.is_symlink():
            raise ValueError('unexpected delivery symlink')
        if not file.is_file():
            continue
        relative = file.relative_to(root)
        # Only inert runtime state is exempt. Python caches and unlisted source
        # are executable, including files in state/, and must never be ignored.
        if relative.parts[0] == 'state' and file.suffix in ('.db', '.db-journal', '.db-wal', '.db-shm', '.json', '.csv', '.log'):
            continue
        actual.add(relative.as_posix())
    if actual != set(expected)|{'MANIFEST.json'}:
        raise ValueError('unexpected delivery files')
    return {'verified': True, 'files': len(expected)}


if __name__ == '__main__':
    print(json.dumps(verify(Path(__file__).parent)))
