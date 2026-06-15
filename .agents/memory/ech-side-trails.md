---
name: Optional Side-Trails (earned-only, presentation-only)
description: The career-sim "optional side-trails / red-strings / foreshadowing" reward pattern and the invariants any new mission must follow when adding one.
---

# Optional Side-Trails (career-sim)

An additive, per-mission **data-gated, presentation-only** layer (proven on
mission-002) with three surfaces: optional side-trails (a two-step
observation→justification judgment in the briefing "OPEN LEADS" panel), red
strings (recurring-entity marker + cross-case timeline popover on a map node),
and an end-of-mission foreshadowing card in the debrief.

## Invariants (do not break when extending to M3+)
1. **Earned-only, never a perk.** Resolving a trail must NOT touch computed
   Investigation Confidence (`investigationConfidence()`), evidenceQuality,
   scoring, resources, role, `completedMissions`, or Supabase/sync. The only
   reward is cosmetic state (a Case-Board map node + a resolved card).
2. **Persist via two flat `setMissionFlag` keys**, not companyHistory (see
   `ech-campaign-continuity.md` — non-mission keys are dead data there):
   `sideTrailResolved:<trailId>` and `sideTrailBoard:<boardKey>`. Reads are flat
   off `CAREER.missionFlags`. Exactly-once is guaranteed by the early-return in
   the resolve fn when already-resolved.
3. **Data-gated = other missions untouched.** A mission opts in via top-level
   `def.sideTrails[]` and/or `def.foreshadow`, and per-node `sideTrailReveal` /
   `redString`. Absent those keys, every code path early-returns / skips.
4. **Map count honesty.** Side-trail bonus nodes (`node.sideTrailReveal`) are
   EXCLUDED from `mapVisibleNodeCount()` so "all devices mapped" stays correct.
5. **Transient picks reset per open.** `SIM.sideTrailOpen` (Set) +
   `SIM.sideTrailJudgments` ({}) are reset in `openCareerMission` — never
   persisted. Only the correct pick locks a step; wrong picks are retry-friendly.
6. **Red strings stay open across the arc.** A node's `redString` shows
   "UNRESOLVED ACROSS CASES" until a `redString.closedBy` trail id resolves;
   leave `closedBy` unset for a multi-mission thread (e.g. J. Demir spans M1→M2,
   closed later).

**How to apply:** all authored strings render through `mapEsc()`. To add a trail
to a new mission, add the `def.*` data + a map node with `sideTrailReveal` (and a
link), and verify with `node --check` + the artifact `typecheck` (the file is not
node-loadable for unit tests — DOM-coupled).
