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
const BUILD_TIME = "28 May 2026 — 00:25 CST";


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

const HINTS = {
  awaiting:             "Read the briefing, then click Begin Mission.",
  started:              "Start by checking your current location.",
  "pwd":                "Now list the files and folders in your current location.",
  "ls-home":            "You found several folders. Open the documents folder.",
  "cd-documents":       "Now list the files inside the documents folder.",
  "ls-documents":       "Read both files. One contains normal guidance. One contains suspicious behavior.",
  "cat-employee-notes": "This file looks normal. Continue checking the remaining file.",
  "cat-suspicious":     "You found suspicious behavior. Answer the quiz to complete the mission.",
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
const commandsHint   = document.querySelector(".commands-hint");

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

  // Show the quiz 800ms after reading the suspicious file
  if (buttonKey === "cat-suspicious") {
    setTimeout(showQuiz, 800);
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
   QUIZ  (Milestone 3)
   Appears after the student reads suspicious_file.txt.
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

    // Award XP first, then after 1.5 s swap the quiz for the completion screen
    awardXP(QUIZ.xpReward);
    setTimeout(() => completeMission(QUIZ.newRank), 1500);
  } else {
    feedbackEl.textContent = QUIZ.incorrectFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--wrong";
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

  // Replace the quiz panel with the full completion screen
  if (quizPanel) {
    quizPanel.innerHTML = buildCompletionHTML(newRank);

    // Wire up the Restart Mission button
    const restartBtn = document.getElementById("restartMissionBtn");
    if (restartBtn) restartBtn.addEventListener("click", resetMission);
  }
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

      <!-- Header -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Mission Complete</h2>
          <p class="completion-subtitle">You identified a phishing attempt.</p>
        </div>
      </div>

      <!-- Summary rows -->
      <ul class="completion-summary">
        <li class="completion-row">
          <span class="completion-row-icon">✓</span>
          <span class="completion-row-label">Threat identified</span>
          <span class="completion-row-value completion-row-value--green">Phishing email</span>
        </li>
        <li class="completion-row">
          <span class="completion-row-icon">⚡</span>
          <span class="completion-row-label">XP earned</span>
          <span class="completion-row-value completion-row-value--cyan">+${QUIZ.xpReward} XP</span>
        </li>
        <li class="completion-row">
          <span class="completion-row-icon">🎖️</span>
          <span class="completion-row-label">Rank unlocked</span>
          <span class="completion-row-value completion-row-value--yellow">${newRank}</span>
        </li>
      </ul>

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

  // 8. Hide command buttons + hint (they reappear after Begin Mission),
  //    and hide the quiz/completion panel.
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";
  if (quizPanel) {
    quizPanel.style.display = "none";
    quizPanel.innerHTML     = "";
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

  // Milestone 6: show the awaiting hint on initial load
  setHint(HINTS.awaiting, "muted");

  // Hide command buttons + hint until the student clicks Begin Mission
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";

  // Wire up the Begin Mission button
  const beginBtn = document.getElementById("beginMissionBtn");
  if (beginBtn) beginBtn.addEventListener("click", beginMission);

  // Start mission timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Inject the build timestamp into the footer so it's always visible
  const buildEl = document.getElementById("buildTimestamp");
  if (buildEl) buildEl.textContent = `build: ${BUILD_TIME}`;

  initTerminalInput();
  if (terminalInput) terminalInput.focus();
}

document.addEventListener("DOMContentLoaded", boot);
