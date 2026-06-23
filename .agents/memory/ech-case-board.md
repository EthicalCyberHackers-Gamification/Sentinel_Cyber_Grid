---
name: Passive Case Board + classification-in-dock + investigative dock (career-sim)
description: Mission-1 investigation-game surface — a self-building passive Case Board, classification relocated into the Decision Dock as a non-blocking card, de-quizzed chat dock, and the coverage-only readiness readout; gating, transient boundaries, and no-spoiler rules.
---

# Case Board + investigative dock (career-sim.js / career-sim.css)

A per-mission, data-gated alternative to the standard notebook. Mission 1 opts in;
every behavior branches on `def.*` flags, NEVER on a mission id, so unflagged
missions (M2–M4) render AND grade byte-for-byte identical (verified: M2 keeps the
full confidence-meter / objectives / feedback notebook, no board).

**Direction shift (durable):** the board is now a PASSIVE, self-building case file,
NOT click-to-place. There is no tray, no pickup, no drop-zone buttons. Surfaced
findings auto-appear under their configured zone; the chain auto-draws; the
conclusion lights when all configured findings have surfaced. File classification
moved OUT of the board and INTO the dock as its own card.

## Gating flags (mission-001 def)

- `caseBoard.passive` → `passiveBoardMode()`: board renders read-only/self-building.
- `dockMode:'investigation'` → `dockInvestigationMode()`: dock reply chips, no A/B/C
  letters, no option grid (chat with Sarah).
- `classificationDock` → classification card lives in the dock.
- `quietNotebook` (+ `caseFileNotebook`) → `quietNotebookMode()`: notebook quiet.
- `gamefeelReadiness` → `caseBoardReadinessHtml()` readiness bar.

## Transient vs graded boundary (core invariant)

- Board placement view, dock draft, multi-select toggles, dock-expanded, readiness
  are TRANSIENT presentation state. Reset on open; never `saveProgress` /
  localStorage / cloud sync; never gate the terminal.
- `setDiscoveryJudgment` is the SOLE graded judgment write; `setClassification` the
  SOLE graded classification write. The dock classification card routes ONLY through
  `setClassification` via the existing `data-classify-file` / `data-classify-val`
  delegation — no new writer/save path. `classificationQuality()` denominator is
  unchanged (unclassified still counts incorrect, still weakens score).

## Classification card is NON-blocking (architect rule)

- Classification is NOT a third discovery step. It must never join
  `caseFileDecisionPending()` / `decisionLocked()` (that would pollute
  `challengeAnswered`/`judgmentQuality` and lock the terminal). Unclassified files
  weaken the final score but do NOT gate progress. Dock auto-expand for classify
  mode is presentation-only.

## No-spoiler rule for the readiness readout

- `caseBoardReadinessHtml()` (gamefeelReadiness) derives ONLY from
  `evidenceQuality()` — coverage, i.e. fraction of evidence weight surfaced. It must
  NEVER read `classificationQuality()` or any ground-truth/verdict signal, or it
  leaks the answer. **Why:** a "risk/readiness" meter that climbs toward the verdict
  telegraphs block-vs-allow. Keep it a pure investigation-completeness bar.

## Quiet notebook

- `quietNotebookMode()` suppresses the noisy pulse badges (`nbSectionStatus` returns
  null for the `evidence`/`feed` keys → no LIVE/NEW) and default-collapses sections
  in `applyNotebookChrome` (`quiet ? true : defaults[key]`). The player's own
  `SIM.nbCollapsed` toggles still win, so manual expands persist.

## Discovery ping (reuse, don't add timers)

- A surfaced finding already flashes the panel (`.sim-evidence-body--flash`) and
  scrolls to `.sim-board-summary`. Reuse that ONE signal in CSS to pulse the summary
  (`simBoardPing`) — no new JS/timer. Async typing timers / elaborate animations are
  deliberately deferred.

## Accept-aware / multi-select dock mechanics

- `stepAcceptIds(cfg)` = `cfg.accept || [cfg.correct]` — generalises one keyed
  `correct` to "multiple valid reads"; single-correct grades identically.
- A `multi:true` step toggles options into the transient draft; SEND commits the set
  via `submitDiscoveryDraft → setDiscoveryJudgment`. Multi grading is EXACT-SET
  ("all and only"). An un-submitted multi step counts pending and HOLDS the lock
  (empty array = unanswered). Single-select scalar path stays byte-identical.
