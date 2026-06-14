/**
 * Campaign-continuity pure-function tests ("the company remembers", M1–M4 arc).
 *
 * Runnable directly with node (runTest is disabled):
 *     node tests/career-dynamic.campaign.test.js
 *
 * Covers the three DOM-free helpers added to career-dynamic.js that drive the
 * adaptive supervisor memory + company timeline:
 *   - supervisorMemoryLines(rules, flags)
 *   - upsertCompanyHistory(history, entry)
 *   - companyTimeline(history, currentMissionId, order)
 * These are pure (no DOM, no storage), so they test at runtime without a browser.
 */

import {
  supervisorMemoryLines,
  upsertCompanyHistory,
  companyTimeline,
  promotionDecision,
  PROMOTION_STANDING_MIN,
  CAMPAIGN_PROMOTION_FROM_ROLE,
} from "../career-dynamic.js";

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

console.log("supervisorMemoryLines");
{
  // No rules / no flags → nothing (Mission 1 has no supervisorMemory → empty).
  check("undefined rules → []", supervisorMemoryLines(undefined, {}).length === 0);
  check("non-array rules → []", supervisorMemoryLines({}, { a: true }).length === 0);
  check("rules but empty flags still evaluate (allOf gate fails)",
    supervisorMemoryLines([{ when: { allOf: ["x"] }, text: "hi" }], {}).length === 0);

  const rules = [
    { when: { allOf: ["good"] }, tone: "good", text: "Nice catch." },
    { when: { allOf: ["bad"] }, tone: "bad", text: "Clean it up." },
    { when: { allOf: ["warn"], noneOf: ["good"] }, tone: "warn", text: "Careful." },
    { when: null, text: "Always." }, // no gate → always fires; default tone
    { when: { allOf: ["good"] }, tone: "good" }, // no text → filtered out
  ];

  const onlyGood = supervisorMemoryLines(rules, { good: true });
  check("allOf match emits", onlyGood.some(l => l.text === "Nice catch."));
  check("non-matching gate suppressed", !onlyGood.some(l => l.text === "Clean it up."));
  check("noneOf blocks when excluded flag present",
    !onlyGood.some(l => l.text === "Careful."));
  check("ungated rule always fires", onlyGood.some(l => l.text === "Always."));
  check("text-less rule filtered out", onlyGood.length === 2); // "Nice catch." + "Always."
  check("default tone is neutral", onlyGood.find(l => l.text === "Always.").tone === "neutral");
  check("explicit tone preserved", onlyGood.find(l => l.text === "Nice catch.").tone === "good");

  const warnCase = supervisorMemoryLines(rules, { warn: true });
  check("warn fires when good absent", warnCase.some(l => l.text === "Careful."));

  // Order is preserved.
  const ordered = supervisorMemoryLines(
    [{ text: "A" }, { text: "B" }, { text: "C" }], {});
  check("order preserved", ordered.map(l => l.text).join("") === "ABC");
}

console.log("upsertCompanyHistory");
{
  const e1 = { missionId: "mission-001", title: "One" };
  const h1 = upsertCompanyHistory(undefined, e1);
  check("absent history → new object with entry", h1["mission-001"] === e1);

  const e2 = { missionId: "mission-002", title: "Two" };
  const h2 = upsertCompanyHistory(h1, e2);
  check("adds a second mission", Object.keys(h2).length === 2);
  check("returns NEW object (input not mutated)", Object.keys(h1).length === 1);

  // Idempotent: re-completing replaces, never duplicates.
  const e1b = { missionId: "mission-001", title: "One (replay)" };
  const h3 = upsertCompanyHistory(h2, e1b);
  check("idempotent by missionId — still 2 keys", Object.keys(h3).length === 2);
  check("entry replaced, not appended", h3["mission-001"].title === "One (replay)");

  // Entry without a missionId is ignored.
  const h4 = upsertCompanyHistory(h3, { title: "no id" });
  check("entry without missionId ignored", Object.keys(h4).length === 2);
}

console.log("companyTimeline");
{
  const history = {
    "mission-001": { missionId: "mission-001" },
    "mission-002": { missionId: "mission-002" },
    "mission-004": { missionId: "mission-004" },
  };
  const order = ["mission-001", "mission-002", "mission-003", "mission-004"];

  const tl = companyTimeline(history, "mission-004", order);
  check("excludes the current mission", !tl.some(t => t.missionId === "mission-004"));
  check("only includes missions present in history", tl.length === 2);
  check("respects explicit order",
    tl.map(t => t.missionId).join(",") === "mission-001,mission-002");

  const all = companyTimeline(history, "mission-003", order);
  check("includes all prior when current not in history", all.length === 3);

  // Fallback: no order → sorted keys.
  const sorted = companyTimeline(history, "mission-002", null);
  check("fallback to sorted keys excludes current",
    sorted.map(t => t.missionId).join(",") === "mission-001,mission-004");

  check("empty history → []", companyTimeline(undefined, "mission-001", order).length === 0);
}

console.log("promotionDecision");
{
  const INTERN = CAMPAIGN_PROMOTION_FROM_ROLE; // 'cybersecurity_intern'
  const NEXT = "junior_soc_analyst";

  check("threshold export is the top standing min",
    PROMOTION_STANDING_MIN >= 0.8 && PROMOTION_STANDING_MIN <= 1);

  // Earns the promotion at / above the top-standing threshold.
  const earned = promotionDecision({ currentRoleId: INTERN, average: PROMOTION_STANDING_MIN, nextRoleId: NEXT });
  check("intern AT threshold promotes", earned.promoted === true && earned.toRoleId === NEXT);
  check("promotion reports fromRoleId intern", earned.fromRoleId === INTERN);
  check("earned reason", earned.reason === "earned");

  const above = promotionDecision({ currentRoleId: INTERN, average: 0.99, nextRoleId: NEXT });
  check("intern WELL above threshold promotes", above.promoted === true);

  // Just below threshold → no promotion, role unchanged.
  const below = promotionDecision({ currentRoleId: INTERN, average: PROMOTION_STANDING_MIN - 0.001, nextRoleId: NEXT });
  check("intern below threshold stays intern", below.promoted === false && below.toRoleId === INTERN);
  check("below-threshold reason", below.reason === "below-threshold");

  // Sticky / idempotent: an already-promoted analyst never re-promotes or demotes.
  const replay = promotionDecision({ currentRoleId: NEXT, average: 0.99, nextRoleId: "soc_analyst" });
  check("already-promoted is sticky (no promotion)", replay.promoted === false && replay.alreadyEarned === true);
  check("already-promoted keeps current role", replay.fromRoleId === NEXT && replay.toRoleId === NEXT);

  // No next role on the ladder → cannot promote (top of ladder).
  const noNext = promotionDecision({ currentRoleId: INTERN, average: 1, nextRoleId: null });
  check("no next role → no promotion", noNext.promoted === false && noNext.reason === "no-next-role");

  // Defensive: missing / garbage inputs default to Intern, never promote.
  const empty = promotionDecision();
  check("no args → no promotion, not already-earned", empty.promoted === false && empty.alreadyEarned === false);
  const nanAvg = promotionDecision({ currentRoleId: INTERN, average: "x", nextRoleId: NEXT });
  check("NaN average treated as 0 → no promotion", nanAvg.promoted === false);
}

if (failures) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
console.log("\nAll campaign-continuity checks passed.");
