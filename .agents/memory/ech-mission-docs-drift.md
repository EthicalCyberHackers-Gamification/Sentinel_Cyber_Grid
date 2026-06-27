---
name: Mission docs lag the shipping engine
description: Which prose docs misrepresent how missions actually run, and what the authoritative source is.
---

Some human-facing prose docs in `/docs` (and historically `docs/missions.md` +
`replit.md`) describe a long-dead **3-mission engine hardwired into `script.js`**
(`runM2Command`, `m3Terminal`, `M2_REASONING`, `beginMission3`). That engine is
superseded. As of the missions.md/replit.md doc refresh, files still citing the dead
engine include `docs/ui-guidelines.md` and `docs/UI_STATE_REVIEW.md`
(`docs/missions.md` now references it only intentionally, in a history note). There
is no `MISSION_ENGINE_GUIDE.md` in this repo.

**Authoritative source of mission truth (trust over the markdown):**
- `COURSE_MISSION_META` (`script.js`) — canonical titles, severities, regions,
  difficulty, objectives for all six assignments. `COURSE_GROUPS` — role tracks
  (Intern x4 -> Junior SOC Analyst x1 -> SOC Analyst x1). `MISSION_PLAY_ORDER`
  lives in `mission-order.js`.
- `career-sim.js` (`CAREER_MISSIONS`) — full engine for assignments 1-4.
- `lab.js` (`lab.missions/`) — Progressive Lab for assignments 5-6.
- `launchMissionFromMap()` routes: Career Sim first (`echCareerHasMission` ->
  `openCareerMission`), else lab (`LAB_MISSION_IDS` -> `openLab`); the legacy
  `script.js` per-mission branches are a dead fallback for shipping content.

**Why:** even a GitHub reader was misled by the stale `docs/missions.md` into
thinking the game is only 3 simple missions. Code is the truth; prose drifts.

**How to apply:** when asked how missions work, or when writing/auditing mission
docs, verify against `COURSE_MISSION_META` + `career-sim.js`/`lab.js` rather than
copying the prose docs forward. If a doc-accuracy pass is requested, `ui-guidelines.md`
and `UI_STATE_REVIEW.md` are the remaining known stale files.
