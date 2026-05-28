/**
 * missions.js
 * -----------
 * Ethical CyberHackers Platform — Data Module
 *
 * This file stores ALL the data the platform uses:
 *   - FILESYSTEM : the fake Linux file system students explore
 *   - MISSIONS   : mission metadata, objectives, and hints
 *
 * No logic lives here — only data.
 * All interaction logic (clicks, terminal output, timers) lives in script.js.
 *
 * How to add a new folder: add a new key to FILESYSTEM below.
 * How to add a new file:   add it inside the `files` object of the right folder.
 * How to add a new mission: copy an existing MISSIONS entry and fill it in.
 */


/* ============================================================
   FILESYSTEM
   This is the simulated Linux filesystem the student explores.

   Each key is a directory path (e.g. "~" or "~/documents").
   Each directory has:
     - pwd    : what `pwd` prints (the full path)
     - ls     : what `ls` prints (list of items in this folder)
     - files  : files that `cat` can read in this directory
     - subdirs: folder names the student can `cd` into
   ============================================================ */

export const FILESYSTEM = {

  /* ---- Home directory ---- */
  "~": {
    pwd: "/home/student",

    // These are the items shown when the student runs `ls`
    ls: ["documents", "downloads", "reports"],

    // No readable files in the home directory yet
    files: {},

    // Folders the student can navigate into with `cd`
    subdirs: ["documents", "downloads", "reports"],
  },

  /* ---- Documents folder ---- */
  "~/documents": {
    pwd: "/home/student/documents",

    // Files visible when `ls` is run inside documents/
    ls: ["suspicious_file.txt", "evidence.log", "notes.txt"],

    // Files that `cat` can read here
    files: {
      "suspicious_file.txt": [
        "=== suspicious_file.txt ===",
        "Last modified: 2024-05-28  01:14:03",
        "Author: unknown",
        "",
        "DELETE ALL LOGS BEFORE MORNING SHIFT.",
        "UPLOAD COMPLETE. TARGET COMPROMISED.",
        "RENDEZVOUS AT 03:00 — DO NOT BE LATE.",
        "",
        "[!] WARNING: This file contains evidence of unauthorised access.",
      ],

      "evidence.log": [
        "=== evidence.log ===",
        "2024-05-28 01:09:44  LOGIN  root  from 10.0.0.99",
        "2024-05-28 01:12:01  EXEC   /tmp/.backdoor.sh",
        "2024-05-28 01:13:55  COPY   /etc/passwd → 10.0.0.99",
        "2024-05-28 01:14:03  WRITE  suspicious_file.txt",
        "2024-05-28 01:15:40  LOGOUT root",
      ],

      "notes.txt": [
        "=== notes.txt ===",
        "Personal reminder: check the evidence.log for timestamps.",
        "Cross-reference with auth.log for full picture.",
      ],
    },

    subdirs: [],
  },

  /* ---- Downloads folder ---- */
  "~/downloads": {
    pwd: "/home/student/downloads",
    ls: ["readme.txt"],
    files: {
      "readme.txt": [
        "Nothing to see here yet.",
        "More files will appear as you progress through the mission.",
      ],
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
   MISSIONS
   Each entry represents one training mission.
   ============================================================ */

/** @type {Array<Object>} */
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
      { id: "obj-001-1", text: "Find out where you are (pwd)", complete: false },
      { id: "obj-001-2", text: "List the files in your home folder (ls)", complete: false },
      { id: "obj-001-3", text: "Navigate into the documents folder (cd documents)", complete: false },
      { id: "obj-001-4", text: "Read the suspicious file (cat suspicious_file.txt)", complete: false },
    ],

    hints: [
      "Start with 'pwd' to see where you are on the filesystem.",
      "'ls' shows what files and folders are in your current location.",
      "Use 'cd documents' to move into the documents folder.",
      "Once inside documents, 'cat suspicious_file.txt' will print its contents.",
    ],

    tags: ["linux-basics", "forensics", "navigation"],
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
      { id: "obj-002-1", text: "Identify open services on the target", complete: false },
      { id: "obj-002-2", text: "Enumerate web server directories", complete: false },
      { id: "obj-002-3", text: "Find the hidden flag file", complete: false },
    ],

    hints: [
      "Start with a port scan to see what services are exposed.",
      "Web directories can be listed with enumeration tools.",
    ],

    tags: ["web", "enumeration", "ctf"],
  },
];


/* ============================================================
   ACTIVE MISSION — which mission is currently running
   ============================================================ */

/** ID of the mission the student is currently on. */
export let activeMissionId = "mission-001";

/**
 * Returns the Mission object for the given ID.
 * Returns undefined if the ID doesn't match any mission.
 *
 * @param {string} id
 * @returns {Object|undefined}
 */
export function getMissionById(id) {
  return MISSIONS.find((m) => m.id === id);
}
