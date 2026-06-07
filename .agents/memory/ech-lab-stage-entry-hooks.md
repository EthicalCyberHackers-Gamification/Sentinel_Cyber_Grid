---
name: Lab stage-entry hooks (once-per-stage presentation)
description: The five canonical sites where a progressive-lab mission enters each stage — use these for any once-per-stage presentation-only overlay.
---

A progressive-lab mission (lab.js) advances through stages 1→5, and there are
exactly five distinct code paths that effect a forward stage entry. Any
once-per-stage, presentation-only addition (e.g. the Investigative Framing
layer) must hook all five and nothing else:

- **Stage 1** — `openLab` (right after the intro prints). openLab always resets
  to stage 1; there is no mid-lab resume.
- **Stage 2** — the stage-1 grep "aha" block, gated by
  `if (LAB.stage === 1 && aha.advanceTo)` (a file-read discovery, not a command).
- **Stage 3** — `labRevealCampaign` (campaign/correlation reveal).
- **Stage 4** — `labDispatch`: capture `const fromStage = LAB.stage` before the
  `run.advanceTo` call, then fire only `if (LAB.stage > fromStage)`. This guard
  is essential — without it, re-running an already-ran command or any
  non-advancing command would re-fire.
- **Stage 5** — `labUnlockContainment` (containment unlock).

**Why:** stages are reached through heterogeneous triggers — boot, a file-read
discovery, two dedicated reveal functions, and a command dispatch — so there is
no single chokepoint. Stage 3 and 5 set `_justAdvanced` to suppress the
immediate `→ Next` guide; inserting a print there does not disturb that.

**How to apply:** drive per-stage content from a dataset block keyed by stage
(e.g. `def.framing[stage]`) and a helper guarded by `if (!f) return`, so a
mission lacking the block is silently skipped. Keep it presentation-only —
call only `labPrint`, never touch stage/evidence/scoring/XP/persistence.
