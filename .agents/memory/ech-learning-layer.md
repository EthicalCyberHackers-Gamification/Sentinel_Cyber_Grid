---
name: Analyst Learning Layer (prototype lab, M001)
description: Presentation-only teaching layer pattern + the soft-lock gotcha when a checkpoint gates a functional unlock.
---

# Analyst Learning Layer (ops-center-prototype lab.js, mission-001)

A toggleable, presentation/teaching-only layer (glossary + `explain`/`define`
command, tappable term chips, contextual analyst notes on discovery,
"supports conclusion" lines, one interpretation checkpoint, SOC debrief).
Entire layer is data-driven from a `learning` block on the mission dataset and
gated behind `labLearning()` (returns the block only when `learning.enabled`).
It reads only `def.learning` and never writes progress/XP/localStorage/sync/grading.

## Gotcha: a checkpoint that gates a FUNCTIONAL unlock must resolve on EVERY dismissal path
The interpretation checkpoint sits between the stage-4 pin threshold and the
containment unlock. The threshold trigger is a **pin** — once it's met, no
further pins fire, so if the player dismisses the modal (backdrop / Esc /
button) without it unlocking containment, the run **soft-locks** (nothing left
to re-trigger the gate).

**Why:** on-demand modals normally just close; but this one owns a progression
step.

**How to apply:** route ALL dismissal paths through the single modal chokepoint
(`labCloseModals`) and have it resolve the gate once — guarded by a `*Done`
flag, calling the unlock (`labUnlockContainment`, itself idempotent via
`labSetStage`'s `n<=stage` guard). Make the gate penalty-free so resolving on a
bare dismissal is acceptable. Reset all checkpoint flags in `openLab` for replay.

## Term chips render into hosts OUTSIDE #labConsole
The `labExplain`/`labKit` modal hosts are siblings of `#labConsole`, not
children. A glossary chip can appear in the terminal, the rail, the scorecard,
AND inside those modals. Bind ONE **document-level** delegated `[data-lab-term]`
click listener (in `labInit`), not a console-scoped one, or chips in the modals
go dead. Chips can't nest inside the pin `<button>` (button-in-button) — render
them in a sibling row.
