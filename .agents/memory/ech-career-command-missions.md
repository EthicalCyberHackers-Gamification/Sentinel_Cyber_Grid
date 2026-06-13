---
name: Career-sim command-model missions
description: How the ops-center-prototype career sim (sim.js) runs both file-model and command-model missions from one engine, plus map-node gating and command-routing invariants.
---

# Career-sim command-model missions (ops-center-prototype)

The career sim (`sim.js`, the four-panel "Career Operating Center" — distinct from
lab.js's Progressive Lab) runs TWO mission shapes from ONE engine, selected by
DATASET SHAPE, never by mission id:

- **File-model** (e.g. mission-001): has `def.files[]` → classification flow;
  report shows a CLASSIFICATION REVIEW; accuracy = classificationQuality(),
  thoroughness = allFilesRead().
- **Command-model** (e.g. mission-002/003): has `def.commands[]` + `def.identify{}`
  → terminal flow; report shows an IDENTIFICATION REVIEW; accuracy =
  (identified === correctId ? 1 : 0), thoroughness = coreCommandsRun().

**Why:** branch on the data (`simFiles().length` / `def.identify` / `def.commands`),
NEVER on a mission id, so adding command-model missions leaves M1's numeric outcome
path byte-identical.

## Command routing invariant
`findMissionCommand` does an EXACT normalized match across ALL `command.match[]`
aliases FIRST, then an arg-bearing space-prefix match
(`norm === alias || norm.startsWith(alias + ' ')`). Because exact wins first, a
short alias (e.g. `grep failed`) coexists with the full typed form
(`grep failed auth.log`) without misrouting. **When authoring a new command-model
dataset, never let one alias be a space-delimited prefix of another command's typed
form** (a trailing `/24` or `.log` with no space is safe).

## Map-node gating (oc.js)
Career nodes live in `CAREER_MISSION_MAP` and are routed in `launchWorkspace`
BEFORE the lock check and before lab/holotable routing (the same id can also exist
in lab.js, which would otherwise steal the launch). Gating is three layers:
1. `getMissionStates()` OR-reads `ocp.career.v1`.completedMissions (READ-ONLY via
   `readCareerCompleted()`) so a finished career mission unlocks the next node.
2. The disabled launch button (primary gate).
3. A defensive `getMissionStates()[activeNodeId] === 'locked'` early-return inside
   the career branch.

The `?career=<id>` deep-link in sim.js calls `openCareerMission` DIRECTLY and
INTENTIONALLY bypasses all of this for demos/testing — don't "fix" that.

## Terminal placeholder must track the command model
The `#simTermInput` placeholder is the most prominent "what do I type" cue. Its
static default ("try `ls`, then `cat <file>`") is wrong for command-model missions —
typing `ls` there returns "command not found", which reads as a broken terminal.
`openCareerMission` sets it per-mission via `simTermPlaceholder(def)`: command-model
missions suggest their first `core` (or first) command's `match[0]` (e.g.
`cat auth.log`, `ip addr`); file-model missions keep the ls/cat hint. **Any new
"what to type" hint must be derived from `def.commands`, never hard-coded.**

## `ls` / `pwd` are universal, non-scoring helpers
`ls`/`dir`/`pwd` are handled in the universal-verb block of `simRunCommand`
(alongside help/clear/decide), so they work in BOTH mission models and must NEVER
surface evidence or count toward `ranCommands`/thoroughness. `simCmdList()` routes
by model: file-model → original `simCmdLs()` (preserve byte-identical); command-model
→ `simCmdLsCommands()`, whose file list is DERIVED from the missions' command
aliases via `missionCommandFiles()` (regex keeps only tokens ending in an alpha
extension, so `192.168.1.57` / `192.168.1.0/24` are excluded). **Why derive, not
author:** the listing stays in sync with the commands automatically. `pwd` prints
the cwd parsed from `def.promptLabel` (`~` → `/home/intern`). Edge: a file that only
appears in a `grep ... file` alias (e.g. `network_notes.txt`) is listed by `ls` but
has no `cat <file>` command wired — acceptable.

## Carry-forward flags
Each mission declares `def.carryFlags:[{key,label}]`; flags persist in the shared
`CAREER.missionFlags` and `reportSectionHtml` shows only the active mission's
carryFlags that are set. `setFlags` on an action apply on any NON-Denied verdict
(binary, NOT verdict-granular). So never encode a flag meaning "leadership
approved" — an intern only *recommends* (e.g. M3 sets `mfaRecommended`, never an
"approved" flag), or it would record on a Deferred verdict too.
