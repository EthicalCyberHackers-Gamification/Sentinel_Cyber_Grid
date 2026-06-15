/**
 * Hint-leak guard for the Progressive Lab datasets.
 *
 * Runnable directly with node (runTest is disabled this session):
 *     node tests/lab-hint-leak.test.js
 *
 * The lab teaches in escalating hint TIERS: the early tiers frame the sub-goal
 * and nudge the analyst toward it WITHOUT giving away the answer, and only the
 * FINAL tier reveals the literal runnable command (e.g. "Type `cat file.txt`").
 * If an author lets a runnable command slip into an earlier tier, beginners get
 * the answer for free. This scans every dataset's hint tiers and fails if any
 * non-final tier contains a literal runnable command.
 *
 * A "literal runnable command" is the exact text of a tool's `cmd` (the thing the
 * terminal actually runs), matched as a standalone token so prose like "the
 * ports it reached" or words like "tools" never false-trigger.
 */

import LAB_M0 from "../lab.missions/mission-000.js";
import LAB_M0B from "../lab.missions/mission-000b.js";
import LAB_M3 from "../lab.missions/mission-003.js";
import LAB_M4 from "../lab.missions/mission-004.js";
import LAB_M5 from "../lab.missions/mission-005.js";
import LAB_M6 from "../lab.missions/mission-006.js";

const DATASETS = [
  ["mission-000", LAB_M0],
  ["mission-000b", LAB_M0B],
  ["mission-003", LAB_M3],
  ["mission-004", LAB_M4],
  ["mission-005", LAB_M5],
  ["mission-006", LAB_M6],
];

let failures = 0;
function check(name, cond) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.error(`  FAIL ${name}`);
  }
}

// Commands the lab engine accepts globally but that a dataset does not always
// declare as a tool `cmd` (e.g. pinning is a board action AND a typed command).
// They are runnable, so a hint that reveals them early is still a leak.
const ENGINE_GLOBAL_CMDS = ["pin all"];

// Recursively collect every `cmd` string value (tool/step defs) in a dataset.
function collectCmds(node, out) {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => collectCmds(n, out));
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "cmd" && typeof v === "string" && v.trim()) out.add(v.trim());
    else collectCmds(v, out);
  }
  return out;
}

// Recursively collect every `tiers` array (the escalating hint sequences).
function collectTierArrays(node, out, path = "") {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((n, i) => collectTierArrays(n, out, `${path}[${i}]`));
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === "tiers" && Array.isArray(v) && v.every((t) => typeof t === "string")) {
      out.push({ path: path || "(root)", tiers: v });
    } else {
      collectTierArrays(v, out, path ? `${path}.${k}` : k);
    }
  }
  return out;
}

// A tier "reveals" a runnable command when it shows that command BACKTICK-WRAPPED
// — the dataset convention for "this is the exact thing you type" (every real
// reveal in the data is written as "Type `cmd`"). Descriptive prose that merely
// names an action ("then raise monitoring") is guidance, not a reveal, and must
// NOT be flagged. `cmdsLower` is a Set of lowercased runnable command strings.
function revealedCommand(text, cmdsLower) {
  const snippets = [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1].trim().toLowerCase());
  for (const snip of snippets) {
    if (cmdsLower.has(snip)) return snip;
  }
  return null;
}

// Detector self-test (guards the guard): a backticked command must be caught,
// while descriptive prose and backticked non-commands must not be.
console.log("revealedCommand detector");
{
  const cmds = new Set(["ls", "cat network_snapshot.txt", "grep 203.0.113.77 access.log", "raise monitoring"]);
  check("backticked command is detected", revealedCommand("Type `ls` to list the files.", cmds) === "ls");
  check("descriptive prose is NOT flagged",
    revealedCommand("Then block the source and raise monitoring.", cmds) === null);
  check("backticked non-command (IP/filename) is NOT flagged",
    revealedCommand("Look for `203.0.113.77` in the log.", cmds) === null);
  check("first of several backticked commands is detected",
    revealedCommand("Type `ls`, then `cat network_snapshot.txt`.", cmds) === "ls");
}

let totalTierSeqs = 0;
for (const [id, def] of DATASETS) {
  console.log(`hint tiers — ${id}`);
  const cmds = collectCmds(def, new Set());
  ENGINE_GLOBAL_CMDS.forEach((c) => cmds.add(c));
  check(`${id} declares runnable commands`, cmds.size > 0);
  const cmdsLower = new Set([...cmds].map((c) => c.toLowerCase()));

  const seqs = collectTierArrays(def, []);
  check(`${id} has tiered hints`, seqs.length > 0);
  totalTierSeqs += seqs.length;

  for (const { path, tiers } of seqs) {
    if (tiers.length < 2) continue; // single-tier hints can't leak "early"
    const last = tiers.length - 1;
    for (let i = 0; i < last; i++) {
      const leak = revealedCommand(tiers[i], cmdsLower);
      check(`${id} ${path} tier ${i}/${last} hides the command`,
        leak === null);
      if (leak !== null) {
        console.error(`       leaked "${leak}" in: ${JSON.stringify(tiers[i])}`);
      }
    }
    // Sanity: the final tier of a multi-tier hint should reveal the command.
    check(`${id} ${path} final tier reveals a command`,
      revealedCommand(tiers[last], cmdsLower) !== null);
  }
}

check("scanned multiple tier sequences", totalTierSeqs >= 5);

if (failures) {
  console.error(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nAll hint-leak checks passed.");
