---
name: Progressive Lab dataset schema & router (missions 003-006)
description: How to author a terminal "Progressive Lab" mission dataset, the engine invariants that break at runtime if violated, and how to verify without driving the gated terminal.
---

The Progressive Lab is the 5-stage Linux-SOC terminal experience. Mission 001/002
are authored inline in `lab.js`; 003+ each live as a SEPARATE ES module
`lab.missions/mission-00N.js` (`export default {...}`) imported into `lab.js` and
spread into `LAB_MISSIONS`. `LAB_MISSION_IDS = Object.keys(LAB_MISSIONS)`, and
`launchMissionFromMap` routes any id in that set to `openLab()` — so registering a
dataset is all that's needed to make the map launch it as a lab.

**Adding a mission:** create the dataset module, add one `import` + one
`'mission-00N': LAB_Mn` entry in `lab.js`, and (for host completion/XP) a branch in
`notifyLabComplete` (script.js). Keep separate files so parallel authoring has zero
edit conflicts.

**Engine invariants (violating any = runtime break, NOT a typecheck error — the
root game JS is outside tsconfig's `src/**`, so `node --check` + the validator are
the real gate):**
- The runner routes a typed command by its **FIRST WORD ONLY** via `verb[firstWord]
  -> tool.key`. **No two tools may share a cmd first word.** There is no `verbArg`
  field. Reserved first words handled by the engine (don't put in `verb`):
  `ls cat less grep pin hint help clear`; stage-1 tools are exactly `ls/cat/grep`.
- Every `run.discover` / `onCat[file].discover` / `grepAha.discover` must be an `ind`
  key. Every `run.addNode` / `contain[k].nodes` key / `seedNode` / `topo.links` a&b
  must be a `topo.nodes` key.
- `contain` keys and `containRequired[]` must be tool keys; `contain[k].need` an `ind`
  key. `files[].name` must each have an `fs` entry. hintFlow-referenced hint ids must
  exist in `hints`. `stage2.group` and `stage4.group` each need ≥3 indicators.
- Keep `containRequired` to the same count across siblings (003/004/006 use 3) and
  make the stage-5 OBJECTIVE copy match exactly what's required — an objective that
  lists an action not in `containRequired` reads as a required step but doesn't gate
  (the 005 "raise monitoring" mismatch).

**A benign-outcome mission (006 triage)** still uses the same schema: no hostile
node types, no `danger:true` links, stage-5 framed as "disposition" (confirm/log/
monitor) not "containment", `reveal.*` measured. The win is proportionate response.

**Verification (can't drive the terminal):** `canOpen` gates `?lab=mission-00N` on
`studentName` set AND `missionMapStatus(id)!=="locked"`, so from fresh state 003+ are
locked and screenshots can't reach the terminal. Verify datasets structurally with a
node script that imports each dataset and checks every invariant above (the project
kept one at `/tmp/validate_lab.mjs`), plus `node --check` and `pnpm ... typecheck`.
