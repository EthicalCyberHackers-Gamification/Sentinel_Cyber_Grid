---
name: Decision Dock modes (career-sim) — reconsideration + classification + determination + finding draft
description: The shared Decision Dock has 6 prioritized modes; invariants for blocking vs NON-blocking add-ons so they never grade, soft-lock, leak, or steal focus. Includes the dock-first FINAL VERDICT (determination) relocation pattern.
---

# Decision Dock modes — blocking vs non-blocking add-ons

The ONE Decision Dock host (`#simDecisionDock`, in the always-present terminal
column) renders prioritized modes via `decisionDockHtml()` and `syncDecisionDock()`,
in this fixed priority order:
**review gate (`activeReviewChallenge`) → graded call (`activeDecisionChallenge`) →
reconsideration (`activeReconsideration`) → classification (`activeClassificationFile`)
→ determination (`activeDetermination`) → finding draft (`activeDraftFinding`)**.
Each mode prefixes `_dockActiveId` (`review:` / `judgment:` / `reconsider:` /
`classify:` / `determine:` / `finding:`) so a swap still flashes/announces. **Keep
`decisionDockHtml()` and `syncDecisionDock()`'s branch order in lockstep** — they
are two parallel switch ladders; adding a mode to one but not the other (or in a
different order) desyncs the rendered card from the tracked active id.

## Dock-first FINAL VERDICT (determination, Missions 2–4)

The command-model "which one is it?" verdict (the `def.identify` config) is
relocated out of the right-side notebook INTO the dock as a NON-BLOCKING mode,
mirroring M1's `classificationDock`. Gate on **`def.determinationDock && def.identify`**
(`determinationDockMode()`) — a per-mission flag AND the config's presence, **never
a mission id**: M1 has no `def.identify` so it can't trip it, and flagless identify
missions keep the original right-panel section byte-identical. `activeDetermination()`
returns the config while mode-on, `stage !== 'report'`, and `evidence.size > 0`
(stays re-committable until `decide`). Chips reuse `data-identify` → `setIdentification`
(the sole graded writer — unchanged), so accuracy still feeds the verdict; skipping
it weakens the call but never locks. **Suppress the right-panel twin with the SAME
mode predicate** (`identifyHtml = determinationDockMode() ? '' : raw`) so the verdict
lives in exactly one place. No correctness feedback (no-spoiler). Guidance copy
(`caseFileNextStep`, the core-evidence print, the `simNotebookCue` "In the notebook →"
prefix) is flag-aware so it points to the dock, not the notebook.

**Free dock re-render:** `renderEvidencePanel()`'s tail unconditionally calls
`syncDecisionDock()`, so ANY graded writer that already calls `renderEvidencePanel()`
(setIdentification, setClassification) re-renders the dock for free — no extra wiring
to light the chosen chip / show the recorded note.

Two classes of add-on with OPPOSITE lock behavior:

- **Blocking** (reconsideration): MUST be in `caseFileDecisionPending()` so the
  terminal locks until it's resolved (see reconsideration section below).
- **Non-blocking / OPTIONAL** (finding draft — surface the auto-drafted finding so
  players log it where they decided): MUST stay OUT of `caseFileDecisionPending()`
  (terminal never locks), AND the focus-pull in `syncDecisionDock()` MUST be gated
  on `decisionLocked()` so the mode flashes for attention but never steals
  keyboard focus from the command line. Reuse the EXACT notebook card markup
  (`findingCardHtml`) so the dock is covered by the already-delegated
  `data-finding-chip/-commit/-reopen` handlers — no new bindings. To avoid a
  duplicate editable card, the un-logged draft renders editable IN THE DOCK and as
  a compact non-editable pointer (`findingPendingRefHtml`) in the notebook;
  "drafting now" copy must check the dock is ACTUALLY in finding mode (no graded
  call / reconsideration pending), else label it "queued".

**Why:** the dock is shared, lockable, and graded; a non-blocking mode that
accidentally enters the lock predicate or pulls focus would break the "keep
investigating any time" promise. Finding commit/reword is presentation-only
(`SIM.committedFindings`/chip state) — never scoring/persistence.

# Reconsideration / pivot beat (career simulator)

A presentation-only, **NON-graded** layer on top of the existing Decision Dock:
when a LATER finding reframes an EARLIER already-logged Decision-Dock call, Sarah
asks the student to REVISE or consciously HOLD their read. Data-gated per-mission
on `def.reconsiderations[]` (`{ id, when:<evidenceId>, target:<challengeId>, sarah,
options:[{id,label,feedback}] }`), recorded by `setReconsideration` into transient
`SIM.reconsiderations` (mirrors `SIM.discoveryJudgments`).

## Rules / invariants

- **`setDiscoveryJudgment` stays the SOLE graded write.** `setReconsideration` must
  touch ONLY `SIM.reconsiderations` — never scoring/confidence/XP/powers, never
  `saveCareerState`/persistence, never `setDiscoveryJudgment`. Transient by design.
- **The pivot shares the ONE Decision Dock host with the graded call**, so the two
  must be mutually exclusive and ordered: a normal pending judgment renders FIRST;
  the reconsideration only when there is NO active judgment. `_dockActiveId` MUST be
  prefixed (`judgment:` / `reconsider:`) or a dock swap between the two skips its
  entrance flash + focus pull.
- **`reconsiderLive` requires BOTH** the trigger evidence present AND the earlier
  `target` challenge FULLY answered — otherwise the pivot surfaces with no prior
  call to reframe.
- **The terminal lock must cover a pending reconsideration too:**
  `caseFileDecisionPending()` includes `pendingReconsiderations()`, or `decide`/the
  terminal can skip the beat.
- **Posture-not-correctness:** both options are valid analyst moves; copy must NOT
  leak a verdict. Keep the two feedback openers symmetric (both authored as "a
  deliberate move") so neither reads as preferred.

**Why:** the dock is a shared, lockable, graded surface; any feature riding on it
can accidentally grade/persist, soft-lock the terminal, miss its focus on a swap,
or imply a right answer. **How to apply:** any future Decision-Dock add-on should
data-gate (never branch on a mission id), keep a distinct `_dockActiveId` prefix,
extend `caseFileDecisionPending()` if it must hold the line, and stay off every
scoring/persistence path.
