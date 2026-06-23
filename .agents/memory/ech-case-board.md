---
name: Interactive Case Board + accept-aware investigative dock (career-sim)
description: The click-to-place Case Board surface and the de-quizzed (multiple-valid-reads + multi-select) Decision Dock; gating, transient boundaries, and the completion-finality gotcha.
---

# Case Board + investigative dock (career-sim.js / career-sim.css)

A per-mission, data-gated alternative to the passive notebook. Surfaced findings
become click-to-place cards the analyst drops under labelled zones; a case chain
auto-draws as zones fill. All gated so other missions stay byte-for-byte
identical — branch on `def.*` flags, NEVER on a mission id.

## Gating

- `caseBoardMode()` = `!!SIM.def.caseBoard`; `passiveNotebookMode()` =
  `caseBoardMode() && def.caseBoard.passiveNotebook` (right notebook becomes a
  read-only record).
- `dockInvestigationMode()` = `def.dockMode === 'investigation'` (de-quizzed dock chrome).
- `def.caseBoard = { passiveNotebook, intro, zones:[{id,label,hint,reaction,classify?}],
  placements:{evId:zoneId}, conclusion:{label,text} }`.

## Transient vs graded boundary (the core invariant)

- Board placements, picked-up card, and multi-select toggles are TRANSIENT
  presentation state: `SIM.caseBoardPlacements`, `SIM.caseBoardSelected`,
  `SIM.discoveryDrafts`. Reset on mission open; never persisted, never
  `saveProgress`, never enqueue cloud sync, never gate the terminal.
- `setDiscoveryJudgment` stays the SOLE graded judgment write; `setClassification`
  the SOLE graded classification write. File classification is migrated INTO the
  board's INSIDE zone (`boardClassifyHtml`) but still routes through
  `setClassification` unchanged.

## Completion finality gotcha (architect-caught bug class)

- A zone may light incrementally from the cards SURFACED so far — good momentum
  feedback. But the case-closed / conclusion ("THE CALL") state and the final
  link must be computed from the FULL configured `placements` set: every
  configured finding must be both **surfaced** (`SIM.evidence.has`) AND placed
  under its own heading. **Why:** `zones.every(zoneLit)` where `zoneLit` only
  inspects surfaced cards lights the conclusion off a PARTIAL board (each zone
  has ≥1 surfaced card placed while other findings haven't surfaced yet). **How:**
  gate conclusion/`is-drawn` on `Object.keys(placements).every(id => surfaced && correctly-placed)`.

## Accept-aware / multi-select dock mechanics

- `stepAcceptIds(cfg)` = `cfg.accept || [cfg.correct]` — generalises one keyed
  `correct` id to "multiple valid reads". Single-correct missions grade
  identically (back-compat).
- A step may be `multi:true` (one beat per mission, e.g. ch_manifest observation):
  toggle several options into the transient draft, then SEND commits the set via
  `submitDiscoveryDraft → setDiscoveryJudgment`.
- Multi grading is EXACT-SET ("all and only"): correct iff
  `ans.length === accept.length && accept.every(id => ans.includes(id))`.
- `stepAnswered` treats an empty array as UNANSWERED, so an un-submitted multi
  step still counts pending and HOLDS the terminal lock. The single-select path
  (scalar answer) stays byte-identical (`Array.isArray` branch only).

## a11y

- The empty multi-SEND uses real `disabled` (correct "can't send nothing"
  semantic). The zone-drop header is a button only meaningfully when a card is
  picked; at rest it's `aria-disabled` + `tabindex="-1"` so it isn't a focusable
  no-op (kept as a button, not restructured, to preserve the resting layout).
