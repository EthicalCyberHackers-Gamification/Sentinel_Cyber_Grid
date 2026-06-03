---
name: State-aware hints (ECH)
description: Hints that depend on transient UI state must be re-synced at the state-change site, not only at boot/reset.
---

# State-aware guidance in Ethical CyberHackers

Hint and Current Objective are the same string — `setHint`/`setM2Hint`/`setM3Hint`
each also call `setCurrentObjective`. So any guidance fix changes both at once.

## Rule: re-sync state-derived hints at the state-change site

A hint whose text depends on a gate/flag (e.g. the M1 "awaiting launch" hint,
which differs by whether the Briefing Room is complete) must be recomputed and
re-set wherever that gate changes — not only in `boot()` / `resetMission()`.

**Why:** the M1 launch button is relabeled "Begin Investigation 🔒" and gated
behind reviewing all Briefing Room cards. Computing the awaiting hint only at
boot/reset left it stale ("Review the briefing first…") even after the student
finished the briefing, because reviewing cards changes gate state without
otherwise touching the hint.

**How to apply:** the awaiting hint is computed by `m1AwaitingHint()` and re-set
inside `updateBriefingGate("mission-001")` (reached via
`reviewBriefingCard → renderBriefingRoom → updateBriefingGate`), guarded to the
pre-launch state (`!missionStarted && !missionComplete`) so it never overwrites
in-mission or completed guidance.

## Single chokepoint for "command loaded" guidance

`loadCommandToTerminal()` is the one place all three missions load a command card
into the terminal input (student then presses Enter to run). Put cross-mission
"loaded but not executed" guidance there once, routed by which input element it
is (`m2TerminalInput`/`m3TerminalInput`/else → M1), instead of at each call site.
