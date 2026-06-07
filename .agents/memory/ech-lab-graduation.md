---
name: Progressive Lab graduation (prototype → shipping game)
description: How the terminal-first Progressive Training Lab was graduated from ops-center-prototype into ethical-cyberhackers-platform with real persistence, and the access-control gotcha.
---

# Progressive Training Lab graduation

The terminal-first "lab" interior (assignments with a lab dataset — currently
mission-001, mission-002) was graduated from `ops-center-prototype` into the
shipping `ethical-cyberhackers-platform`. It is a self-contained ES module
(`lab.js` + `lab.css`, scoped to `.screen`/`.sc-*`/`.lab-*`) with `#labConsole`
markup in `index.html`. The host wires it through `configureLab(hooks)` + `initLab()`.

## The host-bridge contract (keep lab.js portable)
- lab.js exposes `configureLab({canOpen,onOpen,onReturn,onComplete})`, `openLab(id)`,
  `initLab()`, `LAB_MISSION_IDS`. It must NOT reach into host state directly — all
  host coupling goes through the hooks.
- The host routes lab assignments to `openLab()` from its single gated entry
  (`launchMissionFromMap`) and records completion in `onComplete` via the host's
  real persistence chokepoint (set mission flag → `awardXP` → `saveProgress` →
  `notifyAssignmentComplete` so the Ops Center map repaints/unlocks).

## Access-control gotcha (the bug code review caught)
**Any alternate entrypoint into the lab must enforce the SAME gate as the main
map launch, or it bypasses onboarding + unlock and persists out-of-order
progression.** lab.js carries a `?lab=<id>` deep-link that auto-opens on init.
That deep-link silently bypassed the host's `studentName` + `missionMapStatus`
gate, and because the completion bridge sets the mission flag + awards XP, the
bypass would persist an out-of-order unlock.
- **Why:** the lab's completion bridge writes real progress; an ungated open is a
  privilege-escalation-style progression bypass.
- **How to apply:** gate the deep-link through a host-supplied `canOpen(id)` hook
  (authoritative when present) AND add a prerequisite guard in the completion
  bridge (e.g. mission-002 completion is a no-op unless mission-001 is complete) —
  defense in depth against any future entrypoint.

## Single mission-entry chokepoint
`launchMissionFromMap(id)` is the ONE gated entry that routes lab missions to
`openLab()`. Any "go to Assignment N" CTA must call it, never the legacy
`showMission2Overview()`/`showMission3Overview()` directly — otherwise it drops
players into the superseded overview/dashboard and skips the gate. M2's course-
progress "Start" button and the M1→M2 "Continue" CTA both route through it; the
remaining `showMission2Overview` refs are dead/console-only.

## Known limitations (documented, accepted)
- Deliberately bypasses the monolithic dashboard `completeMission()` (M1-specific
  side-effects); the lab renders its own scorecard. Minimal faithful completion =
  flag + XP + save + notify, so rank/trust meters aren't touched.
- No mid-lab resume: a fresh open restarts the lab at stage 1 (in-memory state).
