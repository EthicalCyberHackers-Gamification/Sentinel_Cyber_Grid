---
name: Progressive Lab step coach (labGuide)
description: Why/where per-step "what to do next" direction is injected across all lab missions, and the target-group filter gotcha.
---

# Progressive Lab step coach

The lab teaches direction in two halves. **Stage 1** coaches via dataset hooks
(`onCat.next`, grep `grepAha.unlock`). **Stages 2–5** are driven by an
engine-level coach `labGuide()` in `lab.js` — one concise `→ Next: …` line
(class `guide`) printed after every meaningful action: a tool run (`labDispatch`
tail + its already-ran early return), a pin (`labPin`, `labPinCmd`), and a
containment step / report (via `labDispatch` tail).

**Why engine-level, not per-dataset:** all 6 missions share the same shape
(`hintFlow.stage2/stage4.{group,need}`, `containRequired`, `contain[k].label`,
`tools[].{run,hint,unlock}`), so one state-derived helper covers every mission
with zero per-file authoring and stays consistent. It is **presentation-only** —
reads state, prints text, never touches evidence/scoring/XP/persistence.

**Gotcha — "remaining tools" must be filtered by target group, not unlock.**
At stage 3/4 the gating group is `soc`, but earlier-stage triage tools still have
`unlock <= stage` and may be unrun (a player runs/pins only the 3 needed of N).
Recommending them with "run these to surface more indicators" is false direction
(re-triggers the exact "purpose/direction lost" complaint). The todo filter must
keep only tools whose `run.discover` resolves to an indicator in
`hintFlow.stageX.group` — not `unlock <= stage`.

**`_justAdvanced` flag:** set in `labRevealCampaign` / `labUnlockContainment` so
the next `labGuide()` call suppresses its nudge (the reveal text already gives
direction). It is consumed (cleared) on read; initialize it in the `LAB` object
and reset it in `openLab()` so it can't leak a suppressed first nudge into a
fresh/replayed lab.

**How to apply:** any new lab stage/tool, or any change to which group a stage
gates on, must keep the discover-in-target-group invariant or the coach will
recommend the wrong commands.
