---
name: Career ladder (authoritative rank)
description: How the 7-tier career/role ladder derives and displays the analyst rank in the shipping app
---

# Career ladder — authoritative rank display

The analyst's rank is **derived**, not stored as its own field. `deriveCareerState()`
counts `missionMapStatus(id) === "completed"` across `CAREER_MISSION_IDS`
(mission-001..006) and maps the count to a tier in `ROLE_LADDER` (tier 0 =
"Cybersecurity Intern" = `INITIAL_RANK`). `careerRankName()` is the single source
of truth for the rank label.

**Why:** before this, several completion paths (M1/M2/M3) each set the rank text
ad-hoc with their own constant, so the displayed rank could drift from actual
progress. All rank-set sites (M1/M2/M3 completion + `resetMission`) now call
`careerRankName()`.

**How to apply:** never hard-code a rank string at a completion/reset site — call
`careerRankName()`. The mission-complete flag must be set BEFORE reading it so the
derivation reflects the just-finished mission. `renderCareerLadder()` (called at the
end of `renderOperationsCenter`) drives `#rankName`/`#m2RankName`/`#m3RankName`,
`#rankClearance`, and the "YOU" roster role `#ocv2RosterYouRole`. The promotion
notice is session-only (no persistence).
