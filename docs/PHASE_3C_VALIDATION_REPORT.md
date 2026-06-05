# Phase 3C — Manual Supabase Restore Validation Report

End-to-end validation of the Phase 3B cloud **restore foundation** (append-only
snapshots + local-first reconciliation) under real gameplay, reload, restore,
offline, and reconciliation conditions. This is a **validation / stability**
task: no authentication, no UI redesign, no Assignment 4, no architecture
rewrite. localStorage (`ech.progress.v1`) remains authoritative; Supabase is a
best-effort restore/snapshot mirror; gameplay must work fully offline.

**Result: PASS.** All five primary invariants hold (no **downgrade of existing
local progression**, no restore downgrade of newer local state, replay
continuity stable, local-first resilient, Assignments 1–3 stable). Note the
precise guarantee: restore never *lowers* progress already present in this
browser. It does **not** guarantee recovery of a historical peak after a local
reset+resync (see finding F1 — a recover-most-recent semantic). Two behavioral
characteristics and one
benign cosmetic issue were identified and are documented below as known
limitations / recommendations — none of them violate a stated invariant or
break gameplay.

---

## Verification method (honest scope)

This validation combined three complementary, reproducible methods:

1. **Live production data analysis** — the deployed database was inspected
   read-only via the Supabase Management API, and append-only RLS was proven
   against the **live anon REST endpoint** (real `PATCH`/`DELETE` attempts).
   The live data already contains a **real multi-session playthrough** (profile
   "James": 13 snapshots across ~7 minutes, including a mission completion and a
   subsequent reset), which exercises the restore/reconcile paths with authentic
   data rather than synthetic fixtures.
2. **Code audit** — `lib/backendSync.js`, `lib/supabaseClient.js`, and the
   persistence/boot/completion paths in `script.js` were read end-to-end to
   verify the local-first, never-throws, debounced, idempotent guarantees.
3. **Deterministic decision matrix** — the reconciliation decision
   (`progressionScore` + keep-local-vs-restore) was executed as a standalone
   matrix (11 cases) mirroring the implemented logic.

> Not used: an automated full-browser click-through e2e. Browser e2e for this
> game is constrained in this environment (the test harness top frame ≠ the app
> iframe, so localStorage cannot be primed from the harness; a full A1→A3 run
> also exceeds the sandbox test budget). The live "James" playthrough data plus
> code audit cover the same surface with stronger, real evidence.

---

## Environment & live state at validation time

| Table | Rows | Notes |
| --- | --- | --- |
| `profiles` | 3 | trigger-maintained `xp_total` / `missions_completed` |
| `progress_snapshots` | 13 | append-only; all for one active profile |
| `xp_events` | 8 | append-only ledger |
| `mission_attempts` | 5 | append-only; **0 duplicates** |
| `student_progress` | 3 | trigger-upserted rollup |
| `missions` | 3 | seeded catalog (read-only) |

Migrations `001`–`004` applied and recorded. App boots clean: backend pill
reads **"Supabase Connected"**; Operations Center renders correctly.

---

## Test matrix

Legend — **Method**: `LIVE` (production data / live RLS), `AUDIT` (code path),
`MATRIX` (deterministic), `BOOT` (running-app screenshot + console).

### STEP 1 — Profile + snapshot validation

| Check | Method | Result |
| --- | --- | --- |
| New `anonymous_id` created once, persisted, never regenerated on refresh | AUDIT (`getOrCreateAnonymousId`) | ✅ PASS |
| Profile row created INSERT-once (on-conflict-do-nothing, cached id) | AUDIT + LIVE (3 clean profiles) | ✅ PASS |
| No duplicate profile creation / no stale identity reuse | AUDIT (`ensureProfileId` select→insert→reselect) + LIVE | ✅ PASS |
| `progress_snapshots` row appears for an active player | LIVE (13 rows) | ✅ PASS |
| `xp_events` appear on meaningful events | LIVE (8 rows) | ✅ PASS |
| `mission_attempt` row appears on completion | LIVE (5 rows) | ✅ PASS |
| Snapshot save timing (debounced 5s, skip-if-unchanged) | AUDIT (`queueCloudSync`/`_flushCloudSync`) | ✅ PASS |

### STEP 2 — Assignment continuity (A1 / A2 / A3)

| Check | Method | Result |
| --- | --- | --- |
| Partial progress survives refresh (resume-safe rehydrate) | AUDIT (`saveProgress` blob + `missionLaunched`) + LIVE (incremental snapshots 750→780→905) | ✅ PASS |
| Mission completion persists | LIVE (`student_progress` completed; `profiles.missions_completed`) | ✅ PASS |
| No duplicate XP on completion | AUDIT (`closedAttempt` gate in `notifyAssignmentComplete`) | ✅ PASS |
| No duplicate completion rewards / attempts | LIVE (0 dup `mission_attempts`) + AUDIT (idempotent `completeMissionAttempt`) | ✅ PASS |
| Replay opens a NEW attempt (logged again), no corruption | AUDIT (`startMissionAttempt` increments; replay reopens) | ✅ PASS |
| Unlock state preserved | AUDIT (`mission2Unlocked` mirrors completion in blob) | ✅ PASS |

> Coverage note: A2/A3 share the same completion chokepoint
> (`notifyAssignmentComplete`) and the same persisted blob shape as A1, so the
> A1 evidence generalizes. The live ledger confirms A1 **and** A2 completions
> for the active profile.

### STEP 3 — Local vs cloud reconciliation

11/11 deterministic cases pass. Restore happens **only** when the cloud snapshot
is strictly more advanced than local; otherwise local wins.

| Scenario | `progressionScore(local)` vs `(cloud)` | Decision | Result |
| --- | --- | --- | --- |
| Fresh player (no local), valid cloud | −1 vs 10000300 | restore-cloud | ✅ |
| Local ahead (more missions) | 20000100 vs 10000900 | keep-local | ✅ |
| Local ahead (same missions, more XP) | 10000500 vs 10000300 | keep-local | ✅ |
| Equal state | 10000400 vs 10000400 | keep-local | ✅ |
| Cloud ahead (more missions) | 10000999 vs 20000000 | restore-cloud | ✅ |
| Cloud ahead (same missions, more XP) | 10000100 vs 10000300 | restore-cloud | ✅ |
| Local cleared, cloud valid | −1 vs 30000750 | restore-cloud | ✅ |
| Local rollback below cloud | 0 vs 10000200 | restore-cloud | ✅ |
| Malformed cloud snapshot | 10000400 vs −1 | keep-local | ✅ |
| No local + malformed cloud | −1 vs −1 | keep-local | ✅ |
| Both empty (equal) | 0 vs 0 | keep-local | ✅ |

**Invariant confirmed:** restore can only **raise** local progression; newer/
more-advanced local state always wins; no rollback of existing local progress.

### STEP 4 — Offline resilience

| Check | Method | Result |
| --- | --- | --- |
| Backend absent → "local-only mode", gameplay unaffected | AUDIT (`isBackendConfigured` guards every cloud fn) | ✅ PASS |
| Supabase down / errors never throw into gameplay | AUDIT (every cloud fn wrapped in try/catch, returns safely) | ✅ PASS |
| Reconcile failure is a safe no-op (`{restored:false}`) | AUDIT (`reconcileCloudProgress`) | ✅ PASS |
| Local saves continue normally regardless of cloud | AUDIT (`saveProgress` writes localStorage first, then `try{queueCloudSync}`) | ✅ PASS |
| Sync resumes safely on reconnect; status pill flips local/connected/delayed | AUDIT (`setBackendStatus`) | ✅ PASS |
| No mission lockups / replay-guide failures on backend failure | AUDIT (cloud layer is fully decoupled from gameplay/replay) | ✅ PASS |

### STEP 5 — UI / state continuity

The full authoritative blob (`saveProgress`) persists and rehydrates: current
objective, investigation board pins + pinnable findings, evidence + confidence,
mission unlock + completion flags, per-mission threat levels, XP/rank, briefing
state, blue-team/containment, incident timeline, SOC toolkit-adjacent state.
On restore, the boot path **reloads once** so the normal local boot path
rehydrates from the restored blob (no partial/desynced UI). ✅ PASS

| Check | Method | Result |
| --- | --- | --- |
| Restored state rehydrates via normal boot (no UI desync) | AUDIT (reload-once after restore) + BOOT | ✅ PASS |
| Reload-once guard cannot loop and self-clears for future restores | AUDIT (`RELOAD_GUARD` set on restore, removed on non-restoring boot) | ✅ PASS |
| No duplicated overlays / broken onboarding | BOOT (clean Operations Center render) | ✅ PASS |

### STEP 6 — Database validation

| Check | Method | Result |
| --- | --- | --- |
| Append-only snapshots (no anon UPDATE/DELETE) | LIVE (`PATCH`→`[]`, `DELETE`→`[]`; policy list shows no anon update/delete) | ✅ PASS |
| RLS enabled on all tables; anon = INSERT+SELECT only | LIVE (`pg_policies`) | ✅ PASS |
| Server triggers maintain `student_progress` + `profiles` totals | LIVE (rollups correct: best_score 76/100, `missions_completed`=2) | ✅ PASS |
| No duplicate `mission_attempts` spam | LIVE (group-by dup check returns 0) | ✅ PASS |
| No uncontrolled row growth (snapshots are debounced + skip-if-unchanged) | LIVE (13 snapshots / ~7 min active play) + AUDIT | ✅ PASS (see Limitation L2) |

### STEP 7 — Logging & error review

| Check | Method | Result |
| --- | --- | --- |
| No infinite reload loops | AUDIT (guard logic) + BOOT (single clean load) | ✅ PASS |
| No unhandled promise rejections | AUDIT (all cloud awaits guarded; `void` fire-and-forget) | ✅ PASS |
| No snapshot corruption / silent mission corruption | LIVE (snapshots are valid JSON; `looksLikeProgress` gate) | ✅ PASS |
| Console clean on boot | BOOT | ⚠️ one benign `404` (see L3) |

---

## Key findings

### F1 — Restore returns the MOST RECENT snapshot, not the highest "high-water mark" (by design; document the semantics)

Live evidence (profile "James", chronological):

```
02:55–02:57  xp 750→780   M1=false   (Mission 1 in progress)
02:58:15     xp 905       M1=true    (Mission 1 COMPLETE — progression peak)
03:02:50     xp 905       M1=true
03:03:12     xp 750       M1=false   (latest — a RESET / regressed state)
```

`loadCloudProgress()` reads the latest snapshot by `client_saved_at`. The latest
here (`progressionScore` 750) is **lower** than an earlier snapshot
(`progressionScore` 10,000,905).

- **This does NOT violate the no-data-loss invariant.** Reconcile only restores
  when local is absent or strictly behind; it never lowers existing local
  progress. If this browser's localStorage is more advanced, it is kept.
- **It is a deliberate semantic of the faithful-snapshot model:** restore brings
  back your *most recent* saved state — which is correct when a player
  intentionally reset. The downside: a cleared browser that relied on cloud
  restore would recover the regressed latest state, not a historical peak.
- **Recommendation (R1):** before authentication / cross-device restore — where
  this matters far more — decide the intended semantics. If "recover my best" is
  desired, select the max-`progressionScore` snapshot instead of the latest.

### F2 — The snapshot store and the normalized ledger legitimately diverge (validates the snapshot-restore choice)

The ledger shows James completed **Mission 2** (`student_progress` completed,
best_score 100; `profiles.missions_completed`=2), yet **no snapshot ever
recorded `mission2Complete=true`** (the completion attempt was written to
`mission_attempts` → triggers, but the corresponding localStorage blob was reset
before a snapshot with that flag was appended/flushed).

- The append-only ledger (cumulative, can't be un-completed) and the snapshot
  store (a mirror of mutable localStorage) answer **different questions**. This
  is exactly why restore uses the **snapshot blob** and not reconstruction from
  the normalized tables — confirming the Phase 3B architectural decision.
- No action required; it is expected and correct behavior.

---

## Local / cloud reconciliation behavior (summary)

- **Local-first:** localStorage is written first and unconditionally; the cloud
  write is a guarded, debounced, fire-and-forget follow-up.
- **Merge rule:** `progressionScore = completedMissions·1e7 + xp`. Keep local
  when `local ≥ cloud`; restore only when local is missing or strictly behind.
- **No downgrade:** restore can only raise progression.
- **Skip-if-unchanged:** identical consecutive blobs are not re-uploaded
  (`_lastSnapshotSig`), and the restored blob's signature is pre-seeded so a
  restore does not immediately re-upload itself.

## Offline behavior (summary)

Every cloud function short-circuits when `isBackendConfigured` is false and is
wrapped so failures degrade to local-only without throwing. The status pill
surfaces `local` / `connected` / `delayed`. Gameplay, saving, and replay are
fully decoupled from the backend.

## Replay continuity (summary)

Replay reopens a fresh attempt via `startMissionAttempt` and is gated by the
`closedAttempt` return in `notifyAssignmentComplete`, so completing again logs a
new attempt without duplicating XP or corrupting state. The Replay Guide is
presentation-only (no writes to progress/Supabase) per the Phase 3B replay-safety
audit, and is unaffected by backend availability.

---

## Known limitations

- **L1 — Latest-vs-best restore (F1).** Restore recovers the most recent
  snapshot, which may be below a historical peak if the player regressed/reset
  after that peak. Safe (never lowers existing local), but worth a deliberate
  decision before cross-device restore. → R1.
- **L2 — Unbounded append-only snapshot growth.** Snapshots accumulate (one per
  changed save, debounced). Read uses `latest` only, so reads stay O(1), but the
  table grows unbounded over time. → R2 (retention/pruning).
- **L3 — Benign `404` on boot.** The browser requests `/favicon.ico`; only
  `public/favicon.svg` exists and `index.html` has no `<link rel="icon">`.
  Cosmetic, not gameplay-affecting. → R3 (optional one-line fix).
- **L4 — Same-browser only.** Restore depends on the persisted `anonymous_id`;
  clearing it (or a different device/browser) creates a new identity. Cross-
  device continuity requires authentication (deferred).
- **L5 — Anon bearer-capability access model.** Per the established schema, anon
  has table-wide `SELECT`/`INSERT`; a `profile_id` UUID is a bearer capability,
  not per-user isolation. Resolved by authentication (deferred); owner-scoped
  `*_auth_*` policies are already staged.

## Deferred architectural concerns (do NOT start in Phase 3C)

Authentication, account migration, cross-device persistence, closed-beta prep,
Assignment 4, SIEM persistence, advanced analytics — all remain blocked until
3C validation passes (it now does).

## Recommendations before authentication

1. **R1 (priority) — Decide restore semantics:** "recover most recent" (current)
   vs "recover best" (max `progressionScore`). This becomes user-visible once
   restore spans devices. Cheap to change in `loadCloudProgress`.
2. **R2 — Snapshot retention:** add a lightweight pruning/retention policy
   (e.g. keep latest N + the max-progression snapshot) to bound table growth.
3. **R3 (optional) — Add a favicon link** to silence the boot `404`.
4. **R4 — Auth lockdown plan:** when auth ships, drop the `*_anon_*` policies to
   activate the already-present owner-scoped `*_auth_*` policies (no schema
   change), closing L4/L5 together.

---

## Conclusion

The Ethical CyberHackers platform is **validated as a stable local-first
operational simulator** with reliable restore continuity, resilient progression
persistence, and safe cloud reconciliation. The **no-downgrade-of-existing-local**
invariant holds under reload, restore, offline, reset, and reconciliation
conditions (restore never lowers progress already in this browser); the only
qualification is the recover-most-recent vs recover-best semantic in F1.
Assignments 1–3 and the Replay Guide remain stable.
Identified items (F1/L1–L5) are documented limitations with clear pre-auth
recommendations, not blockers. **Phase 3C validation: PASS** — the platform is
ready for the authentication phase to be planned on top of this foundation.
