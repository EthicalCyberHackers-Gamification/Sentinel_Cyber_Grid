# Roadmap & Career Arc

Forward-looking direction for the Ethical CyberHackers Platform. For what is
already built, see [changelog.md](./changelog.md); for current missions see
[missions.md](./missions.md).

## Product north star

A beginner-friendly, frontend-only SOC training game that casts the student as a
**Blue Team defender** progressing through a believable security operations career.
Low cognitive load is a hard requirement: one action, one reasoning prompt, one
decision at a time, no punitive mechanics, no soft-locks.

## Career progression arc

The current vertical slice models an **Intern → Junior SOC Analyst** path:

- The Operations Center home derives a promotion % from missions completed (70%
  weight) + XP (30% weight) and surfaces a readiness tier
  (`analystCareerReadiness()`: Onboarding → Building → Promotion-Ready).
- Completing all assignments flips `#opsPromoText` to "ready for Junior SOC Analyst
  review" and end-of-track manager dialogue points there.
- A persistent **analyst reputation** layer (`operationalHistory`, derived
  standing/traits/ratings) accumulates across assignments as career memory.

## Natural next steps

These are the obvious extension points the architecture already anticipates — not
committed work, but where new effort fits cleanly:

- **More assignments beyond A3.** Adding `mission-004+` means: a new
  `MISSION_MAP` / `MISSION_BRIEFINGS` / reasoning / scorecard data block, a mirrored
  `#missionNOverview` + `#missionNDashboard`, an `m{N}*` engine, and — critically —
  a new branch in every shared "3-way" helper (see
  [architecture.md](./architecture.md#shared-3-way-mission-helpers)) or the mission
  silently routes to M1.
- **Higher career tiers** (Junior → Senior SOC Analyst) reusing the existing
  promotion/readiness math.
- **Deeper reputation surfacing** — the `operationalHistory` + behavior signals are
  already persisted and could feed richer profile views or unlocks.

## Constraints to preserve in any future work

- Stay frontend-only (no backend/AI/auth) unless the product direction explicitly
  changes — all state is `localStorage` (`ech.progress.v1`).
- Keep the shared 4-level `SUSPICION_LEVELS` scale (no 5th level — shared
  classification UI).
- Preserve internal ids (`mission-001/002/003`, element ids, fn/var names) even
  when career-facing copy changes ("Assignment"/"Operation").
