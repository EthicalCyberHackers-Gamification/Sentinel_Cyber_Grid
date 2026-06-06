---
name: Data-driven generic mission engine (missions 4/5/6)
description: How missions 004/005/006 work via one self-contained data-driven engine, and why it deliberately avoids the hand-coded M1-M3 surfaces.
---

Missions 1-3 are hand-coded across ~50+ id branches, a per-mission HTML dashboard,
the OC home, and save/load — triplicating that for 4/5/6 was infeasible/risky.
Instead missions 004/005/006 are **fully data-driven**: their content lives in
`GENERIC_MISSIONS` in `missions.js` (briefing → sequential commands w/ per-step
reasoning gate → analyst review → quiz → scorecard), and ONE engine in `script.js`
(`gm*` functions, own `#genMissionDashboard` DOM, `gmActive`/`gmState`) renders
every phase generically.

**Why it stays minimal-blast-radius:** the engine is deliberately NOT added to
`missionRegistry`, `renderCourseProgress`, or the OC-home V2 panel (those hardcode
3 missions). Discovery is via the prototype Ops Center deep-link only
(`/?mission=mission-004`). It writes only `mission4/5/6Complete` + `currentXP`
through the `saveProgress()` chokepoint — never touches the M1-M3 surfaces.

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
