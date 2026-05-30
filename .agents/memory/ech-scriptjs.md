---
name: Ethical CyberHackers — script.js conventions
description: Durable gotchas for the ECH platform's single-file script.js (ES module) — testing, delayed-timer/teardown patterns, duplicate-symbol risk.
---

# Ethical CyberHackers Platform — script.js working notes

`artifacts/ethical-cyberhackers-platform/` is a frontend-only Vite app; `script.js` is one
large file loaded as `<script type="module">`.

- **Functions are NOT global.** Because it's an ES module, console-based navigation in tests
  does not work. Drive everything through the real UI (clicks).
  **Why:** several past test attempts assumed global fns and failed silently.

- **e2e for deep M1 flows is slow/flaky for the testing subagent.** Reaching the decision
  step requires name entry → Enter Module → loader → Missions Map → Launch → 3 guided
  briefing cards → Launch Investigation → explore files → PIN suspicious_file.txt + classify
  it **Critical Threat Evidence** (reading alone does NOT unlock the gate). The pin +
  classification prompts are modal-style; the agent often stops at the "Containment Actions"
  panel (a DIFFERENT system from the `.decision-btn` decision flow) or times out.
  **How to apply:** lean on typecheck + clean-boot + architect review for deep reactive
  flows; if running e2e, give the agent very explicit pin/classify modal steps and expect it
  may still time out — that's a runner limit, not necessarily a code defect.

- **Duplicate top-level declarations crash the whole module at parse time** (e.g.
  `Identifier 'lowerThreatOneStep' has already been declared` → blank app, all features dead).
  Before adding any new top-level `function`/`const`, grep the file for the name first.
  `lowerThreatOneStep(missionId, floor)` (monotonic threat-lower) and many fx/helper names
  already exist — reuse, don't redeclare.

- **Delayed-consequence pattern (used by adversary escalation + 28B incident evolution):**
  one cancel-safe timer + a queue, every deferred callback re-checks an "active & on-screen"
  guard (M1 `#dashboard` visible + `body.mission-running` + `missionStarted` +
  `!missionComplete` + `!demoRunning`) and tears itself down if false, and the clear fn is
  hooked into `clearM1DecisionTimers()` which `endGuidedRun()` calls on EVERY mission-exit
  (map/overview/back/reset/demo-abort/resume).
  **Why:** without this a deferred timer fires off-screen after the student navigates away.
  **How to apply:** any new timed side-effect must route its teardown through `endGuidedRun`
  and re-assert the guard inside the callback, not just at schedule time. Reactive/ephemeral
  state like this is intentionally NOT persisted in save/restore.

- **One-time credit:** containment/trust grants that could be replayed use
  `updateContainmentProgress(..., { stepId })` with a unique stepId; the engine dedupes by
  stepId so the credit can't be farmed.
