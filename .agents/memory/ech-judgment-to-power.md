---
name: Judgment-to-Power system (career-sim)
description: Transient "earned tools" layer in the ECH career simulator — how it stays display-only, never reveals answers, and earns across all four Intern missions.
---

# Judgment-to-Power system (career-sim.js / career-sim.css)

A presentation-only layer that turns demonstrated analyst judgment into small,
time-bound, spendable in-universe "tools" (Evidence Threader, Scope Snapshot,
Risk Railguard). Lives entirely on `SIM.powers` (transient, reset on
`openCareerMission` via `freshPowersState()`), never persisted/synced.

## Hard rules (why the design is shaped this way)

- **Confidence cost is DISPLAY-only.** `investigationConfidence()` stays the
  grading base, untouched. A *separate* `displayInvestigationConfidence()`
  subtracts `SIM.powers.confSpend` for the meter only.
  **Why:** Investigation Confidence feeds grading (it blends evidence + judgment
  quality). A power that "spends confidence" must NEVER feed its cost back into
  the graded value, or it corrupts scoring.
  **How to apply:** any new confidence-spending effect adjusts the display
  helper / `confSpend`, never `investigationConfidence()` or the grading helpers
  (`judgmentQuality*`, `classificationQuality`, `computeRecommendationOutcome`).

- **Earn triggers must use a signal present in ALL four Intern missions.** Only
  Mission 1 is file-model (files + classification); M2–M4 are command-model
  (commands + identify, no files/classification). So Risk Railguard earns on
  *accurate observations* (`correctObservationCount`), not classification.
  **Why:** a classification-based trigger would never fire on M2–M4.
  **How to apply:** base any new per-power trigger on judgment steps / evidence /
  risks (universal), never on files or classification (M1-only).

- **Never reveal answers.** Evidence Threader only connects evidence the player
  has *already surfaced* to a risk the case file *already shows as FACT*
  (`threadPair` filters on `SIM.evidence.has` + `riskConfirmed`). Scope Snapshot
  emits *counts only* (`scopeCounts`). Risk Railguard gives a calibration nudge
  from confidence vs open-item count — never names a finding or recommendation.

## State machine gotchas

- `powersTick()` runs once per *recorded* judgment step (called from
  `setDiscoveryJudgment` AFTER the validated write, BEFORE the single render). It
  must NOT render — the caller renders once.
- Delta guard `lastSoundCount`: recovery (confidence dip → restored) and earn
  announcements only fire on a REAL new sound judgment, not on every re-render.
- Durations are counted in judgment steps: Scope Snapshot lasts
  `SNAPSHOT_WINDOW` steps (decrement each tick); Evidence Threader is a one-shot
  that expires on the very next tick; Railguard recovers (and closes) on the
  next sound judgment.
- `analystStanding()` self-initializes `SIM.powers` defensively; render/display
  paths all guard `SIM.powers` being null.
- `analystPowersHtml()` returns `''` until the first tool is earned — no
  locked-power grind list (keeps it professional, not gamey).

## Reusing the confSpend mechanic (e.g. the optional Analyst's Bet)

- `confSpend` is a SINGLE shared variable, so any second confidence-dip feature
  (the Bet's strong stake) CANNOT stack a second dip — only stake when
  `confSpend === 0`, and tag `confSpendSource` ('railguard' | 'bet').
  **Why:** `powersTick` recovery must run the RIGHT ceremony — a bet recovery must
  not fire the Railguard expire line, and vice-versa. Route recovery by
  `confSpendSource`, not by which `active` key exists.
  **How to apply:** new dip → set `confSpendSource`; recovery branch reads it,
  clears both `confSpend` + source, and tears down its own `active` key. Use
  bet-OWNED active keys (`betSnapshot`) so `analystPowersHtml`'s "any tool active"
  guard (`ANALYST_POWERS.some(p=>P.active[p.id])`) never spuriously renders an
  empty EARNED TOOLS box for a non-power key.
- Display-only state that is SNAPSHOTTED must also be RENDERED and stay mutable:
  `SIM.committedFindings` was invisible until a timeline renderer existed, and the
  commit action must remain reachable after first commit (dirty-state re-commit:
  compare live composed text vs the stored snapshot) or the record silently
  diverges from the editable draft.
