---
name: ECH deferred/timed callbacks must be cancel-safe
description: Rule for any setTimeout-deferred work in the Ethical CyberHackers script.js — track the id and clear it in central teardown, or it fires off-screen.
---

# Deferred/timed callbacks in script.js must be cancel-safe

Any `setTimeout`-deferred work that mutates mission state or the DOM (terminal command
typing, guided launch lines, idle-escalation watch, demo timers, adversary intro, and the
M1 "Submitting analysis to manager..." reasoning/classification delay) MUST store its timer
id in a module variable and be cancelled in the central teardown path.

**Why:** the app is a single-page flow where the student can reset, navigate to the missions
map/overview, or start the opt-in demo while a delay is mid-flight. A stale callback that
fires after navigation mutates pins/XP/trust/UI off-screen and creates hard-to-reproduce
state corruption (and can leak into the demo, which relies on `suppressSave`/`resetMission`
isolation).

**How to apply:** `endGuidedRun()` is the shared hub for every mission-exit (map/overview/
back/reset/demo-abort) — add the `clearXxxTimer()` call there. Also clear directly in
`resetMission`/`resetMission2` and `abortDemo` since they are independent entry points.
Pattern: `clearXxxTimer(); xxxTimer = setTimeout(() => { xxxTimer = null; ...}, delay);`
and `function clearXxxTimer(){ if (xxxTimer!==null){ clearTimeout(xxxTimer); xxxTimer=null; } }`.

Related: M1 Analyst Confidence score is DERIVED (recompute, never increment) and corrupt-state
hardened (only count pin keys in `EVIDENCE_RATINGS["mission-001"]` with a valid level) — so
re-reads, reloads, and tampered localStorage can't double-count or inflate it.
