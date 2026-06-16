/**
 * sarah-sparring.report.js — emit the "Sarah Reyes as Sparring Partner" playtest
 * report (Task #124) as a single deterministic JSON file.
 *
 *     node tests/sarah-sparring.report.js
 *
 * Uses the SAME report builder + invariant audit as the test, so the committed
 * report and the green test never diverge. Writes the JSON to
 * docs/SARAH_SPARRING_PLAYTEST.json and prints it to stdout.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { buildPlaytestReport, collectPlayerStrings, auditInvariants } from "./sarah-sparring.harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ART = join(HERE, "..");

const careerSrc = readFileSync(join(ART, "career-sim.js"), "utf8");
const coreSrc = readFileSync(join(ART, "sarah-sparring-core.js"), "utf8");

const base = buildPlaytestReport({});
const invariants = auditInvariants({
  careerSrc,
  coreSrc,
  playerStrings: collectPlayerStrings(base),
});
const report = buildPlaytestReport({ invariants });

const out = join(ART, "docs", "SARAH_SPARRING_PLAYTEST.json");
writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify(report, null, 2));
console.error(`\nWrote ${out} — verdict: ${report.verdict}`);
