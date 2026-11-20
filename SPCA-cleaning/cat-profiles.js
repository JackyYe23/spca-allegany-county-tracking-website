(() => {
  'use strict';

  const Care = window.SPCACare;
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const uid = () => crypto.randomUUID();
  const placeholder = 'assets/cat-placeholder.png';
  const form = byId('profile-form');
  const editor = byId('profile-editor');
  const roster = byId('cat-roster');
  const overview = byId('cat-overview');
  const locationFilter = byId('roster-location');
  const search = byId('roster-search');
  const dateFilter = byId('history-date');
  const kindFilter = byId('history-kind');
  const observationGroups = [
    ['Food & water', [
      ['dryAppetite', 'Dry food appetite', ['Ate well', 'Ate some', 'Did not eat', 'Not offered']],
      ['wetAppetite', 'Wet food appetite', ['Ate well', 'Ate some', 'Did not eat', 'Not offered']],
      ['water', 'Drinking', ['Drank water', 'Did not see drinking']]
    ]],
    ['Health & behavior', [
      ['urine', 'Urine', ['Normal', 'Abnormal', 'None seen']],
      ['stool', 'Stool', ['Normal', 'Abnormal', 'None seen']],
      ['behavior', 'Behavior', ['Friendly', 'Angry', 'Shy', 'Scared', 'Other']]
    ]],
    ['Care', [
      ['cage', 'Cage cleaned', ['Done', 'Not done']],
      ['blanket', 'Blanket cleaned or changed', ['Done', 'Not done']],
      ['enrichment', 'Enrichment and toys', ['Done', 'Not done']]
    ]]
  ];
  const observationLabels = new Map(observationGroups.flatMap(([, fields]) => fields.map(([key, label]) => [key, label])));
  const observationOutcomes = new Map([
    ['Did not eat', 'concern'], ['Abnormal', 'concern'],
    ['Did not see drinking', 'uncertain'], ['None seen', 'uncertain']
  ]);
  const namesByLocationId = new Map([...Care.rooms, ...Care.condos].map(location => [location.id, location.name]));
  const cats = new Map(Care.cats.map(cat => [cat.id, { ...cat, location: namesByLocationId.get(cat.locationId) }]));
  const commonLocations = [...namesByLocationId.values(), 'Hallway', 'Featured Room', 'Maternity'];
  const editorDrafts = new Map();
  let selectedId = '';
  let entries = [];
  let historyRequest = 0;
  let historyLoaded = false;
  let entryEditor = null;
  let recordedBy = '';
  let saving = false;

  const labelOrder = (a, b) => a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true });
  const sortedCats = () => Array.from(cats.values()).sort((a, b) => labelOrder(a.name, b.name) || labelOrder(a.location, b.location));
  const issueName = id => Care.issues.find(issue => issue.id === id)?.name || 'Feeding exception';
  const catContext = cat => [cat.location, cat.chip && 'Chip ' + cat.chip].filter(Boolean).join(' · ');
  const photo = (cat, size) => '<img class="cat-photo" src="' + escape(cat.photo || placeholder) + '" alt="" width="' + size + '" height="' + size + '">';
  const dateLabel = value => new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  const shortDateLabel = value => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  const weightLabel = entry => [entry.pounds && entry.pounds + ' lb', entry.ounces && entry.ounces + ' oz'].filter(Boolean).join(' ');
  const editorKey = (kind, catId) => kind + ':' + catId;
  const draftMarker = ' <span class="draft-marker" role="img" aria-label="Draft" hidden></span>';

  async function request(path, payload) {
    const options = payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {};
    const response = await fetch(path, { ...options, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) throw new Error(data?.error || 'Could not reach the cat records. Check that the local preview server is running.');
    return data;
  }

  function notice(message = '', isError = false) {
    const element = byId('profile-notice');
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('profile-error', isError);
  }

  function updateLocationFilter() {
    const current = locationFilter.value;
    const locations = [...new Set(sortedCats().map(cat => cat.location).filter(Boolean))].sort(labelOrder);
    locationFilter.replaceChildren(new Option('All locations', ''), ...locations.map(location => new Option(location)));
    if (locations.includes(current)) locationFilter.value = current;
  }

  function matches(cat, query) {
    return [cat.name, cat.location, cat.chip].filter(Boolean).join(' ').toLowerCase().includes(query.trim().toLowerCase());
  }

  function renderRoster() {
    const list = sortedCats().filter(cat => (!locationFilter.value || cat.location === locationFilter.value) && matches(cat, search.value));
    const scrollTop = roster.scrollTop;
    roster.innerHTML = list.map(cat => '<li><button type="button" data-cat="' + escape(cat.id) + '"' +
      (cat.id === selectedId ? ' aria-current="true"' : '') + '>' + photo(cat, 44) + '<span><span class="cat-name">' + escape(cat.name) +
      '</span><span class="cat-meta">' + escape(catContext(cat)) + '</span></span></button></li>').join('');
    roster.scrollTop = scrollTop;
    byId('roster-status').textContent = list.length ? '' : 'No cats found.';
    byId('roster-status').hidden = !!list.length;
  }

  function renderProfile() {
    const cat = cats.get(selectedId);
    overview.hidden = !cat;
    byId('profile-empty').hidden = !!cat;
    byId('profile-history').hidden = !cat;
    if (!cat) return;
    const medicationExpanded = overview.dataset.catId === cat.id &&
      overview.querySelector('.medication-toggle')?.getAttribute('aria-expanded') === 'true';
    overview.dataset.catId = cat.id;
    const weight = entries.find(entry => entry.kind === 'weight');
    const lastObservation = entries.find(entry => entry.kind === 'observation');
    const facts = historyLoaded ? [
      ['Latest weight', weight ? [weightLabel(weight), shortDateLabel(weight.date)].filter(Boolean).join(' · ') : 'No weight recorded', true],
      ['Last observation', lastObservation ? [shortDateLabel(lastObservation.date), lastObservation.shift].filter(Boolean).join(' · ') : 'No observation recorded', true]
    ] : [];
    const sex = cat.sex === 'Female' ? 'F' : cat.sex === 'Male' ? 'M' : cat.sex;
    facts.push(...[['Microchip', cat.chip], ['Color', cat.color], ['Sex', sex], ['Special diet', cat.diet],
      ['Medications', cat.medications]].filter(([, value]) => value));
    overview.innerHTML = '<div class="profile-heading cat-profile-top"><div class="cat-identity">' + photo(cat, 84) +
      '<div><h2 id="selected-cat-name" tabindex="-1">' + escape(cat.name) + '</h2>' +
      (cat.location ? '<p>' + escape(cat.location) + '</p>' : '') + '</div></div>' +
      editorButton('edit-cat', 'profile', 'Edit profile') + '</div>' +
      (facts.length ? '<dl class="profile-facts">' + facts.map(([label, value, compact]) => {
        if (label === 'Medications') {
          return '<div class="medications-fact"><dt>Medications' +
            '<button type="button" class="medication-toggle" aria-label="Show medications" aria-controls="medication-text" aria-expanded="' +
            Boolean(medicationExpanded) + '" hidden><span class="history-expand-icon" aria-hidden="true"></span></button></dt>' +
            '<dd><span id="medication-text" class="medication-text">' + escape(value) + '</span></dd></div>';
        }
        return '<div' + (compact ? ' class="recent-fact"' : '') + '><dt>' + label + '</dt><dd>' + escape(value || '') + '</dd></div>';
      }).join('') + '</dl>' : '') +
      '<div class="cat-actions">' + editorButton('log-observation', 'observation', 'Log observation') +
      editorButton('log-weight', 'weight', 'Log weight') +
      '</div>';
    updateEditorControls();
    updateMedicationDisclosure();
  }

  function updateMedicationDisclosure() {
    const text = byId('medication-text');
    if (!text) return;
    const toggle = overview.querySelector('.medication-toggle');
    const oneLine = Math.ceil(parseFloat(getComputedStyle(text).lineHeight));
    const needsToggle = text.scrollHeight > oneLine;
    if (!needsToggle) toggle.setAttribute('aria-expanded', 'false');
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    text.classList.toggle('is-expanded', expanded);
    toggle.setAttribute('aria-label', expanded ? 'Collapse medications' : 'Show full medications');
    toggle.hidden = !needsToggle;
  }

  function editorButton(id, kind, label) {
    return '<button type="button" id="' + id + '" class="editor-action" data-editor="' + kind +
      '" aria-controls="profile-editor" aria-expanded="false">' + label + draftMarker + '</button>';
  }

  function observationSummary(entry) {
    const values = entry.observations || {};
    const summary = [];
    const dry = values.dryAppetite;
    const wet = values.wetAppetite;
    const food = [dry, wet].filter(Boolean);
    if (food.length && food.every(value => value === 'Not offered')) {
      summary.push('Food not offered');
    } else if (food.length === 2 && dry === wet) {
      summary.push(dry === 'Did not eat' ? 'Did not eat' : dry === 'Ate well' ? 'Ate both foods well' :
        dry === 'Ate some' ? 'Ate some of both foods' : 'Food intake recorded');
    } else if (food.length) {
      const parts = [];
      if (dry && dry !== 'Not offered') parts.push((wet ? 'Dry food: ' : '') + dry.toLowerCase());
      if (wet && wet !== 'Not offered') parts.push((dry ? 'Wet food: ' : '') + wet.toLowerCase());
      if (parts.length) summary.push(parts.join('; '));
    }
    if (values.water === 'Drank water') summary.push('drank water');
    if (values.water === 'Did not see drinking') summary.push('drinking not observed');
    for (const key of ['urine', 'stool']) {
      if (values[key] && values[key] !== 'Normal') summary.push(observationLabels.get(key) + ': ' + values[key].toLowerCase());
    }
    if (values.behavior && values.behavior !== 'Friendly') summary.push('Behavior: ' + values.behavior.toLowerCase());
    const incompleteCare = { cage: 'Cage cleaning', blanket: 'Blanket cleaning', enrichment: 'Enrichment and toys' };
    for (const [key, label] of Object.entries(incompleteCare)) {
      if (values[key] === 'Not done') summary.push(label + ' not completed');
    }
    if (!summary.length) return entry.flaggedForManagement || entry.healthCategories?.length ? 'Health concern noted' :
      entry.healthConcerns || entry.note ? 'Notes added' : 'No concerns noted';
    const text = summary.join('; ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function renderHistory() {
    const hasFilter = !!(dateFilter.value || kindFilter.value);
    byId('clear-history-date').hidden = !hasFilter;
    const visible = entries.filter(entry => (!dateFilter.value || entry.date === dateFilter.value) &&
      (!kindFilter.value || entry.kind === kindFilter.value));
    const status = byId('history-status');
    status.hidden = visible.length > 0;
    status.textContent = visible.length ? '' : entries.length ? 'No entries match these filters.' : 'No care entries yet.';
    byId('history-entries').innerHTML = visible.map(entry => {
      const title = entry.kind === 'weight' ? 'Weight' : entry.kind === 'observation'
        ? 'Observation' : 'Feeding exception';
      const when = [dateLabel(entry.date), entry.shift].filter(Boolean).join(' · ');
      const observations = Object.entries(entry.observations || {});
      const healthCategories = Array.isArray(entry.healthCategories) ? entry.healthCategories : [];
      const flags = healthCategories.map(value => value[0].toUpperCase() + value.slice(1));
      if (entry.flaggedForManagement) flags.unshift('Flagged for management');
      const flagMarkup = flags.length ? '<div class="history-flags">' + flags.map(value => '<span>' + escape(value) + '</span>').join('') + '</div>' : '';
      const visibleValues = observations.map(([key, value]) => '<div><dt>' + escape(observationLabels.get(key)) + '</dt><dd>' + escape(value) + '</dd></div>').join('');
      const observationPairs = observations.map(([key, value]) => '<div data-outcome="' + (observationOutcomes.get(value) || 'neutral') +
        '"><dt>' + escape(observationLabels.get(key) || key) + '</dt><dd>' + escape(value) + '</dd></div>');
      const concernMeta = healthCategories.map(value => value[0].toUpperCase() + value.slice(1) + ' concern');
      if (entry.flaggedForManagement) concernMeta.push('Flagged for management');
      const concernText = [entry.healthConcerns, entry.note].filter(Boolean);
      if (concernMeta.length || concernText.length) {
        observationPairs.push('<div class="observation-note-pair" data-outcome="' +
          (entry.flaggedForManagement || concernMeta.length || entry.healthConcerns ? 'concern' : 'neutral') + '"><dt><span>Notes and concerns</span>' +
          (concernMeta.length ? '<span class="observation-note-meta">' + concernMeta.map(value => '<span>' + escape(value) + '</span>').join('') + '</span>' : '') +
          '</dt><dd>' + (concernText.length ? '<span class="observation-note-text">' + concernText.map(escape).join('<br>') + '</span>' : '') + '</dd></div>');
      }
      const detailValues = entry.kind === 'observation' && observationPairs.length
        ? '<dl class="observation-detail-pairs">' + observationPairs.join('') + '</dl>' : '';
      const notes = entry.kind === 'exception' ? exceptionNotes(entry) :
        (entry.kind === 'weight' && entry.note ? '<p>' + escape(entry.note) + '</p>' : '');
      const loggedBy = entry.recordedBy ? '<p class="history-logged-by">Logged by ' + escape(entry.recordedBy) + '</p>' : '';
      const result = entry.kind === 'weight' ? '<p class="history-result">' + escape(weightLabel(entry)) + '</p>' :
        entry.kind === 'exception' ? '<p class="history-result">' +
          escape([issueName(entry.issue), entry.otherDetails].filter(Boolean).join(' · ')) + '</p>' : '';
      const details = detailValues || notes || loggedBy;
      if (entry.kind === 'observation') {
        const observationHeader = '<div class="history-card-heading history-card-heading-expandable"><span class="history-title">Observation</span>' +
          '<time class="history-meta" datetime="' + escape(entry.date) + '">' + escape(when) + '</time>' +
          '<span class="history-expand-icon" aria-hidden="true"></span></div>';
        const observationSummaryText = '<p class="history-result">' + escape(observationSummary(entry)) + '</p>';
        const inset = detailValues || loggedBy ? '<div class="history-detail history-detail-inset">' + detailValues + loggedBy + '</div>' : '';
        return '<li><details class="history-observation"><summary aria-label="Expand or collapse observation details">' + observationHeader + observationSummaryText +
          '</summary>' + inset + '</details></li>';
      }
      const header = '<div class="history-card-heading' + (details ? ' history-card-heading-expandable' : '') + '"><span class="history-title">' + escape(title) + '</span>' +
        '<time class="history-meta" datetime="' + escape(entry.date) + '">' + escape(when) + '</time>' +
        (details ? '<span class="history-expand-icon" aria-hidden="true"></span>' : '') + '</div>';
      const summary = flagMarkup + (visibleValues ? '<dl class="history-snapshot">' + visibleValues + '</dl>' : '') + result;
      if (!details) return '<li><article>' + header + summary + '</article></li>';
      return '<li><details><summary>' + header + summary + '</summary><div class="history-detail">' + detailValues +
        (notes ? '<div class="history-notes">' + notes + '</div>' : '') + loggedBy + '</div></details></li>';
    }).join('');
  }

  function exceptionNotes(entry) {
    const fromChecklist = entry.source === 'Checklist';
    const labels = [['Shared', !fromChecklist && entry.note], ['Individual', entry.individualNote], ['Note', fromChecklist && entry.note]]
      .filter(([, value]) => value).map(([label, value]) =>
        '<div><dt>' + label + '</dt><dd>' + escape(value) + '</dd></div>').join('');
    return labels ? '<dl class="exception-note-labels">' + labels + '</dl>' : '';
  }

  async function loadHistory(catId) {
    const requestId = ++historyRequest;
    const status = byId('history-status');
    status.textContent = 'Loading care history…';
    status.hidden = false;
    byId('history-entries').replaceChildren();
    try {
      const data = await request('/api/cat-history?cat=' + encodeURIComponent(catId));
      if (requestId !== historyRequest) return;
      entries = data.entries;
      historyLoaded = true;
      const focusedId = document.activeElement.id;
      renderProfile();
      if (['selected-cat-name', 'edit-cat', 'log-observation', 'log-weight'].includes(focusedId)) byId(focusedId)?.focus({ preventScroll: true });
      renderHistory();
    } catch (error) {
      if (requestId !== historyRequest) return;
      status.textContent = error.message;
    }
  }

  function selectCat(catId, focus = true) {
    if (selectedId !== catId) closeEditor({ keepDraft: true });
    selectedId = catId;
    entries = [];
    historyLoaded = false;
    dateFilter.value = '';
    kindFilter.value = '';
    byId('clear-history-date').hidden = true;
    renderRoster();
    renderProfile();
    loadHistory(catId);
    if (focus) {
      const name = byId('selected-cat-name');
      name.focus({ preventScroll: true });
      name.scrollIntoView({ block: 'nearest' });
    }
  }

  function addTemplate(id) {
    form.append(byId(id).content.cloneNode(true));
  }

  function renderObservationFields() {
    const sections = observationGroups.map(([title, fields]) => {
      const controls = fields.map(([key, label, options]) => '<label class="field">' + label +
        '<select name="' + key + '"><option value="">Choose</option>' + options.map(option => '<option>' + option + '</option>').join('') +
        '</select></label>').join('');
      return '<details class="entry-panel observation-section" open><summary>' + title + '</summary>' +
        '<div class="entry-panel-body observation-fields">' + controls + '</div></details>';
    });
    const concernsPanel = '<div class="observation-concerns"><div class="field"><span>Notes and concerns</span>' +
      '<div class="note-categories">' + ['medical', 'behavioral', 'other'].map(value => '<label class="check-label"><input type="checkbox" name="healthCategories" value="' + value + '">' + value[0].toUpperCase() + value.slice(1) + '</label>').join('') +
      '<label class="check-label"><input type="checkbox" name="flaggedForManagement" value="true">Flag for management</label></div>' +
      '<textarea name="healthConcerns" aria-label="Notes and concerns" maxlength="1000" rows="2"></textarea></div></div>';
    form.insertAdjacentHTML('beforeend', '<div class="observation-sections">' + sections.join('') + concernsPanel + '</div>');
  }

  function beginEditor(kind, catId, opener) {
    if (saving) return;
    const key = editorKey(kind, catId);
    if (entryEditor?.key === key) {
      closeEditor({ keepDraft: true, restoreFocus: true });
      return;
    }
    closeEditor({ keepDraft: true });
    const draft = editorDrafts.get(key);
    if (draft) {
      editorDrafts.delete(key);
      entryEditor = draft;
      form.append(draft.fields);
      delete draft.fields;
      if (kind !== 'profile') form.elements.date.max = Care.localDate();
    } else {
      createEditor(kind, catId, opener, key);
    }
    byId('editor-title').textContent = entryEditor.title;
    editor.hidden = false;
    updateEditorControls();
    notice();
    byId('editor-title').focus({ preventScroll: true });
  }

  function createEditor(kind, catId, opener, key) {
    const cat = cats.get(catId);
    const title = kind === 'profile' ? (cat ? 'Edit profile' : 'Add cat') : kind === 'observation' ? 'Log observation' : 'Log weight';
    entryEditor = { key, kind, catId, opener, title, id: uid(), targets: new Map(catId ? [[catId, '']] : []),
      photo: cat?.photo || '', initialPhoto: cat?.photo || '', photoPending: false };
    if (kind === 'profile') {
      addTemplate('identity-fields');
      for (const field of ['name', 'location', 'chip', 'color', 'sex', 'diet', 'medications']) form.elements[field].value = cat?.[field] || '';
      const locations = [...new Set([...commonLocations, ...sortedCats().map(item => item.location).filter(Boolean)])].sort(labelOrder);
      byId('cat-locations').replaceChildren(...locations.map(location => new Option(location)));
      updatePhoto(entryEditor.photo);
    } else {
      addTemplate('entry-fields');
      form.elements.date.value = form.elements.date.max = Care.localDate();
      form.elements.shift.value = Care.localTime() < '12:00' ? 'AM' : 'PM';
      form.elements.recordedBy.value = recordedBy;
      if (kind === 'observation') renderObservationFields();
      if (kind === 'weight') addTemplate('weight-fields');
    }
    form.insertAdjacentHTML('beforeend', '<div class="profile-submit-row"><button type="submit" class="primary-button" id="save-cat-entry">' +
      (kind === 'profile' ? 'Save profile' : 'Save entry') + '</button><p id="entry-error" class="profile-error" role="alert"></p></div>');
    entryEditor.initialValues = editorValues(entryEditor);
  }

  function editorValues(state) {
    return JSON.stringify([Array.from(new FormData(form)), Array.from(state.targets)]);
  }

  function hasChanges(state) {
    return state.photoPending || state.photo !== state.initialPhoto || state.initialValues !== editorValues(state);
  }

  function updateEditorControls() {
    const hasDraft = entryEditor && hasChanges(entryEditor);
    for (const button of [byId('add-cat'), ...overview.querySelectorAll('[data-editor]')]) {
      const key = button.id === 'add-cat' ? editorKey('profile', '') : editorKey(button.dataset.editor, selectedId);
      const active = key === entryEditor?.key;
      button.setAttribute('aria-expanded', String(active));
      if (button.closest('.cat-actions')) button.classList.toggle('primary-button', active);
      button.querySelector('.draft-marker').hidden = active ? !hasDraft : !editorDrafts.has(key);
    }
  }

  function closeEditor({ keepDraft = false, restoreFocus = false } = {}) {
    const state = entryEditor;
    if (!state) return;
    if (keepDraft && hasChanges(state)) {
      // Moving the form preserves selections, typed values, and disclosure state.
      state.fields = document.createDocumentFragment();
      state.fields.append(...form.childNodes);
      editorDrafts.set(state.key, state);
    } else {
      form.replaceChildren();
    }
    entryEditor = null;
    editor.hidden = true;
    updateEditorControls();
    if (restoreFocus) byId(state.opener)?.focus();
  }

  function updatePhoto(photo, preview = byId('photo-preview'), remove = byId('remove-photo')) {
    preview.src = photo || placeholder;
    remove.hidden = !photo;
  }

  async function loadPhoto(file) {
    if (!file) return;
    const state = entryEditor;
    const input = byId('photo-input');
    const preview = byId('photo-preview');
    const remove = byId('remove-photo');
    const error = byId('entry-error');
    state.photoPending = true;
    input.disabled = true;
    remove.disabled = true;
    error.textContent = '';
    updateEditorControls();
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 320;
      canvas.getContext('2d').drawImage(image, (image.naturalWidth - size) / 2, (image.naturalHeight - size) / 2, size, size, 0, 0, 320, 320);
      state.photo = canvas.toDataURL('image/jpeg', .83);
      updatePhoto(state.photo, preview, remove);
    } catch (_) {
      error.textContent = 'Choose a photo your browser can open.';
    } finally {
      URL.revokeObjectURL(url);
      state.photoPending = false;
      input.disabled = false;
      remove.disabled = false;
      if (entryEditor === state) updateEditorControls();
    }
  }

  function entryPayload(state, values) {
    const { kind, id, targets } = state;
    if (!targets.size) throw new Error('Choose at least one cat.');
    const data = { ...values, kind, id, cats: Array.from(targets, ([catId, note]) => {
      const cat = cats.get(catId);
      return { id: catId, note, sample: cat.sample ? { name: cat.name, location: cat.location } : undefined };
    }) };
    if (kind === 'observation') {
      data.observations = {};
      for (const key of observationLabels.keys()) {
        if (data[key]) data.observations[key] = data[key];
        delete data[key];
      }
    }
    if (kind === 'weight') {
      data.pounds = Number(data.pounds);
      data.ounces = Number(data.ounces);
    }
    return data;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!entryEditor || saving) return;
    const state = entryEditor;
    const errorMessage = byId('entry-error');
    if (state.photoPending) {
      errorMessage.textContent = 'Wait for the photo to finish loading.';
      return;
    }
    const formData = new FormData(form);
    const values = Object.fromEntries(formData);
    if (state.kind === 'observation') {
      values.healthCategories = formData.getAll('healthCategories');
      values.flaggedForManagement = formData.has('flaggedForManagement');
    }
    const save = byId('save-cat-entry');
    const label = save.textContent;
    const fields = Array.from(form.elements).filter(field => !field.disabled && 'disabled' in field);
    saving = true;
    fields.forEach(field => { field.disabled = true; });
    byId('close-entry').disabled = true;
    save.textContent = 'Saving…';
    errorMessage.textContent = '';
    try {
      if (state.kind === 'profile') {
        const data = await request('/api/cat-profiles', { profile: { ...values, id: state.catId || state.id, photo: state.photo } });
        cats.set(data.profile.id, data.profile);
        updateLocationFilter();
        closeEditor();
        notice('Cat profile saved.');
        selectCat(data.profile.id);
      } else {
        const data = await request('/api/cat-history', { entry: entryPayload(state, values) });
        recordedBy = values.recordedBy.trim();
        const catId = state.targets.has(selectedId) ? selectedId : state.targets.keys().next().value;
        closeEditor();
        notice('Entry saved.');
        selectCat(catId);
      }
    } catch (error) {
      errorMessage.textContent = error.message;
    } finally {
      saving = false;
      byId('close-entry').disabled = false;
      fields.forEach(field => { field.disabled = false; });
      save.textContent = label;
      updateEditorControls();
    }
  });

  form.addEventListener('input', event => {
    if (event.target.name) updateEditorControls();
  });
  form.addEventListener('change', event => {
    if (event.target.id === 'photo-input') loadPhoto(event.target.files[0]);
    if (event.target.name) updateEditorControls();
  });
  form.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.id === 'remove-photo') {
      entryEditor.photo = '';
      byId('photo-input').value = '';
      updatePhoto(entryEditor.photo);
      updateEditorControls();
      byId('photo-input').focus();
    }
  });

  roster.addEventListener('click', event => {
    const cat = event.target.closest('[data-cat]');
    if (cat && !saving) selectCat(cat.dataset.cat);
  });
  search.addEventListener('input', renderRoster);
  locationFilter.addEventListener('change', renderRoster);
  overview.addEventListener('click', event => {
    const button = event.target.closest('[data-editor]');
    if (button) beginEditor(button.dataset.editor, selectedId, button.id);
    const medicationToggle = event.target.closest('.medication-toggle');
    if (medicationToggle) {
      medicationToggle.setAttribute('aria-expanded', String(medicationToggle.getAttribute('aria-expanded') !== 'true'));
      updateMedicationDisclosure();
    }
  });
  new ResizeObserver(updateMedicationDisclosure).observe(overview);
  byId('add-cat').addEventListener('click', () => beginEditor('profile', '', 'add-cat'));
  byId('close-entry').addEventListener('click', () => closeEditor({ keepDraft: true, restoreFocus: true }));
  dateFilter.max = Care.localDate();
  dateFilter.addEventListener('change', () => { if (historyLoaded) renderHistory(); });
  kindFilter.addEventListener('change', () => { if (historyLoaded) renderHistory(); });
  byId('clear-history-date').addEventListener('click', () => {
    dateFilter.value = '';
    kindFilter.value = '';
    renderHistory();
    kindFilter.focus();
  });

  request('/api/cat-profiles').then(data => {
    data.profiles.forEach(profile => cats.set(profile.id, profile));
    updateLocationFilter();
    renderRoster();
    byId('add-cat').disabled = false;
  }).catch(error => {
    byId('roster-status').textContent = 'Could not load cats.';
    notice(error.message, true);
  });
})();
