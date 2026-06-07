---
name: World Continuity layer
description: The presentation-only recurring-NPC / resolved-trace / bulletin narrative layer in the shipping app
---

# World Continuity (presentation-only)

`WORLD_CONTINUITY` (keyed by mission-001..006) plus `WC_EMPLOYEES` /
`WC_THREAT_ACTORS` / `WC_DEPARTMENTS` / `SECURITY_BULLETINS` make CyberCorp feel
persistent: recurring employees report incidents, completed missions surface a
"Case file OP-NNN: <resolved>" trace, `connects` links a mission to a prior one
(only once that prior mission is complete), and bulletins with `after` only enter
rotation post-completion.

**Why:** the whole layer is AUTHORED data surfaced READ-ONLY, derived each render
from `missionMapStatus()`. It must never write localStorage / call `saveProgress` /
touch cloud sync — it is flavor, not state.

**How to apply:**
- Resolved traces render via `ocv2RenderWorldMemory()` into `#ocv2IntelFeed` as
  `.ocv2-intel--memory` rows. It is idempotent (removes its own rows first) and is
  the only manager of memory rows.
- **Ordering gotcha:** `ocv2InitIntelFeed()` must guard static-base population on a
  STATIC marker (`.ocv2-intel-item:not(.ocv2-intel--memory)`), NOT
  `feed.children.length` — otherwise memory rows added first suppress the baseline
  intel for returning players. Keep `initOcv2()` before `ocv2RenderWorldMemory()`
  in `renderOcPanelV2()`.
- Incident-card context line = `wcIncidentContext()` → `#ocv2CardContext`.
- Bulletins rotate via one `setInterval(ocv2RotateBulletin, …)` inside the
  one-time `initOcv2()` guard (don't re-arm on re-render).
