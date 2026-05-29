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
      "suspicious_file.txt",
      "security_policy.txt",
    ],

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

      // False lead — a harmless schedule note
      "meeting_schedule.txt": [
        "=== meeting_schedule.txt ===",
        "",
        "Team meeting moved to 3:00 PM. No security concerns found.",
      ],

      // False lead — a harmless finance note
      "finance_update.txt": [
        "=== finance_update.txt ===",
        "",
        "Quarterly finance review notes. No suspicious password request found.",
      ],

      // Bonus evidence — supporting company policy
      "security_policy.txt": [
        "=== security_policy.txt ===",
        "",
        "Company policy: Never share passwords through email or external links.",
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
    // Once inside documents, reveal every file the student can inspect —
    // the normal note, two false leads, the bonus policy, and the
    // suspicious file. The student must sort real evidence from noise.
    unlocksAfterRun: [
      "ls-documents",
      "cat-employee-notes",
      "cat-meeting-schedule",
      "cat-finance-update",
      "cat-security-policy",
      "cat-suspicious",
    ],
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
    title:               "Reconnaissance & Discovery",
    description:         "Mission 3 Locked: Reconnaissance & Discovery coming next.",
    order:               3,
    status:              "locked",        // Stays locked in Phase A
    placeholderOnly:     true,            // No gameplay yet — locked teaser only
    prerequisiteId:      "mission2",
    engineMissionDataId: null,            // No engine data yet
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
