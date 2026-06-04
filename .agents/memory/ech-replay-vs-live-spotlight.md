---
name: Replay Guide vs live spotlight exclusivity
description: Why on-demand spotlight replay must actively tear down the live tour's visual, not just use separate DOM ids.
---

The on-demand "Replay Guide" tour and the live first-run 25B tour both render
the same spotlight visuals. The replay uses its own `#rgDim`/`#rgCoach` nodes and
the live tour uses `#igDim`/`#igCoach`, so teardowns don't cross-delete dims.

**Rule:** separate ids are NOT enough to prevent overlap. Both apply the shared
`.ig-spotlight-target` ring class to their target element, and a live overlay may
already be on screen when replay starts. So replay start must do BOTH:
- guard the live render path (`if (rgActive) return;` at the top of `igShow`) to
  stop *future* live spotlights firing during a replay, AND
- actively tear down any *currently visible* live overlay (`igTeardown()`) at the
  top of `startReplayGuide`.

**Why:** with only the `igShow` guard, a live coach/dim already painted before
the user clicks Replay would coexist with the replay coach (two dims, ring
conflict).

**How to apply:** keep the two paths' logical state independent — replay must
never flip `igEnabled` or clear `igPhasesShown`; `igTeardown()` only removes
visuals, so the live tour's logical state survives and remaining un-shown phases
can still fire after replay ends.
