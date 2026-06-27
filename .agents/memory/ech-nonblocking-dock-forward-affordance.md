---
name: Non-blocking dock relocations need a forward affordance
description: Why a recorded-but-no-progression dock beat reads as a dead-end, and the fix pattern.
---

When a graded/optional beat is relocated INTO the NON-BLOCKING Decision Dock
(determination chips for M2-4, classification for M1, finding-draft), recording a
pick gives the player no visible progression. The next control — the handling
actions — renders in a spatially-disconnected panel (`#simActions`, right column)
reachable only by typing `decide` in the terminal. Players pick a chip, see
nothing advance where they're looking, and report it as "clicking does nothing /
stuck" — even though the chip recorded correctly and `decide` works.

**Distinguishing this from a real dead chip:** the dock's "recorded" confirmation
only renders when the pick is stored, so if the screenshot shows it, the click
DID register — the defect is flow/affordance, not a dead handler or CSS
`pointer-events`. Don't chase the object-vs-id draft-key bug class here.

**Fix pattern:** render an in-dock forward CTA once the pick is recorded that
routes through the EXISTING reveal path (`simRevealActions`) and then
scrolls/focuses the off-screen panel; keep it non-blocking + re-committable (the
determination stays available until `stage === 'report'`, so chips can still
change at `stage === 'decision'`); gate everything on the per-mission config
(`determinationDock` + `identify`) so other missions stay byte-identical; add the
same `caseFileDecisionPending()` guard the action handlers use.

**Why:** a non-blocking dock beat that only records state feels broken; the
forward control must live where the player is interacting, not as a "type X"
instruction pointing at a disconnected panel.

**How to apply:** any future dock-relocated beat that does NOT itself unlock the
terminal needs an explicit in-dock forward control, not just terminal-command copy.

**Critical caveat — gate the CTA on investigation completeness, not on "pick recorded".**
The determination dock appears as soon as ONE evidence item is surfaced
(`activeDetermination()` only needs `SIM.evidence.size>0`), and the forward CTA
reveals the mission-ENDING handling actions. If you show the CTA the instant a pick
is recorded, players one-click straight to Escalate after reviewing ~1/11 evidence —
the mission "ends too early / feels broken". Gate the CTA on `investigationComplete()`
(file-model: all file evidence surfaced; command-model: all `core` commands run) —
the SAME predicate the auto-reveal path uses (`simRevealActions(false)` fires when
`coreCommandsRun()` flips), so the CTA lines up exactly with the intended action
reveal. When recorded-but-not-ready, show a muted hold note (`.sim-comms-hold`)
instead of the button; the pick stays recordable + re-committable throughout.
**Gating the CTA/copy is NOT enough — the early-exit lives in the reveal path itself.**
Hiding the dock CTA + not advertising `decide` still leaves the mission completable
early, because the typed `decide`/`actions` verb routes to `simRevealActions(true)`,
which used to only PRINT A WARNING and then reveal the mission-ENDING actions (then a
click finishes the case). Worse, hiding the CTA made `decide` the *only* visible way
forward, so players were "forced to type decide" AND still finished at ~1/11 evidence.
**Fix:** hard-block the MANUAL reveal — in `simRevealActions(manual)`, when
`manual && !investigationComplete()` for command-model missions
(`!simFiles().length && commandBarDefined()`), refuse + print "keep investigating"
guidance and return; never flip stage / renderActions. Guard on `commandBarDefined()`
(a mission with zero `core` commands has `investigationComplete()` permanently false →
would soft-lock). Leave the auto-reveal (`manual===false`, fires only when complete)
and Mission 1 (file-model) untouched. The only manual callers are the `decide`/`actions`
verb and the dock CTA — and the CTA only renders when already complete, so it's safe.
**Why:** a presentation/affordance gate (hide button, change copy) cannot close a
completion hole whose trigger is a still-live state transition; gate the transition.
