/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform — Milestone 2: Mission Progression
 *
 * PURPOSE
 * -------
 * Students click command buttons and see realistic Linux terminal output.
 * Commands unlock gradually so the investigation feels guided, not overwhelming.
 *
 * PROGRESSION FLOW
 * ----------------
 *  Start    → pwd, ls are visible
 *  After ls → cd documents unlocks
 *  After cd → ls (documents), cat employee_notes.txt, cat suspicious_file.txt unlock
 *
 * HOW STATE WORKS
 * ---------------
 *  currentDir     : which folder the student is in (changes on `cd`)
 *  unlockedKeys   : Set of button keys currently visible (grows as student progresses)
 *  completedSteps : Set of step IDs already marked done (shown with a ✓ in Mission Panel)
 *
 * FILES
 * -----
 *  missions.js  — all data (FILESYSTEM, COMMAND_BUTTONS, MISSION_STEPS, MISSIONS)
 *  script.js    — all interaction logic (this file)
 *  index.html   — HTML structure
 *  style.css    — visual styling
 */

import {
  FILESYSTEM,
  COMMAND_BUTTONS,
  MISSION_STEPS,
  getMissionById,
  activeMissionId,
} from "/missions.js";


/* ============================================================
   STEP 1 — DOM references
   Look up every HTML element we need, once, at the start.
   ============================================================ */

const terminalOutput  = document.getElementById("terminalOutput");
const terminalInput   = document.getElementById("terminalInput");
const missionTimer    = document.getElementById("missionTimer");
const promptLabel     = document.querySelector(".terminal-prompt-label");
const terminalTitle   = document.querySelector(".terminal-title");
const btnContainer    = document.getElementById("commandButtonsContainer");
const statusList      = document.getElementById("missionStatusList");


/* ============================================================
   STEP 2 — Application state
   These variables track where the student is and what they've done.
   ============================================================ */

/** Which directory the student is currently in. */
let currentDir = "~";

/** Set of button keys the student can currently see and click. */
const unlockedKeys = new Set();

/** Set of mission step IDs that have been marked complete. */
const completedSteps = new Set();


/* ============================================================
   STEP 3 — Prompt helper
   Builds the shell prompt string for the current directory.
   Example: "student@cybercorp:~/documents$"
   ============================================================ */

function getPrompt() {
  return `student@cybercorp:${currentDir}$`;
}

/** Updates every on-screen prompt to match the current directory. */
function updatePromptDisplay() {
  const p = getPrompt();
  if (terminalTitle) terminalTitle.textContent = p;
  if (promptLabel)   promptLabel.textContent   = p;
}


/* ============================================================
   STEP 4 — Terminal output helpers
   Functions for appending lines to the terminal panel.
   ============================================================ */

/**
 * Prints the command the student "ran" (shown in green with the prompt).
 * Looks like:  student@cybercorp:~$ ls
 *
 * @param {string} command
 */
function printCommand(command) {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt">${getPrompt()}</span>` +
    `<span class="terminal-text terminal-text--success">${command}</span>`;
  terminalOutput.appendChild(line);
  scrollTerminal();
}

/**
 * Prints one line of output under a command.
 *
 * @param {string} text
 * @param {string} [type]  "default" | "warn" | "error" | "info"
 */
function printOutput(text, type = "default") {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt" style="opacity:0;user-select:none;">$</span>` +
    `<span class="terminal-text terminal-text--${type}">${text}</span>`;
  terminalOutput.appendChild(line);
  scrollTerminal();
}

/** Prints an empty line to visually separate command blocks. */
function printBlankLine() {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = "&nbsp;";
  terminalOutput.appendChild(line);
  scrollTerminal();
}

/** Scrolls the terminal so the latest line is always visible. */
function scrollTerminal() {
  if (terminalOutput) terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/** Wipes the terminal and shows a fresh system message. */
function clearTerminal() {
  terminalOutput.innerHTML = "";
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--system";
  line.innerHTML =
    `<span class="terminal-prompt">system</span>` +
    `<span class="terminal-text">Terminal cleared. Click a button to continue.</span>`;
  terminalOutput.appendChild(line);
}


/* ============================================================
   STEP 5 — Command processor
   Handles each command the student runs, using the FILESYSTEM
   data from missions.js to produce the correct output.
   ============================================================ */

/**
 * Processes one command string and prints the right output.
 *
 * @param {string} command   The full command (e.g. "cat suspicious_file.txt")
 * @param {string} buttonKey The key of the button that was clicked
 */
function processCommand(command, buttonKey) {
  const cmd     = command.trim().toLowerCase();
  const dirData = FILESYSTEM[currentDir];

  /* ---- pwd ---- */
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  /* ---- ls ---- */
  if (cmd === "ls") {
    // Join items with two spaces — same layout as a real terminal one-liner
    printOutput(dirData.ls.join("  "));
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  /* ---- cd <folder> ---- */
  if (cmd.startsWith("cd ")) {
    const target     = cmd.slice(3).trim();
    const newPath    = `${currentDir}/${target}`;
    const normalised = newPath.replace("~//", "~/");

    if (dirData.subdirs.includes(target) && FILESYSTEM[normalised]) {
      currentDir = normalised;
      updatePromptDisplay();
      // Successful cd has no output — just like a real shell
      printBlankLine();
      afterCommand(buttonKey);
    } else {
      printOutput(`bash: cd: ${target}: No such file or directory`, "error");
      printBlankLine();
    }
    return;
  }

  /* ---- cat <filename> ---- */
  if (cmd.startsWith("cat ")) {
    // Use the original-cased command to look up the filename correctly
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

  /* ---- clear ---- */
  if (cmd === "clear") {
    clearTerminal();
    return;
  }

  /* ---- unknown ---- */
  printOutput(
    `bash: ${cmd.split(" ")[0]}: command not found`,
    "error"
  );
  printBlankLine();
}


/* ============================================================
   STEP 6 — Unlock & progression engine
   Called after every command to reveal new buttons and
   check off mission steps.
   ============================================================ */

/**
 * Called after a command runs successfully.
 * Unlocks any buttons gated on this button key,
 * and marks any mission steps that this key triggers.
 *
 * @param {string} buttonKey  The key of the button that was just clicked
 */
function afterCommand(buttonKey) {
  if (!buttonKey) return;

  // Find this button's definition to see what it unlocks
  const btnDef = COMMAND_BUTTONS.find((b) => b.key === buttonKey);
  if (btnDef && btnDef.unlocksAfterRun.length > 0) {
    unlockButtons(btnDef.unlocksAfterRun);
  }

  // Check if this button key completes a mission step
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === buttonKey && !completedSteps.has(step.id)) {
      completeStep(step.id);
    }
  });
}

/**
 * Adds new button keys to the unlocked set and re-renders the button panel.
 * New buttons appear with a short slide-in animation so the student notices them.
 *
 * @param {string[]} keys  Array of button keys to unlock
 */
function unlockButtons(keys) {
  let anyNew = false;
  keys.forEach((key) => {
    if (!unlockedKeys.has(key)) {
      unlockedKeys.add(key);
      anyNew = true;
    }
  });
  if (anyNew) renderButtons(keys); // pass newly unlocked keys for animation
}

/**
 * Marks a mission step as complete and re-renders the status list.
 *
 * @param {string} stepId
 */
function completeStep(stepId) {
  completedSteps.add(stepId);
  renderMissionStatus();
}


/* ============================================================
   STEP 7 — Render: command buttons
   Builds the button panel from the COMMAND_BUTTONS data.
   Only buttons in `unlockedKeys` are shown.
   Newly unlocked buttons play an appear animation.
   ============================================================ */

/**
 * Renders all unlocked buttons into #commandButtonsContainer.
 *
 * @param {string[]} [newlyUnlocked]  Keys that were just unlocked (get animation)
 */
function renderButtons(newlyUnlocked = []) {
  if (!btnContainer) return;
  btnContainer.innerHTML = "";

  COMMAND_BUTTONS.forEach((btn) => {
    if (!unlockedKeys.has(btn.key)) return;  // skip locked buttons

    const el = document.createElement("button");
    el.className = `cmd-btn cmd-btn--${btn.style}`;
    el.dataset.command   = btn.command;
    el.dataset.buttonKey = btn.key;

    // Newly unlocked buttons get an animation class so the student notices them
    if (newlyUnlocked.includes(btn.key)) {
      el.classList.add("cmd-btn--unlocking");
      // Remove animation class after it plays so it doesn't re-trigger
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
   STEP 8 — Render: mission status tracker
   Builds the 4-step progress list inside #missionStatusList.
   Completed steps show ✓ and a different colour.
   ============================================================ */

function renderMissionStatus() {
  if (!statusList) return;
  statusList.innerHTML = "";

  MISSION_STEPS.forEach((step) => {
    const done = completedSteps.has(step.id);

    const li = document.createElement("li");
    li.className = `step-item ${done ? "step-item--complete" : "step-item--pending"}`;

    li.innerHTML =
      `<span class="step-icon">${done ? "✓" : "○"}</span>` +
      `<span class="step-emoji">${step.icon}</span>` +
      `<span class="step-label">${step.label}</span>`;

    statusList.appendChild(li);
  });
}


/* ============================================================
   STEP 9 — Run a command end-to-end
   ============================================================ */

/**
 * Echoes the command to the terminal, then processes and shows output.
 *
 * @param {string} command    The command string (e.g. "ls")
 * @param {string} [buttonKey] The key of the button that triggered it
 */
function runCommand(command, buttonKey = "") {
  const trimmed = command.trim();
  if (!trimmed) return;
  printCommand(trimmed);
  processCommand(trimmed, buttonKey);
}


/* ============================================================
   STEP 10 — Keyboard input (optional typing)
   The student can also type commands by hand.
   Note: typed commands won't trigger the unlock system because
   they don't have a button key. Button clicks are the intended path.
   ============================================================ */

function initTerminalInput() {
  if (!terminalInput) return;

  terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const typed = terminalInput.value;
      terminalInput.value = "";
      runCommand(typed, ""); // no button key — won't unlock/progress
    }
  });
}

// Wire up the CLR button in the terminal header
const clrButton = document.querySelector(".terminal-btn");
if (clrButton) {
  clrButton.addEventListener("click", clearTerminal);
}


/* ============================================================
   STEP 11 — Countdown timer
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


/* ============================================================
   STEP 12 — Boot
   Sets up the initial state when the page first loads.
   ============================================================ */

function boot() {
  // Set the starting unlocked buttons
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // "Mission Started" step is auto-complete (triggeredBy: null)
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === null) completedSteps.add(step.id);
  });

  // Render the initial UI
  updatePromptDisplay();
  renderButtons();
  renderMissionStatus();

  // Start the timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Wire up keyboard input
  initTerminalInput();

  // Focus the terminal input
  if (terminalInput) terminalInput.focus();
}

document.addEventListener("DOMContentLoaded", boot);
