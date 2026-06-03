/**
 * lib/backendSync.js
 * ------------------
 * Phase 3B — best-effort cloud sync layer, aligned to the production schema
 * (`supabase/migrations/001_initial_game_schema.sql`). LOCAL-FIRST.
 *
 * Every function here is fire-and-forget and fully fault-tolerant:
 *   - never throws into the caller,
 *   - never blocks gameplay,
 *   - debounces / batches writes so we don't spam the backend,
 *   - silently continues locally when the backend is missing or down.
 *
 * localStorage remains the authoritative save (handled in script.js). This layer
 * only mirrors a small, RLS-permitted slice of state to the cloud.
 *
 * SAFE-SUBSET SCOPE (see docs/SUPABASE_STATUS_REVIEW.md):
 *   The browser has ONLY the anon key, and the schema's RLS is secure-by-default
 *   — anon may SELECT + INSERT but NOT UPDATE/DELETE, and cannot seed `missions`.
 *   So this layer implements exactly what anon is allowed to do:
 *     • map this browser's anonymous_id -> a `profiles` row (INSERT-once),
 *     • append meaningful `xp_events` (e.g. mission completion),
 *     • read warm-up.
 *   The progression rollup that REQUIRES an UPDATE-capable writer or a seeded
 *   missions catalog (`student_progress` best/current, growing `profiles.xp_total`,
 *   `mission_attempts` keyed by `mission_id`) is intentionally kept LOCAL-ONLY
 *   here and left as documented no-ops until a service-role/auth writer exists.
 *   Attempt bookkeeping below is therefore a LOCAL-ONLY mirror (no cloud writes).
 */

import {
  supabase,
  isBackendConfigured,
  getOrCreateAnonymousId,
  setBackendStatus,
} from "./supabaseClient.js";

const ATTEMPTS_KEY = "ech.backend.v1";
const PROFILE_ID_KEY = "ech.profile_id";

/* ------------------------------------------------------------------ *
 * Low-level helpers
 * ------------------------------------------------------------------ */

const now = () => new Date().toISOString();

function debounce(fn, wait) {
  let t = null;
  let pendingArgs = null;
  const flush = () => {
    if (!pendingArgs) return;
    const args = pendingArgs;
    pendingArgs = null;
    t = null;
    try {
      fn(...args);
    } catch (_) {
      /* non-fatal */
    }
  };
  const debounced = (...args) => {
    pendingArgs = args;
    if (t) clearTimeout(t);
    t = setTimeout(flush, wait);
  };
  debounced.flushNow = flush;
  return debounced;
}

/* Attempt-tracking persistence (separate namespace from the gameplay save). */
function readAttemptStore() {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return data && typeof data === "object" ? data : {};
  } catch (_) {
    return {};
  }
}

function writeAttemptStore(store) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(store));
  } catch (_) {
    /* non-fatal */
  }
}

function attemptUuid() {
  try {
    if (globalThis.crypto && globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  } catch (_) {
    /* fall through */
  }
  return `att_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/* ------------------------------------------------------------------ *
 * Profile identity: map anonymous_id -> profiles row (INSERT-once)
 * ------------------------------------------------------------------ *
 * RLS-safe: anon may INSERT (on-conflict-do-nothing, never UPDATE) and SELECT.
 * The resulting profiles.id is cached locally so we don't re-query each save.
 * Because anon cannot UPDATE, display_name is only ever set at first insert.
 */

let _profileId = null;

function cachedProfileId() {
  if (_profileId) return _profileId;
  try {
    const v = localStorage.getItem(PROFILE_ID_KEY);
    if (v) _profileId = v;
  } catch (_) {
    /* ignore */
  }
  return _profileId;
}

function rememberProfileId(id) {
  _profileId = id || null;
  try {
    if (id) localStorage.setItem(PROFILE_ID_KEY, id);
    else localStorage.removeItem(PROFILE_ID_KEY); // clear when falsy (self-heal)
  } catch (_) {
    /* ignore */
  }
}

/** SELECT this browser's profile id, or null. Sets status; never throws. */
async function selectProfileId() {
  if (!isBackendConfigured || !supabase) return null;
  const anonymous_id = getOrCreateAnonymousId();
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("anonymous_id", anonymous_id)
      .maybeSingle();
    if (error) {
      setBackendStatus("delayed");
      // eslint-disable-next-line no-console
      console.warn("[backend] profile lookup failed (continuing locally):", error.message);
      return null;
    }
    setBackendStatus("connected");
    return data && data.id ? data.id : null;
  } catch (e) {
    setBackendStatus("delayed");
    return null;
  }
}

/**
 * Ensure a profiles row exists for this browser and return its id (or null).
 * INSERT-once via on-conflict-do-nothing (no UPDATE -> RLS-safe). Cached.
 * @param {string|null} [displayName]
 */
export async function ensureProfileId(displayName = null) {
  if (!isBackendConfigured || !supabase) return null;
  const cached = cachedProfileId();
  if (cached) return cached;

  // First, see if a row already exists (e.g. created on a previous session).
  let id = await selectProfileId();
  if (id) {
    rememberProfileId(id);
    return id;
  }

  // No row yet — create one. ignoreDuplicates => INSERT ... ON CONFLICT DO NOTHING.
  const anonymous_id = getOrCreateAnonymousId();
  try {
    const { error } = await supabase
      .from("profiles")
      .upsert(
        { anonymous_id, display_name: displayName ?? null },
        { onConflict: "anonymous_id", ignoreDuplicates: true },
      );
    if (error) {
      setBackendStatus("delayed");
      // eslint-disable-next-line no-console
      console.warn("[backend] profile create failed (continuing locally):", error.message);
      return null;
    }
    setBackendStatus("connected");
  } catch (e) {
    setBackendStatus("delayed");
    return null;
  }

  // Re-select to obtain the id (our row or a concurrently-created one).
  id = await selectProfileId();
  if (id) rememberProfileId(id);
  return id;
}

/* ------------------------------------------------------------------ *
 * Player profile (INSERT-once mapping; no cloud UPDATE under anon RLS)
 * ------------------------------------------------------------------ */

/**
 * Ensure the anonymous player's `profiles` row exists.
 * NOTE: under the anon key, profile mutations (xp_total/current_role growth) are
 * NOT permitted by RLS, so only the initial display_name is persisted. Lifetime
 * totals remain authoritative in localStorage until an UPDATE-capable writer
 * (service role / auth) is added.
 * @param {{name?:string}} profile
 */
export async function syncPlayerProfile(profile = {}) {
  if (!isBackendConfigured || !supabase) return;
  await ensureProfileId(profile.name ?? null);
}

/* ------------------------------------------------------------------ *
 * Mission progress rollup — DEFERRED (needs mission_id + UPDATE writer)
 * ------------------------------------------------------------------ */

/**
 * Deferred in the safe subset: `student_progress` is one-row-per (profile,mission)
 * "overwritten in place" (requires UPDATE) and is keyed by `mission_id` (the
 * `missions` catalog is unseeded and not anon-writable). Kept as a documented
 * no-op so the public API is stable; progress stays authoritative in localStorage.
 */
export function syncMissionProgress(/* rows */) {
  /* intentionally local-only — see docs/SUPABASE_STATUS_REVIEW.md */
}

/** Back-compat alias for the previous name (also a safe no-op now). */
export const syncAssignmentProgress = syncMissionProgress;

/* ------------------------------------------------------------------ *
 * Mission attempts — LOCAL-ONLY mirror
 * ------------------------------------------------------------------ *
 * Cloud `mission_attempts` requires a `mission_id` from the unseeded missions
 * catalog, so attempt history is tracked locally only. Numbering increments,
 * prior attempts are never overwritten, and "abandoned" is recorded locally.
 */

/**
 * Open (or reuse) a LOCAL attempt for a mission.
 *  - Reuses an already-open attempt (mid-mission resume) so re-entering does not
 *    inflate the count; otherwise creates a NEW attempt with an incremented number.
 *  - Prior attempts are never overwritten.
 * @returns {{attempt_id:string, attempt_number:number, reused:boolean}}
 */
export function startMissionAttempt(missionId) {
  const store = readAttemptStore();
  const rec = store[missionId] || { lastNumber: 0, best_score: null, open: null, history: [] };

  let reused = false;
  if (rec.open && rec.open.attempt_id) {
    reused = true;
  } else {
    rec.lastNumber = (rec.lastNumber || 0) + 1;
    rec.open = {
      attempt_id: attemptUuid(),
      attempt_number: rec.lastNumber,
      started_at: now(),
    };
  }
  store[missionId] = rec;
  writeAttemptStore(store);

  const { attempt_id, attempt_number } = rec.open;
  return { attempt_id, attempt_number, reused };
}

/**
 * Close the open attempt as ABANDONED so the next start creates a brand-new one.
 * Used by "Restart". Local-only; never erases history.
 */
export function abandonMissionAttempt(missionId) {
  const store = readAttemptStore();
  const rec = store[missionId];
  if (!rec || !rec.open) return;
  const open = rec.open;
  rec.history = Array.isArray(rec.history) ? rec.history : [];
  rec.history.push({ ...open, status: "abandoned", abandoned_at: now() });
  rec.open = null;
  store[missionId] = rec;
  writeAttemptStore(store);
}

/**
 * Mark the open attempt complete and update the mission's best score (local).
 * Idempotent: a second call for the same attempt is a no-op (guards against the
 * game's multiple completion code paths).
 * @param {{score?:number|null, xp_total?:number}} result
 */
export function completeMissionAttempt(missionId, result = {}) {
  const store = readAttemptStore();
  const rec = store[missionId];
  if (!rec || !rec.open) return null; // nothing open (already completed / never started)

  const open = rec.open;
  const score = typeof result.score === "number" ? result.score : null;

  if (score !== null) {
    rec.best_score =
      typeof rec.best_score === "number" ? Math.max(rec.best_score, score) : score;
  }
  const closed = {
    ...open,
    status: "completed",
    completed_at: now(),
    score,
    xp_total: typeof result.xp_total === "number" ? result.xp_total : null,
  };
  rec.history = Array.isArray(rec.history) ? rec.history : [];
  rec.history.push(closed);
  rec.open = null; // close it
  store[missionId] = rec;
  writeAttemptStore(store);
  // Return the just-closed attempt so callers can fire a once-per-attempt side
  // effect (e.g. an xp_event). A duplicate completion call returns null above,
  // giving natural idempotency without erasing the append-only history.
  return closed;
}

/* Back-compat aliases for the previously-exported names (call sites in script.js). */
export const startAssignmentAttempt = startMissionAttempt;
export const abandonAssignmentAttempt = abandonMissionAttempt;
export const completeAssignmentAttempt = completeMissionAttempt;

/** Best recorded score for a mission (local mirror), or null. */
export function getBestScore(missionId) {
  const rec = readAttemptStore()[missionId];
  return rec && typeof rec.best_score === "number" ? rec.best_score : null;
}

/* ------------------------------------------------------------------ *
 * XP / reputation events — append-only cloud write (anon INSERT)
 * ------------------------------------------------------------------ */

/**
 * Append a meaningful XP/reputation event to `xp_events` (best-effort).
 * Only call for MEANINGFUL events (e.g. mission completion) — not tiny per-action
 * telemetry. Requires the profile row; created on demand. Never throws.
 * @param {string} eventType
 * @param {{xp_change?:number, trust_change?:number, description?:string,
 *          metadata?:object, displayName?:string}} [opts]
 */
export async function trackXpEvent(eventType, opts = {}) {
  if (!isBackendConfigured || !supabase || !eventType) return;
  let profile_id = await ensureProfileId(opts.displayName ?? null);
  if (!profile_id) return; // could not establish identity — stay local

  let metadata = {};
  try {
    metadata = JSON.parse(JSON.stringify(opts.metadata || {}));
  } catch (_) {
    metadata = {};
  }

  const row = (pid) => ({
    profile_id: pid,
    event_type: eventType,
    xp_change: typeof opts.xp_change === "number" ? opts.xp_change : 0,
    trust_change: typeof opts.trust_change === "number" ? opts.trust_change : 0,
    description: opts.description ?? null,
    metadata,
  });

  const tryInsert = async (pid) => {
    try {
      const { error } = await supabase.from("xp_events").insert(row(pid));
      return error || null;
    } catch (e) {
      return e;
    }
  };

  let err = await tryInsert(profile_id);
  if (err) {
    // Self-heal: the cached profile id may be stale (DB reset / key drift). Clear
    // it, re-resolve the profile, and retry once before giving up locally.
    rememberProfileId(null);
    profile_id = await ensureProfileId(opts.displayName ?? null);
    if (profile_id) err = await tryInsert(profile_id);
  }

  if (err) {
    setBackendStatus("delayed");
    // eslint-disable-next-line no-console
    console.warn("[backend] xp_event failed (continuing locally):", err.message || err);
    return;
  }
  setBackendStatus("connected");
}

/**
 * Back-compat no-op. The previous flat `game_events` analytics table is not part
 * of the production schema; general per-action telemetry has no destination in
 * the safe subset, so this is intentionally a no-op (keeps the many call sites
 * working without emitting failed cloud writes). Use `trackXpEvent` for the
 * meaningful XP/reputation events the schema actually models.
 */
export function trackGameEvent(/* eventType, payload */) {
  /* no-op by design — see docs/SUPABASE_STATUS_REVIEW.md */
}

/* ------------------------------------------------------------------ *
 * Full-progress cloud backup — DEFERRED (no progress column in schema)
 * ------------------------------------------------------------------ */

/**
 * Deferred in the safe subset: the normalized schema has no JSONB "progress"
 * column to mirror the whole localStorage blob into. Kept as a safe no-op so the
 * public API is stable; the authoritative blob stays in localStorage.
 */
export function saveCloudProgress(/* blob */) {
  /* intentionally local-only — see docs/SUPABASE_STATUS_REVIEW.md */
}

/**
 * Warm-up / future restore: confirm connectivity and ensure our profile id is
 * resolved. Does NOT auto-overwrite local state (local-first). Returns null —
 * there is no cloud "progress blob" in the production schema to restore from.
 */
export async function loadCloudProgress() {
  if (!isBackendConfigured || !supabase) return null;
  await selectProfileId(); // sets status connected/delayed; caches nothing destructive
  return null;
}

/* ------------------------------------------------------------------ *
 * Coordinator called from script.js saveProgress().
 * ------------------------------------------------------------------ *
 * Debounced as a whole so a burst of local saves results in (at most) one
 * cloud touch. In the safe subset this only ensures the profiles row exists
 * (INSERT-once); richer progression remains local-first.
 */

let _latestSnapshot = null;

const _flushCloudSync = debounce(() => {
  const snapshot = _latestSnapshot;
  if (!isBackendConfigured || !supabase || !snapshot) return;
  try {
    void ensureProfileId(snapshot.studentName ?? null);
  } catch (_) {
    /* non-fatal */
  }
}, 5000);

/**
 * Coordinator called from script.js saveProgress(). Debounced.
 */
export function queueCloudSync(snapshot) {
  if (!isBackendConfigured || !supabase || !snapshot) return;
  _latestSnapshot = snapshot;
  _flushCloudSync();
}
