---
name: Reasoning-gate pacing must stay resume-safe (ECH)
description: How to add a cinematic "Reviewing…" pacing delay to an interpretation gate without risking lost progress on mid-beat exit.
---

# Cinematic pacing on interpretation gates must not defer persistence

The M1/M2/M3 interpretation gates support a short "Reviewing analyst
assessment…" pacing beat (700–1200 ms) before the verdict shows. The
shared timing helper is `reviewAssessmentDelay()`.

## Rule

On a CORRECT gate answer, commit the completion state SYNCHRONOUSLY:
mark the gate answered, raise analyst confidence, apply command unlocks,
and `saveProgress()`. Only the COSMETIC reveal may live inside the
`reviewAssessmentDelay()` timer: swapping the feedback text from the
"Reviewing…" pending state to the verdict, the manager line, and the
follow-on evidence-pin offer / next-objective.

**Why:** an earlier version moved the rewards + `saveProgress()` INTO the
delayed callback. Because the gate-exit teardown (`endGuidedRun`,
`resetMission2/3`) cancels those tracked timers, leaving during the ~1 s
beat silently dropped the gate's progress on reload — breaking the
project's resume-safe / idempotent-completion contract.

**How to apply:** re-entry is already blocked by the immediate
`m{2,3}ReasoningAnswered.add(key)` + early-return guard; unlocks are
idempotent via `Set` membership before `syncM{2,3}Buttons`. Keep both
the pacing timer and the inner pin-offer timer pushed onto
`m{2,3}ReasoningTimers` so they stay cancelable. Every new pacing
animation must also honor `prefers-reduced-motion`.
