---
name: Reconsideration / pivot beat (career-sim)
description: The presentation-only NON-graded "does this change an earlier call?" beat that shares the Decision Dock — invariants so it never grades, soft-locks, or leaks.
---

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
