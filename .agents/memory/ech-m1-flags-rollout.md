---
name: Mission-1 flags — what rolls out to M2-M4 and what must not
description: Which Mission-1-only career-sim flags are safe to generalize to other case-file missions, and which are deliberately M1-only.
---

# Mission-1-only flags: rollout policy

When asked to "bring Mission-1 features into the other missions," judge each flag
by whether it fits the later missions' curriculum — do NOT blanket-apply.

- **`reviewBeforeCall` (the "read what came up, then continue" Decision-Dock pacing
  beat)** — SAFE to generalize, and now set on every case-file mission (M1-M4). It
  is gated on `reviewBeforeCall && caseFileNotebook` (`reviewGateMode()`), is
  presentation/sequencing-only, and never touches grading, persistence, the lock
  target, or the no-spoiler invariant. Challenges only become visible after their
  evidence surfaces from a terminal command (`surfaceEvidence` is never called at
  mission open), so the beat never fires before the player has run anything.

- **`quietNotebook` (the calm, dock-first right-column notebook)** — SAFE to
  generalize, and now set on every case-file mission (M1-M4). Gated on
  `quietNotebook && caseFileNotebook` (`quietNotebookMode()`, no Case Board
  dependency). Presentation-only: it only suppresses the evidence/feed LIVE/NEW
  pulse badges and changes INITIAL collapse state — the player's own `SIM.nbCollapsed`
  toggles always win, and the graded call always lives in the Decision Dock
  (`analystJudgmentHtml` renders logged calls read-only). Key nuance: a Case Board
  mission (M1) collapses EVERY section by default (the board is its work surface),
  but a quiet mission WITHOUT a board (M2-M4) must collapse only the bulky read-only
  RECORD logs (`NB_QUIET_RECORD_COLLAPSED` = evidence/feed/comms) so its orienting
  (objectives) + action (identify/response) sections stay open — collapse-all on a
  boardless mission hurts orientation at mission start. Branch the collapse policy on
  `caseBoardMode()`, never a mission id.

- **`uiComplexityLevel:'simple'` (the first-day declutter)** — deliberately M1-ONLY.
  It hides ~11 advanced modules (confidence meter, objective tracker, investigation
  feed, inventory board, concept cards, analyst powers, etc.). Those modules ARE the
  curriculum of M2-M4, so applying the declutter there would strip their teaching
  surfaces and break the flow. Keep it on M1 only.

- **`grepTriage` and the first-shift `onboarding`** — M1-content-specific tutorial
  scaffolding (tied to M1's release-folder files / first-shift intro). Do not
  generalize without authoring per-mission curriculum content for each.

**Why:** the request "roll M1 items into M2-M4" is recurring; the trap is treating
the declutter as a universal polish when it actually removes later missions'
curriculum. **How to apply:** generalize pacing/sequencing-only beats freely; gate
content/curriculum-altering flags per-mission and never on a mission id.
