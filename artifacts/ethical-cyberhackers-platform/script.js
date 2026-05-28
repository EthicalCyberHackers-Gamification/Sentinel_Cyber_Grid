/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform
 * Milestones 1-4: terminal simulation, progressive unlock, quiz, reset
 *
 * FLOW
 * ----
 *  1. Student clicks command buttons → terminal output (M1, M2)
 *  2. Commands unlock gradually as investigation progresses (M2)
 *  3. After reading suspicious_file.txt → quiz appears (M3)
 *  4. Correct answer → XP, rank update, completion screen (M3)
 *  5. Completion screen shows summary + Restart button (M4)
 *  6. Restart wipes everything back to the initial state (M4)
 *
 * DATA FILES
 * ----------
 *  missions.js — FILESYSTEM, COMMAND_BUTTONS, MISSION_STEPS, QUIZ, MISSIONS
 *  script.js   — all interaction logic (this file)
 *  index.html  — HTML structure
 *  style.css   — visual styling
 */

import {
  FILESYSTEM,
  COMMAND_BUTTONS,
  MISSION_STEPS,
  QUIZ,
  getMissionById,
  activeMissionId,
} from "/missions.js";


/* ============================================================
   CONSTANTS
   Starting values that resetMission() restores to on every restart.
   ============================================================ */

/** XP the student starts with (demo baseline). */
const INITIAL_XP  = 750;

/** Max XP for the current rank tier. */
const MAX_XP = 1000;

/** Starting rank name. */
const INITIAL_RANK = "Script Kiddie";

/**
 * Build timestamp — update this string whenever you push a revision.
 * It appears in the footer so you can confirm you are running the latest version.
 * Format: "DD Mon YYYY — HH:MM UTC"
 */
const BUILD_TIME = "28 May 2026 — 07:00 CST";

/* Milestone 17 — Student name entered on the landing screen.
   Frontend-only variable. Persists across mission restart and across
   trips back to the Module Overview (the input keeps its value because
   we only toggle display, never tear down the DOM). */
let studentName = "";

/* ============================================================
   LOCAL PROGRESS SAVE  (Milestone 18)
   Lightweight localStorage layer. Single key holds an object
   so save/load is atomic and easy to version. No backend.
   ============================================================ */

const STORAGE_KEY = "ech.progress.v1";

/** Read the saved progress object, or null if nothing/invalid. */
function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (e) {
    // localStorage disabled, quota error, malformed JSON — fail closed.
    return null;
  }
}

/** Write the current in-memory state to localStorage. Safe no-op on error. */
function saveProgress() {
  try {
    const data = {
      studentName,
      xp: currentXP,
      rank: rankNameEl ? rankNameEl.textContent : INITIAL_RANK,
      mission1Complete: !!missionComplete,
      mission2Unlocked: !!missionComplete, // mirrors completion in this build
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateSaveIndicator(true);
  } catch (e) {
    updateSaveIndicator(false);
  }
}

/** Refreshes the "Progress Saved Locally" pills (landing + dashboard). */
function updateSaveIndicator(saved) {
  const has = saved && !!localStorage.getItem(STORAGE_KEY);
  document.querySelectorAll(".save-indicator").forEach((el) => {
    el.classList.toggle("save-indicator--saved", has);
    el.textContent = has
      ? "✓ Progress Saved Locally"
      : "No saved progress yet";
  });
  // Clear button is only meaningful when there's something to clear
  document.querySelectorAll(".clear-progress-btn").forEach((el) => {
    el.disabled = !has;
  });
}

/**
 * Restore saved progress on page load. Called once from boot() AFTER all
 * DOM references and renderers are wired up.
 *
 * Note: we deliberately do NOT auto-show the completion screen / certificate
 * on reload. Restoring sets the dashboard state to reflect completion
 * (badge = COMPLETE, course progress shows Mission 2 unlocked, XP/rank
 * restored), and the student can Restart Mission to replay if they want.
 */
function restoreSavedProgress() {
  const data = loadSavedProgress();
  if (!data) {
    updateSaveIndicator(false);
    return;
  }

  // 1. Student name — fill input, enable Enter Module button
  if (typeof data.studentName === "string" && data.studentName.trim()) {
    studentName = data.studentName.trim();
    const nameInput = document.getElementById("studentNameInput");
    const enterBtn  = document.getElementById("enterModuleBtn");
    if (nameInput) nameInput.value = studentName;
    if (enterBtn)  enterBtn.disabled = false;
  }

  // 2. XP — restore value and bar width (no animation on initial load)
  if (typeof data.xp === "number" && isFinite(data.xp)) {
    currentXP = Math.max(0, Math.min(data.xp, MAX_XP));
    if (currentXPEl) currentXPEl.textContent = currentXP;
    if (xpBarEl) {
      xpBarEl.style.transition = "none";
      xpBarEl.style.width = `${Math.round((currentXP / MAX_XP) * 100)}%`;
    }
  }

  // 3. Rank
  if (typeof data.rank === "string" && data.rank && rankNameEl) {
    rankNameEl.textContent = data.rank;
    if (data.rank !== INITIAL_RANK) {
      rankNameEl.classList.add("rank-name--upgraded");
    }
  }

  // 4. Mission 1 completion → also unlocks Mission 2 via renderCourseProgress
  if (data.mission1Complete) {
    missionComplete = true;
    if (missionBadge) {
      missionBadge.textContent = "COMPLETE";
      missionBadge.classList.add("mission-status-badge--complete");
    }
    // Mark all tracker steps complete to mirror state
    PROGRESS_STEPS.forEach((s) => completedProgressSteps.add(s.id));
    renderProgressTracker();
    renderCourseProgress();
  }

  updateSaveIndicator(true);
}

/**
 * Spec #6 — wipe saved data and reset the entire UI to its initial state.
 * Resets student name, XP, rank, mission completion, and re-locks Mission 2.
 */
function clearSavedProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }

  // Reset student name + input + Enter Module button
  studentName = "";
  const nameInput = document.getElementById("studentNameInput");
  const enterBtn  = document.getElementById("enterModuleBtn");
  if (nameInput) nameInput.value = "";
  if (enterBtn)  enterBtn.disabled = true;

  // Reset welcome line (will be re-populated next time they enter)
  const welcomeEl = document.getElementById("welcomeMessage");
  if (welcomeEl) welcomeEl.innerHTML = "";

  // Reset Mission 1 gameplay + XP + rank + badge + course progress + tracker.
  // resetMission() handles all of that without touching localStorage.
  resetMission();

  // resetMission ran with the now-cleared studentName, so save would write
  // a fresh empty record. We don't want that — leave storage empty. The
  // indicator update below reflects "no saved progress".
  updateSaveIndicator(false);

  // Milestone 20 — also reset Mission 2 state + UI (the overview is no
  // longer reachable once Mission 1 is re-locked, but be defensive).
  resetMission2();
  // If the M2 overview is currently showing, return the user to landing.
  const overview = document.getElementById("mission2Overview");
  if (overview && overview.style.display !== "none") {
    hideMission2Overview();
  }
}


/* ============================================================
   FINDING  (Milestone 7 — Student Report Submission)
   ============================================================
   Multiple-choice "Submit Finding" panel that appears between
   reading suspicious_file.txt and the knowledge-check quiz.
   The student must identify the actual suspicious behavior
   before the quiz unlocks — teaches them to document findings
   like a real analyst.
   ============================================================ */

const FINDING = {
  question: "What suspicious behavior did you find?",
  answers: [
    { id: "A", text: "A file asked the user to share their password with an unknown external email.", correct: true },
    { id: "B", text: "The documents folder contained two files.",                                      correct: false },
    { id: "C", text: "The terminal showed the current directory.",                                     correct: false },
    { id: "D", text: "The workstation had a reports folder.",                                          correct: false },
  ],
  correctFeedback:   "Finding submitted. Good analyst work.",
  incorrectFeedback: "Review the suspicious file before submitting your finding.",
  reportSummary:     "Possible phishing attempt involving password theft.",
};


/* ============================================================
   HINTS  (Milestone 6 — Guided Hints and Error Prevention)
   ============================================================
   Beginner-friendly guidance shown in the Hint Panel above the
   command buttons. The hint changes after each step the student
   completes so they always know what to do next without typing.

   Three hint "tones":
     muted    — the awaiting/briefing screen (calm gray)
     normal   — standard step-by-step guidance (cyan)
     warning  — student clicked out of sequence (yellow)
   ============================================================ */

/* ============================================================
   MANAGER MESSAGES  (Milestone 13)
   Scripted supervisor messages shown in the "Supervisor Message"
   panel. Keys map to lifecycle moments (awaiting, started, etc.)
   and command-button keys. Updated by setManagerMessage().
   No AI — purely scripted strings.
   ============================================================ */
const MANAGER_MESSAGES = {
  awaiting:             "Welcome, intern. Your first task is to inspect this workstation and report anything suspicious.",
  started:              "Start with basic orientation. Find out where you are in the system.",
  "pwd":                "Good. Now inspect the current directory.",
  "ls-home":            "You found several folders. Open the documents folder.",
  "cd-documents":       "List the files inside this folder.",
  "ls-documents":       "Review the available files carefully.",
  "cat-employee-notes": "That file looks normal. Continue your investigation.",
  "cat-suspicious":     "That message is suspicious. Submit your finding before taking the quiz.",
  findingCorrect:       "Good analyst work. Now confirm your understanding in the quiz.",
  missionComplete:      "Mission complete. You identified a phishing attempt and reported it properly.",
};

/* ============================================================
   REFLECTION CHECKPOINT  (Milestone 14)
   Shown after a correct quiz answer, BEFORE XP is awarded and
   BEFORE the Mission Scorecard. Turns the activity into a
   learning moment rather than just button-clicking.
   ============================================================ */
/* ============================================================
   PROGRESS TRACKER  (Milestone 15)
   10-step lifecycle tracker shown in the mission panel.
   Each step has status "locked" | "current" | "complete".
   - Order in the array IS the order students see.
   - "Briefing" starts complete on page load.
   - "Begin Mission" is the initial current step.
   - The first non-complete step is automatically highlighted
     as current — no separate "current" state to maintain.
   markProgressStep() flips a step to complete and re-renders.
   resetProgressTracker() returns everything to the initial state.
   ============================================================ */
const PROGRESS_STEPS = [
  { id: "briefing",         label: "Briefing"         },
  { id: "begin-mission",    label: "Begin Mission"    },
  { id: "inspect-location", label: "Inspect Location" },
  { id: "list-files",       label: "List Files"       },
  { id: "open-documents",   label: "Open Documents"   },
  { id: "inspect-files",    label: "Inspect Files"    },
  { id: "submit-finding",   label: "Submit Finding"   },
  { id: "quiz",             label: "Quiz"             },
  { id: "reflection",       label: "Reflection"       },
  { id: "complete",         label: "Complete"         },
];

// Source of truth for completion. Briefing is always pre-completed.
const completedProgressSteps = new Set(["briefing"]);

const REFLECTION = {
  question: "What did this mission teach you?",
  answers: [
    {
      id: "A",
      text: "Cybersecurity analysts inspect files carefully before trusting them.",
      correct: true,
    },
    {
      id: "B",
      text: "Any file inside a documents folder is automatically safe.",
      correct: false,
    },
    {
      id: "C",
      text: "Sharing passwords through email is normal if the message sounds urgent.",
      correct: false,
    },
  ],
  correctFeedback:   "Correct. Careful inspection is part of cybersecurity analysis.",
  incorrectFeedback: "Review the mission. The key lesson is to inspect suspicious messages carefully and never trust password requests.",
};

const HINTS = {
  awaiting:             "Read the briefing, then click Begin Mission.",
  started:              "Start by checking your current location.",
  "pwd":                "Now list the files and folders in your current location.",
  "ls-home":            "You found several folders. Open the documents folder.",
  "cd-documents":       "Now list the files inside the documents folder.",
  "ls-documents":       "Read both files. One contains normal guidance. One contains suspicious behavior.",
  "cat-employee-notes": "This file looks normal. Continue checking the remaining file.",
  "cat-suspicious":     "You found suspicious behavior. Submit your finding to unlock the quiz.",
  outOfSequence:        "Follow the mission path. Use the highlighted command next.",
};

// Strict forward sequence (cat-employee-notes is optional and handled separately)
const HINT_SEQUENCE = ["pwd", "ls-home", "cd-documents", "ls-documents", "cat-suspicious"];

/** Boot messages shown in the terminal on load and after every restart. */
const BOOT_MESSAGES = [
  { type: "system", text: "Ethical CyberHackers Platform v1.0.0 \u2014 Boot sequence complete." },
  { type: "system", text: "Welcome back, Agent GHOST_ZERO. Mission briefing loaded." },
];


/* ============================================================
   DOM REFERENCES
   ============================================================ */

const terminalOutput = document.getElementById("terminalOutput");
const terminalInput  = document.getElementById("terminalInput");
const missionTimer   = document.getElementById("missionTimer");
const promptLabel    = document.querySelector(".terminal-prompt-label");
const terminalTitle  = document.querySelector(".terminal-title");
const btnContainer   = document.getElementById("commandButtonsContainer");
const statusList     = document.getElementById("missionStatusList");
const quizPanel      = document.getElementById("quizPanel");
const findingPanel   = document.getElementById("findingPanel");
const commandsHint   = document.querySelector(".commands-hint");
const courseProgressEl = document.getElementById("courseProgress");

// Milestone 10 — Module landing screen elements
const moduleLandingEl  = document.getElementById("moduleLanding");
const dashboardEl      = document.getElementById("dashboard");

// Milestone 11 — Simulation loading screen elements
const simLoaderEl        = document.getElementById("simLoader");
const simLoaderLinesEl   = document.getElementById("simLoaderLines");
const simLoaderCurrentEl = document.getElementById("simLoaderCurrent");
const simLoaderBarEl     = document.getElementById("simLoaderBar");
const simLoaderPctEl     = document.getElementById("simLoaderPct");
const simLoaderStatusEl  = document.getElementById("simLoaderStatus");

/**
 * Boot lines shown by the simulation loader. Each entry becomes one
 * row in the fake terminal, with the progress bar advancing in step.
 * Total runtime is roughly LINE_DELAY_MS * SIM_BOOT_LINES.length.
 */
const SIM_BOOT_LINES = [
  "Initializing CyberCorp training environment...",
  "Loading student profile...",
  "Starting simulated workstation...",
  "Mounting /home/student directory...",
  "Loading mission files...",
  "Checking terminal command system...",
  "Activating phishing detection scenario...",
  "Connecting analyst dashboard...",
  "Simulation ready.",
];
const SIM_LINE_DELAY_MS = 450;     // delay between lines (≈4 s total)
const SIM_FINAL_PAUSE_MS = 500;    // brief pause after the last line

// XP panel elements (right sidebar)
const xpBarEl     = document.getElementById("xpBar");
const currentXPEl = document.getElementById("currentXP");
const maxXPEl     = document.getElementById("maxXP");
const rankNameEl  = document.getElementById("rankName");

// Mission panel badge ("IN PROGRESS" ↔ "COMPLETE")
const missionBadge = document.querySelector(".mission-status-badge");


/* ============================================================
   APPLICATION STATE
   These variables track the current session.
   resetMission() restores all of them to their initial values.
   ============================================================ */

let currentDir       = "~";     // which folder the student is in
let currentXP        = INITIAL_XP;
let missionComplete  = false;
let missionStarted   = false;   // false until student clicks "Begin Mission"
let furthestSeqIndex = -1;      // tracks how far along HINT_SEQUENCE the student is

// Which button keys are currently visible to the student
const unlockedKeys = new Set();

// Which mission step IDs have been checked off
const completedSteps = new Set();


/* ============================================================
   TIMER
   ============================================================ */

let timerInterval = null;
let secondsLeft   = 0;

function formatTime(total) {
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval);
  secondsLeft = durationSeconds;
  if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);
  timerInterval = setInterval(() => {
    secondsLeft -= 1;
    if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0) clearInterval(timerInterval);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}


/* ============================================================
   PROMPT HELPERS
   ============================================================ */

function getPrompt() {
  return `student@cybercorp:${currentDir}$`;
}

function updatePromptDisplay() {
  const p = getPrompt();
  if (terminalTitle) terminalTitle.textContent = p;
  if (promptLabel)   promptLabel.textContent   = p;
}


/* ============================================================
   TERMINAL OUTPUT HELPERS
   ============================================================ */

function printCommand(command) {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt">${getPrompt()}</span>` +
    `<span class="terminal-text terminal-text--success">${command}</span>`;
  terminalOutput.appendChild(line);
  scrollTerminal();
}

function printOutput(text, type = "default") {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt" style="opacity:0;user-select:none;">$</span>` +
    `<span class="terminal-text terminal-text--${type}">${text}</span>`;
  terminalOutput.appendChild(line);
  scrollTerminal();
}

function printBlankLine() {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = "&nbsp;";
  terminalOutput.appendChild(line);
  scrollTerminal();
}

function scrollTerminal() {
  if (terminalOutput) terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/**
 * Prints the initial system boot messages.
 * Called on first load AND after every restart so the terminal always
 * starts with the same familiar two lines.
 */
function printBootMessages() {
  BOOT_MESSAGES.forEach((msg) => {
    const line = document.createElement("div");
    line.className = "terminal-line terminal-line--system";
    line.innerHTML =
      `<span class="terminal-prompt">${msg.type}</span>` +
      `<span class="terminal-text">${msg.text}</span>`;
    terminalOutput.appendChild(line);
  });
  printBlankLine();
  scrollTerminal();
}

function clearTerminal() {
  terminalOutput.innerHTML = "";
}


/* ============================================================
   COMMAND PROCESSOR
   Reads FILESYSTEM data and produces the right output per command.
   ============================================================ */

function processCommand(command, buttonKey) {
  const cmd     = command.trim().toLowerCase();
  const dirData = FILESYSTEM[currentDir];

  // pwd
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // ls
  if (cmd === "ls") {
    printOutput(dirData.ls.join("  "));
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // cd <folder>
  if (cmd.startsWith("cd ")) {
    const target     = cmd.slice(3).trim();
    const newPath    = `${currentDir}/${target}`;
    const normalised = newPath.replace("~//", "~/");

    if (dirData.subdirs.includes(target) && FILESYSTEM[normalised]) {
      currentDir = normalised;
      updatePromptDisplay();
      printBlankLine();
      afterCommand(buttonKey);
    } else {
      printOutput(`bash: cd: ${target}: No such file or directory`, "error");
      printBlankLine();
    }
    return;
  }

  // cat <filename>
  if (cmd.startsWith("cat ")) {
    const filename = command.trim().slice(4).trim();
    const files    = dirData.files;

    if (files[filename]) {
      files[filename].forEach((line) => {
        if (line === "") {
          printBlankLine();
        } else {
          printOutput(line, line.startsWith("[!") ? "warn" : "default");
        }
      });
    } else {
      printOutput(
        `cat: ${filename}: Access denied: file not found in current location.`,
        "error"
      );
    }
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // clear
  if (cmd === "clear") {
    clearTerminal();
    printBootMessages();
    return;
  }

  // unknown
  printOutput(`bash: ${cmd.split(" ")[0]}: command not found`, "error");
  printBlankLine();
}


/* ============================================================
   UNLOCK & PROGRESSION ENGINE
   ============================================================ */

/**
 * Called after every command button runs.
 * Unlocks any buttons gated on this key, marks mission steps,
 * and triggers the quiz if this was "cat-suspicious".
 *
 * @param {string} buttonKey
 */
/**
 * Updates the Hint Panel text + tone based on the button the student
 * just clicked. Called at the top of afterCommand() so the hint reacts
 * to every click, including out-of-sequence ones.
 */
function updateHint(buttonKey) {
  // cat-employee-notes is optional — only available after cd-documents
  if (buttonKey === "cat-employee-notes") {
    if (furthestSeqIndex >= 2) {           // i.e. cd-documents already done
      setHint(HINTS["cat-employee-notes"], "normal");
    } else {
      setHint(HINTS.outOfSequence, "warning");
    }
    return;
  }

  const clickedIndex = HINT_SEQUENCE.indexOf(buttonKey);
  if (clickedIndex === -1) return;          // unknown button; leave hint alone

  if (clickedIndex > furthestSeqIndex + 1) {
    // Skipping ahead — gentle nudge back to the highlighted button
    setHint(HINTS.outOfSequence, "warning");
    return;
  }

  if (clickedIndex <= furthestSeqIndex) {
    // Re-running an earlier command (e.g. pwd, ls) — keep current hint
    return;
  }

  // Normal forward progression
  furthestSeqIndex = clickedIndex;
  setHint(HINTS[buttonKey], "normal");
}

/**
 * Milestone 13: Updates the Supervisor Message panel.
 * Pure DOM update + brief flash animation. No state, no AI.
 * @param {string} key  Key into MANAGER_MESSAGES
 */
function setManagerMessage(key) {
  const msg = MANAGER_MESSAGES[key];
  if (!msg) return;
  const panel  = document.getElementById("managerPanel");
  const textEl = document.getElementById("managerText");
  if (!panel || !textEl) return;
  if (textEl.textContent.trim() === msg) return; // no-op if unchanged
  textEl.textContent = msg;
  panel.classList.remove("manager-panel--flash");
  void panel.offsetWidth;                        // force reflow to restart anim
  panel.classList.add("manager-panel--flash");
}

/** Writes text + tone class to the hint panel. */
function setHint(text, tone) {
  const panel = document.getElementById("hintPanel");
  const textEl = document.getElementById("hintText");
  const iconEl = document.getElementById("hintIcon");
  if (!panel || !textEl) return;

  textEl.textContent = text;
  panel.classList.remove("hint-panel--muted", "hint-panel--normal", "hint-panel--warning");
  panel.classList.add(`hint-panel--${tone}`);
  if (iconEl) iconEl.textContent = tone === "warning" ? "⚠️" : "💡";

  // Brief flash so the change is noticeable
  panel.classList.remove("hint-panel--flash");
  void panel.offsetWidth;                    // force reflow to restart animation
  panel.classList.add("hint-panel--flash");
}


function afterCommand(buttonKey) {
  if (!buttonKey) return;

  // Milestone 6: update the hint panel BEFORE other logic so out-of-sequence
  // warnings show even though the command itself still executes normally.
  updateHint(buttonKey);

  // Unlock buttons whose condition was just met
  let newlyUnlocked = [];
  const btnDef = COMMAND_BUTTONS.find((b) => b.key === buttonKey);
  if (btnDef && btnDef.unlocksAfterRun.length > 0) {
    newlyUnlocked = unlockButtons(btnDef.unlocksAfterRun);
  }

  // Check off any mission steps triggered by this button
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === buttonKey && !completedSteps.has(step.id)) {
      completeStep(step.id);
    }
  });

  // Re-render buttons once so the "next step" highlight moves forward and
  // the just-used button gets dimmed — even when nothing new unlocked.
  renderButtons(newlyUnlocked);

  // Milestone 7: show the "Submit Finding" panel 800ms after reading the
  // suspicious file. The quiz is no longer triggered directly — it now
  // unlocks only after the student submits the correct finding.
  if (buttonKey === "cat-suspicious") {
    setTimeout(showFindingPanel, 800);
  }

  // Milestone 13: supervisor message for this command (if any).
  // Uses the same key as HINTS so the mapping stays consistent.
  if (MANAGER_MESSAGES[buttonKey]) {
    setManagerMessage(buttonKey);
  }

  // Milestone 15: map command keys → progress tracker step ids.
  // Steps not listed here advance via their own dedicated hooks
  // (submit-finding, quiz, reflection, complete).
  const PROGRESS_BY_COMMAND = {
    "pwd":            "inspect-location",
    "ls-home":        "list-files",
    "cd-documents":   "open-documents",
    "cat-suspicious": "inspect-files",
  };
  if (PROGRESS_BY_COMMAND[buttonKey]) {
    markProgressStep(PROGRESS_BY_COMMAND[buttonKey]);
  }
}

/**
 * Adds keys to unlockedKeys and returns the subset that was actually new.
 * Does NOT re-render — afterCommand() handles a single render pass so the
 * "next step" highlight and "used" dimming stay in sync.
 */
function unlockButtons(keys) {
  const newlyUnlocked = [];
  keys.forEach((key) => {
    if (!unlockedKeys.has(key)) {
      unlockedKeys.add(key);
      newlyUnlocked.push(key);
    }
  });
  return newlyUnlocked;
}

function completeStep(stepId) {
  completedSteps.add(stepId);
  renderMissionStatus();
}


/* ============================================================
   RENDER: COMMAND BUTTONS
   ============================================================ */

function renderButtons(newlyUnlocked = []) {
  if (!btnContainer) return;
  btnContainer.innerHTML = "";

  // The "next recommended" button = the triggeredBy of the first
  // incomplete mission step that has a real trigger (skips auto-completed
  // steps like "Mission Started" whose triggeredBy is null).
  let nextKey = null;
  for (const step of MISSION_STEPS) {
    if (step.triggeredBy && !completedSteps.has(step.id)) {
      nextKey = step.triggeredBy;
      break;
    }
  }

  // Buttons that have already advanced the mission — dimmed to push the
  // student's eye toward fresh options. They remain clickable so students
  // can re-run pwd / ls etc. to reinforce the habit.
  const usedKeys = new Set();
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy && completedSteps.has(step.id)) {
      usedKeys.add(step.triggeredBy);
    }
  });

  COMMAND_BUTTONS.forEach((btn) => {
    if (!unlockedKeys.has(btn.key)) return;

    const el = document.createElement("button");
    el.className = `cmd-btn cmd-btn--${btn.style}`;
    el.dataset.command   = btn.command;
    el.dataset.buttonKey = btn.key;

    // Spotlight the next step (overrides "used" dimming if both apply)
    if (btn.key === nextKey) {
      el.classList.add("cmd-btn--next");
    } else if (usedKeys.has(btn.key)) {
      el.classList.add("cmd-btn--used");
    }

    if (newlyUnlocked.includes(btn.key)) {
      el.classList.add("cmd-btn--unlocking");
      el.addEventListener("animationend", () => {
        el.classList.remove("cmd-btn--unlocking");
      }, { once: true });
    }

    el.innerHTML =
      `<span class="cmd-icon">${btn.icon}</span>` +
      `<span class="cmd-name">${btn.label}</span>` +
      `<code class="cmd-code">${btn.command}</code>` +
      `<span class="cmd-desc">${btn.desc}</span>`;

    el.addEventListener("click", () => {
      runCommand(btn.command, btn.key);
      if (terminalInput) {
        terminalInput.value = "";
        terminalInput.focus();
      }
    });

    btnContainer.appendChild(el);
  });
}


/* ============================================================
   RENDER: MISSION STATUS TRACKER
   ============================================================ */

function renderMissionStatus() {
  if (!statusList) return;
  statusList.innerHTML = "";

  // Before the mission starts, show a single "Awaiting" placeholder row
  if (!missionStarted) {
    const li = document.createElement("li");
    li.className = "step-item step-item--awaiting";
    li.innerHTML =
      `<span class="step-icon">⏸</span>` +
      `<span class="step-emoji">⏳</span>` +
      `<span class="step-label">Awaiting Mission Start</span>`;
    statusList.appendChild(li);
    return;
  }

  MISSION_STEPS.forEach((step) => {
    const done = completedSteps.has(step.id);
    const li   = document.createElement("li");
    li.className = `step-item ${done ? "step-item--complete" : "step-item--pending"}`;
    li.innerHTML =
      `<span class="step-icon">${done ? "✓" : "○"}</span>` +
      `<span class="step-emoji">${step.icon}</span>` +
      `<span class="step-label">${step.label}</span>`;
    statusList.appendChild(li);
  });
}


/* ============================================================
   SUBMIT FINDING  (Milestone 7)
   Appears between reading suspicious_file.txt and the quiz.
   Student must pick the correct suspicious behavior to unlock
   the knowledge-check quiz.
   ============================================================ */

/** Reveals the finding panel and hides command buttons. */
function showFindingPanel() {
  if (!findingPanel || missionComplete) return;

  // Hide the command-button UI while the analyst writes their report
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";

  findingPanel.style.display = "block";
  findingPanel.innerHTML     = buildFindingHTML();

  // Wire up answer buttons
  findingPanel.querySelectorAll(".finding-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleFindingAnswer(btn.dataset.answerId));
  });
}

/** Builds the HTML for the Submit Finding panel. */
function buildFindingHTML() {
  const answersHTML = FINDING.answers
    .map(
      (a) =>
        `<button class="finding-answer-btn" data-answer-id="${a.id}">
          <span class="finding-answer-letter">${a.id}</span>
          <span class="finding-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="finding-header">
      <span class="finding-label">SUBMIT FINDING</span>
      <span class="finding-badge">ANALYST REPORT</span>
    </div>
    <p class="finding-question">${FINDING.question}</p>
    <div class="finding-answers">${answersHTML}</div>
    <div class="finding-feedback" id="findingFeedback"></div>
  `;
}

/**
 * Handles a student's selection in the Submit Finding panel.
 *  - Correct → shows success + Analyst Report summary, then unlocks the quiz
 *  - Wrong   → shows retry message, quiz stays locked, buttons re-enabled
 *
 * @param {string} answerId  "A", "B", "C", or "D"
 */
function handleFindingAnswer(answerId) {
  const chosen  = FINDING.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;
  const feedbackEl = document.getElementById("findingFeedback");

  // Visually mark the chosen answer
  findingPanel.querySelectorAll(".finding-answer-btn").forEach((btn) => {
    btn.disabled = correct;             // only freeze the UI on a correct answer
    if (btn.dataset.answerId === answerId) {
      btn.classList.add(correct ? "finding-answer--correct" : "finding-answer--wrong");
    }
  });

  if (!feedbackEl) return;

  if (correct) {
    // 1. Success message
    feedbackEl.textContent = FINDING.correctFeedback;
    feedbackEl.className   = "finding-feedback finding-feedback--correct";

    // Milestone 13: supervisor acknowledges the finding
    setManagerMessage("findingCorrect");
    // Milestone 15: tracker — Submit Finding complete; Quiz is now current
    markProgressStep("submit-finding");

    // 2. Append a small Analyst Report summary card
    const report = document.createElement("div");
    report.className = "analyst-report";
    report.innerHTML = `
      <span class="analyst-report-label">ANALYST REPORT</span>
      <p class="analyst-report-line">
        <span class="analyst-report-key">Finding:</span>
        <span class="analyst-report-value">${FINDING.reportSummary}</span>
      </p>
    `;
    findingPanel.appendChild(report);

    // 3. Unlock the quiz after a short pause so the student can read the report
    setTimeout(() => {
      if (findingPanel) {
        findingPanel.style.display = "none";
        findingPanel.innerHTML     = "";
      }
      showQuiz();
    }, 2200);
  } else {
    // Wrong answer — keep the quiz locked, let them try again
    feedbackEl.textContent = FINDING.incorrectFeedback;
    feedbackEl.className   = "finding-feedback finding-feedback--wrong";

    // Re-enable the wrong button after a moment so the student can retry
    setTimeout(() => {
      const wrongBtn = findingPanel.querySelector(`.finding-answer-btn[data-answer-id="${answerId}"]`);
      if (wrongBtn) wrongBtn.classList.remove("finding-answer--wrong");
    }, 1200);
  }
}


/* ============================================================
   QUIZ  (Milestone 3)
   Appears after the student submits the correct Finding.
   ============================================================ */

/** Hides command buttons and shows the quiz in their place. */
function showQuiz() {
  if (!quizPanel || missionComplete) return;

  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display  = "none";

  quizPanel.style.display = "block";
  quizPanel.innerHTML     = buildQuizHTML();

  // Wire up answer buttons
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(btn.dataset.answerId));
  });
}

/** Returns the HTML string for the quiz panel. */
function buildQuizHTML() {
  const answersHTML = QUIZ.answers
    .map(
      (a) =>
        `<button class="quiz-answer-btn" data-answer-id="${a.id}">
          <span class="quiz-answer-letter">${a.id}</span>
          <span class="quiz-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="quiz-header">
      <span class="quiz-label">KNOWLEDGE CHECK</span>
      <span class="quiz-badge">Mission 001</span>
    </div>
    <p class="quiz-question">${QUIZ.question}</p>
    <div class="quiz-answers">${answersHTML}</div>
    <div class="quiz-feedback" id="quizFeedback"></div>
  `;
}

/**
 * Called when the student clicks an answer button.
 * Awards XP and completes the mission on a correct answer;
 * shows a retry message on a wrong answer.
 *
 * @param {string} answerId  "A", "B", "C", or "D"
 */
function handleAnswer(answerId) {
  const chosen  = QUIZ.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;

  // Disable all buttons immediately to prevent re-clicking
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.disabled = true;

    const btnId = btn.dataset.answerId;
    if (btnId === answerId && correct)  btn.classList.add("quiz-answer--correct");
    if (btnId === answerId && !correct) btn.classList.add("quiz-answer--wrong");

    // If the student was wrong, quietly reveal which answer was right
    if (QUIZ.answers.find((a) => a.id === btnId && a.correct) && !correct) {
      btn.classList.add("quiz-answer--reveal");
    }
  });

  const feedbackEl = document.getElementById("quizFeedback");
  if (!feedbackEl) return;

  if (correct) {
    feedbackEl.textContent = QUIZ.correctFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--correct";

    // Milestone 15: tracker — Quiz complete; Reflection is now current
    markProgressStep("quiz");

    // Milestone 14: insert Reflection Checkpoint BEFORE XP + scorecard.
    // XP is awarded only after a correct reflection (see handleReflectionAnswer).
    setTimeout(showReflection, 1400);
  } else {
    feedbackEl.textContent = QUIZ.incorrectFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--wrong";
  }
}


/* ============================================================
   REFLECTION CHECKPOINT  (Milestone 14)
   Reuses the quizPanel container — same pattern as finding→quiz.
   On correct: award XP, then run completeMission() (scorecard).
   On wrong:   show review message, allow retry. No XP yet.
   ============================================================ */

/** Swaps the quiz UI for the reflection prompt. */
function showReflection() {
  if (!quizPanel || missionComplete) return;
  quizPanel.innerHTML = buildReflectionHTML();
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleReflectionAnswer(btn.dataset.answerId));
  });
}

/** Returns the HTML for the Reflection Checkpoint panel.
 *  Reuses the existing .quiz-* classes so styling stays consistent
 *  with the rest of the mission UI (no new CSS required). */
function buildReflectionHTML() {
  const answersHTML = REFLECTION.answers
    .map(
      (a) =>
        `<button class="quiz-answer-btn" data-answer-id="${a.id}">
          <span class="quiz-answer-letter">${a.id}</span>
          <span class="quiz-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="quiz-header">
      <span class="quiz-label">REFLECTION CHECKPOINT</span>
      <span class="quiz-badge">Mission 001</span>
    </div>
    <p class="quiz-question">${REFLECTION.question}</p>
    <div class="quiz-answers">${answersHTML}</div>
    <div class="quiz-feedback" id="reflectionFeedback"></div>
  `;
}

/**
 * Handles reflection-answer clicks.
 *  - Correct: success message → award XP → completeMission (scorecard)
 *  - Wrong:   review message, re-enable buttons after a beat for retry
 */
function handleReflectionAnswer(answerId) {
  const chosen  = REFLECTION.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;
  const feedbackEl = document.getElementById("reflectionFeedback");

  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.disabled = correct;             // freeze UI only on correct answer
    const btnId = btn.dataset.answerId;
    if (btnId === answerId && correct)  btn.classList.add("quiz-answer--correct");
    if (btnId === answerId && !correct) btn.classList.add("quiz-answer--wrong");
  });

  if (!feedbackEl) return;

  if (correct) {
    feedbackEl.textContent = REFLECTION.correctFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--correct";

    // Milestone 15: tracker — Reflection complete; Complete is now current
    markProgressStep("reflection");

    // NOW it's safe to award XP and proceed to the Mission Scorecard.
    awardXP(QUIZ.xpReward);
    setTimeout(() => completeMission(QUIZ.newRank), 1500);
  } else {
    feedbackEl.textContent = REFLECTION.incorrectFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--wrong";

    // Let the student try again — clear the wrong-state styling after a beat.
    setTimeout(() => {
      const wrongBtn = quizPanel.querySelector(`.quiz-answer-btn[data-answer-id="${answerId}"]`);
      if (wrongBtn) wrongBtn.classList.remove("quiz-answer--wrong");
    }, 1200);
  }
}


/* ============================================================
   XP REWARD  (Milestone 3)
   ============================================================ */

/**
 * Adds XP to the student's total and animates the XP bar.
 * @param {number} amount  XP to add (e.g. 100)
 */
function awardXP(amount) {
  currentXP = Math.min(currentXP + amount, MAX_XP);
  saveProgress(); // Milestone 18 — persist XP after every reward

  if (currentXPEl) currentXPEl.textContent = currentXP;

  const pct = Math.round((currentXP / MAX_XP) * 100);
  if (xpBarEl) {
    xpBarEl.style.transition = "width 1s ease";
    xpBarEl.style.width      = `${pct}%`;
    xpBarEl.classList.add("xp-bar--pulse");
    setTimeout(() => xpBarEl.classList.remove("xp-bar--pulse"), 1200);
  }

  printOutput(`[+${amount} XP awarded]`, "info");
  printBlankLine();
}


/* ============================================================
   MISSION COMPLETION  (Milestones 3 & 4)
   ============================================================ */

/**
 * Called after a correct quiz answer (with a 1.5 s delay so the student
 * sees the XP bar animate first).
 *
 * Replaces the quiz panel content with the full Mission Complete screen,
 * which lists the four summary lines and includes a Restart button.
 *
 * @param {string} newRank  Rank name to display (e.g. "Cyber Intern Level 1")
 */
function completeMission(newRank) {
  missionComplete = true;

  // Milestone 13: supervisor's closing message
  setManagerMessage("missionComplete");

  // Milestone 15: mark every step complete (spec #8). The loop is a safety
  // net in case any earlier step's hook didn't fire (e.g. the optional
  // "cat-employee-notes" path); the final "complete" step is always set here.
  PROGRESS_STEPS.forEach((s) => completedProgressSteps.add(s.id));
  renderProgressTracker();

  // Update rank in the XP sidebar
  if (rankNameEl) {
    rankNameEl.textContent = newRank;
    rankNameEl.classList.add("rank-name--upgraded");
  }

  // Flip the mission badge from "IN PROGRESS" to "COMPLETE"
  if (missionBadge) {
    missionBadge.textContent = "COMPLETE";
    missionBadge.classList.add("mission-status-badge--complete");
  }

  // Print a terminal confirmation
  printOutput("[ MISSION COMPLETE \u2014 Well done, Agent. ]", "info");

  // Milestone 9 — flip Mission 1 to Completed and unlock Mission 2 in the
  // Course Progress panel. Also print an unlock notice to the terminal.
  printOutput("[ Mission 2 unlocked: Network Basics ]", "info");
  renderCourseProgress();

  // Replace the quiz panel with the full completion screen
  if (quizPanel) {
    quizPanel.innerHTML = buildCompletionHTML(newRank);

    // Wire up the Restart Mission button
    const restartBtn = document.getElementById("restartMissionBtn");
    if (restartBtn) restartBtn.addEventListener("click", resetMission);
  }

  // Milestone 18 — persist completion + new rank + unlock state
  saveProgress();
}

/**
 * Returns the HTML string for the Mission Complete screen.
 * Shown inside quizPanel after a correct answer.
 *
 * @param {string} newRank  The newly unlocked rank name
 */
function buildCompletionHTML(newRank) {
  return `
    <div class="completion-screen">

      <!-- ===== Header (kept from Milestone 4) ===== -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Mission Complete</h2>
          <p class="completion-subtitle">You identified a phishing attempt.</p>
        </div>
      </div>

      <!-- ===== MISSION SCORECARD (Milestone 8) =====
           Replaces the old 3-row summary with a full training summary.
           All values are derived from the existing QUIZ + mission data so
           they stay in sync if those change later. -->
      <div class="scorecard">

        <div class="scorecard-section">
          <span class="scorecard-section-label">MISSION SCORECARD</span>
        </div>

        <!-- Key/value rows -->
        <ul class="scorecard-rows">
          <li class="scorecard-row">
            <span class="scorecard-key">Mission</span>
            <span class="scorecard-val">New Cybersecurity Intern</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Result</span>
            <span class="scorecard-val scorecard-val--green">Completed</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Threat Identified</span>
            <span class="scorecard-val">Phishing attempt involving password theft</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">XP Earned</span>
            <span class="scorecard-val scorecard-val--cyan">+${QUIZ.xpReward} XP</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Rank</span>
            <span class="scorecard-val scorecard-val--yellow">${newRank}</span>
          </li>
        </ul>

        <!-- Skills Practiced -->
        <div class="scorecard-section">
          <span class="scorecard-section-label">SKILLS PRACTICED</span>
          <ul class="scorecard-skills">
            <li><span class="scorecard-bullet">▹</span>Basic Linux navigation</li>
            <li><span class="scorecard-bullet">▹</span>Reading terminal output</li>
            <li><span class="scorecard-bullet">▹</span>Inspecting files</li>
            <li><span class="scorecard-bullet">▹</span>Identifying suspicious messages</li>
            <li><span class="scorecard-bullet">▹</span>Reporting cybersecurity findings</li>
          </ul>
        </div>

        <!-- What You Learned -->
        <div class="scorecard-section scorecard-learned">
          <span class="scorecard-section-label">WHAT YOU LEARNED</span>
          <p class="scorecard-learned-text">
            You learned how cybersecurity analysts use simple command-line
            investigation steps to inspect files, identify suspicious
            behavior, and report a possible phishing attempt.
          </p>
        </div>

        <!-- Next Mission Preview -->
        <div class="scorecard-section scorecard-next">
          <span class="scorecard-section-label">NEXT MISSION PREVIEW</span>
          <p class="scorecard-next-text">
            <strong class="scorecard-next-title">Network Basics</strong>
            — Learn how analysts identify devices and services on a network.
          </p>
        </div>

      </div>

      <!-- ===== CERTIFICATE PREVIEW (Milestone 16) =====
           Rendered inline inside the completion screen so it's
           automatically cleared by resetMission() (which wipes
           quizPanel.innerHTML) — no extra reset wiring needed. -->
      <div class="certificate-preview" aria-label="Certificate of Completion Preview">

        <div class="certificate-card">
          <div class="certificate-watermark" aria-hidden="true">CYBERCORP</div>

          <div class="certificate-header">
            <span class="certificate-eyebrow">CyberCorp Training Academy</span>
            <h3 class="certificate-title">Certificate of Completion Preview</h3>
            <span class="certificate-seal" aria-hidden="true">★</span>
          </div>

          <div class="certificate-body">
            <div class="certificate-field">
              <span class="certificate-label">Awarded to</span>
              <span class="certificate-value certificate-value--name">${escapeHtml(studentName) || "Student Cyber Intern"}</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">For completing</span>
              <span class="certificate-value">Mission 1 — New Cybersecurity Intern</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Skills Demonstrated</span>
              <ul class="certificate-skills">
                <li><span class="certificate-bullet">▹</span>Basic Linux-style investigation</li>
                <li><span class="certificate-bullet">▹</span>File inspection</li>
                <li><span class="certificate-bullet">▹</span>Phishing recognition</li>
                <li><span class="certificate-bullet">▹</span>Cybersecurity reporting</li>
              </ul>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Status</span>
              <span class="certificate-value certificate-value--status">Mission 1 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all missions in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all missions are complete">
              🔒&nbsp; Download Certificate — Locked
            </button>
          </div>
        </div>
      </div>

      <!-- Restart button -->
      <button id="restartMissionBtn" class="restart-btn">
        ↺ &nbsp;Restart Mission
      </button>

    </div>
  `;
}


/* ============================================================
   BEGIN MISSION  (Milestone 5)
   Called when the student clicks the "Begin Mission" button.
   Transitions the UI from the briefing screen into the active
   mission: reveals command buttons, marks Mission Started, and
   prints a system line in the terminal.
   ============================================================ */

function beginMission() {
  if (missionStarted) return;
  missionStarted = true;
  furthestSeqIndex = -1;

  // First in-mission hint
  setHint(HINTS.started, "normal");
  // Milestone 13: supervisor's first in-mission message
  setManagerMessage("started");
  // Milestone 15: advance tracker — Begin Mission done, Inspect Location is now current
  markProgressStep("begin-mission");

  // Mark the "Mission Started" step as complete
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === null) completedSteps.add(step.id);
  });

  // Hide the briefing panel
  const briefing = document.getElementById("missionBriefing");
  if (briefing) briefing.style.display = "none";

  // Show the command buttons + their hint paragraph
  if (btnContainer) btnContainer.style.display = "";
  if (commandsHint) commandsHint.style.display = "";

  // Re-render mission progress (now shows the 4 real steps)
  renderMissionStatus();

  // Append the system "Mission started" line to the terminal
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--system terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt">system</span>` +
    `<span class="terminal-text">Mission started. Begin workstation inspection.</span>`;
  terminalOutput.appendChild(line);
  printBlankLine();
  scrollTerminal();

  if (terminalInput) terminalInput.focus();
}


/* ============================================================
   RESET  (Milestone 4)
   Wipes all state back to the starting point so the student
   can replay the mission without refreshing the browser.
   ============================================================ */

/**
 * Resets the entire session to its initial state:
 *  - Terminal cleared and boot messages reprinted
 *  - All state variables returned to starting values
 *  - Command buttons and mission tracker re-rendered
 *  - Quiz / completion panel hidden
 *  - XP, rank, and mission badge restored
 *  - Timer restarted
 */
function resetMission() {
  // 1. Reset state variables — back to the pre-briefing state
  currentDir       = "~";
  currentXP        = INITIAL_XP;
  missionComplete  = false;
  missionStarted   = false;    // back to "Awaiting Mission Start"
  furthestSeqIndex = -1;

  // Reset hint back to the pre-briefing message
  setHint(HINTS.awaiting, "muted");
  // Milestone 13: reset supervisor message back to the welcome line
  setManagerMessage("awaiting");
  // Milestone 15: reset progress tracker (Briefing complete, Begin Mission current)
  resetProgressTracker();

  unlockedKeys.clear();
  completedSteps.clear();

  // Pre-populate the starting buttons (they stay hidden until Begin Mission)
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // NOTE: do NOT auto-complete the "Mission Started" step here.
  // beginMission() checks it off when the student clicks Begin Mission.

  // Re-show the briefing panel
  const briefing = document.getElementById("missionBriefing");
  if (briefing) briefing.style.display = "";

  // 2. Reset XP sidebar
  if (currentXPEl) currentXPEl.textContent = INITIAL_XP;
  if (xpBarEl) {
    xpBarEl.style.transition = "width 0.4s ease";
    xpBarEl.style.width      = `${Math.round((INITIAL_XP / MAX_XP) * 100)}%`;
    xpBarEl.classList.remove("xp-bar--pulse");
  }

  // 3. Reset rank
  if (rankNameEl) {
    rankNameEl.textContent = INITIAL_RANK;
    rankNameEl.classList.remove("rank-name--upgraded");
  }

  // 4. Reset mission badge
  if (missionBadge) {
    missionBadge.textContent = "IN PROGRESS";
    missionBadge.classList.remove("mission-status-badge--complete");
  }

  // 5. Clear terminal and reprint boot messages
  clearTerminal();
  printBootMessages();

  // 6. Update prompt (directory changed back to ~)
  updatePromptDisplay();

  // 7. Re-render command buttons and mission tracker
  renderButtons();
  renderMissionStatus();
  renderCourseProgress();   // Milestone 9 — re-lock Mission 2 on restart

  // 8. Hide command buttons + hint (they reappear after Begin Mission),
  //    and hide the quiz/completion panel.
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";
  if (quizPanel) {
    quizPanel.style.display = "none";
    quizPanel.innerHTML     = "";
  }
  // Milestone 7: also hide & clear the Submit Finding panel on restart
  if (findingPanel) {
    findingPanel.style.display = "none";
    findingPanel.innerHTML     = "";
  }

  // 9. Restart countdown timer
  stopTimer();
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Return focus to terminal input
  if (terminalInput) {
    terminalInput.value = "";
    terminalInput.focus();
  }
}


/* ============================================================
   RUN A COMMAND END-TO-END
   ============================================================ */

function runCommand(command, buttonKey = "") {
  const trimmed = command.trim();
  if (!trimmed) return;
  printCommand(trimmed);
  processCommand(trimmed, buttonKey);
}


/* ============================================================
   KEYBOARD INPUT (optional — typed commands bypass unlock logic)
   ============================================================ */

function initTerminalInput() {
  if (!terminalInput) return;
  terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const typed = terminalInput.value;
      terminalInput.value = "";
      runCommand(typed, "");
    }
  });
}

const clrButton = document.querySelector(".terminal-btn");
if (clrButton) clrButton.addEventListener("click", () => {
  clearTerminal();
  printBootMessages();
});


/* ============================================================
   MODULE LANDING  (Milestone 10)
   Visibility-only toggle between the landing screen and the live
   dashboard. Does NOT reset mission progress — students can come
   back to the module overview mid-mission and resume seamlessly.
   The existing "Begin Mission" gate inside the mission panel
   remains in place after entering the module.
   ============================================================ */

function enterModule() {
  // Milestone 17 — capture the student name from the landing input.
  // Safety net: ignore clicks if the name is empty (button should already
  // be disabled, but defensive against keyboard / programmatic triggers).
  const nameInput = document.getElementById("studentNameInput");
  const typed = nameInput ? nameInput.value.trim() : "";
  if (!typed) return;
  studentName = typed;

  // Render personalized greeting at the top of the mission panel
  const welcomeEl = document.getElementById("welcomeMessage");
  if (welcomeEl) {
    welcomeEl.innerHTML = `Welcome, <strong>${escapeHtml(studentName)}</strong>`;
  }

  // Milestone 18 — persist the name as soon as the student enters the module
  saveProgress();

  // Milestone 11 — show the simulation loader first, then the dashboard.
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  runSimulationLoader(() => {
    if (dashboardEl)   dashboardEl.style.display = "";
    if (terminalInput) terminalInput.focus();
  });
}

/** Milestone 17 — escape user-supplied text before injecting into HTML. */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Milestone 11 — Simulation Loading Visualization.
 * Plays a short fake boot sequence (≈4 s) then calls onDone().
 * Purely visual: no real work happens, just timed DOM updates.
 *
 * @param {Function} onDone  Callback fired after the loader hides
 */
function runSimulationLoader(onDone) {
  if (!simLoaderEl) { onDone && onDone(); return; }

  // Reset loader to a clean starting state every time it runs
  if (simLoaderLinesEl)   simLoaderLinesEl.innerHTML = "";
  if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = "";
  if (simLoaderBarEl)     simLoaderBarEl.style.width = "0%";
  if (simLoaderPctEl)     simLoaderPctEl.textContent = "0%";
  if (simLoaderStatusEl)  simLoaderStatusEl.textContent = "BOOTING…";

  simLoaderEl.style.display = "";

  const total = SIM_BOOT_LINES.length;
  let i = 0;

  // Show one line at a time. The "current" line shows below the
  // committed lines with a blinking cursor; on the next tick it gets
  // committed to the list and replaced by the next line.
  function tick() {
    if (i > 0 && simLoaderLinesEl) {
      // Commit the previous "current" line into the scroll-back list
      const prev = document.createElement("div");
      prev.className = "sim-loader-line";
      prev.innerHTML =
        `<span class="sim-loader-prompt">[ ok ]</span> ` +
        `<span class="sim-loader-line-text">${SIM_BOOT_LINES[i - 1]}</span>`;
      simLoaderLinesEl.appendChild(prev);
    }

    if (i >= total) {
      // Final line committed — fill bar to 100%, then hand off
      if (simLoaderBarEl)    simLoaderBarEl.style.width = "100%";
      if (simLoaderPctEl)    simLoaderPctEl.textContent = "100%";
      if (simLoaderStatusEl) simLoaderStatusEl.textContent = "READY";
      if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = "";

      setTimeout(() => {
        simLoaderEl.style.display = "none";
        onDone && onDone();
      }, SIM_FINAL_PAUSE_MS);
      return;
    }

    // Show the next line as the active/current line
    if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = SIM_BOOT_LINES[i];

    // Advance the progress bar proportionally
    const pct = Math.round(((i + 1) / total) * 100);
    if (simLoaderBarEl) simLoaderBarEl.style.width = `${pct}%`;
    if (simLoaderPctEl) simLoaderPctEl.textContent = `${pct}%`;

    i++;
    setTimeout(tick, SIM_LINE_DELAY_MS);
  }

  tick();
}

function backToModuleOverview() {
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "";
  // Scroll the landing back to the top so the student sees the title
  if (moduleLandingEl) moduleLandingEl.scrollTop = 0;
}


/* ============================================================
   COURSE PROGRESS  (Milestone 9)
   Renders the two mission cards in the left sidebar.
   Mission 1's status is derived from `missionComplete`.
   Mission 2 is locked until Mission 1 is completed; once unlocked
   the card grows a "Start Mission 2" button that opens a small
   placeholder panel (Mission 2 itself is not built yet).
   ============================================================ */

/* ============================================================
   PROGRESS TRACKER  (Milestone 15) — renderers + helpers
   ============================================================ */

/**
 * Renders the 10-row tracker. The status of each row is derived:
 *   - "complete" if its id is in completedProgressSteps
 *   - "current"  if it's the FIRST non-complete row
 *   - "locked"   otherwise
 * This means we only ever mutate the completed set — current/locked
 * are computed at render time so the highlight always lines up.
 */
function renderProgressTracker() {
  const el = document.getElementById("progressTracker");
  if (!el) return;

  // Find index of the first non-complete step (the "current" one).
  const currentIdx = PROGRESS_STEPS.findIndex(
    (s) => !completedProgressSteps.has(s.id)
  );

  // Overall % complete — used to fill the connector bar behind the nodes.
  const completedCount = PROGRESS_STEPS.filter((s) =>
    completedProgressSteps.has(s.id)
  ).length;
  // The "filled" portion runs from the first node to the current node.
  // With N nodes, each gap is 1/(N-1). Stop the fill at the current node
  // (or 100% when everything is complete).
  const fillIdx = currentIdx === -1 ? PROGRESS_STEPS.length - 1 : currentIdx;
  const fillPct = (fillIdx / (PROGRESS_STEPS.length - 1)) * 100;

  el.innerHTML = `
    <div class="progress-tracker-bar" role="list" aria-label="Mission progress">
      <div class="progress-tracker-rail" aria-hidden="true"></div>
      <div class="progress-tracker-rail-fill" aria-hidden="true" style="width:${fillPct}%;"></div>
      ${PROGRESS_STEPS.map((step, i) => {
        let status;
        if (completedProgressSteps.has(step.id))      status = "complete";
        else if (i === currentIdx)                    status = "current";
        else                                          status = "locked";

        const symbol = status === "complete" ? "✓" : (i + 1);

        return `
          <div class="progress-tracker-step progress-tracker-step--${status}"
               role="listitem"
               aria-current="${status === "current" ? "step" : "false"}"
               title="${step.label} — ${status.toUpperCase()}">
            <div class="progress-tracker-node">${symbol}</div>
            <div class="progress-tracker-caption">${step.label}</div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="progress-tracker-meta">
      <span class="progress-tracker-meta-count">${completedCount} / ${PROGRESS_STEPS.length}</span>
      <span class="progress-tracker-meta-label">steps complete</span>
    </div>
  `;
}

/** Marks a single step as complete and re-renders. Safe to call twice. */
function markProgressStep(id) {
  if (completedProgressSteps.has(id)) return;
  completedProgressSteps.add(id);
  renderProgressTracker();
}

/** Resets the tracker to its initial state (only Briefing complete). */
function resetProgressTracker() {
  completedProgressSteps.clear();
  completedProgressSteps.add("briefing");
  renderProgressTracker();
}


function renderCourseProgress() {
  if (!courseProgressEl) return;

  // Mission 1 status mirrors the live mission state
  const m1Completed = missionComplete;

  // Status label + CSS modifier for each card
  const m1Status = m1Completed
    ? { label: "Completed", mod: "completed" }
    : { label: "Available", mod: "available" };

  const m2Status = m1Completed
    ? { label: "Unlocked", mod: "unlocked" }
    : { label: "Locked",   mod: "locked"   };

  // Build the markup. The Start Mission 2 button + unlock notice only
  // appear when Mission 1 is complete.
  courseProgressEl.innerHTML = `
    <div class="course-progress-header">
      <span class="course-progress-label">COURSE PROGRESS</span>
      <span class="course-progress-sub">2 missions</span>
    </div>

    <ul class="course-list">

      <!-- Mission 1 card -->
      <li class="course-card course-card--${m1Status.mod}">
        <div class="course-card-row">
          <span class="course-card-num">01</span>
          <div class="course-card-info">
            <span class="course-card-title">New Cybersecurity Intern</span>
            <span class="course-card-desc">Investigate a suspicious workstation.</span>
          </div>
          <span class="course-card-status course-card-status--${m1Status.mod}">
            ${m1Status.label}
          </span>
        </div>
      </li>

      <!-- Mission 2 card -->
      <li class="course-card course-card--${m2Status.mod}">
        <div class="course-card-row">
          <span class="course-card-num">02</span>
          <div class="course-card-info">
            <span class="course-card-title">Network Basics</span>
            <span class="course-card-desc">Identify devices and services on a network.</span>
          </div>
          <span class="course-card-status course-card-status--${m2Status.mod}">
            ${m2Status.mod === "locked" ? "🔒 " : ""}${m2Status.label}
          </span>
        </div>

        ${m1Completed ? `
          <div class="course-card-unlock-note">
            ✓ Mission 2 unlocked: Network Basics
          </div>
          <button id="startMission2Btn" class="course-start-btn">
            ▶&nbsp; Start Mission 2
          </button>
        ` : ""}
      </li>
    </ul>
  `;

  // Wire up the Start Mission 2 button (only present when unlocked).
  // Milestone 19: clicking it now takes the student to the full
  // Mission 2 Overview takeover screen.
  if (m1Completed) {
    const startBtn = document.getElementById("startMission2Btn");
    if (startBtn) startBtn.addEventListener("click", showMission2Overview);
  }
}

/* ============================================================
   MISSION 2 OVERVIEW  (Milestone 19)
   Takeover screen previewing Mission 2. Hides the dashboard
   and the module landing; "Back to Module Overview" returns
   to the landing screen. Mission 2 gameplay is not yet built.
   ============================================================ */

function showMission2Overview() {
  const overview = document.getElementById("mission2Overview");
  if (!overview) return;
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  overview.style.display = "";
  overview.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" });
}

function hideMission2Overview() {
  const overview = document.getElementById("mission2Overview");
  if (overview) overview.style.display = "none";
  if (moduleLandingEl) {
    moduleLandingEl.style.display = "";
    moduleLandingEl.scrollTop = 0;
  }
}

/* ============================================================
   MISSION 2 GAMEPLAY  (Milestone 20)
   Guided 4-command sequence on the Mission 2 Overview screen.
   Self-contained — does not touch Mission 1 state.
   ============================================================ */

// Ordered status entries. Each is marked complete as the student progresses.
const M2_STATUS = [
  { id: "started",   label: "Mission 2 Started" },
  { id: "ip-addr",   label: "Local IP Identified" },
  { id: "ping",      label: "Host Reachability Confirmed" },
  { id: "nmap",      label: "Open Services Found" },
  { id: "review",    label: "Services Reviewed" },
];

// Per-command: terminal output lines + hint shown AFTER the command runs +
// commands this one unlocks next + supervisor message fired after the run.
const M2_COMMANDS = {
  "ip-addr": {
    cmd:    "ip addr",
    output: ["eth0: inet 10.0.0.12/24"],
    nextHint: "Now check whether the target host is reachable.",
    unlocks: [],
    managerMsg: "Good — you've identified your local IP. Now confirm whether the target host is reachable.",
  },
  "ping": {
    cmd:    "ping 10.0.0.5",
    output: ["64 bytes from 10.0.0.5: host is reachable"],
    nextHint: "The host is reachable. Scan for open services.",
    unlocks: ["nmap"],
    managerMsg: "The host is alive. Let's see what services it's exposing — try a quick port scan.",
  },
  "nmap": {
    cmd:    "nmap 10.0.0.5",
    output: [
      "PORT     STATE  SERVICE",
      "22/tcp   open   ssh",
      "80/tcp   open   http",
      "443/tcp  open   https",
    ],
    nextHint: "Review the services and think about what they mean.",
    unlocks: ["review"],
    managerMsg: "Three open ports — SSH, HTTP, and HTTPS. Review what those services tell us about this host.",
  },
  "review": {
    cmd:    "review services",
    output: ["The host has SSH, HTTP, and HTTPS services exposed."],
    nextHint: "Mission 2 commands complete.",
    unlocks: [],
    managerMsg: "Great work, Agent. You've completed the Mission 2 command sequence — a real network recon mini-exercise.",
  },
};

function setM2ManagerMessage(text) {
  const el = document.getElementById("m2ManagerText");
  if (el) el.textContent = text;
}

let m2Started = false;
const m2UnlockedCmds = new Set();
const m2CompletedStatus = new Set();

function beginMission2() {
  // Navigate from the Mission 2 Overview to the Mission 2 Dashboard.
  // (Idempotent — re-clicking just re-shows the dashboard.)
  const overview  = document.getElementById("mission2Overview");
  const dashboard = document.getElementById("mission2Dashboard");
  if (overview)  overview.style.display  = "none";
  if (dashboard) dashboard.style.display = "";
  window.scrollTo({ top: 0, behavior: "instant" });

  if (m2Started) return;
  m2Started = true;

  // Unlock the two starting commands
  m2UnlockedCmds.add("ip-addr");
  m2UnlockedCmds.add("ping");
  syncM2Buttons();

  // Status + opening hint + supervisor briefing
  markM2Status("started");
  setM2Hint("Start by identifying your local IP address.");
  setM2ManagerMessage("Welcome to Mission 2, Agent. Let's map this network — start by identifying your local IP address.");

  // Print a small system line in the terminal so it's not empty
  printM2Line("[ Mission 2 environment ready ]", "m2-line--info");
}

/** Return from the Mission 2 Dashboard back to the Mission 2 Overview.
 *  Mission 2 progress (m2Started, unlocks, status) is preserved so the
 *  student can resume by clicking Begin Mission 2 again. */
function backToMission2Overview() {
  const overview  = document.getElementById("mission2Overview");
  const dashboard = document.getElementById("mission2Dashboard");
  if (dashboard) dashboard.style.display = "none";
  if (overview)  overview.style.display  = "";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function runM2Command(key) {
  if (!m2Started) return;
  if (!m2UnlockedCmds.has(key)) return;
  const def = M2_COMMANDS[key];
  if (!def) return;

  // Print prompt line + each output line
  printM2Line(`<span class="m2-prompt">student@cybercorp:~$</span> ${escapeHtml(def.cmd)}`, "m2-line--prompt");
  def.output.forEach((line) => printM2Line(escapeHtml(line), "m2-line--output"));
  printM2Line("", "m2-line--blank");

  // Mark this status step complete + unlock next commands
  markM2Status(key);
  def.unlocks.forEach((next) => m2UnlockedCmds.add(next));
  syncM2Buttons();
  setM2Hint(def.nextHint);
  if (def.managerMsg) setM2ManagerMessage(def.managerMsg);
}

function syncM2Buttons() {
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    const key = btn.getAttribute("data-m2cmd");
    const unlocked = m2UnlockedCmds.has(key);
    btn.disabled = !unlocked;
    btn.classList.toggle("m2-cmd-btn--unlocked", unlocked);
    if (unlocked) btn.removeAttribute("title");
  });
}

function printM2Line(html, cls = "") {
  const term = document.getElementById("m2Terminal");
  if (!term) return;
  const div = document.createElement("div");
  div.className = `m2-line ${cls}`.trim();
  div.innerHTML = html;
  term.appendChild(div);
  term.scrollTop = term.scrollHeight;
}

function setM2Hint(text) {
  const el = document.getElementById("m2Hint");
  if (el) el.textContent = text;
}

function markM2Status(id) {
  if (m2CompletedStatus.has(id)) return;
  m2CompletedStatus.add(id);
  renderM2Status();
}

function renderM2Status() {
  const list = document.getElementById("m2StatusList");
  if (!list) return;
  list.innerHTML = M2_STATUS.map((s) => {
    const done = m2CompletedStatus.has(s.id);
    return `
      <li class="m2-status-item ${done ? "m2-status-item--done" : "m2-status-item--pending"}">
        <span class="m2-status-icon">${done ? "✓" : "•"}</span>
        <span class="m2-status-label">${s.label}</span>
      </li>
    `;
  }).join("");
}

/** Resets Mission 2 in-memory state + dashboard UI back to a fresh state. */
function resetMission2() {
  m2Started = false;
  m2UnlockedCmds.clear();
  m2CompletedStatus.clear();

  const term = document.getElementById("m2Terminal");
  if (term) term.innerHTML = "";
  setM2Hint("Start by identifying your local IP address.");
  setM2ManagerMessage("Welcome back. Mission 2 is a network reconnaissance exercise. Click any unlocked command to begin.");
  renderM2Status();

  // Buttons back to disabled
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    btn.disabled = true;
    btn.classList.remove("m2-cmd-btn--unlocked");
  });

  // Hide the dashboard if it's currently showing
  const dashboard = document.getElementById("mission2Dashboard");
  if (dashboard) dashboard.style.display = "none";
}


/* ============================================================
   BOOT — runs once on page load
   ============================================================ */

function boot() {
  // Pre-populate the starting buttons (stay hidden until Begin Mission)
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // NOTE: missionStarted is false on load, so "Mission Started" is NOT
  // auto-completed. beginMission() handles that when the student clicks Begin.

  updatePromptDisplay();
  printBootMessages();
  renderButtons();
  renderMissionStatus();
  renderCourseProgress();   // Milestone 9 — initial render (Mission 2 locked)
  renderProgressTracker();  // Milestone 15 — initial render (Briefing complete, Begin Mission current)

  // Milestone 6: show the awaiting hint on initial load
  setHint(HINTS.awaiting, "muted");

  // Hide command buttons + hint until the student clicks Begin Mission
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";

  // Wire up the Begin Mission button
  const beginBtn = document.getElementById("beginMissionBtn");
  if (beginBtn) beginBtn.addEventListener("click", beginMission);

  // Milestone 10 — wire up Enter Module + Back to Module Overview
  const enterBtn = document.getElementById("enterModuleBtn");
  if (enterBtn) enterBtn.addEventListener("click", enterModule);
  const backBtn = document.getElementById("backToModuleBtn");
  if (backBtn) backBtn.addEventListener("click", backToModuleOverview);

  // Milestone 17 — Student Name input gating.
  // The button starts disabled (set in index.html) and becomes enabled
  // as soon as the input has a non-empty trimmed value. Pressing Enter
  // inside the field triggers Enter Module when the name is valid.
  const nameInput = document.getElementById("studentNameInput");
  if (nameInput && enterBtn) {
    const syncEnterBtn = () => {
      const hasName = nameInput.value.trim().length > 0;
      enterBtn.disabled = !hasName;
    };
    nameInput.addEventListener("input", syncEnterBtn);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !enterBtn.disabled) {
        e.preventDefault();
        enterModule();
      }
    });
    syncEnterBtn();
  }

  // Start mission timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Inject the build timestamp into the footer so it's always visible
  const buildEl = document.getElementById("buildTimestamp");
  if (buildEl) buildEl.textContent = `build: ${BUILD_TIME}`;

  // Milestone 19 — wire the "Back to Module Overview" button on the
  // Mission 2 Overview takeover screen
  const m2BackBtn = document.getElementById("mission2BackBtn");
  if (m2BackBtn) m2BackBtn.addEventListener("click", hideMission2Overview);

  // Milestone 20 — Mission 2 gameplay wiring
  const m2BeginBtn = document.getElementById("m2BeginBtn");
  if (m2BeginBtn) m2BeginBtn.addEventListener("click", beginMission2);
  const m2DashBackBtn = document.getElementById("m2DashBackBtn");
  if (m2DashBackBtn) m2DashBackBtn.addEventListener("click", backToMission2Overview);
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    btn.addEventListener("click", () => runM2Command(btn.getAttribute("data-m2cmd")));
  });
  renderM2Status();

  // Milestone 18 — wire Clear Saved Progress button(s)
  document.querySelectorAll(".clear-progress-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Clear all saved progress? This cannot be undone.")) {
        clearSavedProgress();
      }
    });
  });

  // Milestone 18 — restore saved progress (runs AFTER renderers + listeners
  // are in place, so any UI updates inside restore work correctly)
  restoreSavedProgress();

  initTerminalInput();
  if (terminalInput) terminalInput.focus();
}

document.addEventListener("DOMContentLoaded", boot);
