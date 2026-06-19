---
name: Case-file answer grading & cue ownership
description: Durable invariants for career-sim case-file reply choices (grade by id, shuffle display) and which surface owns the judgment cue.
---

# Case-file answer grading & cue ownership

Invariants for the case-file missions (`def.caseFileNotebook`) in
`artifacts/ethical-cyberhackers-platform/career-sim.js`.

## Grade by option id, never by display position
Replies are authored correct-first, and the on-screen A/B/C/D letter is just the
render-order index — so display order is intentionally shuffled. **Grading must
stay keyed on the option id, never on the slot.**

**Why:** correct-first + position-keyed display made "always pick A" a giveaway.
**How to apply:** never assume data order == display order, never add position-based
answer logic, and keep any new reply UI wiring `data-option` to the id. Use a
uniform shuffle (don't force the answer out of A, or "A is never right" is the new
tell). Non-graded reconsideration (revise/hold) replies are deliberately NOT
shuffled.

## The Decision Dock owns the observation/justification cue
The "what stands out / why it matters" judgment lives in the Decision Dock, not the
right-panel notebook. Terminal/notebook guidance must not also point the player at
that step while a dock call is pending, or it competes with the dock + objective HUD.

**Why:** the judgment moved out of the notebook into the dock; the old terminal cue
pointed at the wrong surface.
**How to apply:** gate the judgment-step cue on "no dock call pending"; the other
next-steps (investigate / classify / decide) only occur once no call is pending, so
they stay.
