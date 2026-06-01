# Supabase Schema — Phase B0 (Backend Foundation)

> **Status:** foundation only. The game is **local-first** — `localStorage`
> (key `ech.progress.v1`) remains the authoritative save. Supabase is a silent,
> best-effort mirror + lightweight analytics layer. The game is **fully playable
> with no Supabase project at all** (it logs `Running in local-only mode`).
>
> There is **no authentication**. Players are identified by an anonymous id
> (`anon_<hex>`) generated in the browser and stored in `localStorage`
> (key `ech.anon_id`). All rows are keyed by this `anonymous_id`.

## Connection

The browser client reads two values, injected at build time by
`artifacts/ethical-cyberhackers-platform/vite.config.ts` from the Replit
secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY`:

- `import.meta.env.SUPABASE_URL`
- `import.meta.env.SUPABASE_ANON_KEY`

The **anon key is public by design** (it is safe to ship to the browser); access
must be constrained with Row Level Security (see the RLS note at the end).

## Tables

### `student_profiles`

One row per anonymous player. Also stores the full progress backup blob.

| Column          | Type          | Notes                                                            |
| --------------- | ------------- | --------------------------------------------------------------- |
| `anonymous_id`  | `text` **PK** | `anon_<hex>` from the browser.                                   |
| `display_name`  | `text` null   | The student's chosen name (if any).                             |
| `xp`            | `integer`     | Current total XP. Default `0`.                                  |
| `rank`          | `text` null   | Current rank label (e.g. "Cyber Intern Level 1").              |
| `progress`      | `jsonb` null  | Full mirror of the `localStorage` save object (cloud backup).  |
| `last_seen_at`  | `timestamptz` | Updated on every sync.                                          |

```sql
create table if not exists public.student_profiles (
  anonymous_id text primary key,
  display_name text,
  xp           integer not null default 0,
  rank         text,
  progress     jsonb,
  last_seen_at timestamptz not null default now()
);
```

### `assignment_progress`

One row per (player, assignment) summarising completion + analyst confidence.
Mirrors the per-mission progress already held locally.

| Column               | Type          | Notes                                            |
| -------------------- | ------------- | ------------------------------------------------ |
| `anonymous_id`       | `text`        | FK → `student_profiles.anonymous_id`.            |
| `assignment_id`      | `text`        | `mission-001` \| `mission-002` \| `mission-003`. |
| `completed`          | `boolean`     | Whether the assignment is complete.              |
| `analyst_confidence` | `integer` null| Final analyst-confidence meter value (0–100).    |
| `updated_at`         | `timestamptz` | Updated on every sync.                            |

Primary key: `(anonymous_id, assignment_id)`.

```sql
create table if not exists public.assignment_progress (
  anonymous_id       text not null,
  assignment_id      text not null,
  completed          boolean not null default false,
  analyst_confidence integer,
  updated_at         timestamptz not null default now(),
  primary key (anonymous_id, assignment_id)
);
```

### `assignment_attempts`

Append-only log supporting **replayable attempts**. A new attempt row is created
each time a player starts an assignment fresh; restarting (Restart button)
abandons the open attempt so the next start increments `attempt_number`.
Resuming an in-progress assignment **reuses** the open attempt (it does not
inflate the count).

| Column          | Type            | Notes                                                  |
| --------------- | --------------- | ----------------------------------------------------- |
| `attempt_id`    | `uuid`/`text` PK| Unique per attempt (generated client-side).           |
| `anonymous_id`  | `text`          | FK → `student_profiles.anonymous_id`.                 |
| `assignment_id` | `text`          | `mission-001` \| `mission-002` \| `mission-003`.      |
| `attempt_number`| `integer`       | 1-based, per (player, assignment).                    |
| `started_at`    | `timestamptz`   | When the attempt began.                               |
| `completed`     | `boolean`       | Whether it ended in completion.                       |
| `completed_at`  | `timestamptz` n | Set when completed.                                   |
| `abandoned_at`  | `timestamptz` n | Set when restarted before completion.                 |
| `score`         | `integer` null  | Attempt score (analyst confidence at completion).     |
| `xp_total`      | `integer` null  | Player XP at completion.                               |

```sql
create table if not exists public.assignment_attempts (
  attempt_id     text primary key,
  anonymous_id   text not null,
  assignment_id  text not null,
  attempt_number integer not null,
  started_at     timestamptz not null default now(),
  completed      boolean not null default false,
  completed_at   timestamptz,
  abandoned_at   timestamptz,
  score          integer,
  xp_total       integer
);
create index if not exists assignment_attempts_player_idx
  on public.assignment_attempts (anonymous_id, assignment_id);
```

### `game_events`

Lightweight, batched analytics stream. Inserted in batches (flushed every ~4s or
every 25 events) so frequent events never spam writes.

| Column         | Type          | Notes                                                  |
| -------------- | ------------- | ----------------------------------------------------- |
| `id`           | `bigint` PK   | Identity / auto-increment.                            |
| `anonymous_id` | `text`        | FK → `student_profiles.anonymous_id`.                 |
| `event_type`   | `text`        | See "Event types" below.                              |
| `payload`      | `jsonb`       | Small, event-specific context.                        |
| `created_at`   | `timestamptz` | Client timestamp of the event.                        |

```sql
create table if not exists public.game_events (
  id           bigint generated always as identity primary key,
  anonymous_id text not null,
  event_type   text not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists game_events_player_idx
  on public.game_events (anonymous_id, created_at);
```

#### Event types

| `event_type`               | Emitted when                                           | Payload keys                                |
| -------------------------- | ----------------------------------------------------- | ------------------------------------------- |
| `assignment_started`       | A new attempt opens (begin / first launch).           | `assignment_id`, `attempt_number`           |
| `assignment_completed`     | An attempt is completed.                               | `assignment_id`, `attempt_number`, `score`, `best_score` |
| `assignment_restarted`     | The Restart button abandons the open attempt.         | `assignment_id`                             |
| `command_loaded`           | A command card loads text into a terminal input.      | `command`                                   |
| `command_executed`         | A command runs (M1/M2/M3).                             | `assignment_id`, `command`                  |
| `reasoning_answer_selected`| A "what does this suggest?" answer is chosen.         | `assignment_id`, `key`, `answer`            |
| `evidence_pinned`          | A finding is pinned to the evidence board.            | `assignment_id`, `finding`                  |
| `evidence_classified`      | A pinned finding is classified by suspicion level.    | `assignment_id`, `finding`, `level`         |
| `blue_team_decision_made`  | A containment / Blue-Team decision action is taken.   | `assignment_id`, `action`                   |
| `mission_map_opened`       | The mission map is opened.                            | (none)                                       |

> **Not tracked:** `hint_requested` — there is no single user-initiated hint
> action in the current UI (hints surface contextually), so tracking it would be
> noisy and ambiguous. Left out intentionally; revisit if a discrete "Hint"
> button is added.

## Row Level Security (RLS)

Because the client uses the public anon key with no auth, enable RLS on every
table before storing anything sensitive. For this anonymous, non-PII training
data a permissive policy (anon may insert/select/update its own rows) is enough.
Tighten as the product grows (e.g. when teacher dashboards arrive). Example:

```sql
alter table public.student_profiles    enable row level security;
alter table public.assignment_progress enable row level security;
alter table public.assignment_attempts enable row level security;
alter table public.game_events         enable row level security;

-- Phase B0: anonymous training data, no PII. Allow anon full access.
-- Replace with per-id policies once identity/auth is introduced.
create policy "anon all - profiles"  on public.student_profiles    for all to anon using (true) with check (true);
create policy "anon all - progress"  on public.assignment_progress for all to anon using (true) with check (true);
create policy "anon all - attempts"  on public.assignment_attempts for all to anon using (true) with check (true);
create policy "anon all - events"    on public.game_events         for all to anon using (true) with check (true);
```

## Client integration map

- `artifacts/ethical-cyberhackers-platform/lib/supabaseClient.js` — client,
  anonymous id, backend status indicator.
- `artifacts/ethical-cyberhackers-platform/lib/backendSync.js` — all 7 sync
  functions (`syncPlayerProfile`, `syncAssignmentProgress`,
  `startAssignmentAttempt`, `completeAssignmentAttempt`, `trackGameEvent`,
  `saveCloudProgress`, `loadCloudProgress`) plus helpers
  (`abandonAssignmentAttempt`, `getBestScore`, `queueCloudSync`).
- `artifacts/ethical-cyberhackers-platform/script.js` — fire-and-forget hooks at
  boot, save, mission begin/complete/restart, and gameplay events.
