---
name: Career-sim verdict scoring & gauge responsiveness
description: How the leadership verdict tier and the three headline gauges are made to reflect player skill, and the non-obvious traps when rebalancing them.
---

# Career-sim verdict scoring & gauge responsiveness

The leadership verdict (`computeRecommendationOutcome`) and the three headline
gauges (Threat Defense / Business Impact / Leadership Trust, all
presentation-only, derived from the six resources) must reflect how well the
analyst actually performed.

## Rules
- The verdict TIER is **skill-driven**: classification accuracy + graded
  discovery judgments carry the majority of the score. Evidence-surfaced,
  earned standing, timing, investigation-complete and severity are SMALL
  modifiers, never a floor. A thorough-but-inaccurate run (~71% / ~50%) must
  land *below* "Approved".
- **Standing must never be threshold-crossing.** The `executiveTrust` /
  `careerReputation` terms in the score are capped tiny (combined ~+6) on
  purpose — a maxed-out veteran still can't lift a weak-skill run over the
  "Approved" line.
- The gauges stay presentation-only. To make them respond to performance you
  move the **underlying six resources**, via (a) verdict-multiplier-scaled
  action deltas and (b) a `verdictStandingDeltas(verdict)` layer merged on top
  (summed by `mergeDeltas`, clamped by `applyResourceDeltas`). Never touch the
  gauge math.

## Why / traps (each cost real debugging)
- **complianceExposure must start above its 0 floor** (it's a `higherBetter:false`
  resource) or its 30% slice of Threat Defense can only go up — reductions
  clamp to a no-op and the gauge looks frozen on the legal-review path.
- **A weaker multiplier scales an action's business COST down**, so without an
  explicit penalty a weak verdict paradoxically *improves* Business Impact.
  The `businessContinuity`/`organizationBudget` hits in `verdictStandingDeltas`
  for Partially/Deferred exist to overpower that and keep BI directionally
  correct (strong preserves it best, weak erodes it).
- **Gauges need band headroom.** If every start resource pins the gauges in
  "Strong", single-mission deltas never cross a band and the meters read as
  static. Start standing mid-range so good play climbs into Strong and weak
  play falls into Caution.
- Changing `CAREER_DEFAULTS` only affects new/reset saves — `loadCareerState`
  preserves an existing player's resources (no migration; schemaVersion same).

**How to apply:** when asked to make meters/verdicts "reflect performance",
rebalance the score weights so skill dominates AND add a verdict-keyed standing
delta on the resources; then re-validate the tier invariant and each gauge's
direction across low/default/high saved standing, not just fresh defaults.
