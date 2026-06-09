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
    ls: [
      "employee_notes.txt",
      "meeting_schedule.txt",
      "finance_update.txt",
      "security_policy.txt",
      "suspicious_file.txt",
    ],

    files: {
      // Supporting evidence — a reporting-behavior reminder (Helpful)
      "employee_notes.txt": [
        "=== employee_notes.txt ===",
        "",
        "Reminder: Report suspicious files to your cybersecurity",
        "manager. Never assume without evidence.",
      ],

      // False lead — "Urgent" wording, but only a normal meeting note (Normal)
      "meeting_schedule.txt": [
        "=== meeting_schedule.txt ===",
        "",
        "Urgent: Finance team meeting moved to 3:00 PM.",
        "Bring updated budget notes.",
      ],

      // False lead — finance-sensitive, but no credential/external request (Normal)
      "finance_update.txt": [
        "=== finance_update.txt ===",
        "",
        "Finance review file updated. No password or external",
        "login request included.",
      ],

      // Supporting evidence — company password policy (Helpful)
      "security_policy.txt": [
        "=== security_policy.txt ===",
        "",
        "Company policy: Passwords must never be shared through",
        "email, chat, or external links.",
      ],

      // The threat — a phishing / social-engineering message (Critical)
      "suspicious_file.txt": [
        "=== suspicious_file.txt ===",
        "",
        "Urgent: Send your password to",
        "external-support@unknownmail.com",
        "to avoid account suspension.",
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
    // Guided one-clue-at-a-time flow: entering documents reveals ONLY the
    // "List Documents" command — no file cards yet. The student must run ls
    // to surface the first file, then files reveal one at a time as each is
    // opened and classified (see revealNextM1File in script.js).
    unlocksAfterRun: ["ls-documents"],
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
    // Listing the documents folder reveals ONLY the first file card. Each
    // subsequent file is revealed after the current one is classified/skipped.
    unlocksAfterRun: ["cat-employee-notes"],
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
    key:             "cat-meeting-schedule",
    label:           "Read Meeting Schedule",
    command:         "cat meeting_schedule.txt",
    icon:            "🗓️",
    desc:            "Read meeting_schedule.txt",
    style:           "basic",
    unlockedAtStart: false,
    unlocksAfterRun: [],
  },
  {
    key:             "cat-finance-update",
    label:           "Read Finance Update",
    command:         "cat finance_update.txt",
    icon:            "💵",
    desc:            "Read finance_update.txt",
    style:           "basic",
    unlockedAtStart: false,
    unlocksAfterRun: [],
  },
  {
    key:             "cat-security-policy",
    label:           "Read Security Policy",
    command:         "cat security_policy.txt",
    icon:            "📘",
    desc:            "Read security_policy.txt",
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
 *
 * Milestone 23E — also resolves Mission Registry ids (e.g. "mission1",
 * "mission2", "mission3") so callers that only have a registry id can
 * still ask for the mission record. Legacy ids ("mission-001") are
 * checked first to preserve existing behavior.
 *
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getMissionById(id) {
  const legacy = MISSIONS.find((m) => m.id === id);
  if (legacy) return legacy;
  return getRegistryMission(id);
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
  // Structured unlock rules — mirrors the shape used by MISSION_1 so
  // Phase B can consume both missions through one resolver contract.
  // Source of truth still lives in script.js's M2_COMMANDS (the engine
  // reads `unlocks` from there at runtime). This array is the declarative
  // mirror used for inspection and for future table-driven dispatch.
  commandUnlockRules: [
    { key: "ip-addr", unlockedAtStart: true,  unlocksAfterRun: []         },
    { key: "ping",    unlockedAtStart: true,  unlocksAfterRun: ["nmap"]   },
    { key: "nmap",    unlockedAtStart: false, unlocksAfterRun: ["review"] },
    { key: "review",  unlockedAtStart: false, unlocksAfterRun: []         },
  ],
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


/* ============================================================
   MISSION TEMPLATE  (Milestone 23C — Phase A)
   ------------------------------------------------------------
   The mission template protects the platform from breaking when
   new missions are added. It is the canonical shape every mission
   object should follow. Use it two ways:

     1. As DOCUMENTATION — copy MISSION_TEMPLATE, fill in your
        mission-specific values, and you have a Mission 3 / 4 / N
        starting point that is structurally compatible with the
        engine in script.js.

     2. As a SAFETY NET — pass any partial mission object through
        createMissionFromTemplate(custom) to merge it on top of
        the defaults. Missing fields fall back to safe blanks
        instead of becoming `undefined` and crashing the engine.

   Pair with validateMissionData(mission) before registering a new
   mission so missing REQUIRED fields are surfaced as console
   warnings (never shown to students).
   ============================================================ */

/**
 * MISSION_TEMPLATE — the canonical shape of a Mission data object.
 * Every field is annotated. Copy this object and fill in real values
 * to author a new mission; or pass a partial object through
 * createMissionFromTemplate() to fill the gaps automatically.
 *
 * Required fields (enforced by validateMissionData):
 *   missionId, title, briefing, commands, xpReward
 *
 * Recommended fields (engine reads them when present):
 *   roleContext, learningObjective, skillsPracticed, startingStatus,
 *   commandUnlockRules, hints, managerMessages, findingQuestion,
 *   quiz, reflection, scorecard, nextMissionPreview
 */
export const MISSION_TEMPLATE = {
  /* ---- IDENTITY ---- */

  /** Stable unique id used by loadMission() and the registry. e.g. "mission-003" */
  missionId:          "",

  /** Human-readable mission name shown in headings and the course card. */
  title:              "",


  /* ---- STORY / FRAMING ---- */

  /** One-sentence in-world role the student is playing this mission. */
  roleContext:        "",

  /** 1–3 sentence mission briefing shown on the overview screen. */
  briefing:           "",

  /** Single-sentence pedagogical goal — "by the end of this mission you will…" */
  learningObjective:  "",

  /** Bulleted list of skills practiced (rendered in the scorecard). */
  skillsPracticed:    [],


  /* ---- LIFECYCLE ---- */

  /** Status-checklist label that ticks as soon as the student begins. */
  startingStatus:     "",


  /* ---- INTERACTION ---- */

  /**
   * The set of command buttons the student can click.
   * Either an array (Mission 1 shape: COMMAND_BUTTONS) or an object
   * keyed by command id (Mission 2 shape: M2_COMMANDS). The engine
   * accepts both.
   */
  commands:           [],

  /**
   * Declarative unlock rules. Each entry:
   *   { key, unlockedAtStart, unlocksAfterRun }
   * Lets the engine know which commands are visible at start and
   * which ones each command reveals when clicked.
   */
  commandUnlockRules: [],

  /**
   * Hint dictionary. Either a flat { key → text } map, an array of
   * hint strings, or — for missions that compose hints dynamically —
   * a callable. The engine simply forwards to updateHintPanel().
   */
  hints:              {},

  /**
   * Supervisor / manager message dictionary. Same shape as `hints`:
   *   { triggerKey → "message text" }
   * Used by updateManagerMessage() when the student hits a milestone.
   */
  managerMessages:    {},


  /* ---- ASSESSMENT ---- */

  /**
   * The "what did you find?" submission step. Typically:
   *   { question, answers:[{id,text,correct}], correctMsg, wrongMsg }
   * Mission 2 reuses this shape for its Analyst Review.
   */
  findingQuestion:    null,

  /**
   * Final multiple-choice quiz. Shape:
   *   { question, answers:[{id|letter,text,correct}],
   *     correctFeedback, incorrectFeedback,
   *     xpReward?, newRank? }
   * If quiz.xpReward / quiz.newRank are present they take precedence
   * over the mission-level xpReward / newRank.
   */
  quiz:               null,

  /**
   * Optional reflection question shown after the quiz.
   * Set to null for missions that skip reflection (e.g. Mission 2).
   */
  reflection:         null,


  /* ---- REWARDS ---- */

  /** XP awarded when the mission is completed. */
  xpReward:           0,

  /** New rank string awarded on completion (optional). */
  newRank:            "",


  /* ---- COMPLETION SCREEN ---- */

  /**
   * Scorecard content rendered on the completion screen.
   *   {
   *     missionLabel:     string,
   *     threatIdentified: string,
   *     whatYouLearned:   string,
   *     certSkills:       string[],
   *   }
   * Engine renderers (buildCompletionHTML / renderM2Scorecard) read
   * from this object.
   */
  scorecard:          {
    missionLabel:     "",
    threatIdentified: "",
    whatYouLearned:   "",
    certSkills:       [],
  },

  /**
   * Teaser shown on the completion screen for the *next* mission.
   *   { title, description }
   */
  nextMissionPreview: {
    title:       "",
    description: "",
  },
};


/**
 * Required fields every mission MUST provide. Used by
 * validateMissionData() — keep this list short on purpose: anything
 * not listed here can safely fall back to a template default.
 */
const REQUIRED_MISSION_FIELDS = [
  "missionId",
  "title",
  "briefing",
  "commands",
  "xpReward",
];


/**
 * createMissionFromTemplate(custom)
 * --------------------------------
 * Returns a new mission object that merges `custom` on top of
 * MISSION_TEMPLATE. Any field the caller omits falls back to a safe
 * default from the template, so a typo or omission can never produce
 * an `undefined` field that crashes the engine.
 *
 * Performs a shallow merge at the top level and a one-level-deep
 * merge for the nested `scorecard` and `nextMissionPreview` objects
 * so a caller can override e.g. just `scorecard.whatYouLearned`
 * without wiping the other scorecard fields.
 *
 * @param {object} custom  Partial mission data (may include extras).
 * @returns {object}       A fully-formed mission object.
 */
export function createMissionFromTemplate(custom) {
  const safe = custom && typeof custom === "object" ? custom : {};

  // Deep-merge the small nested objects so partial overrides work.
  const mergedScorecard = {
    ...MISSION_TEMPLATE.scorecard,
    ...(safe.scorecard || {}),
  };
  const mergedNext = {
    ...MISSION_TEMPLATE.nextMissionPreview,
    ...(safe.nextMissionPreview || {}),
  };

  return {
    ...MISSION_TEMPLATE,
    ...safe,
    scorecard:          mergedScorecard,
    nextMissionPreview: mergedNext,
  };
}


/**
 * validateMissionData(mission)
 * ----------------------------
 * Lightweight required-field check. Returns:
 *   { valid: boolean, missing: string[] }
 *
 * Logs a clear console.warn for each missing required field so
 * mission authors see the problem in devtools. We deliberately do
 * NOT surface validation warnings to students — they only matter to
 * the developer who's wiring up a new mission.
 *
 * A field is considered "missing" when it is undefined, null, an
 * empty string, an empty array, or an empty plain object.
 *
 * @param {object} mission
 * @returns {{ valid: boolean, missing: string[] }}
 */
export function validateMissionData(mission) {
  if (!mission || typeof mission !== "object") {
    console.warn(
      "[mission-template] validateMissionData: expected a mission object, got",
      mission,
    );
    return { valid: false, missing: REQUIRED_MISSION_FIELDS.slice() };
  }

  const isEmpty = (v) => {
    if (v === undefined || v === null) return true;
    if (typeof v === "string") return v.trim() === "";
    if (Array.isArray(v))     return v.length === 0;
    if (typeof v === "object") return Object.keys(v).length === 0;
    return false;
  };

  const missing = REQUIRED_MISSION_FIELDS.filter((f) => isEmpty(mission[f]));

  if (missing.length > 0) {
    const id = mission.missionId || "(no missionId)";
    console.warn(
      `[mission-template] Mission "${id}" is missing required field(s): ${missing.join(", ")}. ` +
      `Pass the object through createMissionFromTemplate() and double-check the missing fields ` +
      `before registering it in MISSIONS_REGISTRY.`,
    );
  }

  return { valid: missing.length === 0, missing };
}


/* ============================================================
   MISSION REGISTRY  (Milestone 23E — Phase A)
   ------------------------------------------------------------
   The mission registry controls course order and mission
   availability. It is the single source of truth for:

     - which missions exist in the course,
     - what order they appear in,
     - whether each one is Locked / Available / Unlocked / Completed,
     - which entries are placeholder-only (no gameplay yet),
     - which previous mission must be completed to unlock the next.

   The registry is intentionally separate from MISSIONS_REGISTRY (the
   data registry used by the engine). MISSIONS_REGISTRY holds the
   per-mission GAMEPLAY data (commands, hints, quizzes, scorecards);
   the Mission Registry below holds the per-mission COURSE METADATA
   (order, status, unlock chain) and is what the Course Progress
   panel renders from.

   Why two registries:
     - Course metadata changes frequently (statuses flip every time
       the student completes a step) and is a thin catalog.
     - Gameplay data is heavy, mission-shaped, and stable.
     Keeping them separate prevents churn on one from forcing
     re-validation of the other.

   Status values:
     "locked"     — student cannot start; prerequisite incomplete
     "available"  — student can start (default for Mission 1)
     "unlocked"   — student can start (prerequisite completed)
     "completed"  — student has finished the mission

   The registry uses short ids ("mission1"/"mission2"/"mission3")
   per the Milestone 23E spec; these are distinct from the engine's
   structured-data ids ("mission-001"/"mission-002"). The
   `engineMissionDataId` field links a registry entry to its
   corresponding entry in MISSIONS_REGISTRY when one exists.
   ============================================================ */

/** Allowed values for the `status` field on a registry entry. */
export const MISSION_STATUS = {
  LOCKED:    "locked",
  AVAILABLE: "available",
  UNLOCKED:  "unlocked",
  COMPLETED: "completed",
};

/**
 * missionRegistry — central catalog of every mission in the course.
 * Renderers (e.g. renderCourseProgress in script.js) loop this array
 * instead of hardcoding mission cards.
 */
export const missionRegistry = [
  {
    missionId:           "mission1",
    title:               "New Cybersecurity Intern",
    description:         "Investigate a suspicious workstation.",
    order:               1,
    status:              "available",     // Mission 1 is always available
    placeholderOnly:     false,
    prerequisiteId:      null,            // No prerequisite — entry point
    engineMissionDataId: "mission-001",   // Links to MISSIONS_REGISTRY
  },
  {
    missionId:           "mission2",
    title:               "Network Basics",
    description:         "Identify devices and services on a network.",
    order:               2,
    status:              "locked",        // Becomes "unlocked" after Mission 1
    placeholderOnly:     false,
    prerequisiteId:      "mission1",
    engineMissionDataId: "mission-002",
  },
  {
    missionId:           "mission3",
    title:               "Reconnaissance Detection",
    description:         "Detect and report external reconnaissance against the network.",
    order:               3,
    status:              "locked",        // Becomes "unlocked" after Mission 2
    placeholderOnly:     true,            // Surfaced in the course list once M2 is complete
    prerequisiteId:      "mission2",
    engineMissionDataId: "mission-003",   // Links to the live M3 engine
  },
  {
    missionId:           "mission4",
    title:               "Reconnaissance Sweep",
    description:         "Confirm and classify a coordinated reconnaissance sweep.",
    order:               4,
    status:              "locked",        // Becomes "unlocked" after Mission 3
    placeholderOnly:     true,            // Surfaced in the course list once M3 is complete
    prerequisiteId:      "mission3",
    engineMissionDataId: "mission-004",   // Data-driven engine (GENERIC_MISSIONS)
  },
  {
    missionId:           "mission5",
    title:               "Account Takeover Investigation",
    description:         "Investigate a suspected account takeover.",
    order:               5,
    status:              "locked",        // Becomes "unlocked" after Mission 4
    placeholderOnly:     true,            // Surfaced in the course list once M4 is complete
    prerequisiteId:      "mission4",
    engineMissionDataId: "mission-005",   // Data-driven engine (GENERIC_MISSIONS)
  },
  {
    missionId:           "mission6",
    title:               "Anomalous Scan Triage",
    description:         "Triage anomalous scanning activity on the network.",
    order:               6,
    status:              "locked",        // Becomes "unlocked" after Mission 5
    placeholderOnly:     true,            // Surfaced in the course list once M5 is complete
    prerequisiteId:      "mission5",
    engineMissionDataId: "mission-006",   // Data-driven engine (GENERIC_MISSIONS)
  },
];


/* ------------------------------------------------------------
   Registry helpers — all pure functions over `missionRegistry`.
   These never touch the DOM and never reach into script.js
   state, so they are safe to call from anywhere.
   ------------------------------------------------------------ */

/**
 * Returns the registry entry for the given registry-id, or undefined.
 * @param {string} missionId  e.g. "mission1"
 */
export function getRegistryMission(missionId) {
  return missionRegistry.find((m) => m.missionId === missionId);
}

/**
 * Returns the missionId of the mission that follows `currentMissionId`
 * in the course order, or null if there is no next mission.
 * @param {string} currentMissionId
 * @returns {string|null}
 */
export function getNextMissionId(currentMissionId) {
  const cur = getRegistryMission(currentMissionId);
  if (!cur) return null;
  const next = missionRegistry
    .filter((m) => m.order > cur.order)
    .sort((a, b) => a.order - b.order)[0];
  return next ? next.missionId : null;
}

/**
 * Returns the current status string for `missionId`, or null if not
 * in the registry. One of MISSION_STATUS values.
 * @param {string} missionId
 * @returns {string|null}
 */
export function getMissionStatus(missionId) {
  const m = getRegistryMission(missionId);
  return m ? m.status : null;
}

/**
 * Sets the status of `missionId` to `status`. Returns true on success,
 * false if the mission id is unknown. Logs a console.warn (never shown
 * to students) when called with an unknown id or invalid status.
 *
 * Callers in script.js typically invoke this from saveProgress /
 * loadProgress / completeMission / resetMission hooks via the
 * `syncRegistryFromState()` helper so the registry mirrors the live
 * state flags (missionComplete / mission2Complete).
 *
 * @param {string} missionId
 * @param {string} status     one of MISSION_STATUS values
 * @returns {boolean}
 */
export function updateMissionStatus(missionId, status) {
  const m = getRegistryMission(missionId);
  if (!m) {
    console.warn(
      `[mission-registry] updateMissionStatus: unknown missionId "${missionId}". ` +
      `Known ids: ${missionRegistry.map((x) => x.missionId).join(", ")}.`,
    );
    return false;
  }
  const allowed = Object.values(MISSION_STATUS);
  if (!allowed.includes(status)) {
    console.warn(
      `[mission-registry] updateMissionStatus: invalid status "${status}" for "${missionId}". ` +
      `Allowed: ${allowed.join(", ")}.`,
    );
    return false;
  }
  m.status = status;
  return true;
}


/* ============================================================
   GENERIC MISSIONS  (mission-004 / 005 / 006)
   ------------------------------------------------------------
   These three missions connect the prototype's remaining incident
   nodes (LATAM / MENA / SEA) to real, playable investigations.

   Unlike Missions 1–3 — whose gameplay is hand-coded across hundreds
   of lines of bespoke HTML + script.js branches — these missions are
   fully DATA-DRIVEN. A single self-contained engine in script.js
   (the `gm*` functions) reads these objects and renders the entire
   experience: briefing → terminal commands (sequential unlock) →
   per-step reasoning prompts (which raise an Analyst Confidence bar)
   → analyst review → final quiz → completion scorecard.

   Adding a fourth data-driven mission is just a matter of appending
   another object here — no new HTML, no new engine branches.

   COMMAND SHAPE:
     key            unique id within the mission
     label/icon/desc button presentation
     cmd            the command string echoed into the terminal
     output         array of result lines printed under the command
     managerMsg     supervisor line shown after the command runs
     unlockedAtStart true = clickable from the start
     unlocks        keys revealed after this command resolves
     isReview       true = running it opens the Analyst Review
     reasoning      optional one-question gate; the listed `unlocks`
                    fire only after it is answered correctly. Shape:
                    { question, answers:[{letter,text}], correct,
                      conf, correctMsg, wrongMsg, hint }
   ============================================================ */

export const GENERIC_MISSIONS = {
  /* ---------- Mission 4 — Reconnaissance Sweep (LATAM) ---------- */
  "mission-004": {
    id:        "mission-004",
    num:       "04",
    title:     "Reconnaissance Sweep",
    region:    "LATAM REGION",
    opId:      "OPS-2026-004",
    severity:  "MEDIUM",
    role:      "You are a Blue Team SOC analyst. The LATAM perimeter sensors are lighting up with blocked connection attempts. Your manager wants you to confirm whether this is a coordinated reconnaissance sweep.",
    briefing:  "Systematic port scanning has been observed against the LATAM external perimeter from an unknown IP range. Review the firewall logs, attribute the source, measure the scan footprint, and decide what stage of an attack this represents.",
    learningObjective: "Practice reading perimeter firewall logs and recognizing a distributed reconnaissance sweep.",
    supervisorIntro: "Welcome, analyst. OPS-2026-004 is a perimeter alert. Start by reviewing the firewall log — each command unlocks the next.",
    objectives: [
      "Review blocked perimeter connections",
      "Attribute the scanning source range",
      "Measure the port-scan footprint",
      "Classify the activity",
    ],
    commands: [
      {
        key: "fw-log", label: "Review Firewall Log", icon: "🧱",
        desc: "Inspect the latest blocked connections", cmd: "tail -n 6 /var/log/firewall.log",
        output: [
          "DENY 203.0.113.41 -> perimeter:22   (ssh)",
          "DENY 203.0.113.58 -> perimeter:80   (http)",
          "DENY 203.0.113.12 -> perimeter:443  (https)",
          "DENY 203.0.113.90 -> perimeter:3389 (rdp)",
          "DENY 203.0.113.41 -> perimeter:8080 (http-alt)",
          "DENY 203.0.113.58 -> perimeter:3306 (mysql)",
        ],
        managerMsg: "Lots of denied attempts, and the source addresses all share the 203.0.113.x prefix. Find out who owns that range.",
        nextHint: "Every blocked address sits in the same 203.0.113.x block. Look up who owns that range.",
        unlockedAtStart: true,
        unlocks: ["trace-range"],
        reasoning: {
          question: "What stands out about these blocked connections?",
          answers: [
            { letter: "A", text: "They all come from one shared external IP range." },
            { letter: "B", text: "They are all internal, trusted hosts." },
            { letter: "C", text: "The firewall is allowing every connection." },
          ],
          correct: "A", conf: 25,
          correctMsg: "Right — many addresses, but all inside one external range hitting many ports. That's organized.",
          wrongMsg:   "Look again — the addresses differ but all share the 203.0.113.x prefix, and each targets a different port.",
          hint: "Compare the source addresses — they share a common prefix — and the ports — they're all different.",
        },
      },
      {
        key: "check-known", label: "Check Known Address", icon: "✅",
        desc: "Rule out a familiar address first", cmd: "whois 8.8.8.8",
        output: [
          "OrgName: Google LLC",
          "Status:  Well-known public DNS resolver",
        ],
        managerMsg: "That's Google's public DNS — legitimate. Ruling a source out is useful, but it isn't our scanner.",
        nextHint: "A known resolver is normal traffic. Focus on the 203.0.113.x range instead.",
        unlockedAtStart: true,
        unlocks: [],
        reasoning: {
          question: "What does this lookup tell you?",
          answers: [
            { letter: "A", text: "8.8.8.8 is the attacker." },
            { letter: "B", text: "8.8.8.8 is a known, legitimate public DNS resolver." },
            { letter: "C", text: "The network has been breached." },
          ],
          correct: "B", conf: 10,
          correctMsg: "Correct — a well-known resolver is normal traffic you can set aside.",
          wrongMsg:   "Re-read it — this is Google's public DNS, a legitimate service, not our scanner.",
          hint: "A well-known public DNS resolver is legitimate infrastructure, not an attacker.",
        },
      },
      {
        key: "trace-range", label: "Trace Source Range", icon: "🌐",
        desc: "Look up the suspicious IP range", cmd: "whois 203.0.113.0/24",
        output: [
          "OrgName: Unallocated / Unknown",
          "Country: --",
          "Status:  Flagged in 3 active threat-intel feeds",
        ],
        managerMsg: "Unallocated space flagged across multiple threat feeds — that's hostile. Measure how many services it touched.",
        nextHint: "An unknown, flagged range is a red flag. Count how many distinct ports it probed.",
        unlockedAtStart: false,
        unlocks: ["count-ports"],
        reasoning: {
          question: "Why is this source range concerning?",
          answers: [
            { letter: "A", text: "It belongs to a trusted partner." },
            { letter: "B", text: "It is unallocated, unattributed, and flagged in threat-intel feeds." },
            { letter: "C", text: "It has no recent activity." },
          ],
          correct: "B", conf: 30,
          correctMsg: "Exactly — unallocated space appearing in threat feeds is a classic recon source.",
          wrongMsg:   "Look again — the range is unallocated, has no owner, and is flagged across threat feeds.",
          hint: "Check the OrgName and the threat-feed status — an unowned, flagged range is the danger sign.",
        },
      },
      {
        key: "count-ports", label: "Count Probed Ports", icon: "🔢",
        desc: "Measure the scan footprint", cmd: "awk '{print $5}' firewall.log | sort -u | wc -l",
        output: [
          "Distinct destination ports probed: 27",
          "Pattern: sequential sweep across common service ports",
        ],
        managerMsg: "Twenty-seven services swept in sequence — that's mapping our attack surface. Make the call.",
        nextHint: "A wide, sequential sweep across many services is the signature of recon. Review your conclusion.",
        unlockedAtStart: false,
        unlocks: ["review"],
        reasoning: {
          question: "What does sweeping 27 different ports indicate?",
          answers: [
            { letter: "A", text: "The attacker is mapping which services are exposed." },
            { letter: "B", text: "A single user mistyped a URL." },
            { letter: "C", text: "The server is sending an email." },
          ],
          correct: "A", conf: 35,
          correctMsg: "Right — broad, sequential probing maps the attack surface before a real attack.",
          wrongMsg:   "Not quite — touching 27 services in sequence is deliberate enumeration, not an accident.",
          hint: "One source touching many services in sequence is enumeration — it's mapping what's exposed.",
        },
      },
      {
        key: "review", label: "Review & Classify", icon: "🧭",
        desc: "Correlate the findings", cmd: "review recon-sweep",
        output: ["An unknown external range is systematically probing dozens of perimeter services."],
        managerMsg: "Good work correlating the signals. Now classify what stage of an attack this is.",
        nextHint: "Decide what this activity represents — answer the Analyst Review below.",
        unlockedAtStart: false,
        unlocks: [],
        isReview: true,
      },
    ],
    analystReview: {
      question: "What does this activity represent?",
      answers: [
        { letter: "A", text: "An active data breach already in progress." },
        { letter: "B", text: "A reconnaissance sweep — mapping exposed services before an attack." },
        { letter: "C", text: "A routine software update." },
        { letter: "D", text: "A denial-of-service attack." },
      ],
      correct: "B",
      correctMsg: "Correct. Broad, sequential probing from an unknown range is a reconnaissance sweep — the attacker is mapping the attack surface.",
      wrongMsg:   "Not quite. Nothing is being stolen or overwhelmed yet — this is information-gathering, i.e. a reconnaissance sweep.",
      finding: "An unknown external range (203.0.113.0/24) is performing a systematic reconnaissance sweep of the LATAM perimeter.",
    },
    quiz: {
      question: "What is the goal of a reconnaissance sweep?",
      answers: [
        { letter: "A", text: "To encrypt the victim's files." },
        { letter: "B", text: "To discover which services are exposed so the attacker can plan an attack." },
        { letter: "C", text: "To speed up the network." },
        { letter: "D", text: "To send phishing emails." },
      ],
      correct: "B",
      correctMsg: "Correct. A recon sweep maps the exposed attack surface so the attacker knows where to strike next.",
      wrongMsg:   "Review the findings — a sweep maps which services are exposed, ahead of any real attack.",
      xpReward: 100,
      newRank:  "Cyber Analyst — Perimeter",
    },
    scorecard: {
      threatIdentified: "External reconnaissance sweep mapping exposed perimeter services",
      whatYouLearned:   "You learned how analysts read perimeter firewall logs, attribute a hostile source range, measure a port-scan footprint, and classify early-stage reconnaissance before it becomes an attack.",
      certSkills: [
        "Firewall log analysis",
        "Source-range attribution",
        "Port-scan footprinting",
        "Reconnaissance classification",
      ],
    },
  },

  /* ---------- Mission 5 — Account Takeover Investigation (MENA) ---------- */
  "mission-005": {
    id:        "mission-005",
    num:       "05",
    title:     "Account Takeover Investigation",
    region:    "MENA REGION",
    opId:      "OPS-2026-005",
    severity:  "MEDIUM",
    role:      "You are a Blue Team SOC analyst. Identity monitoring flagged a burst of failed MFA challenges against privileged MENA accounts. Determine whether an attacker has taken over an account.",
    briefing:  "Anomalous authentication events — repeated failed MFA challenges from unfamiliar locations — are targeting privileged accounts. Review the auth logs, geolocate the source, and find out whether any account was actually compromised.",
    learningObjective: "Practice investigating authentication logs to detect and confirm an account-takeover attempt.",
    supervisorIntro: "Welcome, analyst. OPS-2026-005 looks like an account-takeover attempt on admin accounts. Start with the failed-login records.",
    objectives: [
      "Review failed authentication events",
      "Geolocate the source of the attempts",
      "Check whether any login succeeded",
      "Classify the incident",
    ],
    commands: [
      {
        key: "auth-fail", label: "Review Failed Logins", icon: "🔑",
        desc: "Inspect failed MFA challenges", cmd: "grep FAILED auth.log | tail -n 6",
        output: [
          "FAILED mfa admin_svc   src=45.83.220.10",
          "FAILED mfa admin_svc   src=45.83.220.10",
          "FAILED mfa db_admin    src=45.83.220.10",
          "FAILED mfa admin_svc   src=45.83.220.10",
          "FAILED mfa net_admin   src=45.83.220.10",
          "FAILED mfa admin_svc   src=45.83.220.10",
        ],
        managerMsg: "Dozens of MFA failures against admin accounts, all from one address. Find out where 45.83.220.10 is.",
        nextHint: "The failures hammer privileged accounts from a single source. Geolocate that address.",
        unlockedAtStart: true,
        unlocks: ["geo-source"],
        reasoning: {
          question: "What pattern do these failures show?",
          answers: [
            { letter: "A", text: "One source repeatedly targeting privileged accounts." },
            { letter: "B", text: "A single user who forgot their password once." },
            { letter: "C", text: "Normal, successful logins." },
          ],
          correct: "A", conf: 25,
          correctMsg: "Right — one source, many privileged accounts, repeated MFA failures. That's an attack, not a typo.",
          wrongMsg:   "Look again — the same source is hitting several admin accounts over and over.",
          hint: "Notice the source address and which accounts are targeted — repetition against admins is the signal.",
        },
      },
      {
        key: "check-user", label: "Check a Normal User", icon: "👤",
        desc: "Rule out an ordinary login", cmd: "last jdoe",
        output: [
          "jdoe  pts/2  10.12.4.8 (office)  Mon 09:02 still logged in",
        ],
        managerMsg: "That's a normal employee on the office network — nothing wrong there. Stay on the admin accounts.",
        nextHint: "A regular user from the office network is fine. Focus on the privileged-account attempts.",
        unlockedAtStart: true,
        unlocks: [],
        reasoning: {
          question: "Is jdoe's session suspicious?",
          answers: [
            { letter: "A", text: "Yes — it proves the breach." },
            { letter: "B", text: "No — it's a normal user logging in from the office network." },
            { letter: "C", text: "Yes — office logins are always attacks." },
          ],
          correct: "B", conf: 10,
          correctMsg: "Correct — an ordinary user from the office IP is expected activity you can set aside.",
          wrongMsg:   "Re-read it — jdoe is a normal user on the internal office network, not part of the attack.",
          hint: "An ordinary account logging in from the internal office network is normal behaviour.",
        },
      },
      {
        key: "geo-source", label: "Geolocate Source", icon: "📍",
        desc: "Look up the attacking address", cmd: "geoip 45.83.220.10",
        output: [
          "ASN:     AS-bulletproof-hosting",
          "Country: Outside approved geo-list",
          "Status:  Listed on credential-stuffing block lists",
        ],
        managerMsg: "Bulletproof hosting, outside our geo-list, on stuffing block lists. Now check whether any attempt actually succeeded.",
        nextHint: "A hostile source location confirms intent. Check the logs for any SUCCESS — did one get through?",
        unlockedAtStart: false,
        unlocks: ["check-success"],
        reasoning: {
          question: "Why does this geolocation matter?",
          answers: [
            { letter: "A", text: "It is a trusted corporate data center." },
            { letter: "B", text: "It is hostile hosting outside the approved geo-list, on block lists." },
            { letter: "C", text: "Location never matters for logins." },
          ],
          correct: "B", conf: 30,
          correctMsg: "Exactly — hostile hosting outside the approved geography strongly implies a deliberate attack.",
          wrongMsg:   "Look again — the source is bulletproof hosting outside the geo-list and on stuffing block lists.",
          hint: "Check the ASN and geo status — hostile hosting outside the approved region is the red flag.",
        },
      },
      {
        key: "check-success", label: "Check for Success", icon: "🚨",
        desc: "Did any login get through?", cmd: "grep SUCCESS auth.log",
        output: [
          "SUCCESS login admin_svc  src=45.83.220.10  (after 46 failures)",
          "SUCCESS mfa   admin_svc  src=45.83.220.10",
        ],
        managerMsg: "They got in — admin_svc was compromised after dozens of attempts. This is a confirmed takeover. Make the call.",
        nextHint: "One account succeeded after many failures — that's a compromise. Review and classify the incident.",
        unlockedAtStart: false,
        unlocks: ["review"],
        reasoning: {
          question: "What does this successful login mean?",
          answers: [
            { letter: "A", text: "The attacker compromised admin_svc after repeated attempts." },
            { letter: "B", text: "The system is working normally." },
            { letter: "C", text: "Nothing was breached." },
          ],
          correct: "A", conf: 35,
          correctMsg: "Right — a success after 46 failures from a hostile source means the account was taken over.",
          wrongMsg:   "Not quite — a SUCCESS following dozens of failures from a hostile source is a compromise.",
          hint: "A successful login from the attacking source, right after many failures, means they broke in.",
        },
      },
      {
        key: "review", label: "Review & Classify", icon: "🧭",
        desc: "Correlate the findings", cmd: "review ato",
        output: ["A hostile source brute-forced privileged accounts and compromised admin_svc."],
        managerMsg: "Good — you've confirmed the takeover. Classify the incident and recommend containment.",
        nextHint: "Decide what this incident is and what to do — answer the Analyst Review below.",
        unlockedAtStart: false,
        unlocks: [],
        isReview: true,
      },
    ],
    analystReview: {
      question: "What does this activity represent?",
      answers: [
        { letter: "A", text: "A reconnaissance scan with no impact." },
        { letter: "B", text: "An account-takeover attack — credentials brute-forced until one account was compromised." },
        { letter: "C", text: "A routine password rotation." },
        { letter: "D", text: "A denial-of-service attack." },
      ],
      correct: "B",
      correctMsg: "Correct. Repeated MFA failures from a hostile source ending in a successful admin login is a confirmed account takeover.",
      wrongMsg:   "Not quite. The attacker kept trying until an admin login succeeded — that is an account-takeover attack.",
      finding: "A hostile source (45.83.220.10) brute-forced privileged MENA accounts and compromised admin_svc.",
    },
    quiz: {
      question: "What is the best immediate containment for a compromised account?",
      answers: [
        { letter: "A", text: "Ignore it — the MFA failures already stopped." },
        { letter: "B", text: "Disable the account, force a password reset, and re-enroll MFA." },
        { letter: "C", text: "Email the attacker a warning." },
        { letter: "D", text: "Speed up the login page." },
      ],
      correct: "B",
      correctMsg: "Correct. Lock the compromised account, force new credentials, and re-enroll MFA to cut off the attacker.",
      wrongMsg:   "Review the incident — a compromised account must be disabled, its password reset, and MFA re-enrolled.",
      xpReward: 100,
      newRank:  "Cyber Analyst — Identity",
    },
    scorecard: {
      threatIdentified: "Account takeover of a privileged account via credential brute-forcing",
      whatYouLearned:   "You learned how analysts triage authentication logs, separate normal logins from attacks, geolocate a hostile source, confirm a compromise, and recommend account-takeover containment.",
      certSkills: [
        "Authentication log analysis",
        "Source geolocation",
        "Compromise confirmation",
        "Account-takeover response",
      ],
    },
  },

  /* ---------- Mission 6 — Anomalous Scan Triage (SEA) ---------- */
  "mission-006": {
    id:        "mission-006",
    num:       "06",
    title:     "Anomalous Scan Triage",
    region:    "SE ASIA REGION",
    opId:      "OPS-2026-006",
    severity:  "LOW",
    role:      "You are a Blue Team SOC analyst. A low-rate port scan tripped the SEA DMZ sensors. Triage it: confirm the source, verify there's no exploitation, and decide whether it needs to be escalated.",
    briefing:  "Not every alert is an attack. A low-rate scan is hitting the SEA DMZ. Your job is triage — attribute the source, confirm whether any exploitation was attempted, and make the right call about escalation.",
    learningObjective: "Practice alert triage: distinguishing benign automated noise from a genuine threat.",
    supervisorIntro: "Welcome, analyst. OPS-2026-006 is low priority — a triage exercise. Start with the IDS log and work the evidence.",
    objectives: [
      "Review the IDS scan alert",
      "Attribute the scanning source",
      "Confirm no exploitation occurred",
      "Decide on escalation",
    ],
    commands: [
      {
        key: "ids-log", label: "Review IDS Alert", icon: "📡",
        desc: "Inspect the scan alert", cmd: "tail -n 4 /var/log/ids.log",
        output: [
          "PROBE 198.51.100.20 -> dmz:80   GET /",
          "PROBE 198.51.100.20 -> dmz:443  GET /",
          "Rate: 0.3 requests/sec (very low)",
          "No payloads, no POST requests observed",
        ],
        managerMsg: "A very low-rate probe of just two ports, no payloads. Find out who 198.51.100.20 is.",
        nextHint: "Low rate, only GET requests, two ports. Attribute the source address first.",
        unlockedAtStart: true,
        unlocks: ["attribute"],
        reasoning: {
          question: "What does the scan rate tell you?",
          answers: [
            { letter: "A", text: "It is very low and uses only harmless GET requests." },
            { letter: "B", text: "It is a high-speed flood meant to crash the server." },
            { letter: "C", text: "It is encrypting files." },
          ],
          correct: "A", conf: 25,
          correctMsg: "Right — 0.3 req/s with only GETs and no payloads is gentle, automated probing.",
          wrongMsg:   "Look again — 0.3 requests/sec with no payloads is a very low-rate, harmless-looking probe.",
          hint: "Read the rate and request types — a fraction of a request per second with only GETs is low-impact.",
        },
      },
      {
        key: "attribute", label: "Attribute Source", icon: "🌐",
        desc: "Look up the scanning address", cmd: "whois 198.51.100.20",
        output: [
          "OrgName: Global CDN / Internet Measurement",
          "Status:  Known benign internet-wide scanner",
        ],
        managerMsg: "That's a known internet-measurement scanner — benign attribution. Still, confirm nothing was exploited.",
        nextHint: "A known benign scanner is reassuring, but verify there were no exploitation attempts in the web log.",
        unlockedAtStart: false,
        unlocks: ["check-exploit"],
        reasoning: {
          question: "What does the attribution tell you?",
          answers: [
            { letter: "A", text: "It is a known, benign internet-measurement scanner." },
            { letter: "B", text: "It is an unknown attacker we must block immediately." },
            { letter: "C", text: "It is an internal admin host." },
          ],
          correct: "A", conf: 30,
          correctMsg: "Correct — a registered, well-known scanner is benign, but you should still verify impact.",
          wrongMsg:   "Re-read it — the source is a known, benign internet-wide measurement scanner.",
          hint: "Check the OrgName and status — a registered, well-known scanner is benign infrastructure.",
        },
      },
      {
        key: "check-exploit", label: "Check for Exploitation", icon: "🛡️",
        desc: "Verify no attack succeeded", cmd: "grep -E 'EXPLOIT|POST|500' web.log",
        output: [
          "(no matches)",
          "Only HTTP 200 responses to GET / — no exploitation attempts found.",
        ],
        managerMsg: "Clean — no exploitation, no POSTs, no errors. You have everything you need to make the call.",
        nextHint: "No exploitation found. Now make the triage decision in the Analyst Review.",
        unlockedAtStart: false,
        unlocks: ["review"],
        reasoning: {
          question: "What do these results confirm?",
          answers: [
            { letter: "A", text: "No exploitation was attempted — only harmless GET probes." },
            { letter: "B", text: "The server was successfully breached." },
            { letter: "C", text: "Data was stolen." },
          ],
          correct: "A", conf: 35,
          correctMsg: "Right — no exploit attempts, only benign GETs. The impact is effectively zero.",
          wrongMsg:   "Not quite — there are no exploit attempts in the log, only harmless GET requests.",
          hint: "No EXPLOIT, POST, or 500 matches means nothing was attacked — only harmless probes.",
        },
      },
      {
        key: "review", label: "Review & Triage", icon: "🧭",
        desc: "Make the triage decision", cmd: "review triage",
        output: ["A known benign scanner performed a low-rate probe with no exploitation attempts."],
        managerMsg: "Good triage. Now decide the right response — answer the Analyst Review below.",
        nextHint: "Decide what to do with this alert — answer the Analyst Review below.",
        unlockedAtStart: false,
        unlocks: [],
        isReview: true,
      },
    ],
    analystReview: {
      question: "What is the correct response to this alert?",
      answers: [
        { letter: "A", text: "Declare a major incident and page the whole team." },
        { letter: "B", text: "Confirm attribution, log it for trending, and take no further action unless it escalates." },
        { letter: "C", text: "Shut down all DMZ services immediately." },
        { letter: "D", text: "Ignore the alert entirely and delete the logs." },
      ],
      correct: "B",
      correctMsg: "Correct. A benign, low-rate scan with no exploitation is logged for trending — no escalation needed unless the pattern changes.",
      wrongMsg:   "Not quite. This is benign low-rate noise — log it for trending and monitor, rather than over- or under-reacting.",
      finding: "A known benign scanner (198.51.100.20) performed a low-rate SEA DMZ probe with no exploitation — logged for trending.",
    },
    quiz: {
      question: "Why is triage an important SOC skill?",
      answers: [
        { letter: "A", text: "Because every alert is always a real attack." },
        { letter: "B", text: "Because it separates harmless noise from genuine threats so analysts focus on what matters." },
        { letter: "C", text: "Because it makes the network faster." },
        { letter: "D", text: "Because it deletes old logs." },
      ],
      correct: "B",
      correctMsg: "Correct. Triage keeps analysts focused on real threats by filtering out the constant stream of benign noise.",
      wrongMsg:   "Review the mission — triage separates benign noise from real threats so the team isn't overwhelmed.",
      xpReward: 100,
      newRank:  "Cyber Analyst — Triage",
    },
    scorecard: {
      threatIdentified: "Benign low-rate scan — triaged and logged, no escalation required",
      whatYouLearned:   "You learned how analysts triage low-priority alerts: confirming source attribution, verifying there was no exploitation, and making a proportionate decision instead of over- or under-reacting.",
      certSkills: [
        "Alert triage",
        "Source attribution",
        "Exploitation verification",
        "Proportionate escalation",
      ],
    },
  },
};

/** Returns the data-driven mission object for the given id, or undefined. */
export function getGenericMission(id) {
  return GENERIC_MISSIONS[id];
}

/** True if `id` is one of the data-driven generic missions (004/005/006). */
export function isGenericMission(id) {
  return Object.prototype.hasOwnProperty.call(GENERIC_MISSIONS, id);
}
