/**
 * lib/backendSync.js
 * ------------------
 * Phase B0 — reusable, best-effort cloud sync layer (LOCAL-FIRST).
 *
 * Every function here is fire-and-forget and fully fault-tolerant:
 *   - never throws into the caller,
 *   - never blocks gameplay,
 *   - debounces / batches writes so we don't spam the backend,
 *   - retries lightly once on failure,
 *   - silently continues locally when the backend is missing or down.
 *
 * localStorage remains the authoritative save (handled in script.js). This layer
 * only mirrors/backs-up state and records lightweight analytics. Attempt
 * bookkeeping is kept in its own localStorage namespace so it never touches the
 * primary gameplay save object.
 */

import {
  supabase,
  isBackendConfigured,
  getOrCreateAnonymousId,
  setBackendStatus,
} from "./supabaseClient.js";

const ATTEMPTS_KEY = "ech.backend.v1";

/* ------------------------------------------------------------------ *
 * Low-level helpers
 * ------------------------------------------------------------------ */

const now = () => new Date().toISOString();

/** Run a Supabase query thunk with one light retry; reflect status; never throw. */
async function runSafe(thunk, { retry = 1 } = {}) {
  if (!isBackendConfigured || !supabase) return { ok: false, skipped: true };
  for (let attempt = 0; attempt <= retry; attempt++) {
    try {
      const { error } = await thunk();
      if (!error) {
        setBackendStatus("connected");
        return { ok: true };
      }
      if (attempt === retry) {
        setBackendStatus("delayed");
        // eslint-disable-next-line no-console
        console.warn("[backend] sync failed (continuing locally):", error.message || error);
        return { ok: false, error };
      }
    } catch (e) {
      if (attempt === retry) {
        setBackendStatus("delayed");
        // eslint-disable-next-line no-console
        console.warn("[backend] sync threw (continuing locally):", e && e.message ? e.message : e);
        return { ok: false, error: e };
      }
    }
    // brief backoff before the single retry
    await new Promise((r) => setTimeout(r, 400));
  }
  return { ok: false };
}

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
 * 1. Player profile
 * ------------------------------------------------------------------ */

/**
 * Upsert the anonymous player's profile row.
 * @param {{name?:string, xp?:number, rank?:string}} profile
 */
export async function syncPlayerProfile(profile = {}) {
  if (!isBackendConfigured || !supabase) return;
  const anonymous_id = getOrCreateAnonymousId();
  await runSafe(() =>
    supabase
      .from("student_profiles")
      .upsert(
        {
          anonymous_id,
          display_name: profile.name ?? null,
          xp: typeof profile.xp === "number" ? profile.xp : 0,
          rank: profile.rank ?? null,
          last_seen_at: now(),
        },
        { onConflict: "anonymous_id" },
      ),
  );
}

/* ------------------------------------------------------------------ *
 * 2. Assignment progress (mirror of completion / confidence)
 * ------------------------------------------------------------------ */

/**
 * Upsert one row per assignment summarising current progress.
 * @param {Array<{assignment_id:string, completed:boolean, analyst_confidence?:number|null}>} rows
 */
export async function syncAssignmentProgress(rows = []) {
  if (!isBackendConfigured || !supabase || !rows.length) return;
  const anonymous_id = getOrCreateAnonymousId();
  const payload = rows.map((r) => ({
    anonymous_id,
    assignment_id: r.assignment_id,
    completed: !!r.completed,
    analyst_confidence:
      typeof r.analyst_confidence === "number" ? r.analyst_confidence : null,
    updated_at: now(),
  }));
  await runSafe(() =>
    supabase
      .from("assignment_progress")
      .upsert(payload, { onConflict: "anonymous_id,assignment_id" }),
  );
}

/* ------------------------------------------------------------------ *
 * 3 & 4. Replayable assignment attempts
 * ------------------------------------------------------------------ */

/**
 * Open (or reuse) an attempt for an assignment.
 *  - If an attempt is already open (e.g. a mid-mission resume) it is reused,
 *    so re-entering does not inflate the attempt count.
 *  - Otherwise a NEW attempt is created with an incremented attempt_number.
 * Prior attempts are never overwritten.
 * @returns {{attempt_id:string, attempt_number:number, reused:boolean}}
 */
export function startAssignmentAttempt(assignmentId) {
  const store = readAttemptStore();
  const rec = store[assignmentId] || { lastNumber: 0, best_score: null, open: null };

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
  store[assignmentId] = rec;
  writeAttemptStore(store);

  const { attempt_id, attempt_number } = rec.open;

  if (!reused) {
    const anonymous_id = getOrCreateAnonymousId();
    void runSafe(() =>
      supabase.from("assignment_attempts").insert({
        attempt_id,
        anonymous_id,
        assignment_id: assignmentId,
        attempt_number,
        started_at: rec.open.started_at,
        completed: false,
      }),
    );
    trackGameEvent("assignment_started", { assignment_id: assignmentId, attempt_number });
  }
  return { attempt_id, attempt_number, reused };
}

/**
 * Close the open attempt for an assignment as ABANDONED so the next
 * startAssignmentAttempt creates a brand-new attempt. Used by "Restart".
 */
export function abandonAssignmentAttempt(assignmentId) {
  const store = readAttemptStore();
  const rec = store[assignmentId];
  if (!rec || !rec.open) return;
  const open = rec.open;
  rec.open = null;
  store[assignmentId] = rec;
  writeAttemptStore(store);
  void runSafe(() =>
    supabase
      .from("assignment_attempts")
      .update({ abandoned_at: now() })
      .eq("attempt_id", open.attempt_id),
  );
}

/**
 * Mark the open attempt complete and update the assignment's best score.
 * Idempotent: a second call for the same attempt is a no-op (guards against the
 * game's multiple completion code paths).
 * @param {{score?:number|null, xp_total?:number}} result
 */
export function completeAssignmentAttempt(assignmentId, result = {}) {
  const store = readAttemptStore();
  const rec = store[assignmentId];
  if (!rec || !rec.open) return; // nothing open (already completed / never started)

  const open = rec.open;
  const score = typeof result.score === "number" ? result.score : null;

  if (score !== null) {
    rec.best_score =
      typeof rec.best_score === "number" ? Math.max(rec.best_score, score) : score;
  }
  rec.open = null; // close it
  store[assignmentId] = rec;
  writeAttemptStore(store);

  const anonymous_id = getOrCreateAnonymousId();
  void runSafe(() =>
    supabase
      .from("assignment_attempts")
      .update({
        completed: true,
        completed_at: now(),
        score,
        xp_total: typeof result.xp_total === "number" ? result.xp_total : null,
      })
      .eq("attempt_id", open.attempt_id),
  );
  trackGameEvent("assignment_completed", {
    assignment_id: assignmentId,
    attempt_number: open.attempt_number,
    score,
    best_score: rec.best_score,
  });
}

/** Best recorded score for an assignment (local mirror), or null. */
export function getBestScore(assignmentId) {
  const rec = readAttemptStore()[assignmentId];
  return rec && typeof rec.best_score === "number" ? rec.best_score : null;
}

/* ------------------------------------------------------------------ *
 * 5. Lightweight game-event analytics (batched)
 * ------------------------------------------------------------------ */

let eventQueue = [];

const flushEvents = debounce(() => {
  if (!isBackendConfigured || !supabase || eventQueue.length === 0) return;
  const batch = eventQueue;
  eventQueue = [];
  const anonymous_id = getOrCreateAnonymousId();
  const rows = batch.map((e) => ({
    anonymous_id,
    event_type: e.event_type,
    payload: e.payload || {},
    created_at: e.created_at,
  }));
  void runSafe(() => supabase.from("game_events").insert(rows));
}, 4000);

/**
 * Record a lightweight, timestamped gameplay event. Buffered in memory and
 * flushed in batches so frequent events (command runs, etc.) never spam writes.
 * Always safe to call, even in local-only mode (becomes a no-op).
 */
export function trackGameEvent(eventType, payload = {}) {
  if (!isBackendConfigured || !supabase) return;
  if (!eventType) return;
  // keep payloads small
  let safePayload = {};
  try {
    safePayload = JSON.parse(JSON.stringify(payload || {}));
  } catch (_) {
    safePayload = {};
  }
  eventQueue.push({ event_type: eventType, payload: safePayload, created_at: now() });
  if (eventQueue.length >= 25) flushEvents.flushNow();
  else flushEvents();
}

/* ------------------------------------------------------------------ *
 * 6. Full-progress cloud backup
 * ------------------------------------------------------------------ */

const debouncedSaveCloud = debounce((blob) => {
  if (!isBackendConfigured || !supabase) return;
  const anonymous_id = getOrCreateAnonymousId();
  void runSafe(() =>
    supabase.from("student_profiles").upsert(
      { anonymous_id, progress: blob, last_seen_at: now() },
      { onConflict: "anonymous_id" },
    ),
  );
}, 5000);

/**
 * Mirror the full localStorage progress blob to the cloud as a backup.
 * Heavily debounced — local save stays authoritative and immediate.
 */
export function saveCloudProgress(blob) {
  if (!isBackendConfigured || !supabase || !blob) return;
  debouncedSaveCloud(blob);
}

/**
 * Read the cloud progress blob for this anonymous player, or null.
 * NOTE: callers decide what to do with it. Phase B0 does NOT auto-overwrite
 * local state (local-first, no auth yet) — this is for connectivity warm-up and
 * future restore features.
 */
export async function loadCloudProgress() {
  if (!isBackendConfigured || !supabase) return null;
  const anonymous_id = getOrCreateAnonymousId();
  try {
    const { data, error } = await supabase
      .from("student_profiles")
      .select("progress")
      .eq("anonymous_id", anonymous_id)
      .maybeSingle();
    if (error) {
      setBackendStatus("delayed");
      // eslint-disable-next-line no-console
      console.warn("[backend] loadCloudProgress failed (continuing locally):", error.message);
      return null;
    }
    setBackendStatus("connected");
    return data && data.progress ? data.progress : null;
  } catch (e) {
    setBackendStatus("delayed");
    return null;
  }
}

/* ------------------------------------------------------------------ *
 * Convenience: one debounced call to mirror everything from a save snapshot.
 * Called from script.js saveProgress(); derives profile/progress/backup rows
 * from the same object that is written to localStorage.
 * ------------------------------------------------------------------ */

let _latestSnapshot = null;

const _flushCloudSync = debounce(() => {
  const snapshot = _latestSnapshot;
  if (!isBackendConfigured || !supabase || !snapshot) return;
  try {
    syncPlayerProfile({
      name: snapshot.studentName,
      xp: snapshot.xp,
      rank: snapshot.rank,
    });
    syncAssignmentProgress([
      {
        assignment_id: "mission-001",
        completed: !!snapshot.mission1Complete,
        analyst_confidence:
          typeof snapshot.m1Confidence === "number" ? snapshot.m1Confidence : null,
      },
      {
        assignment_id: "mission-002",
        completed: !!snapshot.mission2Complete,
        analyst_confidence:
          typeof snapshot.m2AnalystConfidence === "number"
            ? snapshot.m2AnalystConfidence
            : null,
      },
      {
        assignment_id: "mission-003",
        completed: !!snapshot.mission3Complete,
        analyst_confidence:
          typeof snapshot.m3AnalystConfidence === "number"
            ? snapshot.m3AnalystConfidence
            : null,
      },
    ]);
    saveCloudProgress(snapshot);
  } catch (_) {
    /* non-fatal */
  }
}, 5000);

/**
 * Coordinator called from script.js saveProgress(). Debounced as a whole so a
 * burst of local saves results in (at most) one batch of profile/progress/backup
 * writes — keeping us well within the "don't spam the backend" objective.
 */
export function queueCloudSync(snapshot) {
  if (!isBackendConfigured || !supabase || !snapshot) return;
  _latestSnapshot = snapshot;
  _flushCloudSync();
}

/* Best-effort: flush buffered analytics when the tab is hidden/closed so we lose
   fewer events on navigation. Still fire-and-forget; never blocks unload. */
if (typeof document !== "undefined") {
  const flushOnHide = () => {
    try {
      flushEvents.flushNow();
    } catch (_) {
      /* non-fatal */
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnHide();
  });
  window.addEventListener("pagehide", flushOnHide);
}
