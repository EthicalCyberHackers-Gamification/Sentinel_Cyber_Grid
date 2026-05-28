/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform — main application logic.
 *
 * Responsibilities (stubbed for future implementation):
 *  - Boot the UI
 *  - Wire up the terminal input & command buttons
 *  - Handle mission timer countdown
 *  - Manage XP / rank progression
 *
 * NOTE: No actual network requests are made. All data is local/simulated.
 */

import { MISSIONS, getMissionById, activeMissionId } from "/missions.js";

/* ============================================================
   MODULE: Selectors
   Cache all DOM references in one place so the rest of the
   code never calls querySelector more than once per element.
   ============================================================ */
const DOM = {
  terminalOutput: document.getElementById("terminalOutput"),
  terminalInput:  document.getElementById("terminalInput"),
  missionTimer:   document.getElementById("missionTimer"),
  missionTitle:   document.getElementById("missionTitle"),
  currentXP:      document.getElementById("currentXP"),
  xpBar:          document.getElementById("xpBar"),
  rankName:       document.getElementById("rankName"),
  agentName:      document.getElementById("agentName"),
  commandButtons: document.querySelectorAll(".cmd-btn"),
};

/* ============================================================
   MODULE: Agent State
   A simple state object. In a real app this would be
   persisted to localStorage or a backend.
   ============================================================ */
const agentState = {
  name:         "GHOST_ZERO",
  currentXP:    750,
  maxXP:        1000,
  rank:         "Script Kiddie",
  rankIndex:    0,
  streak:       5,
  missions:     3,
  accuracy:     87,
};

/* ============================================================
   MODULE: Rank Table
   Define XP thresholds and rank names.
   ============================================================ */
const RANKS = [
  { name: "Script Kiddie",    minXP: 0    },
  { name: "Packet Sniffer",   minXP: 1000 },
  { name: "Recon Operative",  minXP: 2500 },
  { name: "Exploit Dev",      minXP: 5000 },
  { name: "Zero Day Hunter",  minXP: 10000 },
  { name: "Ghost Operator",   minXP: 20000 },
];

/* ============================================================
   MODULE: Mission Timer
   Counts down from the mission's time limit.
   To be wired up once missions are fully playable.
   ============================================================ */
let timerInterval = null;
let secondsLeft   = 0;

/**
 * Formats a number of seconds into MM:SS string.
 * @param {number} totalSeconds
 * @returns {string}
 */
function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

/**
 * Starts the countdown timer for the active mission.
 * @param {number} durationSeconds
 */
function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval);
  secondsLeft = durationSeconds;

  if (DOM.missionTimer) {
    DOM.missionTimer.textContent = formatTime(secondsLeft);
  }

  timerInterval = setInterval(() => {
    secondsLeft -= 1;

    if (DOM.missionTimer) {
      DOM.missionTimer.textContent = formatTime(secondsLeft);
    }

    if (secondsLeft <= 0) {
      clearInterval(timerInterval);
      // TODO: trigger mission-failed state
    }
  }, 1000);
}

/* ============================================================
   MODULE: Terminal
   Append lines to the fake terminal output.
   ============================================================ */

/**
 * Appends a new line to the terminal output panel.
 *
 * @param {string} text       - Text content of the line
 * @param {'default'|'success'|'error'|'info'|'warn'|'system'|'separator'} type
 * @param {string} [prompt]   - Override the prompt text (default: "root@cyberhackers:~#")
 */
function terminalWrite(text, type = "default", prompt = "root@cyberhackers:~#") {
  if (!DOM.terminalOutput) return;

  const line = document.createElement("div");
  line.className = `terminal-line terminal-line--new${type === "system" ? " terminal-line--system" : ""}`;

  if (type === "separator") {
    line.classList.add("terminal-line--separator");
    line.innerHTML = `<span>${text}</span>`;
  } else {
    const promptSpan = document.createElement("span");
    promptSpan.className = "terminal-prompt";
    promptSpan.textContent = type === "system" ? "system" : prompt;

    const textSpan = document.createElement("span");
    textSpan.className = `terminal-text${type !== "default" ? ` terminal-text--${type}` : ""}`;
    textSpan.textContent = text;

    line.appendChild(promptSpan);
    line.appendChild(textSpan);
  }

  DOM.terminalOutput.appendChild(line);
  DOM.terminalOutput.scrollTop = DOM.terminalOutput.scrollHeight;
}

/**
 * Echoes a user-typed command to the terminal in green, then processes it.
 * @param {string} command
 */
function terminalEcho(command) {
  if (!command.trim()) return;
  terminalWrite(command, "success");
  processCommand(command.trim());
}

/* ============================================================
   MODULE: Command Processor
   Handles fake command responses in the terminal.
   Replace these stubs with real mission logic later.
   ============================================================ */

/**
 * A map of command prefixes to their stub responses.
 * Key: string to match at the start of the command
 * Value: array of lines to output (or a function returning lines)
 */
const COMMAND_RESPONSES = {
  "nmap": [
    "Starting Nmap 7.94 ( https://nmap.org )",
    "Nmap scan report for 192.168.1.1",
    "PORT     STATE  SERVICE    VERSION",
    "22/tcp   open   ssh        OpenSSH 8.9",
    "80/tcp   open   http       Apache 2.4.52",
    "3306/tcp open   mysql      MySQL 8.0",
    "Nmap done: 1 IP address (1 host up) scanned in 2.43 seconds",
  ],
  "ping": [
    "PING 192.168.1.1 (192.168.1.1): 56 data bytes",
    "64 bytes from 192.168.1.1: icmp_seq=0 ttl=64 time=0.812 ms",
    "64 bytes from 192.168.1.1: icmp_seq=1 ttl=64 time=0.754 ms",
    "64 bytes from 192.168.1.1: icmp_seq=2 ttl=64 time=0.801 ms",
    "--- 192.168.1.1 ping statistics ---",
    "3 packets transmitted, 3 received, 0% packet loss",
  ],
  "whois": [
    "Domain Name: TARGET-WORKSTATION",
    "Registrar: INTERNAL-NETWORK",
    "IP Address: 192.168.1.1",
    "Status: ACTIVE",
    "Assigned to: Engineering Dept.",
  ],
  "ps aux": [
    "USER         PID %CPU %MEM COMMAND",
    "root           1  0.0  0.1 /sbin/init",
    "root         512  0.1  0.3 /usr/sbin/sshd",
    "www-data     823  0.4  1.2 /usr/sbin/apache2",
    "mysql        901  1.2  4.8 /usr/sbin/mysqld",
    "[!] Suspicious process detected: /tmp/.hidden_proc (PID 1337)",
  ],
  "netstat": [
    "Active Internet connections (servers and established)",
    "Proto Recv-Q Send-Q Local Address     Foreign Address   State",
    "tcp        0      0 0.0.0.0:22        0.0.0.0:*         LISTEN",
    "tcp        0      0 0.0.0.0:80        0.0.0.0:*         LISTEN",
    "tcp        0      0 127.0.0.1:3306    0.0.0.0:*         LISTEN",
    "tcp        0      0 192.168.1.1:22    10.0.0.99:54321   ESTABLISHED",
  ],
  "ls": [
    "total 48",
    "drwxr-xr-x  8 root root 4096 May 28 09:14 .",
    "-rw-r--r--  1 root root 1200 May 26 13:00 auth.log",
    "-rw-r--r--  1 root root 8432 May 28 09:00 syslog",
    "-rw-------  1 root root  512 May 27 22:01 .hidden_notes.txt",
  ],
  "cat": [
    "[Reading file...]",
    "May 28 01:14:03 sshd[1337]: Failed password for root from 10.0.0.99 port 54321",
    "May 28 01:14:11 sshd[1337]: Accepted password for root from 10.0.0.99 port 54321",
    "May 28 01:15:40 sshd[1337]: session opened for user root",
    "[!] Unauthorized login detected from 10.0.0.99",
  ],
  "find": [
    "Searching filesystem...",
    "/home/user/notes.txt",
    "/tmp/flag.txt",
    "/var/www/html/config.txt",
    "[!] Suspicious file found: /tmp/.backdoor.sh",
  ],
  "strings": [
    "Extracting printable strings...",
    "ELF binary detected",
    "/lib/x86_64-linux-gnu/libc.so.6",
    "connect back to 10.0.0.99:4444",
    "[!] Reverse shell payload detected in binary!",
  ],
  "help": [
    "Available commands:",
    "  nmap       — Port and service scanner",
    "  ping       — Test host reachability",
    "  whois      — WHOIS lookup",
    "  ps aux     — List all running processes",
    "  netstat    — Show network connections",
    "  ls         — List directory contents",
    "  cat        — Read file contents",
    "  find       — Search filesystem for files",
    "  strings    — Extract strings from binary",
    "  clear      — Clear the terminal",
    "  help       — Show this help message",
  ],
  "clear": [], // handled separately
};

/**
 * Processes a command string, outputs a stub response to the terminal.
 * @param {string} command - The raw command string entered by the user
 */
function processCommand(command) {
  const lower = command.toLowerCase();

  // Handle clear
  if (lower === "clear" || lower === "cls") {
    clearTerminal();
    return;
  }

  // Find matching response
  let matched = false;
  for (const [prefix, lines] of Object.entries(COMMAND_RESPONSES)) {
    if (lower.startsWith(prefix)) {
      matched = true;

      if (lines.length === 0) break;

      // Output lines with a small delay to feel more real
      lines.forEach((line, index) => {
        setTimeout(() => {
          const isWarning = line.startsWith("[!");
          const isHeader  = line.startsWith("PORT") || line.startsWith("Proto") || line.startsWith("USER") || line.startsWith("Active");
          terminalWrite(
            line,
            isWarning ? "warn" : isHeader ? "info" : "default",
            " "
          );
        }, index * 40);
      });

      break;
    }
  }

  if (!matched) {
    terminalWrite(
      `bash: ${command.split(" ")[0]}: command not found. Type 'help' for available commands.`,
      "error",
      " "
    );
  }
}

/**
 * Clears all lines from the terminal output area and adds a fresh prompt.
 */
function clearTerminal() {
  if (!DOM.terminalOutput) return;
  DOM.terminalOutput.innerHTML = "";
  terminalWrite("Terminal cleared. Type 'help' for available commands.", "info", "system");
}

/* ============================================================
   MODULE: Event Listeners
   ============================================================ */

/** Wire up the terminal text input */
function initTerminalInput() {
  if (!DOM.terminalInput) return;

  DOM.terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const value = DOM.terminalInput.value;
      DOM.terminalInput.value = "";
      terminalEcho(value);
    }
  });
}

/** Wire up all command buttons to send their command to the terminal */
function initCommandButtons() {
  DOM.commandButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const command = btn.dataset.command;
      if (!command) return;

      if (DOM.terminalInput) {
        DOM.terminalInput.value = command;
      }
      terminalEcho(command);

      if (DOM.terminalInput) {
        DOM.terminalInput.value = "";
        DOM.terminalInput.focus();
      }
    });
  });
}

/* ============================================================
   MODULE: Boot Sequence
   Runs once when the page loads.
   ============================================================ */

/**
 * Initializes the entire UI from the current agent state and active mission.
 */
function boot() {
  const mission = getMissionById(activeMissionId);

  // Set agent name in header
  if (DOM.agentName) {
    DOM.agentName.textContent = agentState.name;
  }

  // Start mission timer
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Wire up interactivity
  initTerminalInput();
  initCommandButtons();

  // Focus the terminal input on load
  if (DOM.terminalInput) {
    DOM.terminalInput.focus();
  }
}

// Run when DOM is ready
document.addEventListener("DOMContentLoaded", boot);
