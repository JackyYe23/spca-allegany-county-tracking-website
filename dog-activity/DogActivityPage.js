import React, { useState } from "react";
import "../common/styles/TrainingPage.css";

import AddActivityModal from "./AddActivityModal";
import AddDataButton from "../common/components/AddDataButton";
import EXAMPLE_DOGS from "../common/data/exampleDogs";
import spcaLogo from "../common/assets/spca-logo.png";

const ACTIVITY_KEY = "dogActivity.entries";

// "14:30" -> "2:30 PM"
function formatTime12(time) {
  const [hours, minutes] = time.split(":").map(Number);
  const period = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${String(minutes).padStart(2, "0")} ${period}`;
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
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

function getTodayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function readList(key) {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
}

// Names of dogs with no activity logged on this page for the given day
function getDogsWithoutActivity(date) {
  const dogsWithActivity = new Set(
    readList(ACTIVITY_KEY)
      .filter((session) => session.sessionDate === date)
      .flatMap((session) =>
      Array.isArray(session.animals)
        ? session.animals.map((a) => a.name)
        : [session.animalName]
    )
  );
  return EXAMPLE_DOGS.filter((dog) => !dogsWithActivity.has(dog.name)).map(
    (dog) => dog.name
  );
}

function DogActivityPage({ onBack }) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [activities, setActivities] = useState(() => readList(ACTIVITY_KEY));
  const [expandedKeys, setExpandedKeys] = useState([]);
  const [viewedDate, setViewedDate] = useState(getTodayISO);

  const todayISO = getTodayISO();
  const isViewingToday = viewedDate === todayISO;
  const isNextDisabled = viewedDate >= todayISO;
  // Keeps each entry's position in the full list, so delete and expand still find it
  const viewedActivities = activities
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.sessionDate === viewedDate);

  // Recalculated on every render, so the count updates after each save
  const dogsWithoutActivity = getDogsWithoutActivity(viewedDate);

  // Each dog gets its own entry, sharing the trainer, date and activity of the form
  const handleSaved = (sessionData) => {
    const savedAt = new Date().toISOString();
    const entries = sessionData.animals.map((animal) => ({
      ...sessionData,
      animals: [animal],
      savedAt,
    }));
    const updated = [...entries, ...activities];

    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(updated));
    } catch {
      // localStorage unavailable - the entries still show for this visit
    }
    setActivities(updated);
    setIsAddOpen(false);
  };

  const handleDelete = (index) => {
    if (
      !window.confirm(
        "Delete this activity entry? This cannot be undone."
      )
    ) {
      return;
    }
    const updated = activities.filter((_, i) => i !== index);
    try {
      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(updated));
    } catch {
      // localStorage unavailable - the entry is still removed for this visit
    }
    setActivities(updated);
  };

  return (
    <div className="training-page-wrapper">
      <div className="decorative-header">
        <img src={spcaLogo} alt="SPCA Serving Allegany County" className="header-logo" />
        <span className="decorative-header-text">Dog Activity</span>
        <button type="button" className="header-nav-button" onClick={onBack}>
          ← Back to Training
        </button>

        <button
          type="button"
          className="header-alerts-button"
          onClick={() => setAlertsOpen((open) => !open)}
          aria-expanded={alertsOpen}
        >
          Alerts
          {dogsWithoutActivity.length > 0 && (
            <span className="header-alerts-badge">
              {dogsWithoutActivity.length}
            </span>
          )}
        </button>
      </div>

      {alertsOpen && (
        <div className="notes-popup-overlay" onClick={() => setAlertsOpen(false)}>
          <div
            className="notes-popup"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="notes-popup-close"
              onClick={() => setAlertsOpen(false)}
              aria-label="Close"
            >
              ×
            </button>

            <h4 className="notes-popup-title">
              {isViewingToday ? "No activity yet" : "No activity on this day"}
            </h4>

            {dogsWithoutActivity.length === 0 ? (
              <p className="header-alerts-empty">Every dog has activity.</p>
            ) : (
              <ul className="header-alerts-list">
                {dogsWithoutActivity.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <AddDataButton label="+ Add Activity" onClick={() => setIsAddOpen(true)} />

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
                  setViewedDate(e.target.value > todayISO ? todayISO : e.target.value);
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
      </div>

      {!isViewingToday && viewedActivities.length > 0 && (
        <p className="training-log-locked-note">
          Past activity is locked and cannot be deleted.
        </p>
      )}

      {viewedActivities.length === 0 ? (
        <p className="training-log-empty">
          {isViewingToday
            ? "No activity logged today yet."
            : "No activity logged on this day."}
        </p>
      ) : (
        <div className="training-log">
          {viewedActivities.map(({ entry, index }) => {
            const animal = entry.animals[0];
            const activityType = animal.activityType || entry.activityType || "";
            const entryKey = `${entry.savedAt}-${index}`;
            const isExpanded = expandedKeys.includes(entryKey);
            const toggleEntry = () =>
              setExpandedKeys((keys) =>
                keys.includes(entryKey)
                  ? keys.filter((key) => key !== entryKey)
                  : [...keys, entryKey]
              );

            const activityPhrase = !activityType
              ? "an activity"
              : activityType === "Walk"
                ? "a walk"
                : `a ${activityType}`;
            const when =
              entry.sessionDate === getTodayISO()
                ? "today"
                : `on ${entry.sessionDate}`;
            // Next time is written in the training section for L2 Enrichment
            const nextTime =
              animal.trainingDetails?.followUpNotes || animal.followUpNotes;
            const time = animal.startTime
              ? ` at ${formatTime12(animal.startTime)}`
              : "";
            // Enrichments name their level, e.g. "did a L1 enrichment at 14:30"
            const isEnrichment = Boolean(activityType.endsWith("Enrichment"));
            const summaryText = isEnrichment
              ? `${animal.name} did a ${activityType.split(" ")[0]} enrichment${time}`
              : `${animal.name} did ${activityPhrase} ${when}${time}`;

            return (
              <div className="training-log-entry" key={entryKey}>
                <button
                  type="button"
                  className="activity-entry-toggle"
                  onClick={toggleEntry}
                  aria-expanded={isExpanded}
                >
                  <span className="activity-entry-summary">{summaryText}</span>
                  <span
                    className={`training-log-expand-arrow${isExpanded ? " open" : ""}`}
                    aria-hidden="true"
                  >
                    ▾
                  </span>
                </button>

                {isExpanded && (
                  <div className="activity-detail-panel">
                    {animal.startTime && (
                      <div className="activity-detail-row">
                        <strong>Start time:</strong>{" "}
                        {formatTime12(animal.startTime)}
                      </div>
                    )}
                    {animal.durationMinutes && (
                      <div className="activity-detail-row">
                        <strong>Duration:</strong> {animal.durationMinutes} min
                      </div>
                    )}
                    {hasValue(animal.performanceGrade) && (
                      <div className="activity-detail-row">
                        <strong>Grade:</strong> {animal.performanceGrade}/100
                      </div>
                    )}
                    {entry.area && (
                      <div className="activity-detail-row">
                        <strong>Area:</strong> {entry.area}
                      </div>
                    )}
                    {(animal.topics?.length > 0 || animal.topic) && (
                      <div className="activity-detail-row">
                        <strong>Activities:</strong>{" "}
                        {animal.topics?.length > 0
                          ? animal.topics.join(", ")
                          : animal.topic}
                      </div>
                    )}
                    {animal.trainingDetails && (
                      <div className="activity-detail-row">
                        <strong>Training:</strong>{" "}
                        {[
                          animal.trainingDetails.topic,
                          animal.trainingDetails.durationMinutes !== "" &&
                            `${animal.trainingDetails.durationMinutes} min`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {activityType === "Walk" && (
                      <>
                        <div className="activity-detail-row">
                          <strong>Did the dog poop?</strong>{" "}
                          {animal.pooped ? animal.stoolType || "Yes" : "No"}
                        </div>
                        <div className="activity-detail-row">
                          <strong>Did the dog urine?</strong>{" "}
                          {animal.urinated ? "Yes" : "No"}
                        </div>
                        <div className="activity-detail-row">
                          <strong>How many treats did the dog receive?</strong>{" "}
                          {animal.treats ? animal.treatAmount || "Yes" : "None"}
                        </div>
                      </>
                    )}
                    {animal.notes && (
                      <div className="activity-detail-row">
                        <strong>Additional notes:</strong> {animal.notes}
                      </div>
                    )}
                    {nextTime && (
                      <div className="activity-detail-row">
                        <strong>Next time:</strong> {nextTime}
                      </div>
                    )}
                    <div className="activity-detail-row">
                      <strong>Logged by:</strong> {entry.trainerFirstName}{" "}
                      {entry.trainerLastName}
                    </div>
                    <div className="activity-detail-row">
                      <strong>Logged at:</strong>{" "}
                      {new Date(entry.savedAt).toLocaleString(undefined, {
                        dateStyle: "long",
                        timeStyle: "short",
                      })}
                    </div>
                    {isViewingToday && (
                      <button
                        type="button"
                        className="training-log-delete-button"
                        onClick={() => handleDelete(index)}
                      >
                        Delete Entry
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {isAddOpen && (
        <AddActivityModal
          onClose={() => setIsAddOpen(false)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

export default DogActivityPage;
