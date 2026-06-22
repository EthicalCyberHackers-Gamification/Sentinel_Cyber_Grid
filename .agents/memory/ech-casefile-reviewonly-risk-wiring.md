---
name: Case-file mission reviewOnly files + no-spoiler risk wiring
description: career-sim notebook missions mixing tier-classified data files with narrative reviewOnly files, and why a risk's trigger evidence must match its stated conclusion
---

Two durable invariants for career-sim.js case-file / Analyst-Notebook missions
(the shared engine behind M1-M4).

## 1. reviewOnly vs classifiable files
A mission's `files` can mix files that get a CIA tier classification with
narrative files that are read-only. Decide per file: a classifiable file has a
tier `preview`; a reviewOnly file does not.

- The classify scorecard, the done/total counts, `classificationQuality`, and
  `performanceSignals` must iterate `classifiableFiles()`, NOT all files — or
  reviewOnly narrative files inflate the denominator and the mission can never
  reach 100%.
- "Has the player investigated this file yet?" checks must use
  `fileInvestigated` (file read OR its evidence surfaced), NOT
  `fileClassificationVisible` (which also requires classifiable) — otherwise
  reviewOnly files stay stuck as "not yet investigated" forever.
- `setClassification` must reject reviewOnly files.

## 2. No-spoiler risk wiring (the subtle one)
A `risk` whose label states a CONFIRMED conclusion (e.g. "The release has no
completed internal approval") must be `triggeredBy` ONLY the evidence that
actually confirms it (the approval-record beat), never an earlier beat's
evidence.

**Why:** caught in review — the first beat ("contractor prepared the release")
had careful no-spoiler copy, but it still appeared in the conclusion-risk's
`triggeredBy`, so the case board / report leaked the missing-approval finding at
the first beat. Editing the evidence COPY alone does not stop the leak.

**How to apply:** when adding or reordering evidence beats, audit every
`risk.triggeredBy` list AND the evidence `layers` (analyst/technical) together.
The conclusion belongs to its confirming beat; earlier beats may only raise an
open question ("internal review not yet confirmed"). Keep the early beat
triggering a neutral who/what risk so it still surfaces something on the board.
