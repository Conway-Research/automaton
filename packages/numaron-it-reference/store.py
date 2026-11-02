"""Durable isolated workspace. Transactions serialize import and review writes."""
import hashlib
import json
import sqlite3


class Conflict(Exception):
    pass


class Store:
    def __init__(self, file):
        self.db = sqlite3.connect(str(file), timeout=5, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript('''
        CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, key TEXT UNIQUE NOT NULL,
          digest TEXT NOT NULL, image BLOB NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY, job TEXT NOT NULL,
          kind TEXT NOT NULL, payload TEXT NOT NULL, FOREIGN KEY(job) REFERENCES jobs(id));
        ''')

    def import_image(self, key, image):
        digest = hashlib.sha256(image).hexdigest()
        self.db.execute('BEGIN IMMEDIATE')
        try:
            row = self.db.execute('SELECT digest,payload FROM jobs WHERE key=?', (key,)).fetchone()
            if row:
                if row['digest'] != digest:
                    raise Conflict('idempotency key already binds different image')
                self.db.execute('COMMIT')
                return json.loads(row['payload']), False
            identifier = hashlib.sha256(key.encode()).hexdigest()[:24]
            job = {'id': identifier, 'key': key, 'digest': digest, 'version': 1, 'status': 'imported', 'ocr': None, 'prediction': None, 'fields': None}
            self.db.execute('INSERT INTO jobs VALUES(?,?,?,?,?)', (identifier, key, digest, image, json.dumps(job)))
            self.db.execute('INSERT INTO events(job,kind,payload) VALUES(?,?,?)', (identifier, 'imported', json.dumps({'digest': digest})))
            self.db.execute('COMMIT')
            return job, True
        except BaseException:
            if self.db.in_transaction: self.db.execute('ROLLBACK')
            raise

    def get(self, identifier):
        row = self.db.execute('SELECT payload FROM jobs WHERE id=?', (identifier,)).fetchone()
        if row is None:
            raise KeyError('job not found')
        return json.loads(row['payload'])

    def image(self, identifier):
        row = self.db.execute('SELECT image FROM jobs WHERE id=?', (identifier,)).fetchone()
        if row is None: raise KeyError('job not found')
        return row['image']

    def update(self, identifier, version, kind, changes):
        self.db.execute('BEGIN IMMEDIATE')
        try:
            job = self.get(identifier)
            if job['version'] != version:
                raise Conflict('stale job revision; reload before deciding')
            job.update(changes)
            job['version'] += 1
            self.db.execute('UPDATE jobs SET payload=? WHERE id=?', (json.dumps(job), identifier))
            self.db.execute('INSERT INTO events(job,kind,payload) VALUES(?,?,?)', (identifier, kind, json.dumps({'version': job['version']})))
            self.db.execute('COMMIT')
            return job
        except BaseException:
            if self.db.in_transaction: self.db.execute('ROLLBACK')
            raise

    def list(self):
        return [json.loads(row[0]) for row in self.db.execute('SELECT payload FROM jobs ORDER BY id')]

    def events(self, identifier):
        return [dict(row) for row in self.db.execute('SELECT seq,kind,payload FROM events WHERE job=? ORDER BY seq', (identifier,))]

    def close(self):
        self.db.close()
