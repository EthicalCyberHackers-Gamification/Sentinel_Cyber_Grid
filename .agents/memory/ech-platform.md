---
name: Ethical CyberHackers Platform — durable gotchas
description: Non-obvious constraints for the frontend-only cyber training app (artifacts/ethical-cyberhackers-platform).
---

# Ethical CyberHackers Platform

A frontend-only Vite browser app at `artifacts/ethical-cyberhackers-platform/` (preview `/`).
Single big `script.js` + `index.html` + `style.css`. Two missions: M1=mission-001
(`#dashboard`), M2=mission-002 (`#mission2Dashboard`).

## script.js is an ES module — functions are NOT global
Loaded via `<script type="module">`, so console-based test navigation does NOT work.
**How to apply:** in e2e tests, drive everything through the real UI by clicking; never call
functions from the console.

## Reload always boots to the module landing screen
A mid-mission browser reload does NOT auto-navigate into the active mission. The app boots to
`#moduleLanding` (name + "Enter Module"). Resume happens when the student re-enters the mission
(Enter Module → simulation loader → Missions Map → Launch Mission); a durable `missionLaunched`
flag then makes re-launch skip the guided briefing overlay and re-render the live investigation.
**Why:** an e2e test that reloads and expects the dashboard immediately will wrongly report a
failure. **How to apply:** after reload in tests, re-navigate via the map to resume.

## Persisted state must survive reload AND be re-rendered
State lives in localStorage key `ech.progress.v1`. Persisting a value is not enough — the
restore path (`restoreSavedProgress`) must also RE-RENDER it. E.g. the Blue Team feed needed a
persisted `m1BlueFeed` array AND a `renderBlueFeed()` replay in `renderBlueTeamPanel`, or the
panel restored containment/flag but came back with an empty feed.
**How to apply:** for any new persisted UI state, add save + validated restore + a render-on-restore
call, and validate against an allowlist (e.g. `isValidContainmentStep`) to harden against tampered
localStorage.

## M1/M2 share helpers but use distinct `m2*` DOM ids
M1 and M2 share render/engine helpers but each mission has its own DOM ids (M2 mirrors M1 with an
`m2` prefix). Two valid patterns coexist: (a) gate a feature on a single mission's ids, or (b)
generalize an engine to be MISSION-KEYED.
**Why:** Stage 2 Blue Team started M1-only, then was generalized so both missions reuse ONE engine
instead of duplicating it. **How to apply:** when adding the same feature to both missions, prefer
keying state by mission id (objects keyed `"mission-001"`/`"mission-002"`) + a mission→ids DOM map
and pass `missionId` as the first arg to every helper — do NOT copy/paste the M1 block into M2.
When generalizing, keep a LEGACY restore fallback so old persisted (flat M1) saves still load.

## Visual "raise" helpers must be monotonic (never downgrade)
A helper that bumps a level up one step (e.g. `raiseThreatOneStep`) must guard `if (curIndex >=
capIndex) return;` BEFORE computing the next level. Naive `levels[min(i+1, capI)]` DOWNGRADES when
the current value is already above the cap.
**Why:** a poor decision can set Threat = Critical, then an escalation event calls
`raiseThreatOneStep(.., "High")` — without the guard it would LOWER Critical→High, the opposite of
escalating. **How to apply:** any "increase only" UI metric (threat/pressure/score) should clamp by
returning early when already at/above the ceiling, not by `min()`-ing into a lower bucket.

## Session-only flags don't gate cross-reload, but DO gate same-session re-entry — re-arm timers
`missionStarted`/`m2Started` are session-only. Timers/watches torn down on mission exit (via
`endGuidedRun`) must be RE-ARMED on same-session re-entry, not just on fresh start. Re-arm in
`openMission1Dashboard`'s `missionStarted && !missionComplete` branch and in `beginMission2` BEFORE
its `m2Started` early-return.
**Why:** Stage 3's idle escalation watch silently stopped after map/overview leave+resume because
only the fresh-start `beginMission*` path armed it. **How to apply:** any per-mission timer (idle
watch, polling) needs an arm call on EVERY active re-entry path; make the start fn idempotent (clear
then schedule) so double-calls are safe.
