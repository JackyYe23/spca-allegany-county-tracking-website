import React, { useEffect, useState } from "react";
import "../common/styles/TrainingPage.css";

import AddDataButton from "../common/components/AddDataButton";
import TrainingDataModal from "./TrainingDataModal";
import spcaLogo from "../common/assets/spca-logo.png";

const MODAL_OPEN_KEY = "trainingPage.modalOpen";
const SESSIONS_KEY = "trainingPage.sessions";

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getTodayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function shiftDateISO(iso, deltaDays) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function formatDateISO(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function AdditionalNotesDropdown({ notes, followUpNotes, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (!notes && !followUpNotes) {
    return <div className="additional-notes-empty">No additional notes.</div>;
  }

  return (
    <div className="additional-notes-dropdown">
      <button
        type="button"
        className="additional-notes-toggle"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
      >
        <span>Additional notes</span>
        <span
          className={`training-log-expand-arrow${isOpen ? " open" : ""}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="additional-notes-content">
          <div className="additional-notes-text">
            {notes || "No additional notes."}
          </div>
          {followUpNotes && (
            <div className="additional-notes-followup">
              <strong>Other things to work on:</strong> {followUpNotes}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TrainingPage({ onOpenDogActivity }) {
  const [isModalOpen, setIsModalOpen] = useState(
    () => localStorage.getItem(MODAL_OPEN_KEY) === "true"
  );
  const [sessions, setSessions] = useState(loadSessions);
  const [viewedDate, setViewedDate] = useState(() => getTodayISO());
  const [editingEntry, setEditingEntry] = useState(null);
  const [notesPopup, setNotesPopup] = useState(null);
  const [dogHistoryView, setDogHistoryView] = useState(null);
  const [dogHistoryFilter, setDogHistoryFilter] = useState("");
  const [isAllDataOpen, setIsAllDataOpen] = useState(false);
  const [allDataDogFilter, setAllDataDogFilter] = useState("");
  const [allDataDogSearch, setAllDataDogSearch] = useState("");
  const [showAllDataDogSuggestions, setShowAllDataDogSuggestions] =
    useState(false);
  const [allDataDateFilter, setAllDataDateFilter] = useState("");
  const [expandedDataKeys, setExpandedDataKeys] = useState([]);

  useEffect(() => {
    try {
      localStorage.setItem(MODAL_OPEN_KEY, String(isModalOpen));
    } catch {
      // ignore storage errors
    }
  }, [isModalOpen]);

  const persistSessions = (updated) => {
    setSessions(updated);

    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
    } catch {
      // ignore storage errors
    }
  };

  // Each dog gets its own log entry, sharing the trainer and date of the session
  const splitIntoDogEntries = (sessionData, fields) =>
    sessionData.animals.map((animal) => ({
      ...sessionData,
      ...fields,
      animals: [animal],
    }));

  const handleSaved = (sessionData) => {
    if (editingEntry) {
      const updatedEntries = splitIntoDogEntries(sessionData, {
        savedAt: editingEntry.session.savedAt,
        updatedAt: new Date().toISOString(),
      });
      const updated = [
        ...sessions.slice(0, editingEntry.index),
        ...updatedEntries,
        ...sessions.slice(editingEntry.index + 1),
      ];

      persistSessions(updated);
      setEditingEntry(null);
      return;
    }

    const entries = splitIntoDogEntries(sessionData, {
      savedAt: new Date().toISOString(),
    });
    persistSessions([...entries, ...sessions]);
    setIsModalOpen(false);
  };

  const handleDelete = (index) => {
    if (
      !window.confirm(
        "Delete this training session? This cannot be undone."
      )
    ) {
      return;
    }

    persistSessions(sessions.filter((_, i) => i !== index));

    if (editingEntry && editingEntry.index === index) {
      setEditingEntry(null);
    }
  };

  const todayISO = getTodayISO();
  const viewedSessions = sessions
    .map((session, index) => ({ session, index }))
    .filter(({ session }) => session.sessionDate === viewedDate);
  const isViewingToday = viewedDate === todayISO;
  const isNextDisabled = viewedDate >= todayISO;
  const isModalShown = isModalOpen || editingEntry !== null;

  const dogHistoryRecords = dogHistoryView
    ? sessions
        .filter(
          (s) =>
            Array.isArray(s.animals) &&
            s.animals.some((a) => a.name === dogHistoryView.dogName)
        )
        .filter(
          (s) => !dogHistoryFilter || s.sessionDate === dogHistoryFilter
        )
        .map((s) => ({
          session: s,
          animal: s.animals.find((a) => a.name === dogHistoryView.dogName),
        }))
        .sort((a, b) => (a.session.sessionDate < b.session.sessionDate ? 1 : -1))
    : [];

  const getAnimalsOfSession = (session) =>
    Array.isArray(session.animals)
      ? session.animals
      : [{ name: session.animalName, notes: session.sessionNotes }];

  const allDogNames = [
    ...new Set(
      sessions.flatMap((s) => getAnimalsOfSession(s).map((a) => a.name))
    ),
  ]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

  const allDataDogMatches = allDogNames.filter(
    (name) =>
      !allDataDogSearch.trim() ||
      name.toLowerCase().includes(allDataDogSearch.trim().toLowerCase())
  );

  const handleAllDataDogSearchChange = (value) => {
    setAllDataDogSearch(value);
    setAllDataDogFilter("");
    setShowAllDataDogSuggestions(true);
  };

  const handleSelectAllDataDog = (name) => {
    setAllDataDogFilter(name);
    setAllDataDogSearch(name);
    setShowAllDataDogSuggestions(false);
  };

  const handleClearAllDataDog = () => {
    setAllDataDogFilter("");
    setAllDataDogSearch("");
    setShowAllDataDogSuggestions(false);
  };

  // Every record is listed, narrowed by the dog and date filters when set
  const allDataRecords = sessions
    .filter(
      (s) => !allDataDateFilter || s.sessionDate === allDataDateFilter
    )
    .flatMap((session) =>
      getAnimalsOfSession(session)
        .filter(
          (a) => a.name && (!allDataDogFilter || a.name === allDataDogFilter)
        )
        .map((animal) => ({ session, animal }))
    )
    .sort((a, b) =>
      a.session.sessionDate < b.session.sessionDate
        ? 1
        : a.session.sessionDate > b.session.sessionDate
          ? -1
          : 0
    );

  const handleViewHistory = (dogName) => {
    setNotesPopup(null);
    setDogHistoryFilter("");
    setDogHistoryView({ dogName });
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingEntry(null);
  };

  return (
    <div className="training-page-wrapper">
      <div className="decorative-header">
        <img src={spcaLogo} alt="SPCA Serving Allegany County" className="header-logo" />
        <span className="decorative-header-text">Training Section</span>
        <button
          type="button"
          className="header-nav-button"
          onClick={onOpenDogActivity}
        >
          Dog Activity
        </button>
      </div>

      <AddDataButton onClick={() => setIsModalOpen(true)} />

      {isModalShown && (
        <TrainingDataModal
          onClose={handleModalClose}
          onSaved={handleSaved}
          initialSession={editingEntry ? editingEntry.session : null}
          isEditing={editingEntry !== null}
        />
      )}

      <div className="training-log">
        <div className="training-log-date-nav">
          <button
            type="button"
            className="training-log-nav-button"
            onClick={() => setViewedDate((d) => shiftDateISO(d, -1))}
            aria-label="Previous day"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M8.5 1 L3.5 6 L8.5 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <h3>{formatDateISO(viewedDate)}</h3>

          <button
            type="button"
            className="training-log-nav-button"
            onClick={() => setViewedDate((d) => shiftDateISO(d, 1))}
            disabled={isNextDisabled}
            aria-label="Next day"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3.5 1 L8.5 6 L3.5 11" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="training-log-date-picker-row">
          <label>
            <input
              type="date"
              aria-label="Go to date"
              value={viewedDate}
              max={todayISO}
              onChange={(e) => {
                if (e.target.value) {
                  setViewedDate(
                    e.target.value > todayISO ? todayISO : e.target.value
                  );
                }
              }}
            />
          </label>
        </div>

        {!isViewingToday && (
          <button
            type="button"
            className="training-log-today-button"
            onClick={() => setViewedDate(todayISO)}
          >
            Jump to Today
          </button>
        )}

        {!isViewingToday && viewedSessions.length > 0 && (
          <p className="training-log-locked-note">
            Past sessions are locked and cannot be edited or deleted.
          </p>
        )}

        {viewedSessions.length === 0 ? (
          <p className="training-log-empty">
            {isViewingToday
              ? "No training sessions logged today yet."
              : "No training sessions logged on this day."}
          </p>
        ) : (
          viewedSessions.map(({ session, index }) => (
            <div
              className="training-log-entry training-log-entry-clickable"
              key={index}
              role="button"
              tabIndex={0}
              onClick={() => {
                const animal = Array.isArray(session.animals) ? session.animals[0] : null;
                setNotesPopup({
                  title: animal?.name || "Session notes",
                  notes: animal?.notes,
                  grade: animal?.performanceGrade,
                  followUpNotes: animal?.followUpNotes,
                  startTime: animal?.startTime,
                  durationMinutes: animal?.durationMinutes,
                  topic: animal?.topic,
                  topics: animal?.topics,
                  equipment: animal?.equipment,
                  equipmentOtherText: animal?.equipmentOtherText,
                  showHistory: false,
                  additionalOnly: true,
                });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.currentTarget.click();
                }
              }}
            >
              <div className="training-log-entry-header">
                <div className="training-log-entry-info">
                  <div className="training-log-entry-title">
                    <strong>
                      {Array.isArray(session.animals)
                        ? session.animals.map((a) => a.name).join(", ")
                        : session.animalName}
                    </strong>
                  </div>
                  <div className="training-log-entry-trainer training-log-entry-trainer-row">
                    <span>
                      Trainer: {session.trainerFirstName}{" "}
                      {session.trainerLastName}
                    </span>
                    {(Array.isArray(session.animals) ? session.animals : [])
                      .filter((a) => a.startTime || a.durationMinutes)
                      .map((a) => (
                        <span className="training-log-entry-timing" key={a.id}>
                          {session.animals.length > 1 && `${a.name} · `}
                          {a.startTime && `Start: ${a.startTime}`}
                          {a.startTime && a.durationMinutes && " · "}
                          {a.durationMinutes && `Duration: ${a.durationMinutes} min`}
                        </span>
                      ))}
                  </div>
                </div>

                <div className="training-log-entry-side">
                  {isViewingToday && (
                    <div className="training-log-entry-actions">
                      <button
                        type="button"
                        className="training-log-edit-button"
                        onClick={(event) => { event.stopPropagation(); setEditingEntry({ session, index }); }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="training-log-delete-button"
                        onClick={(event) => { event.stopPropagation(); handleDelete(index); }}
                      >
                        Delete
                      </button>
                    </div>
                  )}

                  <div className="training-log-entry-show-notes">
                    {Array.isArray(session.animals)
                      ? session.animals.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="training-log-notes-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setNotesPopup({
                                title: a.name,
                                notes: a.notes,
                                grade: a.performanceGrade,
                                followUpNotes: a.followUpNotes,
                                startTime: a.startTime,
                                durationMinutes: a.durationMinutes,
                                topic: a.topic,
                                topics: a.topics,
                                equipment: a.equipment,
                                equipmentOtherText: a.equipmentOtherText,
                                dogName: a.name,
                                showHistory: true,
                              });
                            }}
                          >
                            Show Notes
                          </button>
                        ))
                      : session.sessionNotes && (
                          <button
                            type="button"
                            className="training-log-notes-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setNotesPopup({
                                title: "Session notes",
                                notes: session.sessionNotes,
                                showHistory: false,
                              });
                            }}
                          >
                            Show Notes
                          </button>
                        )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="view-all-data-wrapper">
        <button
          type="button"
          className="view-all-data-button"
          onClick={() => setIsAllDataOpen(true)}
        >
          View All Data
        </button>
      </div>

      {isAllDataOpen && (
        <div
          className="notes-popup-overlay"
          onClick={() => setIsAllDataOpen(false)}
        >
          <div
            className="dog-history-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="notes-popup-close"
              onClick={() => setIsAllDataOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h4 className="notes-popup-title">All Training Data</h4>

            <div className="dog-history-filter-row all-data-filter-stack">
              <div className="all-data-dog-filter">
                <div className="animal-search-wrapper all-data-dog-search">
                  <div className="input-clearable">
                    <input
                      type="text"
                      placeholder="Search for a dog..."
                      value={allDataDogSearch}
                      onChange={(e) =>
                        handleAllDataDogSearchChange(e.target.value)
                      }
                      onFocus={() => setShowAllDataDogSuggestions(true)}
                      onBlur={() =>
                        setTimeout(() => {
                          setShowAllDataDogSuggestions(false);
                          // Drop unconfirmed typing so the text matches the active filter
                          setAllDataDogSearch(allDataDogFilter);
                        }, 150)
                      }
                      autoComplete="off"
                    />
                    {allDataDogSearch && (
                      <button
                        type="button"
                        className="clear-field-button"
                        onClick={handleClearAllDataDog}
                        aria-label="Clear dog filter"
                        tabIndex={-1}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {showAllDataDogSuggestions &&
                    !allDataDogFilter &&
                    allDataDogMatches.length > 0 && (
                      <ul className="suggestion-list">
                        {allDataDogMatches.map((name) => (
                          <li
                            key={name}
                            className="suggestion-item"
                            onMouseDown={() => handleSelectAllDataDog(name)}
                          >
                            {name}
                          </li>
                        ))}
                      </ul>
                    )}
                </div>
              </div>

              <div className="all-data-date-filter">
                <input
                  type="date"
                  aria-label="Filter by date"
                  value={allDataDateFilter}
                  max={todayISO}
                  onChange={(e) => setAllDataDateFilter(e.target.value)}
                />
                {allDataDateFilter && (
                <button
                  type="button"
                  className="all-data-date-clear"
                  onClick={() => setAllDataDateFilter("")}
                  aria-label="Clear date filter"
                >
                  ×
                </button>
                )}
              </div>
            </div>

            {allDataRecords.length === 0 ? (
              <p className="training-log-empty">
                {[
                  "No training records found",
                  allDataDogFilter && `for ${allDataDogFilter}`,
                  allDataDateFilter && `on ${formatDateISO(allDataDateFilter)}`,
                ]
                  .filter(Boolean)
                  .join(" ")}
                .
              </p>
            ) : (
              allDataRecords.map(({ session, animal }) => {
                const entryKey = `${sessions.indexOf(session)}-${animal.name}`;
                const isExpanded = expandedDataKeys.includes(entryKey);
                const toggleEntry = () =>
                  setExpandedDataKeys((keys) =>
                    keys.includes(entryKey)
                      ? keys.filter((k) => k !== entryKey)
                      : [...keys, entryKey]
                  );

                return (
                  <div className="training-log-entry" key={entryKey}>
                    <button
                      type="button"
                      className="training-log-entry-toggle"
                      onClick={toggleEntry}
                      aria-expanded={isExpanded}
                    >
                      <span className="training-log-entry-summary">
                        <span className="training-log-entry-title">
                          <strong>{animal.name}</strong>
                          <span className="training-log-entry-date">
                            {formatDateISO(session.sessionDate)}
                          </span>
                        </span>
                        <span className="training-log-entry-trainer">
                          Trainer: {session.trainerFirstName}{" "}
                          {session.trainerLastName}
                        </span>
                        {(animal.startTime || animal.durationMinutes) && (
                          <span className="training-log-entry-trainer">
                            {animal.startTime && `Start: ${animal.startTime}`}
                            {animal.startTime && animal.durationMinutes && " · "}
                            {animal.durationMinutes && `Duration: ${animal.durationMinutes} min`}
                          </span>
                        )}
                      </span>
                      <span
                        className={`training-log-expand-arrow${isExpanded ? " open" : ""}`}
                        aria-hidden="true"
                      >
                        ▾
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="training-log-entry-notes">
                        {animal.topic && <div><strong>Topic:</strong> {animal.topic}</div>}
                        {(animal.equipment?.length || animal.equipmentOtherText) && (
                          <div><strong>Tools used:</strong> {[...(animal.equipment || []), animal.equipmentOtherText].filter(Boolean).join(", ")}</div>
                        )}
                        {animal.performanceGrade != null && <div><strong>Grade:</strong> {animal.performanceGrade}/100</div>}
                        <div><strong>Additional notes:</strong> {animal.notes || "None."}</div>
                        <div><strong>Other things to work on:</strong> {animal.followUpNotes || "None."}</div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {notesPopup && (
        <div
          className="notes-popup-overlay"
          onClick={() => setNotesPopup(null)}
        >
          <div
            className={`notes-popup${notesPopup.additionalOnly ? " notes-popup-compact" : ""}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="notes-popup-close"
              onClick={() => setNotesPopup(null)}
              aria-label="Close"
            >
              ×
            </button>
            <h4 className="notes-popup-title">{notesPopup.title}</h4>

            {notesPopup.grade != null && (
              <div className="notes-popup-grade">
                Grade: {notesPopup.grade}/100
              </div>
            )}

            <div className="additional-notes-content">
              {
                <>
                  {notesPopup.startTime && <div><strong>Start:</strong> {notesPopup.startTime}</div>}
                  {notesPopup.durationMinutes && <div><strong>Duration:</strong> {notesPopup.durationMinutes} min</div>}
                  {(notesPopup.topics?.length || notesPopup.topic) && (
                    <div><strong>Topic:</strong> {(notesPopup.topics?.length ? notesPopup.topics : [notesPopup.topic]).filter(Boolean).join(", ")}</div>
                  )}
                  {(notesPopup.equipment?.length || notesPopup.equipmentOtherText) && (
                    <div><strong>Equipment:</strong> {[...(notesPopup.equipment || []), notesPopup.equipmentOtherText].filter(Boolean).join(", ")}</div>
                  )}
                </>
              }
              <div className="additional-notes-followup">
                <strong>Additional notes:</strong>{" "}
                {notesPopup.notes || "None."}
              </div>
              <div className="additional-notes-followup">
                <strong>Other things to work on:</strong>{" "}
                {notesPopup.followUpNotes || "None."}
              </div>
            </div>

            {notesPopup.showHistory && notesPopup.dogName && (
              <button
                type="button"
                className="notes-popup-history-button"
                onClick={() => handleViewHistory(notesPopup.dogName)}
              >
                Past Training Records
              </button>
            )}
          </div>
        </div>
      )}

      {dogHistoryView && (
        <div
          className="notes-popup-overlay"
          onClick={() => setDogHistoryView(null)}
        >
          <div
            className="dog-history-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="notes-popup-close"
              onClick={() => setDogHistoryView(null)}
              aria-label="Close"
            >
              ×
            </button>

            <h4 className="notes-popup-title">
              {dogHistoryView.dogName}'s Past Training Records
            </h4>

            <div className="dog-history-filter-row">
              <div className="all-data-date-filter">
                <input
                  type="date"
                  aria-label="Filter by date"
                  value={dogHistoryFilter}
                  max={todayISO}
                  onChange={(e) => setDogHistoryFilter(e.target.value)}
                />
                {dogHistoryFilter && (
                <button
                  type="button"
                  className="all-data-date-clear"
                  onClick={() => setDogHistoryFilter("")}
                  aria-label="Clear date filter"
                >
                  ×
                </button>
                )}
              </div>
            </div>

            {dogHistoryRecords.length === 0 ? (
              <p className="training-log-empty">
                {dogHistoryFilter
                  ? "No training records for this date."
                  : "No training records found for this dog."}
              </p>
            ) : (
              dogHistoryRecords.map(({ session, animal }, i) => (
                <div className="training-log-entry" key={i}>
                  <div className="training-log-entry-header">
                    <strong>{formatDateISO(session.sessionDate)}</strong>
                  </div>
                  <div className="training-log-entry-trainer">
                    Trainer: {session.trainerFirstName}{" "}
                    {session.trainerLastName}
                  </div>
                  <div className="training-log-entry-notes">
                    {(animal.startTime || animal.durationMinutes) && (
                      <div className="training-log-animal-meta">
                        {animal.startTime && `Start: ${animal.startTime}`}
                        {animal.durationMinutes &&
                          ` · Duration: ${animal.durationMinutes} min`}
                      </div>
                    )}
                    {animal.performanceGrade != null && (
                      <div className="training-log-animal-meta">
                        Grade: {animal.performanceGrade}/100
                      </div>
                    )}
                    <AdditionalNotesDropdown
                      notes={animal.notes}
                      followUpNotes={animal.followUpNotes}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default TrainingPage;
