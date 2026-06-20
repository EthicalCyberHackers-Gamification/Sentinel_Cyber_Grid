---
name: Career-sim 3-gauge performance bar (display over 6 resources)
description: The career-sim top bar shows 3 composite red/yellow/green pointer gauges, but the 6 underlying resources still exist and still drive scoring.
---

The career-sim top bar (`.sim-resbar`) no longer shows six raw stats. It shows
THREE composite pointer gauges — Threat Defense, Business Impact, Leadership
Trust — computed by `careerGauges()` from the still-present six resources.

**Why:** six raw numbers (mixed higher/lower-better, a $ amount, reputation
starting at 0 = red on day one) were unreadable for beginners. The gauges are a
pure DISPLAY layer (chosen "Option A") — the six-key model, per-action `deltas`,
the recommendation verdict math (reads executiveTrust + careerReputation), and
the Mission 4 performance review/promotion (reads all six via `businessSignal`)
are UNTOUCHED.

**How to apply:** never assume the six resources were removed — they remain the
source of truth and still feed scoring; the gauges only roll them up (weights
live in `careerGauges()`). To animate the pointer, `renderResourceBar()` builds
the shell ONCE per `.sim-resbar` host (there are TWO) keyed on a role/authority
signature, then updates pointer `left`/state/ARIA IN PLACE on later calls — a
full innerHTML rebuild would kill the CSS `left` transition.
