---
name: Supabase backend — local-first contract (safe-subset aligned)
description: How the optional Supabase layer is wired into the local-first game; the rules any future backend change must keep, and why most progression sync is deferred.
---

# Supabase backend foundation (local-first)

The game is browser-only and **local-first**: `localStorage` (`ech.progress.v1`)
is authoritative. Supabase is an **optional** background mirror + lightweight
analytics layer in `lib/supabaseClient.js` + `lib/backendSync.js`, wired into
`script.js` with fire-and-forget hooks. There is **no auth** — players are keyed
by an anonymous id (`anon_<hex>`, localStorage key `ech.anon_id`).

## Non-negotiable rules (why this exists)
- **No sync call may throw into the caller or block gameplay.** Script-side calls
  are wrapped `try{…}catch(_){}`; lib calls swallow errors and only set status +
  `console.warn`. **Why:** the game must stay fully playable with Supabase
  missing/down.
- **localStorage wins.** `loadCloudProgress()` is a `SELECT`-only warm-up that
  returns null — it never overwrites local state. Don't add auto-restore without
  an identity story.
- **Don't spam the backend.** `queueCloudSync()` is debounced *as a whole*; only
  emit `trackXpEvent` for MEANINGFUL events (mission completion), not per-action.

## The hard constraint that shapes everything: anon-only + secure RLS
Only the **anon key** exists (no service-role key). RLS is secure-by-default:
anon may **SELECT + INSERT** but **NOT UPDATE/DELETE**; `missions` is read-only
and **unseeded**. So the normalized schema's mutating progression
(`student_progress` best/current = needs UPDATE; growing `profiles.xp_total` =
needs UPDATE; `mission_attempts` = needs a `mission_id` from the unseeded
catalog) **cannot be written by the browser** and is deliberately kept
**local-only**. Full progression sync needs a service-role writer (e.g. via the
`api-server`, + a one-time missions seed) or auth — both deferred by the user.

## What the sync layer actually does now (safe subset)
- **profiles (INSERT-once):** `ensureProfileId()` maps `anonymous_id` → a
  `profiles` row via upsert `ignoreDuplicates` (= ON CONFLICT DO NOTHING, **no
  UPDATE** → RLS-safe), SELECTs the `id`, caches it (`ech.profile_id`).
  Self-healing: on insert error it clears the cached id and retries once (stale
  id after a DB reset would otherwise wedge writes forever).
- **xp_events (append-only INSERT):** `trackXpEvent()` appends meaningful events.
  Fired from `notifyAssignmentComplete` **gated on the just-closed attempt** so a
  duplicate completion writes no extra row; true replays (new attempt) log again
  (correct for a ledger).
- Deferred no-ops (stable API, local-first): `syncMissionProgress`,
  `saveCloudProgress` (no progress-blob column in schema), `trackGameEvent` (no
  general events table). Old names kept as aliases for unchanged call sites.

## Attempt lifecycle (replayable assignments) — LOCAL-ONLY mirror
Attempt metadata lives in its own namespace `ech.backend.v1` (never the gameplay
save). `startMissionAttempt`/`startAssignmentAttempt` **reuses an open attempt**
(resume-safe, no count inflation); `abandonMissionAttempt` (every reset/restart)
closes it so the next start increments `attempt_number`; `completeMissionAttempt`
is **idempotent** — returns `null` if nothing open (so the two completion paths,
quiz + `completeMissionEngine`, can both call `notifyAssignmentComplete` safely)
and otherwise **returns the just-closed record** (used to gate the xp_event).

## Env / build
Anon key is public by design (guard real access with RLS). Replit secrets live in
`process.env` (no `VITE_` prefix), so `vite.config.ts` injects them via `define`
into `import.meta.env.SUPABASE_URL` / `SUPABASE_ANON_KEY`. **A vite restart is
required** for changed secrets to reach the browser bundle. Note: the
`code_execution` sandbox has NO `process.env` — probe the live DB with a Node
script via bash (secrets are injected into the repl shell). Never print secrets.

## Migrations
Migration schema (`supabase/migrations/001_initial_game_schema.sql`, docs in
`docs/SUPABASE_SCHEMA.md`) is **already pushed**: `profiles`, `missions`,
`student_progress`, `mission_attempts`, `xp_events`, `certificates`. Migrations
are migrations-only (never edit tables in the UI) and must stay
additive/idempotent. Apply via `supabase db push`; see
`docs/SUPABASE_MIGRATION_SETUP.md`. The old B0 tables (`student_profiles`,
`assignment_progress`, `assignment_attempts`, `game_events`) **do not exist** and
are no longer referenced by the app.
