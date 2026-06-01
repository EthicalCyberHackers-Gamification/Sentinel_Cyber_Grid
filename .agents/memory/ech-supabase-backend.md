---
name: Supabase backend (Phase B0) — local-first contract
description: How the optional Supabase layer is wired into the local-first game; the rules any future backend change must keep.
---

# Supabase backend foundation (local-first)

The game is browser-only and **local-first**: `localStorage` (`ech.progress.v1`)
is authoritative. Supabase is an **optional** background mirror + lightweight
analytics layer in `lib/supabaseClient.js` + `lib/backendSync.js`, wired into
`script.js` with fire-and-forget hooks. There is **no auth** — players are keyed
by an anonymous id (`anon_<hex>`, localStorage key `ech.anon_id`).

## Non-negotiable rules (why this exists)
- **No sync call may throw into the caller or block gameplay.** All script-side
  calls are wrapped `try{…}catch(_){}`; the lib wraps queries in `runSafe()`
  (retry once, downgrade status, never throw). **Why:** the game must stay fully
  playable with Supabase missing/down.
- **localStorage wins.** `loadCloudProgress()` deliberately does NOT overwrite
  local state in B0 (no auth/identity yet). Don't add auto-restore without an
  identity story.
- **Don't spam the backend.** Both write paths are debounced: `queueCloudSync()`
  (profile + progress + full-blob backup) is debounced *as a whole*, and
  `trackGameEvent()` is batched (~4s / 25 events, flushed on tab-hide).
  **Why:** a regression that debounced only part of `queueCloudSync` was caught
  in review — keep the whole coordinator rate-limited.

## Attempt lifecycle (replayable assignments)
Attempt metadata lives in its own namespace `ech.backend.v1` (never the gameplay
save). `startAssignmentAttempt` **reuses an open attempt** (resume-safe, no count
inflation); `abandonAssignmentAttempt` (called by every reset/restart) closes it
so the next start increments `attempt_number`; `completeAssignmentAttempt` is
**idempotent** — it no-ops if no attempt is open, which is what makes the game's
*two* completion code paths (quiz path + `completeMissionEngine`) safe to both
call `notifyAssignmentComplete()` without double-completing.

## Env / build
Anon key is public by design (guard real access with RLS). Replit secrets live in
`process.env`, not `VITE_`-prefixed files, so `vite.config.ts` injects them via
`define` into `import.meta.env.SUPABASE_URL` / `SUPABASE_ANON_KEY`. **A vite
restart is required** for changed secrets to reach the browser bundle.

## State to expect
Until the schema SQL in `docs/SUPABASE_SCHEMA.md` is run, the client connects but
every op returns "table not found" → status shows "Sync Delayed" and a benign
console warning. That is the correct foundation-phase state, not a bug.
