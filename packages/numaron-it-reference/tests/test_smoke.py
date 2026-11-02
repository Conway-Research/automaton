import tempfile
import unittest
from pathlib import Path
from app import DocumentApp


class OriginalSmoke(unittest.TestCase):
    def test_constructor_and_authentication_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            app = DocumentApp(Path(directory)/'state.db', 'isolated-smoke-token')
            try:
                self.assertEqual(app.request('GET', '/api/jobs', {}, 'incorrect')[0], 401)
                self.assertEqual(app.request('GET', '/api/jobs', {}, app.token), (200, {'jobs': []}))
            finally:
                app.close()
