import React, { useEffect, useRef, useState } from "react";
import "../common/styles/TrainingDataModal.css";
import EXAMPLE_DOGS from "../common/data/exampleDogs";
import TRAINING_TOPICS from "../common/data/trainingTopics";
import EQUIPMENT_OPTIONS from "../common/data/equipmentOptions";

const DRAFT_KEY = "trainingPage.draft";

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

function isEndTimeInFuture(dog, sessionDate) {
  if (sessionDate !== getTodayISO() || !dog.startTime || dog.durationMinutes === "") return false;
  const [hours, minutes] = dog.startTime.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + Number(dog.durationMinutes || 0);
  const now = new Date();
  return endMinutes > now.getHours() * 60 + now.getMinutes();
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

function isDogSessionComplete(dog) {
  return (
    (dog.startTime || "").trim() &&
    String(dog.durationMinutes ?? "").trim() !== "" &&
    (dog.topic || "").trim() &&
    (!dog.equipmentOtherChecked || (dog.equipmentOtherText || "").trim())
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

function TrainingDataModal({
  onClose,
  onSaved,
  initialSession = null,
  isEditing = false,
  presetDog = null,
}) {
  // Opened from the Dog Activity form with one dog preselected: no draft is kept
  const isEmbedded = Boolean(presetDog);
  const initialDraft = isEditing
    ? {}
    : isEmbedded
      ? {
          trainerFirstName: presetDog.trainerFirstName || "",
          trainerLastName: presetDog.trainerLastName || "",
          selectedAnimals: [presetDog],
          sessionDate: presetDog.sessionDate || getTodayISO(),
        }
      : loadDraft();

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
    if (isEditing || isEmbedded) return;

    saveDraft({
      trainerFirstName,
      trainerLastName,
      searchTerm,
      selectedAnimals,
      sessionDate,
    });
  }, [
    isEditing,
    trainerFirstName,
    trainerLastName,
    searchTerm,
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

  const canSubmit =
    trainerFirstName.trim() &&
    trainerLastName.trim() &&
    selectedAnimals.length > 0 &&
    sessionDate.trim() &&
    !selectedAnimals.some((dog) => isStartTimeInFuture(dog, sessionDate) || isEndTimeInFuture(dog, sessionDate)) &&
    selectedAnimals.every(isDogSessionComplete);

  // Empty required fields are highlighted once Submit has been tried
  const isMissing = (value) => String(value ?? "").trim() === "";
  const fieldClass = (isInvalid) =>
    showErrors && isInvalid ? " field-missing" : "";
  const dogIsIncomplete = (dog) =>
    !isDogSessionComplete(dog) || isStartTimeInFuture(dog, sessionDate) || isEndTimeInFuture(dog, sessionDate);

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

  const matchingDogs = EXAMPLE_DOGS.filter((dog) => {
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
    if (!isEditing && !isEmbedded) clearDraft();
    onClose();
  };

  const handleSubmit = () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    if (!isEditing && !isEmbedded) clearDraft();

    onSaved({
      trainerFirstName: trainerFirstName.trim(),
      trainerLastName: trainerLastName.trim(),
      animals: selectedAnimals.map((a) => ({
        ...a,
        topic: a.topic === "Other" ? (a.topicOther || "Other").trim() : a.topic,
        equipmentOtherText: (a.equipmentOtherText || "").trim(),
        performanceGrade:
          a.performanceGrade === "" || a.performanceGrade == null
            ? 50
            : a.performanceGrade,
        followUpNotes: (a.followUpNotes || "").trim(),
        notes: (a.notes || "").trim(),
      })),
      sessionDate,
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal">
        <button className="close-button" onClick={handleClose} type="button">
          ×
        </button>

        <h2>{isEditing ? "Edit Training Session" : "Add Training Session"}</h2>

        <div className="name-fields">
          <div className="input-clearable">
            <input
              type="text"
              placeholder="Trainer First Name"
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
              placeholder="Trainer Last Name"
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

        {!isEmbedded && (
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
        )}

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
                            max="180"
                            step="1"
                            placeholder="e.g. 30 (max 180)"
                            className={fieldClass(isMissing(dog.durationMinutes) || isEndTimeInFuture(dog, sessionDate)).trim()}
                            value={dog.durationMinutes || ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const clamped =
                                raw === "" ? "" : Math.min(180, Math.max(0, Number(raw)));
                              handleDogFieldChange(
                                dog.id,
                                "durationMinutes",
                                clamped
                              );
                            }}
                            disabled={isSubmitting}
                          />
                          {isEndTimeInFuture(dog, sessionDate) && (
                            <div className="duration-error">The end time can't be later than now</div>
                          )}
                        </div>
                      </div>

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

                            const options = [...matchingTopics, "Other"];
                            if (options.length === 0) return null;

                            return (
                              <ul className="suggestion-list">
                                {options.map((topic) => (
                                  <li
                                    key={topic}
                                    className="suggestion-item"
                                    onMouseDown={(event) => {
                                      event.preventDefault();
                                      if (topic === "Other") {
                                        handleDogFieldChange(dog.id, "topic", "Other");
                                      } else {
                                        handleDogFieldChange(dog.id, "topic", topic);
                                      }
                                      setShowTopicSuggestions(false);
                                    }}
                                  >
                                    {topic}
                                  </li>
                                ))}
                              </ul>
                            );
                          })()}
                        {dog.topic === "Other" && (
                          <input
                            type="text"
                            className="training-topic-other-input"
                            placeholder="What type of training?"
                            aria-label="Other training topic"
                            value={dog.topicOther || ""}
                            onChange={(e) => handleDogFieldChange(dog.id, "topicOther", e.target.value)}
                            disabled={isSubmitting}
                          />
                        )}
                      </div>

                      {(dog.topic || "").trim() && (
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
                                className={fieldClass(dog.equipmentOtherChecked && isMissing(dog.equipmentOtherText)).trim()}
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
                              {showErrors && isMissing(dog.equipmentOtherText) && (
                                <div className="duration-error">Please specify the other tool</div>
                              )}
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

                      <div className="form-question">
                        <label className="dog-pill-notes-label">
                          What should be worked on next time?
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
            max={getTodayISO()}
            onChange={(e) => {
              if (e.target.value <= getTodayISO()) setSessionDate(e.target.value);
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

export default TrainingDataModal;
