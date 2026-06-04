---
name: Supabase migration apply/verify (this repo)
description: How to apply + verify the supabase/migrations against the live project, and the drift gotcha to watch for.
---

# Supabase migration apply/verify

The project links to a real Supabase project (local-first game; cloud is an
optional mirror). Migrations live in `supabase/migrations` and are the **single
source of truth** — never hand-edit tables in Studio.

## Apply / verify workflow
- Run from **repo root**; CLI is a dev dep at `node_modules/.bin/supabase`.
- Needs two operator secrets: `SUPABASE_ACCESS_TOKEN` (CLI auth) and
  `SUPABASE_DB_PASSWORD` (DB connect). **Never** the service-role key — the shipped
  client uses only the anon key.
- `supabase migration list --password "$SUPABASE_DB_PASSWORD"` → compare Local vs Remote.
- `supabase db push [--dry-run] --password "$SUPABASE_DB_PASSWORD"` → apply pending.
- Migrations are additive + idempotent (`if not exists`, `on conflict do nothing`,
  `create or replace`), so re-running is safe.
- Smoke-test writes non-destructively with `psql` against the **session-mode pooler**
  (`...pooler.supabase.com:5432`, `sslmode=require`) inside `begin; ... rollback;`,
  then assert a leftover count of 0. The postgres role bypasses RLS, so this also
  exercises the `SECURITY DEFINER` rollup triggers (mission_attempts→student_progress
  /profiles, xp_events→profiles).

## Drift gotcha (the non-obvious lesson)
**Why:** Effects of a migration can exist in the DB (seeded rows, live triggers)
while the migration is **absent from the remote history** — i.e. it was applied
manually via the Studio SQL editor, bypassing the CLI. `migration list` shows the
Remote column blank for those versions even though everything "works".
**How to apply:** Don't trust "the table looks right" as proof a migration is
applied. Check `migration list`; reconcile by running `db push` (idempotent), which
re-applies and **records** them so Local==Remote. Always prefer the CLI over pasting
SQL so history stays tracked.
