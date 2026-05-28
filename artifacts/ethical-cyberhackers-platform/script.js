/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform — Milestone 3: Quiz & XP Reward
 *
 * FLOW THIS FILE IMPLEMENTS
 * -------------------------
 *  1. Student clicks buttons → terminal shows output (Milestone 1 & 2)
 *  2. Commands unlock gradually as the student investigates (Milestone 2)
 *  3. After reading suspicious_file.txt → a quiz appears (Milestone 3)
 *  4. Correct answer → +100 XP, rank update, "Mission Complete"
 *  5. Wrong answer   → "Not correct. Review the suspicious file again."
 *
 * FILES
 * -----
 *  missions.js — all data (FILESYSTEM, COMMAND_BUTTONS, MISSION_STEPS, QUIZ, MISSIONS)
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
   STEP 1 — DOM references
   ============================================================ */

const terminalOutput  = document.getElementById("terminalOutput");
const terminalInput   = document.getElementById("terminalInput");
const missionTimer    = document.getElementById("missionTimer");
const promptLabel     = document.querySelector(".terminal-prompt-label");
const terminalTitle   = document.querySelector(".terminal-title");
const btnContainer    = document.getElementById("commandButtonsContainer");
const statusList      = document.getElementById("missionStatusList");
const quizPanel       = document.getElementById("quizPanel");
const commandsHint    = document.querySelector(".commands-hint");

// XP panel elements (updated when the student earns XP)
const xpBarEl      = document.getElementById("xpBar");
const currentXPEl  = document.getElementById("currentXP");
const maxXPEl      = document.getElementById("maxXP");
const rankNameEl   = document.getElementById("rankName");

// Mission panel badge ("IN PROGRESS" → "COMPLETE")
const missionBadge = document.querySelector(".mission-status-badge");


/* ============================================================
   STEP 2 — Application state
   ============================================================ */

/** Which directory the student is currently in. */
let currentDir = "~";

/** Button keys the student can currently see. */
const unlockedKeys = new Set();

/** Mission step IDs that have been checked off. */
const completedSteps = new Set();

/** Current XP total (starts at 750 for demonstration). */
let currentXP = 750;

/** Max XP for the current rank tier. */
const maxXP = 1000;

/** Whether the mission has been fully completed. */
let missionComplete = false;


/* ============================================================
   STEP 3 — Prompt helpers
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
   STEP 4 — Terminal output helpers
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
   Looks up FILESYSTEM data and shows the right output per command.
   ============================================================ */

function processCommand(command, buttonKey) {
  const cmd     = command.trim().toLowerCase();
  const dirData = FILESYSTEM[currentDir];

  /* pwd */
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  /* ls */
  if (cmd === "ls") {
    printOutput(dirData.ls.join("  "));
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  /* cd <folder> */
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

  /* cat <filename> */
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

  /* clear */
  if (cmd === "clear") {
    clearTerminal();
    return;
  }

  /* unknown */
  printOutput(`bash: ${cmd.split(" ")[0]}: command not found`, "error");
  printBlankLine();
}


/* ============================================================
   STEP 6 — Unlock & progression engine
   ============================================================ */

/**
 * Called after every command.
 * Unlocks any buttons gated on this key, marks mission steps,
 * and triggers the quiz if this was "cat-suspicious".
 *
 * @param {string} buttonKey
 */
function afterCommand(buttonKey) {
  if (!buttonKey) return;

  // Unlock buttons whose unlock condition was just met
  const btnDef = COMMAND_BUTTONS.find((b) => b.key === buttonKey);
  if (btnDef && btnDef.unlocksAfterRun.length > 0) {
    unlockButtons(btnDef.unlocksAfterRun);
  }

  // Check off mission steps triggered by this button
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === buttonKey && !completedSteps.has(step.id)) {
      completeStep(step.id);
    }
  });

  // Show the quiz after the student reads the suspicious file
  if (buttonKey === "cat-suspicious") {
    // Short delay so the student sees the file content before the quiz appears
    setTimeout(showQuiz, 800);
  }
}

function unlockButtons(keys) {
  let anyNew = false;
  keys.forEach((key) => {
    if (!unlockedKeys.has(key)) {
      unlockedKeys.add(key);
      anyNew = true;
    }
  });
  if (anyNew) renderButtons(keys);
}

function completeStep(stepId) {
  completedSteps.add(stepId);
  renderMissionStatus();
}


/* ============================================================
   STEP 7 — Render: command buttons
   ============================================================ */

function renderButtons(newlyUnlocked = []) {
  if (!btnContainer) return;
  btnContainer.innerHTML = "";

  COMMAND_BUTTONS.forEach((btn) => {
    if (!unlockedKeys.has(btn.key)) return;

    const el = document.createElement("button");
    el.className = `cmd-btn cmd-btn--${btn.style}`;
    el.dataset.command   = btn.command;
    el.dataset.buttonKey = btn.key;

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
   STEP 8 — Render: mission status tracker
   ============================================================ */

function renderMissionStatus() {
  if (!statusList) return;
  statusList.innerHTML = "";

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
   STEP 9 — Quiz
   Shown after the student reads suspicious_file.txt.
   Builds the question and four answer buttons dynamically.
   ============================================================ */

/**
 * Hides the command buttons, shows the quiz panel, and builds the quiz UI.
 * Called 800ms after "cat suspicious_file.txt" runs.
 */
function showQuiz() {
  if (!quizPanel || missionComplete) return;

  // Hide the command buttons — the quiz replaces them
  if (btnContainer)  btnContainer.style.display  = "none";
  if (commandsHint)  commandsHint.style.display   = "none";

  // Build and show the quiz
  quizPanel.style.display = "block";
  quizPanel.innerHTML     = buildQuizHTML();

  // Wire up each answer button
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(btn.dataset.answerId));
  });
}

/**
 * Returns the HTML string for the quiz panel.
 * The answer buttons are wired up separately in showQuiz().
 */
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
 * Shows feedback, and if correct, awards XP and completes the mission.
 *
 * @param {string} answerId  "A", "B", "C", or "D"
 */
function handleAnswer(answerId) {
  const chosen  = QUIZ.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;

  // Disable all answer buttons to prevent re-clicking
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.disabled = true;
    // Highlight which was right and which was chosen
    const btnId = btn.dataset.answerId;
    if (btnId === answerId && correct)  btn.classList.add("quiz-answer--correct");
    if (btnId === answerId && !correct) btn.classList.add("quiz-answer--wrong");
    if (QUIZ.answers.find((a) => a.id === btnId && a.correct) && !correct) {
      btn.classList.add("quiz-answer--reveal");  // show the right answer
    }
  });

  const feedbackEl = document.getElementById("quizFeedback");
  if (!feedbackEl) return;

  if (correct) {
    feedbackEl.textContent  = QUIZ.correctFeedback;
    feedbackEl.className    = "quiz-feedback quiz-feedback--correct";
    awardXP(QUIZ.xpReward);
    completeMission(QUIZ.newRank);
  } else {
    feedbackEl.textContent  = QUIZ.incorrectFeedback;
    feedbackEl.className    = "quiz-feedback quiz-feedback--wrong";
  }
}


/* ============================================================
   STEP 10 — XP reward & mission completion
   ============================================================ */

/**
 * Adds XP to the student's total and animates the XP bar.
 * Updates the on-screen XP value and bar width.
 *
 * @param {number} amount  XP to add (e.g. 100)
 */
function awardXP(amount) {
  currentXP = Math.min(currentXP + amount, maxXP);

  // Update the numeric display
  if (currentXPEl) currentXPEl.textContent = currentXP;

  // Animate the XP bar to the new width
  const pct = Math.round((currentXP / maxXP) * 100);
  if (xpBarEl) {
    xpBarEl.style.transition = "width 1s ease";
    xpBarEl.style.width      = `${pct}%`;
    // Brief glow pulse on the bar
    xpBarEl.classList.add("xp-bar--pulse");
    setTimeout(() => xpBarEl.classList.remove("xp-bar--pulse"), 1200);
  }

  // Print a terminal confirmation line
  printOutput(`[+${amount} XP awarded]`, "info");
  printBlankLine();
}

/**
 * Marks the mission as fully complete:
 *  - Updates the rank name in the XP panel
 *  - Changes the mission badge from "IN PROGRESS" to "COMPLETE"
 *  - Appends a "Mission Complete" banner inside the quiz panel
 *
 * @param {string} newRank  The rank name to display
 */
function completeMission(newRank) {
  missionComplete = true;

  // Update rank in the XP panel
  if (rankNameEl) {
    rankNameEl.textContent = newRank;
    rankNameEl.classList.add("rank-name--upgraded");
  }

  // Flip the mission badge to "COMPLETE"
  if (missionBadge) {
    missionBadge.textContent = "COMPLETE";
    missionBadge.classList.add("mission-status-badge--complete");
  }

  // Append a "Mission Complete" banner at the bottom of the quiz panel
  const banner = document.createElement("div");
  banner.className = "mission-complete-banner";
  banner.innerHTML =
    `<span class="mission-complete-icon">🏆</span>` +
    `<div class="mission-complete-text">` +
    `  <span class="mission-complete-title">Mission Complete</span>` +
    `  <span class="mission-complete-sub">Well done, Agent. You identified a phishing attack.</span>` +
    `</div>`;
  quizPanel.appendChild(banner);

  // Print confirmation to the terminal
  printOutput("[ MISSION COMPLETE — Well done, Agent. ]", "info");
}


/* ============================================================
   STEP 11 — Run a command end-to-end
   ============================================================ */

function runCommand(command, buttonKey = "") {
  const trimmed = command.trim();
  if (!trimmed) return;
  printCommand(trimmed);
  processCommand(trimmed, buttonKey);
}


/* ============================================================
   STEP 12 — Keyboard input (optional)
   Note: typed commands don't trigger the unlock/quiz system.
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
if (clrButton) clrButton.addEventListener("click", clearTerminal);


/* ============================================================
   STEP 13 — Countdown timer
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
   STEP 14 — Boot
   ============================================================ */

function boot() {
  // Unlock the starting buttons
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // Auto-complete "Mission Started" step
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === null) completedSteps.add(step.id);
  });

  // Render initial state
  updatePromptDisplay();
  renderButtons();
  renderMissionStatus();

  // Start mission timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  initTerminalInput();
  if (terminalInput) terminalInput.focus();
}

document.addEventListener("DOMContentLoaded", boot);
