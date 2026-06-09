---
name: Orientation lab (Assignment 000)
description: How the standalone beginner orientation (mission-000) stays isolated from the six-mission play chain and reuses the lab engine via data-gating.
---

# Orientation lab — Assignment 000 (mission-000)

A standalone beginner network/SOC tutorial built as a Progressive Lab dataset
(`lab.missions/mission-000.js`, spread into `LAB_MISSIONS`), reachable **only** via
`?lab=mission-000`. It awards no XP and never persists.

## Isolation model (two independent guarantees)
- **No persistence / no XP / no leakage into the play chain:** `mission-000` is NOT
  in `MISSION_PLAY_ORDER`, and `notifyLabComplete()` early-returns for any id outside
  that order. That single guard is what keeps it out of completion flags, XP, save,
  and the unlock chain — it also means it never appears in the mission list / Ops
  Center map (those derive from the play order, not from `LAB_MISSIONS`).
- **Deep-link reachability:** the host `configureLab().canOpen` normally requires
  onboarding + unlocked status; add `if (missionId === "mission-000") return true;`
  at the top so the deep link opens without onboarding. Safe precisely because of
  the persistence guard above.

**Why:** lets a beginner tutorial reuse the full lab engine without touching the
authoritative six-assignment progression.

## Engine reuse by data-gating (do NOT add mission-000 special-cases to shared fns)
All orientation-only behavior in `lab.js` is gated on the report block carrying a
`choices` array — `labIsOrientation()` = `Array.isArray(def.report.choices)`. The six
real missions have no `choices`, so they are untouched. Gated surfaces:
- `labSubmitReport` → multiple-choice report (clickable buttons in terminal output)
  instead of the typed analyst report; correct = unknown source + multiple unrelated
  ports + off-baseline.
- `labShowScorecard` → orientation scorecard (no grade / X-of-N / response sections).
- `labOpenKit` → RESPONSE ACTIONS rendered **shown-but-locked** (dimmed item + 🔒)
  rather than collapsed into the "+N more" count note.

**How to apply:** any future orientation/tutorial variant should follow the same
two-guarantee isolation + `def.report.choices` data-gate; never branch shared engine
functions on a literal mission id.
