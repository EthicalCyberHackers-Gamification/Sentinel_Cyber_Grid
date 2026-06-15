/**
 * Unlock-chain pure-function tests for the six scored assignments.
 *
 * Runnable directly with node (runTest is disabled this session):
 *     node tests/mission-order.test.js
 *
 * Covers the DOM-free progression rules extracted into mission-order.js, which
 * script.js now imports as the single source of truth:
 *   - prevMissionInOrder
 *   - missionUnlockStatus      (drives missionMapStatus)
 *   - canCompleteMission       (drives the notifyLabComplete idempotency/prereq gate)
 *   - continuityEdgeProblems   (World Continuity `connects` edges)
 * Pure (no DOM / storage), so they run at runtime without a browser.
 */

import {
  MISSION_PLAY_ORDER,
  prevMissionInOrder,
  missionUnlockStatus,
  canCompleteMission,
  WORLD_CONTINUITY,
  continuityEdgeProblems,
} from "../mission-order.js";

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// Completion predicate built from a set of completed mission ids.
const completedUpTo = (n) => {
  const done = new Set(MISSION_PLAY_ORDER.slice(0, n));
  return (id) => done.has(id);
};

console.log("MISSION_PLAY_ORDER");
{
  check("has six assignments", MISSION_PLAY_ORDER.length === 6);
  check("starts at mission-001", MISSION_PLAY_ORDER[0] === "mission-001");
  check("ends at mission-006", MISSION_PLAY_ORDER[5] === "mission-006");
  check("no duplicate ids", new Set(MISSION_PLAY_ORDER).size === MISSION_PLAY_ORDER.length);
}

console.log("prevMissionInOrder");
{
  check("first has no predecessor", prevMissionInOrder("mission-001") === null);
  check("mission-003 ← mission-002", prevMissionInOrder("mission-003") === "mission-002");
  check("mission-006 ← mission-005", prevMissionInOrder("mission-006") === "mission-005");
  check("unknown id → null", prevMissionInOrder("mission-999") === null);
}

console.log("missionUnlockStatus — fresh save (nothing complete)");
{
  const none = completedUpTo(0);
  check("only mission-001 is available", missionUnlockStatus("mission-001", none) === "available");
  check("mission-002 locked", missionUnlockStatus("mission-002", none) === "locked");
  check("mission-006 locked", missionUnlockStatus("mission-006", none) === "locked");
  check("none are completed",
    MISSION_PLAY_ORDER.every((id) => missionUnlockStatus(id, none) !== "completed"));
  check("unknown id → locked", missionUnlockStatus("mission-999", none) === "locked");
}

console.log("missionUnlockStatus — each completion unlocks EXACTLY the next");
{
  for (let n = 1; n <= MISSION_PLAY_ORDER.length; n++) {
    const done = completedUpTo(n);
    // Completed missions read completed.
    for (let i = 0; i < n; i++) {
      check(`${MISSION_PLAY_ORDER[i]} completed after ${n} done`,
        missionUnlockStatus(MISSION_PLAY_ORDER[i], done) === "completed");
    }
    // The very next one (if any) is available.
    if (n < MISSION_PLAY_ORDER.length) {
      check(`${MISSION_PLAY_ORDER[n]} available after ${n} done`,
        missionUnlockStatus(MISSION_PLAY_ORDER[n], done) === "available");
    }
    // Everything beyond the next stays locked (no skipping ahead).
    for (let j = n + 1; j < MISSION_PLAY_ORDER.length; j++) {
      check(`${MISSION_PLAY_ORDER[j]} still locked after ${n} done`,
        missionUnlockStatus(MISSION_PLAY_ORDER[j], done) === "locked");
    }
  }
}

console.log("canCompleteMission — idempotency + prerequisite gate");
{
  const none = completedUpTo(0);
  check("first is completable on a fresh save", canCompleteMission("mission-001", none) === true);
  check("second NOT completable before first", canCompleteMission("mission-002", none) === false);
  check("out-of-order (006 before chain) blocked", canCompleteMission("mission-006", none) === false);

  const one = completedUpTo(1);
  check("first NOT completable again (idempotent)", canCompleteMission("mission-001", one) === false);
  check("second completable once first done", canCompleteMission("mission-002", one) === true);
  check("third still blocked after only first", canCompleteMission("mission-003", one) === false);

  check("unknown id is never completable", canCompleteMission("mission-000", none) === false);
}

console.log("continuityEdgeProblems — World Continuity connects edges");
{
  check("real data has no edge problems", continuityEdgeProblems(WORLD_CONTINUITY).length === 0);
  check("every connects target is a known mission",
    Object.values(WORLD_CONTINUITY).every((c) => !c.connects || MISSION_PLAY_ORDER.includes(c.connects)));

  // Negative controls: the validator must catch bad edges.
  const forward = { "mission-001": { connects: "mission-002" } };
  check("forward edge flagged", continuityEdgeProblems(forward).length === 1);
  const bogus = { "mission-003": { connects: "mission-404" } };
  check("unknown target flagged", continuityEdgeProblems(bogus).length === 1);
}

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll mission-order checks passed.");
