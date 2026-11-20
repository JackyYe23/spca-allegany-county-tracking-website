"""Persistence and local API checks; every test uses a disposable database."""

import json
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from server import RecordStore, make_server


def record(identifier='first'):
    return {'schemaVersion': 1, 'id': identifier, 'careDate': '2026-10-21',
            'volunteerName': 'UI Tester', 'entries': [
                {'kind': 'task', 'sectionId': 'rooms-cleaning', 'locationId': 'room-6', 'taskId': 'hallway-glass'}]}


class StoreTests(unittest.TestCase):
    def test_restart_repeats_and_idempotent_retries(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'records.sqlite3'
            store = RecordStore(path)
            store.add([record()])
            store.add([record()])
            store.add([record('repeat')])
            self.assertEqual(RecordStore(path).read(), [record(), record('repeat')])

    def test_invalid_import_does_not_partially_save(self):
        with tempfile.TemporaryDirectory() as folder:
            store = RecordStore(Path(folder) / 'records.sqlite3')
            with self.assertRaises(ValueError):
                store.add([record(), {**record('invalid'), 'careDate': '2026-02-31'}])
            self.assertEqual(store.read(), [])


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.database = Path(self.folder.name) / 'records.sqlite3'
        self.server = make_server(0, self.database)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join()
        self.folder.cleanup()

    def request(self, path, value=None, headers=None):
        data = None if value is None else json.dumps(value).encode('utf-8')
        request = Request(self.base + path, data=data, headers={'Content-Type': 'application/json', **(headers or {})})
        try:
            with urlopen(request, timeout=3) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

    def test_save_read_and_import_existing_browser_records(self):
        self.assertEqual(json.loads(self.request('/api/records')[1])['records'], [])
        status, body = self.request('/api/records', {'record': record()})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['records'], [record()])
        self.request('/api/records/import', {'records': [record(), record('browser-record')]})
        self.assertEqual(json.loads(self.request('/api/records')[1])['records'], [record(), record('browser-record')])
        self.assertEqual(RecordStore(self.database).read(), [record(), record('browser-record')])

    def test_invalid_or_cross_origin_writes_are_rejected(self):
        self.assertEqual(self.request('/api/records', {'record': {'id': 'invalid'}})[0], 400)
        self.assertEqual(self.request('/api/records', {'record': record()}, {'Origin': 'https://example.com'})[0], 403)
        self.assertEqual(RecordStore(self.database).read(), [])

    def test_feeding_round_times_exceptions_and_repeats_survive_storage(self):
        locations = [f'room-{number}' for number in range(1, 9)] + ['playroom', 'condo-1', 'condo-2']
        entries = [{'kind': 'feeding-check', 'sectionId': 'condos-care' if location.startswith('condo') else 'rooms-feeding',
                    'locationId': location, 'catIds': ['cat-' + location], 'checkedAt': '2026-11-04T16:00:00.000Z'} for location in locations]
        entries.append({'kind': 'feeding-exception', 'sectionId': 'rooms-feeding', 'locationId': 'room-6',
                        'catId': 'poppy', 'catName': 'Poppy', 'issue': 'did-not-eat', 'note': 'Breakfast untouched.'})
        first = {**record('feeding-round'), 'careDate': '2026-11-04', 'submittedAt': '2026-11-04T17:00:00.000Z', 'entries': entries}
        self.assertEqual(self.request('/api/records', {'record': first})[0], 200)
        self.assertEqual(self.request('/api/records', {'record': first})[0], 200)
        repeat = {**first, 'id': 'feeding-round-repeat', 'submittedAt': '2026-11-04T20:00:00.000Z'}
        self.assertEqual(self.request('/api/records', {'record': repeat})[0], 200)
        self.assertEqual(json.loads(self.request('/api/records')[1])['records'], [first, repeat])
        self.assertEqual(RecordStore(self.database).read(), [first, repeat])

    def test_database_is_not_served_as_a_file(self):
        self.assertEqual(self.request('/.local-data/care-records.sqlite3')[0], 404)
        self.assertEqual(self.request('/%2elocal-data/care-records.sqlite3')[0], 404)
        self.assertEqual(self.request('/')[0], 200)

    def test_cat_profiles_share_checklist_history_by_id(self):
        cat = {'id': 'cat-poppy', 'name': 'Poppy', 'location': 'Room 6', 'chip': '000123', 'diet': 'Wet food'}
        status, body = self.request('/api/cat-profiles', {'profile': cat})
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['profile']['chip'], '000123')
        original = record()
        original['entries'].append({'kind': 'feeding-exception', 'catId': cat['id'], 'issue': 'did-not-eat',
                                    'note': 'Skipped breakfast.'})
        self.assertEqual(self.request('/api/records', {'record': original})[0], 200)
        saved = json.loads(self.request('/api/cat-history?cat=cat-poppy')[1])['entries']
        self.assertEqual([(entry['note'], entry['source']) for entry in saved], [('Skipped breakfast.', 'Checklist')])
        self.assertEqual(json.loads(self.request('/api/cat-history?cat=cat-other')[1])['entries'], [])
        self.assertEqual(RecordStore(self.database).read(), [original])

    def test_cat_entries_validate_and_save_for_each_cat_once(self):
        base = {'date': '2026-01-01', 'shift': 'AM', 'recordedBy': 'Volunteer'}
        cat = {'id': 'sample-room-6-0', 'sample': {'name': 'Poppy', 'location': 'Room 6'}}
        other = {'id': 'sample-room-6-1', 'sample': {'name': 'Theo', 'location': 'Room 6'}, 'note': 'Ate later.'}
        path = '/api/cat-history'
        def save(**fields):
            return self.request(path, {'entry': {**base, 'cats': [cat], **fields}})[0]
        def history(cat_id):
            return json.loads(self.request(path + '?cat=' + cat_id)[1])['entries']

        self.assertEqual(save(id='weight', kind='weight', pounds=12, ounces=15), 200)
        self.assertEqual(save(id='bad-weight', kind='weight', pounds=12, ounces=16), 400)
        self.assertEqual(save(id='observation', kind='observation', observations={'urine': 'Normal'}, healthConcerns='Sneezed'), 200)
        self.assertEqual(save(id='blank', kind='observation', observations={}), 400)
        self.assertEqual(save(id='future', kind='weight', pounds=12, ounces=0, date='9999-01-01'), 400)
        self.assertEqual(save(id='rollback', kind='exception', issue='ate-some', cats=[cat, {'id': 'missing'}]), 400)
        group = {'id': 'shared', 'kind': 'exception', 'issue': 'did-not-eat', 'cats': [cat, other], 'note': 'Wet food untouched.'}
        self.assertEqual(save(**group), 200)
        self.assertEqual(save(**group), 200)
        self.assertEqual(save(**{**group, 'note': 'Changed after saving.'}), 400)
        poppy = {entry['id']: entry for entry in history(cat['id'])}
        theo = history(other['id'])
        self.assertEqual(set(poppy), {'weight', 'observation', 'shared'})
        self.assertEqual((poppy['weight']['pounds'], poppy['weight']['ounces']), (12, 15))
        self.assertEqual(poppy['observation']['healthConcerns'], 'Sneezed')
        self.assertEqual((len(theo), theo[0]['note'], theo[0]['individualNote']), (1, 'Wet food untouched.', 'Ate later.'))


if __name__ == '__main__':
    unittest.main()
