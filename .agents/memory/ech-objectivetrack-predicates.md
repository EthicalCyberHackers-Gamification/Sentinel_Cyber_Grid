---
name: career-sim objectiveTrack predicate grammar
description: progressive-objective doneBy uses PREFIXED predicates and fails closed; a bare evidence id silently never ticks
---

The progressive-objectives feature (`def.objectiveTrack` on career-sim missions) evaluates each
objective's `doneBy` through `objectivePredicateMet(pred)`, which splits on the FIRST colon and
only recognizes these predicate kinds:

- `ev:<evidenceId>`  — finding surfaced (`SIM.evidence.has`)
- `flag:<key>`       — `CAREER.missionFlags[key]`
- `challenge:<id>`   — a two-step discovery judgment fully answered
- `identify`         — `SIM.identified != null` (RECORDED, not "correct")
- `decision`         — `SIM.decision != null || SIM.stage === 'report'`

It FAILS CLOSED on any unknown kind.

**Gotcha:** a bare evidence id like `doneBy: ['ev_unknown_host']` parses as `kind='ev_unknown_host'`,
hits the default case, and the objective NEVER ticks (no error, no warning). Evidence ids are
conventionally named `ev_*`, so the correct predicate is doubled: `ev:ev_unknown_host`.

**Why:** this looks identical to a DIFFERENT, pre-existing system — recommendation choices'
`doneBy` (e.g. `['rogueDeviceContained']`) which DO use bare flag/evidence ids and are checked by
a separate code path. Both grammars coexist in the same file; never copy one's format into the other.
(Caught by an architect evaluate_task pass — all evidence objectives silently stayed at 0.)

**How to apply:** any new `objectiveTrack.doneBy` entry for an evidence reveal must use the `ev:`
prefix. Verify by opening the mission and surfacing the finding — the OBJECTIVES n/N count must advance.
