# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Ethical CyberHackers Platform — a frontend-only browser cybersecurity training app
(`artifacts/ethical-cyberhackers-platform/`, preview path `/`) with two missions
(M1 = mission-001, M2 = mission-002).

### Mission Briefing Room (Milestone 24I)
A reusable layer between mission selection and investigation. Each mission shows 3
interactive briefing cards (Review Briefing → ✓ Reviewed), a Mission Readiness score
(0/3 → "Ready For Investigation"), a launch gate, per-card manager reactions, a "Begin
Investigation" launch sequence, +10 XP once per mission, and scorecard rows.
- Data-driven via `MISSION_BRIEFINGS` in `script.js` (~564). Shared helpers:
  `renderBriefingRoom`, `reviewBriefingCard`, `updateBriefingGate`, `showBriefingWarning`,
  `runBriefingLaunch`, `beginInvestigation`, `buildBriefingSummaryHTML`,
  `briefingReadinessPct` / `isBriefingComplete`.
- Launch buttons (`#beginMissionBtn` M1, `#m2BeginBtn` M2) stay clickable but carry
  `.begin-locked`; an early click fires the warning "Review all briefing materials before
  starting the assignment." instead of being disabled. M1 "continue" mode
  (`data-mode="continue"`) bypasses gating.
- Both briefing rooms render UNCONDITIONALLY at boot (`renderBriefingRoom` x2 before
  `restoreSavedProgress`), so the hosts are never empty on a clean session — restore
  returns early when nothing is saved. They also re-render on restore, on
  `showMission2Overview`, and on the M1 enter-module loader callback.
- State `briefingReviewed` (per-mission Sets) + one-time `briefingXpAwarded` are
  persisted; restore only accepts card IDs present in `MISSION_BRIEFINGS` (corrupt-state
  hardening) and readiness is clamped 0–100. Cleared in `resetMission` / `resetMission2`.
- NOTE: `script.js` is loaded as an ES module (`<script type="module">`), so its functions
  are NOT global — console-based test navigation won't work; drive M2 via the real
  "Continue to Mission 2" CTA (or prime `ech.progress.v1` with `mission1Complete:true`).

### Evidence Prioritization + Investigation Board
Students do not auto-receive evidence. They must manually PIN reviewed findings to an
Investigation Board and CLASSIFY each one's suspicion level (Normal Activity / Low
Suspicion / Helpful Supporting Evidence / Critical Threat Evidence).
- Core module lives near the top of `script.js` (after `renderConfidenceMeter`):
  `EVIDENCE_RATINGS`, `SUSPICION_LEVELS`, `investigationPins`, `pinnableFindings`,
  `pinXpAwarded`, plus `showPinPrompt` / `showClassificationPrompt` /
  `handlePinClassification` / `renderInvestigationBoard` / `buildInvestigationQualityHTML`.
- M1 Evidence Confidence is derived PURELY from pins (`recomputeConfidenceFromPins`);
  the finding submission no longer adds confidence on top.
- M1 gate: pinning `suspicious_file.txt` as Critical unlocks the decision/finding flow.
  Re-reading the suspicious file after a reload re-opens the gate via `canCompleteM1()`
  (resume-safe — no soft-lock).
- M2 keeps its command-based confidence and adds the pin contribution one-time on top.
- Pins, pinnable findings, and one-time XP guards are persisted (save/restore) and cleared
  on `resetMission` / `resetMission2`. Terminal directory context is NOT persisted (resets
  to `~` on resume by design).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
