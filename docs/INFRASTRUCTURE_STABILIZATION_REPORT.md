# Infrastructure Stabilization Report — Phase 3B

_Companion to [docs/SUPABASE_STATUS_REVIEW.md](./SUPABASE_STATUS_REVIEW.md)
(the verification snapshot). This report covers the changes made after the review._

## Decision

The verification found the production schema already pushed, but only the **anon
key** is available and the schema's RLS is secure-by-default (anon may
`SELECT`+`INSERT`, **not** `UPDATE`/`DELETE`; `missions` is read-only and
unseeded). The user chose the **safe subset**: align the sync layer **only** to
operations the anon browser client is permitted to perform — no auth, no RLS
changes, no schema invention.

## What changed

All changes are confined to the cloud layer; gameplay and the authoritative
`localStorage` save (`ech.progress.v1`) are untouched.

### `lib/backendSync.js` — rewritten to the real schema (anon-permitted ops only)

- **Profile mapping (`profiles`, INSERT-once).** `ensureProfileId()` maps this
  browser's `anonymous_id` to a `profiles` row using an upsert with
  `ignoreDuplicates` (i.e. `INSERT … ON CONFLICT DO NOTHING` — **no `UPDATE`**, so
  RLS-safe), then `SELECT`s the row's `id` and caches it (`ech.profile_id`).
  Self-healing: if a cached id goes stale, it is cleared and re-resolved.
- **XP ledger (`xp_events`, append-only INSERT).** New `trackXpEvent()` appends a
  meaningful event (currently `mission_completion`) with `profile_id`,
  `event_type`, `xp_change`, `description`, and `metadata`. Wired into the single
  completion chokepoint and **gated on a freshly-closed attempt** so duplicate
  completion calls don't write duplicate rows (true replays still log a new row —
  correct for an append-only ledger).
- **Read warm-up.** `loadCloudProgress()` now does a `SELECT`-only connectivity
  check and returns `null` (the normalized schema has no progress-blob column to
  restore from; local-first is preserved).
- **Deferred as documented local-only no-ops** (require an `UPDATE`-capable writer
  and/or a seeded `missions` catalog — neither available under anon):
  `syncMissionProgress` (`student_progress`), profile-total updates,
  `mission_attempts` cloud writes, full-blob `saveCloudProgress`, and the general
  `trackGameEvent` analytics (no destination table in the schema).
- **Attempt tracking** remains a **local-only** mirror in the `ech.backend.v1`
  namespace (numbering, resume-reuse, abandoned/best-score) — unchanged in spirit,
  with cloud writes removed.
- **Back-compat:** the previously exported names (`startAssignmentAttempt`,
  `abandonAssignmentAttempt`, `completeAssignmentAttempt`,
  `syncAssignmentProgress`) are kept as aliases so existing `script.js` call sites
  are unchanged.

### `script.js`

- Imports `trackXpEvent` and calls it once from `notifyAssignmentComplete()`,
  gated on the attempt that was just closed (idempotent), with the mission's XP
  reward and `attempt_id`/`attempt_number` in `metadata`.

## Result

- The **`student_profiles` 404 noise is gone**; the status pill reads
  **"Supabase Connected"** on load.
- Assignments 1–3 play unchanged; every cloud call is fire-and-forget and
  non-blocking; the game is fully playable with Supabase absent or down.
- No auth added, no RLS relaxed, no new tables invented, `localStorage` remains
  authoritative.

## Verification

- `node --check script.js` / `node --check lib/backendSync.js` — pass.
- `pnpm --filter @workspace/ethical-cyberhackers-platform run typecheck` — pass.
- Workflow restarted; fresh load console clean (only Vite messages); status pill
  "Supabase Connected".
- Architect review: approach approved (RLS-safe, local-first, constraints met);
  the two flagged robustness gaps (idempotency, stale-id self-heal) were fixed.

## Still blocked (needs a future decision — out of safe-subset scope)

Full progression sync (`student_progress` best/current, growing
`profiles.xp_total`, `mission_attempts` keyed by `mission_id`) requires either a
**service-role-backed writer** (e.g. via the existing `api-server`, plus a
one-time `missions` seed) or **authentication** (owner-scoped RLS). Both were
explicitly deferred by the user.
