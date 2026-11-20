(() => {
  'use strict';
  window.SPCA_FEEDING_PREVIEW = true;
  const Care = window.SPCACare;
  const date = Care.localDate();
  const draft = Care.createDraft(date, 'feeding-preview');
  draft.locations.rooms = ['room-6'];
  draft.selected['rooms-feeding'] = ['room-6'];
  const room = Care.getRecord(draft, 'rooms-feeding', 'room-6', true);
  room.feeding.checked = true;
  room.exceptions.push({ id: 'preview-feeding-room-6', catIds: [], issue: '', other: '', note: '' });

  // This example uses the real checklist UI with its own in-memory records.
  // It never reads or changes the user's browser-local drafts or submissions.
  const entries = new Map([
    ['spca.care.drafts.v1', JSON.stringify({ [date]: draft })],
    ['spca.care.records.v1', '[]']
  ]);
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: key => entries.get(String(key)) ?? null,
      setItem: (key, value) => entries.set(String(key), String(value)),
      removeItem: key => entries.delete(String(key)),
      clear: () => entries.clear(),
      key: index => Array.from(entries.keys())[index] ?? null,
      get length() { return entries.size; }
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('nav-round')) {
      document.getElementById('round-details-room-6').click();
      return;
    }
    document.getElementById('nav-rooms').click();
    (document.getElementById('open-room-6') || document.getElementById('choose-room-6')).click();
  }, { once: true });
})();
