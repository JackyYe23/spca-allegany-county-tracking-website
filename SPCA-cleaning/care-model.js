(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SPCACare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TIME_ZONE = 'America/New_York';
  const SPLIT_TASK_CATALOG_VERSION = 2;
  const TASK_CATALOG_VERSION = 3;
  const roomTasks = [
    { id: 'litter', text: 'Scoop/change litter boxes' },
    { id: 'litter-cubbies', text: 'Sweep litter-box cubbies' },
    { id: 'cubbies', text: 'Wipe cubbies inside and out', rescue: true },
    { id: 'cat-tree', text: 'Clean cat tree', rescue: true },
    { id: 'tree-toys', text: 'Remove toys behind and under cat tree' },
    { id: 'walls', text: 'Clean snot and dirt from walls', rescue: true },
    { id: 'bowls', text: 'Set out clean food bowls' },
    { id: 'water-bowls', text: 'Set out clean water bowls' },
    { id: 'dish-bedding', text: 'Replace bedding under dishes' },
    { id: 'room-bedding', text: 'Replace dirty room blankets' },
    { id: 'sliding-windows', text: 'Clean sliding door windows', rescue: true, rescueSince: 3 },
    { id: 'hallway-glass', text: 'Clean hallway window, both sides', rescue: true, rescueSince: 3 },
    { id: 'door-glass', text: 'Clean room door glass, both sides', rescue: true, rescueSince: 3 },
    { id: 'sweep-room', text: 'Sweep room' },
    { id: 'floor', text: 'Mop floor', rescue: true },
    { id: 'toys', text: 'Return toys and play items to the floor' }
  ];
  const condoTasks = [
    { id: 'move-cats', text: 'Move cats to playroom or hallway for enrichment', note: 'Use the playroom for cats that dislike other cats.' },
    { id: 'bedding', text: 'Remove dirty bedding' },
    { id: 'dishes', text: 'Set out clean food dishes' },
    { id: 'water-dishes', text: 'Set out clean water dishes' },
    { id: 'litter', text: 'Scoop/replace litter box' },
    { id: 'levels', text: 'Sweep each condo level' },
    { id: 'spray-condo', text: 'Spray condo surfaces', rescue: true },
    { id: 'disinfect', text: 'Wipe condo with a washcloth', note: 'Remove stuck-on feces and snot.', rescue: true },
    { id: 'setup', text: 'Return clean litter box to condo' },
    { id: 'clean-bedding', text: 'Add clean bedding' },
    { id: 'toys', text: 'Return toys to condo' },
    { id: 'glass', text: 'Clean both sides of condo door glass', rescue: true, rescueSince: 3 },
    { id: 'return-cats', text: 'Return cats to condo' },
    { id: 'sanitize-hands', text: 'Sanitize hands before next condo' }
  ];
  // Interpret old combined task IDs without rewriting the stored records.
  const legacyTaskGroups = {
    'rooms-cleaning': {
      litter: ['litter', 'litter-cubbies'], 'cat-tree': ['cat-tree', 'tree-toys'],
      bowls: ['bowls', 'water-bowls'], 'hallway-glass': ['hallway-glass', 'door-glass'], floor: ['sweep-room', 'floor']
    },
    'condos-cleaning': {
      dishes: ['dishes', 'water-dishes'], disinfect: ['spray-condo', 'disinfect'],
      setup: ['setup', 'clean-bedding', 'dishes', 'water-dishes', 'toys'], 'return-cats': ['return-cats', 'sanitize-hands']
    }
  };
  const legacyCleanerTasks = { 'rooms-cleaning': ['cubbies', 'cat-tree', 'walls', 'floor'], 'condos-cleaning': ['disinfect'] };
  const isLegacyCatalog = value => !(value.taskCatalogVersion >= SPLIT_TASK_CATALOG_VERSION);
  const taskIdsFor = (sectionId, taskId, legacy) => {
    const group = legacy ? legacyTaskGroups[sectionId]?.[taskId] : null;
    return Array.isArray(group) ? group : [taskId];
  };
  const rooms = Array.from({ length: 8 }, (_, i) => ({ id: 'room-' + (i + 1), name: 'Room ' + (i + 1) })).concat({ id: 'playroom', name: 'Playroom' });
  // These two condos and all cat names are examples until SPCA supplies its roster.
  const condos = [{ id: 'condo-1', name: 'Condo 1' }, { id: 'condo-2', name: 'Condo 2' }];
  const names = [['Luna', 'Milo', 'Nala'], ['Olive', 'Leo'], ['Willow', 'Jasper'], ['Cleo', 'Finn'], ['Hazel', 'Ziggy'], ['Poppy', 'Theo', 'Juniper', 'Benny', 'Misty', 'Nova', 'Peaches', 'Otis', 'Ruby', 'Simba', 'Tilly', 'Winnie'], ['Pearl', 'Oscar'], ['Maple', 'Archie'], ['Mochi', 'Pip'], ['Coco'], ['Sunny']];
  const cats = rooms.concat(condos).flatMap((location, index) => names[index].map((name, position) => ({ id: 'sample-' + location.id + '-' + position, name, locationId: location.id, sample: true })));
  const sections = [
    { id: 'rooms-cleaning', name: 'Rooms cleaning', kind: 'cleaning', locations: rooms, tasks: roomTasks, description: 'Daily cleaning for Rooms 1–8 and Playroom' },
    { id: 'rooms-feeding', name: 'Rooms feeding', kind: 'care', locations: rooms, tasks: [], description: 'Feeding and drinking checks for the rooms' },
    { id: 'condos-cleaning', name: 'Condos cleaning', kind: 'cleaning', locations: condos, tasks: condoTasks, description: 'Daily cleaning for the sample condos' },
    { id: 'condos-care', name: 'Condos care', kind: 'care', enrichment: true, locations: condos, tasks: [], description: 'Feeding, drinking, and enrichment checks' }
  ];
  const feedingLocations = sections.filter(section => section.kind === 'care').flatMap(section => section.locations.map(location => ({ ...location, sectionId: section.id })));
  const issues = [{ id: 'did-not-eat', name: 'Did not eat' }, { id: 'ate-some', name: 'Ate some' }, { id: 'did-not-drink', name: 'Did not drink' }, { id: 'other', name: 'Other' }];
  const categories = ['medical', 'behavioral', 'other'];
  const sectionById = id => sections.find(section => section.id === id);
  const catsFor = id => cats.filter(cat => cat.locationId === id);
  const key = (...parts) => parts.join('|');
  const unique = items => Array.from(new Set(items));
  const text = value => typeof value === 'string' ? value : '';
  const clone = value => JSON.parse(JSON.stringify(value));

  function localDate(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const part = type => parts.find(item => item.type === type).value;
    return part('year') + '-' + part('month') + '-' + part('day');
  }
  function localTime(now = new Date()) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  }
  const validTime = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  function entryDateError(draft, now = new Date()) {
    return draft.date === localDate(now) ? '' : 'Care date must be today.';
  }
  function startTimeError(draft, now = new Date()) {
    if (!draft.startTime) return '';
    if (!validTime(draft.startTime)) return 'Enter a valid start time.';
    return draft.date === localDate(now) && draft.startTime > localTime(now) ? 'Start time cannot be later than the current time.' : '';
  }
  function endTimeError(draft, now = new Date()) {
    if (!draft.endTime) return '';
    if (!validTime(draft.endTime)) return 'Enter a valid end time.';
    const today = localDate(now);
    if (draft.date > today || (draft.date === today && draft.endTime > localTime(now))) return 'End time cannot be later than the current time.';
    return validTime(draft.startTime) && draft.endTime < draft.startTime ? 'End time cannot be earlier than start time.' : '';
  }
  function createRecord() {
    return { tasks: {}, cleaner: {}, rescueCleanerUsed: false, feeding: { checked: false, scope: 'all', catIds: [], checkedAt: '' }, enriched: false, exceptions: [], note: '', categories: [], flagged: false };
  }
  function createDraft(date, id) {
    return { date, taskCatalogVersion: TASK_CATALOG_VERSION, contributionId: id, name: '', startTime: '', endTime: '', locations: { rooms: [], condos: [] }, selected: Object.fromEntries(sections.map(section => [section.id, []])), records: {} };
  }
  function getRecord(draft, sectionId, locationId, create = false) {
    const recordKey = key(sectionId, locationId);
    if (create && !draft.records[recordKey]) draft.records[recordKey] = createRecord();
    return draft.records[recordKey] || createRecord();
  }
  function setFeedingCheck(draft, sectionId, locationId, checked, now = new Date()) {
    const location = feedingLocations.find(location => location.id === locationId && location.sectionId === sectionId);
    if (!location || !catsFor(locationId).length) return;
    const record = getRecord(draft, sectionId, locationId, true);
    record.feeding = checked
      ? { checked: true, scope: 'all', catIds: [], checkedAt: now.toISOString() }
      : { ...record.feeding, checked: false, checkedAt: '' };
    if (checked) {
      const group = sectionId.startsWith('rooms') ? 'rooms' : 'condos';
      const catalog = group === 'rooms' ? rooms : condos;
      draft.locations[group] = catalog.filter(item => item.id === locationId || draft.locations[group].includes(item.id)).map(item => item.id);
      draft.selected[sectionId] = catalog.filter(item => item.id === locationId || draft.selected[sectionId].includes(item.id)).map(item => item.id);
      if (!draft.startTime) draft.startTime = localTime(now);
    }
  }
  function setFeedingRound(draft, checked, now = new Date()) {
    feedingLocations.forEach(location => {
      const record = getRecord(draft, location.sectionId, location.id);
      if (checked && record.feeding.checked && checkedCats(record, location.id).length === catsFor(location.id).length) return;
      setFeedingCheck(draft, location.sectionId, location.id, checked, now);
    });
  }
  function getLocationNotes(draft, locationId, create = false) {
    const locationSections = sections.filter(section => section.locations.some(location => location.id === locationId));
    const records = locationSections.map(section => getRecord(draft, section.id, locationId));
    const notes = {
      note: unique(records.map(record => record.note).filter(note => note.trim())).join('\n\n'),
      categories: unique(records.flatMap(record => record.categories)),
      flagged: records.some(record => record.flagged)
    };
    if (!create || !locationSections.length) return notes;
    // Store the shared note once; keep all cleaning and feeding answers intact.
    records.forEach(record => { record.note = ''; record.categories = []; record.flagged = false; });
    return Object.assign(getRecord(draft, locationSections[0].id, locationId, true), notes);
  }
  function normalizeDraft(value, date, id) {
    const draft = createDraft(date, id);
    if (!value || typeof value !== 'object') return draft;
    draft.contributionId = text(value.contributionId) || id;
    draft.name = text(value.name).slice(0, 100);
    draft.startTime = /^\d{2}:\d{2}$/.test(value.startTime || '') ? value.startTime : '';
    draft.endTime = /^\d{2}:\d{2}$/.test(value.endTime || '') ? value.endTime : '';
    sections.forEach(section => {
      const locationIds = section.locations.map(location => location.id);
      draft.selected[section.id] = unique((Array.isArray(value.selected?.[section.id]) ? value.selected[section.id] : []).filter(id => locationIds.includes(id)));
      section.locations.forEach(location => {
        const source = value.records?.[key(section.id, location.id)];
        if (!source || typeof source !== 'object') return;
        const record = createRecord();
        record.rescueCleanerUsed = source.rescueCleanerUsed === true;
        section.tasks.forEach(task => { record.tasks[task.id] = false; record.cleaner[task.id] = false; });
        Object.entries(source.tasks || {}).forEach(([sourceId, selected]) => {
          if (selected !== true) return;
          taskIdsFor(section.id, sourceId, isLegacyCatalog(value)).forEach(taskId => {
            if (!section.tasks.some(task => task.id === taskId)) return;
            record.tasks[taskId] = true;
            if (source.cleaner?.[sourceId] === true) record.cleaner[taskId] = true;
          });
        });
        const rosterIds = catsFor(location.id).map(cat => cat.id);
        record.feeding = { checked: source.feeding?.checked === true, scope: source.feeding?.scope === 'selected' ? 'selected' : 'all', catIds: unique((Array.isArray(source.feeding?.catIds) ? source.feeding.catIds : []).filter(id => rosterIds.includes(id))), checkedAt: source.feeding?.checked === true && Number.isFinite(Date.parse(source.feeding?.checkedAt)) ? source.feeding.checkedAt : '' };
        record.enriched = source.enriched === true;
        record.exceptions = (Array.isArray(source.exceptions) ? source.exceptions : []).filter(item => item && typeof item === 'object').map((item, index) => ({ id: text(item.id) || 'restored-' + index, catIds: unique((Array.isArray(item.catIds) ? item.catIds : []).filter(id => rosterIds.includes(id))), issue: issues.some(issue => issue.id === item.issue) ? item.issue : '', other: text(item.other).slice(0, 500), note: text(item.note).slice(0, 1000) }));
        record.note = text(source.note).slice(0, 5000);
        record.categories = unique((Array.isArray(source.categories) ? source.categories : []).filter(category => categories.includes(category)));
        record.flagged = source.flagged === true;
        draft.records[key(section.id, location.id)] = record;
      });
    });
    ['rooms', 'condos'].forEach(group => {
      const catalog = group === 'rooms' ? rooms : condos;
      const workSections = sections.filter(section => section.id.startsWith(group + '-'));
      const explicitLocations = Array.isArray(value.locations?.[group]);
      if (!explicitLocations) workSections.forEach(section => {
        draft.selected[section.id] = catalog.filter(location => draft.selected[section.id].includes(location.id) || recordHasWork(getRecord(draft, section.id, location.id))).map(location => location.id);
      });
      const ids = explicitLocations ? value.locations[group] : workSections.flatMap(section => draft.selected[section.id]);
      draft.locations[group] = catalog.filter(location => ids.includes(location.id)).map(location => location.id);
    });
    return draft;
  }
  function taskComplete(record, task) { return record.tasks[task.id] === true && (!task.rescue || record.rescueCleanerUsed === true || record.cleaner[task.id] === true); }
  function exceptionValid(exception, locationId) {
    return exception.catIds.some(id => catsFor(locationId).some(cat => cat.id === id)) && issues.some(issue => issue.id === exception.issue) && (exception.issue !== 'other' || !!exception.other.trim());
  }
  function checkedCats(record, locationId) {
    if (!record.feeding.checked) return [];
    const roster = catsFor(locationId).map(cat => cat.id);
    return record.feeding.scope === 'selected' ? unique(record.feeding.catIds.filter(id => roster.includes(id))) : roster;
  }
  function daySnapshot(submissions, date) {
    const snapshot = { tasks: new Map(), checkedCats: new Map(), feeding: new Map(), enrichment: new Map(), exceptions: new Map() };
    const rememberLatest = (map, key, meta) => {
      const previous = map.get(key);
      if (!previous || (Date.parse(meta.submittedAt) || 0) >= (Date.parse(previous.submittedAt) || 0)) map.set(key, meta);
    };
    (Array.isArray(submissions) ? submissions : []).filter(item => item && item.careDate === date && Array.isArray(item.entries)).forEach(submission => {
      submission.entries.forEach(entry => {
        if (!entry || typeof entry !== 'object') return;
        const section = sectionById(entry.sectionId);
        if (!section || !section.locations.some(location => location.id === entry.locationId)) return;
        const entryKey = key(section.id, entry.locationId);
        const meta = { ...entry, volunteerName: submission.volunteerName, submittedAt: submission.submittedAt };
        if (entry.kind === 'task') {
          const legacy = isLegacyCatalog(submission);
          const unconfirmedLegacy = legacy && legacyCleanerTasks[section.id]?.includes(entry.taskId) && entry.usedRescueCleaner !== true;
          if (!unconfirmedLegacy) taskIdsFor(section.id, entry.taskId, legacy).forEach(taskId => {
            const task = section.tasks.find(task => task.id === taskId);
            // Keep work saved before the glass-cleaning requirement in the history.
            const requiresCleaner = task?.rescue && (!task.rescueSince || submission.taskCatalogVersion >= task.rescueSince);
            if (!task || (requiresCleaner && entry.usedRescueCleaner !== true)) return;
            rememberLatest(snapshot.tasks, key(entryKey, taskId), { ...meta, taskId });
          });
        }
        if (entry.kind === 'feeding-check') {
          const ids = new Set(snapshot.checkedCats.get(entryKey) || []);
          const catIds = (Array.isArray(entry.catIds) ? entry.catIds : []).filter(id => catsFor(entry.locationId).some(cat => cat.id === id));
          catIds.forEach(id => ids.add(id));
          snapshot.checkedCats.set(entryKey, ids);
          if (catIds.length) rememberLatest(snapshot.feeding, entryKey, meta);
        }
        if (entry.kind === 'enrichment' && section.enrichment) rememberLatest(snapshot.enrichment, entryKey, meta);
        if (entry.kind === 'feeding-exception' && section.kind === 'care' && issues.some(issue => issue.id === entry.issue)) {
          const catName = text(entry.catName) || catsFor(entry.locationId).find(cat => cat.id === entry.catId)?.name;
          if (catName) {
            const exception = { ...meta, catName, otherDetails: text(entry.otherDetails), note: text(entry.note) };
            rememberLatest(snapshot.exceptions, key(entryKey, entry.catId, entry.issue, exception.otherDetails, exception.note), exception);
          }
        }
      });
    });
    return snapshot;
  }
  function feedingExceptionSummary(draft, snapshot, section, locations) {
    if (section.kind !== 'care') return [];
    const rows = new Map();
    const include = row => rows.set(key(row.locationId, row.catId, row.issue, row.otherDetails, row.note), row);
    Array.from(snapshot.exceptions?.values() || []).filter(row => row.sectionId === section.id && locations.some(location => location.id === row.locationId)).forEach(include);
    locations.forEach(location => {
      getRecord(draft, section.id, location.id).exceptions.filter(exception => exceptionValid(exception, location.id)).forEach(exception => {
        unique(exception.catIds).forEach(catId => {
          const cat = catsFor(location.id).find(cat => cat.id === catId);
          if (cat) include({ sectionId: section.id, locationId: location.id, catId, catName: cat.name, issue: exception.issue, otherDetails: exception.issue === 'other' ? exception.other.trim() : '', note: exception.note.trim() });
        });
      });
    });
    return Array.from(rows.values()).sort((a, b) => locations.findIndex(location => location.id === a.locationId) - locations.findIndex(location => location.id === b.locationId) || a.catName.localeCompare(b.catName, 'en', { sensitivity: 'base' }) || a.issue.localeCompare(b.issue));
  }
  function taskStatus(draft, snapshot, section, locationId, task) {
    const saved = snapshot.tasks.get(key(section.id, locationId, task.id));
    return { saved, complete: !!saved || taskComplete(getRecord(draft, section.id, locationId), task) };
  }
  function reviewedCats(draft, snapshot, sectionId, locationId) {
    return unique([...(snapshot.checkedCats.get(key(sectionId, locationId)) || []), ...checkedCats(getRecord(draft, sectionId, locationId), locationId)]);
  }
  function careComplete(draft, snapshot, section, locationId, type) {
    if (type === 'enrichment') return !!snapshot.enrichment.get(key(section.id, locationId)) || getRecord(draft, section.id, locationId).enriched;
    const roster = catsFor(locationId);
    return roster.length > 0 && reviewedCats(draft, snapshot, section.id, locationId).length === roster.length;
  }
  function percent(draft, snapshot, section) {
    let done = 0;
    const total = section.locations.length * (section.kind === 'cleaning' ? section.tasks.length : section.enrichment ? 2 : 1);
    section.locations.forEach(location => {
      if (section.kind === 'cleaning') done += section.tasks.filter(task => taskStatus(draft, snapshot, section, location.id, task).complete).length;
      else {
        const roster = catsFor(location.id);
        done += roster.length ? reviewedCats(draft, snapshot, section.id, location.id).length / roster.length : 0;
        if (section.enrichment) done += Number(careComplete(draft, snapshot, section, location.id, 'enrichment'));
      }
    });
    return !total ? 0 : done >= total ? 100 : Math.min(99, Math.round(100 * done / total));
  }
  function recordHasWork(record) {
    return Object.values(record.tasks).some(Boolean) || record.feeding.checked || record.enriched || record.exceptions.length > 0 || !!record.note.trim();
  }
  function scopeLocations(draft, section) {
    return section.locations.filter(location => draft.selected[section.id].includes(location.id) || recordHasWork(getRecord(draft, section.id, location.id)));
  }
  function taskSummary(draft, snapshot, section, locations) {
    const types = section.kind === 'cleaning' ? section.tasks : [{ id: 'feeding', text: 'Feeding & drinking check' }].concat(section.enrichment ? [{ id: 'enrichment', text: 'Enrichment time' }] : []);
    const recorded = [], remaining = [], items = [];
    types.slice().sort((a, b) => a.text.localeCompare(b.text, 'en', { sensitivity: 'base' })).forEach(task => {
      const done = locations.filter(location => section.kind === 'cleaning' ? taskStatus(draft, snapshot, section, location.id, task).complete : careComplete(draft, snapshot, section, location.id, task.id));
      const left = locations.filter(location => !done.includes(location));
      items.push({ id: task.id, text: task.text, recordedLocations: done, notRecordedLocations: left });
      if (done.length) recorded.push({ id: task.id, text: task.text, locations: done.length === locations.length ? [] : done });
      if (left.length) remaining.push({ id: task.id, text: task.text, locations: left.length === locations.length ? [] : left });
    });
    return { recorded, remaining, items };
  }
  // A new contribution follows explicit draft selections, even when the same work was recorded earlier.
  function contribution(draft, _snapshot, now = new Date()) {
    const entries = [], pending = [];
    sections.forEach(section => section.locations.forEach(location => {
      const record = getRecord(draft, section.id, location.id);
      const base = { sectionId: section.id, locationId: location.id };
      const cleanerTasks = [];
      section.tasks.forEach(task => {
        if (taskComplete(record, task)) entries.push({ ...base, kind: 'task', taskId: task.id, usedRescueCleaner: task.rescue ? true : null });
        else if (record.tasks[task.id]) cleanerTasks.push(task.id);
      });
      if (cleanerTasks.length) {
        const names = section.tasks.filter(task => cleanerTasks.includes(task.id)).map(task => task.text).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
        pending.push({ ...base, type: 'cleaner', taskIds: cleanerTasks, label: location.name + ': confirm Rescue Cleaner use for ' + names.join('; ') + '.' });
      }
      if (section.kind === 'care') {
        const catIds = checkedCats(record, location.id);
        const checkTime = new Date(record.feeding.checkedAt);
        const checkedAt = Number.isFinite(checkTime.getTime()) && checkTime <= now && localDate(checkTime) === draft.date ? checkTime.toISOString() : now.toISOString();
        if (catIds.length) entries.push({ ...base, kind: 'feeding-check', scope: record.feeding.scope, catIds, rosterSnapshot: catsFor(location.id).map(cat => ({ id: cat.id, name: cat.name })), checkedAt });
        else if (record.feeding.checked && !checkedCats(record, location.id).length) pending.push({ ...base, type: 'feeding', label: location.name + ': select the cats you checked' });
        if (section.enrichment && record.enriched) entries.push({ ...base, kind: 'enrichment' });
        record.exceptions.forEach(exception => {
          if (!exceptionValid(exception, location.id)) { pending.push({ ...base, type: 'exception', label: location.name + ': finish a feeding exception' }); return; }
          unique(exception.catIds).filter(id => catsFor(location.id).some(cat => cat.id === id)).forEach(catId => entries.push({ ...base, kind: 'feeding-exception', sourceId: exception.id, catId, catName: cats.find(cat => cat.id === catId).name, issue: exception.issue, otherDetails: exception.issue === 'other' ? exception.other.trim() : '', note: exception.note.trim() }));
        });
      }
    }));
    rooms.concat(condos).forEach(location => {
      const notes = getLocationNotes(draft, location.id);
      if (!notes.note.trim()) return;
      const section = sections.find(section => section.locations.some(item => item.id === location.id));
      entries.push({ sectionId: section.id, locationId: location.id, kind: 'note', scope: 'location', text: notes.note.trim(), categories: notes.categories, flaggedForManagement: notes.flagged });
    });
    return { entries, pending };
  }
  function buildSubmission(draft, snapshot, now = new Date()) {
    const result = contribution(draft, snapshot, now);
    if (!draft.name.trim() || !result.entries.length) throw new Error('Enter your name and record some work.');
    const entryError = entryDateError(draft, now) || startTimeError(draft, now) || endTimeError(draft, now);
    if (entryError) throw new Error(entryError);
    const endTime = draft.endTime || localTime(now);
    return { schemaVersion: 1, taskCatalogVersion: TASK_CATALOG_VERSION, id: draft.contributionId, careDate: draft.date, timeZone: TIME_ZONE, volunteerName: draft.name.trim(), startTime: draft.startTime || endTime, endTime, submittedAt: now.toISOString(), sampleRoster: true, savedOnDeviceOnly: true, entries: result.entries };
  }
  function clearSubmitted(draft, submission, nextId) {
    const next = clone(draft);
    submission.entries.forEach(entry => {
      if (!entry || !sectionById(entry.sectionId)?.locations.some(location => location.id === entry.locationId)) return;
      const record = getRecord(next, entry.sectionId, entry.locationId, true);
      if (entry.kind === 'task') taskIdsFor(entry.sectionId, entry.taskId, isLegacyCatalog(submission)).forEach(taskId => { delete record.tasks[taskId]; delete record.cleaner[taskId]; });
      if (entry.kind === 'feeding-check') record.feeding = { checked: false, scope: 'all', catIds: [], checkedAt: '' };
      if (entry.kind === 'enrichment') record.enriched = false;
      if (entry.kind === 'feeding-exception') record.exceptions = record.exceptions.filter(exception => exception.id !== entry.sourceId);
      if (entry.kind === 'note') {
        const noteRecords = entry.scope === 'location' ? sections.filter(section => section.locations.some(location => location.id === entry.locationId)).map(section => getRecord(next, section.id, entry.locationId)) : [record];
        noteRecords.forEach(item => { item.note = ''; item.categories = []; item.flagged = false; });
      }
    });
    sections.filter(section => section.kind === 'cleaning').forEach(section => section.locations.forEach(location => {
      const record = next.records[key(section.id, location.id)];
      if (record && !section.tasks.some(task => task.rescue && record.tasks[task.id])) record.rescueCleanerUsed = false;
    }));
    next.contributionId = nextId;
    next.endTime = '';
    return next;
  }
  return { TIME_ZONE, TASK_CATALOG_VERSION, rooms, condos, cats, sections, feedingLocations, issues, categories, key, sectionById, catsFor, localDate, localTime, entryDateError, startTimeError, endTimeError, createDraft, createRecord, getRecord, setFeedingCheck, setFeedingRound, getLocationNotes, normalizeDraft, taskComplete, exceptionValid, checkedCats, daySnapshot, feedingExceptionSummary, taskStatus, reviewedCats, careComplete, percent, recordHasWork, scopeLocations, taskSummary, contribution, buildSubmission, clearSubmitted };
});
