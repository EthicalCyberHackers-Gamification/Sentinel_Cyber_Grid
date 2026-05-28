/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform — Milestone 1: Clickable Command Functionality
 *
 * PURPOSE
 * -------
 * Students click command buttons and see realistic Linux terminal output.
 * They do NOT type commands — clicking is intentional to keep things beginner-friendly
 * and to prevent typos breaking the learning experience.
 *
 * HOW IT WORKS (plain English)
 * ----------------------------
 * 1. The student clicks a button (e.g. "List Files / ls").
 * 2. script.js reads the data-command attribute on that button (e.g. "ls").
 * 3. It looks up the current directory in the FILESYSTEM data (from missions.js).
 * 4. It appends the command + its output to the terminal panel.
 * 5. Some commands change state — e.g. "cd documents" moves the student into
 *    a new folder, which changes the prompt and what future commands show.
 *
 * FILES
 * -----
 *  missions.js — all data (filesystem layout, file contents, mission info)
 *  script.js   — all interaction logic (this file)
 *  index.html  — the HTML structure
 *  style.css   — the visual styling
 */

import { FILESYSTEM, getMissionById, activeMissionId } from "/missions.js";


/* ============================================================
   STEP 1 — Get references to the HTML elements we need.

   Instead of searching the page every time we need something,
   we look them up once at the start and save the references.
   ============================================================ */

const terminalOutput = document.getElementById("terminalOutput");  // scrolling log area
const terminalInput  = document.getElementById("terminalInput");   // text input at the bottom
const missionTimer   = document.getElementById("missionTimer");    // "30:00" countdown display
const commandButtons = document.querySelectorAll(".cmd-btn");       // all four command buttons
const promptLabel    = document.querySelector(".terminal-prompt-label"); // input row prompt text
const terminalTitle  = document.querySelector(".terminal-title");   // header bar prompt text


/* ============================================================
   STEP 2 — Directory state.

   The student starts in their home directory "~".
   When they click "cd documents", currentDir changes to "~/documents".
   All commands (pwd, ls, cat) check currentDir to decide what to show.
   ============================================================ */

let currentDir = "~";  // starts at home — changes when the student runs cd


/* ============================================================
   STEP 3 — Prompt helper.

   The Linux shell prompt shows where you are, like:
     student@cybercorp:~$
     student@cybercorp:~/documents$

   This function builds the right prompt string for the current directory.
   ============================================================ */

/**
 * Returns the shell prompt string for the current directory.
 * Example: "student@cybercorp:~/documents$"
 *
 * @returns {string}
 */
function getPrompt() {
  return `student@cybercorp:${currentDir}$`;
}

/**
 * Updates every place the prompt is displayed on the page
 * to match the current directory.
 * Called after any command that changes the directory (like cd).
 */
function updatePromptDisplay() {
  const prompt = getPrompt();

  // Update the prompt shown in the terminal header bar
  if (terminalTitle)  terminalTitle.textContent  = prompt;

  // Update the prompt shown next to the text input at the bottom
  if (promptLabel)    promptLabel.textContent     = prompt;
}


/* ============================================================
   STEP 4 — Terminal output helpers.

   These functions add new lines to the terminal panel.
   Each line is a <div> element appended to #terminalOutput.
   ============================================================ */

/**
 * Prints the command the student "ran", shown in green with the prompt.
 * This makes it look like a real shell session.
 *
 * Example output:
 *   student@cybercorp:~$ pwd
 *
 * @param {string} command - The command text to echo (e.g. "pwd")
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
 * Prints one line of output text below the command.
 * Uses a hidden spacer prompt so the text lines up with the command.
 *
 * @param {string} text   - The text to display
 * @param {string} [type] - Visual style: "default" | "warn" | "error" | "info"
 */
function printOutput(text, type = "default") {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";

  // Invisible spacer keeps output indented to align with command text
  line.innerHTML =
    `<span class="terminal-prompt" style="opacity:0;user-select:none;">$</span>` +
    `<span class="terminal-text terminal-text--${type}">${text}</span>`;

  terminalOutput.appendChild(line);
  scrollTerminal();
}

/**
 * Prints a blank spacer line to visually separate command blocks.
 */
function printBlankLine() {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = "&nbsp;";
  terminalOutput.appendChild(line);
  scrollTerminal();
}

/**
 * Scrolls the terminal to the bottom so the latest output is always visible.
 */
function scrollTerminal() {
  if (terminalOutput) {
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }
}

/**
 * Clears all lines from the terminal and shows a fresh system message.
 */
function clearTerminal() {
  terminalOutput.innerHTML = "";
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--system";
  line.innerHTML =
    `<span class="terminal-prompt">system</span>` +
    `<span class="terminal-text">Terminal cleared. Click a command button to continue.</span>`;
  terminalOutput.appendChild(line);
}


/* ============================================================
   STEP 5 — Command processor.

   This is the core of the simulated terminal.
   It receives a command string, looks at the current directory,
   and decides what output to show.

   Supported commands:
     pwd               — print working directory
     ls                — list files in current directory
     cd <folder>       — change into a subdirectory
     cat <filename>    — read and print a file
     clear             — clear the terminal screen
   ============================================================ */

/**
 * Processes one command string and appends the correct output to the terminal.
 * This is called every time a button is clicked (or Enter is pressed).
 *
 * @param {string} command - The full command string, e.g. "cat suspicious_file.txt"
 */
function processCommand(command) {
  const cmd     = command.trim().toLowerCase();
  const dirData = FILESYSTEM[currentDir];  // data for wherever the student currently is

  // --- pwd ---
  // Prints the full path of the current directory.
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    return;
  }

  // --- ls ---
  // Lists the files and folders in the current directory.
  if (cmd === "ls") {
    // Join the items with spaces to mimic a real `ls` one-liner output
    const listing = dirData.ls.join("  ");
    printOutput(listing);
    printBlankLine();
    return;
  }

  // --- cd <folder> ---
  // Moves into a subfolder if it exists in the current directory.
  if (cmd.startsWith("cd ")) {
    const target    = cmd.slice(3).trim();              // folder name after "cd "
    const newPath   = `${currentDir}/${target}`;        // e.g. "~/documents"
    const normalised = newPath.replace("~//", "~/");    // clean up any double slashes

    if (dirData.subdirs.includes(target) && FILESYSTEM[normalised]) {
      // Valid folder — move into it
      currentDir = normalised;
      updatePromptDisplay();
      // No output text for a successful cd (just like a real shell)
      printBlankLine();
    } else {
      // Folder doesn't exist here
      printOutput(`bash: cd: ${target}: No such file or directory`, "error");
      printBlankLine();
    }
    return;
  }

  // --- cat <filename> ---
  // Prints the contents of a file if it exists in the current directory.
  if (cmd.startsWith("cat ")) {
    const filename = command.trim().slice(4).trim();  // preserve original case for lookup
    const files    = dirData.files;

    if (files[filename]) {
      // File found — print each line of its contents
      files[filename].forEach((line) => {
        if (line === "") {
          printBlankLine();
        } else {
          const isWarning = line.startsWith("[!");
          printOutput(line, isWarning ? "warn" : "default");
        }
      });
    } else {
      // File not found in this directory
      printOutput(
        `cat: ${filename}: Access denied: file not found in current location.`,
        "error"
      );
    }
    printBlankLine();
    return;
  }

  // --- clear ---
  if (cmd === "clear") {
    clearTerminal();
    return;
  }

  // --- unknown command ---
  printOutput(
    `bash: ${cmd.split(" ")[0]}: command not found — click a button or type 'clear'`,
    "error"
  );
  printBlankLine();
}


/* ============================================================
   STEP 6 — Run a command end-to-end.

   This ties together the echo (showing what was typed) and
   the processor (showing the output).
   Called by both button clicks and keyboard Enter.
   ============================================================ */

/**
 * Echoes the command to the terminal, then processes and shows the output.
 *
 * @param {string} command - The raw command string
 */
function runCommand(command) {
  const trimmed = command.trim();
  if (!trimmed) return;  // ignore empty input

  printCommand(trimmed);   // show:  student@cybercorp:~$ ls
  processCommand(trimmed); // show:  documents  downloads  reports
}


/* ============================================================
   STEP 7 — Wire up the command buttons.

   Each <button class="cmd-btn"> in index.html has a
   data-command="..." attribute that holds the command to run.
   We listen for click events and pass that command to runCommand().
   ============================================================ */

function initCommandButtons() {
  commandButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      const command = button.dataset.command;
      if (!command) return;

      runCommand(command);

      // Clear the text input and keep focus there in case the
      // student also wants to type something
      if (terminalInput) {
        terminalInput.value = "";
        terminalInput.focus();
      }
    });
  });
}


/* ============================================================
   STEP 8 — Wire up the keyboard input (optional typing).

   Students can also type commands directly.
   Pressing Enter sends whatever is in the input box.
   ============================================================ */

function initTerminalInput() {
  if (!terminalInput) return;

  terminalInput.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      const typed = terminalInput.value;
      terminalInput.value = "";
      runCommand(typed);
    }
  });
}


/* ============================================================
   STEP 9 — Mission countdown timer.

   Counts down from the mission's time limit (in seconds).
   Updates the "30:00" display in the Mission Panel every second.
   ============================================================ */

let timerInterval = null;
let secondsLeft   = 0;

/**
 * Formats a total number of seconds as MM:SS.
 * Example: 90 → "01:30"
 *
 * @param {number} total
 * @returns {string}
 */
function formatTime(total) {
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Starts the countdown timer.
 *
 * @param {number} durationSeconds - How many seconds to count down from
 */
function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval);
  secondsLeft = durationSeconds;

  if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);

  timerInterval = setInterval(function () {
    secondsLeft -= 1;
    if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0) clearInterval(timerInterval);
  }, 1000);
}


/* ============================================================
   STEP 10 — Boot: run everything when the page loads.
   ============================================================ */

function boot() {
  // Ensure the prompt displays correctly for the starting directory
  updatePromptDisplay();

  // Load mission data and start the timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Connect buttons and keyboard input
  initCommandButtons();
  initTerminalInput();

  // Put cursor in the input box automatically
  if (terminalInput) terminalInput.focus();
}

// Wait for the HTML to finish loading, then run boot()
document.addEventListener("DOMContentLoaded", boot);
