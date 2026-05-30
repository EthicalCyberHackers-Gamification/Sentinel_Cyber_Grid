---
name: Operations Center home re-render
description: Every code path that reveals #moduleLanding must re-render the landing's dynamic state
---

# Operations Center landing must be re-rendered on every reveal

The Ethical CyberHackers landing screen (`#moduleLanding`, the "CyberCorp Operations
Center" home) shows live progress (career promotion %, assignment statuses, XP/Trust
chips). Its state is painted by `renderOperationsCenter()` in `script.js`.

**Rule:** any function that makes `#moduleLanding` visible again must call
`renderOperationsCenter()`, or the home shows STALE progress from before the player
started a mission.

**Why:** there are MULTIPLE reveal paths — not just boot/restore/clear, but also
in-session navigation back from a mission: `backToModuleOverview()` and
`hideMission2Overview()`. The first 32A pass only hooked boot/restore/clear and a code
review caught that returning from a mission left the home stale.

**How to apply:** when adding a new "go back to home" path (or a new dynamic field on the
landing), wire `renderOperationsCenter()` into it. The function is defensive (all DOM
lookups guarded, reads existing state only — `missionComplete`, `mission2Complete`,
`currentXP`, `trustScore`), so calling it redundantly is safe.

Note: `INITIAL_XP=750` is the game's baseline starting XP, so a brand-new recruit's
promotion bar is NOT 0% — it reads ~23% from the XP component alone. That is expected,
not a bug.
