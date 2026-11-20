"""Cat profiles and care history in the local checklist database."""

import base64
from datetime import date, datetime, timedelta, timezone
import json
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


PROFILE_FIELDS = {'name': 120, 'location': 120, 'chip': 80, 'color': 80, 'sex': 40,
                  'diet': 500, 'medications': 1000}
OBSERVATION_CHOICES = {
    'dryAppetite': {'Ate well', 'Ate some', 'Did not eat', 'Not offered'},
    'wetAppetite': {'Ate well', 'Ate some', 'Did not eat', 'Not offered'},
    'water': {'Drank water', 'Did not see drinking'},
    'urine': {'Normal', 'Abnormal', 'None seen'},
    'stool': {'Normal', 'Abnormal', 'None seen'},
    'behavior': {'Friendly', 'Angry', 'Shy', 'Scared', 'Other'},
    **dict.fromkeys(('cage', 'blanket', 'enrichment'), {'Done', 'Not done'}),
}
OBSERVATION_CATEGORIES = {'medical', 'behavioral', 'other'}


def eastern_today():
    now = datetime.now(timezone.utc)
    try:
        return now.astimezone(ZoneInfo('America/New_York')).date()
    except ZoneInfoNotFoundError:
        # Windows Python can lack IANA data. Use the current Eastern DST rules.
        march = datetime(now.year, 3, 8, 7, tzinfo=timezone.utc)
        november = datetime(now.year, 11, 1, 6, tzinfo=timezone.utc)
        start = march + timedelta(days=(6 - march.weekday()) % 7)
        end = november + timedelta(days=(6 - november.weekday()) % 7)
        return (now - timedelta(hours=4 if start <= now < end else 5)).date()


def clean_text(value, limit):
    if not isinstance(value, str) or len(value) > limit:
        raise ValueError('Check the length and format of your entries.')
    return value.strip()


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}', value):
        raise ValueError('Choose a cat or reopen the entry form.')
    return value


def validated_profile(value):
    if not isinstance(value, dict):
        raise ValueError('Enter a cat name.')
    profile = {field: clean_text(value.get(field, ''), limit) for field, limit in PROFILE_FIELDS.items()}
    profile['id'] = identifier(value.get('id'))
    if not profile['name']:
        raise ValueError('Enter a cat name.')
    photo = clean_text(value.get('photo', ''), 320_000)
    if photo:
        prefix = 'data:image/jpeg;base64,'
        if not photo.startswith(prefix) or not base64.b64decode(photo[len(prefix):], validate=True).startswith(b'\xff\xd8\xff'):
            raise ValueError('Choose a valid cat photo.')
    profile['photo'] = photo
    return profile


class CatProfileStore:
    def __init__(self, records):
        self.records = records
        with self.records.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS cat_profiles (id TEXT PRIMARY KEY, payload TEXT NOT NULL)')
            db.execute('''CREATE TABLE IF NOT EXISTS cat_history (
                cat_id TEXT NOT NULL, id TEXT NOT NULL, observed_date TEXT NOT NULL, payload TEXT NOT NULL,
                PRIMARY KEY (cat_id, id))''')
            db.execute('CREATE INDEX IF NOT EXISTS cat_history_entry_id ON cat_history (id)')

    def list_profiles(self):
        with self.records.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT payload FROM cat_profiles')]

    def save_profile(self, value):
        profile = validated_profile(value)
        with self.records.connect() as db:
            db.execute('''INSERT INTO cat_profiles (id, payload) VALUES (?, ?)
                ON CONFLICT(id) DO UPDATE SET payload = excluded.payload''', (profile['id'], json.dumps(profile)))
        return profile

    def save_entry(self, value):
        if not isinstance(value, dict):
            raise ValueError('Enter an observation, weight, or feeding exception.')
        entry_id = identifier(value.get('id'))
        kind = value.get('kind')
        date_text = value.get('date')
        try:
            observed = date.fromisoformat(date_text)
        except (ValueError, TypeError):
            raise ValueError('Choose a valid observation date.') from None
        if observed.isoformat() != date_text or observed > eastern_today():
            raise ValueError('Choose today or an earlier date.')
        name = clean_text(value.get('recordedBy', ''), 120)
        if not name:
            raise ValueError('Enter your name.')
        targets = value.get('cats')
        if not isinstance(targets, list) or len(targets) != 1:
            raise ValueError('Choose the selected cat for this entry.')
        shift = value.get('shift', '')
        if shift not in ('AM', 'PM'):
            raise ValueError('Choose AM or PM.')
        entry = {'id': entry_id, 'kind': kind, 'date': date_text, 'shift': shift, 'recordedBy': name,
                 'note': clean_text(value.get('note', ''), 2000)}
        if kind == 'observation':
            fields = value.get('observations')
            if not isinstance(fields, dict) or any(
                field not in OBSERVATION_CHOICES or not isinstance(answer, str) or answer not in OBSERVATION_CHOICES[field]
                for field, answer in fields.items()
            ):
                raise ValueError('Choose valid observation answers.')
            entry['observations'] = fields
            categories = value.get('healthCategories', [])
            if not isinstance(categories, list) or len(categories) > len(OBSERVATION_CATEGORIES) or any(
                not isinstance(category, str) or category not in OBSERVATION_CATEGORIES for category in categories
            ):
                raise ValueError('Choose valid health concern categories.')
            entry['healthCategories'] = list(dict.fromkeys(categories))
            entry['flaggedForManagement'] = value.get('flaggedForManagement') is True
            # Include the older concern field when deciding whether the entry has content.
            entry['healthConcerns'] = clean_text(value.get('healthConcerns', ''), 1000)
            if not fields and not entry['healthConcerns'] and not entry['note'] and not entry['healthCategories'] and not entry['flaggedForManagement']:
                raise ValueError('Select an observation or enter a note.')
        elif kind == 'weight':
            pounds, ounces = value.get('pounds'), value.get('ounces')
            if type(pounds) is not int or type(ounces) is not int or not (0 <= pounds <= 100 and 0 <= ounces < 16 and pounds + ounces > 0):
                raise ValueError('Enter a weight using pounds and ounces.')
            entry.update(pounds=pounds, ounces=ounces)
        else:
            raise ValueError('Feeding exceptions must be entered through the feeding workflow.')

        payloads = {}
        samples = {}
        for target in targets:
            if not isinstance(target, dict):
                raise ValueError('Choose the cats for this entry.')
            cat_id = identifier(target.get('id'))
            if cat_id in payloads:
                raise ValueError('Choose each cat once.')
            payloads[cat_id] = {**entry, 'catId': cat_id}
            samples[cat_id] = target.get('sample')

        with self.records.connect() as db:
            # Profile observations and weights are saved for one selected cat.
            db.execute('BEGIN IMMEDIATE')
            saved = {cat_id: json.loads(payload) for cat_id, payload in db.execute(
                'SELECT cat_id, payload FROM cat_history WHERE id = ?', (entry_id,))}
            if saved:
                for item in saved.values():
                    item.pop('recordedAt', None)
                if saved != payloads:
                    raise ValueError('This entry was already saved with different details. Check care history before saving again.')
                return {'saved': len(saved)}
            recorded_at = datetime.now(timezone.utc).isoformat()
            for cat_id, payload in payloads.items():
                if not db.execute('SELECT 1 FROM cat_profiles WHERE id = ?', (cat_id,)).fetchone():
                    sample = samples[cat_id]
                    if not cat_id.startswith('sample-') or not isinstance(sample, dict):
                        raise ValueError('Save the cat profile first.')
                    profile = validated_profile({'id': cat_id, 'name': sample.get('name'), 'location': sample.get('location', '')})
                    db.execute('INSERT INTO cat_profiles (id, payload) VALUES (?, ?)', (cat_id, json.dumps(profile)))
                db.execute('INSERT INTO cat_history (cat_id, id, observed_date, payload) VALUES (?, ?, ?, ?)',
                           (cat_id, entry_id, date_text, json.dumps({**payload, 'recordedAt': recorded_at})))
        return {'saved': len(payloads)}

    def history(self, cat_id):
        identifier(cat_id)
        with self.records.connect() as db:
            entries = [json.loads(row[0]) for row in db.execute(
                'SELECT payload FROM cat_history WHERE cat_id = ?', (cat_id,))]
        checklist_entries = []
        fingerprints = set()
        for record in self.records.read():
            for item in record['entries']:
                if item.get('kind') != 'feeding-exception' or item.get('catId') != cat_id:
                    continue
                row = {'id': record['id'] + ':' + str(item.get('sourceId') or item.get('issue') or 'exception'),
                                'sourceId': item.get('sourceId'), 'catId': cat_id, 'kind': 'exception', 'date': record['careDate'],
                                'recordedAt': record.get('submittedAt') or '', 'recordedBy': record['volunteerName'],
                                'issue': item.get('issue'), 'otherDetails': item.get('otherDetails', ''),
                                'note': item.get('note', ''), 'source': 'Checklist'}
                checklist_entries.append(row)
                fingerprints.add(self._exception_fingerprint(row))
        entries = [entry for entry in entries if not (
            entry.get('kind') == 'exception' and self._exception_fingerprint(entry) in fingerprints
        )]
        entries.extend(checklist_entries)
        return sorted(entries, key=lambda entry: (entry['date'], entry.get('shift', ''), entry['recordedAt']), reverse=True)

    @staticmethod
    def _exception_fingerprint(entry):
        return tuple(str(entry.get(field) or '').strip().casefold() for field in ('date', 'catId', 'issue', 'otherDetails')) + (
            str(entry.get('individualNote') or entry.get('note') or '').strip().casefold(),
        )
