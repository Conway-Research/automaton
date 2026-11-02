import base64
import json
import tempfile
import unittest
from pathlib import Path

from app import DocumentApp
from classifier import Classifier
from ocr import recognize, parse_pgm

ROOT = Path(__file__).resolve().parents[1]


def fixtures():
    return json.loads((ROOT / 'fixtures/holdout.json').read_text(encoding='utf-8'))


class ProductAcceptance(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = DocumentApp(Path(self.tmp.name) / 'state.db', 'test-token-not-production')

    def tearDown(self):
        self.app.close()
        self.tmp.cleanup()

    def call(self, method, route, body=None, token='test-token-not-production'):
        return self.app.request(method, route, body or {}, token)

    def import_one(self, key='job-1'):
        case = fixtures()[0]
        code, result = self.call('POST', '/api/jobs', {'key': key, 'image': case['image']})
        self.assertEqual(code, 201)
        return result

    def test_real_ocr_heldout_pixels(self):
        for case in fixtures():
            result = recognize(base64.b64decode(case['image']))
            self.assertEqual(result['text'], case['text'], case['id'])
            self.assertTrue(result['accepted'])

    def test_invalid_raster_and_blank_abstain(self):
        for raw in [b'P5\n99999999 99999999\n255\nx', b'P5\n4 4\n255\nx', b'PNG', b'P5\n-2 3\n255\nxxx']:
            with self.assertRaises(ValueError):
                parse_pgm(raw)
        result = recognize(b'P5\n20 20\n255\n' + bytes([255]) * 400)
        self.assertFalse(result['accepted'])

    def test_unknown_glyph_abstains(self):
        rows = [bytes([0 if (x+y) % 3 else 255 for x in range(32)]) for y in range(32)]
        result = recognize(b'P5\n32 32\n255\n' + b''.join(rows))
        self.assertFalse(result['accepted'])

    def test_trained_model_holdout_and_unknown(self):
        model = Classifier.load_default()
        for case in fixtures():
            self.assertEqual(model.predict(case['text'])['label'], case['label'])
        self.assertIsNone(model.predict('ZEBRA QUANTUM XYZZY')['label'])
        self.assertIsNone(model.predict('')['label'])

    def test_model_export_reproduces_predictions(self):
        model = Classifier.load_default()
        exported = (ROOT/'model.json').read_text(encoding='utf-8')
        self.assertEqual(exported, model.to_json())
        restored = Classifier.from_json(exported)
        for case in fixtures():
            self.assertEqual(model.predict(case['text']), restored.predict(case['text']))

    def test_auth_and_input_validation(self):
        self.assertEqual(self.call('GET', '/api/jobs', token='wrong')[0], 401)
        for body in [{}, {'key': '../escape', 'image': 'AA=='}, {'key': 'x', 'image': 'not base64'}, {'key': 'x', 'image': 'A' * 2000000}]:
            self.assertEqual(self.call('POST', '/api/jobs', body)[0], 400)
        self.assertEqual(self.call('GET', '/api/unknown')[0], 404)

    def test_duplicate_and_conflicting_idempotency(self):
        original = self.import_one()
        case = fixtures()[0]
        code, repeated = self.call('POST', '/api/jobs', {'key': 'job-1', 'image': case['image']})
        self.assertEqual(code, 200)
        self.assertEqual(original['id'], repeated['id'])
        self.assertEqual(self.call('POST', '/api/jobs', {'key': 'job-1', 'image': fixtures()[1]['image']})[0], 409)
        self.assertEqual(len(self.call('GET', '/api/jobs')[1]['jobs']), 1)

    def test_process_review_export_and_stale_revision(self):
        job = self.import_one()
        code, processed = self.call('POST', '/api/jobs/' + job['id'] + '/process')
        self.assertEqual(code, 200)
        self.assertEqual(processed['status'], 'review')
        self.assertEqual(processed['fields'], fixtures()[0]['fields'])
        self.assertEqual(self.call('GET', '/api/export')[0], 409)
        self.assertEqual(self.call('POST', '/api/jobs/' + job['id'] + '/review', {'version': 0, 'decision': 'approved'})[0], 409)
        code, approved = self.call('POST', '/api/jobs/' + job['id'] + '/review', {'version': processed['version'], 'decision': 'approved'})
        self.assertEqual(code, 200)
        code, export = self.call('GET', '/api/export')
        self.assertEqual(code, 200)
        self.assertEqual(export['rows'][0]['documentId'], fixtures()[0]['fields']['documentId'])
        self.assertIn('documentId', export['csv'])
        self.assertEqual(approved['status'], 'approved')

    def test_reopen_resume_and_completed_work_is_not_repeated(self):
        job = self.import_one()
        def fail(phase):
            if phase == 'ocr':
                raise RuntimeError('synthetic interruption after OCR checkpoint')
        self.app.after_checkpoint = fail
        self.assertEqual(self.call('POST', '/api/jobs/' + job['id'] + '/process')[0], 503)
        self.app.close()
        self.app = DocumentApp(Path(self.tmp.name) / 'state.db', 'test-token-not-production')
        code, result = self.call('POST', '/api/jobs/' + job['id'] + '/process')
        self.assertEqual(code, 200)
        self.assertEqual(result['status'], 'review')
        before = self.app.store.events(job['id'])
        self.assertEqual(sum(e['kind'] == 'ocr' for e in before), 1)
        self.assertEqual(self.call('POST', '/api/jobs/' + job['id'] + '/process')[0], 200)
        self.assertEqual(before, self.app.store.events(job['id']))

    def test_rejected_work_is_excluded_from_export(self):
        job = self.import_one()
        _, result = self.call('POST', '/api/jobs/' + job['id'] + '/process')
        self.assertEqual(self.call('POST', '/api/jobs/' + job['id'] + '/review', {'version': result['version'], 'decision': 'rejected'})[0], 200)
        self.assertEqual(self.call('GET', '/api/export')[1]['rows'], [])

    def test_all_heldout_documents_execute_through_api(self):
        for i, case in enumerate(fixtures()):
            code, job = self.call('POST', '/api/jobs', {'key': 'case-' + str(i), 'image': case['image']})
            self.assertEqual(code, 201)
            code, result = self.call('POST', '/api/jobs/' + job['id'] + '/process')
            self.assertEqual(code, 200)
            self.assertEqual(result['prediction']['label'], case['label'])
            self.assertEqual(result['fields'], case['fields'])


if __name__ == '__main__':
    unittest.main()
