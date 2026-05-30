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

## M1-only vs M2 isolation
M1 and M2 share helpers but use distinct DOM ids (M2 mirrors with `m2*`). Stage 2 Blue Team is
M1-only (its ids/hooks never touch M2). **How to apply:** keep new mission-specific features gated
on `def.missionId === "mission-001"` / M1 ids so M2 stays unaffected.
