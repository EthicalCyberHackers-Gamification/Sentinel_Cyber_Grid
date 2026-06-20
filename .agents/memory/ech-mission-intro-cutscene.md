---
name: Mission intro video cutscene
description: How the first-launch-only, presentation-only video cutscene is gated and why it needs both a persisted key and an in-memory session flag.
---

# Mission intro video cutscene (presentation-only)

A short clip that plays once before a mission's first launch (M1 ships it;
`playM1Intro`/`shouldPlayM1Intro`/`markM1IntroSeen` + gate in
`launchMissionFromMap`).

## Rules

- **Gate placement:** inside `launchMissionFromMap`, AFTER the onboarding +
  `missionMapStatus()==="locked"` guards and BEFORE the career-sim/lab routing,
  so it plays regardless of which interior the mission opens.
- **Re-entry pattern:** on end/skip/error/Esc/timeout the cutscene marks "seen"
  then RE-CALLS `launchMissionFromMap(missionId, fromOC)` (now skips the intro
  and proceeds). An `*Active` flag must early-return on re-entry during playback,
  or the mission opens BEHIND the overlay.
- **Storage-failure loop (the subtle one):** a persisted seen-key alone is not
  enough. If `getItem` works but `setItem` fails (quota / private mode), re-entry
  sees "not seen" and replays forever. `markSeen()` must set an **in-memory
  session flag FIRST** (before the try/`setItem`), and `shouldPlay()` must check
  it first.

**Why:** these two failure modes (open-behind-overlay, replay-loop) are easy to
miss because the happy path works; the architect flagged the loop.

## Invariants

- **Presentation-only:** separate localStorage key (e.g. `ech.m1IntroSeen.v1`),
  never `ech.progress.v1`, never enqueue cloud sync. The mission's real cloud
  write (`startAssignmentAttempt`) only fires AFTER re-entry, not during the clip.
- `onDone` fires exactly once (`finished` flag); add a safety timeout for a
  missed `ended`; on autoplay-with-sound rejection retry muted; on `error`
  (missing/blocked asset) just finish — never strand the player.
- **Duck the soundtrack:** capture `soundtrackAudio && !soundtrackAudio.paused`,
  pause on open, resume only if it was playing.
- **Asset:** compress big clips (ffmpeg 720p/crf28/+faststart) into the app's
  `public/`; reference as `${import.meta.env.BASE_URL}file.mp4` (BASE_URL already
  has a trailing slash). public/ files serve at base root with range support.
