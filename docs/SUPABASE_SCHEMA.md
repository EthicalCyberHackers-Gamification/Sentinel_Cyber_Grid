# Supabase Schema — Ethical CyberHackers

Authoritative reference for the platform's PostgreSQL/Supabase database. The
schema is defined as **SQL migrations** in [`/supabase/migrations`](../supabase/migrations);
this document explains what those migrations create and why. To apply them, see
[SUPABASE_MIGRATION_SETUP.md](./SUPABASE_MIGRATION_SETUP.md).

> **Local-first philosophy (unchanged).** The game is fully playable with no
> Supabase project at all. The browser's `localStorage` (key `ech.progress.v1`)
> is the **authoritative** save; Supabase is a durable cloud **mirror** plus the
> progression/analytics backbone. Every sync call is best-effort, non-blocking,
> and never throws into gameplay (it logs `Running in local-only mode` when the
> backend is absent). Cloud state never silently overwrites local state.

## Migration workflow (summary)

- Schema changes are **only** made through versioned SQL files in
  `/supabase/migrations` — never by hand in the Supabase UI.
- Files are numbered and applied in order. The first is
  `001_initial_game_schema.sql`.
- Migrations are written to be **additive and idempotent** (safe to re-run):
  `create table if not exists`, `create index if not exists`,
  `create or replace function/trigger`, and `drop policy if exists` + `create
  policy`. They never drop/reset tables or destroy data.
- Apply with the Supabase CLI (`supabase db push`). Full commands are in
  [SUPABASE_MIGRATION_SETUP.md](./SUPABASE_MIGRATION_SETUP.md).

## Extensions

- `pgcrypto` — provides `gen_random_uuid()` (UUID primary keys) and
  `gen_random_bytes()` (certificate verification tokens). Enabled with
  `create extension if not exists`.

## Conventions

- **UUID primary keys**, `default gen_random_uuid()`.
- `created_at timestamptz default now()` everywhere; `updated_at timestamptz
  default now()` on mutable tables, maintained by a shared
  `set_updated_at()` trigger.
- Foreign keys with `on delete cascade` (child rows) / `on delete set null`
  (optional links).
- `jsonb` for flexible/evolving payloads (`unlock_requirements`,
  `scorecard_json`, `metadata`).
- Indexes on every common lookup column (ids, codes, status, timestamps).

## Tables

### 1. `profiles` — player identity & career progression

One row per player. Supports **anonymous players now** (`anonymous_id`) and
**authenticated accounts later** (`user_id` → `auth.users`), so no migration is
needed when auth ships — an anonymous profile can simply be claimed by setting
`user_id`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | `gen_random_uuid()`. |
| `user_id` | `uuid` unique null | FK → `auth.users(id)`; null for anonymous players. |
| `anonymous_id` | `text` unique null | `anon_<hex>` from the browser. |
| `display_name` | `text` null | Chosen analyst name. |
| `current_role` | `text` | Role-track tier (default `Cybersecurity Intern`). |
| `xp_total` | `integer` | Lifetime XP. |
| `trust_score` | `integer` | Cumulative trust. |
| `analyst_reputation` | `text` null | Derived reputation tier label. |
| `promotion_readiness` | `integer` | 0–100 percent. |
| `missions_completed` | `integer` | Count of completed missions. |
| `created_at` / `updated_at` | `timestamptz` | |

**Role tracks** (`current_role`): Cybersecurity Intern → Junior SOC Analyst →
SOC Analyst → Threat Hunter → Incident Responder → Red Team Operator → Security
Engineer.

### 2. `missions` — mission metadata & progression structure

Read-mostly catalog describing each assignment and how the campaign unlocks.
`unlock_requirements` (jsonb) is intentionally open-ended to support **branching
mission trees** and role-gated progression without schema changes.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `mission_code` | `text` unique | Stable external id, e.g. `mission-001`. |
| `title` / `description` | `text` | |
| `tier_level` | `integer` null | Difficulty/career tier. |
| `role_track` | `text` null | Which role path this mission belongs to. |
| `difficulty` | `text` null | |
| `mission_order` | `integer` null | Ordering within a track. |
| `xp_reward` | `integer` | |
| `unlock_requirements` | `jsonb` | Prereqs (e.g. `{ "requires": ["mission-001"] }`). |
| `estimated_duration_minutes` | `integer` null | |
| `is_active` | `boolean` | Soft enable/disable. |
| `created_at` / `updated_at` | `timestamptz` | |

> The 3 shipped assignments (`mission-001` … `mission-003`) are **not** seeded by
> the migration to keep it purely structural. Insert them with an idempotent
> `insert ... on conflict (mission_code) do nothing` (or via the service role)
> when you wire the app to this schema.

### 3. `student_progress` — current/best state (not history)

Exactly **one row per `(profile, mission)`** (enforced by a unique constraint),
holding only the best/current snapshot. Full history lives in
`mission_attempts`.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` | FK → `profiles(id)` cascade. |
| `mission_id` | `uuid` | FK → `missions(id)` cascade. |
| `status` | `text` | `not_started` \| `in_progress` \| `completed`. |
| `best_score` | `integer` null | Best score achieved. |
| `best_confidence` | `integer` null | Best analyst-confidence value. |
| `best_trust_delta` | `integer` null | Best trust gain. |
| `attempts_count` | `integer` | Total attempts so far. |
| `highest_xp_earned` | `integer` | Best single-attempt XP. |
| `completed_at` | `timestamptz` null | First/most-recent completion. |
| `last_played_at` | `timestamptz` null | |
| `created_at` / `updated_at` | `timestamptz` | |

### 4. `mission_attempts` — immutable replay history

**Replay architecture.** Every time a player plays a mission, a **new** row is
inserted — rows are never updated or overwritten. This preserves a complete,
auditable history of replays, and is the source from which `student_progress`
best-values and `xp_events` are derived.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` | FK → `profiles(id)` cascade. |
| `mission_id` | `uuid` | FK → `missions(id)` cascade. |
| `attempt_number` | `integer` | 1-based per `(profile, mission)`. |
| `outcome_status` | `text` null | e.g. `completed`, `abandoned`. |
| `xp_earned` | `integer` | |
| `trust_delta` | `integer` | |
| `analyst_confidence` | `integer` null | |
| `containment_score` | `integer` null | |
| `evidence_score` | `integer` null | |
| `reasoning_score` | `integer` null | |
| `started_at` / `completed_at` | `timestamptz` | |
| `scorecard_json` | `jsonb` | Full scorecard snapshot for the attempt. |
| `created_at` | `timestamptz` | |

### 5. `xp_events` — XP / reputation history

Append-only audit trail of every XP/trust change (mission completion, reasoning
success, threat containment, evidence correlation, bonus objectives …). Optional
link back to the attempt that caused it.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` | FK → `profiles(id)` cascade. |
| `mission_attempt_id` | `uuid` null | FK → `mission_attempts(id)` set null. |
| `event_type` | `text` | e.g. `mission_completion`, `reasoning_success`. |
| `xp_change` | `integer` | |
| `trust_change` | `integer` | |
| `description` | `text` null | |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz` | |

### 6. `certificates` — earned certifications

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid` PK | |
| `profile_id` | `uuid` | FK → `profiles(id)` cascade. |
| `certificate_code` | `text` | Which credential. |
| `title` | `text` null | |
| `issued_at` | `timestamptz` | |
| `expiration_date` | `timestamptz` null | |
| `verification_token` | `text` unique | `gen_random_bytes(16)` hex; backs future downloadable certs & school verification. |
| `metadata` | `jsonb` | |
| `created_at` | `timestamptz` | |

## Relationships

```
auth.users (future) ─1:1─ profiles
profiles ─1:N─ student_progress ─N:1─ missions
profiles ─1:N─ mission_attempts ─N:1─ missions
profiles ─1:N─ xp_events ─N:1(optional)─ mission_attempts
profiles ─1:N─ certificates
```

- `student_progress` is the **rollup** (one row per profile×mission).
- `mission_attempts` is the **ledger** (many rows; immutable).
- `xp_events` is the **reputation audit** (many rows; optionally tied to an attempt).

## Future scalability intent

- **Auth without redesign:** `profiles.user_id` is already present; anonymous
  profiles are claimable.
- **Role/campaign progression:** `missions.role_track`, `tier_level`,
  `mission_order`, and `unlock_requirements` (jsonb) support branching trees and
  role tiers.
- **Classrooms / teams / multiplayer:** add `classrooms`, `class_memberships`,
  or `teams` tables in a future migration and reference `profiles.id` — no change
  to existing tables required.
- **Analytics:** the immutable `mission_attempts` + `xp_events` ledgers are the
  raw material for later dashboards.

## Row Level Security (RLS) strategy

RLS is **enabled on every table** (secure-by-default: nothing is reachable
without an allowing policy). The starter policies in `001_initial_game_schema.sql`
balance "don't block development" with "don't open a dangerous public door":

- **`missions`** — public **read-only** catalog for `anon` + `authenticated`. No
  client writes (seed via the service role).
- **`profiles`, `student_progress`** — `anon` may `select` + `insert` only —
  **never `update` or `delete`**. An anonymous client can create and read its
  rows but cannot mutate existing ones (no cross-row tampering). `authenticated`
  users get owner-scoped full access via `auth.uid()`.
- **`mission_attempts`, `xp_events`, `certificates`** — append-only for clients:
  `anon`/`authenticated` may `insert` + `select`, never `update`/`delete`.
  `authenticated` access is owner-scoped through the row's `profile_id`.

**Why this is safe-by-default and not "full public write":** there is no
anonymous `UPDATE` or `DELETE` anywhere, immutable ledgers cannot be rewritten by
clients, and the catalog is not client-writable. The data in this phase is
anonymous, non-PII training telemetry, and anonymous `SELECT` is permissive only
because there is no anon identity in the JWT to scope by.

> **Mutating existing rows** (e.g. updating best/current progress or profile
> totals) is intentionally **not** granted to `anon`. When the sync layer is
> pointed at this schema, route those writes through an authenticated user, an
> upsert behind a deliberately-scoped policy, or the service role — do **not**
> re-add a blanket anon `UPDATE`.

**Lockdown path when auth ships:** drop the `*_anon_*` policies; the
`*_auth_owner` / `*_auth_insert` policies already scope every row to the
signed-in user via `auth.uid()`, giving per-user isolation with no schema change.

## Relationship to the current B0 sync layer

The shipped browser sync layer
(`artifacts/ethical-cyberhackers-platform/lib/backendSync.js`, Phase B0) was a
foundation that wrote to a simpler set of mirror tables
(`student_profiles`, `assignment_progress`, `assignment_attempts`,
`game_events`). **This document and the migrations supersede that as the target
production schema.** The app code is intentionally left unchanged by this
migration work; pointing the sync layer at these richer tables (mapping
`anonymous_id` → a `profiles` row, writing `mission_attempts`/`xp_events`, etc.)
is the natural next step and can be done without further schema changes.
