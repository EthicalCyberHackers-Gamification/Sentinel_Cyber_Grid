/*
 * mission-order.js — pure, DOM-free play-order + unlock-chain logic for the six
 * scored assignments, plus the World Continuity link data.
 *
 * Extracted from script.js so the progression rules can be unit-tested at
 * runtime with plain node. script.js runs DOM initialization on import and so
 * cannot be loaded outside a browser (see .agents/memory/ech-node-test-pattern.md);
 * keeping the pure rules here lets `tests/mission-order.test.js` exercise them
 * directly. script.js imports this module as the SINGLE SOURCE OF TRUTH for the
 * order and the unlock chain — do not re-declare these there.
 *
 * Keep this module free of DOM, storage, and browser globals.
 */

/* Canonical play order. Every unlock-dependent surface (Ops Center alert feed,
 * unlock gating, completion guards, lab numbering) derives from it. */
export const MISSION_PLAY_ORDER = [
  "mission-001", // Assignment 001 — Protect Sensitive Information (EMEA)
  "mission-002", // Assignment 002 — Investigate Network Assets (APAC)
  "mission-003", // Assignment 003 — Investigate Suspicious Authentication Activity (NA-EAST)
  "mission-004", // Assignment 004 — Data Exfiltration Investigation (LATAM)
  "mission-005", // Assignment 005 — Account Takeover Investigation (MENA)
  "mission-006", // Assignment 006 — Anomalous Scan Triage (SE ASIA)
];

/** The mission that must be completed before this one (null for the first). */
export function prevMissionInOrder(missionId, order = MISSION_PLAY_ORDER) {
  const i = order.indexOf(missionId);
  return i > 0 ? order[i - 1] : null;
}

/**
 * Unlock status for a mission given a completion predicate.
 * @param {string} missionId
 * @param {(id: string) => boolean} isComplete  true when that mission is done
 * @returns {"locked"|"available"|"completed"}
 * The first assignment has no prerequisite; every later one unlocks once the
 * previous assignment (by play order, not numeric id) is complete.
 */
export function missionUnlockStatus(missionId, isComplete, order = MISSION_PLAY_ORDER) {
  if (order.indexOf(missionId) === -1) return "locked";
  if (isComplete(missionId)) return "completed";
  const prev = prevMissionInOrder(missionId, order);
  if (!prev) return "available";
  return isComplete(prev) ? "available" : "locked";
}

/**
 * Whether a lab-complete notification should award this mission. Mirrors the
 * idempotency + prerequisite gate in notifyLabComplete: it must be a scored
 * assignment, not already complete, and its predecessor must be complete.
 */
export function canCompleteMission(missionId, isComplete, order = MISSION_PLAY_ORDER) {
  if (order.indexOf(missionId) === -1) return false; // not a scored assignment
  if (isComplete(missionId)) return false;           // already complete (idempotent)
  const prev = prevMissionInOrder(missionId, order);
  if (prev && !isComplete(prev)) return false;       // predecessor not complete
  return true;
}

/* World Continuity — recurring people / departments / threat actors and the
 * `connects` links that reward memory across the campaign. `connects` points to
 * a PRIOR mission and only surfaces once that prior mission is complete.
 * Pure data, consumed by the continuity layer in script.js. */
export const WORLD_CONTINUITY = {
  "mission-001": { dept: "finance",     employee: "okafor",    actor: "contractor",
                   resolved: "Contractor's unapproved release package held; the bundled HR and Finance data was pulled before anything left CyberCorp." },
  "mission-002": { dept: "itinfra",     employee: "nwosu",     actor: "contractor", connects: "mission-001",
                   resolved: "Unapproved contractor device 192.168.1.57 removed from the finance segment; asset inventory reconciled." },
  "mission-003": { dept: "finance",     actor: "contractor",   connects: "mission-002",
                   resolved: "Compromised Finance account a.okafor secured; MFA enforced; tied back to the flagged contractor." },
  "mission-004": { dept: "finance",     actor: "contractor",   connects: "mission-003",
                   resolved: "Customer-data exfiltration channel cut and the staged archive purged; breach notification scoped with Legal; tied back to the flagged contractor." },
  "mission-005": { dept: "exec",        employee: "whitfield", actor: "fin12",
                   resolved: "Privileged-account MFA hardened after the 47-failure burst." },
  "mission-006": { dept: "secops",      actor: "redbeacon",    connects: "mission-004",
                   resolved: "DMZ exposure closed; CDN probe baseline re-tuned." },
};

/**
 * Validate World Continuity `connects` edges. Each `connects` must reference a
 * mission that is EARLIER in the play order, otherwise the continuity link could
 * only ever surface after a LATER mission completes. Returns an array of problem
 * strings (empty = valid). Note: edges may legitimately cross threat actors
 * (e.g. mission-006 connects mission-004), so actor identity is NOT asserted.
 */
export function continuityEdgeProblems(continuity = WORLD_CONTINUITY, order = MISSION_PLAY_ORDER) {
  const problems = [];
  Object.entries(continuity || {}).forEach(([id, cont]) => {
    if (!cont || !cont.connects) return;
    const tgt = cont.connects;
    if (order.indexOf(tgt) === -1) {
      problems.push(`${id}.connects "${tgt}" is not a known mission`);
    } else if (order.indexOf(tgt) >= order.indexOf(id)) {
      problems.push(`${id}.connects "${tgt}" is not a prior mission`);
    }
  });
  return problems;
}
