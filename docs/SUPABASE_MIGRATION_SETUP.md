# Supabase Migration Setup

How to apply the SQL migrations in [`/supabase/migrations`](../supabase/migrations)
to a real Supabase project, verify the result, and add future migrations safely.

> **Schema is migrations-only.** Never create or edit tables by hand in the
> Supabase Studio UI — the SQL files are the single source of truth. Editing the
> database directly causes drift between the project and these files.

---

## Prerequisites

- A Supabase project (create one at <https://supabase.com/dashboard>).
- Its **project ref** (the `abcdefghijklmnop` string in the project URL /
  Project Settings → General).
- The **database password** you set when creating the project (Project Settings →
  Database if you need to reset it).

---

## 1. Install the Supabase CLI

Pick whichever fits your environment:

```bash
# macOS / Linux (Homebrew)
brew install supabase/tap/supabase

# npm (no global install — run on demand)
npx supabase --version

# Or a project dev-dependency (recommended for reproducibility)
npm install --save-dev supabase
```

Verify:

```bash
supabase --version
# or, if installed via npx/npm:
npx supabase --version
```

> The CLI is a **developer tool**, not an app runtime dependency. The game does
> not need it to run.

---

## 2. Log in to Supabase

```bash
supabase login
```

This opens a browser to generate an access token. For non-interactive / CI use,
set a token instead:

```bash
export SUPABASE_ACCESS_TOKEN="<your-personal-access-token>"
```

(Create the token at Account → Access Tokens.)

---

## 3. Link this repo to your project

Run from the **repo root** (the directory that contains `supabase/`):

```bash
supabase link --project-ref <your-project-ref>
```

You'll be prompted for the database password. This writes
`supabase/.temp` / config linking the local `supabase/` directory to the remote
project. (No need to run `supabase init` — the `supabase/migrations` directory
already exists.)

---

## 4. Apply the migrations

Push every pending migration in `supabase/migrations` to the linked project:

```bash
supabase db push
```

What this does:

- Applies `001_initial_game_schema.sql` (and any later files) in filename order.
- Records each applied file so it is not re-run on the next push.
- Because the migration is idempotent (`create ... if not exists`, `create or
  replace ...`, `drop policy if exists`), re-running is safe even if some objects
  already exist.

> **Alternative (no CLI):** paste the contents of
> `supabase/migrations/001_initial_game_schema.sql` into Supabase Studio → SQL
> Editor and run it. It is safe to run as a single script. Prefer the CLI so the
> migration history stays tracked.

---

## 5. Verify the schema

Quickest check — Supabase Studio → **Table Editor**: confirm the six tables exist
(`profiles`, `missions`, `student_progress`, `mission_attempts`, `xp_events`,
`certificates`).

Or from the CLI / SQL Editor:

```sql
-- Tables created
select table_name
from information_schema.tables
where table_schema = 'public'
order by table_name;

-- RLS is enabled on each
select relname, relrowsecurity
from pg_class
where relname in ('profiles','missions','student_progress',
                  'mission_attempts','xp_events','certificates');

-- Policies present
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- pgcrypto extension enabled
select extname from pg_extension where extname = 'pgcrypto';
```

Confirm the migration is recorded:

```bash
supabase migration list
```

---

## 6. Add future migrations safely

1. Create a new, higher-numbered file, e.g.:

   ```bash
   supabase migration new add_classrooms
   # creates supabase/migrations/<timestamp>_add_classrooms.sql
   ```

   (Or hand-create `002_*.sql` — keep the numeric prefix increasing so order is
   deterministic.)

2. Write **additive, idempotent** SQL. Follow the same guards used in `001`:
   - `create table if not exists` / `create index if not exists`
   - `alter table ... add column if not exists ...`
   - `create or replace function` / `create or replace trigger`
   - `drop policy if exists ...; create policy ...`
   - **Never** `drop table`, `truncate`, or destructive `alter` that loses data
     in a forward migration.

3. Apply:

   ```bash
   supabase db push
   ```

4. Verify as in step 5, then commit the new file.

> **Local testing (optional).** `supabase start` boots a local Postgres + Studio
> in Docker; `supabase db reset` re-applies all migrations from scratch against
> it — a good way to confirm a migration applies cleanly before pushing to a
> shared project. Requires Docker.

---

## Safety checklist

- ✅ Migrations are additive and idempotent — safe to re-run.
- ✅ No `drop` / `reset` / `truncate` of existing tables or data.
- ✅ RLS enabled on every table before any data is stored.
- ✅ Schema changes go through versioned files, never the UI.
- ✅ The app stays local-first; applying these migrations does not change
  gameplay (the browser remains authoritative).
