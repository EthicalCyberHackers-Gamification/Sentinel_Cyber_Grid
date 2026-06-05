# Phase 3B — Infrastructure Audit & Persistence Foundation

Status snapshot of the live Supabase backend, the browser sync layer, and the
local-first guarantees, and the record of the cloud progress **restore** layer
built on top of them (migration `004` + the snapshot save/load/reconcile path).
Authentication remains **deferred** until cross-device identity is needed; the
same-browser restore foundation is now in place.

> **Verification method.** The live database was inspected directly via the
> Supabase Management API (schema, RLS, triggers, seed data, row counts, and
> data-integrity cross-checks). The browser sync layer was audited by reading
> `lib/backendSync.js`, `lib/supabaseClient.js`, and the persistence code paths
> in `script.js`.

---

## 1. Deployed migrations (LIVE — confirmed)

All migrations are applied to the live project (recorded in
`supabase_migrations.schema_migrations` as versions `001`–`004`):

- `001_initial_game_schema.sql` — 6 tables, RLS, indexes, `updated_at` triggers,
  `pgcrypto`.
- `002_seed_missions.sql` — mission catalog seeded.
- `003_server_triggers.sql` — server-side rollup triggers.
- `004_progress_snapshots.sql` — **append-only full-progress snapshot table**
  (the Phase 3B restore destination). Applied via the Management API and recorded
  in the migration history; additive + idempotent.

In-app status indicator reads **"Backend: Supabase Connected."**

## 2. Verified tables & security

| Table | Exists | RLS enabled |
| --- | --- | --- |
| `profiles` | ✅ | ✅ |
| `missions` | ✅ | ✅ |
| `student_progress` | ✅ | ✅ |
| `mission_attempts` | ✅ | ✅ |
| `xp_events` | ✅ | ✅ |
| `certificates` | ✅ | ✅ |
| `progress_snapshots` | ✅ | ✅ |

- `pgcrypto` extension present.
- Missions seeded: `mission-001` (xp 250), `mission-002` (xp 300),
  `mission-003` (xp 100), all `is_active = true`, ordered 1–3.
- **RLS policies** (confirmed live): `missions` read-only for anon+auth;
  `profiles`/`student_progress` allow anon `INSERT`+`SELECT` only (auth users get
  owner-scoped `ALL` via `auth.uid()`); `mission_attempts`/`xp_events`/
  `certificates`/`progress_snapshots` are append-only for anon (`INSERT`+`SELECT`,
  no `UPDATE`/`DELETE`). **No anonymous `UPDATE`/`DELETE` anywhere.**
- **`progress_snapshots` RLS verified by live test** using the anon key: anon
  `INSERT` ✅ and `SELECT` ✅ succeed; anon `UPDATE`/`DELETE` are RLS no-ops
  (0 rows affected — the stored row's `schema_version`/`xp` were unchanged),
  proving the append-only / immutable-checkpoint guarantee. Auth policies are
  owner-scoped via `profiles.user_id` for the future lockdown path.

## 3. Trigger behavior (confirmed installed)

- `trg_mission_attempt_upsert` (AFTER INSERT on `mission_attempts`) → upserts
  `student_progress` (best score/confidence/attempts/status/completed_at) and
  increments `profiles.missions_completed` on first completion.
- `trg_xp_event_rollup` (AFTER INSERT on `xp_events`) → increments
  `profiles.xp_total` / `trust_score`.
- Both run `SECURITY DEFINER`, so the anon client never needs `UPDATE`.
- Plus three `updated_at` housekeeping triggers.

## 4. Current sync behavior (write paths)

| Write | Status | Notes |
| --- | --- | --- |
| `profiles` (INSERT-once) | **Succeeds** | Maps `anonymous_id` → profile row; cached locally. |
| `mission_attempts` (append) | **Succeeds** | On completion; drives the upsert trigger. |
| `xp_events` (append) | **Succeeds** | Meaningful events only; drives the XP rollup trigger. |
| `student_progress` | **Trigger-maintained** | Client never writes it directly. |
| `profiles` totals (xp/trust/missions) | **Trigger-maintained** | Anon cannot UPDATE; server triggers do it. |
| `saveCloudProgress()` | **Implemented** | Appends the full progress blob to `progress_snapshots` (skips when unchanged); best-effort, never throws. Driven by the debounced `queueCloudSync()` in `saveProgress()`. |
| `loadCloudProgress()` | **Implemented** | Read-only — resolves profile id, returns the latest snapshot `{ blob, savedAt }` or `null`. Never creates a profile, never touches local state. |
| `reconcileCloudProgress()` | **Implemented** | Local-first boot reconciliation (see §5). |
| `trackGameEvent()` | **No-op by design** | No event table in the production schema. |

Live data confirms the write paths work: 3 profiles, 4 mission_attempts,
7 xp_events, 3 student_progress rows; `student_progress` correctly reflects
attempt counts and best scores.

## 5. Restore-path status

**Implemented (faithful snapshot).** The authoritative `localStorage`
(`ech.progress.v1`) blob is mirrored verbatim into `progress_snapshots`, so a
restore brings back **everything exactly** — XP, rank, mission completion,
evidence/pins, confidence/reasoning, blue-team/incident state, replay flags — with
no lossy reconstruction from the analytics tables.

**Reconciliation (`reconcileCloudProgress()`, run once at boot, async, never
blocks gameplay).** It compares a **progression score** of local vs the latest
cloud snapshot — completed-mission count dominates, XP breaks ties — and:

- keeps **local** when a usable local save exists and is `>=` the cloud
  (the common case, incl. delayed sync / Supabase down);
- restores the **cloud** blob into `localStorage` only when there is no usable
  local save, **or** the cloud snapshot is strictly more advanced (local cleared
  or rolled back). On restore it reloads **once** (sessionStorage-guarded) so the
  normal local boot path rehydrates the restored state — converges in one pass and
  cannot loop.

**No-data-loss invariant** is the design guarantee: restore can only ever *raise*
progression, never lower it. Verified by a deterministic decision-matrix test
(fresh / local-ahead / equal / cloud-cleared / rollback / completions-dominate /
malformed-cloud).

> **Scope:** this is **same-browser** restore (the `ech.anon_id` identity must
> persist). It is the durable foundation for auth-backed cross-device restore,
> which is deferred (see §8).
>
> **Accepted anon access model (not a regression).** Like every other ledger
> table (`profiles`, `mission_attempts`, `xp_events`, `certificates`),
> `progress_snapshots` uses anon `SELECT using (true)` + `INSERT with check
> (true)`. In the anon-only phase there is no `auth.uid()` to scope rows by, so a
> `profile_id` (a random UUID) functions as a **bearer capability**: rows are not
> reachable without already holding the id. This is the same trust model the whole
> backend ships with today; per-profile isolation (and locking down the `*_anon_*`
> policies) is exactly what **authentication** introduces — the owner-scoped
> `*_auth_*` policies are already in place for that lockdown. Append-only RLS
> (no anon `UPDATE`/`DELETE`) additionally guarantees existing snapshots are
> immutable.

## 6. Local-first invariants (verified by code audit)

- **Offline / backend absent:** when `SUPABASE_URL`/`SUPABASE_ANON_KEY` are
  unset, `supabase` is `null`, `isBackendConfigured` is false, every sync
  function early-returns, and the app logs *"Running in local-only mode."* Fully
  playable.
- **Backend down / errors:** every cloud call is wrapped in `try/catch`, never
  throws into gameplay, and degrades to a "Sync Delayed" indicator.
- **Cloud never overwrites newer/equal local:** boot reconciliation is fired
  **not awaited** and only restores cloud when local is absent or strictly behind
  (progression-score gated); otherwise `restoreSavedProgress()` drives state from
  `localStorage`. Restore can only raise progression, never lower it.
- **Local is authoritative:** `saveProgress()` writes `localStorage` first
  (now stamped with `savedAt`), then enqueues a debounced (5s) best-effort cloud
  snapshot append.
- **Survives reload:** state is rehydrated from `localStorage` on boot.
- **Replay safety:** the Replay Guide / Briefing Replay are presentation-only and
  independent of sync (see `docs/REPLAY_SAFETY_CHECK_REPLIT_#7.md`).

## 7. Known architectural gaps (decision-critical)

1. **XP number-space mismatch (blocks naive cloud→local XP restore).** Local
   gameplay XP starts at `INITIAL_XP = 750` and is capped at `MAX_XP = 1000`.
   The cloud `profiles.xp_total` is an **accumulation of `xp_change` deltas from
   0** (e.g. mission rewards 250/300/100). These are **different number spaces**
   — cloud `xp_total` cannot be restored into the local `xp` field directly.
2. **Cloud `xp_total` is historically unreliable.** A live profile shows
   `xp_total = 300` while `sum(xp_events.xp_change) = 600` (events recorded
   before `003` triggers existed never rolled up). Cloud XP is therefore an
   approximate audit signal, not a faithful save.
3. **Rich local state is not modeled in the normalized tables.** The local
   progress blob carries far more than completions/scores — evidence pins,
   confidence contributors, reasoning-answered sets, blue-team containment state,
   incident timelines, briefing-reviewed flags, decision drift, etc. None of this
   exists in `profiles`/`student_progress`/`mission_attempts`, so reconstruction
   from those tables would be **lossy**. → **Resolved** by the faithful-snapshot
   approach (`progress_snapshots` stores the full blob; §5).
4. **Anonymous identity boundary.** The cloud profile is keyed by
   `ech.anon_id` (localStorage). If localStorage is fully cleared, the
   `anon_id` is lost and there is no way to find the cloud rows. **True
   cross-device restore requires stable identity = authentication** (deferred).
   Same-browser restore (e.g. corrupted/cleared progress blob, identity intact)
   is achievable now.

## 8. Authentication blockers (why auth stays deferred)

- Cross-device sync (auth's headline benefit) is meaningless until a restore path
  exists. Build restore first.
- The schema is auth-ready (`profiles.user_id` + owner-scoped `*_auth_owner`
  policies), so auth can later **claim** an anonymous profile with no schema
  redesign.

## 9. Future migration concerns

- The restore destination is the **append-only snapshot table**
  (`004_progress_snapshots`), chosen to fit the anon `INSERT`+`SELECT`/no-`UPDATE`
  RLS model. Snapshots accumulate per profile (one append per changed save, ~5s
  debounced); a future **retention/prune** migration may cap rows per profile
  (e.g. keep the latest N) — additive and safe to defer.
- `004` was applied via the Management API and **manually recorded** in
  `supabase_migrations.schema_migrations` (version `004`). It is idempotent, so a
  later `supabase db push` re-applying it is harmless.
- All future migrations stay additive + idempotent (no drop/truncate), per
  `docs/SUPABASE_MIGRATION_SETUP.md`.

## 10. Recommended sequencing (after this audit)

1. **Cloud progress restore foundation** (this phase) — ✅ **done**: store +
   restore the authoritative progress with a local-first, no-loss merge.
2. **Local-first & resume-safety re-audit** — re-prove invariants after restore.
3. **Authentication (Clerk)** — claim anonymous profiles; enable true
   cross-device.
4. **Analytics dashboard** — built on the existing ledgers.
5. **Closed beta prep** — privacy, RLS lockdown, monitoring, runbook.
6. **Deferred:** SIEM persistence, deep event store, real security-event engine.
