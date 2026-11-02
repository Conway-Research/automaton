"""Authenticated offline API and checkpointed document workflow."""
import base64
import csv
import hmac
import io
import re
from classifier import Classifier
from ocr import parse_pgm, parse_png, recognize
from store import Store, Conflict


def extract_fields(text, label):
    fields = {}
    found = re.findall(r'^ID ([0-9]{1,12})$', text, re.M)
    if len(found) == 1:
        fields['documentId'] = found[0]
    if label in ('invoice', 'order'):
        totals = re.findall(r'^TOTAL ([0-9]{1,12})$', text, re.M)
        currencies = re.findall(r'^CURRENCY (CHF|EUR|USD)$', text, re.M)
        if len(totals) == 1 and len(currencies) == 1:
            fields.update(totalMinor=int(totals[0]), currency=currencies[0])
    return fields


class DocumentApp:
    def __init__(self, database, token):
        if not isinstance(token, str) or len(token) < 16:
            raise ValueError('explicit local token of at least 16 characters required')
        self.store, self.token = Store(database), token
        self.model = Classifier.load_default()
        self.after_checkpoint = lambda phase: None

    def process(self, identifier):
        job = self.store.get(identifier)
        if job['status'] in ('review', 'needs-review', 'approved', 'rejected'):
            return job
        if job['ocr'] is None:
            result = recognize(self.store.image(identifier))
            job = self.store.update(identifier, job['version'], 'ocr', {'ocr': result, 'status': 'recognized'})
            self.after_checkpoint('ocr')
        if job['prediction'] is None:
            prediction = self.model.predict(job['ocr']['text'])
            fields = extract_fields(job['ocr']['text'], prediction['label'])
            needed = {'documentId'} | ({'totalMinor', 'currency'} if prediction['label'] in ('invoice', 'order') else set())
            complete = job['ocr']['accepted'] and prediction['label'] is not None and needed <= fields.keys()
            job = self.store.update(identifier, job['version'], 'classified', {'prediction': prediction, 'fields': fields, 'status': 'review' if complete else 'needs-review'})
            self.after_checkpoint('classified')
        return job

    def request(self, method, path, body, token):
        if not isinstance(token, str) or not hmac.compare_digest(token.encode('utf-8', errors='replace'), self.token.encode('utf-8')):
            return 401, {'error': 'local authentication required'}
        try:
            if not isinstance(body, dict):
                raise ValueError('JSON object required')
            if method == 'GET' and path == '/api/jobs':
                return 200, {'jobs': self.store.list()}
            if method == 'POST' and path == '/api/jobs':
                if set(body) != {'key', 'image'} or not isinstance(body['key'], str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,80}', body['key']) or not isinstance(body['image'], str) or len(body['image']) > 1600200:
                    raise ValueError('bounded key and base64 image required')
                image = base64.b64decode(body['image'], validate=True)
                (parse_png if image.startswith(b'\x89PNG') else parse_pgm)(image)
                job, created = self.store.import_image(body['key'], image)
                return (201 if created else 200), job
            match = re.fullmatch(r'/api/jobs/([a-f0-9]{24})(?:/(process|review))?', path)
            if match:
                identifier, action = match.groups()
                if method == 'GET' and action is None:
                    return 200, self.store.get(identifier)
                if method == 'POST' and action == 'process':
                    if body: raise ValueError('process has no request parameters')
                    return 200, self.process(identifier)
                if method == 'POST' and action == 'review':
                    if set(body) != {'version', 'decision'} or type(body['version']) is not int or body['decision'] not in ('approved', 'rejected'):
                        raise ValueError('explicit version and review decision required')
                    job = self.store.get(identifier)
                    if job['status'] != 'review' and not (job['status'] == 'needs-review' and body['decision'] == 'rejected'):
                        raise Conflict('only complete reviewable results can be approved')
                    return 200, self.store.update(identifier, body['version'], 'reviewed', {'status': body['decision']})
            if method == 'GET' and path == '/api/export':
                jobs = self.store.list()
                if any(j['status'] not in ('approved', 'rejected') for j in jobs):
                    raise Conflict('resolve all pending document reviews before exporting')
                rows = [{'jobId': j['id'], 'label': j['prediction']['label'], **j['fields']} for j in jobs if j['status'] == 'approved']
                output = io.StringIO(newline='')
                writer = csv.DictWriter(output, fieldnames=['jobId', 'label', 'documentId', 'totalMinor', 'currency'], lineterminator='\n')
                writer.writeheader()
                writer.writerows(rows)
                return 200, {'rows': rows, 'csv': output.getvalue()}
            return 404, {'error': 'route not found'}
        except Conflict as error:
            return 409, {'error': str(error)}
        except KeyError:
            return 404, {'error': 'job not found'}
        except (ValueError, TypeError, OverflowError):
            return 400, {'error': 'invalid input for the documented contract'}
        except RuntimeError:
            return 503, {'error': 'processing interrupted; retry resumes persisted checkpoints'}

    def close(self):
        self.store.close()
