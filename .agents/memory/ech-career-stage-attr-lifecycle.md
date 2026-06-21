---
name: Career-sim mission-lifecycle DOM attributes
description: Why per-mission data-* attributes on #careerOps must be cleared explicitly on exit, not via the render path
---

# Career-sim mission-lifecycle DOM attributes

Any per-mission state written onto `#careerOps` as a DOM attribute/class (e.g. the
Progressive-UI-Focus `data-stage`) must be **cleared explicitly in
`returnFromCareerMission()`** on mission exit.

**Why:** `renderStageBar()` (the chokepoint that sets `#careerOps[data-stage]`) only
clears the attribute on its no-`SIM.def` branch — but leaving a mission does **not**
clear `SIM.def`, and `renderStageBar()` is not called on exit. So the auto-clear path
never fires on return; the attribute would linger on the hidden mission shell and be
carried into the next mission until the first re-render.

**How to apply:** when adding a mission-scoped attribute/class on `#careerOps`, add an
explicit `removeAttribute`/`classList.remove` in `returnFromCareerMission()` (this is
already how `career--nb-focus` and `data-stage` are handled). Don't rely on the
renderer's "no active mission" branch to tidy up.
