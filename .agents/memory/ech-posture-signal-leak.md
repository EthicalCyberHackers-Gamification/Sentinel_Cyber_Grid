---
name: Posture-signal correctness leak (presentation-only recaps)
description: How a "posture" signal feeding a presentation-only recap/debrief can silently route through a correctness helper, and the durable guard.
---

# Posture-signal correctness leak

A presentation-only recap/debrief/"performance mirror" is supposed to react to
POSTURE (how the analyst engaged), never to keyed correctness. The trap: a signal
that *reads* like posture can silently call a correctness helper.

Real instance (career-sim Sarah performance mirror): a signal named
`soundJudgments` was set from `soundJudgmentCount()`, which was itself
`simDiscoveryChallenges().filter(challengeFullyCorrect).length` — i.e. keyed
correctness laundered through a friendly-sounding wrapper. The recap became a
hidden grade.

**Why:** "react to posture not correctness" is the core invariant of these layers,
but the leak hides one or two call-hops away — the offending call site looks like
an innocuous count, not a correctness check.

**How to apply:**
- Don't trust a signal's *name* — trace what it actually calls. A "count of X"
  helper may filter X by correctness.
- For decisiveness/engagement posture, prefer raw engagement state that exists
  regardless of right/wrong (e.g. "findings the player committed to the record",
  `SIM.committedFindings.length`), not a "…Correct(...)" filter.
- Guard the regression with a static audit scoped to the FEATURE SLICE (not just
  player-facing strings): grep the slice source for correctness-helper *names*
  (`*FullyCorrect`, `*StepCorrect`, `*Status(`, `correct*Count(`, any `*Count()`
  wrapper that internally filters by correctness) and assert ZERO matches. String
  scans alone miss this — the leak is in the data path, not the copy.
