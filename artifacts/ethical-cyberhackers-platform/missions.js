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

/* ============================================================
   QUIZ
   Shown after the student reads suspicious_file.txt.
   The student must answer correctly to earn XP and complete
   the mission — turning clicking into actual learning.

   Fields per answer:
     id      : letter shown on the button (A / B / C / D)
     text    : the answer text
     correct : true for the one right answer, false for the rest
   ============================================================ */

export const QUIZ = {
  question:
    "What makes suspicious_file.txt dangerous?",

  answers: [
    {
      id: "A",
      text: "It is stored in the documents folder.",
      correct: false,
    },
    {
      id: "B",
      text: "It asks the user to send a password to an unknown external email.",
      correct: true,
    },
    {
      id: "C",
      text: "It has a short filename.",
      correct: false,
    },
    {
      id: "D",
      text: "It mentions account suspension.",
      correct: false,
    },
  ],

  // Feedback shown after the student picks an answer
  correctFeedback:   "Correct. This is a phishing attempt.",
  incorrectFeedback: "Not correct. Review the suspicious file again.",

  // Reward for the correct answer
  xpReward: 100,
  newRank:  "Cyber Intern Level 1",
};


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

/**
 * Reassigns the active mission id. Lets script.js switch missions through
 * the engine (`loadMission`) without mutating the imported binding directly
 * (ES module imports are read-only from the importer's side).
 * @param {string} id
 */
export function setActiveMissionId(id) {
  activeMissionId = id;
}


/* ============================================================
   MISSION ENGINE — STRUCTURED MISSION DATA  (Milestone 23A)
   ------------------------------------------------------------
   This mission engine allows future missions to be added by
   creating mission data objects instead of hardcoding each
   mission. Each MISSION_<n> object below is a complete, declarative
   description of one mission: its briefing, commands, hints,
   manager messages, quiz, reflection, XP reward, and scorecard.

   The engine functions in script.js (loadMission, renderMissionBriefing,
   handleCommandClick, showQuiz, showScorecard, resetMission, ...) read
   from these objects and from the MISSIONS_REGISTRY map at the bottom
   of this file. Adding Mission 3 should be a matter of:

     1. Adding a MISSION_3 object below.
     2. Registering it in MISSIONS_REGISTRY.
     3. Wiring it up in the dispatcher branches in script.js.

   IMPORTANT — Phase A (23A) is a CONSERVATIVE refactor. The existing
   per-mission implementations (M1 and M2) remain in script.js and stay
   the source of truth for behavior. These data objects either point
   directly at the legacy data (COMMAND_BUTTONS, MISSION_STEPS, QUIZ,
   FINDING, REFLECTION, M2_*) or capture metadata. Nothing here is meant
   to replace existing behavior in Phase A — only to make the shape of
   each mission visible and reusable.
   ============================================================ */

/* ---------- Mission 1 — New Cybersecurity Intern ---------- */
export const MISSION_1 = {
  missionId:        "mission-001",
  title:            "New Cybersecurity Intern",
  roleContext:      "You are a brand new analyst joining the CyberCorp blue team. Your manager has asked you to inspect a workstation flagged for suspicious activity.",
  briefing:         "A workstation on the internal network has been flagged for anomalous activity. Use basic Linux-style investigation commands to inspect the user's files, identify the threat, and report your finding.",
  learningObjective:"Practice basic Linux navigation and file inspection to identify a phishing/social-engineering attempt.",
  skillsPracticed: [
    "Basic Linux navigation",
    "Reading terminal output",
    "Inspecting files",
    "Identifying suspicious messages",
    "Reporting cybersecurity findings",
  ],

  startingStatus:   "Mission Started",

  // Legacy data sources — the engine wraps these (no duplication).
  commands:           COMMAND_BUTTONS,
  commandUnlockRules: COMMAND_BUTTONS.map((b) => ({
    key:             b.key,
    unlockedAtStart: b.unlockedAtStart,
    unlocksAfterRun: b.unlocksAfterRun,
  })),

  // Hint / manager message dictionaries are defined in script.js
  // (HINTS, MANAGER_MESSAGES). The engine reads them through accessors
  // so we don't duplicate the content here.
  hints:           "__from_script:HINTS",
  managerMessages: "__from_script:MANAGER_MESSAGES",

  findingQuestion: "__from_script:FINDING",
  quiz:            QUIZ,
  reflection:      "__from_script:REFLECTION",

  xpReward: QUIZ.xpReward,
  newRank:  QUIZ.newRank,

  scorecard: {
    missionLabel:     "New Cybersecurity Intern",
    threatIdentified: "Phishing attempt involving password theft",
    whatYouLearned:   "You learned how cybersecurity analysts use simple command-line investigation steps to inspect files, identify suspicious behavior, and report a possible phishing attempt.",
    certSkills: [
      "Basic Linux-style investigation",
      "File inspection",
      "Phishing recognition",
      "Cybersecurity reporting",
    ],
  },

  nextMissionPreview: {
    title:       "Network Basics",
    description: "Learn how analysts identify devices and services on a network.",
  },
};


/* ---------- Mission 2 — Network Basics ---------- */
// Mission 2's runtime data (commands, hints, manager messages, analyst
// review, quiz, scorecard) live in script.js as M2_* constants because
// they're tightly coupled to the M2 dashboard renderer. The data object
// below describes the mission's *shape* — the engine consults it for
// metadata and for the scorecard / next mission preview content.
export const MISSION_2 = {
  missionId:        "mission-002",
  title:            "Network Basics",
  roleContext:      "You are now a Cyber Intern reviewing a network reconnaissance exercise. Your manager wants you to identify your own host, confirm reachability, scan for open services, and assess the attack surface.",
  briefing:         "Run a short series of network commands against a target host. Identify the open services, then complete an analyst review and a final assessment to confirm your understanding.",
  learningObjective:"Practice basic network reconnaissance and reason about open services as an attack surface.",
  skillsPracticed: [
    "Identifying local IP address",
    "Checking host reachability",
    "Reading scan-style output",
    "Recognizing open services",
    "Understanding attack surface",
  ],

  startingStatus:   "Mission 2 Started",

  // Engine consults M2_COMMANDS / M2_STATUS / M2_ANALYST_REVIEW / M2_QUIZ
  // / M2_SCORECARD live from script.js (kept there to avoid breaking the
  // existing dashboard renderer in Phase A).
  commands:           "__from_script:M2_COMMANDS",
  commandUnlockRules: "__from_script:M2_COMMANDS",
  hints:              "__from_script:M2_HINTS",
  managerMessages:    "__from_script:M2_MANAGER_MESSAGES",
  findingQuestion:    "__from_script:M2_ANALYST_REVIEW",
  quiz:               "__from_script:M2_QUIZ",
  reflection:         null,                     // M2 has no reflection step

  xpReward: 100,
  newRank:  "Cyber Intern Level 2",

  scorecard: "__from_script:M2_SCORECARD",

  nextMissionPreview: {
    title:       "Reconnaissance & Discovery",
    description: "Go deeper into how analysts gather information about a target before any active scanning.",
  },
};


/* ---------- Registry — single lookup table the engine reads ---------- */
export const MISSIONS_REGISTRY = {
  "mission-001": MISSION_1,
  "mission-002": MISSION_2,
};

/** Returns the structured mission object for the given id (or undefined). */
export function getMissionData(id) {
  return MISSIONS_REGISTRY[id];
}
