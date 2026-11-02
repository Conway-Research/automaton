import importlib.util,unittest,tempfile,hashlib
from pathlib import Path
MODULE=Path(__file__).with_name('image-sandbox-entry.py')
class ProtocolTests(unittest.TestCase):
    def module(self):
        spec=importlib.util.spec_from_file_location('image_sandbox_entry',MODULE);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
    def test_unsafe_names_hashes_and_duplicate_inputs_rejected(self):
        import base64
        m=self.module();raw=b'fake';valid={'name':'source.png','sha256':hashlib.sha256(raw).hexdigest(),'data':base64.b64encode(raw).decode()}
        with tempfile.TemporaryDirectory() as tmp:
            for rows in ([{**valid,'name':'../escape.png'}],[{**valid,'sha256':'a'*64}],[valid,valid]):
                with self.assertRaises(ValueError):m.decode_files(rows,Path(tmp))
    def test_unknown_operations_are_not_commands(self):
        m=self.module()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):m.dispatch({'operation':'shell','command':'anything'},Path(tmp))
