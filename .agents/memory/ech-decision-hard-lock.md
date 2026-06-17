---
name: Decision-gate hard-lock
description: How to force a player to answer a pending judgment before progressing without leaving a bypass — the gate predicate must be stage-independent and shared across EVERY action entry point, not just the obvious one.
---

# Decision-gate hard-lock (career-sim Decision Dock)

When a feature must FORCE the player to answer a prompt before progressing (the
Decision Dock blocks the SOC terminal until Sarah's pending call is answered),
locking only the obvious surface (the terminal input) is not enough.

## Rule
- The "is a decision pending?" predicate must be **stage-independent**: true
  whenever a pending call exists, with the ONLY exception being the finalized
  stage (`report`). Gating it on a single mid-stage (e.g. `stage === 'investigation'`)
  leaves a hole.
- EVERY way to act on the mission must share that ONE predicate as a guard — not
  just the input you think of first. In career-sim that meant the terminal submit +
  the command runner AND every decision entry point: reveal-actions, choose-action,
  locked-action, and submit-recommendation (including the alternative-recommendation
  `data-rec` button, which funnels through submit-recommendation).

**Why:** the terminal lock was first gated on `stage === 'investigation'`. A player
could type `decide` early (no call pending yet → allowed → stage flips to `decision`),
then keep running commands; the terminal stayed unlocked because stage was no longer
`investigation`, and the now-visible handling-action buttons let them finalize the
mission with a call still unanswered. It took two separate architect passes to surface
both the auto-reveal flip and this early-`decide` variant — easy to miss because the
first fix *looks* complete.

**How to apply:** centralize the predicate in ONE helper (e.g.
`caseFileDecisionPending()`) and reuse it for the lock AND all action guards. Make the
lock release the instant nothing pends — drive it from the sole graded write's
re-render chokepoint — so it can never soft-lock; exclude only the finalized stage so
post-decision UI is never frozen.

## A11y aside — don't double up aria-live
If a stable host region announces on each full `innerHTML` swap, the inner repeated card
markup must NOT also be `aria-live`. The notebook rebuilds the whole panel every render,
so an inner-card live region re-announces every logged card = spam. Keep ONE live region
on the stable host (the dock), drop it from the shared card markup.
