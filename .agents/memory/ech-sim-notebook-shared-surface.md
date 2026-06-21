---
name: Sim notebook is the shared M1–M4 surface
description: Why the career-sim right column can't be removed/relocated as an "M1 layout tweak" — it's the shared judgment/review/completion surface for all four missions.
---

# The right column is load-bearing for every mission

In the career-sim play screen (`artifacts/ethical-cyberhackers-platform`,
`career-sim.js` + `index.html`), the right column `#simColRight` holds two things:

- `#simEvidence` — rendered by `renderEvidencePanel()`, the ONE shared renderer for
  Missions 1–4. It paints the full case-file notebook (evidence collected, confidence
  meter, objectives, the two-step judgment cards, answered-call records, findings) AND
  is the chokepoint that calls `syncDecisionDock()` at its end. Many handlers query
  `#simEvidence` directly (scroll-restore, live confidence-meter update, notebook
  collapse/focus, `openChallengeInComms`, `focusNextComms`).
- `#simFeedback` — the feedback / consequence / completion-debrief surface.

The Decision Dock only surfaces the ACTIVE pending call — it is not a replacement for
the notebook's full review/record or for the feedback panel.

**Rule:** Removing or relocating the right column (or hiding `#simEvidence` behind a
dock "Case Review") is a cross-cutting change to Missions 2–4, NOT an M1-only layout
tweak. Treat it as shared-surface work, not decluttering chrome.

**Why:** A "Mission 1 clarity redesign" attempted to move the read-only review into
the dock and delete the column. That breaks M2–M4 (un-redesigned) judgment/verdicts/
completion, creates a hidden-vs-visible split-brain, and strands the handlers above.

**How to apply:** Only attempt it when you can run an interactive M1–M4 smoke test
(open → read/grep → answer Sarah's two-step → decide → return → reload). That test is
NOT possible from this environment (static screenshots, can't prime localStorage, no
runTest), so static checks alone can never clear the acceptance gate — defer instead.
Additive duplication (keep the column AND add a dock "Case Review") is the wrong fix:
it adds redundancy instead of decluttering.
