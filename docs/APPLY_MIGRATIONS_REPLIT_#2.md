# Apply Supabase Migrations to Go Live (Replit #2)

Operational record for applying and verifying the SQL migrations in
[`/supabase/migrations`](../supabase/migrations) against the live Supabase project,
including verification queries, non-destructive smoke-test outputs, and a rollback
plan.

- **Date executed:** 2026-06-04
- **Linked project:** `Ethical_CyberHackers Gamification Project`
  (project ref `lzsjaozridtfpgmtbkye`, region `aws-1-us-east-2`)
- **Executed from:** Replit dev environment (Supabase CLI `v2.102.0` at time of run
  — the CLI noted `v2.105.0` is available; either applies these idempotent
  migrations identically — plus `psql`)
- **Game impact:** none — the platform stays **local-first** (browser
  `localStorage` is authoritative). These tables are the optional cloud
  mirror/analytics backbone.

> **Schema is migrations-only.** The SQL files under `supabase/migrations` are the
> single source of truth. Never create/edit tables by hand in Supabase Studio.

---

## 1. Summary / outcome

| Acceptance criterion | Result |
| --- | --- |
| Migration scripts applied with no errors | ✅ `002` + `003` applied; `001` already present |
| Tables present (6) | ✅ `profiles`, `missions`, `student_progress`, `mission_attempts`, `xp_events`, `certificates` |
| Read/write smoke tests pass from Replit | ✅ insert + read for every core table, both rollup triggers verified |
| Migration history aligned (local == remote) | ✅ `001`, `002`, `003` recorded remotely |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` validated | ✅ present; browser client initializes |
| Service-role key NOT used / exposed | ✅ never requested; not present |
| No destructive change to live data | ✅ writes ran in a transaction and were `ROLLBACK`-ed (0 leftovers) |

### Key finding — migration drift (now resolved)

Before this work, `supabase migration list` showed migrations **002 and 003 present
locally but missing from the remote migration history**, even though their *effects*
already existed in the database (the `missions` catalog was seeded and the rollup
triggers were live). This indicates `002`/`003` had previously been applied
**manually** (e.g. via the Studio SQL editor) without going through the CLI history.

`supabase db push` re-applied them **idempotently** (`insert ... on conflict do
nothing`, `create or replace function/trigger`) and recorded them in
`supabase_migrations.schema_migrations`, so local and remote are now in lockstep.

---

## 2. Prerequisites used

- Supabase project already linked (`supabase/.temp/linked-project.json` present).
- Secrets in Replit (Secrets tab):
  - `SUPABASE_URL` — REST endpoint (already present).
  - `SUPABASE_ANON_KEY` — public anon key used by the browser client (already present).
  - `SUPABASE_DB_PASSWORD` — database password, used **only** by the CLI/`psql` to
    connect for migration + verification. Requested for this task.
  - `SUPABASE_ACCESS_TOKEN` — Supabase personal access token for CLI auth.
    Requested for this task.
- **Not used / not present:** `SUPABASE_SERVICE_ROLE_KEY` (out of scope by design).

> All commands below were run with the password supplied via the `SUPABASE_DB_PASSWORD`
> environment variable (never typed inline), and command output was filtered so no
> credentials or pooler usernames appear in logs.

---

## 3. Steps executed

All commands run from the **repo root** (the directory containing `supabase/`).
The Supabase CLI is a dev dependency at `node_modules/.bin/supabase`.

### 3.1 Inspect migration state (before)

```bash
export SUPABASE_ACCESS_TOKEN=...   # from Replit secret
node_modules/.bin/supabase migration list --password "$SUPABASE_DB_PASSWORD"
```

```text
  Local | Remote | Time (UTC)
  -------|--------|------------
   001   | 001    | 001
   002   |        | 002      <- present locally, NOT recorded remotely
   003   |        | 003      <- present locally, NOT recorded remotely
```

### 3.2 Dry-run

```bash
node_modules/.bin/supabase db push --dry-run --password "$SUPABASE_DB_PASSWORD"
```

```text
DRY RUN: migrations will *not* be pushed to the database.
Would push these migrations:
 • 002_seed_missions.sql
 • 003_server_triggers.sql
```

### 3.3 Apply

```bash
node_modules/.bin/supabase db push --password "$SUPABASE_DB_PASSWORD"
```

```text
Applying migration 002_seed_missions.sql...
Applying migration 003_server_triggers.sql...
Finished supabase db push.
```

### 3.4 Inspect migration state (after)

```text
  Local | Remote | Time (UTC)
  -------|--------|------------
   001   | 001    | 001
   002   | 002    | 002
   003   | 003    | 003
```

---

## 4. Schema verification (read-only)

Run via `psql` against the session-mode pooler
(`aws-1-us-east-2.pooler.supabase.com:5432`, `sslmode=require`).

```sql
-- tables
select table_name from information_schema.tables
 where table_schema='public' order by table_name;
-- RLS enabled
select relname, relrowsecurity from pg_class
 where relname in ('profiles','missions','student_progress',
                   'mission_attempts','xp_events','certificates');
-- policies per table
select tablename, count(*) from pg_policies
 where schemaname='public' group by tablename;
-- triggers
select event_object_table, trigger_name, action_timing, event_manipulation
 from information_schema.triggers where trigger_schema='public';
-- extension + migration history
select extname from pg_extension where extname='pgcrypto';
select version from supabase_migrations.schema_migrations order by version;
```

Results:

- **6 public tables** present: `certificates`, `mission_attempts`, `missions`,
  `profiles`, `student_progress`, `xp_events`.
- **RLS enabled** (`relrowsecurity = t`) on all six.
- **Policies per table:** `missions` 1 (read-only catalog), `profiles` 3,
  `student_progress` 3, `mission_attempts` 4, `xp_events` 4, `certificates` 4 —
  matching the secure-by-default posture in `001` (anon read+insert; no anon
  update/delete; mutations reserved for the owner/service-definer triggers).
- **Triggers:** `trg_mission_attempt_upsert` (AFTER INSERT, trigger A),
  `trg_xp_event_rollup` (AFTER INSERT, trigger B), plus the three
  `*_updated_at` BEFORE UPDATE triggers from `001`.
- **`pgcrypto`** extension enabled.
- **Migration history recorded:** `001`, `002`, `003`.

---

## 5. Read/write smoke test (non-destructive)

A single transaction inserts into every writable core table, verifies the
`SECURITY DEFINER` rollup triggers fired, then `ROLLBACK`s — so **no rows persist**.
A post-rollback check confirms zero leftovers.

```sql
begin;
insert into public.profiles (anonymous_id, display_name)
  values ('smoketest-'||substr(gen_random_uuid()::text,1,8),'SMOKE TEST')
  returning id as profile_id \gset
select id as mission_id from public.missions where mission_code='mission-001' \gset
insert into public.mission_attempts
  (profile_id, mission_id, attempt_number, outcome_status,
   xp_earned, trust_delta, analyst_confidence, completed_at)
  values (:'profile_id', :'mission_id', 1, 'completed', 250, 10, 90, now());
insert into public.xp_events (profile_id, event_type, xp_change, trust_change, description)
  values (:'profile_id', 'mission_completion', 250, 10, 'smoke test');
insert into public.certificates (profile_id, certificate_code, title)
  values (:'profile_id', 'SMOKE-TEST', 'Smoke Test Certificate');
-- verify triggers + reads ...
rollback;
select count(*) from public.profiles where anonymous_id like 'smoketest-%';  -- expect 0
```

Outputs:

```text
>>> insert test profile           INSERT 0 1
>>> insert mission_attempt        INSERT 0 1   (fires trigger A)
>>> insert xp_event               INSERT 0 1   (fires trigger B)
>>> insert certificate            INSERT 0 1

--- trigger A: student_progress auto-created ---
  status   | attempts_count | highest_xp_earned | completed
-----------+----------------+-------------------+-----------
 completed |              1 |               250 | t

--- triggers A+B rolled up into profiles ---
 missions_completed | xp_total | trust_score
--------------------+----------+-------------
                  1 |      250 |          10

--- append-only reads per table ---
 mission_attempts=1 | xp_events=1 | certificates=1

ROLLBACK
--- POST-ROLLBACK leftover check (must be 0) ---
 leftover_smoketest_profiles = 0
```

**Interpretation:** insert + read works for every core table; trigger A
auto-creates the `student_progress` rollup and increments
`profiles.missions_completed`; trigger B rolls XP/trust into `profiles`. The
transaction rolled back cleanly with no residue.

> The production anon-client write path is independently confirmed by the live data
> already present (written by the app's anon key): `profiles`, `student_progress`,
> `mission_attempts`, and `xp_events` all contain rows, and read-only REST probes
> (`/rest/v1/<table>`) return HTTP 200/206 for all six tables.

---

## 6. Environment variable validation

| Variable | Scope | Status |
| --- | --- | --- |
| `SUPABASE_URL` | secret | ✅ present; browser client initializes |
| `SUPABASE_ANON_KEY` | secret | ✅ present; anon REST returns 200/206 |
| `SUPABASE_DB_PASSWORD` | secret | ✅ present; CLI/`psql` connect succeed (admin/dev only) |
| `SUPABASE_ACCESS_TOKEN` | secret | ✅ present; CLI auth succeeds (admin/dev only) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | ❌ intentionally absent (not required, not exposed) |

`lib/supabaseClient.js` reads `SUPABASE_URL` / `SUPABASE_ANON_KEY` (injected via
Vite `define`) and falls back to "Running in local-only mode" when unset, so the
game is unaffected if the backend is ever removed.

---

## 7. Rollback plan

The migrations are **additive and idempotent** — they never drop or truncate
tables/data, so a forward re-run is always safe and the normal "rollback" is simply
"do nothing / re-push."

**Golden rules**

- **Roll forward, never backward.** Any revert is a **new, higher-numbered forward
  migration file** that is then applied with `supabase db push` and recorded in
  history like any other.
- **Never hand-edit the migration history** (`supabase_migrations.schema_migrations`)
  and never hand-edit tables in Studio. Manually deleting history rows re-creates
  exactly the kind of drift this task had to fix and desynchronizes local vs remote.
- **Back up first.** Before any corrective change, snapshot via the Supabase
  Dashboard (Database → Backups) or
  `supabase db dump --password "$SUPABASE_DB_PASSWORD" -f backup.sql`.

**If the 003 rollups must be reverted** — add a new migration (e.g.
`004_drop_rollup_triggers.sql`) and `db push` it. The app stays local-first and
keeps working without these triggers:

```sql
-- 004_drop_rollup_triggers.sql  (forward corrective migration)
drop trigger if exists trg_mission_attempt_upsert on public.mission_attempts;
drop trigger if exists trg_xp_event_rollup        on public.xp_events;
drop function if exists public.trg_fn_mission_attempt_upsert();
drop function if exists public.trg_fn_xp_event_rollup();
```

**If the 002 seed rows must be removed** — only do so via a backed-up forward
migration, and only when no FK children reference them (`student_progress` /
`mission_attempts` cascade on `mission_id`, so removing a referenced mission would
delete dependent rows — back up and confirm first):

```sql
-- e.g. 005_unseed_missions.sql  (forward corrective migration; verify FKs first)
delete from public.missions
 where mission_code in ('mission-001','mission-002','mission-003');
```

> Dropping the base tables from `001` is **not** part of any rollback here — they
> hold (anonymous) live telemetry. Treat table drops as a separate, backed-up,
> explicitly-approved operation, also expressed as a forward migration.

> **Full restore:** if a change must be undone wholesale, restore from the backup
> snapshot taken above (Dashboard restore, or re-apply a `db dump`) rather than
> editing history.

---

## 8. Security notes

- Only the **anon** key is used by the shipped browser client; it can read and
  insert but **cannot** update/delete existing rows (RLS). Denormalized updates
  happen server-side via `SECURITY DEFINER` trigger functions — no anon UPDATE
  policy and no service-role key in the client.
- `SUPABASE_DB_PASSWORD` / `SUPABASE_ACCESS_TOKEN` are **operator/dev credentials**
  used only for migration + verification from Replit; they are stored as Replit
  secrets and were never printed. Command output in this doc was filtered to strip
  the pooler username and any credentials.
- The **service-role key was never requested, set, or used.**

---

## 9. Reproduce

```bash
# from repo root, with SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD set as secrets
node_modules/.bin/supabase migration list --password "$SUPABASE_DB_PASSWORD"
node_modules/.bin/supabase db push --dry-run --password "$SUPABASE_DB_PASSWORD"
node_modules/.bin/supabase db push --password "$SUPABASE_DB_PASSWORD"
node_modules/.bin/supabase migration list --password "$SUPABASE_DB_PASSWORD"
```

See [docs/SUPABASE_MIGRATION_SETUP.md](./SUPABASE_MIGRATION_SETUP.md) for the full
CLI link/push/verify workflow and [docs/SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md)
for the schema reference.
