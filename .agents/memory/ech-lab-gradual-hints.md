---
name: Progressive lab gradual-hint engine
description: How the Mission-001 training lab (lab.js) gives escalating, answer-last hints; the no-leak rule.
---

The progressive Mission-001 lab (`lab.js`, ops-center-prototype) has a gradual
hint system: a `hint` command + a 💡 HINT button in the objective bar. Hints are
context-aware and escalate.

- `LAB_HINTS` keys each sub-goal to a 3-tier array: (1) conceptual nudge → (2)
  directional push → (3) the exact command. `labCurrentHintGoal()` maps the
  player's live state (stage + ran/read/discovered/pinned/contained) to the right
  sub-goal so the hint always matches where they actually are.
- `labHint()` shows the current tier ("HINT n of 3"), escalates one tier per call,
  and resets to tier 1 when the sub-goal changes (player progressed). State is
  `LAB.hintStep`/`LAB.hintLevel`, reset in `openLab()`.

**Rule — do not leak the exact command before the final tier.** Tiers 1–2 must be
conceptual/directional; only tier 3 may contain a literal runnable command. Point
tier 2 at the dock GROUP and describe each tool's effect rather than naming the
command verbs (`headers`/`check recipients`/`block domain`…).
**Why:** an architect review failed the first pass because tier-2 strings listed
the exact command words, collapsing the gradual progression for a beginner.
**How to apply:** when adding/editing any hint tier, never put a string that
matches a `LAB_TOOLS[*].cmd` (or `pin all`, `submit report`, etc.) into tier 1 or
2 — reserve literal commands for the last tier.
