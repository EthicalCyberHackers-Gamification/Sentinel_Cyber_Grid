/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform — Day 2: Basic Webpage Layout
 *
 * What this file does:
 *   1. Finds all the HTML elements we need (terminal, buttons, timer)
 *   2. Starts the mission countdown timer
 *   3. Lets the user type commands into the terminal input
 *   4. Wires up the command buttons so clicking them sends a command
 *   5. Shows a fake (simulated) response for each command
 *
 * Written to be easy to read and modify for beginners.
 * No backend, no login, no database — everything is local.
 */

import { getMissionById, activeMissionId } from "/missions.js";

/* ----------------------------------------------------------
   STEP 1: Get references to the HTML elements we will use.
   This is like pointing JavaScript at the right pieces of
   the page so we can read or change them later.
   ---------------------------------------------------------- */

const terminalOutput  = document.getElementById("terminalOutput");   // the scrolling log area
const terminalInput   = document.getElementById("terminalInput");    // the text box at the bottom
const missionTimer    = document.getElementById("missionTimer");     // the "30:00" countdown
const commandButtons  = document.querySelectorAll(".cmd-btn");       // all four command buttons

// The prompt text shown before every command line
const PROMPT = "student@cybercorp:~$";

/* ----------------------------------------------------------
   STEP 2: Define what each command "outputs" in the terminal.
   In a real app this would run an actual program. Here we
   just return a list of text lines to display.
   ---------------------------------------------------------- */

const COMMAND_RESPONSES = {

  // pwd — shows the current directory path
  "pwd": [
    "/home/student/documents",
  ],

  // ls — lists the files in the current directory
  "ls": [
    "documents/",
    "suspicious_file.txt",
    "notes.txt",
    "readme.md",
  ],

  // cd documents — moves into the documents folder
  "cd documents": [
    "Moved into: /home/student/documents",
  ],

  // cat suspicious_file.txt — prints the file contents
  "cat suspicious_file.txt": [
    "=== suspicious_file.txt ===",
    "Last modified: 2024-05-28 01:14:03",
    "Author: unknown",
    "",
    "DELETE ALL LOGS BEFORE MORNING SHIFT.",
    "UPLOAD COMPLETE. TARGET COMPROMISED.",
    "",
    "[!] WARNING: This file contains evidence of unauthorized access.",
  ],

  // clear — empties the terminal (handled separately below)
  "clear": [],

  // help — lists available commands for the student
  "help": [
    "Available commands (Day 2):",
    "  pwd                   — show your current folder path",
    "  ls                    — list files in the current folder",
    "  cd documents          — move into the documents folder",
    "  cat suspicious_file.txt — read a file and print its contents",
    "  clear                 — clear the terminal screen",
    "  help                  — show this help message",
  ],

};

/* ----------------------------------------------------------
   STEP 3: Helper functions — small reusable pieces of code.
   ---------------------------------------------------------- */

/**
 * Adds a single line of text to the terminal output area.
 *
 * @param {string} text  - The text to show
 * @param {string} type  - Visual style: "default" | "success" | "error" | "warn" | "info" | "system"
 */
function printLine(text, type = "default") {
  if (!terminalOutput) return;

  // Create a new row element
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";

  if (type === "system") {
    // System messages show "system" as the prompt in yellow
    line.classList.add("terminal-line--system");
    line.innerHTML = `
      <span class="terminal-prompt">system</span>
      <span class="terminal-text">${text}</span>
    `;
  } else {
    // Regular output — no prompt, just indented text
    line.innerHTML = `
      <span class="terminal-prompt" style="opacity:0; user-select:none;">$</span>
      <span class="terminal-text terminal-text--${type}">${text}</span>
    `;
  }

  terminalOutput.appendChild(line);

  // Auto-scroll to the bottom so the latest line is always visible
  terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/**
 * Shows the command the student typed (echoed in green),
 * then runs it through the command processor.
 *
 * @param {string} command - The command string to run
 */
function runCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return; // do nothing if the input was empty

  // Echo what the student typed, styled as a "success" (green) line
  const echoLine = document.createElement("div");
  echoLine.className = "terminal-line terminal-line--new";
  echoLine.innerHTML = `
    <span class="terminal-prompt">${PROMPT}</span>
    <span class="terminal-text terminal-text--success">${trimmed}</span>
  `;
  terminalOutput.appendChild(echoLine);
  terminalOutput.scrollTop = terminalOutput.scrollHeight;

  // Now process the command and show its output
  processCommand(trimmed);
}

/**
 * Looks up the command in COMMAND_RESPONSES and prints each output line.
 * If the command isn't recognised, shows an error message.
 *
 * @param {string} command - The exact command string to look up
 */
function processCommand(command) {
  const lower = command.toLowerCase();

  // Special case: "clear" wipes the terminal
  if (lower === "clear") {
    terminalOutput.innerHTML = "";
    printLine("Terminal cleared. Type 'help' to see available commands.", "system");
    return;
  }

  // Check if this command has a known response
  if (COMMAND_RESPONSES[lower] !== undefined) {
    const lines = COMMAND_RESPONSES[lower];

    // Print each output line with a tiny staggered delay so it feels like
    // a real terminal is responding (40ms between lines)
    lines.forEach((line, index) => {
      setTimeout(() => {
        const isWarning = line.startsWith("[!");  // highlight danger lines
        const isEmpty   = line === "";            // preserve blank lines

        if (isEmpty) {
          printLine(" "); // spacer
        } else {
          printLine(line, isWarning ? "warn" : "default");
        }
      }, index * 40);
    });

  } else {
    // Unknown command — show a friendly error
    printLine(
      `bash: ${lower.split(" ")[0]}: command not found — type 'help' for a list of commands`,
      "error"
    );
  }
}

/**
 * Formats a number of seconds as MM:SS (e.g. 1800 → "30:00").
 *
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

/* ----------------------------------------------------------
   STEP 4: Mission countdown timer.
   Ticks down every second and updates the timer display.
   ---------------------------------------------------------- */

let timerInterval = null;
let secondsLeft   = 0;

/**
 * Starts a countdown timer from durationSeconds down to 0.
 *
 * @param {number} durationSeconds
 */
function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval); // stop any old timer first
  secondsLeft = durationSeconds;

  if (missionTimer) {
    missionTimer.textContent = formatTime(secondsLeft);
  }

  timerInterval = setInterval(() => {
    secondsLeft -= 1;

    if (missionTimer) {
      missionTimer.textContent = formatTime(secondsLeft);
    }

    // Stop when time runs out (mission-failed logic goes here later)
    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
    }
  }, 1000);
}

/* ----------------------------------------------------------
   STEP 5: Wire up the keyboard input.
   When the student presses Enter, grab what they typed and
   send it as a command.
   ---------------------------------------------------------- */

function initTerminalInput() {
  if (!terminalInput) return;

  terminalInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      const typed = terminalInput.value;  // grab what was typed
      terminalInput.value = "";           // clear the input box
      runCommand(typed);                  // send it to the terminal
    }
  });
}

/* ----------------------------------------------------------
   STEP 6: Wire up the command buttons.
   Each button has a data-command attribute that holds the
   command text. Clicking the button runs that command.
   ---------------------------------------------------------- */

function initCommandButtons() {
  commandButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const command = button.dataset.command; // read the command from the button
      if (!command) return;

      runCommand(command);              // run it in the terminal
      terminalInput.value = "";        // clear the input box
      terminalInput.focus();           // move focus back to the input
    });
  });
}

/* ----------------------------------------------------------
   STEP 7: Boot — runs everything when the page first loads.
   ---------------------------------------------------------- */

function boot() {
  // Load the active mission so we can read its time limit
  const mission = getMissionById(activeMissionId);

  // Start the countdown timer
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Connect the keyboard input and command buttons
  initTerminalInput();
  initCommandButtons();

  // Put the cursor in the terminal input right away
  if (terminalInput) {
    terminalInput.focus();
  }
}

// Wait for the HTML to fully load, then run boot()
document.addEventListener("DOMContentLoaded", boot);
