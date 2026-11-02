import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from verify_delivery import verify


class DeliveryIntegrity(unittest.TestCase):
    def fixture(self, root):
        content = b'print("reviewed source")\n'
        (root/'app.py').write_bytes(content)
        (root/'MANIFEST.json').write_text(json.dumps({'files': [{'path': 'app.py', 'sha256': hashlib.sha256(content).hexdigest()}]}))

    def test_hash_and_unlisted_executable_are_checked(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            self.assertTrue(verify(root)['verified'])
            (root/'app.py').write_text('print("changed")')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'): verify(root)
            self.fixture(root)
            (root/'extra.py').write_text('print("extra")')
            with self.assertRaisesRegex(ValueError, 'unexpected'): verify(root)

    def test_unlisted_bytecode_and_state_executables_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.fixture(root)
            (root/'__pycache__').mkdir()
            cached = root/'__pycache__/app.cpython-311.pyc'
            cached.write_bytes(b'unreviewed bytecode')
            with self.assertRaisesRegex(ValueError, 'unexpected'): verify(root)
            cached.unlink()
            (root/'state').mkdir()
            (root/'state/extra.py').write_text('print("extra")')
            with self.assertRaisesRegex(ValueError, 'unexpected'): verify(root)


if __name__ == '__main__': unittest.main()
