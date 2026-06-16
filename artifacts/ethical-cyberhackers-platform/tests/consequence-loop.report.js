/**
 * consequence-loop.report.js — emit the Consequence Emotion Loop playtest report
 * (Task #121) as a single deterministic JSON file.
 *
 *     node tests/consequence-loop.report.js
 *
 * Uses the SAME report builder + invariant audit as the test, so the committed
 * report and the green test never diverge. Writes the JSON to
 * docs/CONSEQUENCE_LOOP_PLAYTEST.json and prints it to stdout.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  buildPlaytestReport,
  collectPlayerStrings,
  auditInvariants,
} from "./consequence-loop.harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ART = join(HERE, "..");

const careerSrc = readFileSync(join(ART, "career-sim.js"), "utf8");
const coreSrc = readFileSync(join(ART, "consequence-core.js"), "utf8");

const base = buildPlaytestReport({ now: 0 });
const invariants = auditInvariants({
  careerSrc,
  coreSrc,
  playerStrings: collectPlayerStrings(base),
});
const report = buildPlaytestReport({ now: 0, invariants });

const out = join(ART, "docs", "CONSEQUENCE_LOOP_PLAYTEST.json");
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.error(`\nWrote ${out} — verdict: ${report.verdict}`);
