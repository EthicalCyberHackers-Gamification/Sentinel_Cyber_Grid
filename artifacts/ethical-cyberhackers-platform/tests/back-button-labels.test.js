/**
 * Context-aware back-button label test (project task #34).
 *
 * Runnable directly with node (runTest is disabled):
 *     node tests/back-button-labels.test.js
 *
 * The mission back buttons relabel themselves based on where the player came
 * from: the Operations Center wording when launched from the OC map, otherwise
 * the module-overview default. That decision lives in the pure, DOM-free helper
 * `missionBackLabel` (uiLabels.js); this test exercises its real runtime
 * behavior and then confirms script.js actually wires the three mission back
 * buttons to it (so the helper can't silently become dead code).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { missionBackLabel, MISSION_BACK_LABELS } from "../uiLabels.js";

let failures = 0;
function check(label, cond) {
  if (cond) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures++;
    console.error(`  \u2717 ${label}`);
  }
}

console.log("Context-aware back-button label test (#34)\n");

console.log("Runtime label behavior:");
// Default (Mission 1 dashboard) wording.
check('default + launchedFromOC -> "Operations Center"',
  missionBackLabel(true) === MISSION_BACK_LABELS.default.operationsCenter);
check('default + not launchedFromOC -> "Module Overview"',
  missionBackLabel(false) === MISSION_BACK_LABELS.default.moduleOverview);
// Compact (Mission 2/3 overview) wording.
check('compact + launchedFromOC -> compact "Operations Center"',
  missionBackLabel(true, { compact: true }) === MISSION_BACK_LABELS.compact.operationsCenter);
check('compact + not launchedFromOC -> compact "Back to Module Overview"',
  missionBackLabel(false, { compact: true }) === MISSION_BACK_LABELS.compact.moduleOverview);

// The label is genuinely context-aware: the two branches differ.
check("default label differs by launch context",
  missionBackLabel(true) !== missionBackLabel(false));
check("compact label differs by launch context",
  missionBackLabel(true, { compact: true }) !== missionBackLabel(false, { compact: true }));

// Every label is a back action (leading "←") and uses the expected wording.
const allLabels = [
  MISSION_BACK_LABELS.default.operationsCenter,
  MISSION_BACK_LABELS.default.moduleOverview,
  MISSION_BACK_LABELS.compact.operationsCenter,
  MISSION_BACK_LABELS.compact.moduleOverview,
];
check("every label begins with the back arrow",
  allLabels.every((l) => l.startsWith("\u2190")));
check("OC-context labels mention Operations Center",
  missionBackLabel(true).includes("Operations Center") &&
    missionBackLabel(true, { compact: true }).includes("Operations Center"));
check("overview-context labels mention Module Overview",
  missionBackLabel(false).includes("Module Overview") &&
    missionBackLabel(false, { compact: true }).includes("Module Overview"));

console.log("\nWiring in script.js:");
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "script.js"), "utf8");
check("script.js imports missionBackLabel from uiLabels.js",
  /import\s*\{[^}]*\bmissionBackLabel\b[^}]*\}\s*from\s*["']\/?(?:\.\/)?uiLabels\.js["']/.test(src));
for (const varName of ["backBtn", "m2OverviewBackBtn", "m3OverviewBackBtn"]) {
  check(`${varName}.textContent is set via missionBackLabel(launchedFromOC...)`,
    new RegExp(`${varName}\\.textContent\\s*=\\s*missionBackLabel\\(\\s*launchedFromOC`).test(src));
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("PASSED: context-aware back-button label test.");
