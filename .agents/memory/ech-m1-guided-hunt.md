---
name: M1 guided-hunt guidance layer
description: How the file-model Mission 1 "guided hunt" coaching beats coordinate, and the lock-aware rule every terminal-action nudge must follow.
---

# M1 guided-hunt guidance layer (file-model)

A presentation-only coaching layer turns the file-model Mission 1 (ls/cat/grep)
from a quiz into a guided hunt: a live "→ Next:" line after each action,
clickable file/grep chips, an always-visible objective+next-action HUD, an
unlock handoff after Sarah's call, and a one-time onboarding modal. All of it is
data-gated on `markupEnabled()` (the file-model flag), so the command-model
missions M2–M4 get none of it. The single pure reader is `simNextAction()`
(returns `{text, chips}`); it returns empty when not file-model, which is the
one gate the whole layer keys off.

## Rule: terminal-action nudges must be lock-aware

Any coaching beat that tells the player to *type something into the terminal*
("→ Next: …", "type `decide`", "type `grep` …") must NOT print while the
Decision Dock has locked the command line. If the action that earned the nudge
also locks the dock, **latch** the nudge (a pending flag) and **flush it from
the single unlock chokepoint** once Sarah's call is answered.

**Why:** the terminal input is disabled while the dock is locked, so a "type X"
line printed at that moment is contradictory dead guidance. Worse, the unlock
handoff prints "✓ Logged with Sarah." then calls the live next-step printer,
which **deliberately suppresses the completion beat** (it early-returns on
`investigationComplete()`) to avoid double-speaking the dedicated completion
nudge. So if the completion nudge fired (uselessly) while locked, nothing
re-emits it after unlock and the player is stranded with no "decide" handoff.

**How to apply:** the completion nudge checks `decisionLocked()` *before*
consuming its once-per-open guard — if locked it sets a `completionNudgePending`
latch and returns; the unlock chokepoint, after the "✓ Logged" line, clears the
latch and re-invokes the completion nudge (now actionable). This mirrors the
older grep-unlock deferral (`grepNudgePending`). Per-open flags must be reset on
mission open or they leak across missions. The latch is self-clearing and the
completion nudge's stage guard makes a post-mission flush a harmless no-op, so it
can't soft-lock. Net invariant: exactly one of {live next-step, grep-unlock,
completion} speaks per frame, and none ever instructs a typed action while the
terminal is locked.
