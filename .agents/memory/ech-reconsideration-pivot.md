---
name: Decision Dock modes (career-sim) — reconsideration + finding draft
description: The shared Decision Dock has 3 prioritized modes (graded call → reconsideration → finding draft); invariants for blocking vs NON-blocking add-ons so they never grade, soft-lock, leak, or steal focus.
---

# Decision Dock modes — blocking vs non-blocking add-ons

The ONE Decision Dock host (`#simDecisionDock`, in the always-present terminal
column) renders prioritized modes via `decisionDockHtml()` and `syncDecisionDock()`:
**graded call (`activeDecisionChallenge`) → reconsideration (`activeReconsideration`)
→ finding draft (`activeDraftFinding`)**. Each mode prefixes `_dockActiveId`
(`judgment:` / `reconsider:` / `finding:`) so a swap still flashes/announces.

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
