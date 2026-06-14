---
name: Career ladder (authoritative rank)
description: Why the analyst rank must derive from one persisted source, and the rule that keeps the two rank displays from disagreeing
---

# Career ladder — authoritative rank display

The analyst's rank is **derived**, never stored as its own field. There are TWO
rank surfaces — the Operations Center home/identity rank and the in-investigation
(career-sim) rank — and they MUST both derive from the **same persisted earned
campaign role**. The only real promotion is Intern → Junior SOC Analyst, earned at
the campaign capstone (M4) and persisted once (sticky/idempotent across replays and
both completion paths). Later assignments (M5/M6) confer no role yet, so they must
advance rank in neither display.

**Why:** the home rank once derived from completed-mission *count* while career-sim
derived from the persisted role. Clearing later missions made the home header climb
ranks the in-sim display never acknowledged, so the two silently disagreed. Anchor
both to the one persisted earned role and they stay in lockstep.

**How to apply:**
- Never hard-code a rank string at a completion/reset site — derive it, and set the
  mission-complete flag *before* reading it.
- Don't reintroduce a completion-count (or "+ postCompleted") advancement on either
  display unless the *other* display confers the same role, or they diverge again.
- A promotion is earned only at its mission's capstone review; persist it
  monotonically (never demote, never double-promote).
