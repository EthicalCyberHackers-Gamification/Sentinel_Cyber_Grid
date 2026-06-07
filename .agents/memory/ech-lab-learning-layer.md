---
name: Lab learning layer (explain command + SOC debrief)
description: How the shipping lab's presentation-only teaching layer is gated and wired.
---

The progressive lab (`lab.js`, `lab.glossary.js`, `lab.missions/*`) has a
presentation-only "learning" layer: an `explain`/`define <term>` terminal
command backed by the shared `LAB_GLOSSARY` (object keyed by lowercase term),
plus a structured SOC debrief appended to each mission's completion scorecard.

**Gate:** each mission carries `learning:{enabled,terms,debrief}`. `labLearning()`
returns the block only when `enabled`. STRICT gate = the whole surface must
*vanish* when disabled, not merely render empty:
- the `explain`/`define` route in `labRun` only fires when `labLearning()` is
  truthy (otherwise it falls through to "command not found");
- `labOpenGlossary` early-returns when `!labLearning()`;
- the help line, term chips, and scorecard debrief are all conditioned on it.

**Why:** the task constraint was "flip it off and everything vanishes." A router
that always routes `explain` (printing "no glossary available") technically
leaks the command past the gate — code review flagged this. Gate at the entry
points, not just the render.

**How to apply:** any new learning-layer entry point (command, chip, modal open)
must check `labLearning()` itself. Term-chip clicks use one delegated
`[data-lab-term]` listener bound ONCE in `labInit` (document-level, never
leaks). `openLab`/`returnFromLab` call `labCloseModals()` so a stale glossary
popup can't survive a mission switch and bypass re-gating. All `terms[]` and
`concepts[]` keys must exist in `LAB_GLOSSARY` (validate at runtime). The layer
never touches XP/progress/persistence/grading — keep it read-only.
