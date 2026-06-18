---
name: Sim reactive Network Map (career-sim popup)
description: The career-sim device-map overlay — now an INTERACTIVE decision surface (clicks reuse the existing graded path, no new scoring/persistence), its no-spoiler invariant, evidence-driven reveal model, and the body-not-careerOps overlay gotcha.
---

# Sim reactive Network Map (career-sim.js shipping; prototype = ops-center sim.js)

On-demand "◈ NETWORK MAP" popup for career-sim missions. Shipping copy lives in
`artifacts/ethical-cyberhackers-platform/career-sim.{js,css}`; the prototype it
graduated from is `sim.{js,css}` in `artifacts/ops-center-prototype`.

## INTERACTIVE (shipping career-sim.js) — clicks reuse the existing graded path
The map is **no longer review-only**. Clicking a revealed node records the SAME
graded judgment the notebook feeds — there is **no new scoring math and no new
persisted field**:
- Link a node to a determination via DATA only: `identifyAs:'<option id>'`
  (identify-model missions) or `classifyFile:'<file name>'` (M1 file-model). The
  id/name must already exist in `def.identify.options` / `def.files`.
- A flaggable click routes through the ONE graded setter — `setIdentification()`
  / `setClassification()` (file-model opens a floating `#simMapClassify` picker
  that then calls `setClassification`). Those setters now re-render the map when
  `SIM.mapOpen`, so notebook⇄map stay in two-way sync.
- **Locked** read-only at `SIM.stage==='report'` (`mapFlagLocked()`). Identify
  flagging is gated on `SIM.evidence.size>0` (`mapDetReady`) to mirror the
  notebook's identify section; classify nodes are `revealBy`-gated already.
- **No-spoiler still HARD:** only the player's OWN pick is highlighted (green,
  distinct from red/orange/yellow threat status). Correct ids live in data/config
  and are NEVER rendered. (Prototype `sim.js` map may still be presentation-only.)

## Invariants (don't break these)
- **Reuse, don't reinvent.** The map writes ONLY `SIM.identified`/`SIM.classified`
  via the existing setters (plus the transient `mapOpen` flag). Never add a
  parallel scoring path or a new persisted field — persistence flows through the
  existing save chain those setters already feed.
- **Per-mission gate.** Everything keys on `missionHasMap()` (`def.map.nodes`
  exists). Missions without a `map` block take a pure no-op branch — the
  `surfaceEvidence` hook is wrapped in `missionHasMap()`, and `updateMapButton`
  re-hides the button on every mission open. Add a map by adding a `def.map`
  block, never by branching shared fns on a mission id. All three core missions
  (M1 data-access, M2 network-exposure, M3 identity/auth) now ship a map block;
  the static `#simMapBtn` (index.html) auto-shows via `updateMapButton`, no wiring.
- **No-spoiler invariant (HARD requirement).** The map must NEVER be a new
  discovery. Every node/link/red-flag must be gated behind an already-surfaced
  evidence id (`revealBy`/`statusBy`); only genuinely brief-known neutral anchors
  may be `seed`. Watch the two surfaces that render BEFORE any evidence: (1) a
  `seed` node's `intel` text and (2) `map.cap` (the always-visible caption). Both
  must stay neutral/brief-known — describing a finding there leaks it (e.g. don't
  name the culprit account in the caption, don't say a seed vendor "read files
  out of remit"). Findings belong in `revealBy`/`statusBy`-gated nodes/links, and
  in `map.hint` (hint only renders once shown===total, i.e. fully solved).

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
Screenshots can't drive the terminal. To see the flagged map, temporarily add a
`?demomap=ev_a,ev_b,...` branch to the `?career=` deep-link block that calls
`surfaceEvidence(id)` then `openSimMap()`, screenshot, then REMOVE the hook (and
re-run `node --check` + `rg demomap`). Per-mission full-map ids:
- M1: `ev_release_context`, `ev_contractor_access`, `ev_pii_salary`,
  `ev_customer_pii`, `ev_confidential_pricing`, `ev_confidential_roadmap`,
  `ev_public_safe`.
- M2: `ev_subnet`, `ev_unknown_host`, `ev_not_in_inventory`, `ev_probe`.
- M3 (8 nodes): `ev_overview`, `ev_failures`, `ev_success`, `ev_location`,
  `ev_mfa_off`, `ev_changes`, `ev_reset`, `ev_access`, `ev_contractor_tie`. The M3
  map must cover the full takeover chain the task spells out — targeted account,
  attacker source, brute-force→success, impossible-travel, **MFA-off** (controls
  node, `ev_mfa_off`), **password reset / lockout** (lockout node, `ev_reset`),
  sensitive-data access, contractor tie — plus auth+alerting (the seed authsys
  carries the alerting role; no separate SIEM node needed, no evidence backs one).
Empty-map (no ids) must show ONLY seeds with a neutral caption — that screenshot
is the no-spoiler proof (M1 seeds: contractor+release pkg → "2 of 8"; M3 seed:
auth.cybercorp → "1 of 8").
