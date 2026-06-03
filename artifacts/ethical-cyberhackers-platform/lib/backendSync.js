/**
 * lib/backendSync.js
 * ------------------
 * Phase B1 — best-effort cloud sync layer, aligned to the production schema
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
 * WHAT NOW SYNCS TO THE CLOUD (after 002/003 migrations):
 *   • profiles      — INSERT-once anonymous identity row.
 *   • xp_events     — append-only; triggers increment profiles.xp_total/trust_score.
 *   • mission_attempts — append-only INSERT; server trigger upserts student_progress
 *                        and increments profiles.missions_completed automatically.
 *   student_progress and profile totals are maintained server-side via triggers
 *   (003_server_triggers.sql) so the anon client never needs UPDATE permission.
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
 * Mission catalog lookup — resolve mission_code → missions.id (UUID)
 * ------------------------------------------------------------------ *
 * Cached in-memory per session. The missions table is read-only for clients
 * (seeded via 002_seed_missions.sql) and never changes at runtime.
 */

/** @type {Map<string, string>} mission_code → uuid */
const _missionIdCache = new Map();

/**
 * Look up the UUID for a mission by its stable code (e.g. "mission-001").
 * Result is cached for the session. Returns null when the backend is
 * unconfigured, the missions table is not yet seeded, or the lookup fails.
 * @param {string} missionCode
 * @returns {Promise<string|null>}
 */
async function getMissionId(missionCode) {
  if (!isBackendConfigured || !supabase || !missionCode) return null;
  if (_missionIdCache.has(missionCode)) return _missionIdCache.get(missionCode);
  try {
    const { data, error } = await supabase
      .from("missions")
      .select("id")
      .eq("mission_code", missionCode)
      .maybeSingle();
    if (error || !data || !data.id) {
      // eslint-disable-next-line no-console
      if (error) console.warn("[backend] mission lookup failed:", error.message);
      return null;
    }
    _missionIdCache.set(missionCode, data.id);
    setBackendStatus("connected");
    return data.id;
  } catch (_) {
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Mission progress rollup — maintained server-side via triggers
 * ------------------------------------------------------------------ *
 * student_progress and profiles.missions_completed are kept up to date
 * by server-side triggers in 003_server_triggers.sql that fire on every
 * INSERT into mission_attempts. The client never needs UPDATE permission.
 */

/**
 * No-op kept for API stability. student_progress is now maintained
 * automatically by the trg_mission_attempt_upsert trigger.
 */
export function syncMissionProgress(/* rows */) {
  /* maintained server-side — see supabase/migrations/003_server_triggers.sql */
}

/** Back-compat alias. */
export const syncAssignmentProgress = syncMissionProgress;

/* ------------------------------------------------------------------ *
 * Mission attempts — LOCAL mirror + CLOUD append
 * ------------------------------------------------------------------ *
 * Local tracking is unchanged (numbering, idempotency, abandoned).
 * cloudCompleteMissionAttempt adds the cloud INSERT once the attempt
 * is locally closed and the missions catalog is seeded.
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
 * Cloud attempt record — append-only INSERT into mission_attempts
 * ------------------------------------------------------------------ *
 * Called from notifyAssignmentComplete in script.js (after the local
 * completeMissionAttempt closes the local record). This is the cloud
 * counterpart: it resolves the mission UUID, ensures a profile row,
 * and INSERTs one row into mission_attempts (anon INSERT is allowed).
 * The server-side trigger (003_server_triggers.sql) then upserts
 * student_progress and increments profiles.missions_completed
 * automatically — no UPDATE permission needed from the browser.
 *
 * Idempotency: gated on the `closedAttempt` object returned by the
 * local completeMissionAttempt (null on a duplicate call), so this
 * never fires twice for the same logical completion.
 *
 * @param {string} missionId   e.g. "mission-001"
 * @param {object} data
 * @param {string} [data.attempt_id]
 * @param {number} [data.attempt_number]
 * @param {string} [data.started_at]       ISO string
 * @param {number} [data.xp_earned]
 * @param {number} [data.trust_delta]
 * @param {number|null} [data.analyst_confidence]
 * @param {number|null} [data.containment_score]
 * @param {number|null} [data.evidence_score]
 * @param {number|null} [data.reasoning_score]
 * @param {object} [data.scorecard_json]
 * @param {string} [data.displayName]
 */
export async function cloudCompleteMissionAttempt(missionId, data = {}) {
  if (!isBackendConfigured || !supabase || !missionId) return;

  const mission_id = await getMissionId(missionId);
  if (!mission_id) {
    // missions table not seeded yet — stay local-only
    // eslint-disable-next-line no-console
    console.warn("[backend] cloudCompleteMissionAttempt: mission_id not found for", missionId, "(run 002_seed_missions migration)");
    return;
  }

  const profile_id = await ensureProfileId(data.displayName ?? null);
  if (!profile_id) return;

  let scorecard_json = {};
  try {
    scorecard_json = JSON.parse(JSON.stringify(data.scorecard_json || {}));
  } catch (_) { scorecard_json = {}; }

  const row = {
    profile_id,
    mission_id,
    attempt_number:    typeof data.attempt_number    === "number" ? data.attempt_number    : 1,
    outcome_status:    "completed",
    xp_earned:         typeof data.xp_earned         === "number" ? data.xp_earned         : 0,
    trust_delta:       typeof data.trust_delta        === "number" ? data.trust_delta        : 0,
    analyst_confidence:typeof data.analyst_confidence === "number" ? data.analyst_confidence : null,
    containment_score: typeof data.containment_score  === "number" ? data.containment_score  : null,
    evidence_score:    typeof data.evidence_score     === "number" ? data.evidence_score     : null,
    reasoning_score:   typeof data.reasoning_score    === "number" ? data.reasoning_score    : null,
    started_at:        data.started_at || new Date().toISOString(),
    completed_at:      new Date().toISOString(),
    scorecard_json,
  };

  try {
    const { error } = await supabase.from("mission_attempts").insert(row);
    if (error) {
      setBackendStatus("delayed");
      // eslint-disable-next-line no-console
      console.warn("[backend] mission_attempts insert failed (continuing locally):", error.message);
      return;
    }
    setBackendStatus("connected");
  } catch (e) {
    setBackendStatus("delayed");
    // eslint-disable-next-line no-console
    console.warn("[backend] mission_attempts insert threw (continuing locally):", e && e.message);
  }
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
