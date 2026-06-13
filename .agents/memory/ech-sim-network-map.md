---
name: Sim reactive Network Map (career-sim popup)
description: Review-only device-map overlay for ops-center-prototype career missions — its presentation-only invariant, the evidence-driven reveal model, and the body-not-careerOps overlay gotcha.
---

# Sim reactive Network Map (Task #94, prototype)

On-demand "◈ NETWORK MAP" popup for career-sim missions (`sim.js`/`sim.css`/
`index.html` in `artifacts/ops-center-prototype`). Same presentation-only family
as the lab/holotable/console interiors: it READS `SIM.evidence` and writes DOM —
nothing else.

## Invariants (don't break these)
- **Presentation-only.** Persists nothing, never writes `ech.progress.v1`, touches
  no score/resource/outcome. The only new SIM field is the transient `mapOpen`
  flag, reset on every `openCareerMission`.
- **Per-mission gate.** Everything keys on `missionHasMap()` (`def.map.nodes`
  exists). Missions without a `map` block (M1/M3 today) take a pure no-op branch —
  the `surfaceEvidence` hook is wrapped in `missionHasMap()`, and `updateMapButton`
  re-hides the button on every mission open. Add a map by adding a `def.map`
  block, never by branching shared fns on a mission id.

## Reveal model ("behavior before terminology")
- A node shows when `seed` OR its `revealBy` evidence id is in `SIM.evidence`.
- Status resolves rank-based via `MAP_STATUS_RANK` (self>suspicious>target>unknown>
  identified): base `status` plus every matching `statusBy:{evId:status}` entry,
  highest rank wins. **This is what makes it order-independent** — surfacing
  evidence in any order yields the same flagged state. When you add a new status,
  give it a rank or the highest existing one silently wins.

## Gotchas
- **Overlay + intel card live on `document.body`, OUTSIDE `#careerOps`.** So the
  delegated `#careerOps` click handler only routes `[data-map-open]`; the overlay
  binds its OWN backdrop + `[data-map-close]` listener. Don't expect the careerOps
  delegate to catch the close button.
- Built-once singletons: `simMapEnsure()` / `simMapIntelEnsure()` guard on a
  module-level `let` so listeners aren't re-bound. `renderSimMap` rebuilds node/
  link children each call (old listeners GC with the elements).
- SVG `<line>` class must be `setAttribute('class', …)`, not `.className`
  (read-only on SVG elements) — same gotcha as the SOC console map.
- The map button lives in the **static** terminal panel head, which
  `renderTerminalPanel` never rewrites; toggle/label it via `updateMapButton`.
- Escape closes the map first (`if (SIM.mapOpen) closeSimMap(); return;`) before
  falling through to exit the mission.

## Verifying the populated overlay
Screenshots can't drive the terminal. To see the flagged map, temporarily surface
the relevant evidence ids in the deep-link block and `openSimMap()`, screenshot,
then remove the hook (mission-002 ids: `ev_subnet`, `ev_unknown_host`,
`ev_not_in_inventory`, `ev_probe`).
