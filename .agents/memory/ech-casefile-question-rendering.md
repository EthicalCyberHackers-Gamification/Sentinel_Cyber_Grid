---
name: Case-file question rendering & cue ownership
description: How career-sim case-file reply choices are ordered/graded and which surface owns the "what stands out / why" cue.
---

# Case-file question rendering & cue ownership

Two invariants for the case-file missions (`def.caseFileNotebook`, missions 1–4)
in `artifacts/ethical-cyberhackers-platform/career-sim.js`.

## Replies are graded by id, never by display position
- Each observation/justification step authors the correct reply FIRST in `options`
  with `correct:'a'`. The on-screen A/B/C/D letter is just the array index
  (`String.fromCharCode(65+i)`), so unshuffled it always shows the answer at A.
- Display order is shuffled stably per `challengeId+step` (transient
  `SIM.optionOrder`, reset on mission open) so the answer lands in varying slots.
- Grading is position-independent: it compares the recorded option **id** to
  `cfg.correct`, and `setDiscoveryJudgment` validates the chosen **id**.

**Why:** correct-first authoring made "always pick A" a giveaway. Use a uniform
shuffle — don't force the answer out of A, or "A is never right" becomes the new
tell.
**How to apply:** never reintroduce position-based answer logic and never assume
data order == display order. New reply UIs must keep `data-option` = option id and
grade by id. The reconsideration/pivot replies are NON-graded posture (revise/hold)
and are intentionally NOT shuffled.

## The Decision Dock owns the observation/justification cue
- The terminal-to-notebook cue ("In the notebook → …") must NOT print the
  "Record what stands out / Explain why it matters" next-step while a dock call is
  pending — gate it behind `!caseFileDecisionPending()`. The dock + objective HUD
  already own that step; printing the notebook line too is contradictory.
- The "N new finding(s) logged to your ANALYST NOTEBOOK" line and the later
  next-steps (investigate / classify / decide) still print (they only occur when
  no call is pending).

**Why:** the judgment moved from the right-panel notebook into the Decision Dock;
the old cue pointed players at the wrong surface.
