---
name: Orientation guided-tutorial panel (Assignment 000)
description: How orientation guidance is structured — a single left-dock step list, not scattered terminal coaching — and how it stays gated to mission-000 only
---

Assignment 000 orientation (`?lab=mission-000`, deep-link only) consolidates ALL
beginner guidance into ONE dominant left-dock panel: an ordered, checkable step
list (`labRenderTutorial` in `lab.js`, driven by `def.tutorial` in
`lab.missions/mission-000.js`). Current step = first incomplete; it shows a plain
instruction + a one-click "Run `<cmd>`" button (calls `labRun`). Completed steps
show a ✓ + a "what that told you" result line. Upcoming steps are dimmed labels
(no command revealed). There is NO per-command terminal coach anymore.

**Why:** the earlier approach scattered guidance across multiple panels + a single
abstract terminal line ("after ls nothing helpful prints"); the user found it too
abstract and asked for FEWER places to look. A single stateful step list is the
fix — guidance lives in exactly one place and advances itself.

**How to apply (gating — keep airtight):** the tutorial path is entered only when
`labIsOrientation() && Array.isArray(def.tutorial)`. `labIsOrientation()` is true
iff `def.report.choices` exists — which is mission-000 ONLY. So 001/002 keep
`labSupportV2()` and graded 001–006 are untouched. Any new orientation surface
must reuse this same gate. Presentation-only: never writes XP / progress / persist.

**Step completion must reflect the INTENDED OUTCOME, not mere command invocation.**
`labTutorialDone(step)` derives completion from lab state. Trap: `grep` cannot key
on `LAB.ran.has('grep')` — a wrong/empty grep would still tick it done. Only the
correct grep (right pattern + `access.log`) fires `grepAha`, which is the sole
thing advancing orientation stage 1→2, so key the grep step on `LAB.stage >= 2`.
Same principle for any content-dependent step: gate on the state the right action
produces, not on the verb being typed. Command strings resolve from
`def.tools[].cmd` (single source of truth); only wording lives in `def.tutorial`.

**SOC workflow framing (6 stages) sits ON TOP of the step list.** Orientation is
also presented as 6 named SOC stages — Triage, SOC Tool Analysis, Correlation,
Escalation Decision, Response, Debrief — so the beginner perceives a PROCESS, not
a command list. Implementation, all data-gated to mission-000:
- `def.socStages[]` drives a read-only tracker rail above the steps; each
  `def.tutorial[i].stage` tags its step to a stage. `stageDone(key)` = all that
  stage's steps done; step-less stages (Response/Debrief) fall back to `allDone`
  (report filed), so they flip ✓ together — neither shows as "current".
- A command-less `correlate` step ("connect the clues") renders the `def.correlation`
  block (clues + benign CDN/DNS contrast + summary) with an **acknowledge** button
  (`data-lab-tut-ack`, distinct from `data-lab-tut-run`) that sets in-memory
  `LAB._correlated`, prints the summary, re-renders. Completion fallback:
  `_correlated || _reportOpen || done` so jumping straight to the decision can't
  strand it. `LAB._correlated` is reset in `openLab` next to `_reportOpen`.
- The report step is the "ANALYST ESCALATION DECISION" (4 choices incl. a wrong
  over-reaction). `def.consequence` (terminal block) prints in `labCompleteReport`
  before the scorecard; `debrief.whatNotDone` renders in the orientation scorecard.
All of the above are presentation-only — no XP, no persist, no scoring change.
