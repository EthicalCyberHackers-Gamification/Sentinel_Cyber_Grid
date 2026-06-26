---
name: Shared-accessor behavior drift
description: A correctly flag-gated, "one-mission-only" feature can still regress other missions if it reroutes a SHARED reader through a new model-agnostic accessor that changes the default behavior.
---

# Shared-accessor behavior drift

When adding a per-mission presentation-only feature, the data-gate (`def.<flag>`)
must wrap the **behavior change**, not just the new code path. A shared reader that
you reroute through a new "model-agnostic" accessor can silently change behavior for
**all** missions even though the new feature is flag-gated.

**Why:** Introducing a five-phase investigation model for Mission 1 added
`missionTrackRows()` (returns phase rows when `def.investigationPhases` is set,
else falls back to `objectiveTrackState()`). `feedObjectiveLabel()` was rerouted
from `objectiveTrackState()` → `missionTrackRows()` and changed from "always
`rows[0].label`" to "the **active** row." Because the fallback feeds M2–M4 too,
that quietly altered the objective-feed label for missions that were supposed to be
byte-identical. Caught in architect review, not by typecheck/tests.

**How to apply:** When a shared fn now calls a new accessor, gate the *new*
behavior on the feature flag (here `missionUsesPhases()`) and return the **exact
prior expression** in the else branch. After any such reroute, diff the shared fn
and confirm unflagged missions still hit the original code path. Don't assume
"new feature, old missions untouched" — a shared accessor is the leak.
