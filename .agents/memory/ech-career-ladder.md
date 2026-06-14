---
name: Career ladder (authoritative rank)
description: How the 7-tier career/role ladder derives and displays the analyst rank in the shipping app, and why both rank displays must share one source
---

# Career ladder — authoritative rank display

The analyst's rank is **derived**, not stored as its own field. On the script side,
`careerRankName()` returns `deriveCareerState().role.name` and is the single rank
label. Since the M1–M4 campaign promotion went live, `deriveCareerState()` derives
the tier **solely from the persisted earned campaign role** —
`campaignEarnedTier()` reads `careerProgress.currentRole` through the explicit map
`CAMPAIGN_ROLE_TIER = {cybersecurity_intern:0, junior_soc_analyst:1}`, default 0.
It is **NOT** completion-count based anymore. `completed` still counts all six
`CAREER_MISSION_IDS` for the progress bars only.

The only real promotion is **Intern→Junior SOC Analyst**, earned at the M4 capstone
(the mission carrying `performanceReview`) and persisted by career-sim
`finalizeMission()` (which mutates `CAREER.currentRole` before `currentRank` +
save; pure `promotionDecision()` keeps it sticky/idempotent across both completion
paths). M5/M6 promotions are **not built**, so they advance rank in neither display.

## Two displays, one source of truth (critical)

There are TWO rank surfaces: the home/identity rank (script.js
`deriveCareerState`/`careerRankName`) and the in-sim rank (career-sim
`CAREER.currentRank`, derived from `CAREER.currentRole`). Both MUST derive from the
same persisted `careerProgress.currentRole`.

**Why:** the old completion-count derivation made the home header climb ranks
(Junior→…→Senior across M1–M6) that career-sim never acknowledged (its resource bar
stayed Intern), so the two displays silently disagreed. Anchoring both to the one
persisted earned role keeps them in lockstep.

**How to apply:** never hard-code a rank string at a completion/reset site — call
`careerRankName()`, and set the mission-complete flag BEFORE reading it. Do NOT
reintroduce a completion-count or `+ postCompleted` advancement on the script side
unless career-sim confers that same role, or the two displays will diverge again.
`renderCareerLadder()` (end of `renderOperationsCenter`) drives `#rankName` etc. The
home promotion notice (`maybeShowPromotion`, tier-delta based) is session-only.
