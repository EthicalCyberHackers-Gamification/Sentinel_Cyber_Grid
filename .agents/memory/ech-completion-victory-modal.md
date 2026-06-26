---
name: Mission-complete result overlays (career-sim)
description: How end-of-mission result/victory overlays must be mounted, wired, gated, and torn down in career-sim.
---

# Mission-complete result overlays (career-sim)

End-of-mission result UI (the persistent "victory screen" modal, the intro
cutscene) is mounted on `document.body`, **outside** `#careerOps`.

**Rule 1 — wire buttons directly.** `#careerOps` uses a single delegated click
handler; it never sees body-level nodes. Any overlay mounted outside it must add
its own listeners to its buttons, not rely on `data-*` delegation.

**Why:** the side-panel debrief buttons (`data-replay` / `data-done`) work via the
careerOps delegate; the modal's buttons do not and would be dead if you copy that
pattern.

**Rule 2 — tear down at the three completion-lifecycle sites.** Mission open,
`returnFromCareerMission`, and `replayCareerMission` each already clear the
completion toast; any new completion overlay must be removed at the *same* three
sites or it lingers/stacks across missions. Remove your OWN element by id (no
global timer remove) to avoid the timer-clobber bug.

**Rule 3 — the victory screen is the completion moment for EVERY mission.**
The auto-dismissing toast is gone (`simCelebrateComplete` removed;
`simRemoveCompleteToast` kept, the modal still calls it defensively). Mission 1
reaches the modal via the `def.debriefScorecard` early-return into
`renderCaseReviewDebrief`; M2–M4 reach it from the standard `renderDebrief` path.
Gate any per-mission *variation* on a `def` flag, never a mission id — e.g. a
**capstone** mission (`def.campaignReveal || def.performanceReview`, M4 today)
keeps its end-of-game payoff: the modal's primary action + Escape reveal the
`#simFeedback` finale debrief (campaign reveal + promotion) and focus its return
button instead of returning home, so it can never be skipped. The real promotion
applies in `finalizeMission` regardless of the UI.

**How to apply:** reuse the derived helpers (`caseReviewRating`,
`caseReviewMetrics`, `caseReviewManagerNote`) for any results display —
presentation-only, never a new graded/persisted path. These M1-authored helpers
degrade safely for command-model missions (gated rows self-omit; overall band
from `perf.score`) — reuse them, don't fork. Result overlays sit at z-index
~1400 (above the existing 1300 ceiling).
