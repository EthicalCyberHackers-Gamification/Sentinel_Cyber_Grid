# Ethical CyberHackers Platform

A frontend-only, browser-based cybersecurity training game that casts the player as
a Blue Team SOC analyst working through guided, beginner-friendly threat-hunting
assignments.

## Product overview

- Lives at `artifacts/ethical-cyberhackers-platform/` (preview path `/`) inside a
  pnpm monorepo.
- **Local-first** — no auth/login. All progress is stored in the browser's
  `localStorage` under the key `ech.progress.v1` (authoritative). An **optional**
  Supabase backend (Phase B0) silently mirrors/syncs in the background and records
  lightweight analytics; the game is **fully playable with Supabase absent or
  down** (logs "Running in local-only mode"). See
  [docs/SUPABASE_SCHEMA.md](./docs/SUPABASE_SCHEMA.md).
- Three playable assignments: `mission-001` (Credential Phishing), `mission-002`
  (Network Exposure Review), `mission-003` (Reconnaissance Detection).
- The app is four core files: `index.html`, `script.js`, `style.css`, and
  `missions.js` (mission data, imported by `script.js`). `script.js` is an **ES
  module** — its functions are NOT global. Phase B0 adds `lib/supabaseClient.js`
  and `lib/backendSync.js` (best-effort, local-first cloud layer).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Product: vanilla HTML/CSS/JS built with Vite, deployed as static assets
- _Monorepo scaffolding only (unused by this product): an `api-server` artifact
  using Express 5 / PostgreSQL + Drizzle / Zod / Orval._

## Run & operate

- App runs via the Replit workflow `artifacts/ethical-cyberhackers-platform: web`
  (restart it to apply changes / verify). Do not run `pnpm dev` at the repo root.
- `pnpm --filter @workspace/ethical-cyberhackers-platform run typecheck` — verify
  the artifact (use `typecheck`, not `build`).
- `node --check artifacts/ethical-cyberhackers-platform/script.js` — quick JS sanity check.

## Deployment

Static site published through Replit deployment (build, hosting, TLS, health checks
handled automatically). No data migration or env-var setup — state is
`localStorage`-only. See [docs/deployment.md](./docs/deployment.md).

## Documentation

Detailed docs live in [`/docs`](./docs):

- [docs/architecture.md](./docs/architecture.md) — system design: state &
  persistence model, evidence/pin system, confidence meters, reactive engines,
  shared "3-way" mission helpers, resume-safety pattern, key gotchas.
- [docs/missions.md](./docs/missions.md) — the three assignments, briefing room,
  guided onboarding, mission map, scorecards.
- [docs/ui-guidelines.md](./docs/ui-guidelines.md) — layout systems (focus mode,
  3-column, spatial), terminal behavior, alerts/animations/soundtrack, Operations
  Center home, CSS conventions.
- [docs/roadmap.md](./docs/roadmap.md) — career arc and natural next steps.
- [docs/SUPABASE_SCHEMA.md](./docs/SUPABASE_SCHEMA.md) — production database schema
  (6 tables, relationships, replay architecture, RLS strategy) defined as SQL
  migrations in [`/supabase/migrations`](./supabase/migrations).
- [docs/SUPABASE_MIGRATION_SETUP.md](./docs/SUPABASE_MIGRATION_SETUP.md) — Supabase
  CLI install/link/`db push`, schema verification, and future-migration workflow.
- [docs/PHASE_3B_INFRASTRUCTURE_AUDIT.md](./docs/PHASE_3B_INFRASTRUCTURE_AUDIT.md) —
  Phase 3B audit + cloud progress **restore** foundation: live backend/RLS/trigger
  verification, the append-only `progress_snapshots` table (migration `004`), the
  faithful-snapshot save/load/reconcile path, local-first invariants, and the
  no-data-loss reconciliation rules (auth/cross-device deferred).
- [docs/PHASE_3C_VALIDATION_REPORT.md](./docs/PHASE_3C_VALIDATION_REPORT.md) —
  Phase 3C end-to-end restore validation (PASS): test matrix across
  profile/continuity/reconciliation/offline/UI/database/logging, live append-only
  RLS proof, the 11-case reconciliation matrix, and key findings — restore returns
  the **most-recent** (not highest) snapshot, and the snapshot store vs normalized
  ledger legitimately diverge — with pre-auth recommendations.
- [docs/APPLY_MIGRATIONS_REPLIT_#2.md](./docs/APPLY_MIGRATIONS_REPLIT_#2.md) —
  operational record of applying/verifying the live migrations (CLI push,
  verification queries, non-destructive smoke-test outputs, rollback plan).
- [docs/REPLAY_SAFETY_CHECK_REPLIT_#7.md](./docs/REPLAY_SAFETY_CHECK_REPLIT_#7.md) —
  safety audit proving the Replay Guide is presentation-only (zero writes to
  progress/Supabase/sync/analytics): write-surface map, test matrix, evidence.
- [docs/BRIEFING_REPLAY_REPLIT_#6.md](./docs/BRIEFING_REPLAY_REPLIT_#6.md) —
  the player-facing "Replay Briefing" experience (briefing cards → spotlight tour
  as one presentation-only flow): architecture (`rgb*` recap layer), UI placement
  (briefing room / dashboard / completion scorecard), flow, and safety invariants.
- [docs/deployment.md](./docs/deployment.md) — build, run, publish, env, testing notes.
- [docs/changelog.md](./docs/changelog.md) — compressed milestone history.

## User preferences

- **Build directly in the shipping app.** All future builds go straight into
  `artifacts/ethical-cyberhackers-platform` (the deployable product). The
  `artifacts/ops-center-prototype` sandbox is for experiments only and is no
  longer the place to land features.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and
  package details.
