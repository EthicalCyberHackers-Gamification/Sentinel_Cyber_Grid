# Phase A Baseline

_Frozen: 28 May 2026 — build `28 May 2026 — 13:05 CST` (Milestone 23G)_

This document marks the end of **Phase A** of the Ethical CyberHackers
Platform. The platform has a complete, working **Mission Engine
Foundation** and **two playable missions**. Everything below is the
stable reference for what must continue to work as new features land.

---

## Current Platform State

The platform now has, end-to-end and frontend-only:

- A **reusable Mission Engine** (`window.MissionEngine`) that dispatches
  rendering, command handling, hints, manager messages, finding
  submission, quiz, reflection, XP award, completion, scorecard, and
  reset for any registered mission.
- A **Mission Registry** (`missionRegistry` in `missions.js`) that is
  the single source of truth for course order, mission availability,
  and lock state. The Course Progress panel renders from it.
- A **Mission Template** (`MISSION_TEMPLATE`) plus
  `createMissionFromTemplate(custom)` and `validateMissionData(mission)`
  so future missions can be authored quickly and safely.
- A **Mission Engine Health Check**
  (`runMissionEngineHealthCheck()` + a quiet footer button) that runs
  ~19 structural assertions over the registry, mission data, commands,
  and helper functions, and logs PASS/FAIL to the browser console.
- **Two fully playable missions** (Mission 1 and Mission 2) reachable
  from the Module Overview, with XP, ranks, scorecards, certificate
  previews, and `localStorage` persistence.
- Comprehensive developer documentation in `docs/`.

No backend. No database. No authentication. No AI. No PDFs. Everything
runs in the browser.

---

## Working Missions

| #  | `missionId`   | Title                     | XP   | Rank on completion        |
| -- | ------------- | ------------------------- | ---- | ------------------------- |
| 1  | `mission-001` | New Cybersecurity Intern  | +100 | Cyber Intern Level 1      |
| 2  | `mission-002` | Network Basics            | +100 | Cyber Intern Level 2      |

End-to-end Playwright e2e (Milestone 23B): full M1 → M2 playthrough
finishes at **XP 950**, **rank Cyber Intern Level 2**.

---

## Core Systems Completed

| System                    | Where it lives                                                       |
| ------------------------- | -------------------------------------------------------------------- |
| Mission data objects      | `missions.js` — `MISSION_1`, `MISSION_2`, plus `M2_*` legacy tables  |
| Mission engine functions  | `script.js` — `window.MissionEngine.*` dispatchers                   |
| Mission registry          | `missions.js` — `missionRegistry`, `MISSION_STATUS`                  |
| Mission template          | `missions.js` — `MISSION_TEMPLATE`                                   |
| Mission validation        | `missions.js` — `validateMissionData()`, `createMissionFromTemplate()` |
| Mission health check      | `script.js` — `runMissionEngineHealthCheck()` + footer button        |
| Local progress save       | `script.js` — `saveProgress()` / `loadProgress()` → `localStorage`   |
| XP and rank system        | `script.js` — `awardXP()`, rank pill, XP bar animations              |
| Scorecards                | `script.js` — Mission 1 completion HTML + `renderM2Scorecard()`      |
| Guided hints              | `script.js` — `updateHintPanel()` + per-mission hint tables          |
| Manager messages          | `script.js` — `updateManagerMessage()` + per-mission message tables  |
| Course progress panel     | `script.js` — `renderCourseProgress()` (registry-driven)             |

---

## Do Not Break Checklist

Every item below must continue to work in any future milestone. Treat
this as the regression bar for Phase B and beyond.

- [ ] **Module landing screen** loads with course header, module goal, mission list, skills, and Begin button
- [ ] **Student name entry** accepts a name and persists across the session
- [ ] **Simulation loading screen** plays the brief boot sequence before the dashboard appears
- [ ] **Mission 1 full flow** — all four commands (`pwd`, `ls`, `cd`, `cat`) → finding submission → quiz → reflection → completion
- [ ] **Mission 2 full flow** — all four commands (`ip addr`, `ping`, `nmap`, `review`) → Analyst Review → quiz → completion
- [ ] **Mission unlock progression** — Mission 2 stays locked until Mission 1 is complete; Mission 3 stays locked
- [ ] **XP/rank updates** — XP bar animates correctly; rank pill shows the new rank after each mission
- [ ] **Local save** — XP, rank, and mission-complete flags persist across hard reload via `localStorage` key `ech.progress.v1`
- [ ] **Restart buttons** — `Restart Mission` resets only the active mission and does not touch the other
- [ ] **Certificate preview** appears in the completion scorecard with the student's name
- [ ] **Mission engine health check** — the footer button runs cleanly and logs all PASS / 0 FAIL on a clean build
- [ ] **No JavaScript errors** in the browser console during the full M1 → M2 playthrough

---

## Next Development Phase

Phase B should begin adding stronger **simulation mechanics** gradually,
one at a time. None of these have been started — they are the planned
trajectory for the next set of milestones:

- **Evidence collection** — students gather artifacts (logs, files,
  screenshots) into a case file as they progress through a mission.
- **Trust score** — a separate per-mission meter that responds to how
  carefully the student handles sensitive systems and stakeholders.
- **Threat level meter** — a per-mission gauge that rises as more
  indicators-of-compromise are surfaced; can change which path the
  mission takes.
- **Decision consequences** — branching: certain command choices or
  finding-submission answers permanently affect later steps of the
  same mission (and downstream missions in the same module).
- **Dynamic manager reactions** — the supervisor panel responds to
  the student's specific decisions rather than firing scripted
  messages on a fixed trigger.
- **Alert loop** — a small recurring "incoming alert" system that
  interrupts the dashboard with new tasks and gives the mission a
  sense of live pressure.

Each Phase B feature should be added through the Mission Template
+ Registry foundation Phase A already provides — no new mission
should require touching the engine's plumbing directly.

---

## How to validate this baseline at any time

```text
1. Hard-reload the app.
2. Click "Run Mission Engine Check" in the footer.
   → Console should show "PASS: Mission engine ready" and 0 FAILs.
3. Play Mission 1 start-to-finish.
4. Play Mission 2 start-to-finish.
5. Hard-reload again.
   → XP and rank should restore. Mission 2 should still be Completed.
6. Confirm Mission 3 stays Locked.
```

If any of the above changes, Phase A has regressed.
