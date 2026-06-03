---
name: ECH single completion chokepoint
description: The one function every mission-completion path converges on, for hooking cross-mission completion side-effects once.
---

# notifyAssignmentComplete is the universal completion chokepoint

`notifyAssignmentComplete(missionId)` fires **exactly once** per mission completion
across every path — the M1 path, the M2/M3 quiz paths, AND the engine-driven
`completeMissionEngine` mirror (whose `if (missionXComplete) return;` guards run
before it, so it never double-fires).

**Why:** the game has multiple completion code paths (quiz-driven vs engine-driven,
and three missions). Hooking a completion side-effect (analytics close, completion
"telemetry settling" beat, etc.) into each site is error-prone and easy to miss one.

**How to apply:** add cross-mission, cross-path completion side-effects here, keyed
by `missionId`. Gotcha: M1 lowers its threat to Low *synchronously right after* this
call (rebuilding the threat-meter DOM), so any meter-touching effect must be deferred
one tick (short setTimeout) and made cancel-safe in `endGuidedRun()` per the
deferred-timers rule.
