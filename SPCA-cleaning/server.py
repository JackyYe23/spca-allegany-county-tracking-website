"""Local SPCA UI preview with a small, persistent SQLite record store."""

import argparse
from contextlib import contextmanager
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, unquote, urlsplit

from cat_profiles import CatProfileStore


ROOT = Path(__file__).resolve().parent
DEFAULT_DATABASE = ROOT / '.local-data' / 'care-records.sqlite3'


class RecordStore:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS records (id TEXT PRIMARY KEY, care_date TEXT NOT NULL, payload TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        try:
            with db:
                yield db
        finally:
            db.close()

    def read(self):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT payload FROM records ORDER BY rowid')]

    def add(self, records):
        # Validate the entire import before beginning an atomic transaction.
        for record in records:
            if not isinstance(record, dict):
                raise ValueError('Invalid record.')
            if not isinstance(record.get('id'), str) or not 1 <= len(record['id']) <= 160:
                raise ValueError('A record ID is required.')
            if not isinstance(record.get('careDate'), str):
                raise ValueError('A care date is required.')
            if date.fromisoformat(record['careDate']).isoformat() != record['careDate']:
                raise ValueError('Invalid care date.')
            if not isinstance(record.get('volunteerName'), str) or not record['volunteerName'].strip():
                raise ValueError('A name is required.')
            entries = record.get('entries')
            if not isinstance(entries, list) or not entries or not all(isinstance(entry, dict) for entry in entries):
                raise ValueError('A record must contain work entries.')
        with self.connect() as db:
            db.executemany('INSERT OR IGNORE INTO records (id, care_date, payload) VALUES (?, ?, ?)',
                           [(record['id'], record['careDate'], json.dumps(record, ensure_ascii=False)) for record in records])
        return self.read()


class CareHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, store, cat_profiles, **kwargs):
        self.store = store
        self.cat_profiles = cat_profiles
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, status, value):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def valid_host(self):
        return self.headers.get('Host') in {f'localhost:{self.server.server_port}', f'127.0.0.1:{self.server.server_port}'}

    def do_GET(self):
        url = urlsplit(self.path)
        path = url.path
        if path in {'/api/cat-profiles', '/api/cat-history'}:
            if not self.valid_host():
                self.send_json(403, {'error': 'Use the local preview address.'})
                return
            try:
                if path == '/api/cat-profiles':
                    self.send_json(200, {'profiles': self.cat_profiles.list_profiles()})
                else:
                    cat_id = parse_qs(url.query).get('cat', [''])[0]
                    self.send_json(200, {'entries': self.cat_profiles.history(cat_id)})
            except ValueError as error:
                self.send_json(400, {'error': str(error)})
            except sqlite3.Error:
                self.send_json(500, {'error': 'Could not read the local cat records.'})
            return
        if path == '/api/records':
            if not self.valid_host():
                self.send_json(403, {'error': 'Use the local preview address.'})
                return
            try:
                self.send_json(200, {'records': self.store.read()})
            except sqlite3.Error:
                self.send_json(500, {'error': 'Could not read the local record file.'})
            return
        super().do_GET()

    def send_head(self):
        # Never expose the database or hidden files through the static server.
        parts = Path(unquote(urlsplit(self.path).path)).parts
        if any(part.startswith('.') and part not in {'.', '..'} for part in parts) or Path(self.translate_path(self.path)).resolve() == self.store.path.resolve():
            self.send_error(404)
            return None
        return super().send_head()

    def do_POST(self):
        path = urlsplit(self.path).path
        cat_write = path in {'/api/cat-profiles', '/api/cat-history'}
        if not cat_write and path not in {'/api/records', '/api/records/import'}:
            self.send_json(404, {'error': 'Unknown endpoint.'})
            return
        origin = self.headers.get('Origin')
        if not self.valid_host() or (origin and origin != 'http://' + self.headers.get('Host', '')):
            self.send_json(403, {'error': 'Use the local preview address.'})
            return
        if self.headers.get_content_type() != 'application/json':
            self.send_json(415, {'error': 'Send JSON records.'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8 * 1024 * 1024:
                self.send_json(413, {'error': 'Record request is too large or empty.'})
                return
            value = json.loads(self.rfile.read(length))
            if not isinstance(value, dict):
                raise ValueError('Invalid request.')
            if path == '/api/cat-profiles':
                self.send_json(200, {'profile': self.cat_profiles.save_profile(value.get('profile'))})
                return
            if path == '/api/cat-history':
                self.send_json(200, self.cat_profiles.save_entry(value.get('entry')))
                return
            records = [value.get('record')] if path == '/api/records' else value.get('records')
            if not isinstance(records, list):
                raise ValueError('Expected a list of records.')
            self.send_json(200, {'records': self.store.add(records)})
        except (ValueError, UnicodeDecodeError) as error:
            message = str(error) if cat_write else 'A record needs a valid ID, date, name, and work entries.'
            self.send_json(400, {'error': message})
        except sqlite3.Error:
            self.send_json(500, {'error': 'Could not save to the local record file.'})


def make_server(port=8767, database=DEFAULT_DATABASE):
    store = RecordStore(database)
    return ThreadingHTTPServer(('127.0.0.1', port), partial(CareHandler, store=store, cat_profiles=CatProfileStore(store)))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8767)
    parser.add_argument('--database', type=Path, default=DEFAULT_DATABASE)
    args = parser.parse_args()
    with make_server(args.port, args.database) as server:
        print(f'SPCA preview: http://localhost:{server.server_port}/', flush=True)
        print(f'Local records: {args.database.resolve()}', flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
