(async () => {
  'use strict';
  const Care = window.SPCACare;
  const app = document.getElementById('app');
  const storageStatus = document.getElementById('storage-status');
  const dialog = document.getElementById('pending-dialog');
  const DRAFT_KEY = 'spca.care.drafts.v1';
  const RECORD_KEY = 'spca.care.records.v1';
  const uid = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const checked = value => value ? ' checked' : '';
  const disabled = value => value ? ' disabled' : '';
  let storageWarning = '';
  function readStorage(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (_) { storageWarning = 'Saved data could not be opened. Your current work can still be entered, but check device storage before submitting.'; return fallback; }
  }
  let drafts = readStorage(DRAFT_KEY, {});
  if (!drafts || typeof drafts !== 'object' || Array.isArray(drafts)) drafts = {};
  let submissions = readStorage(RECORD_KEY, []);
  if (!Array.isArray(submissions)) submissions = [];
  let databaseMode = 'browser';
  async function databaseRequest(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(path, { ...options, cache: 'no-store', signal: controller.signal });
      if (response.status === 404 && path === '/api/records' && !options.method) return null;
      if (!response.ok) throw new Error('Local record file is unavailable.');
      const value = await response.json();
      if (!Array.isArray(value.records)) throw new Error('Unexpected local record format.');
      return value.records;
    } finally { clearTimeout(timeout); }
  }
  if (!window.SPCA_FEEDING_PREVIEW && typeof window.fetch === 'function') {
    try {
      let records = await databaseRequest('/api/records');
      if (records) {
        databaseMode = 'database';
        const existingIds = new Set(records.map(record => record.id));
        const missing = submissions.filter(record => record && !existingIds.has(record.id));
        if (missing.length) records = await databaseRequest('/api/records/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: missing }) });
        submissions = records;
        try { localStorage.setItem(RECORD_KEY, JSON.stringify(records)); } catch (_) { /* The local database remains authoritative. */ }
      }
    } catch (_) {
      databaseMode = 'unavailable';
      storageWarning = 'Could not open the local record file. Your browser draft is still here; try submitting again when the preview server is available.';
    }
  }
  function restoreDraft(date) {
    const restored = Care.normalizeDraft(drafts[date], date, uid());
    // A saved record is authoritative if saving succeeded before draft cleanup.
    const previousSave = submissions.find(submission => submission?.id === restored.contributionId && Array.isArray(submission.entries));
    return previousSave ? Care.clearSubmitted(restored, previousSave, uid()) : restored;
  }
  let sessionDay = Care.localDate();
  let draft = restoreDraft(sessionDay);
  let snapshot = Care.daySnapshot(submissions, draft.date);
  const requestedDesign = new URLSearchParams(location.search).get('design');
  const initialDesign = ['v2', 'v3'].includes(requestedDesign) ? requestedDesign : 'v1';
  const ui = { design: initialDesign, section: initialDesign === 'v3' ? 'round' : '', openLocation: {}, roundOpen: '', homeTasks: '', overviewDate: draft.date, notes: {}, searches: {}, saving: false, nameMissing: false, noticeFocus: '' };
  const desktopOverview = window.matchMedia('(min-width: 761px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let overviewTransition;
  let roundReadingPoint;
  let roundViewport;

  function warn(message) { storageWarning = message; storageStatus.textContent = message; }
  function persistDraft() {
    drafts[draft.date] = draft;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)); }
    catch (_) { warn('Your draft could not be saved on this device. Keep this page open; your entries are still here.'); }
  }
  const recordFor = (locationId, sectionId) => Care.getRecord(draft, sectionId, locationId, true);
  const locationName = id => Care.rooms.concat(Care.condos).find(location => location.id === id)?.name || id;
  const result = () => Care.contribution(draft, snapshot);
  const locationsFor = group => group === 'rooms' ? Care.rooms : Care.condos;
  const sectionsFor = group => Care.sections.filter(section => section.id.startsWith(group + '-'));
  const workName = section => section.kind === 'cleaning' ? 'Cleaning' : section.enrichment ? 'Feeding & enrichment' : 'Feeding & drinking';

  const navigationGroup = () => ['round', 'overview', 'rooms', 'condos'].includes(ui.section) ? ui.section : '';
  function navigation() {
    const choices = ui.design === 'v3'
      ? [{ id: 'overview', name: 'Task summary' }, { id: 'round', name: 'Feeding round' }, { id: 'rooms', name: 'Rooms' }, { id: 'condos', name: 'Condos' }]
      : [{ id: 'overview', name: 'Task summary' }, { id: 'rooms', name: 'Rooms' }, { id: 'condos', name: 'Condos' }];
    return '<nav class="main-navigation" aria-label="Care navigation">' + choices.map(choice => '<button type="button" class="navigation-button" id="nav-' + choice.id + '" data-action="section" data-section="' + choice.id + '" aria-expanded="' + (navigationGroup() === choice.id) + '" aria-controls="work-view"' + (navigationGroup() === choice.id ? ' aria-current="page"' : '') + '>' + choice.name + '</button>').join('') + '</nav>';
  }
  function selectRoundLocation(locationId) {
    const location = Care.feedingLocations.find(location => location.id === locationId);
    if (!location) return;
    const group = location.sectionId.startsWith('rooms') ? 'rooms' : 'condos';
    const catalog = locationsFor(group);
    draft.locations[group] = catalog.filter(item => item.id === locationId || draft.locations[group].includes(item.id)).map(item => item.id);
    draft.selected[location.sectionId] = catalog.filter(item => item.id === locationId || draft.selected[location.sectionId].includes(item.id)).map(item => item.id);
  }
  function feedingRound() {
    return '<section class="feeding-round" aria-labelledby="feeding-round-title"><div class="round-heading"><h2 id="feeding-round-title">Feeding round</h2><div class="button-row"><button type="button" data-action="round-check-all">Check all</button><button type="button" data-action="round-uncheck-all">Uncheck all</button></div></div>' + ['rooms', 'condos'].map(group => '<section class="round-group" aria-labelledby="round-' + group + '-title"><h3 id="round-' + group + '-title">' + (group === 'rooms' ? 'Rooms' : 'Condos') + '</h3><div class="feeding-stops">' + Care.feedingLocations.filter(location => location.sectionId.startsWith(group + '-')).map(feedingStop).join('') + '</div></section>').join('') + '</section>' + submitArea();
  }
  function feedingStop(location) {
    const section = Care.sectionById(location.sectionId);
    const record = Care.getRecord(draft, section.id, location.id);
    const entryKey = Care.key(section.id, location.id);
    const saved = snapshot.feeding.get(entryKey);
    const complete = Care.catsFor(location.id).every(cat => (snapshot.checkedCats.get(entryKey) || new Set()).has(cat.id));
    const checkedInDraft = record.feeding.checked && Care.checkedCats(record, location.id).length === Care.catsFor(location.id).length;
    const open = ui.roundOpen === location.id;
    const checkId = 'round-feeding-' + location.id;
    const alerts = Care.feedingExceptionSummary(draft, snapshot, section, [location]);
    const history = saved ? completionDetails({ ...saved, submittedAt: saved.checkedAt || saved.submittedAt }, checkId, 'Last checked') : '';
    const enrichmentSaved = snapshot.enrichment.get(entryKey);
    const enrichment = section.enrichment ? '<div class="round-enrichment"><h4>Enrichment</h4><label class="check-label" for="round-enrichment-' + location.id + '"><input type="checkbox" id="round-enrichment-' + location.id + '" data-field="enrichment" data-location="' + location.id + '"' + checked(record.enriched) + '>Cats received enrichment time</label>' + completionDetails(enrichmentSaved, 'round-enrichment-' + location.id) + '</div>' : '';
    return '<article class="feeding-stop' + (complete ? ' is-complete' : '') + (checkedInDraft ? ' is-draft' : '') + '" id="stop-' + location.id + '" data-work-section="' + section.id + '" aria-labelledby="stop-title-' + location.id + '"><div class="feeding-stop-heading"><h4 id="stop-title-' + location.id + '">' + escape(location.name) + '</h4>' + (checkedInDraft ? '<span class="round-entry-status">Not submitted</span>' : '') + '</div><div class="feeding-stop-actions"><label class="check-label round-feeding-check" for="' + checkId + '"><input type="checkbox" id="' + checkId + '" data-field="feeding" data-location="' + location.id + '"' + checked(checkedInDraft) + (saved ? ' aria-describedby="recorded-' + checkId + '"' : '') + '>Feeding &amp; drinking checked</label><button type="button" class="round-detail-toggle" id="round-details-' + location.id + '" data-action="round-details" data-location="' + location.id + '" aria-label="Exceptions and notes for ' + escape(location.name) + '" aria-expanded="' + open + '" aria-controls="round-detail-body-' + location.id + '"><span>Exceptions &amp; notes' + (record.exceptions.length ? ' (' + record.exceptions.length + ')' : '') + '</span><span aria-hidden="true">' + (open ? '−' : '+') + '</span></button></div>' + history + (alerts.length ? '<ul class="round-alerts" aria-label="' + escape(location.name) + ' feeding exceptions">' + alerts.map(alert => '<li>' + escape(alert.catName) + ' — ' + escape(Care.issues.find(issue => issue.id === alert.issue)?.name || alert.issue) + '</li>').join('') + '</ul>' : '') + '<div class="feeding-stop-details" id="round-detail-body-' + location.id + '"' + (open ? '' : ' hidden') + '><button type="button" id="round-add-exception-' + location.id + '" data-action="add-exception" data-location="' + location.id + '">+ Add feeding exception</button>' + record.exceptions.map((exception, index) => exceptionForm(location.id, exception, index)).join('') + enrichment + notes(location.id, Care.getLocationNotes(draft, location.id)) + '</div></article>';
  }
  function sectionChoices(group, locationId) {
    return '<div class="care-choices" role="group" aria-label="' + escape(locationName(locationId)) + ' work choices">' + sectionsFor(group).map(section => '<button type="button" class="care-choice" id="work-' + section.id + '-' + locationId + '" data-action="work-toggle" data-section="' + section.id + '" data-location="' + locationId + '" aria-label="' + escape(workName(section) + ' for ' + locationName(locationId)) + '" aria-pressed="' + draft.selected[section.id].includes(locationId) + '" aria-controls="work-panel-' + section.id + '-' + locationId + '"><span class="choice-checkbox" aria-hidden="true"></span><span class="care-choice-label">' + (section.kind === 'cleaning' ? 'Cleaning' : 'Feeding') + '</span></button>').join('') + '</div>';
  }
  function compactLocations(locations) {
    const groups = [];
    const numbered = new Map();
    locations.forEach(location => {
      const match = /^(Room|Condo) (\d+)$/.exec(location.name);
      if (!match) { groups.push({ name: location.name }); return; }
      if (!numbered.has(match[1])) {
        const group = { prefix: match[1], numbers: [] };
        numbered.set(match[1], group);
        groups.push(group);
      }
      numbered.get(match[1]).numbers.push(Number(match[2]));
    });
    return groups.map(group => group.prefix ? group.prefix + ' ' + group.numbers.sort((a, b) => a - b).join(', ') : group.name).join(', ');
  }
  function summary(section, locations, id, showTitle, view) {
    const grouped = Care.taskSummary(view.draft, view.snapshot, section, locations);
    const list = (rows, empty, showLocations = false) => rows.length ? '<ul>' + rows.map(row => '<li>' + escape(row.text) + (showLocations && row.locations.length ? '<small>' + escape(compactLocations(row.locations)) + '</small>' : '') + '</li>').join('') + '</ul>' : '<p>' + empty + '</p>';
    const tasks = section.kind === 'cleaning'
      ? '<div class="summary-columns"><div><h4>Recorded</h4>' + list(grouped.recorded, 'Nothing recorded yet.', true) + '</div><div><h4>Still to do</h4>' + list(grouped.remaining, 'All checks recorded.') + '</div></div>'
      : '<div class="summary-task-list">' + grouped.items.map(item => '<section class="summary-task" data-summary-task="' + item.id + '" aria-labelledby="' + id + '-' + item.id + '"><h4 id="' + id + '-' + item.id + '">' + escape(item.text) + '</h4><p class="summary-location-line"><span>Recorded: </span>' + escape(compactLocations(item.recordedLocations) || 'None') + '</p></section>').join('') + '</div>';
    const exceptionList = section.kind === 'care' ? summaryExceptions(id, Care.feedingExceptionSummary(view.draft, view.snapshot, section, locations)) : '';
    return '<aside class="task-summary" id="' + id + '" aria-label="' + escape(section.name) + ' task summary">' + (showTitle ? '<h3 class="summary-title">' + escape(section.name) + '</h3>' : '') + tasks + exceptionList + '</aside>';
  }
  function summaryExceptions(id, exceptions) {
    const groups = new Map();
    exceptions.forEach(row => {
      const reason = Care.issues.find(issue => issue.id === row.issue)?.name || row.issue;
      const label = row.otherDetails ? reason + ': ' + row.otherDetails : reason;
      if (!groups.has(label)) groups.set(label, new Map());
      const cats = groups.get(label);
      const catKey = Care.key(row.catId || row.catName, row.locationId);
      if (!cats.has(catKey)) cats.set(catKey, { ...row, notes: new Set() });
      if (row.note) cats.get(catKey).notes.add(row.note);
    });
    const rows = Array.from(groups, ([reason, cats]) => {
      const entries = Array.from(cats.values()).sort((a, b) => a.catName.localeCompare(b.catName, 'en', { sensitivity: 'base' }));
      const catLabel = cat => entries.filter(item => item.catName.toLowerCase() === cat.catName.toLowerCase()).length > 1
        ? cat.catName + ' (' + locationName(cat.locationId) + ')' : cat.catName;
      const names = entries.map(catLabel).join(', ');
      const notes = entries.flatMap(cat => Array.from(cat.notes, note => '<li><strong>' + escape(catLabel(cat)) + '</strong> — ' + escape(note) + '</li>'));
      return '<li><strong>' + escape(reason) + '</strong> — ' + escape(names) +
        (notes.length ? '<ul class="summary-exception-notes">' + notes.join('') + '</ul>' : '') + '</li>';
    });
    return '<section class="summary-exceptions" aria-labelledby="' + id + '-exceptions"><h4 id="' + id + '-exceptions">Feeding exceptions</h4>' +
      (rows.length ? '<ul>' + rows.join('') + '</ul>' : '<p>No feeding exceptions.</p>') + '</section>';
  }
  function overview() {
    const view = {
      draft: ui.overviewDate === draft.date ? draft : Care.normalizeDraft(drafts[ui.overviewDate], ui.overviewDate, 'overview'),
      snapshot: ui.overviewDate === draft.date ? snapshot : Care.daySnapshot(submissions, ui.overviewDate)
    };
    const activeTasks = Care.sectionById(ui.homeTasks);
    const sideTasks = desktopOverview.matches && activeTasks;
    return '<section class="overview"><div class="overview-heading"><h2>Task summary</h2><label class="field overview-date" for="overview-date">Summary date<input type="date" id="overview-date" data-field="overview-date" value="' + ui.overviewDate + '" max="' + Care.localDate() + '"></label></div><div class="overview-layout' + (sideTasks ? ' has-tasks' : '') + '"><div class="overview-grid">' + Care.sections.map(section => {
      const percent = Care.percent(view.draft, view.snapshot, section);
      const tasksOpen = ui.homeTasks === section.id;
      const toggle = '<button type="button" class="overview-toggle" id="home-tasks-' + section.id + '" data-action="home-tasks" data-section="' + section.id + '" aria-label="' + (tasksOpen ? 'Hide tasks' : 'Show tasks') + ': ' + escape(section.name) + '" aria-expanded="' + tasksOpen + '"' + (tasksOpen ? ' aria-controls="home-summary-' + section.id + '"' : '') + '><span class="overview-toggle-icon" aria-hidden="true">' + (tasksOpen ? '−' : '+') + '</span></button>';
      return '<section class="overview-card' + (tasksOpen ? ' is-active' : '') + '" data-overview-section="' + section.id + '" style="view-transition-name:overview-' + section.id + '" aria-label="' + escape(section.name) + ' summary"><div class="overview-card-body"><div class="overview-card-heading"><h3>' + escape(section.name) + '</h3>' + toggle + '</div><div class="overview-progress"><span class="progress-percent" aria-hidden="true">' + percent + '%</span><div class="progress-track" role="progressbar" aria-label="' + escape(section.name) + ' progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + percent + '"><div class="progress-fill" style="width:' + percent + '%"></div></div></div></div>' + (tasksOpen && !sideTasks ? summary(section, section.locations, 'home-summary-' + section.id, false, view) : '') + '</section>';
    }).join('') + '</div>' + (sideTasks ? '<div class="overview-task-panel">' + summary(activeTasks, activeTasks.locations, 'home-summary-' + activeTasks.id, true, view) + '</div>' : '') + '</div></section>';
  }
  function identity() {
    return '<div class="identity-row"><label class="field" for="volunteer-name">Name<input type="text" id="volunteer-name" data-field="name" value="' + escape(draft.name) + '" placeholder="Your name" autocomplete="name" maxlength="100" aria-required="true"' + (ui.nameMissing ? ' aria-invalid="true"' : '') + '></label><label class="field" for="care-date">Care date<input type="date" id="care-date" data-field="date" value="' + draft.date + '" min="' + Care.localDate() + '" max="' + Care.localDate() + '"></label><label class="field" for="start-time">Start time<input type="time" id="start-time" data-field="startTime" max="' + Care.localTime() + '" value="' + escape(draft.startTime) + '"></label></div>';
  }
  function chooser(group) {
    return '<div class="location-chooser" id="location-chooser"><div class="location-options" role="group" aria-label="Choose ' + group + '">' + locationsFor(group).map(location => '<button type="button" class="location-toggle" id="choose-' + location.id + '" data-action="location-toggle" data-location="' + location.id + '" aria-pressed="' + draft.locations[group].includes(location.id) + '">' + escape(location.name) + '</button>').join('') + '</div></div>';
  }
  function editor(group) {
    const locations = locationsFor(group).filter(location => draft.locations[group].includes(location.id));
    return '<section class="editor"><div class="section-toolbar"><h2>' + (group === 'rooms' ? 'Rooms' : 'Condos') + '</h2></div>' + chooser(group) + '<div class="location-groups">' + locations.map(location => locationGroup(group, location.id)).join('') + '</div></section>' + submitArea();
  }
  function locationGroup(group, locationId) {
    const open = ui.openLocation[group] === locationId;
    const work = sectionsFor(group).map(section => {
      const selected = draft.selected[section.id].includes(locationId);
      const record = Care.getRecord(draft, section.id, locationId);
      return '<section class="location-work" id="work-panel-' + section.id + '-' + locationId + '" data-work-section="' + section.id + '" aria-label="' + escape(workName(section) + ' for ' + locationName(locationId)) + '"' + (selected ? '' : ' hidden') + '>' + (selected ? '<h3 id="work-title-' + section.id + '-' + locationId + '">' + workName(section) + '</h3>' + (section.kind === 'cleaning' ? cleaning(section, locationId, record) : care(section, locationId, record)) : '') + '</section>';
    }).join('');
    const choices = sectionChoices(group, locationId);
    const hasWorkSelected = sectionsFor(group).some(section => draft.selected[section.id].includes(locationId));
    return '<section class="location-group"><div class="location-header' + (open ? ' is-open' : '') + '"><button type="button" class="location-heading" id="open-' + locationId + '" data-action="location-open" data-location="' + locationId + '" aria-expanded="' + open + '" aria-controls="group-' + locationId + '"><strong>' + escape(locationName(locationId)) + '</strong><span class="group-caret" aria-hidden="true">' + (open ? '−' : '+') + '</span></button></div><div class="location-body" id="group-' + locationId + '"' + (open ? '' : ' hidden') + '>' + choices + work + (hasWorkSelected ? notes(locationId, Care.getLocationNotes(draft, locationId)) : '') + '</div></section>';
  }
  function completionDetails(saved, id, wording = 'Last completed') {
    if (!saved) return '';
    const completedAt = new Date(saved.submittedAt);
    const time = Number.isNaN(completedAt.getTime()) ? '' : ' at <time datetime="' + escape(saved.submittedAt) + '">' + escape(new Intl.DateTimeFormat('en-US', { timeZone: Care.TIME_ZONE, hour: 'numeric', minute: '2-digit' }).format(completedAt)) + '</time>';
    return '<p class="task-completion" id="recorded-' + id + '">' + wording + time + ' by ' + escape(saved.volunteerName || 'Unknown volunteer') + '<span class="sr-only">. Select to record this task again.</span></p>';
  }
  function cleaning(section, locationId, record) {
    const rescueTasks = section.tasks.filter(task => task.rescue);
    const checkedRescue = rescueTasks.filter(task => record.tasks[task.id]);
    const confirmed = record.rescueCleanerUsed || (checkedRescue.length > 0 && checkedRescue.every(task => record.cleaner[task.id]));
    const tasks = section.tasks.map(task => ({ task, saved: Care.taskStatus(draft, snapshot, section, locationId, task).saved }))
      .sort((a, b) => Number(!!a.saved) - Number(!!b.saved) || a.task.text.localeCompare(b.task.text, 'en', { sensitivity: 'base' }));
    const renderTask = ({ task, saved }) => {
      const id = 'task-' + locationId + '-' + task.id;
      const descriptionIds = [task.note ? 'instruction-' + id : '', saved ? 'recorded-' + id : ''].filter(Boolean).join(' ');
      return '<li class="task-row' + (saved ? ' is-complete' : '') + '"><label class="task-label" for="' + id + '"><input type="checkbox" id="' + id + '" data-field="task" data-location="' + locationId + '" data-task="' + task.id + '"' + checked(record.tasks[task.id]) + (descriptionIds ? ' aria-describedby="' + descriptionIds + '"' : '') + '><span>' + escape(task.text) + '</span></label>' + (task.note ? '<p class="task-note" id="instruction-' + id + '">' + escape(task.note) + '</p>' : '') + completionDetails(saved, id) + '</li>';
    };
    const lists = '<ul class="checklist" aria-label="' + escape(locationName(locationId)) + ' cleaning tasks">' + tasks.map(renderTask).join('') + '</ul>';
    return '<div class="group-tools"><button type="button" data-action="check-all" data-location="' + locationId + '">Check all</button><button type="button" data-action="uncheck-all" data-location="' + locationId + '">Uncheck all</button></div><label class="cleaner-confirmation" for="cleaner-' + locationId + '"><input type="checkbox" id="cleaner-' + locationId + '" data-field="cleaner" data-location="' + locationId + '"' + checked(confirmed) + '>Used Rescue Cleaner</label>' + lists;
  }
  function catOptions(locationId, selected, mode, exceptionId = '', search = '') {
    const roster = Care.catsFor(locationId).slice().sort((a, b) => a.name.localeCompare(b.name));
    if (!roster.length) return '<p class="cat-search-empty" role="status">No cats found</p>';
    const query = search.trim().toLowerCase();
    return '<div class="cat-options">' + roster.map(cat => '<label class="check-label cat-option" data-cat-name="' + escape(cat.name.toLowerCase()) + '" for="cat-' + mode + '-' + exceptionId + '-' + cat.id + '"' + (cat.name.toLowerCase().includes(query) ? '' : ' hidden') + '><input type="checkbox" id="cat-' + mode + '-' + exceptionId + '-' + cat.id + '" data-field="' + mode + '" data-location="' + locationId + '" data-exception="' + escape(exceptionId) + '" data-cat="' + cat.id + '"' + checked(selected.includes(cat.id)) + '><img class="cat-option-photo" src="assets/cat-placeholder.png" alt="" width="42" height="42" decoding="async"><span class="cat-option-name">' + escape(cat.name) + '</span></label>').join('') + '</div><p class="cat-search-empty" role="status"' + (roster.some(cat => cat.name.toLowerCase().includes(query)) ? ' hidden' : '') + '>No cats found</p>';
  }
  function care(section, locationId, record) {
    const roster = Care.catsFor(locationId);
    const feedingChecked = record.feeding.checked;
    const entryKey = Care.key(section.id, locationId);
    const feedingSaved = snapshot.feeding.get(entryKey);
    const checkedIds = snapshot.checkedCats.get(entryKey) || new Set();
    const feedingComplete = roster.length > 0 && roster.every(cat => checkedIds.has(cat.id));
    const feedingId = 'feeding-' + locationId;
    const feeding = '<div class="care-group" data-care-check="feeding">' + (section.enrichment ? '<h4>Feeding &amp; drinking</h4>' : '') + '<div class="task-row' + (feedingComplete ? ' is-complete' : '') + '"><div class="feeding-row"><label class="check-label" for="' + feedingId + '"><input type="checkbox" id="' + feedingId + '" data-field="feeding" data-location="' + locationId + '"' + checked(feedingChecked) + disabled(!roster.length) + (feedingSaved ? ' aria-describedby="recorded-' + feedingId + '"' : '') + '>Feeding & drinking checked</label>' + (feedingChecked ? '<button type="button" id="add-exception-' + locationId + '" data-action="add-exception" data-location="' + locationId + '">+ Add feeding exception</button>' : '') + '</div>' + completionDetails(feedingSaved, feedingId, feedingComplete ? 'Last completed' : 'Last checked') + '</div>' + record.exceptions.map((exception, index) => exceptionForm(locationId, exception, index)).join('') + '</div>';
    const checks = [{ text: 'Feeding & drinking checked', complete: feedingComplete, html: feeding }];
    if (section.enrichment) {
      const enrichmentSaved = snapshot.enrichment.get(entryKey);
      const enrichmentId = 'enrichment-' + locationId;
      const enrichment = '<div class="care-group" data-care-check="enrichment"><h4>Enrichment</h4><div class="task-row' + (enrichmentSaved ? ' is-complete' : '') + '"><label class="check-label" for="' + enrichmentId + '"><input type="checkbox" id="' + enrichmentId + '" data-field="enrichment" data-location="' + locationId + '"' + checked(record.enriched) + (enrichmentSaved ? ' aria-describedby="recorded-' + enrichmentId + '"' : '') + '>Cats received enrichment time</label>' + completionDetails(enrichmentSaved, enrichmentId) + '</div></div>';
      checks.push({ text: 'Cats received enrichment time', complete: !!enrichmentSaved, html: enrichment });
    }
    return checks.sort((a, b) => Number(a.complete) - Number(b.complete) || a.text.localeCompare(b.text, 'en', { sensitivity: 'base' })).map(check => check.html).join('');
  }
  function exceptionForm(locationId, exception, index) {
    const id = escape(exception.id);
    const selected = Care.catsFor(locationId).filter(cat => exception.catIds.includes(cat.id));
    const chips = selected.length ? '<div class="cat-chips">' + selected.map(cat => '<span class="cat-chip">' + escape(cat.name) + '<button type="button" data-action="remove-cat" data-location="' + locationId + '" data-exception="' + id + '" data-cat="' + cat.id + '" aria-label="Remove ' + escape(cat.name) + ' from feeding exception ' + (index + 1) + '">×</button></span>').join('') + '</div>' : '';
    return '<section class="exception-card" data-exception-card="' + id + '" data-location="' + locationId + '"><div class="exception-heading"><h4>Feeding exception ' + (index + 1) + '</h4><button type="button" class="text-button" data-action="remove-exception" data-location="' + locationId + '" data-exception="' + id + '" aria-label="Remove feeding exception ' + (index + 1) + '">Remove</button></div>'
      + '<div class="cat-search"><label class="sr-only" for="search-' + id + '">Search cats</label><input type="search" id="search-' + id + '" data-field="cat-search" data-exception="' + id + '" placeholder="Search cats" value="' + escape(ui.searches[exception.id] || '') + '" autocomplete="off"></div>'
      + catOptions(locationId, exception.catIds, 'exception-cat', exception.id, ui.searches[exception.id] || '') + chips
      + '<div class="exception-fields"><div class="field"><label class="sr-only" for="issue-' + id + '">Issue</label><select id="issue-' + id + '" data-field="issue" data-location="' + locationId + '" data-exception="' + id + '" aria-required="true"><option value="">Choose an issue</option>' + Care.issues.map(issue => '<option value="' + issue.id + '"' + (exception.issue === issue.id ? ' selected' : '') + '>' + issue.name + '</option>').join('') + '</select></div>'
      + '<div class="field"><label class="sr-only" for="exception-note-' + id + '">Optional note</label><input type="text" id="exception-note-' + id + '" data-field="exception-note" data-location="' + locationId + '" data-exception="' + id + '" value="' + escape(exception.note) + '" maxlength="1000" placeholder="Optional note"></div></div>'
      + (exception.issue === 'other' ? '<div class="other-field"><label class="sr-only" for="other-' + id + '">Describe the issue</label><input id="other-' + id + '" data-field="other" data-location="' + locationId + '" data-exception="' + id + '" value="' + escape(exception.other) + '" maxlength="500" placeholder="Describe the issue" aria-required="true"></div>' : '') + '</section>';
  }
  function notes(locationId, record) {
    return '<details class="notes" data-note-location="' + locationId + '"' + (ui.notes[locationId] ? ' open' : '') + '><summary>Notes & concerns</summary><div class="note-categories">' + Care.categories.map(category => '<label class="check-label" for="category-' + locationId + '-' + category + '"><input type="checkbox" id="category-' + locationId + '-' + category + '" data-field="category" data-location="' + locationId + '" data-category="' + category + '"' + checked(record.categories.includes(category)) + '>' + category[0].toUpperCase() + category.slice(1) + '</label>').join('') + '<label class="check-label" for="flag-' + locationId + '"><input type="checkbox" id="flag-' + locationId + '" data-field="flag" data-location="' + locationId + '"' + checked(record.flagged) + '>Flag for management</label></div><textarea id="note-' + locationId + '" data-field="note" data-location="' + locationId + '" aria-label="Notes for ' + escape(locationName(locationId)) + '" maxlength="5000" placeholder="Add a note…">' + escape(record.note) + '</textarea></details>';
  }
  function submitArea() {
    const work = ui.design === 'v3' ? result() : null;
    const status = work ? '<span class="round-draft-status" id="round-draft-status" role="status"' + (work.entries.length || work.pending.length ? '' : ' hidden') + '>Not submitted</span>' : '';
    return '<section class="submit-area"><div class="submit-row"><label class="field end-time" for="end-time">End time<input type="time" id="end-time" data-field="endTime" max="' + Care.localTime() + '" value="' + escape(draft.endTime) + '"></label>' + status + '<button type="button" class="primary-button submit-button" id="submit-btn" data-action="submit"' + disabled(ui.saving) + '>' + (ui.saving ? 'Submitting…' : 'Submit my work') + '</button></div></section>';
  }
  function render() {
    const active = document.activeElement;
    const focusId = active?.id;
    const selection = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
    const viewName = ui.section === 'round' ? 'Feeding round' : ui.section === 'overview' ? 'Task summary' : ui.section === 'rooms' ? 'Rooms' : ui.section === 'condos' ? 'Condos' : 'Care work';
    const content = !ui.section ? '' : ui.section === 'round' ? feedingRound() : ui.section === 'overview' ? overview() : editor(ui.section);
    app.dataset.design = ui.design;
    app.dataset.view = ui.section;
    document.body.dataset.design = ui.design;
    app.innerHTML = identity() + navigation() + '<div id="work-view" tabindex="-1" role="region" aria-label="' + escape(viewName) + '"' + (ui.section ? '' : ' hidden') + '>' + content + '</div>';
    storageStatus.textContent = storageWarning;
    document.querySelectorAll('[data-design]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.design === ui.design));
      button.disabled = ui.saving;
    });
    updateTimeLimits();
    app.querySelectorAll('[data-note-location]').forEach(element => { element.addEventListener('toggle', () => { if (element.isConnected) ui.notes[element.dataset.noteLocation] = element.open; }); });
    const target = focusId && (document.getElementById(focusId) || (ui.design === 'v2' && focusId.startsWith('open-') ? document.getElementById('choose-' + focusId.slice(5)) : null));
    if (target) { target.focus({ preventScroll: true }); if (selection) target.setSelectionRange(...selection); }
    rememberRoundReadingPoint();
  }
  function renderExceptionChange(control) {
    const scrollY = window.scrollY;
    const anchorId = control.id || control.closest('.exception-card')?.querySelector('.cat-search input')?.id;
    const anchorTop = document.getElementById(anchorId)?.getBoundingClientRect().top;
    const pickers = Array.from(app.querySelectorAll('.exception-card')).map(card => [
      card.querySelector('.cat-search input').id,
      card.querySelector('.cat-options')?.scrollTop || 0
    ]);
    render();
    for (const [id, top] of pickers) {
      const picker = document.getElementById(id)?.closest('.exception-card').querySelector('.cat-options');
      if (picker) picker.scrollTop = top;
    }
    const anchor = document.getElementById(anchorId);
    if (!control.id && anchor) anchor.focus({ preventScroll: true });
    const targetY = anchor && anchorTop !== undefined ? window.scrollY + anchor.getBoundingClientRect().top - anchorTop : scrollY;
    if (Math.abs(window.scrollY - targetY) >= 1) window.scrollTo({ top: targetY, behavior: 'instant' });
    rememberRoundReadingPoint();
  }
  function rememberRoundReadingPoint() {
    roundReadingPoint = null;
    if (ui.section !== 'round') return;
    roundViewport = [window.innerWidth, window.innerHeight];
    if (!window.scrollY) return;
    const readingLine = Math.min(64, window.innerHeight / 2);
    const nextVisible = elements => Array.from(elements).find(element => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > readingLine && rect.top < window.innerHeight;
    });
    const stop = nextVisible(app.querySelectorAll('.feeding-stop, .submit-area'));
    if (!stop) return;
    const details = stop.querySelector('.feeding-stop-details:not([hidden])');
    const element = details?.getBoundingClientRect().top < 0 ? nextVisible(details.children) || stop : stop;
    roundReadingPoint = { element, top: element.getBoundingClientRect().top };
  }
  function updateLive() {
    const start = document.getElementById('start-time');
    if (start && document.activeElement !== start) start.value = draft.startTime;
    updateTimeLimits();
    const roundStatus = document.getElementById('round-draft-status');
    if (roundStatus) { const work = result(); roundStatus.hidden = !work.entries.length && !work.pending.length; }
    document.querySelectorAll('[data-design]').forEach(button => { button.disabled = ui.saving; });
    const submit = document.getElementById('submit-btn');
    if (submit) {
      submit.disabled = ui.saving;
      submit.textContent = ui.saving ? 'Submitting…' : 'Submit my work';
    }
    if (draft.name.trim()) ui.nameMissing = false;
    document.getElementById('volunteer-name')?.toggleAttribute('aria-invalid', false);
    if (ui.nameMissing) document.getElementById('volunteer-name')?.setAttribute('aria-invalid', 'true');
  }
  function updateTimeLimits() {
    const now = new Date();
    const dateInput = document.getElementById('care-date');
    if (dateInput) dateInput.min = dateInput.max = Care.localDate(now);
    ['start-time', 'end-time'].forEach(id => {
      const input = document.getElementById(id);
      if (!input) return;
      input.max = Care.localTime(now);
      if (id === 'end-time') input.min = draft.startTime && !Care.startTimeError(draft, now) ? draft.startTime : '';
      const error = id === 'start-time' ? Care.startTimeError(draft, now) : Care.endTimeError(draft, now);
      input.setCustomValidity(error);
      if (error) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    });
  }
  function switchSection(section, focusId) {
    if (!['', 'overview', 'rooms', 'condos', ...(ui.design === 'v3' ? ['round'] : [])].includes(section)) return;
    overviewTransition?.skipTransition();
    ui.section = section;
    persistDraft();
    render();
    (document.getElementById(focusId || 'nav-' + section) || document.getElementById('work-view'))?.focus({ preventScroll: true });
  }
  function openDirectLocation(group, locationId) {
    if (!draft.locations[group].includes(locationId)) {
      draft.locations[group] = locationsFor(group).filter(location => draft.locations[group].includes(location.id) || location.id === locationId).map(location => location.id);
    }
    if (!sectionsFor(group).some(section => draft.selected[section.id].includes(locationId))) {
      sectionsFor(group).forEach(section => {
        draft.selected[section.id] = locationsFor(group).filter(location => draft.selected[section.id].includes(location.id) || location.id === locationId).map(location => location.id);
      });
    }
    ui.openLocation[group] = locationId;
    if (!draft.startTime) draft.startTime = Care.localTime();
  }
  document.querySelector('.version-switcher').addEventListener('click', event => {
    const button = event.target.closest('[data-design]');
    if (!button || ui.saving || button.dataset.design === ui.design) return;
    advanceDay();
    ui.design = button.dataset.design;
    if (ui.design === 'v3') ui.section = 'round';
    else if (ui.section === 'round') ui.section = '';
    if (ui.design !== 'v1' && ['rooms', 'condos'].includes(ui.section) && ui.openLocation[ui.section]) openDirectLocation(ui.section, ui.openLocation[ui.section]);
    persistDraft();
    const url = new URL(location.href);
    url.searchParams.set('design', ui.design);
    history.replaceState(null, '', url);
    transitionRender('#work-view');
  });
  function toggleOverviewTasks(section) {
    ui.homeTasks = ui.homeTasks === section ? '' : section;
    persistDraft();
    transitionRender('.overview-layout');
  }
  function transitionRender(selector, moveLayout = true) {
    overviewTransition?.skipTransition();
    if (!moveLayout) {
      render();
      if (!reducedMotion.matches) app.querySelector(selector)?.animate?.([{ opacity: .7 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
      return;
    }
    if (reducedMotion.matches || !document.startViewTransition) {
      render();
      if (!reducedMotion.matches) app.querySelector(selector)?.animate?.([{ opacity: .5, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 240, easing: 'ease-out' });
      return;
    }
    const transition = document.startViewTransition(() => render());
    overviewTransition = transition;
    // Skipping a transition during a rapid click is expected, and still updates the content.
    transition.ready.catch(() => {});
    const finish = () => { if (overviewTransition === transition) overviewTransition = null; };
    transition.finished.then(finish, finish);
  }
  function switchDate(date) {
    if (date !== Care.localDate()) { document.getElementById('care-date').value = draft.date; warn('Care date must be today.'); return; }
    persistDraft();
    draft = restoreDraft(date);
    snapshot = Care.daySnapshot(submissions, date);
    ui.openLocation = {};
    ui.nameMissing = false;
    render();
  }
  function advanceDay() {
    const today = Care.localDate();
    if (today === sessionDay || ui.saving) return false;
    const followToday = draft.date === sessionDay;
    const overviewFollowsToday = ui.overviewDate === sessionDay;
    sessionDay = today;
    if (followToday) {
      persistDraft();
      draft = restoreDraft(today);
      snapshot = Care.daySnapshot(submissions, today);
      ui.openLocation = {};
      ui.roundOpen = '';
      ui.notes = {};
      ui.searches = {};
      ui.nameMissing = false;
    }
    if (overviewFollowsToday) ui.overviewDate = today;
    if (dialog.open) dialog.close();
    render();
    return true;
  }
  function switchOverviewDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > Care.localDate()) {
      document.getElementById('overview-date').value = ui.overviewDate;
      warn('Choose today or an earlier summary date.');
      return;
    }
    overviewTransition?.skipTransition();
    ui.overviewDate = date;
    render();
  }
  app.addEventListener('click', event => {
    if (advanceDay()) { event.preventDefault(); return; }
    let button = event.target.closest('button[data-action]');
    if (!button && !event.target.closest('input, select, textarea, a')) {
      button = event.target.closest('.overview-card-body')?.querySelector('[data-action="home-tasks"]');
    }
    if (!button || button.disabled) return;
    const { action, location, section, exception, cat } = button.dataset;
    const workSection = button.closest('[data-work-section]')?.dataset.workSection;
    if (action !== 'home-tasks') overviewTransition?.skipTransition();
    if (action === 'section') {
      if (button.classList.contains('navigation-button')) ui.homeTasks = '';
      switchSection(button.classList.contains('navigation-button') && ui.section === section ? '' : section, button.id); return;
    } else if (action === 'home-tasks') { toggleOverviewTasks(section); return; }
    else if (action === 'round-check-all' || action === 'round-uncheck-all') Care.setFeedingRound(draft, action === 'round-check-all');
    else if (action === 'round-details') {
      ui.roundOpen = ui.roundOpen === location ? '' : location;
      if (ui.roundOpen) { selectRoundLocation(location); ui.notes[location] = true; }
    }
    else if (action === 'location-toggle') {
      if (ui.design !== 'v1' && !draft.locations[ui.section].includes(location)) {
        openDirectLocation(ui.section, location);
        persistDraft(); transitionRender('.location-body:not([hidden])', false);
        return;
      }
      const selected = draft.locations[ui.section];
      const adding = !selected.includes(location);
      const next = adding ? selected.concat(location) : selected.filter(id => id !== location);
      draft.locations[ui.section] = locationsFor(ui.section).filter(item => next.includes(item.id)).map(item => item.id);
      if (!adding && ui.openLocation[ui.section] === location) ui.openLocation[ui.section] = '';
    }
    else if (action === 'location-open') ui.openLocation[ui.section] = ui.openLocation[ui.section] === location ? '' : location;
    else if (action === 'work-toggle') {
      const selected = draft.selected[section];
      const adding = !selected.includes(location);
      const next = adding ? selected.concat(location) : selected.filter(id => id !== location);
      draft.selected[section] = locationsFor(ui.section).filter(item => next.includes(item.id)).map(item => item.id);
      if (adding && !draft.startTime) draft.startTime = Care.localTime();
    }
    else if (action === 'check-all' || action === 'uncheck-all') {
      const record = recordFor(location, workSection);
      Care.sectionById(workSection).tasks.forEach(task => { record.tasks[task.id] = action === 'check-all'; if (action === 'uncheck-all') record.cleaner[task.id] = false; });
      if (action === 'uncheck-all') record.rescueCleanerUsed = false;
    } else if (action === 'add-exception') recordFor(location, workSection).exceptions.push({ id: uid(), catIds: [], issue: '', other: '', note: '' });
    else if (action === 'remove-exception') recordFor(location, workSection).exceptions = recordFor(location, workSection).exceptions.filter(item => item.id !== exception);
    else if (action === 'remove-cat') { const item = recordFor(location, workSection).exceptions.find(item => item.id === exception); if (item) item.catIds = item.catIds.filter(id => id !== cat); }
    else if (action === 'submit') { requestSave(); return; }
    persistDraft();
    if (action === 'location-open' || action === 'work-toggle') transitionRender('.location-body:not([hidden])', false);
    else if (['round-details', 'add-exception', 'remove-exception', 'remove-cat'].includes(action)) renderExceptionChange(button);
    else render();
    if (action === 'add-exception' && ui.section === 'round') {
      const item = recordFor(location, workSection).exceptions.at(-1);
      document.getElementById('search-' + item.id)?.focus({ preventScroll: true });
    }
  });
  app.addEventListener('input', event => {
    if (advanceDay()) return;
    const input = event.target;
    const { field, location, exception } = input.dataset;
    const workSection = input.closest('[data-work-section]')?.dataset.workSection;
    if (!field || input.type === 'checkbox' || input.type === 'date' || input.tagName === 'SELECT') return;
    if (field === 'cat-search') {
      ui.searches[exception] = input.value;
      const card = input.closest('.exception-card');
      const choices = Array.from(card.querySelectorAll('[data-cat-name]'));
      choices.forEach(label => { label.hidden = !label.dataset.catName.includes(input.value.trim().toLowerCase()); });
      card.querySelector('.cat-search-empty').hidden = choices.some(label => !label.hidden);
      return;
    }
    if (['name', 'startTime', 'endTime'].includes(field)) draft[field] = input.value;
    else if (field === 'note') Care.getLocationNotes(draft, location, true).note = input.value;
    else {
      const item = recordFor(location, workSection).exceptions.find(item => item.id === exception);
      if (!item) return;
      if (field === 'exception-note') item.note = input.value;
      if (field === 'other') item.other = input.value;
    }
    if (location && !draft.startTime) draft.startTime = Care.localTime();
    persistDraft(); updateLive();
  });
  app.addEventListener('change', event => {
    if (advanceDay()) return;
    const input = event.target;
    const { field, location, task, exception, cat, category } = input.dataset;
    const workSection = input.closest('[data-work-section]')?.dataset.workSection;
    if (!field) return;
    if (field === 'overview-date') { switchOverviewDate(input.value); return; }
    if (field === 'date') { switchDate(input.value); return; }
    if (field === 'startTime' || field === 'endTime') {
      draft[field] = input.value;
      persistDraft(); updateTimeLimits();
      if (input.validationMessage) input.reportValidity();
      return;
    }
    if (input.type !== 'checkbox' && input.tagName !== 'SELECT') return;
    {
      const record = field === 'flag' || field === 'category' ? Care.getLocationNotes(draft, location, true) : recordFor(location, workSection);
      if (field === 'task') { record.tasks[task] = input.checked; if (!input.checked) record.cleaner[task] = false; }
      if (field === 'cleaner') {
        record.rescueCleanerUsed = input.checked;
        if (!input.checked) record.cleaner = {};
      }
      if (field === 'feeding') {
        Care.setFeedingCheck(draft, workSection, location, input.checked);
      }
      if (field === 'enrichment') record.enriched = input.checked;
      if (field === 'flag') record.flagged = input.checked;
      if (field === 'category') record.categories = input.checked ? Array.from(new Set(record.categories.concat(category))) : record.categories.filter(value => value !== category);
      if (field === 'exception-cat' || field === 'issue') {
        const item = record.exceptions.find(item => item.id === exception);
        if (item && field === 'issue') item.issue = input.value;
        if (item && field === 'exception-cat') item.catIds = input.checked ? Array.from(new Set(item.catIds.concat(cat))) : item.catIds.filter(id => id !== cat);
      }
    }
    if (location && !draft.startTime) draft.startTime = Care.localTime();
    persistDraft();
    if (field === 'exception-cat' || field === 'issue') renderExceptionChange(input);
    else render();
  });
  function showNotice(messages, focusId = '', title = 'Some entries still need details') {
    document.getElementById('pending-title').textContent = title;
    const list = document.getElementById('pending-list');
    list.innerHTML = messages.map(message => '<li>' + escape(message) + '</li>').join('');
    list.hidden = messages.length === 0;
    if (messages.length) dialog.setAttribute('aria-describedby', 'pending-list');
    else dialog.removeAttribute('aria-describedby');
    ui.noticeFocus = focusId;
    dialog.showModal();
  }
  function revealRoundPending(pending) {
    if (ui.design !== 'v3' || !pending) return '';
    const { sectionId, locationId, type } = pending;
    if (type === 'cleaner') {
      const group = sectionId.startsWith('rooms') ? 'rooms' : 'condos';
      ui.section = group;
      ui.openLocation[group] = locationId;
      const catalog = locationsFor(group);
      draft.locations[group] = catalog.filter(location => location.id === locationId || draft.locations[group].includes(location.id)).map(location => location.id);
      draft.selected[sectionId] = catalog.filter(location => location.id === locationId || draft.selected[sectionId].includes(location.id)).map(location => location.id);
      persistDraft(); render();
      return 'cleaner-' + locationId;
    }
    ui.section = 'round';
    ui.roundOpen = locationId;
    ui.notes[locationId] = true;
    render();
    if (type === 'feeding') return 'round-feeding-' + locationId;
    const exception = Care.getRecord(draft, sectionId, locationId).exceptions.find(item => !Care.exceptionValid(item, locationId));
    if (!exception) return 'round-details-' + locationId;
    return !exception.catIds.length ? 'search-' + exception.id : !exception.issue ? 'issue-' + exception.id : 'other-' + exception.id;
  }
  async function requestSave() {
    if (ui.saving || advanceDay()) return;
    const contribution = result();
    const messages = [];
    updateTimeLimits();
    const entryErrors = [
      { id: 'care-date', message: Care.entryDateError(draft) },
      { id: 'start-time', message: Care.startTimeError(draft) },
      { id: 'end-time', message: Care.endTimeError(draft) }
    ].filter(error => error.message);
    if (!draft.name.trim()) {
      ui.nameMissing = true;
      document.getElementById('volunteer-name').setAttribute('aria-invalid', 'true');
      messages.push('Enter your name.');
    }
    if (!contribution.entries.length && !contribution.pending.length) messages.push('Select a task or add a note.');
    messages.push(...entryErrors.map(error => error.message));
    const pending = contribution.pending.map(item => item.label);
    if (messages.length || pending.length || !contribution.entries.length) {
      const pendingFocus = revealRoundPending(contribution.pending[0]);
      showNotice(messages.concat(pending), ui.nameMissing ? 'volunteer-name' : entryErrors[0]?.id || pendingFocus || 'submit-btn');
      return;
    }
    if (await save()) showNotice([], 'submit-btn', 'Work submitted successfully');
  }
  async function save() {
    if (ui.saving) return;
    ui.saving = true; updateLive();
    app.inert = true;
    try {
      let stored = databaseMode === 'browser' ? JSON.parse(localStorage.getItem(RECORD_KEY) || '[]') : await databaseRequest('/api/records');
      if (!Array.isArray(stored)) throw new Error('Device records have an unexpected format.');
      if (databaseMode !== 'browser') {
        const existingIds = new Set(stored.map(record => record.id));
        const missing = submissions.filter(record => record && !existingIds.has(record.id));
        if (missing.length) stored = await databaseRequest('/api/records/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ records: missing }) });
      }
      const freshSnapshot = Care.daySnapshot(stored, draft.date);
      const existing = stored.find(item => item?.id === draft.contributionId && Array.isArray(item.entries));
      const submission = existing || Care.buildSubmission(draft, freshSnapshot);
      const next = databaseMode === 'browser' || existing ? (existing ? stored : stored.concat(submission)) : await databaseRequest('/api/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ record: submission }) });
      if (databaseMode !== 'browser') databaseMode = 'database';
      try { localStorage.setItem(RECORD_KEY, JSON.stringify(next)); }
      catch (error) { if (databaseMode === 'browser') throw error; }
      submissions = next;
      draft = Care.clearSubmitted(draft, next.find(record => record.id === submission.id) || submission, uid());
      snapshot = Care.daySnapshot(submissions, draft.date);
      storageWarning = '';
      persistDraft();
      return true;
    } catch (error) { warn('Could not submit your work. Your entries are still here. ' + (error.message || 'Please try again.')); return false; }
    finally { ui.saving = false; app.inert = false; if (!advanceDay()) render(); }
  }
  document.getElementById('pending-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    document.getElementById(ui.noticeFocus)?.focus();
    ui.noticeFocus = '';
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) advanceDay(); });
  const refreshClock = () => { if (!advanceDay()) updateTimeLimits(); };
  window.addEventListener('focus', refreshClock);
  window.addEventListener('scroll', () => {
    if (roundViewport?.[0] === window.innerWidth && roundViewport[1] === window.innerHeight) rememberRoundReadingPoint();
  }, { passive: true });
  window.addEventListener('resize', () => {
    if (ui.section !== 'round') return;
    // Keep the current card in view when the rows above it wrap or unwrap.
    if (roundReadingPoint?.element.isConnected) {
      const { element, top } = roundReadingPoint;
      const change = element.getBoundingClientRect().top - top;
      if (Math.abs(change) > 1) window.scrollBy(0, change);
    }
    rememberRoundReadingPoint();
  });
  app.addEventListener('focusin', event => { if (event.target.id === 'end-time' || event.target.id === 'start-time') refreshClock(); });
  window.setInterval(refreshClock, 60000);
  desktopOverview.addEventListener('change', () => {
    if (ui.section !== 'overview') return;
    overviewTransition?.skipTransition();
    render();
  });
  render();
})();
