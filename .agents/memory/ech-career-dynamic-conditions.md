---
name: Career-sim dynamic conditions (carry-flag consumption)
description: How later career-sim missions consume prior-mission carry-flags to change evidence/brief/outcome, and the gotchas that break it.
---

# Career-sim dynamic conditions

Career-sim missions (`career-sim.js`) can let EARLIER missions' carry-flags
(`CAREER.missionFlags`, set via `setMissionFlag`) visibly reshape a LATER
mission. The pure, non-mutating logic lives in `career-dynamic.js`
(`evalFlagExpr`/`activeConditions`/`buildEffectiveDef`/`dynamicDeltaMods`/
`mergeDeltas`/`continuityLines`/`outcomeNotes`). A mission opts in with a
`dynamicConditions: [...]` array on its def.

## The rules that keep it correct

- **Compute once on open, never mutate the canonical def.** `openCareerMission`
  sets `SIM.dynamic = activeConditions(def.dynamicConditions, flags)` then
  `SIM.def = buildEffectiveDef(def, SIM.dynamic)` (new arrays, merge-by-id,
  dedupe). All consumers read `SIM.def`/`SIM.dynamic`, defaulting to `[]`.
  **Why:** the def objects are module-level singletons; mutating them would leak
  one playthrough's dynamic state into the next.

- **deltaMods are applied POST-HOC, not inside the outcome computation.** Both
  decision sites fold them the same way:
  `applyResourceDeltas(mergeDeltas(deltas, dynamicDeltaMods(SIM.dynamic)))` — in
  `chooseAction` AND `submitRecommendation`. Both guard `SIM.stage === 'report'`
  so a decision is recorded exactly once.
  **Why:** keeping deltaMods out of `computeRecommendationOutcome` leaves the
  completeness/verdict scoring clean and makes the carry-flag effect a separate,
  testable layer.

- **Every condition that `addEvidence` MUST also `addCommands` the command that
  reveals it**, or 100% completion becomes unreachable once that condition is
  active (effective total weight rises but nothing can surface the new item).

## Gotcha: a `reveals: [id]` with no evidence definition silently no-ops

A terminal command whose `reveals` lists an evidence id that has **no matching
entry in the mission's `evidence: []`** still prints its output and reads as
"useful", but adds **zero** panel evidence and zero confidence. No error, no
console warning. **How to apply:** when auditing a career-sim mission, cross-check
every `reveals:` id (base AND dynamic `addEvidence`) against an actual evidence
def. This bit M4 (`cat_incident_notes` → `ev_incident_notes` had no def).
