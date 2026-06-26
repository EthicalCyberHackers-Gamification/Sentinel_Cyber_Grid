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
