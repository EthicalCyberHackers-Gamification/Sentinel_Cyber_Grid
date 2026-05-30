---
name: ECH investigation pin object shape
description: What an investigationPins entry actually stores — avoids a recurring "always 0" scorecard/count bug.
---

# Investigation pin object shape (Ethical CyberHackers Platform)

`handlePinClassification(missionId, key, level)` writes
`investigationPins[missionId][key]` as:

```
{ title, level, levelLabel, correct, useful, critical }
```

**There is NO `suspicion` field.** The classification value is stored as `level`
(e.g. `"critical"`, `"helpful"`, `"low"`, `"normal"`), and `critical` is a boolean
copied from `SUSPICION_LEVELS[level].critical`.

**Why:** Counting "critical pins" with `pin.suspicion === "critical"` silently
always yields 0 (the field is undefined), so any scorecard/summary row built that
way shows an incorrect 0 while the rest of the scorecard renders fine. This shipped
as a real bug in the M2 (31A) network scorecard.

**How to apply:** To count critical pins use `pin.critical === true` (preferred,
boolean) or `pin.level === "critical"`. To check "did the student classify it
right" use `pin.correct`. Membership of a pinnable key is tracked separately in
`pinnableFindings[missionId]` (a Set, added by `showPinPrompt`).
