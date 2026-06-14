---
name: Shared Analyst Notebook render path
description: The career-sim evidence/notebook panel renders for every campaign mission, so new sections must be data-gated off out-of-scope missions
---

# Shared Analyst Notebook render path

`renderEvidencePanel()` (the "Analyst Notebook" panel in career-sim) is the SAME
render path for every campaign mission (M1–M4). Anything you add to it appears in
**all** of them, including Mission 1.

**Why:** a new "Active Investigation" feed was added unconditionally to this panel
and immediately leaked into Mission 1, which was explicitly out of scope ("no
Mission 1 changes"). It passed local checks (node --check / typecheck / unit tests)
but was caught in code review.

**How to apply:** gate any new notebook section behind a per-mission dataset flag on
`SIM.def` (e.g. `investigationFeed: true` on the M2–M4 defs) and have the section's
HTML builder return `''` when the flag is absent. Do NOT branch on a mission id, and
do NOT render the section unconditionally. Leaving the out-of-scope mission's dataset
untouched keeps its panel visibly identical. Detect cross-section state (e.g. a
"notebook updated" notice) once at this render chokepoint, not inside the HTML
builders, and make that detection a no-op when the flag is off.
