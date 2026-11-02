import base64
import concurrent.futures
import json
import os
import subprocess
import sys
import socket
import time
import struct
import zlib
import tempfile
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from app import DocumentApp, extract_fields
from ocr import parse_png

ROOT = Path(__file__).resolve().parents[1]
TOKEN = 'offline-transport-token-0001'


class TransportAcceptance(unittest.TestCase):
    def test_loopback_http_auth_import_process_and_origin_boundary(self):
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.Popen([sys.executable, str(ROOT/'cli.py'), 'serve', '--state', str(Path(directory)/'state.db'), '--port', '0'], env={**os.environ, 'DESK_TOKEN': TOKEN}, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            try:
                endpoint = json.loads(process.stdout.readline())
                url = 'http://127.0.0.1:' + str(endpoint['port'])
                opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                self.assertIn('Document Operations Desk', opener.open(url, timeout=5).read().decode())
                with self.assertRaises(urllib.error.HTTPError) as error:
                    opener.open(url+'/api/jobs', timeout=5)
                self.assertEqual(error.exception.code, 401)
                error.exception.close()
                case = json.loads((ROOT/'fixtures/holdout.json').read_text())[0]
                request = urllib.request.Request(url+'/api/jobs', data=json.dumps({'key': 'http-one', 'image': case['image']}).encode(), headers={'Authorization': 'Bearer '+TOKEN, 'Content-Type': 'application/json'})
                job = json.load(opener.open(request, timeout=5))
                request = urllib.request.Request(url+'/api/jobs/'+job['id']+'/process', data=b'{}', headers={'Authorization': 'Bearer '+TOKEN})
                result = json.load(opener.open(request, timeout=10))
                self.assertEqual(result['fields'], case['fields'])
                forbidden = urllib.request.Request(url+'/api/jobs', data=b'{}', headers={'Authorization': 'Bearer '+TOKEN, 'Origin': 'https://external.invalid'})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    opener.open(forbidden, timeout=5)
                self.assertEqual(error.exception.code, 403)
                error.exception.close()
                for body, auth in [(b'{}', 'Bearer wrong'), (b'{', 'Bearer '+TOKEN)]:
                    invalid = urllib.request.Request(url+'/api/jobs', data=body, headers={'Authorization': auth})
                    with self.assertRaises(urllib.error.HTTPError) as error:
                        opener.open(invalid, timeout=5)
                    self.assertIn(error.exception.code, (400, 401))
                    error.exception.close()
                # A valid PNG CRC does not imply that IDAT is decompressible.
                def chunk(kind, data):
                    return struct.pack('>I', len(data))+kind+data+struct.pack('>I', zlib.crc32(kind+data)&0xffffffff)
                bad_png = b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR', struct.pack('>IIBBBBB', 16,16,8,0,0,0,0))+chunk(b'IDAT', b'invalid-zlib')+chunk(b'IEND', b'')
                invalid = urllib.request.Request(url+'/api/jobs', data=json.dumps({'key': 'bad-png', 'image': base64.b64encode(bad_png).decode()}).encode(), headers={'Authorization': 'Bearer '+TOKEN})
                with self.assertRaises(urllib.error.HTTPError) as error:
                    opener.open(invalid, timeout=5)
                self.assertEqual(error.exception.code, 400)
                error.exception.close()
                # Hold a partial body. The single-threaded service must time out
                # the accepted socket and become available to the next request.
                stalled = socket.create_connection(('127.0.0.1', endpoint['port']), timeout=5)
                try:
                    stalled.sendall(('POST /api/jobs HTTP/1.1\r\nHost: 127.0.0.1:%d\r\nContent-Length: 200\r\n\r\n{' % endpoint['port']).encode())
                    started = time.monotonic()
                    self.assertIn('Document Operations Desk', opener.open(url, timeout=5).read().decode())
                    self.assertLess(time.monotonic()-started, 4)
                finally:
                    stalled.close()
            finally:
                process.terminate()
                process.communicate(timeout=5)

    def test_concurrent_idempotent_import_uses_one_persisted_job(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory)/'jobs.db'
            app = DocumentApp(database, TOKEN)
            app.close()
            case = json.loads((ROOT/'fixtures/holdout.json').read_text())[0]
            def write(_):
                instance = DocumentApp(database, TOKEN)
                try:
                    return instance.request('POST', '/api/jobs', {'key': 'same', 'image': case['image']}, TOKEN)[0]
                finally:
                    instance.close()
            with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
                results = list(pool.map(write, range(8)))
            self.assertEqual(results.count(201), 1)
            self.assertEqual(results.count(200), 7)

    def test_png_crc_truncation_and_dimension_attacks_rejected(self):
        case = json.loads((ROOT/'fixtures/holdout.json').read_text())[0]
        raw = base64.b64decode(case['image'])
        for changed in [raw[:-8], raw+b'extra', raw[:40]+bytes([raw[40]^1])+raw[41:]]:
            with self.assertRaises(ValueError):
                parse_png(changed)

    def test_duplicate_fields_are_not_silently_chosen(self):
        self.assertNotIn('documentId', extract_fields('ID 12\nID 13\nTOTAL 42\nCURRENCY CHF', 'invoice'))
        self.assertNotIn('totalMinor', extract_fields('ID 12\nTOTAL 42\nTOTAL 43\nCURRENCY CHF', 'invoice'))

    def test_non_ascii_authentication_never_escapes_error_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            app = DocumentApp(Path(directory)/'jobs.db', TOKEN)
            try:
                self.assertEqual(app.request('GET', '/api/jobs', {}, 'invalid-\u00e9-token')[0], 401)
            finally:
                app.close()


if __name__ == '__main__':
    unittest.main()
