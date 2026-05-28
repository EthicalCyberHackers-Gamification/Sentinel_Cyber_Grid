/**
 * missions.js
 * -----------
 * Mission data for the Ethical CyberHackers Platform.
 * Each mission defines its metadata, objectives, and available commands.
 *
 * This file is intentionally a plain data module — no logic lives here.
 * All mission-running logic lives in script.js.
 *
 * To add a new mission: copy an existing entry and fill in the fields.
 */

/**
 * @typedef {Object} MissionObjective
 * @property {string} id        - Unique identifier for the objective
 * @property {string} text      - Displayed description of the objective
 * @property {boolean} complete - Whether the objective has been completed
 */

/**
 * @typedef {Object} Mission
 * @property {string}             id          - Unique mission identifier
 * @property {string}             title       - Display title shown in the Mission Panel
 * @property {string}             description - Narrative briefing shown to the player
 * @property {'beginner'|'intermediate'|'advanced'} difficulty
 * @property {number}             xpReward    - XP awarded on completion
 * @property {number}             timeLimitSec - Time limit in seconds (0 = no limit)
 * @property {MissionObjective[]} objectives  - Ordered list of objectives
 * @property {string[]}           hints       - Optional beginner hints (shown on request)
 * @property {string[]}           tags        - Topic tags for filtering
 */

/** @type {Mission[]} */
export const MISSIONS = [
  {
    id: "mission-001",
    title: "Investigate suspicious workstation",
    description:
      "A workstation on the internal network has been flagged for anomalous activity. " +
      "Your task is to gather digital evidence, identify the threat actor's footprint, " +
      "and report your findings — without being detected.",
    difficulty: "beginner",
    xpReward: 250,
    timeLimitSec: 1800,
    objectives: [
      {
        id: "obj-001-1",
        text: "Scan the target workstation for open ports",
        complete: false,
      },
      {
        id: "obj-001-2",
        text: "Identify running processes and services",
        complete: false,
      },
      {
        id: "obj-001-3",
        text: "Locate and read the hidden log file",
        complete: false,
      },
      {
        id: "obj-001-4",
        text: "Exfiltrate target data without detection",
        complete: false,
      },
    ],
    hints: [
      "Use 'nmap' to discover which ports are open on the target.",
      "The 'ps aux' command lists all running processes.",
      "Log files are usually stored in /var/log — try 'ls -la' to list them.",
    ],
    tags: ["reconnaissance", "forensics", "linux"],
  },

  {
    id: "mission-002",
    title: "Break into the honeypot",
    description:
      "Security researchers have set up a deliberate honeypot to lure attackers. " +
      "Your mission: identify the honeypot's weaknesses, document the attack surface, " +
      "and demonstrate responsible disclosure practices.",
    difficulty: "beginner",
    xpReward: 300,
    timeLimitSec: 2400,
    objectives: [
      {
        id: "obj-002-1",
        text: "Identify the honeypot's IP address and open services",
        complete: false,
      },
      {
        id: "obj-002-2",
        text: "Enumerate web server directories",
        complete: false,
      },
      {
        id: "obj-002-3",
        text: "Find the hidden flag file on the server",
        complete: false,
      },
    ],
    hints: [
      "Start with a full port scan to see what services are exposed.",
      "Web server directories can be enumerated with tools like 'dirb' or 'gobuster'.",
    ],
    tags: ["web", "enumeration", "ctf"],
  },

  {
    id: "mission-003",
    title: "Crack the password hash",
    description:
      "A leaked database dump contains hashed passwords. Your task is to understand " +
      "common password-hashing algorithms, identify the hash type, and use dictionary " +
      "attacks to recover the plaintext — all in a controlled lab environment.",
    difficulty: "intermediate",
    xpReward: 400,
    timeLimitSec: 3600,
    objectives: [
      {
        id: "obj-003-1",
        text: "Identify the hashing algorithm used",
        complete: false,
      },
      {
        id: "obj-003-2",
        text: "Select an appropriate wordlist for the attack",
        complete: false,
      },
      {
        id: "obj-003-3",
        text: "Recover the plaintext password",
        complete: false,
      },
      {
        id: "obj-003-4",
        text: "Report the vulnerability and suggest mitigations",
        complete: false,
      },
    ],
    hints: [
      "Hash length and format are your first clues (MD5 = 32 chars, SHA1 = 40, bcrypt starts with $2b$).",
      "The rockyou.txt wordlist is a common starting point for dictionary attacks.",
    ],
    tags: ["cryptography", "password-cracking", "blue-team"],
  },
];

/**
 * The ID of the currently active mission.
 * Updated by script.js when the player switches missions.
 * @type {string}
 */
export let activeMissionId = "mission-001";

/**
 * Returns the Mission object for the given ID, or undefined if not found.
 * @param {string} id
 * @returns {Mission|undefined}
 */
export function getMissionById(id) {
  return MISSIONS.find((m) => m.id === id);
}

/**
 * Returns all missions filtered by difficulty.
 * @param {'beginner'|'intermediate'|'advanced'} difficulty
 * @returns {Mission[]}
 */
export function getMissionsByDifficulty(difficulty) {
  return MISSIONS.filter((m) => m.difficulty === difficulty);
}

/**
 * Marks an objective as complete for the given mission.
 * @param {string} missionId
 * @param {string} objectiveId
 * @returns {boolean} true if found and updated, false otherwise
 */
export function completeObjective(missionId, objectiveId) {
  const mission = getMissionById(missionId);
  if (!mission) return false;

  const obj = mission.objectives.find((o) => o.id === objectiveId);
  if (!obj) return false;

  obj.complete = true;
  return true;
}

/**
 * Returns true if every objective in the mission is complete.
 * @param {string} missionId
 * @returns {boolean}
 */
export function isMissionComplete(missionId) {
  const mission = getMissionById(missionId);
  if (!mission) return false;
  return mission.objectives.every((o) => o.complete);
}
