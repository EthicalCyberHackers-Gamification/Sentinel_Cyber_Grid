---
name: ECH cloud progress restore (faithful snapshot)
description: Why cloud restore uses a full-blob snapshot + how local-first reconciliation must behave so restore can never lose progress.
---

# Cloud progress restore = faithful full-blob snapshot, not reconstruction

Restore mirrors the authoritative localStorage blob (`ech.progress.v1`) verbatim
into an **append-only** cloud table and replays it; it does NOT rebuild state from
the normalized analytics tables.

**Why:** the normalized tables (`profiles`/`student_progress`/`mission_attempts`/
`xp_events`) are an analytics mirror and reconstruction is lossy — (a) cloud
`xp_total` accumulates deltas from 0 while local gameplay XP starts at 750 / caps
at 1000 (different number spaces, not convertible), (b) some historical
`xp_total` rows disagree with summed `xp_events` (pre-trigger data), and (c) rich
in-mission state (evidence pins, confidence/reasoning sets, blue-team/incident
timelines, briefing flags) is not modeled in those tables at all.

**How to apply:**
- Cloud writes stay best-effort and MUST NOT throw into gameplay; localStorage is
  always authoritative and written first.
- Reconciliation at boot compares a **progression score**
  (`completedMissionCount * 1e7 + xp`) of local vs the latest cloud snapshot.
  Keep local when local >= cloud; restore cloud only when local is missing OR
  strictly behind. Invariant: **restore can only raise progression, never lower
  it** — this is the no-data-loss guarantee, so always gate on the score, never on
  timestamp alone.
- On restore, write localStorage then reload ONCE so the normal local boot path
  rehydrates. The one-shot reload guard (sessionStorage) must be **cleared on any
  non-restoring boot**, otherwise it permanently suppresses future legitimate
  restores in the same tab. Clearing on restore=false is still loop-safe (we only
  reload when the guard is unset, and only clear it when nothing was restored).

# Anon RLS is a bearer-capability model (not per-user isolation)

Every ECH ledger table (incl. `progress_snapshots`) uses anon
`SELECT using (true)` + `INSERT with check (true)`, append-only (no anon
UPDATE/DELETE). In the anon-only phase there is no `auth.uid()`, so the random
`profile_id` UUID acts as a bearer capability (rows unreachable without the id).

**Why:** true per-profile isolation requires authentication; it is deferred.
Owner-scoped `*_auth_*` policies already exist for the eventual lockdown (drop the
`*_anon_*` policies, no schema change). Do not "fix" the broad anon policies in
isolation — that is the auth migration, not a restore bug.
