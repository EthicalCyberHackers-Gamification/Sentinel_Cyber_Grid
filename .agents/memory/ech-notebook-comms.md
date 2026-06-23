---
name: Career-sim notebook = live comms, not graded exam
description: The right-column Analyst Notebook judgment surface renders as a Sarah Reyes comms exchange; rules for keeping feedback display-only and answer-safe.
---

# Notebook-as-comms (career-sim.js / career-sim.css)

The judgment surface (missions with `def.caseFileNotebook`) is a comms exchange
with mentor Sarah Reyes, NOT a graded card stack. Sarah asks; the player's option
buttons are first-person "your read" replies routed through the existing
`setDiscoveryJudgment` chokepoint; after answering, the thread shows ONLY the
chosen reply + that option's already-authored Sarah feedback.

## Durable rules

- **Never render unchosen/keyed options after answering.** No check/cross marks,
  no "correct answer" reveal, no grade labels (the old per-step grade chrome is
  gone; `challengeStatus` is intentionally defined-but-uncalled because the
  invariant forbids editing grading helpers). Status pill is pending /
  logged only — never right/wrong.
  **Why:** the headline invariant is "never reveal the keyed option, no exam
  feel." **How:** keep the answered branch rendering chosen option + Sarah's
  feedback line; never loop all options with a correctness marker.

- **Existing per-option Sarah feedback copy is DATA, reused verbatim.** Some
  authored lines still contain words like "Correct call." A "no correctness
  language anywhere" goal therefore needs editing the per-challenge feedback
  strings (the mission data), NOT a renderer change.
  - **Agreement OPENERS leak correctness too.** Conversational confirmations at
    the start of a feedback line — "Exactly —", "Right —", "Yes —", "Close, but",
    "Correct" — read as a grade even inside a mentor comms thread. When a mission
    must be a non-graded investigative dialogue, scrub these openers in the DATA
    and reword to neutral investigative phrasing ("That's the read I'd work
    from…", "I'd push it higher…") while keeping the substance. Grep the
    mission's `feedback:` strings for opener words; the renderer needs no change.

- **Feedback decorations are display-only, derived from SIM state.** The
  confidence micro-nudge fires on a confidence RISE (tracked via the existing
  `nbConfidence` tracker) with NO numeric delta; evidence-breadth dots count
  distinct `qualityWeight` tiers (minor/notable/key) among surfaced evidence.
  Each evidence item's `source` string is UNIQUE, so per-finding "distinct
  source" counting is meaningless — use tiers, and never phrase any cue as
  right/wrong (a rise that follows a good judgment must not read as "correct!").
