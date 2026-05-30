---
name: ECH derived UI layers (adversary / ops atmosphere)
description: How additive "alive" UI layers in the Ethical CyberHackers Platform avoid new persistence and avoid breaking the teaching demo.
---

When adding an additive "make it feel alive" UI layer to the Ethical CyberHackers
Platform (`artifacts/ethical-cyberhackers-platform/`) — e.g. the 29A ops strips, the
30A Persistent Adversary Presence panel — prefer DERIVING the new panel's state from
the existing already-persisted mission state rather than introducing a new save/restore
schema.

**Why:** `script.js` already persists threat / containment / blueTeamSteps /
blueTeamRedActive / completion. Deriving (resting state + revealed chips) from those on
every render means a mid-mission reload has zero persistence drift and needs no new
save/restore/reset code — far less surface to break. Keep only truly transient flavor
(e.g. a rotating "movement" line) in memory.

**How to apply:**
- Inject panels into the `.live-status` blocks (visible only during `body.mission-running`)
  above an existing anchor element; make every render/update helper no-op when its panel
  isn't in the DOM yet (boot/restore run before injection / on empty sessions).
- Drive any periodic "beat" timer from `setMissionRunning(on/off)` (start on true, stop on
  false) so every mission-exit path tears it down; make start/stop cancel-safe.
- Guard ALL runtime behavior on `demoRunning` — the opt-in teaching demo must not be
  contaminated by ambient/adaptive effects, and timers must not start during it.
- Hook adaptation into the existing escalation/containment functions; sync the panel by
  calling its update from `updateOpsStrip` (wrapped in try/catch) since that already fires
  on every relevant state change.
- `script.js` is an ES module (functions NOT global) — e2e only via real UI clicks, never
  the console.
