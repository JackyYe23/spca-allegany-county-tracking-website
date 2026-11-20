const test = require('node:test');
const assert = require('node:assert/strict');
const Care = require('./care-model.js');
const date = '2026-10-07';
const now = new Date('2026-10-07T15:30:00Z');
const empty = () => Care.daySnapshot([], date);
const draft = () => Care.createDraft(date, 'contribution-1');

test('multiple rooms stay independent and remaining instructions are grouped', () => {
  const work = draft();
  const section = Care.sectionById('rooms-cleaning');
  work.selected[section.id] = ['room-1', 'room-3'];
  const locations = Care.scopeLocations(work, section);
  const untouched = Care.taskSummary(work, empty(), section, locations);
  assert.equal(untouched.remaining.length, 16);
  assert.ok(untouched.remaining.every(row => row.locations.length === 0));
  Care.getRecord(work, section.id, 'room-1', true).tasks.litter = true;
  const summary = Care.taskSummary(work, empty(), section, locations);
  assert.deepEqual(summary.remaining.find(row => row.id === 'litter').locations.map(location => location.id), ['room-3']);
  assert.equal(Care.getRecord(work, section.id, 'room-3').tasks.litter, undefined);
  assert.equal(Care.percent(work, empty(), section), 1);
});

test('one completed task permits a partial save; selection alone and blank names do not', () => {
  const work = draft();
  work.name = '   ';
  work.selected['rooms-cleaning'] = ['room-1'];
  assert.throws(() => Care.buildSubmission(work, empty(), now));
  work.name = ' Volunteer ';
  assert.throws(() => Care.buildSubmission(work, empty(), now));
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).tasks.litter = true;
  work.selected['rooms-cleaning'] = [];
  const saved = Care.buildSubmission(work, empty(), now);
  assert.equal(saved.entries.length, 1);
  assert.equal(saved.volunteerName, 'Volunteer');
  assert.equal(saved.savedOnDeviceOnly, true);
  assert.equal(Care.scopeLocations(work, Care.sectionById('rooms-cleaning')).length, 1);
});

test('unconfirmed cleaner tasks share one prompt and unfinished work survives saving', () => {
  const work = draft();
  work.name = 'Volunteer';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  Care.sectionById('rooms-cleaning').tasks.forEach(task => { room.tasks[task.id] = true; });
  const result = Care.contribution(work, empty(), now);
  assert.equal(result.entries.length, 9);
  assert.equal(result.pending.length, 1);
  assert.deepEqual(result.pending[0].taskIds, ['cubbies', 'cat-tree', 'walls', 'sliding-windows', 'hallway-glass', 'door-glass', 'floor']);
  const saved = Care.buildSubmission(work, empty(), now);
  const next = Care.clearSubmitted(work, saved, 'next');
  assert.equal(Care.contribution(next, Care.daySnapshot([saved], date), now).entries.length, 0);
  assert.equal(Care.contribution(next, empty(), now).pending.length, 1);
  const resumed = Care.getRecord(next, 'rooms-cleaning', 'room-1');
  resumed.cleaner.cubbies = true;
  assert.deepEqual(Care.contribution(next, Care.daySnapshot([saved], date), now).entries.map(entry => entry.taskId), ['cubbies']);
});

test('one location confirmation covers its checked cleaner tasks and resets after saving', () => {
  const work = draft();
  work.name = 'Volunteer';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  room.tasks = { cubbies: true, 'cat-tree': true, floor: true };
  Care.getRecord(work, 'rooms-cleaning', 'room-3', true).tasks.cubbies = true;
  assert.equal(Care.contribution(work, empty(), now).entries.length, 0);
  assert.equal(Care.contribution(work, empty(), now).pending.length, 2);
  room.rescueCleanerUsed = true;
  const restored = Care.normalizeDraft(work, date, 'fallback');
  const result = Care.contribution(restored, empty(), now);
  assert.equal(result.entries.length, 3);
  assert.ok(result.entries.every(entry => entry.locationId === 'room-1' && entry.usedRescueCleaner === true));
  assert.deepEqual(result.pending.map(item => item.locationId), ['room-3']);
  const saved = Care.buildSubmission(restored, empty(), now);
  const next = Care.clearSubmitted(restored, saved, 'next');
  const resumed = Care.getRecord(next, 'rooms-cleaning', 'room-1');
  assert.equal(resumed.rescueCleanerUsed, false);
  resumed.tasks.walls = true;
  const later = Care.contribution(next, Care.daySnapshot([saved], date), now);
  assert.equal(later.entries.length, 0);
  assert.deepEqual(later.pending.map(item => item.locationId), ['room-1', 'room-3']);
});

test('legacy cleaner acknowledgments stay with disinfecting steps when combined tasks split', () => {
  const restored = Care.normalizeDraft({ records: { 'rooms-cleaning|room-1': {
    tasks: { cubbies: true, 'cat-tree': true }, cleaner: { cubbies: true }
  } } }, date, 'restored');
  const result = Care.contribution(restored, empty(), now);
  assert.deepEqual(result.entries.map(entry => entry.taskId), ['cubbies', 'tree-toys']);
  assert.equal(result.entries.find(entry => entry.taskId === 'tree-toys').usedRescueCleaner, null);
  assert.deepEqual(result.pending[0].taskIds, ['cat-tree']);
  assert.equal(Care.getRecord(restored, 'rooms-cleaning', 'room-1').rescueCleanerUsed, false);
});

test('cat exceptions retain individual identities and distinct outcomes without marking untouched cats checked', () => {
  const work = draft();
  const room = Care.getRecord(work, 'rooms-feeding', 'room-1', true);
  const [luna, milo] = Care.catsFor('room-1');
  room.exceptions = [
    { id: 'a', catIds: [luna.id], issue: 'did-not-eat', other: '', note: 'Breakfast' },
    { id: 'b', catIds: [milo.id], issue: 'ate-some', other: '', note: '' }
  ];
  let result = Care.contribution(work, empty(), now);
  assert.deepEqual(result.entries.map(entry => [entry.catName, entry.issue]), [['Luna', 'did-not-eat'], ['Milo', 'ate-some']]);
  assert.equal(Care.percent(work, empty(), Care.sectionById('rooms-feeding')), 0);
  room.exceptions.shift();
  result = Care.contribution(work, empty(), now);
  assert.equal(result.entries[0].catId, milo.id);
  room.exceptions[0].issue = 'other';
  assert.equal(Care.contribution(work, empty(), now).pending.length, 1);
  room.exceptions[0].other = 'Water bowl tipped';
  assert.equal(Care.contribution(work, empty(), now).entries[0].otherDetails, 'Water bowl tipped');
});

test('feeding coverage keeps daily history while allowing cats to be checked again', () => {
  const work = draft();
  work.name = 'Volunteer';
  const section = Care.sectionById('rooms-feeding');
  const room = Care.getRecord(work, section.id, 'room-1', true);
  const cats = Care.catsFor('room-1');
  room.feeding = { checked: true, scope: 'selected', catIds: [cats[0].id] };
  assert.equal(Care.careComplete(work, empty(), section, 'room-1', 'feeding'), false);
  const saved = Care.buildSubmission(work, empty(), now);
  const snapshot = Care.daySnapshot([saved], date);
  const next = Care.clearSubmitted(work, saved, 'next');
  const resumed = Care.getRecord(next, section.id, 'room-1');
  assert.equal(Care.contribution(next, snapshot, now).entries.length, 0);
  resumed.feeding = { checked: true, scope: 'selected', catIds: [cats[0].id] };
  assert.deepEqual(Care.contribution(next, snapshot, now).entries[0].catIds, [cats[0].id]);
  resumed.feeding = { checked: true, scope: 'all', catIds: [] };
  assert.equal(Care.careComplete(next, snapshot, section, 'room-1', 'feeding'), true);
  const feeding = Care.contribution(next, snapshot, now).entries[0];
  assert.deepEqual(feeding.catIds, cats.map(cat => cat.id));
  assert.equal(feeding.rosterSnapshot.length, cats.length);
});

test('repeating cleaning work creates a fresh contribution without duplicating daily progress', () => {
  const work = draft();
  work.name = 'Volunteer';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  room.tasks = { litter: true, cubbies: true };
  room.rescueCleanerUsed = true;
  const first = Care.buildSubmission(work, empty(), now);
  const firstSnapshot = Care.daySnapshot([first], date);
  const next = Care.clearSubmitted(work, first, 'second-round');
  assert.equal(Care.contribution(next, firstSnapshot, now).entries.length, 0);
  const repeated = Care.getRecord(next, 'rooms-cleaning', 'room-1');
  repeated.tasks = { litter: true, cubbies: true };
  const unconfirmed = Care.contribution(next, firstSnapshot, now);
  assert.deepEqual(unconfirmed.entries.map(entry => entry.taskId), ['litter']);
  assert.deepEqual(unconfirmed.pending[0].taskIds, ['cubbies']);
  repeated.rescueCleanerUsed = true;
  const second = Care.buildSubmission(next, firstSnapshot, new Date('2026-10-07T16:30:00Z'));
  assert.notEqual(second.id, first.id);
  assert.notEqual(second.submittedAt, first.submittedAt);
  assert.deepEqual(second.entries.map(entry => entry.taskId), ['litter', 'cubbies']);
  assert.equal(first.entries.length, 2);
  const combined = Care.daySnapshot([first, second], date);
  assert.equal(combined.tasks.size, 2);
  assert.equal(Care.percent(next, combined, Care.sectionById('rooms-cleaning')), Care.percent(next, firstSnapshot, Care.sectionById('rooms-cleaning')));
  assert.equal(combined.tasks.get('rooms-cleaning|room-1|litter').submittedAt, second.submittedAt);
});

test('last completion keeps the newest volunteer and time when older records are imported later', () => {
  const first = draft();
  first.name = 'Casey';
  Care.getRecord(first, 'rooms-cleaning', 'room-1', true).tasks['sliding-windows'] = true;
  Care.getRecord(first, 'rooms-cleaning', 'room-1', true).rescueCleanerUsed = true;
  const earlier = Care.buildSubmission(first, empty(), now);
  const repeated = Care.createDraft(date, 'repeat');
  repeated.name = 'Morgan';
  Care.getRecord(repeated, 'rooms-cleaning', 'room-1', true).tasks['sliding-windows'] = true;
  Care.getRecord(repeated, 'rooms-cleaning', 'room-1', true).rescueCleanerUsed = true;
  const later = Care.buildSubmission(repeated, empty(), new Date('2026-10-07T17:45:00Z'));
  const snapshot = Care.daySnapshot([later, earlier], date);
  const last = snapshot.tasks.get('rooms-cleaning|room-1|sliding-windows');
  assert.equal(last.volunteerName, 'Morgan');
  assert.equal(last.submittedAt, later.submittedAt);
  assert.equal(snapshot.tasks.size, 1);
  assert.equal(Care.percent(draft(), snapshot, Care.sectionById('rooms-cleaning')), 1);
});

test('feeding and enrichment can both be recorded again after a saved round', () => {
  const work = draft();
  work.name = 'Volunteer';
  const condo = Care.getRecord(work, 'condos-care', 'condo-1', true);
  condo.feeding.checked = true;
  condo.enriched = true;
  const first = Care.buildSubmission(work, empty(), now);
  const snapshot = Care.daySnapshot([first], date);
  const next = Care.clearSubmitted(work, first, 'second-round');
  assert.equal(Care.contribution(next, snapshot, now).entries.length, 0);
  const repeated = Care.getRecord(next, 'condos-care', 'condo-1');
  repeated.feeding.checked = true;
  repeated.enriched = true;
  const second = Care.buildSubmission(next, snapshot, new Date('2026-10-07T16:30:00Z'));
  assert.deepEqual(second.entries.map(entry => entry.kind), ['feeding-check', 'enrichment']);
  assert.deepEqual(second.entries[0].catIds, first.entries[0].catIds);
  assert.equal(Care.percent(next, Care.daySnapshot([first, second], date), Care.sectionById('condos-care')), 50);
});

test('feeding and enrichment keep their own latest completion metadata after out-of-order imports', () => {
  const original = draft();
  original.name = 'Casey';
  const condo = Care.getRecord(original, 'condos-care', 'condo-2', true);
  condo.feeding.checked = true;
  condo.enriched = true;
  const earlier = Care.buildSubmission(original, empty(), now);
  const feeding = Care.createDraft(date, 'later-feeding');
  feeding.name = 'River';
  Care.getRecord(feeding, 'condos-care', 'condo-2', true).feeding.checked = true;
  const laterFeeding = Care.buildSubmission(feeding, empty(), new Date('2026-10-07T17:00:00Z'));
  const enrichment = Care.createDraft(date, 'later-enrichment');
  enrichment.name = 'Morgan';
  Care.getRecord(enrichment, 'condos-care', 'condo-2', true).enriched = true;
  const laterEnrichment = Care.buildSubmission(enrichment, empty(), new Date('2026-10-07T18:00:00Z'));
  const snapshot = Care.daySnapshot([laterFeeding, laterEnrichment, earlier], date);
  assert.equal(snapshot.feeding.get('condos-care|condo-2').volunteerName, 'River');
  assert.equal(snapshot.enrichment.get('condos-care|condo-2').volunteerName, 'Morgan');
  assert.equal(snapshot.feeding.has('condos-care|condo-1'), false);
  assert.equal(Care.percent(draft(), snapshot, Care.sectionById('condos-care')), 50);
});

test('condo enrichment is independent of feeding and invalid optional entries do not block valid work', () => {
  const work = draft();
  work.name = 'Volunteer';
  const section = Care.sectionById('condos-care');
  const condo = Care.getRecord(work, section.id, 'condo-1', true);
  condo.enriched = true;
  condo.exceptions = [{ id: 'unfinished', catIds: [], issue: '', other: '', note: '' }];
  const saved = Care.buildSubmission(work, empty(), now);
  assert.deepEqual(saved.entries.map(entry => entry.kind), ['enrichment']);
  assert.equal(Care.careComplete(work, empty(), section, 'condo-1', 'feeding'), false);
  assert.equal(Care.percent(work, empty(), section), 25);
  const next = Care.clearSubmitted(work, saved, 'next');
  assert.equal(Care.getRecord(next, section.id, 'condo-1').exceptions.length, 1);
});

test('normalization drops obsolete IDs and flags without inventing completed work', () => {
  const work = Care.normalizeDraft({
    taskCatalogVersion: Care.TASK_CATALOG_VERSION,
    name: 'Volunteer', selected: { 'rooms-cleaning': ['room-1', 'room-1', 'fake'] },
    records: { 'rooms-cleaning|room-1': { tasks: { litter: true, fake: true }, cleaner: { cubbies: true } },
      'rooms-feeding|room-1': { feeding: { checked: true, scope: 'selected', catIds: ['fake'] } } }
  }, date, 'new');
  assert.deepEqual(work.selected['rooms-cleaning'], ['room-1']);
  assert.equal(Care.getRecord(work, 'rooms-cleaning', 'room-1').cleaner.cubbies, false);
  assert.equal(Care.getRecord(work, 'rooms-cleaning', 'room-1').tasks.fake, undefined);
  assert.equal(Care.contribution(work, empty(), now).entries.length, 1);
  assert.equal(Care.contribution(work, empty(), now).pending.length, 1);
});

test('100% is reserved for actual completion and dates follow New York local time', () => {
  const work = draft();
  const section = Care.sectionById('rooms-cleaning');
  section.locations.forEach(location => {
    const record = Care.getRecord(work, section.id, location.id, true);
    section.tasks.forEach(task => { record.tasks[task.id] = true; if (task.rescue) record.cleaner[task.id] = true; });
  });
  assert.equal(Care.percent(work, empty(), section), 100);
  Care.getRecord(work, section.id, 'room-1').cleaner.cubbies = false;
  assert.equal(Care.percent(work, empty(), section), 99);
  assert.equal(Care.localDate(new Date('2026-10-07T02:00:00Z')), '2026-10-06');
  assert.equal(Care.localTime(new Date('2026-10-07T15:30:00Z')), '11:30');
  assert.equal(Care.daySnapshot([Care.buildSubmission({ ...work, name: 'Volunteer' }, empty(), now)], '2026-10-06').tasks.size, 0);
});

test('notes retain concern metadata and incomplete draft cleanup can safely recover', () => {
  const work = draft();
  work.name = 'Volunteer';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  room.note = '  Please inspect the latch.  ';
  room.categories = ['other']; room.flagged = true;
  const saved = Care.buildSubmission(work, empty(), now);
  assert.equal(saved.entries[0].text, 'Please inspect the latch.');
  assert.equal(saved.entries[0].flaggedForManagement, true);
  const recovered = Care.clearSubmitted(work, saved, 'next');
  assert.equal(Care.contribution(recovered, Care.daySnapshot([saved], date), now).entries.length, 0);
  assert.equal(recovered.contributionId, 'next');
  assert.equal(work.records['rooms-cleaning|room-1'].note.trim(), 'Please inspect the latch.');
});

test('sweeping and mopping submit independently and only mopping needs cleaner confirmation', () => {
  const work = draft();
  work.name = 'Volunteer';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  room.tasks['sweep-room'] = true;
  let result = Care.contribution(work, empty(), now);
  assert.deepEqual(result.entries.map(entry => entry.taskId), ['sweep-room']);
  assert.equal(result.pending.length, 0);
  room.tasks.floor = true;
  result = Care.contribution(work, empty(), now);
  assert.deepEqual(result.pending[0].taskIds, ['floor']);
  assert.match(result.pending[0].label, /Mop floor/);
  assert.doesNotMatch(result.pending[0].label, /Sweep room/);
  room.rescueCleanerUsed = true;
  const saved = Care.buildSubmission(work, empty(), now);
  assert.equal(saved.taskCatalogVersion, Care.TASK_CATALOG_VERSION);
  assert.deepEqual(saved.entries.map(entry => [entry.taskId, entry.usedRescueCleaner]), [['sweep-room', null], ['floor', true]]);
});

test('legacy combined drafts expand once and retain their cleaner confirmation', () => {
  const legacy = { name: 'Volunteer', records: {
    'rooms-cleaning|room-1': { tasks: { floor: true }, cleaner: { floor: true } },
    'condos-cleaning|condo-1': { tasks: { setup: true, disinfect: true }, cleaner: { disinfect: true } }
  } };
  const migrated = Care.normalizeDraft(legacy, date, 'migrated');
  const room = Care.getRecord(migrated, 'rooms-cleaning', 'room-1');
  assert.equal(room.tasks['sweep-room'], true);
  assert.equal(room.tasks.floor, true);
  assert.equal(room.cleaner.floor, true);
  const condo = Care.getRecord(migrated, 'condos-cleaning', 'condo-1');
  for (const id of ['setup', 'clean-bedding', 'dishes', 'water-dishes', 'toys', 'spray-condo', 'disinfect']) assert.equal(condo.tasks[id], true);
  assert.equal(condo.cleaner['spray-condo'], true);
  assert.deepEqual(Care.normalizeDraft(migrated, date, 'again'), migrated);
  const onlyMop = draft();
  Care.getRecord(onlyMop, 'rooms-cleaning', 'room-1', true).tasks.floor = true;
  assert.equal(Care.getRecord(Care.normalizeDraft(onlyMop, date, 'new'), 'rooms-cleaning', 'room-1').tasks['sweep-room'], false);
});

test('legacy submitted combinations cover their split steps while new submissions stay independent', () => {
  const legacy = { id: 'old-floor', careDate: date, volunteerName: 'Casey', submittedAt: now.toISOString(), entries: [
    { kind: 'task', sectionId: 'rooms-cleaning', locationId: 'room-1', taskId: 'floor', usedRescueCleaner: true }
  ] };
  const oldSnapshot = Care.daySnapshot([legacy], date);
  assert.deepEqual(Array.from(oldSnapshot.tasks.keys()).sort(), ['rooms-cleaning|room-1|floor', 'rooms-cleaning|room-1|sweep-room']);
  assert.equal(oldSnapshot.tasks.get('rooms-cleaning|room-1|sweep-room').volunteerName, 'Casey');
  assert.equal(Care.daySnapshot([{ ...legacy, entries: [{ ...legacy.entries[0], usedRescueCleaner: false }] }], date).tasks.size, 0);
  const work = draft();
  work.name = 'Morgan';
  const room = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  room.tasks.floor = true;
  room.rescueCleanerUsed = true;
  const current = Care.buildSubmission(work, empty(), now);
  const newSnapshot = Care.daySnapshot([current], date);
  assert.equal(newSnapshot.tasks.size, 1);
  assert.equal(newSnapshot.tasks.has('rooms-cleaning|room-1|sweep-room'), false);
  room.tasks['sweep-room'] = true;
  assert.equal(Care.getRecord(Care.clearSubmitted(work, current, 'next'), 'rooms-cleaning', 'room-1').tasks['sweep-room'], true);
  assert.equal(Care.getRecord(Care.clearSubmitted(work, legacy, 'next'), 'rooms-cleaning', 'room-1').tasks['sweep-room'], undefined);
});

test('fully completed legacy cleaning records remain fully completed after the task split', () => {
  const oldIds = {
    'rooms-cleaning': ['litter', 'cubbies', 'cat-tree', 'walls', 'bowls', 'dish-bedding', 'room-bedding', 'sliding-windows', 'hallway-glass', 'floor', 'toys'],
    'condos-cleaning': ['move-cats', 'bedding', 'dishes', 'litter', 'levels', 'disinfect', 'setup', 'glass', 'return-cats']
  };
  const entries = Object.entries(oldIds).flatMap(([sectionId, ids]) => Care.sectionById(sectionId).locations.flatMap(location => ids.map(taskId => ({ kind: 'task', sectionId, locationId: location.id, taskId, usedRescueCleaner: true }))));
  const snapshot = Care.daySnapshot([{ careDate: date, id: 'all-old', volunteerName: 'Casey', submittedAt: now.toISOString(), entries }], date);
  assert.equal(Care.percent(draft(), snapshot, Care.sectionById('rooms-cleaning')), 100);
  assert.equal(Care.percent(draft(), snapshot, Care.sectionById('condos-cleaning')), 100);
  assert.equal(Care.sectionById('condos-cleaning').tasks.length, 14);
});

test('location-first drafts preserve separate location and work-type choices', () => {
  const work = draft();
  work.locations.rooms = ['room-5', 'room-1', 'room-5', 'unknown'];
  work.locations.condos = ['condo-2'];
  work.selected['rooms-cleaning'] = ['room-1'];
  work.selected['rooms-feeding'] = ['room-1', 'room-5'];
  work.selected['condos-care'] = ['condo-2'];
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).note = 'Cleaning note';
  Care.getRecord(work, 'rooms-feeding', 'room-1', true).note = 'Feeding note';
  const normalized = Care.normalizeDraft(work, date, 'fallback');
  assert.deepEqual(normalized.locations.rooms, ['room-1', 'room-5']);
  assert.deepEqual(normalized.locations.condos, ['condo-2']);
  assert.deepEqual(normalized.selected['rooms-cleaning'], ['room-1']);
  assert.deepEqual(normalized.selected['rooms-feeding'], ['room-1', 'room-5']);
  normalized.locations.rooms = [];
  const deselected = Care.normalizeDraft(normalized, date, 'fallback');
  assert.deepEqual(deselected.locations.rooms, []);
  assert.equal(Care.getRecord(deselected, 'rooms-cleaning', 'room-1').note, 'Cleaning note');
  assert.equal(Care.getRecord(deselected, 'rooms-feeding', 'room-1').note, 'Feeding note');
});

test('older section-first drafts recover the union of locations and their independent work', () => {
  const work = draft();
  delete work.locations;
  work.selected['rooms-cleaning'] = ['room-3'];
  work.selected['rooms-feeding'] = ['room-1'];
  Care.getRecord(work, 'condos-care', 'condo-2', true).feeding.checked = true;
  const normalized = Care.normalizeDraft(work, date, 'fallback');
  assert.deepEqual(normalized.locations.rooms, ['room-1', 'room-3']);
  assert.deepEqual(normalized.locations.condos, ['condo-2']);
  assert.deepEqual(normalized.selected['rooms-cleaning'], ['room-3']);
  assert.deepEqual(normalized.selected['rooms-feeding'], ['room-1']);
  assert.deepEqual(normalized.selected['condos-care'], ['condo-2']);
  assert.equal(Care.getRecord(normalized, 'condos-care', 'condo-2').feeding.checked, true);
  assert.deepEqual(Care.normalizeDraft(normalized, date, 'again'), normalized);
});

test('location notes combine older cleaning and feeding concerns and submit only once', () => {
  const work = draft();
  work.name = 'Volunteer';
  const cleaning = Care.getRecord(work, 'rooms-cleaning', 'room-1', true);
  cleaning.tasks['sweep-room'] = true;
  cleaning.note = 'Check the door latch.';
  cleaning.categories = ['other'];
  const feeding = Care.getRecord(work, 'rooms-feeding', 'room-1', true);
  feeding.feeding.checked = true;
  feeding.note = 'Watch Luna at dinner.';
  feeding.categories = ['medical', 'other'];
  feeding.flagged = true;
  assert.deepEqual(Care.getLocationNotes(work, 'room-1'), {
    note: 'Check the door latch.\n\nWatch Luna at dinner.', categories: ['other', 'medical'], flagged: true
  });
  const saved = Care.buildSubmission(work, empty(), now);
  const notes = saved.entries.filter(entry => entry.kind === 'note');
  assert.equal(notes.length, 1);
  assert.equal(notes[0].scope, 'location');
  assert.equal(notes[0].text, Care.getLocationNotes(work, 'room-1').note);
  assert.equal(notes[0].flaggedForManagement, true);
  assert.ok(saved.entries.some(entry => entry.kind === 'task'));
  assert.ok(saved.entries.some(entry => entry.kind === 'feeding-check'));
  const cleared = Care.clearSubmitted(work, saved, 'next');
  assert.deepEqual(Care.getLocationNotes(cleared, 'room-1'), { note: '', categories: [], flagged: false });
  assert.equal(Care.contribution(cleared, empty(), now).entries.length, 0);
});

test('editing shared condo notes preserves work and other locations through refresh and save', () => {
  const work = draft();
  work.name = 'Volunteer';
  Care.getRecord(work, 'condos-cleaning', 'condo-2', true).tasks.bedding = true;
  const feeding = Care.getRecord(work, 'condos-care', 'condo-2', true);
  feeding.note = 'A feeding concern.';
  feeding.enriched = true;
  feeding.categories = ['behavioral'];
  Care.getRecord(work, 'rooms-feeding', 'room-1', true).note = 'A separate room concern.';
  const shared = Care.getLocationNotes(work, 'condo-2', true);
  shared.note += '\nA cleaning concern.';
  shared.flagged = true;
  assert.equal(feeding.note, '');
  assert.equal(feeding.enriched, true);
  const restored = Care.normalizeDraft(work, date, 'restored');
  assert.deepEqual(Care.getLocationNotes(restored, 'condo-2'), { note: 'A feeding concern.\nA cleaning concern.', categories: ['behavioral'], flagged: true });
  const saved = Care.buildSubmission(restored, empty(), now);
  assert.equal(saved.entries.filter(entry => entry.kind === 'note' && entry.locationId === 'condo-2').length, 1);
  assert.equal(saved.entries.filter(entry => entry.kind === 'note' && entry.locationId === 'room-1').length, 1);
  assert.ok(saved.entries.some(entry => entry.kind === 'task' && entry.locationId === 'condo-2'));
  assert.ok(saved.entries.some(entry => entry.kind === 'enrichment' && entry.locationId === 'condo-2'));
  assert.deepEqual(Care.getLocationNotes(Care.clearSubmitted(restored, saved, 'next'), 'condo-2'), { note: '', categories: [], flagged: false });
});

test('feeding exception summaries combine valid drafts and dated records for the matching section', () => {
  const work = draft();
  work.name = 'Volunteer';
  const section = Care.sectionById('rooms-feeding');
  const room = Care.getRecord(work, section.id, 'room-1', true);
  room.exceptions = [
    { id: 'meal', catIds: Care.catsFor('room-1').slice(0, 2).map(cat => cat.id), issue: 'did-not-eat', other: '', note: 'Left food untouched.' },
    { id: 'incomplete', catIds: [], issue: 'did-not-drink', other: '', note: '' }
  ];
  const condo = Care.getRecord(work, 'condos-care', 'condo-2', true);
  condo.enriched = true;
  condo.exceptions = [{ id: 'water', catIds: Care.catsFor('condo-2').map(cat => cat.id), issue: 'other', other: 'Water bowl tipped over.', note: '' }];
  const saved = Care.buildSubmission(work, empty(), now);
  const newer = { ...saved, id: 'newer', volunteerName: 'Later volunteer', submittedAt: '2026-10-07T16:30:00Z' };
  const snapshot = Care.daySnapshot([newer, saved, { ...saved, careDate: '2026-10-06', id: 'yesterday' }], date);
  const fresh = draft();
  let rows = Care.feedingExceptionSummary(fresh, snapshot, section, section.locations);
  assert.deepEqual(rows.map(row => row.catName), ['Luna', 'Milo']);
  assert.ok(rows.every(row => row.volunteerName === 'Later volunteer'));
  assert.ok(rows.every(row => row.locationId === 'room-1' && row.note === 'Left food untouched.'));
  assert.equal(Care.feedingExceptionSummary(work, snapshot, section, section.locations).length, 2);
  assert.equal(Care.feedingExceptionSummary(fresh, snapshot, section, [Care.rooms[1]]).length, 0);
  assert.equal(Care.feedingExceptionSummary(fresh, Care.daySnapshot([saved], '2026-10-08'), section, section.locations).length, 0);
  const care = Care.sectionById('condos-care');
  rows = Care.feedingExceptionSummary(fresh, snapshot, care, care.locations);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].catName, 'Sunny');
  assert.equal(rows[0].otherDetails, 'Water bowl tipped over.');
  assert.equal(Care.feedingExceptionSummary(work, snapshot, Care.sectionById('rooms-cleaning'), Care.rooms).length, 0);
});

test('future end times cannot be submitted, with limits based on the care date in New York', () => {
  const work = draft();
  work.name = 'Volunteer';
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).tasks['sweep-room'] = true;
  work.endTime = '11:31';
  assert.match(Care.endTimeError(work, now), /later than the current time/);
  assert.throws(() => Care.buildSubmission(work, empty(), now), /later than the current time/);
  work.endTime = '11:30';
  assert.equal(Care.endTimeError(work, now), '');
  assert.equal(Care.buildSubmission(work, empty(), now).endTime, '11:30');
  work.endTime = '09:00';
  assert.equal(Care.endTimeError(work, now), '');
  work.date = '2026-10-06'; work.endTime = '23:59';
  assert.throws(() => Care.buildSubmission(work, empty(), now), /Care date must be today/);
  const nearMidnight = new Date('2026-10-07T03:30:00Z');
  assert.match(Care.endTimeError(work, nearMidnight), /later than the current time/);
  work.endTime = '23:30';
  assert.equal(Care.endTimeError(work, nearMidnight), '');
  work.date = '2026-10-08'; work.endTime = '00:00';
  assert.match(Care.endTimeError(work, now), /later than the current time/);
  work.date = date;
  for (const invalid of ['24:00', '12:60', '9:00']) {
    work.endTime = invalid;
    assert.match(Care.endTimeError(work, now), /valid end time/);
  }
  work.endTime = '';
  assert.equal(Care.buildSubmission(work, empty(), now).endTime, '11:30');
});

test('entry dates are today only while previous records remain readable', () => {
  const work = draft();
  work.name = 'Volunteer';
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).tasks['sweep-room'] = true;
  assert.equal(Care.entryDateError(work, now), '');
  const saved = Care.buildSubmission(work, empty(), now);
  for (const invalid of ['2026-10-06', '2026-10-08', '', 'not-a-date']) {
    work.date = invalid;
    assert.match(Care.entryDateError(work, now), /Care date must be today/);
    assert.throws(() => Care.buildSubmission(work, empty(), now), /Care date must be today/);
  }
  assert.equal(Care.daySnapshot([saved], date).tasks.size, 1);
  const nearMidnight = new Date('2026-10-08T03:59:00Z');
  work.date = date;
  assert.equal(Care.entryDateError(work, nearMidnight), '');
  assert.match(Care.entryDateError(work, new Date('2026-10-08T04:00:00Z')), /Care date must be today/);
});

test('start and end times enforce chronological order including blank-time defaults', () => {
  const work = draft();
  work.name = 'Volunteer';
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).tasks['sweep-room'] = true;
  work.startTime = '10:00'; work.endTime = '09:59';
  assert.match(Care.endTimeError(work, now), /earlier than start time/);
  assert.throws(() => Care.buildSubmission(work, empty(), now), /earlier than start time/);
  work.endTime = '10:00';
  assert.equal(Care.buildSubmission(work, empty(), now).endTime, '10:00');
  work.endTime = '';
  assert.equal(Care.buildSubmission(work, empty(), now).endTime, '11:30');
  work.startTime = '11:31';
  assert.match(Care.startTimeError(work, now), /later than the current time/);
  assert.throws(() => Care.buildSubmission(work, empty(), now), /later than the current time/);
  for (const invalid of ['24:00', '12:60', '9:00']) {
    work.startTime = invalid;
    assert.match(Care.startTimeError(work, now), /valid start time/);
  }
  work.startTime = ''; work.endTime = '09:00';
  const saved = Care.buildSubmission(work, empty(), now);
  assert.equal(saved.startTime, '09:00');
  assert.equal(saved.endTime, '09:00');
});

test('task-first summaries retain complete recorded and not-recorded location lists', () => {
  const work = draft();
  const care = Care.sectionById('condos-care');
  const condo = Care.getRecord(work, care.id, 'condo-2', true);
  condo.enriched = true;
  const items = Care.taskSummary(work, empty(), care, care.locations).items;
  assert.deepEqual(items.map(item => item.text), ['Enrichment time', 'Feeding & drinking check']);
  assert.deepEqual(items[0].recordedLocations.map(location => location.id), ['condo-2']);
  assert.deepEqual(items[0].notRecordedLocations.map(location => location.id), ['condo-1']);
  assert.deepEqual(items[1].recordedLocations, []);
  assert.equal(items[1].notRecordedLocations.length, 2);
  const cleaning = Care.sectionById('rooms-cleaning');
  cleaning.locations.forEach(location => { Care.getRecord(work, cleaning.id, location.id, true).tasks['sweep-room'] = true; });
  const sweep = Care.taskSummary(work, empty(), cleaning, cleaning.locations).items.find(item => item.id === 'sweep-room');
  assert.equal(sweep.recordedLocations.length, 9);
  assert.deepEqual(sweep.notRecordedLocations, []);
});

test('dry cleaning, bedding, and setup submit independently without Rescue Cleaner after refresh', () => {
  const steps = {
    'rooms-cleaning': ['litter', 'litter-cubbies', 'tree-toys', 'bowls', 'water-bowls', 'dish-bedding', 'room-bedding', 'sweep-room', 'toys'],
    'condos-cleaning': ['move-cats', 'bedding', 'dishes', 'water-dishes', 'litter', 'levels', 'setup', 'clean-bedding', 'toys', 'return-cats', 'sanitize-hands']
  };
  Object.entries(steps).forEach(([sectionId, taskIds]) => {
    const locationId = sectionId.startsWith('rooms') ? 'room-1' : 'condo-2';
    taskIds.forEach(taskId => {
      const work = draft(); work.name = 'Volunteer';
      Care.getRecord(work, sectionId, locationId, true).tasks[taskId] = true;
      const restored = Care.normalizeDraft(work, date, 'restored');
      const result = Care.contribution(restored, empty(), now);
      assert.deepEqual(result.pending, [], sectionId + ': ' + taskId);
      const saved = Care.buildSubmission(restored, empty(), now);
      assert.equal(saved.entries.length, 1, sectionId + ': ' + taskId);
      assert.equal(saved.entries[0].taskId, taskId);
      assert.equal(saved.entries[0].usedRescueCleaner, null);
    });
  });
});

test('only the selected disinfecting steps appear in Rescue Cleaner prompts, including old combined drafts', () => {
  const steps = {
    'rooms-cleaning': ['cat-tree', 'hallway-glass', 'door-glass', 'sliding-windows', 'walls', 'floor', 'cubbies'],
    'condos-cleaning': ['glass', 'spray-condo', 'disinfect']
  };
  Object.entries(steps).forEach(([sectionId, taskIds]) => {
    assert.deepEqual(Care.sectionById(sectionId).tasks.filter(task => task.rescue).map(task => task.id).sort(), [...taskIds].sort());
    const locationId = sectionId.startsWith('rooms') ? 'room-1' : 'condo-2';
    taskIds.forEach(taskId => {
      const work = draft(); work.name = 'Volunteer';
      const record = Care.getRecord(work, sectionId, locationId, true);
      record.tasks[taskId] = true;
      const result = Care.contribution(work, empty(), now);
      assert.equal(result.entries.length, 0);
      assert.deepEqual(result.pending[0].taskIds, [taskId]);
      assert.ok(result.pending[0].label.includes(Care.sectionById(sectionId).tasks.find(task => task.id === taskId).text));
      record.rescueCleanerUsed = true;
      assert.equal(Care.contribution(work, empty(), now).pending.length, 0);
      assert.equal(Care.buildSubmission(work, empty(), now).entries[0].usedRescueCleaner, true);
    });
  });
  const legacy = Care.normalizeDraft({ name: 'Volunteer', records: { 'rooms-cleaning|room-1': { tasks: { floor: true } } } }, date, 'old');
  const result = Care.contribution(legacy, empty(), now);
  assert.deepEqual(result.entries.map(entry => entry.taskId), ['sweep-room']);
  assert.deepEqual(result.pending[0].taskIds, ['floor']);
  assert.match(result.pending[0].label, /Mop floor/);
  assert.doesNotMatch(result.pending[0].label, /Sweep room/);
});

test('older glass cleaning stays recorded while repeat work needs the current cleaner confirmation', () => {
  const entry = { kind: 'task', sectionId: 'rooms-cleaning', locationId: 'room-1', taskId: 'sliding-windows', usedRescueCleaner: null };
  const old = { careDate: date, taskCatalogVersion: 2, volunteerName: 'Casey', entries: [entry] };
  const oldSnapshot = Care.daySnapshot([old], date);
  assert.equal(oldSnapshot.tasks.get('rooms-cleaning|room-1|sliding-windows').volunteerName, 'Casey');
  assert.equal(Care.daySnapshot([{ ...old, taskCatalogVersion: Care.TASK_CATALOG_VERSION }], date).tasks.size, 0);
  const work = draft();
  Care.getRecord(work, 'rooms-cleaning', 'room-1', true).tasks['sliding-windows'] = true;
  assert.deepEqual(Care.contribution(work, oldSnapshot, now).pending[0].taskIds, ['sliding-windows']);
});

test('a feeding round covers every room and condo without inventing cleaning or enrichment', () => {
  const work = draft(); work.name = 'Feeding volunteer';
  Care.setFeedingRound(work, true, now);
  const restored = Care.normalizeDraft(work, date, 'restore');
  assert.equal(Care.feedingLocations.length, 11);
  assert.equal(restored.locations.rooms.length, 9);
  assert.equal(restored.locations.condos.length, 2);
  assert.deepEqual(restored.selected['rooms-cleaning'], []);
  assert.deepEqual(restored.selected['condos-cleaning'], []);
  const saved = Care.buildSubmission(restored, empty(), new Date('2026-10-07T16:30:00Z'));
  assert.equal(saved.entries.length, 11);
  assert.ok(saved.entries.every(entry => entry.kind === 'feeding-check' && entry.checkedAt === now.toISOString()));
  assert.equal(saved.startTime, '11:30');
  assert.equal(saved.submittedAt, '2026-10-07T16:30:00.000Z');
  const cleared = Care.clearSubmitted(restored, saved, 'second-round');
  assert.ok(Care.feedingLocations.every(location => !Care.getRecord(cleared, location.sectionId, location.id).feeding.checkedAt));
  assert.equal(Care.contribution(cleared, empty(), now).entries.length, 0);
});

test('feeding check times survive refresh and Check all, while repeats get a fresh time', () => {
  const work = draft(); work.name = 'Feeding volunteer';
  const later = new Date('2026-10-07T16:00:00Z');
  Care.setFeedingCheck(work, 'rooms-feeding', 'room-6', true, now);
  Care.setFeedingRound(work, true, later);
  let restored = Care.normalizeDraft(work, date, 'restore');
  let saved = Care.buildSubmission(restored, empty(), later);
  assert.equal(saved.entries.find(entry => entry.locationId === 'room-6').checkedAt, now.toISOString());
  assert.equal(saved.entries.find(entry => entry.locationId === 'condo-2').checkedAt, later.toISOString());
  restored = Care.clearSubmitted(restored, saved, 'repeat');
  Care.setFeedingCheck(restored, 'rooms-feeding', 'room-6', true, later);
  const repeat = Care.buildSubmission(restored, Care.daySnapshot([saved], date), later);
  assert.equal(repeat.entries[0].checkedAt, later.toISOString());
  assert.notEqual(repeat.id, saved.id);
  assert.equal(saved.entries.find(entry => entry.locationId === 'room-6').checkedAt, now.toISOString());
  Care.setFeedingCheck(restored, 'rooms-feeding', 'room-6', false, later);
  assert.equal(Care.getRecord(restored, 'rooms-feeding', 'room-6').feeding.checkedAt, '');
  const invalid = Care.getRecord(restored, 'rooms-feeding', 'room-6', true);
  invalid.feeding.checked = true;
  for (const checkedAt of ['bad-date', '2026-10-06T15:00:00Z', '2026-10-08T15:00:00Z']) {
    invalid.feeding.checkedAt = checkedAt;
    saved = Care.buildSubmission(restored, empty(), later);
    assert.equal(saved.entries[0].checkedAt, later.toISOString());
  }
});

test('Uncheck all leaves exceptions, notes, and optional enrichment intact', () => {
  const work = draft(); work.name = 'Feeding volunteer';
  const condo = Care.getRecord(work, 'condos-care', 'condo-2', true);
  condo.enriched = true;
  condo.exceptions = [{ id: 'drink', catIds: Care.catsFor('condo-2').map(cat => cat.id), issue: 'did-not-drink', other: '', note: '' }];
  Care.getLocationNotes(work, 'condo-2', true).note = 'Check the water bowl.';
  Care.setFeedingRound(work, true, now);
  Care.setFeedingRound(work, false, now);
  const result = Care.contribution(work, empty(), now);
  assert.deepEqual(result.entries.map(entry => entry.kind), ['enrichment', 'feeding-exception', 'note']);
  assert.equal(Care.getLocationNotes(work, 'condo-2').note, 'Check the water bowl.');
  Care.setFeedingCheck(work, 'rooms-cleaning', 'room-1', true, now);
  Care.setFeedingCheck(work, 'rooms-feeding', 'unknown-room', true, now);
  assert.equal(Care.contribution(work, empty(), now).entries.length, 3);
});
