---
name: Consequence reactions key on posture, never correctness
description: Design invariants for ECH career-sim features that REACT to a player's decision (dials, postcards, scars, debrief texture) without leaking the graded answer or breaking the all-flags-off baseline.
---

# Decision-reaction features (career-sim)

Any feature that visibly reacts to the player's final decision (Company Health
dials, consequence postcards, scar notes, debrief micro-tradeoffs, future
"the org reacts" layers) must obey these or it leaks the answer / breaks
regressions:

## Rule 1 — react to POSTURE, never correctness
Map the **decision id** to an inherent operational posture (how disruptive /
how passive the action is), NOT to the verdict/keyed-correctness. A
decisive-but-correct containment must raise "friction" because it genuinely
disrupts ops; an under-reaction must raise "exposure" because it genuinely
leaves risk open. Correctness/verdict must NOT be an input.
**Why:** the judgment engine grades elsewhere; if a reactive surface keyed on
correctness, its color/copy would tell the player whether they were right —
leaking the answer. `setDiscoveryJudgment` stays the SOLE graded write; reactive
layers only READ the decision id (`actionId`/`recId`).
**How to apply:** author an explicit id→posture table plus a keyword fallback;
grep the table for any `verdict`/`outcome`/`correct` reference before shipping.

## Rule 2 — best-effort router must not break the decision OR the baseline
A side-effect router fired from the decision chokepoints
(`chooseAction`/`submitRecommendation`) must:
- be wrapped in try/catch so a fault can never block a real decision, and
- only call the persistence chokepoint (`saveCareerState`) when a PERSISTED
  field actually mutated.
**Why:** calling the save chokepoint unconditionally bumps `updatedAt`/enqueues
cloud sync even when a sub-feature is flag-off and wrote nothing — so
"all-flags-off plays identically" fails on storage bytes. Have writers return a
boolean and OR them into a `persistedChange` gate. Transient HUD state
(e.g. mission-scoped dials) lives on SIM and resets every `openCareerMission`,
so it never needs persistence at all.
**How to apply:** master + per-system flags via one `consequenceOn(sub)` gate
that fronts EVERY visible/persisted effect; cross-module UI (toasts) reaches the
host only through a `window.ech*` bridge, best-effort/no-op when absent.

## Rule 3 — playtest/unit-test this layer through the extracted pure core
The dial/postcard/scar/tradeoff math lives in `consequence-core.js` (pure,
DOM-free, mirrors `career-dynamic.js`); `career-sim.js` keeps thin SIM-bound
wrappers. Drive that core from node tests — interactive e2e is unavailable and
script.js/career-sim.js do DOM init on import.
**Why:** two framing traps make a "faithful" test wrong otherwise:
- *Multi-decision accumulation is a STRESS model, not real play.* A file-model
  mission submits ONE recommendation, so a single extreme call peaks its dial in
  one decision via clamp (e.g. `rec_companywide_lockdown` `{of:3}`,
  `ignore`/`downgrade`/`approve_release` `{le:3}`). Don't assume gradual 1→2→3
  reflects a real playthrough — assert the single-decision peak too.
- *Postcard "show-once" ≠ whole-queue-drain.* The home inbox surfaces TWO unshown
  cards per return (FIFO), marks them `shown` + persists, so a multi-decision run
  drips ~2 cards/decision across several returns. "Show-once" means no card
  re-surfaces and the queue eventually drains — model repeated home views, not one.
**How to apply:** see `tests/consequence-loop.{harness,test,report}.js` and the
`docs/CONSEQUENCE_LOOP_PLAYTEST.json` report builder.
