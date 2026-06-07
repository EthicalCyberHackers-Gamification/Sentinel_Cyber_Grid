---
name: Data-driven generic mission engine (missions 4/5/6)
description: How missions 004/005/006 work via one self-contained data-driven engine, and why it deliberately avoids the hand-coded M1-M3 surfaces.
---

**SUPERSEDED for play (2026-06-07):** missions 003/004/005/006 now route to the
terminal **Progressive Lab** (`openLab`), because `launchMissionFromMap` checks
`LAB_MISSION_IDS` FIRST and 003-006 are now registered there (see
[ech-lab-dataset-schema](ech-lab-dataset-schema.md)). The `gm*` engine below is now
legacy/bypassed for 004-006 — kept for reference; completion is bridged via
`notifyLabComplete`, not `gmCompleteMission`. `GENERIC_MISSIONS` still supplies each
mission's `quiz.xpReward` (read by `labGenericXp`) and is the source-of-truth content
the lab datasets were authored from.

Missions 1-3 are hand-coded across ~50+ id branches, a per-mission HTML dashboard,
the OC home, and save/load — triplicating that for 4/5/6 was infeasible/risky.
Instead missions 004/005/006 are **fully data-driven**: their content lives in
`GENERIC_MISSIONS` in `missions.js` (briefing → sequential commands w/ per-step
reasoning gate → analyst review → quiz → scorecard), and ONE engine in `script.js`
(`gm*` functions, own `#genMissionDashboard` DOM, `gmActive`/`gmState`) renders
every phase generically.

**Why it stays minimal-blast-radius:** the engine writes only
`mission4/5/6Complete` + `currentXP` through the `saveProgress()` chokepoint —
never touches the M1-M3 gameplay surfaces. Discovery surfaces, current state:
- **Surfaced (main game OC home):** the OCV2 map nodes (`ocv2Node*`, all 6 in
  index.html + `OCV2_NODE_META` 004-006) AND the Alert Queue feed in
  `renderOcPanelV2` now show all six, gated by `missionMapStatus()`; clicking an
  unlocked one opens the incident card → LAUNCH → `launchMissionFromMap` →
  `isGenericMission` branch (same as the deep-link).
- **Still hardcode 3 (deliberately not touched):** `missionRegistry` /
  `renderCourseProgress` (the in-mission Course Progress drawer) — coupled to the
  on-demand self-test (`getNextMissionId('mission3')===null`, sequential orders)
  and save/load sync, so adding 4-6 there is higher-risk; and the legacy
  `MISSION_MAP` Missions Map, which has its own retirement task.

**How to apply:** to add mission 7+, append a data object to `GENERIC_MISSIONS`
and wire one `mission-00N` branch in `launchMissionFromMap`, `missionMapStatus`
(chained gating), the deep-link whitelist, `saveProgress`/`loadProgress`/
`clearSavedProgress`, `gmCompleteMission`, and the prototype's `REAL_MISSION_MAP`/
`getMissionStates`. No new HTML/CSS per mission — the engine reuses `gm-*` styles.

**Testing gotcha:** the engine is gated behind onboarding (studentName) + chained
mission locks, and static screenshots can't drive its multi-step interactive flow.
To screenshot a briefing for a locked generic mission, a temporary `gmtest=1`
query-param bypass was used in `launchMissionFromMap` + the boot deep-link consumer,
then reverted. Don't ship that flag. Past briefing-screen, verify the flow by code
review (node --check + typecheck + field-name parity between data and `gm*`
renderers), since runTest is disabled and a full play-through can't be screenshotted.
