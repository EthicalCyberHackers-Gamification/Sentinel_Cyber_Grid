/**
 * consequence-loop.test.js — Consequence Emotion Loop playtest assertions
 * (Task #121). Runnable directly with node (runTest is disabled):
 *     node tests/consequence-loop.test.js
 *
 * Drives BOTH paths through the real extracted consequence logic
 * (consequence-core.js) via the harness, computes the scoped invariant audit
 * from the live source text, asserts every Path A / Path B expectation and both
 * invariants, and exits non-zero on any failure. The full deterministic JSON
 * report is assembled here and printed (the report file is generated separately
 * by tests/consequence-loop.report.js from the same builder).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildPlaytestReport,
  collectPlayerStrings,
  auditInvariants,
} from "./consequence-loop.harness.js";
import { CONSEQUENCE_POSTURE } from "../consequence-core.js";

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
const coreSrc = readFileSync(join(ART, "consequence-core.js"), "utf8");

// Build once with a fixed `now` for determinism, then re-fold the invariants in.
const base = buildPlaytestReport({ now: 0 });
const playerStrings = collectPlayerStrings(base);
const invariants = auditInvariants({ careerSrc, coreSrc, playerStrings });
const report = buildPlaytestReport({ now: 0, invariants });

const A = report.paths.overescalation;
const B = report.paths.underescalation;

console.log("Path A — over-escalation -> Operational Friction (mission-004)");
{
  const ofVals = A.decisions.map((d) => d.dialAfter.of);
  check("dials tick up 1 -> 2 -> 3 (clamped) on containment calls", ofVals.join(",") === "1,2,3,3");
  check("Latent Exposure never moves on Path A", A.finalDials.le === 0);
  check("one toast per moved dial (3 ticks, then none at pinned 3/3)", A.counters.dialToToastEvents === 3);
  check(
    "each toast reads as an in-world ripple (no grade words)",
    A.decisions.every((d) => d.toasts.every((t) => /Operational Friction ↑ \d\/3/.test(t.title))),
  );
  check("OF micro-tradeoff fires (band 'of', triggered)", A.tradeoff.band === "of" && A.tradeoff.triggered);
  check("OF tradeoff never blocks RETURN / hides evidence", A.tradeoff.blocksReturn === false && A.tradeoff.hidesEvidence === false);
  check("scar recorded when OF peaks at 3/3", A.scar.recorded === true && A.scar.dial === "of");
  check("scar is dept-tagged (Forensics on mission-004)", A.scar.dept === "Forensics");
  check("scar is idempotent (replay does not duplicate)", A.scar.idempotent === true);
  check("exactly one dial peak across the path", A.counters.dialPeaks === 1);
  check("trailing pinned-dial call adds no tick", A.decisions[3].toasts.length === 0 && A.decisions[3].scarAtThisStep === false);
  check("next-session postcard is friction-band, Forensics", A.nextSessionPostcard.kind === "of" && A.nextSessionPostcard.dept === "Forensics");
  check("postcards surface once each and the queue drains (no re-show)", A.nextSessionPostcard.showOnce === true && A.nextSessionPostcard.anyRepeated === false && A.nextSessionPostcard.texts.length >= 1);
}

console.log("Path B — under-escalation -> Latent Exposure (mission-002)");
{
  const leVals = B.decisions.map((d) => d.dialAfter.le);
  check("LE dial ticks up on deferrals 1 -> 3 (clamped)", leVals.join(",") === "1,3,3");
  check("Operational Friction never moves on Path B", B.finalDials.of === 0);
  check("one toast per moved dial (2 ticks, then none at pinned 3/3)", B.counters.dialToToastEvents === 2);
  check(
    "each toast reads as an in-world ripple (no grade words)",
    B.decisions.every((d) => d.toasts.every((t) => /Latent Exposure ↑ \d\/3/.test(t.title))),
  );
  check("LE micro-tradeoff fires (band 'le', triggered)", B.tradeoff.band === "le" && B.tradeoff.triggered);
  check("LE tradeoff defers a convenience summary, full evidence reachable", B.tradeoff.hidesEvidence === false && /evidence/i.test(B.tradeoff.behavior));
  check("LE tradeoff never blocks RETURN", B.tradeoff.blocksReturn === false);
  check("scar recorded when LE peaks at 3/3", B.scar.recorded === true && B.scar.dial === "le");
  check("scar is dept-tagged (Network Ops on mission-002)", B.scar.dept === "Network Ops");
  check("scar is idempotent (replay does not duplicate)", B.scar.idempotent === true);
  check("exactly one dial peak across the path", B.counters.dialPeaks === 1);
  check("trailing pinned-dial call adds no tick", B.decisions[2].toasts.length === 0 && B.decisions[2].scarAtThisStep === false);
  check("next-session postcard is exposure-band, Network Ops", B.nextSessionPostcard.kind === "le" && B.nextSessionPostcard.dept === "Network Ops");
  check("postcards surface once each and the queue drains (no re-show)", B.nextSessionPostcard.showOnce === true && B.nextSessionPostcard.anyRepeated === false && B.nextSessionPostcard.texts.length >= 1);
}

console.log("Single-decision extreme calls (realistic one-recommendation flow)");
{
  report.singleDecisionPeaks.cases.forEach((c) => {
    check(
      `'${c.decisionId}' peaks ${c.dial.toUpperCase()} in ONE decision (-> scar, ${c.expectDept})`,
      c.peaksInOneDecision === true && c.scarRecorded === true && c.scarDept === c.expectDept,
    );
  });
}

console.log("Always-on reaction coverage (Task #122)");
{
  const cov = report.everyDecisionReacts;
  check("every routed decision id yields a visible cue (no silent decision)", cov.everyDecisionHasCue === true);
  check("both cue kinds occur (moved-dial ripple toasts AND calm measured-call toasts)", cov.bothCueKindsOccur === true);
  check("a non-trivial number of decisions covered", cov.total >= 20);
  check("at least one calm {0,0} decision exists (the always-on calm cue genuinely fires)", cov.calmCues >= 1);
  // Orphan guard: every PRIMARY mission action id (the `id` + `type` action
  // objects the player picks) has a posture entry, so the live action surface
  // never silently relies on the keyword fallback.
  const actionIds = [...careerSrc.matchAll(/id:\s*'([a-z_]+)',\s*\n\s*type:\s*'(?:direct|recommendation)'/g)].map((m) => m[1]);
  const uniqueActionIds = [...new Set(actionIds)];
  const orphans = uniqueActionIds.filter((id) => !(id in CONSEQUENCE_POSTURE));
  check("mission action ids extracted from source", uniqueActionIds.length >= 15);
  check(`no mission action id is missing a posture entry (orphans: ${orphans.join(", ") || "none"})`, orphans.length === 0);
}

console.log("Saturated-dial cue (posture, not movement)");
{
  const sat = report.saturatedDialCues;
  check("saturated-dial cases were exercised", sat.cases.length >= 2);
  check("a forceful call at a capped dial is NOT misclassified as calm", sat.noneMisclassifiedAsCalm === true);
  sat.cases.forEach((c) => {
    check(`'${c.decisionId}' at ${JSON.stringify(c.baseline)} fires the sustained cue, not calm`, c.cue === "sustained-toast");
  });
}

console.log("Invariants (scoped)");
{
  const i = report.invariants;
  check("no grade chrome in the consequence layer's player-facing output", i.noGradeChromeInConsequenceLayer.pass);
  check("audited a non-trivial number of generated strings", i.noGradeChromeInConsequenceLayer.checkedStrings >= 10);
  check("consequence-core.js is pure (no DOM/storage/window/grading)", i.singleGradedWritePath.consequenceCoreIsPure);
  check("consequence-layer slice located in career-sim.js", i.singleGradedWritePath.consequenceLayerSliceFound);
  check("consequence layer never calls the graded judgment writer", i.singleGradedWritePath.consequenceCallsGradedWriter === false);
  check("consequence layer never writes localStorage directly", i.singleGradedWritePath.consequenceWritesLocalStorageDirectly === false);
  check("consequence layer persists ONLY via saveCareerState()", i.singleGradedWritePath.consequencePersistsViaSaveCareerState);
  check("the sole graded judgment writer still exists", i.singleGradedWritePath.gradedJudgmentWriterStillExists);
  check("single-graded-write invariant overall pass", i.singleGradedWritePath.pass);
}

console.log("Verdict");
{
  check("Path A verdict PASS", report.verdictBreakdown.pathA_overescalation === "PASS");
  check("Path B verdict PASS", report.verdictBreakdown.pathB_underescalation === "PASS");
  check("Single-decision peaks verdict PASS", report.verdictBreakdown.singleDecisionPeaks === "PASS");
  check("Every-decision-reacts verdict PASS (incl. saturated-dial guard)", report.verdictBreakdown.everyDecisionReacts === "PASS");
  check("Invariants verdict PASS", report.verdictBreakdown.invariants === "PASS");
  check("overall verdict PASS", report.verdict === "PASS");
}

if (failures) {
  console.error(`\n${failures} consequence-loop check(s) failed.`);
  process.exit(1);
}
console.log("\nAll consequence-loop playtest checks passed.");
