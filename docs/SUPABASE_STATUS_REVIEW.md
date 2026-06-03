# Supabase Status Review — Phase 3B Verification

_Verification-only snapshot taken before any code changes. Read-only probes only;
no rows were written. The game remains **local-first** and fully playable
regardless of anything below._

## TL;DR

- **Connection:** ✅ Connected. `SUPABASE_URL` + `SUPABASE_ANON_KEY` are present
  and the browser client initializes.
- **Schema:** ✅ The production schema (`001_initial_game_schema.sql`) **has been
  pushed** — all 6 target tables exist (and are currently empty).
- **Sync layer:** ❌ **Misaligned.** `lib/backendSync.js` still writes to the old
  Phase-B0 table names, which **do not exist** in the database → every cloud call
  404s and the status pill shows **"Sync Delayed"**.
- **Blocker for full alignment:** With **only the anon key** and the schema's
  secure-by-default RLS, the browser can `SELECT` + `INSERT` but **cannot
  `UPDATE`** rows, and **cannot seed the `missions` catalog**. The normalized
  progression model (best/current `student_progress`, growing `profiles.xp_total`,
  `mission_attempts` keyed by `mission_id`) **requires an `UPDATE`-capable writer**
  (service role or authenticated owner) and a seeded `missions` table. A decision
  is needed before that part can be implemented — see _Recommended next action_.

## 1. Secrets

| Secret | Present? |
| --- | --- |
| `SUPABASE_URL` | ✅ yes |
| `SUPABASE_ANON_KEY` | ✅ yes |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ no |

No service-role key is configured. The app only has the public anon key.

## 2. Client initialization

`lib/supabaseClient.js` initializes safely:

- Reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` (injected via Vite `define`).
- `isBackendConfigured` is **true** here, so a real client is created
  (`persistSession:false`, `autoRefreshToken:false` — no sign-in).
- Falls back to a null client + "Running in local-only mode" log when unset.

## 3. Connectivity & tables

Read-only REST probes (`/rest/v1/<table>?select=*&limit=1`):

| Target (new schema) | Result |
| --- | --- |
| `profiles` | ✅ 200 — exists, 0 rows |
| `missions` | ✅ 200 — exists, **0 rows (unseeded)** |
| `student_progress` | ✅ 200 — exists, 0 rows |
| `mission_attempts` | ✅ 200 — exists, 0 rows |
| `xp_events` | ✅ 200 — exists, 0 rows |
| `certificates` | ✅ 200 — exists, 0 rows |

| Old B0 names (what the app currently calls) | Result |
| --- | --- |
| `student_profiles` | ❌ 404 — not found |
| `assignment_progress` | ❌ 404 — not found |
| `assignment_attempts` | ❌ 404 — not found |
| `game_events` | ❌ 404 — not found |

**Migrations present locally:** ✅ `supabase/migrations/001_initial_game_schema.sql`
(idempotent, additive; documented in `docs/SUPABASE_SCHEMA.md` /
`docs/SUPABASE_MIGRATION_SETUP.md`).

## 4. Sync layer vs. schema (the misalignment)

`lib/backendSync.js` targets a **flat, anonymous-id-keyed** model that predates the
migration. The migration is a **normalized, profile-id-keyed** model. Mapping:

| backendSync.js call | Old table (missing) | Intended new table | Note |
| --- | --- | --- | --- |
| `syncPlayerProfile` | `student_profiles` | `profiles` | needs `UPDATE` to grow xp/role |
| `saveCloudProgress` (blob) | `student_profiles.progress` | _(no equivalent)_ | new schema has **no progress JSONB column** — normalized instead |
| `syncAssignmentProgress` | `assignment_progress` | `student_progress` | needs `mission_id` + `UPDATE` |
| `start/complete/abandonAssignmentAttempt` | `assignment_attempts` | `mission_attempts` | needs `mission_id`; append-only ✅ |
| `trackGameEvent` | `game_events` | `xp_events` (closest) | shapes differ; `xp_events` needs `profile_id` |

The local attempt-tracking namespace (`ech.backend.v1`) and the authoritative
gameplay save (`ech.progress.v1`) are unaffected and working.

## 5. RLS posture (from the pushed migration)

RLS is **enabled on every table** (secure-by-default). For the **anon** role:

- `profiles`, `student_progress`: `SELECT` + `INSERT` only — **no `UPDATE`/`DELETE`**.
- `missions`: `SELECT` only (read-only catalog) — **clients cannot seed it**.
- `mission_attempts`, `xp_events`, `certificates`: append-only — `INSERT` + `SELECT`.

This is intentional (see `docs/SUPABASE_SCHEMA.md`): mutations are reserved for the
authenticated owner (`auth.uid()`) or the service role. It is **not** blocking by
accident — it is blocking the parts of the requested sync that mutate existing rows.

## 6. Backend status indicator

Accurate and subtle (bottom-left pill): `connected` → `delayed` → `local`. It
currently reads **"Sync Delayed"** because boot `loadCloudProgress()` hits the
missing `student_profiles` table. Error handling is correct everywhere — all calls
are wrapped, never throw into gameplay, and only emit `console.warn`.

## 7. What works today vs. what is blocked

**Achievable now (anon `INSERT`/`SELECT`, no security change, no auth):**

- Map `anonymous_id` → a `profiles` row via **insert-once / on-conflict-do-nothing**
  (no `UPDATE`, so RLS-safe).
- Append rows to `xp_events` (needs the profile's `id`).
- Read any table for warm-up / future restore.

**Blocked without a decision:**

- Growing `profiles.xp_total` / `current_role` (needs `UPDATE`).
- `student_progress` best/current rollup (needs `mission_id` **and** `UPDATE`).
- `mission_attempts` (needs `mission_id`; `missions` is unseeded and anon can't seed).

## 8. Risks

- **Silent half-sync:** naively renaming tables would make ledger inserts work but
  leave profile/progress `UPDATE`s failing RLS — a confusing "delayed" state.
- **Security regression risk:** adding a blanket anon `UPDATE`/seed policy to make
  the browser writer "just work" would weaken the secure-by-default posture the
  schema deliberately documents against.
- **None to gameplay:** local-first guarantees hold; this is all background.

## 9. Recommended next action

Pick the **writer identity** for the normalized schema (this is the real decision):

1. **Safe subset now (recommended, fully in-scope):** point the sync layer at the
   real schema for what anon may do — insert-once `profiles` mapping + `xp_events`
   analytics + read warm-up — and keep richer progression
   (`student_progress`/`mission_attempts`/profile totals) **local-only** until a
   writer with `UPDATE` rights exists. No auth, no RLS changes, stops the 404 noise.
2. **Service-role writer:** add a `SUPABASE_SERVICE_ROLE_KEY` and route progression
   writes (+ one-time `missions` seed) through the existing `api-server` artifact.
   Enables full progression sync; adds a small server surface.
3. **Authenticated owner:** ship auth so `auth.uid()` owner policies allow the
   browser to upsert its own rows. Most complete, but the user explicitly defers
   auth for now.

Until the choice is made, option 1 is the only path that aligns the app to the live
schema **without** relaxing security or adding auth.
