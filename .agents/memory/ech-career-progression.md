---
name: Career progression (prototype, Phase 2)
description: How the ops-center-prototype derives role/promotion from progress, read-only, and frames missions by tier.
---

# Career progression layer (ops-center-prototype only)

A presentation-only "career" layer on top of the existing read-only progress
mirror. The analyst advances a 7-tier role ladder (`ROLE_LADDER` in `oc.js`,
keyed off `NODE_CHAIN`) purely by **counting completed real missions** — there is
no separate progression store.

**Rule: never persist career state.** Current role, clearance, advancement
progress, and the active assignment are all *derived on each render* via
`getCareerState()` from the same `getMissionStates()` / `getMissionProgress()`
mirror. Nothing is written to localStorage. This keeps the prototype's read-only
invariant intact (same as the Phase 1 identity layer).

**Why a session-only last-seen tier:** a read-only mirror has no "promotion
event" — it only knows the current standing. Promotion detection compares the
freshly computed tier against an in-memory `_lastSeenRoleTier` (page-session
only). First render seeds the baseline (no notice on load); a later render with a
higher tier fires the one-time notice. The panel must re-render on the same
`focus`/`pageshow` re-sync as the map, or returning from a completed mission
shows the new role but never the promotion notice.

**Progress bar uses in-mission confidence:** each promotion is one mission, so a
whole-mission bar would only ever be 0% or 100%. The bar instead fills with the
*active* assignment's in-progress confidence (missions 1–3 expose it; 4–6 don't,
so theirs stays empty until complete). Don't treat the bar as "missions toward
promotion" — it's confidence in the current assignment.

**Mission framing is labels only.** `roleForNode()` tags each incident with the
tier role + scope shown in the incident card briefing and the ROLE TIER meta row.
This changes *wording*, never mission mechanics/difficulty.

Scope: prototype only. Graduating Phases 1+2 into the live
`ethical-cyberhackers-platform` is a deferred future task.
