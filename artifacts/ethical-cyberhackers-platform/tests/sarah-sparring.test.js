/**
 * sarah-sparring.test.js — "Sarah Reyes as Sparring Partner" playtest assertions
 * (Task #124). Runnable directly with node (runTest is disabled):
 *     node tests/sarah-sparring.test.js
 *
 * Drives all five surfaces across all four missions through the real extracted
 * core logic (sarah-sparring-core.js) via the harness, computes the scoped
 * invariant audit from the live source text, asserts every expectation and both
 * invariants, and exits non-zero on any failure. The full deterministic JSON
 * report is assembled here (the report file is generated separately by
 * tests/sarah-sparring.report.js from the same builder).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildPlaytestReport, collectPlayerStrings, auditInvariants } from "./sarah-sparring.harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ART = join(HERE, "..");

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// Compute the invariant audit from the actual source files.
const careerSrc = readFileSync(join(ART, "career-sim.js"), "utf8");
const coreSrc = readFileSync(join(ART, "sarah-sparring-core.js"), "utf8");

// Build once, fold in the invariants computed from source text, rebuild.
const base = buildPlaytestReport({});
const playerStrings = collectPlayerStrings(base);
const invariants = auditInvariants({ careerSrc, coreSrc, playerStrings });
const report = buildPlaytestReport({ invariants });

console.log("(1) Analyst's Bet 2.0 — disconfirming-evidence sparring");
report.bets.forEach((b) => {
  check(`${b.missionId}: exactly one strong falsification test`, b.oneStrongTest);
  check(`${b.missionId}: every tagged strength resolves faithfully`, b.strengthsResolveFaithfully);
  check(`${b.missionId}: the strong pick unlocks a read-only spotlight`, b.strongHasSpotlight);
  check(`${b.missionId}: every pick earns coaching`, b.everyPickCoaches);
  check(`${b.missionId}: an unknown hypothesis id resolves safely`, b.unknownIsSafe);
});

console.log("(2) Confidence calibration check + later callback");
report.calibration.forEach((c) => {
  check(`${c.missionId}: every level + short rationale is a valid commit`, c.allLevelsValid);
  check(`${c.missionId}: bad level / empty / whitespace / overlong rationale all rejected`, c.allInvalidRejected);
  check(`${c.missionId}: callback stays empty until the calibration is committed`, c.callback.beforeCommitEmpty);
  check(`${c.missionId}: callback quotes the player's own rationale + level back`, c.callback.quotesRationale && c.callback.quotesLabel);
  check(`${c.missionId}: callback ASKS (ends with '?'), never tells a verdict`, c.callback.asksNotTells);
});

console.log("(3) Two-voice stakeholder moment");
report.twoVoice.forEach((t) => {
  check(`${t.missionId}: both stakeholder ids are valid picks`, t.bothValid);
  check(`${t.missionId}: junk / null choice is rejected`, t.junkRejected);
  check(`${t.missionId}: reconciliation is choice-INDEPENDENT (no right voice)`, t.choiceIndependent);
});

console.log("(4) Mentor trails — 'what I'd check next'");
report.trails.forEach((t) => {
  check(`${t.missionId}: trails arm only on their emitOn thread`, t.allArmFaithfully);
  check(`${t.missionId}: trails surface only when pattern visible AND target accessible`, t.allGatedOnVisibleAndAccessible);
  check(`${t.missionId}: every trail action is a valid read-only navigation`, t.allActionsValid);
  check(`${t.missionId}: a bogus action is rejected`, t.bogusActionRejected);
});

console.log("(5) End-of-mission performance mirror + perk");
report.mirror.forEach((m) => {
  check(`${m.label}: exactly one strength + one nudge`, m.oneStrengthOneNudge);
  check(`${m.label}: reinforced strength matches posture (${m.strengthId})`, m.strengthMatches);
  check(`${m.label}: improvement nudge matches posture (${m.nudgeId})`, m.nudgeMatches);
  check(`${m.label}: perk presence matches the nudge`, m.perkMatches);
  check(`${m.label}: recap is deterministic for the same posture`, m.deterministic);
  check(`${m.label}: recap ignores an injected score (posture-only, never a grade)`, m.ignoresScore);
});
{
  const strengthsSeen = new Set(report.mirror.map((m) => m.strengthId));
  const nudgesSeen = new Set(report.mirror.map((m) => m.nudgeId));
  check("mirror profiles sweep all five reinforced strengths", strengthsSeen.size === report.references.strengths.length);
  check("mirror profiles sweep all four improvement nudges", nudgesSeen.size === report.references.nudges.length);
}

console.log("Coverage");
{
  check("all four missions exercised", report.references.missionsCovered.length === 4);
  check("every covered mission has authored Sarah content", report.references.missionsCovered.every((m) => report.references.contentMissions.includes(m)));
}

console.log("Invariants (scoped)");
{
  const i = report.invariants;
  check("no grade chrome / verdict words in any sparring player-facing output", i.noGradeChromeInSparringLayer.pass);
  check("audited a non-trivial number of generated strings", i.noGradeChromeInSparringLayer.checkedStrings >= 30);
  check("sarah-sparring-core.js is pure (no DOM/storage/window/grading)", i.presentationOnlyNoNewWrites.sparringCoreIsPure);
  check("sparring-layer slice located in career-sim.js", i.presentationOnlyNoNewWrites.sparringLayerSliceFound);
  check("sparring layer never calls the graded judgment writer", i.presentationOnlyNoNewWrites.sparringCallsGradedWriter === false);
  check("sparring layer never writes localStorage directly", i.presentationOnlyNoNewWrites.sparringWritesLocalStorageDirectly === false);
  check("sparring layer adds NO new saveCareerState (perk is session-scoped)", i.presentationOnlyNoNewWrites.sparringPersistsViaSaveCareerState === false);
  check("perk is a session-scoped module var, never serialized", i.presentationOnlyNoNewWrites.perkIsSessionScopedVar && i.presentationOnlyNoNewWrites.perkNeverPersisted);
  check("sparring layer never stacks confidence (no confSpend/activateScopeSnapshot/BET_STAKE)", i.presentationOnlyNoNewWrites.sparringStacksConfidence === false);
  check("performance mirror reads POSTURE only — no keyed-correctness helper in the sparring layer", i.presentationOnlyNoNewWrites.sparringReadsCorrectness === false);
  check("the sole graded judgment writer still exists", i.presentationOnlyNoNewWrites.gradedJudgmentWriterStillExists);
  check("mentor trails arm inside setDiscoveryJudgment (best-effort try/catch)", i.presentationOnlyNoNewWrites.trailArmWiredInGradedWriter);
  check("presentation-only invariant overall pass", i.presentationOnlyNoNewWrites.pass);
}

console.log("Verdict");
{
  check("Analyst Bet verdict PASS", report.verdictBreakdown.analystBet === "PASS");
  check("Calibration verdict PASS", report.verdictBreakdown.calibration === "PASS");
  check("Two-voice verdict PASS", report.verdictBreakdown.twoVoice === "PASS");
  check("Mentor trails verdict PASS", report.verdictBreakdown.mentorTrails === "PASS");
  check("Performance mirror verdict PASS", report.verdictBreakdown.performanceMirror === "PASS");
  check("Invariants verdict PASS", report.verdictBreakdown.invariants === "PASS");
  check("overall verdict PASS", report.verdict === "PASS");
}

if (failures) {
  console.error(`\n${failures} sarah-sparring check(s) failed.`);
  process.exit(1);
}
console.log("\nAll sarah-sparring playtest checks passed.");
