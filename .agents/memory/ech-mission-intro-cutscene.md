---
name: Mission intro video cutscene
description: How the always-play, presentation-only Mission 1 video cutscene is gated and how the finish→re-enter loop is broken.
---

# Mission intro video cutscene (presentation-only)

A short clip that plays before a mission launches (M1 ships it: `playM1Intro` + a
gate in `launchMissionFromMap`). Current behavior: plays on EVERY Mission 1
launch, always skippable.

## Rules

- **Gate placement:** inside `launchMissionFromMap`, AFTER the onboarding +
  `missionMapStatus()==="locked"` guards and BEFORE the career-sim/lab routing,
  so it plays regardless of which interior the mission opens.
- **Re-entry without looping:** the cutscene finishes, then RE-CALLS
  `launchMissionFromMap` so the normal launch runs. To avoid replaying forever,
  the finish callback sets a transient one-shot flag (`m1IntroProceed=true`) and
  the gate consumes it (sets false) to fall through into the mission exactly once.
  Do NOT use a "seen" flag to break the loop when the requirement is play-every-time.
- **Open-behind-overlay guard:** a separate `m1IntroActive` flag must early-return
  on re-entry during playback, or the mission opens behind the overlay.

**Why:** finishing the clip re-enters the same launch function; without a one-shot
consume flag it would replay infinitely. Both failure modes (replay-loop,
open-behind-overlay) are easy to miss because the happy path works.

## Invariants

- **Presentation-only:** never write `ech.progress.v1`, never enqueue cloud sync.
  The mission's real cloud write (`startAssignmentAttempt`) only fires AFTER
  re-entry, not during the clip. History/gotcha: a once-only variant used a
  separate localStorage seen-key, but "Clear Progress" only wipes
  `ech.progress.v1`, so that key survived a reset and the intro never replayed —
  which is why it's now play-every-time with no persisted seen-key.
- `onDone` fires exactly once (`finished` flag); a safety timeout covers a missed
  `ended`; autoplay-with-sound rejection retries muted; `error` (missing/blocked
  asset) just finishes — never strand the player. These all converge on the one
  `finish()`, which always clears `m1IntroActive`, so it can't get stuck.
- **Duck the soundtrack:** capture `soundtrackAudio && !soundtrackAudio.paused`,
  pause on open, resume only if it was playing.
- **Asset:** compress big clips (ffmpeg 720p/crf28/+faststart) into the app's
  `public/`; reference as `${import.meta.env.BASE_URL}file.mp4` (BASE_URL has a
  trailing slash; public/ serves at base root with range support).
