---
name: Briefing Replay layer (rgb*)
description: Presentation-only briefing recap that chains into the spotlight Replay Guide; safety + exclusivity rules.
---

# Briefing Replay (`rgb*` layer)

A presentation-only recap that re-renders a mission's briefing cards
(`MISSION_BRIEFINGS`) in `#rgbOverlay`, then chains into the existing spotlight
Replay Guide (`rg*`) as one flow. Entry point: `startBriefingReplay(missionId)`.

**Why a separate layer (not the first-run briefing):** the first-run briefing
(`startGuidedBriefing` → `advanceGuidedStep` → `reviewBriefingCard`) is
progression-linked — it marks cards reviewed, drives the supervisor feed, awards
one-time briefing XP, and calls `saveProgress()` (writes `ech.progress.v1` +
enqueues cloud sync). Replay re-reads the same card data but renders it
independently, calling none of those handlers.

**Safety invariant (shared with `rg*`, audited in REPLAY_SAFETY_CHECK #7):** the
replay path must reach NEITHER `saveProgress()` NOR `awardXP()`, and must not call
`reviewBriefingCard`/`advanceGuidedStep`/`startGuidedBriefing`. Only permitted
persistent write = inert, never-read flag `ech.replayGuideUsed.v1`.

**Overlay exclusivity gotcha:** any new on-demand overlay that can fire while a
live reactive spotlight is visible MUST call `igTeardown()` before opening, or two
overlay systems coexist in the DOM. Both `startReplayGuide` and `startBriefingReplay`
do this. `igModalOpen()` must also report the new overlay id as blocking so the
live spotlight defers. Tear down on mission-exit too: `endGuidedRun()` calls both
`endReplayGuide()` and `endBriefingReplay()`.

**Replaying from the briefing room shows only cards (correct, not a bug):** the
spotlight plan only includes phases whose targets are currently visible
(`offsetParent !== null`); pre-launch the dashboard targets aren't on screen, so
the spotlight exits cleanly and only the briefing cards show.

**Controls:** three placements, all calling `startBriefingReplay` — briefing room
(`renderBriefingRoom` `.briefing-replay-btn`), in-investigation objective buttons
(`#replayGuideBtn`/`#m2ReplayGuideBtn`/`#m3ReplayGuideBtn`), and the shared
completion scorecard (`buildNextStepHTML`/`wireNextStepButtons`, `#nextStepReplay*`).
