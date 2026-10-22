import React, { useEffect, useRef, useState } from "react";
import "./TrainingDataModal.css";
import EXAMPLE_DOGS from "./exampleDogs";
import TRAINING_TOPICS from "./trainingTopics";

// Checklist topics for each enrichment level, listed alphabetically
const ENRICHMENT_CHECKLISTS = {
  "L1 Enrichment": [
    "Bonding",
    "Interactive treat/ toys",
    "Kongs",
    "Sensory enrichment",
    "Snuggles",
    "Yard time",
  ],
  "L2 Enrichment": ["Puzzle toys", "Training"],
};
import EQUIPMENT_OPTIONS from "./equipmentOptions";

const DRAFT_KEY = "dogActivity.draft";

function getTodayISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function getNowTime() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

// A start time can't be later than the current time on today's session
function isStartTimeInFuture(dog, sessionDate) {
  return sessionDate === getTodayISO() && (dog.startTime || "") > getNowTime();
}

const TRAINING_SESSIONS_KEY = "trainingPage.sessions";

function readTrainingSessions() {
  try {
    return JSON.parse(localStorage.getItem(TRAINING_SESSIONS_KEY)) || [];
  } catch {
    return [];
  }
}

// The training record for this dog from today, if there is one
function findTodaysTraining(dogName) {
  for (const session of readTrainingSessions()) {
    if (session.sessionDate !== getTodayISO()) continue;
    const animals = Array.isArray(session.animals)
      ? session.animals
      : [{ name: session.animalName }];
    const animal = animals.find((a) => a.name === dogName);
    if (animal) return { session, animal };
  }
  return null;
}

// Fields the training form uses for a dog, from a training record
function trainingFieldsFromRecord({ animal }) {
  return {
    startTime: animal.startTime || "",
    durationMinutes: animal.durationMinutes ?? "",
    topic: animal.topic || "",
    equipment: animal.equipment || [],
    equipmentOtherChecked: Boolean(animal.equipmentOtherChecked),
    equipmentOtherText: animal.equipmentOtherText || "",
    performanceGrade: animal.performanceGrade ?? "",
    notes: animal.notes || "",
    followUpNotes: animal.followUpNotes || "",
    fromRecord: true,
  };
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage unavailable (e.g. private browsing) - drafts just won't persist
  }
}

function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}

const ENRICHMENT_LEVELS = [
  { value: "L1 Enrichment", label: "L1" },
  { value: "L2 Enrichment", label: "L2" },
];
const isEnrichmentType = (type) =>
  ENRICHMENT_LEVELS.some((level) => level.value === type);
const STOOL_TYPES = ["Normal", "Soft", "Diarrhea"];
const TREAT_AMOUNTS = ["1-5", "5-10", ">10"];

function hasTopic(dog, hasChecklist) {
  return hasChecklist
    ? (dog.topics || []).length > 0
    : (dog.topic || "").trim() !== "";
}

// Start time and duration come from the activity fields when there is no training record
function trainingIsFilled(details) {
  return Boolean(details && (details.topic || "").trim());
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function ReadOnlyRow({ label, value }) {
  if (value === "" || value == null) return null;
  return (
    <div className="training-readonly-row">
      <strong>{label}:</strong> {value}
    </div>
  );
}

function isDogSessionComplete(dog, isWalk, hasChecklist) {
  // Checking Training needs its details filled in first
  const needsTraining = (dog.topics || []).includes("Training");
  const usesTrainingRecord = needsTraining && Boolean(dog.trainingDetails?.fromRecord);
  return (
    (usesTrainingRecord ||
      ((dog.startTime || "").trim() &&
        String(dog.durationMinutes ?? "").trim() !== "")) &&
    (isWalk || hasTopic(dog, hasChecklist)) &&
    (!needsTraining || trainingIsFilled(dog.trainingDetails))
  );
}

function ClearFieldButton({ onClick, disabled }) {
  return (
    <button
      type="button"
      className="clear-field-button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Clear field"
      tabIndex={-1}
    >
      ×
    </button>
  );
}

function AddActivityModal({
  onClose,
  onSaved,
  initialSession = null,
  isEditing = false,
}) {
  const initialDraft = isEditing ? {} : loadDraft();

  const [trainerFirstName, setTrainerFirstName] = useState(
    isEditing
      ? initialSession?.trainerFirstName || ""
      : initialDraft.trainerFirstName || ""
  );
  const [trainerLastName, setTrainerLastName] = useState(
    isEditing
      ? initialSession?.trainerLastName || ""
      : initialDraft.trainerLastName || ""
  );
  const [searchTerm, setSearchTerm] = useState(initialDraft.searchTerm || "");
  const [area, setArea] = useState(initialDraft.area || "");
  const [activityType, setActivityType] = useState(
    initialDraft.activityType || ""
  );
  const [showEnrichmentLevels, setShowEnrichmentLevels] = useState(false);
  const [selectedAnimals, setSelectedAnimals] = useState(() => {
    if (isEditing) {
      return Array.isArray(initialSession?.animals)
        ? initialSession.animals.map((a) => ({ ...a }))
        : [];
    }
    return Array.isArray(initialDraft.selectedAnimals)
      ? initialDraft.selectedAnimals
      : [];
  });
  const [expandedAnimalId, setExpandedAnimalId] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const updateDog = (dogId, changes) =>
    setSelectedAnimals((animals) =>
      animals.map((a) => (a.id === dogId ? { ...a, ...changes } : a))
    );

  // Checking Training shows the training fields inline, filled from today's training if there is one
  const handleTrainingToggle = (dog, checked) => {
    if (!checked) {
      updateDog(dog.id, {
        topics: (dog.topics || []).filter((t) => t !== "Training"),
        trainingDetails: null,
      });
      return;
    }
    const todays = findTodaysTraining(dog.name);
    updateDog(dog.id, {
      topics: [...(dog.topics || []), "Training"],
      trainingDetails: todays
        ? trainingFieldsFromRecord(todays)
        : {
            startTime: "",
            durationMinutes: "",
            topic: "",
            fromRecord: false,
            equipment: [],
            equipmentOtherChecked: false,
            equipmentOtherText: "",
            notes: "",
            followUpNotes: "",
          },
    });
  };

  const trainingOf = (dog) => dog.trainingDetails || {};
  // A training logged today supplies the start time and duration, so the card hides them
  const usesTrainingRecord = (dog) =>
    (dog.topics || []).includes("Training") && Boolean(trainingOf(dog).fromRecord);

  const updateTrainingField = (dog, field, value) =>
    updateDog(dog.id, {
      trainingDetails: { ...(dog.trainingDetails || {}), [field]: value },
    });
  const [sessionDate, setSessionDate] = useState(
    isEditing
      ? initialSession?.sessionDate || getTodayISO()
      : initialDraft.sessionDate || getTodayISO()
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showTopicSuggestions, setShowTopicSuggestions] = useState(false);

  const dogCardRefs = useRef({});

  // Lock background page scroll while the modal is open, so any scroll
  // attempt (even over the dimmed overlay) only moves the modal's own
  // scrollable content instead of the page behind it.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    if (isEditing) return;

    saveDraft({
      trainerFirstName,
      trainerLastName,
      searchTerm,
      area,
      activityType,
      selectedAnimals,
      sessionDate,
    });
  }, [
    isEditing,
    trainerFirstName,
    trainerLastName,
    searchTerm,
    area,
    activityType,
    selectedAnimals,
    sessionDate,
  ]);

  // Scroll the expanded dog's whole card into view, so the dropdown that
  // was just opened is fully visible instead of being scrolled past (or
  // left partially hidden above/below the modal's visible area).
  useEffect(() => {
    if (expandedAnimalId) {
      const cardEl = dogCardRefs.current[expandedAnimalId];

      if (cardEl) {
        requestAnimationFrame(() => {
          cardEl.scrollIntoView({ behavior: "auto", block: "nearest" });
        });
      }
    }
  }, [expandedAnimalId]);

  // Walks must be at least 10 minutes long and have no upper limit
  const WALK_MIN_MINUTES = 10;
  const isWalk = activityType === "Walk";
  const hasChecklist = Boolean(ENRICHMENT_CHECKLISTS[activityType]);
  const checklistTopics = ENRICHMENT_CHECKLISTS[activityType] || [];
  const isEnrichmentOpen =
    showEnrichmentLevels || isEnrichmentType(activityType);
  const isWalkTooShort = (dog) =>
    isWalk &&
    dog.durationMinutes !== "" &&
    Number(dog.durationMinutes) < WALK_MIN_MINUTES;

  const canSubmit =
    trainerFirstName.trim() &&
    trainerLastName.trim() &&
    selectedAnimals.length > 0 &&
    sessionDate.trim() &&
    !selectedAnimals.some((dog) => isStartTimeInFuture(dog, sessionDate)) &&
    selectedAnimals.every((dog) => isDogSessionComplete(dog, isWalk, hasChecklist)) &&
    !selectedAnimals.some(isWalkTooShort);

  // Empty required fields are highlighted once Submit has been tried
  const isMissing = (value) => String(value ?? "").trim() === "";
  const fieldClass = (isInvalid) =>
    showErrors && isInvalid ? " field-missing" : "";
  const dogIsIncomplete = (dog) =>
    !isDogSessionComplete(dog, isWalk, hasChecklist) ||
    isWalkTooShort(dog) ||
    isStartTimeInFuture(dog, sessionDate);

  const handleSubmitClick = () => {
    if (!canSubmit) {
      setShowErrors(true);
      const firstIncomplete = selectedAnimals.find(dogIsIncomplete);
      if (firstIncomplete) setExpandedAnimalId(firstIncomplete.id);
      return;
    }
    handleSubmit();
  };

  const trimmedSearch = searchTerm.trim();

  // With no area chosen, every dog in the shelter can be picked
  const matchingDogs = EXAMPLE_DOGS.filter((dog) => {
    if (area && dog.location !== area) return false;
    const alreadySelected = selectedAnimals.some((a) => a.id === dog.id);
    if (alreadySelected) return false;
    if (!trimmedSearch) return true;
    return dog.name.toLowerCase().includes(trimmedSearch.toLowerCase());
  });

  const exactMatchExists =
    trimmedSearch &&
    EXAMPLE_DOGS.some(
      (dog) => dog.name.toLowerCase() === trimmedSearch.toLowerCase()
    );
  const alreadySelectedMatch =
    trimmedSearch &&
    selectedAnimals.some(
      (a) => a.name.toLowerCase() === trimmedSearch.toLowerCase()
    );
  const showAddCustomOption =
    trimmedSearch && !exactMatchExists && !alreadySelectedMatch;

  const handleSelectDog = (dog) => {
    setSelectedAnimals([
      ...selectedAnimals,
      {
        ...dog,
        startTime: "",
        durationMinutes: "",
        topic: "",
        equipment: [],
        equipmentOtherChecked: false,
        equipmentOtherText: "",
        performanceGrade: 50,
        followUpNotes: "",
        notes: "",
      },
    ]);
    setSearchTerm("");
    setShowSuggestions(false);
  };

  const handleAddCustomDog = (name) => {
    const newDog = {
      id: `custom-${Date.now()}`,
      name,
      startTime: "",
      durationMinutes: "",
      topic: "",
      equipment: [],
      equipmentOtherChecked: false,
      equipmentOtherText: "",
      performanceGrade: 50,
      followUpNotes: "",
      notes: "",
    };
    setSelectedAnimals([...selectedAnimals, newDog]);
    setSearchTerm("");
    setShowSuggestions(false);
  };

  const handleRemoveDog = (dogId) => {
    setSelectedAnimals(selectedAnimals.filter((a) => a.id !== dogId));
    if (expandedAnimalId === dogId) setExpandedAnimalId(null);
  };

  const handleDogFieldChange = (dogId, field, value) => {
    setSelectedAnimals(
      selectedAnimals.map((a) => (a.id === dogId ? { ...a, [field]: value } : a))
    );
  };

  const handleToggleEquipment = (dogId, item) => {
    setSelectedAnimals(
      selectedAnimals.map((a) => {
        if (a.id !== dogId) return a;
        const current = a.equipment || [];
        const next = current.includes(item)
          ? current.filter((x) => x !== item)
          : [...current, item];
        return { ...a, equipment: next };
      })
    );
  };

  const handleToggleOtherEquipment = (dogId) => {
    setSelectedAnimals(
      selectedAnimals.map((a) => {
        if (a.id !== dogId) return a;
        const nextChecked = !a.equipmentOtherChecked;
        return {
          ...a,
          equipmentOtherChecked: nextChecked,
          equipmentOtherText: nextChecked ? a.equipmentOtherText || "" : "",
        };
      })
    );
  };

  const toggleExpandDog = (dogId) => {
    setExpandedAnimalId(expandedAnimalId === dogId ? null : dogId);
  };

  const handleClose = () => {
    if (!isEditing) clearDraft();
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    if (!isEditing) clearDraft();

    onSaved({
      trainerFirstName: trainerFirstName.trim(),
      trainerLastName: trainerLastName.trim(),
      animals: selectedAnimals.map((a) => ({
        ...a,
        equipmentOtherText: (a.equipmentOtherText || "").trim(),
        performanceGrade:
          a.performanceGrade === "" || a.performanceGrade == null
            ? 50
            : a.performanceGrade,
        followUpNotes: (a.followUpNotes || "").trim(),
        notes: (a.notes || "").trim(),
        ...(a.trainingDetails?.fromRecord
          ? {
              startTime: a.trainingDetails.startTime,
              durationMinutes: a.trainingDetails.durationMinutes,
              performanceGrade: a.trainingDetails.performanceGrade,
              notes: a.trainingDetails.notes,
            }
          : {}),
        trainingDetails:
          a.trainingDetails && !a.trainingDetails.fromRecord
            ? {
                ...a.trainingDetails,
                startTime: a.startTime,
                durationMinutes: a.durationMinutes,
              }
            : a.trainingDetails,
      })),
      sessionDate,
      activityType,
      area,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="close-button" onClick={handleClose} type="button">
          ×
        </button>

        <h2>{isEditing ? "Edit Training Session" : "Add Activity"}</h2>

        <div className="name-fields">
          <div className="input-clearable">
            <input
              type="text"
              placeholder="First Name"
              className={`name-input${fieldClass(isMissing(trainerFirstName))}`}
              value={trainerFirstName}
              onChange={(e) => setTrainerFirstName(e.target.value)}
              disabled={isSubmitting}
            />
            {trainerFirstName && (
              <ClearFieldButton
                onClick={() => setTrainerFirstName("")}
                disabled={isSubmitting}
              />
            )}
          </div>
          <div className="input-clearable">
            <input
              type="text"
              placeholder="Last Name"
              className={`name-input${fieldClass(isMissing(trainerLastName))}`}
              value={trainerLastName}
              onChange={(e) => setTrainerLastName(e.target.value)}
              disabled={isSubmitting}
            />
            {trainerLastName && (
              <ClearFieldButton
                onClick={() => setTrainerLastName("")}
                disabled={isSubmitting}
              />
            )}
          </div>
        </div>

        <div className="form-question activity-area-field">
          <label>Area</label>
          <select
            className={`activity-area-select${area ? "" : " is-placeholder"}`}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            disabled={isSubmitting}
          >
            <option value="">Select an area to filter by...</option>
            <option value="Adoption Wing">Adoption Wing</option>
            <option value="Quarantine">Quarantine</option>
            <option value="Meet and Greet">Meet and Greet</option>
          </select>
        </div>

        <div className="form-question activity-type-field">
          <div className="activity-type-buttons">
            <button
              type="button"
              className={`activity-type-button${activityType === "Walk" ? " is-selected" : ""}`}
              aria-pressed={activityType === "Walk"}
              disabled={isSubmitting}
              onClick={() => {
                // Walk and Enrichment can be switched between, but only one is checked
                setActivityType(activityType === "Walk" ? "" : "Walk");
                setShowEnrichmentLevels(false);
              }}
            >
              Walk
            </button>
            <button
              type="button"
              className={`activity-type-button${isEnrichmentOpen ? " is-selected" : ""}`}
              aria-pressed={isEnrichmentOpen}
              disabled={isSubmitting}
              onClick={() => {
                if (isEnrichmentType(activityType)) {
                  // Clicking Enrichment again clears the chosen level
                  setActivityType("");
                  setShowEnrichmentLevels(false);
                } else if (activityType === "Walk") {
                  // Switching from Walk leaves the level to be picked
                  setActivityType("");
                  setShowEnrichmentLevels(true);
                } else {
                  setShowEnrichmentLevels((open) => !open);
                }
              }}
            >
              Enrichment
            </button>
          </div>

          {isEnrichmentOpen && (
            <div className="activity-type-buttons">
              {ENRICHMENT_LEVELS.map((level) => {
                const isOn = activityType === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    className={`activity-type-button${isOn ? " is-selected" : ""}`}
                    aria-pressed={isOn}
                    disabled={isSubmitting}
                    onClick={() => {
                      // L1 and L2 can be switched between, but only one is checked
                      setActivityType(isOn ? "" : level.value);
                      setShowEnrichmentLevels(true);
                    }}
                  >
                    {level.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="form-question animal-search-wrapper">
          <label>
            Animals
          </label>
          <div className="input-clearable">
            <input
              type="text"
              placeholder="Search for a dog..."
              className={fieldClass(selectedAnimals.length === 0).trim()}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
              disabled={isSubmitting}
              autoComplete="off"
            />
            {searchTerm && (
              <ClearFieldButton
                onClick={() => setSearchTerm("")}
                disabled={isSubmitting}
              />
            )}
          </div>

          {showSuggestions && (matchingDogs.length > 0 || showAddCustomOption) && (
            <ul className="suggestion-list">
              {matchingDogs.map((dog) => (
                <li
                  key={dog.id}
                  className="suggestion-item"
                  onMouseDown={() => handleSelectDog(dog)}
                >
                  {dog.name}
                </li>
              ))}

              {showAddCustomOption && (
                <li
                  className="suggestion-item suggestion-item-add"
                  onMouseDown={() => handleAddCustomDog(trimmedSearch)}
                >
                  + Add "{trimmedSearch}"
                </li>
              )}
            </ul>
          )}
        </div>

        {selectedAnimals.length > 0 && (
          <div className="dog-pill-group">
            {selectedAnimals.map((dog) => {
              const isExpanded = expandedAnimalId === dog.id;

              return (
                <div
                  className={`dog-pill-card${showErrors && dogIsIncomplete(dog) ? " field-missing" : ""}`}
                  key={dog.id}
                  ref={(el) => (dogCardRefs.current[dog.id] = el)}
                >
                  <div
                    className="dog-pill-header"
                    onClick={() => toggleExpandDog(dog.id)}
                  >
                    <button
                      type="button"
                      className="pill-remove-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveDog(dog.id);
                      }}
                      aria-label={`Remove ${dog.name}`}
                    >
                      ×
                    </button>

                    <strong>{dog.name}</strong>

                    <span
                      className={`dropdown-arrow ${
                        isExpanded ? "dropdown-arrow-open" : ""
                      }`}
                    >
                      ▾
                    </span>
                  </div>

                  {isExpanded && (
                    <div
                      className="dog-pill-body"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {!usesTrainingRecord(dog) && (
                      <div className="dog-pill-time-row">
                        <div className="dog-pill-field">
                          <label className="dog-pill-notes-label">
                            Start time
                          </label>
                          <input
                            type="time"
                            className={fieldClass(isMissing(dog.startTime) || isStartTimeInFuture(dog, sessionDate)).trim()}
                            max={sessionDate === getTodayISO() ? getNowTime() : undefined}
                            value={dog.startTime || ""}
                            onChange={(e) =>
                              handleDogFieldChange(
                                dog.id,
                                "startTime",
                                e.target.value
                              )
                            }
                            disabled={isSubmitting}
                          />
                          {isStartTimeInFuture(dog, sessionDate) && (
                            <div className="duration-error">Start time can't be later than now</div>
                          )}
                        </div>

                        <div className="dog-pill-field">
                          <label className="dog-pill-notes-label">
                            Duration (minutes)
                          </label>
                          <input
                            type="number"
                            min="0"
                            {...(isWalk ? {} : { max: "180" })}
                            step="1"
                            placeholder={isWalk ? "e.g. 30" : "e.g. 30 (max 180)"}
                            className={fieldClass(isMissing(dog.durationMinutes) || isWalkTooShort(dog)).trim()}
                            value={dog.durationMinutes || ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const clamped =
                                raw === ""
                                  ? ""
                                  : isWalk
                                    ? Math.max(0, Number(raw))
                                    : Math.min(180, Math.max(0, Number(raw)));
                              handleDogFieldChange(
                                dog.id,
                                "durationMinutes",
                                clamped
                              );
                            }}
                            disabled={isSubmitting}
                          />
                          {isWalkTooShort(dog) && (
                            <div className="duration-error">
                              Walks need to be at least {WALK_MIN_MINUTES} minutes.
                            </div>
                          )}
                        </div>
                      </div>

                      )}

                      {isWalk && (
                        <div className="walk-checks">
                          <label className="walk-check">
                            <input
                              type="checkbox"
                              checked={Boolean(dog.pooped)}
                              onChange={(e) =>
                                // Clear the stool type when poop is unchecked
                                setSelectedAnimals(
                                  selectedAnimals.map((a) =>
                                    a.id === dog.id
                                      ? {
                                          ...a,
                                          pooped: e.target.checked,
                                          stoolType: "",
                                        }
                                      : a
                                  )
                                )
                              }
                              disabled={isSubmitting}
                            />
                            Did the dog poop?
                          </label>
                          {dog.pooped && (
                            <div className="walk-sub-checks">
                              {STOOL_TYPES.map((type) => (
                                <label key={type} className="walk-sub-check">
                                  <input
                                    type="checkbox"
                                    checked={dog.stoolType === type}
                                    onChange={(e) =>
                                      handleDogFieldChange(
                                        dog.id,
                                        "stoolType",
                                        e.target.checked ? type : ""
                                      )
                                    }
                                    disabled={isSubmitting}
                                  />
                                  {type}
                                </label>
                              ))}
                            </div>
                          )}
                          <label className="walk-check">
                            <input
                              type="checkbox"
                              checked={Boolean(dog.urinated)}
                              onChange={(e) =>
                                handleDogFieldChange(dog.id, "urinated", e.target.checked)
                              }
                              disabled={isSubmitting}
                            />
                            Did the dog urine?
                          </label>
                          <label className="walk-check">
                            <input
                              type="checkbox"
                              checked={Boolean(dog.treats)}
                              onChange={(e) =>
                                // Clear the amount when treats is unchecked
                                setSelectedAnimals(
                                  selectedAnimals.map((a) =>
                                    a.id === dog.id
                                      ? {
                                          ...a,
                                          treats: e.target.checked,
                                          treatAmount: "",
                                        }
                                      : a
                                  )
                                )
                              }
                              disabled={isSubmitting}
                            />
                            Did the dog receive any treats?
                          </label>
                          {dog.treats && (
                            <div className="walk-sub-checks">
                              {TREAT_AMOUNTS.map((amount) => (
                                <label key={amount} className="walk-sub-check">
                                  <input
                                    type="checkbox"
                                    checked={dog.treatAmount === amount}
                                    onChange={(e) =>
                                      handleDogFieldChange(
                                        dog.id,
                                        "treatAmount",
                                        e.target.checked ? amount : ""
                                      )
                                    }
                                    disabled={isSubmitting}
                                  />
                                  {amount}
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {hasChecklist && (
                        <div className="form-question">
                          <label className="dog-pill-notes-label">Topics</label>
                          <div
                            className={`topic-checklist${fieldClass(!hasTopic(dog, true))}`}
                          >
                            {checklistTopics.map((topic) => {
                              const checkedTopics = dog.topics || [];
                              const isChecked = checkedTopics.includes(topic);
                              return (
                                <label key={topic} className="topic-check">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() =>
                                      topic === "Training"
                                        ? handleTrainingToggle(dog, !isChecked)
                                        : handleDogFieldChange(
                                            dog.id,
                                            "topics",
                                            isChecked
                                              ? checkedTopics.filter((t) => t !== topic)
                                              : [...checkedTopics, topic]
                                          )
                                    }
                                    disabled={isSubmitting}
                                  />
                                  {topic}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {hasChecklist &&
                        (dog.topics || []).includes("Training") && (
                          <div className="training-inline">
                            <label className="dog-pill-notes-label">
                              Training details
                            </label>

                            {trainingOf(dog).fromRecord ? (
                              <div className="training-readonly">
                                <ReadOnlyRow label="Start time" value={trainingOf(dog).startTime} />
                                <ReadOnlyRow
                                  label="Duration"
                                  value={
                                    trainingOf(dog).durationMinutes !== ""
                                      ? `${trainingOf(dog).durationMinutes} min`
                                      : ""
                                  }
                                />
                                <ReadOnlyRow label="Topic" value={trainingOf(dog).topic} />
                                <ReadOnlyRow
                                  label="Tools used"
                                  value={[
                                    ...(trainingOf(dog).equipment || []),
                                    ...(trainingOf(dog).equipmentOtherText
                                      ? [trainingOf(dog).equipmentOtherText]
                                      : []),
                                  ].join(", ")}
                                />
                                <ReadOnlyRow
                                  label="Grade"
                                  value={
                                    hasValue(trainingOf(dog).performanceGrade)
                                      ? `${trainingOf(dog).performanceGrade}/100`
                                      : ""
                                  }
                                />
                                <ReadOnlyRow label="Additional notes" value={trainingOf(dog).notes} />
                                <ReadOnlyRow label="Next time" value={trainingOf(dog).followUpNotes} />
                              </div>
                            ) : (
                              <>
                                <div className="form-question dog-pill-topic-wrapper">
                                  <label className="dog-pill-notes-label">Training topic</label>
                                  <div className="input-clearable">
                                    <input
                                      type="text"
                                      placeholder="Select training topic"
                                      value={trainingOf(dog).topic || ""}
                                      onChange={(e) =>
                                        updateTrainingField(dog, "topic", e.target.value)
                                      }
                                      onFocus={() => setShowTopicSuggestions(true)}
                                      onBlur={() =>
                                        setTimeout(() => setShowTopicSuggestions(false), 150)
                                      }
                                      disabled={isSubmitting}
                                      autoComplete="off"
                                    />
                                    {trainingOf(dog).topic && (
                                      <ClearFieldButton
                                        onClick={() => updateTrainingField(dog, "topic", "")}
                                        disabled={isSubmitting}
                                      />
                                    )}
                                  </div>

                                  {showTopicSuggestions &&
                                    (() => {
                                      const typed = (trainingOf(dog).topic || "")
                                        .trim()
                                        .toLowerCase();
                                      const matchingTopics = TRAINING_TOPICS.filter(
                                        (topic) => !typed || topic.toLowerCase().includes(typed)
                                      );
                                      if (matchingTopics.length === 0) return null;
                                      return (
                                        <ul className="suggestion-list">
                                          {matchingTopics.map((topic) => (
                                            <li
                                              key={topic}
                                              className="suggestion-item"
                                              onMouseDown={() => {
                                                updateTrainingField(dog, "topic", topic);
                                                setShowTopicSuggestions(false);
                                              }}
                                            >
                                              {topic}
                                            </li>
                                          ))}
                                        </ul>
                                      );
                                    })()}
                                </div>

                                <div className="form-question">
                                  <label className="dog-pill-notes-label">Training tools used</label>
                                  <div className="equipment-checkbox-grid">
                                    {EQUIPMENT_OPTIONS.map((item) => {
                                      const tools = trainingOf(dog).equipment || [];
                                      return (
                                        <label key={item} className="equipment-checkbox-item">
                                          <input
                                            type="checkbox"
                                            checked={tools.includes(item)}
                                            onChange={() =>
                                              updateTrainingField(
                                                dog,
                                                "equipment",
                                                tools.includes(item)
                                                  ? tools.filter((t) => t !== item)
                                                  : [...tools, item]
                                              )
                                            }
                                            disabled={isSubmitting}
                                          />
                                          {item}
                                        </label>
                                      );
                                    })}
                                    <label className="equipment-checkbox-item">
                                      <input
                                        type="checkbox"
                                        checked={Boolean(trainingOf(dog).equipmentOtherChecked)}
                                        onChange={(e) =>
                                          updateDog(dog.id, {
                                            trainingDetails: {
                                              ...trainingOf(dog),
                                              equipmentOtherChecked: e.target.checked,
                                              equipmentOtherText: e.target.checked
                                                ? trainingOf(dog).equipmentOtherText || ""
                                                : "",
                                            },
                                          })
                                        }
                                        disabled={isSubmitting}
                                      />
                                      Other
                                    </label>
                                  </div>
                                  {trainingOf(dog).equipmentOtherChecked && (
                                    <div className="input-clearable equipment-other-input">
                                      <input
                                        type="text"
                                        placeholder="Describe the other tool"
                                        value={trainingOf(dog).equipmentOtherText || ""}
                                        onChange={(e) =>
                                          updateTrainingField(dog, "equipmentOtherText", e.target.value)
                                        }
                                        disabled={isSubmitting}
                                      />
                                    </div>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        )}

                      {!isWalk && !hasChecklist && (
                        <div className="form-question dog-pill-topic-wrapper">
                          <label className="dog-pill-notes-label">
                            Training topic
                          </label>
                          <div className="input-clearable">
                            <input
                              type="text"
                              placeholder="Select training topic"
                              className={fieldClass(isMissing(dog.topic)).trim()}
                              value={dog.topic || ""}
                              onChange={(e) =>
                                handleDogFieldChange(
                                  dog.id,
                                  "topic",
                                  e.target.value
                                )
                              }
                              onFocus={() => setShowTopicSuggestions(true)}
                              onBlur={() =>
                                setTimeout(
                                  () => setShowTopicSuggestions(false),
                                  150
                                )
                              }
                              disabled={isSubmitting}
                              autoComplete="off"
                            />
                            {dog.topic && (
                              <ClearFieldButton
                                onClick={() =>
                                  handleDogFieldChange(dog.id, "topic", "")
                                }
                                disabled={isSubmitting}
                              />
                            )}
                          </div>

                          {showTopicSuggestions &&
                            (() => {
                              const trimmedTopic = (dog.topic || "")
                                .trim()
                                .toLowerCase();
                              const matchingTopics = TRAINING_TOPICS.filter(
                                (topic) =>
                                  !trimmedTopic ||
                                  topic.toLowerCase().includes(trimmedTopic)
                              );

                              if (matchingTopics.length === 0) return null;

                              return (
                                <ul className="suggestion-list">
                                  {matchingTopics.map((topic) => (
                                    <li
                                      key={topic}
                                      className="suggestion-item"
                                      onMouseDown={() => {
                                        handleDogFieldChange(
                                          dog.id,
                                          "topic",
                                          topic
                                        );
                                        setShowTopicSuggestions(false);
                                      }}
                                    >
                                      {topic}
                                    </li>
                                  ))}
                                </ul>
                              );
                            })()}
                        </div>
                      )}

                      {!hasChecklist && hasTopic(dog, false) && (
                        <div className="form-question">
                          <label className="dog-pill-notes-label">
                            Training tools used
                          </label>

                          <div className="equipment-checkbox-grid">
                            {EQUIPMENT_OPTIONS.map((item) => (
                              <label
                                key={item}
                                className="equipment-checkbox-item"
                              >
                                <input
                                  type="checkbox"
                                  checked={(dog.equipment || []).includes(
                                    item
                                  )}
                                  onChange={() =>
                                    handleToggleEquipment(dog.id, item)
                                  }
                                  disabled={isSubmitting}
                                />
                                {item}
                              </label>
                            ))}

                            <label className="equipment-checkbox-item">
                              <input
                                type="checkbox"
                                checked={!!dog.equipmentOtherChecked}
                                onChange={() =>
                                  handleToggleOtherEquipment(dog.id)
                                }
                                disabled={isSubmitting}
                              />
                              Other
                            </label>
                          </div>

                          {dog.equipmentOtherChecked && (
                            <div className="input-clearable equipment-other-input">
                              <input
                                type="text"
                                placeholder="Describe other tool..."
                                value={dog.equipmentOtherText || ""}
                                onChange={(e) =>
                                  handleDogFieldChange(
                                    dog.id,
                                    "equipmentOtherText",
                                    e.target.value
                                  )
                                }
                                disabled={isSubmitting}
                                autoComplete="off"
                              />
                              {dog.equipmentOtherText && (
                                <ClearFieldButton
                                  onClick={() =>
                                    handleDogFieldChange(
                                      dog.id,
                                      "equipmentOtherText",
                                      ""
                                    )
                                  }
                                  disabled={isSubmitting}
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {!usesTrainingRecord(dog) && (
                      <div className="form-question">
                        <label className="dog-pill-notes-label">
                          Grade
                        </label>
                        <div className="dog-pill-grade-row">
                          <input
                            type="range"
                            min="1"
                            max="100"
                            value={
                              dog.performanceGrade === "" ||
                              dog.performanceGrade == null
                                ? 50
                                : dog.performanceGrade
                            }
                            onChange={(e) =>
                              handleDogFieldChange(
                                dog.id,
                                "performanceGrade",
                                Number(e.target.value)
                              )
                            }
                            disabled={isSubmitting}
                            className="dog-pill-grade-slider"
                          />
                          <input
                            type="text"
                            inputMode="numeric"
                            value={dog.performanceGrade ?? 50}
                            onChange={(e) => {
                              const raw = e.target.value;
                              // Only whole numbers from 1 to 100 are accepted; anything else is ignored
                              if (raw === "") {
                                handleDogFieldChange(dog.id, "performanceGrade", "");
                                return;
                              }
                              if (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= 100) {
                                handleDogFieldChange(dog.id, "performanceGrade", Number(raw));
                              }
                            }}
                            disabled={isSubmitting}
                            className="dog-pill-grade-number"
                          />
                        </div>
                      </div>
                      )}

                      {!isWalk && !hasChecklist && (
                        <div className="form-question">
                          <label className="dog-pill-notes-label">
                            Next time
                          </label>
                          <div className="input-clearable">
                            <textarea
                              placeholder={`Optional: e.g. continue leash work with ${dog.name}, focus on recall...`}
                              value={dog.followUpNotes || ""}
                              onChange={(e) =>
                                handleDogFieldChange(
                                  dog.id,
                                  "followUpNotes",
                                  e.target.value
                                )
                              }
                              disabled={isSubmitting}
                            />
                            {dog.followUpNotes && (
                              <ClearFieldButton
                                onClick={() =>
                                  handleDogFieldChange(
                                    dog.id,
                                    "followUpNotes",
                                    ""
                                  )
                                }
                                disabled={isSubmitting}
                              />
                            )}
                          </div>
                        </div>
                      )}

                      {!usesTrainingRecord(dog) && (
                        <>
                      <label className="dog-pill-notes-label">
                        Additional notes for {dog.name}
                      </label>
                      <div className="input-clearable">
                        <textarea
                          placeholder={`Optional: Describe additional notes with ${dog.name}`}
                          value={dog.notes || ""}
                          onChange={(e) =>
                            handleDogFieldChange(dog.id, "notes", e.target.value)
                          }
                          disabled={isSubmitting}
                        />
                        {dog.notes && (
                          <ClearFieldButton
                            onClick={() =>
                              handleDogFieldChange(dog.id, "notes", "")
                            }
                            disabled={isSubmitting}
                          />
                        )}
                      </div>

                        </>
                      )}

                      {hasChecklist &&
                        (dog.topics || []).includes("Training") && (
                          !trainingOf(dog).fromRecord && (
                          <>
                            <label className="dog-pill-notes-label">
                              Next time
                            </label>
                            <div className="input-clearable">
                              <textarea
                                placeholder={`Optional: Describe next time with ${dog.name}`}
                                value={trainingOf(dog).followUpNotes || ""}
                                onChange={(e) =>
                                  updateTrainingField(dog, "followUpNotes", e.target.value)
                                }
                                disabled={isSubmitting}
                              />
                              {trainingOf(dog).followUpNotes && (
                                <ClearFieldButton
                                  onClick={() =>
                                    updateTrainingField(dog, "followUpNotes", "")
                                  }
                                  disabled={isSubmitting}
                                />
                              )}
                            </div>
                          </>
                          )
                        )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="form-question">
          <label>
            Session date
          </label>
          <input
            type="date"
            className={fieldClass(isMissing(sessionDate)).trim()}
            value={sessionDate}
            min={getTodayISO()}
            onChange={(e) => {
              // Sessions can't be dated before today
              if (e.target.value >= getTodayISO()) setSessionDate(e.target.value);
            }}
            disabled={isSubmitting}
          />
        </div>

        <div className="submit-area">
          <button
            className="submit-button"
            onClick={handleSubmitClick}
            disabled={isSubmitting}
            type="button"
          >
            {isSubmitting
              ? "Saving..."
              : showErrors && !canSubmit
              ? "Please fill in the highlighted fields"
              : isEditing
              ? "Save Changes"
              : "Submit"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AddActivityModal;
