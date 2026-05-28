/**
 * missions.js
 * -----------
 * Ethical CyberHackers Platform — Data Module
 *
 * This file stores ALL the content the platform uses:
 *   - FILESYSTEM    : the fake Linux filesystem students explore
 *   - COMMAND_BUTTONS: every button the student can click, with unlock rules
 *   - MISSION_STEPS : the 4-stage progress tracker shown in the Mission Panel
 *   - MISSIONS      : mission metadata (title, description, XP reward, etc.)
 *
 * NO logic lives here — only data.
 * All interaction logic lives in script.js.
 *
 * HOW TO EXTEND:
 *   Add a new folder   → add a key to FILESYSTEM
 *   Add a new file     → add it inside a folder's `files` object
 *   Add a new button   → add an entry to COMMAND_BUTTONS
 *   Add a new step     → add an entry to MISSION_STEPS
 */


/* ============================================================
   FILESYSTEM
   Simulates the Linux file system the student navigates.

   Each key = a directory path  (e.g. "~" or "~/documents")
   Each directory has:
     pwd     : what the `pwd` command prints
     ls      : items shown by the `ls` command
     files   : files that `cat` can read (filename → array of lines)
     subdirs : folder names the student can move into with `cd`
   ============================================================ */

export const FILESYSTEM = {

  /* ---- Home directory ---- */
  "~": {
    pwd: "/home/student",
    ls: ["documents", "downloads", "reports"],
    files: {},
    subdirs: ["documents", "downloads", "reports"],
  },

  /* ---- Documents folder ---- */
  "~/documents": {
    pwd: "/home/student/documents",
    ls: ["employee_notes.txt", "suspicious_file.txt"],

    files: {
      // A normal-looking internal note
      "employee_notes.txt": [
        "=== employee_notes.txt ===",
        "",
        "Reminder: Always report suspicious files to your",
        "cybersecurity manager.",
        "",
        "Do NOT open attachments from unknown senders.",
        "Do NOT share your password with anyone.",
      ],

      // A social-engineering / phishing message — the evidence
      "suspicious_file.txt": [
        "=== suspicious_file.txt ===",
        "",
        "Urgent: Send your password to",
        "external-support@unknownmail.com",
        "to avoid account suspension.",
        "",
        "[!] WARNING: This is a social engineering attack.",
        "[!] Real IT departments NEVER ask for your password.",
      ],

      // Extra file for future missions
      "evidence.log": [
        "=== evidence.log ===",
        "2024-05-28 01:09:44  LOGIN   root  from 10.0.0.99",
        "2024-05-28 01:12:01  EXEC    /tmp/.backdoor.sh",
        "2024-05-28 01:13:55  COPY    /etc/passwd → 10.0.0.99",
        "2024-05-28 01:14:03  WRITE   suspicious_file.txt",
        "2024-05-28 01:15:40  LOGOUT  root",
      ],
    },

    subdirs: [],
  },

  /* ---- Downloads folder ---- */
  "~/downloads": {
    pwd: "/home/student/downloads",
    ls: ["readme.txt"],
    files: {
      "readme.txt": ["Nothing to see here yet."],
    },
    subdirs: [],
  },

  /* ---- Reports folder ---- */
  "~/reports": {
    pwd: "/home/student/reports",
    ls: ["(empty)"],
    files: {},
    subdirs: [],
  },
};


/* ============================================================
   COMMAND_BUTTONS
   Defines every button the student can click.

   Fields:
     key             : unique identifier (used by the unlock system)
     label           : button title shown to the student
     command         : the actual command string sent to the terminal
     icon            : emoji shown on the button
     desc            : plain-English explanation under the button
     style           : visual colour — "basic" (cyan) or "investigate" (green)
     unlockedAtStart : true = visible immediately; false = hidden until unlocked
     unlocksAfterRun : array of button keys to reveal when THIS button is clicked
   ============================================================ */

export const COMMAND_BUTTONS = [

  /* --- Always visible from the start --- */
  {
    key:             "pwd",
    label:           "Where am I?",
    command:         "pwd",
    icon:            "📍",
    desc:            "Print your current folder path",
    style:           "basic",
    unlockedAtStart: true,
    unlocksAfterRun: [],
  },
  {
    key:             "ls-home",
    label:           "List Files",
    command:         "ls",
    icon:            "📂",
    desc:            "Show what's in this folder",
    style:           "basic",
    unlockedAtStart: true,
    // Clicking ls reveals the cd button so the student knows where to go next
    unlocksAfterRun: ["cd-documents"],
  },

  /* --- Unlocked after ls-home is clicked --- */
  {
    key:             "cd-documents",
    label:           "Open Documents",
    command:         "cd documents",
    icon:            "📁",
    desc:            "Navigate into the documents folder",
    style:           "basic",
    unlockedAtStart: false,
    // Once inside documents, reveal the three investigation commands
    unlocksAfterRun: ["ls-documents", "cat-employee-notes", "cat-suspicious"],
  },

  /* --- Unlocked after cd-documents is clicked --- */
  {
    key:             "ls-documents",
    label:           "List Documents",
    command:         "ls",
    icon:            "📂",
    desc:            "See the files inside documents/",
    style:           "basic",
    unlockedAtStart: false,
    unlocksAfterRun: [],
  },
  {
    key:             "cat-employee-notes",
    label:           "Read Employee Notes",
    command:         "cat employee_notes.txt",
    icon:            "📄",
    desc:            "Read employee_notes.txt",
    style:           "basic",
    unlockedAtStart: false,
    unlocksAfterRun: [],
  },
  {
    key:             "cat-suspicious",
    label:           "Read Suspicious File",
    command:         "cat suspicious_file.txt",
    icon:            "🔍",
    desc:            "Read suspicious_file.txt",
    style:           "investigate",
    unlockedAtStart: false,
    unlocksAfterRun: [],
  },
];


/* ============================================================
   MISSION_STEPS
   The 4-stage progress tracker shown in the Mission Panel.

   Fields:
     id          : unique identifier
     label       : text shown in the tracker
     icon        : emoji shown next to the label
     triggeredBy : button key that marks this step complete
                   (null = complete immediately on page load)
   ============================================================ */

export const MISSION_STEPS = [
  {
    id:          "step-start",
    label:       "Mission Started",
    icon:        "🚀",
    triggeredBy: null,          // completes automatically on boot
  },
  {
    id:          "step-ls",
    label:       "Workstation Checked",
    icon:        "🔎",
    triggeredBy: "ls-home",     // completes when student clicks "List Files"
  },
  {
    id:          "step-cd",
    label:       "Documents Folder Opened",
    icon:        "📁",
    triggeredBy: "cd-documents",
  },
  {
    id:          "step-cat",
    label:       "Suspicious File Found",
    icon:        "⚠️",
    triggeredBy: "cat-suspicious",
  },
];


/* ============================================================
   MISSIONS  (metadata only — objectives now come from MISSION_STEPS)
   ============================================================ */

export const MISSIONS = [
  {
    id:           "mission-001",
    title:        "Investigate suspicious workstation",
    description:
      "A workstation on the internal network has been flagged for anomalous activity. " +
      "Your task is to gather digital evidence, identify the threat actor's footprint, " +
      "and report your findings — without being detected.",
    difficulty:   "beginner",
    xpReward:     250,
    timeLimitSec: 1800,
    tags:         ["linux-basics", "forensics", "social-engineering"],
  },
  {
    id:           "mission-002",
    title:        "Break into the honeypot",
    description:
      "Security researchers have set up a honeypot to lure attackers. " +
      "Identify weaknesses, document the attack surface, and practice responsible disclosure.",
    difficulty:   "beginner",
    xpReward:     300,
    timeLimitSec: 2400,
    tags:         ["web", "enumeration", "ctf"],
  },
];

/** ID of the currently active mission. */
export let activeMissionId = "mission-001";

/**
 * Returns the Mission object for the given ID, or undefined if not found.
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getMissionById(id) {
  return MISSIONS.find((m) => m.id === id);
}
