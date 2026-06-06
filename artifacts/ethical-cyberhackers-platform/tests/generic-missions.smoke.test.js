/**
 * Generic-mission engine smoke test (project task #30).
 *
 * Runnable directly with node (runTest is disabled):
 *     node tests/generic-missions.smoke.test.js
 *
 * Validates the data-driven mission engine that powers assignments 004-006
 * (the "generic" missions surfaced in the Operations Center map). This is a
 * pure-data check: it imports missions.js (no DOM) and asserts the engine
 * accessors and the shape every generic mission must satisfy so the incident
 * card / command runner can render and play it.
 */

import {
  GENERIC_MISSIONS,
  getGenericMission,
  isGenericMission,
} from "../missions.js";

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

const EXPECTED_IDS = ["mission-004", "mission-005", "mission-006"];
const VALID_SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

console.log("Generic-mission engine smoke test (#30)\n");

console.log("Engine accessors:");
for (const id of EXPECTED_IDS) {
  check(`isGenericMission("${id}") === true`, isGenericMission(id) === true);
  check(`getGenericMission("${id}") returns an object`,
    getGenericMission(id) && typeof getGenericMission(id) === "object");
}
for (const id of ["mission-001", "mission-002", "mission-003", "mission-999", "", null]) {
  check(`isGenericMission(${JSON.stringify(id)}) === false`, isGenericMission(id) === false);
}
check('getGenericMission("mission-999") is undefined',
  getGenericMission("mission-999") === undefined);
check("GENERIC_MISSIONS has exactly the three expected keys",
  JSON.stringify(Object.keys(GENERIC_MISSIONS).sort()) ===
    JSON.stringify(EXPECTED_IDS.slice().sort()));

for (const id of EXPECTED_IDS) {
  const m = getGenericMission(id);
  console.log(`\nMission ${id} shape:`);
  check("id matches its registry key", m && m.id === id);
  check("title is a non-empty string",
    typeof m.title === "string" && m.title.trim().length > 0);
  check("region is a non-empty string",
    typeof m.region === "string" && m.region.trim().length > 0);
  check(`severity is one of ${VALID_SEVERITIES.join("/")}`,
    VALID_SEVERITIES.includes(m.severity));
  check("briefing is a non-empty string",
    typeof m.briefing === "string" && m.briefing.trim().length > 0);
  check("objectives is a non-empty array",
    Array.isArray(m.objectives) && m.objectives.length > 0);
  check("commands is a non-empty array",
    Array.isArray(m.commands) && m.commands.length > 0);

  const keys = new Set();
  let everyCommandWellFormed = true;
  let hasStartUnlocked = false;
  let unlockRefsValid = true;
  let reasoningWellFormed = true;
  for (const c of m.commands || []) {
    if (!c || typeof c.key !== "string" || !c.key) everyCommandWellFormed = false;
    if (!c || typeof c.label !== "string" || !c.label) everyCommandWellFormed = false;
    if (!c || typeof c.cmd !== "string" || !c.cmd) everyCommandWellFormed = false;
    if (!c || !Array.isArray(c.output) || c.output.length === 0) everyCommandWellFormed = false;
    if (c && c.key) keys.add(c.key);
    if (c && c.unlockedAtStart) hasStartUnlocked = true;
    // Reasoning gate is optional per command, but when present the engine
    // renders question/answers and checks the chosen letter against `correct`,
    // so a malformed block would break play.
    if (c && c.reasoning) {
      const r = c.reasoning;
      if (typeof r.question !== "string" || !r.question.trim()) reasoningWellFormed = false;
      if (!Array.isArray(r.answers) || r.answers.length === 0) reasoningWellFormed = false;
      if (typeof r.correct !== "string" || !r.correct) reasoningWellFormed = false;
      const letters = (r.answers || []).map((a) => a && a.letter);
      if (!letters.includes(r.correct)) reasoningWellFormed = false;
    }
  }
  for (const c of m.commands || []) {
    for (const ref of (c && c.unlocks) || []) {
      if (!keys.has(ref)) unlockRefsValid = false;
    }
  }
  check("every command has key/label/cmd and non-empty output[]", everyCommandWellFormed);
  check("all command keys are unique", keys.size === (m.commands || []).length);
  check("at least one command is unlockedAtStart", hasStartUnlocked);
  check("every unlocks[] entry references an existing command key", unlockRefsValid);
  check("every reasoning block has question/answers/correct (correct matches an answer letter)",
    reasoningWellFormed);
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("PASSED: generic-mission engine smoke test.");
