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
 * PROTOTYPE INVARIANTS:
 *   - Persists ONLY to its own key (CAREER_STORE_KEY). It NEVER reads or writes
 *     the shipping game's "ech.progress.v1".
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

const CAREER_DEFAULTS = {
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
  const base = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [] };
  try {
    const raw = localStorage.getItem(CAREER_STORE_KEY);
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return base;
    RESOURCE_DEFS.forEach(d => {
      base[d.key] = clampResource(d.key, saved[d.key] != null ? saved[d.key] : base[d.key]);
    });
    if (typeof saved.currentRole === 'string' && roleById(saved.currentRole)) {
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
    return base;
  } catch (_) {
    return base;
  }
}

function saveCareerState() {
  try {
    localStorage.setItem(CAREER_STORE_KEY, JSON.stringify(CAREER));
  } catch (_) { /* storage unavailable — stay in-memory, never throw */ }
}

function resetCareerState() {
  CAREER = { ...CAREER_DEFAULTS, missionFlags: {}, completedMissions: [] };
  saveCareerState();
  renderResourceBar();
}

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
  SIM.def = def;
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

  document.getElementById('opsCenter').style.display = 'none';
  document.getElementById('careerOps').style.display = 'flex';

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
  document.getElementById('careerOps').style.display = 'none';
  document.getElementById('opsCenter').style.display = 'flex';
  renderResourceBar();
}

window.openCareerMission = openCareerMission;
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
    simPrint('  ' + 'decide'.padEnd(26) + 'review your findings and choose a response', 'dim');
    simPrint('  ' + 'clear'.padEnd(26) + 'clear the terminal', 'dim');
    return;
  }
  simPrint('Available commands:', 'head');
  simPrint('  ls            list the files queued for release', 'dim');
  simPrint('  cat <file>    read a file (surfaces evidence)', 'dim');
  simPrint('  less <file>   page through a file (same as cat here)', 'dim');
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
  const changes = applyResourceDeltas(deltas);
  const denied = outcome && outcome.verdict === 'Denied';
  if (!denied) (action.setFlags || []).forEach(f => setMissionFlag(f, true));

  SIM.decision = { actionId, outcome, changes };
  SIM.stage = 'report';
  const dock = document.getElementById('simActions');
  if (dock) dock.innerHTML = `<p class="sim-empty">Decision recorded: <strong>${action.label}</strong>. See the debrief →</p>`;
  simPrint(`> Decision: ${action.label}${outcome ? ' — ' + outcome.verdict : ''}`, 'ok');
  renderDebrief(action, outcome, changes);
  finalizeMission();
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
  const changes = applyResourceDeltas(deltas);
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
  finalizeMission();
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

/* ================================================================== *
 * CAREER ENGINE (P4) — record completion + persist. Rank is DERIVED
 * from the active role; promotion is deferred (out of slice scope).
 * ================================================================== */
function finalizeMission() {
  if (!SIM.missionId) return;
  if (!Array.isArray(CAREER.completedMissions)) CAREER.completedMissions = [];
  if (!CAREER.completedMissions.includes(SIM.missionId)) CAREER.completedMissions.push(SIM.missionId);
  CAREER.currentRank = roleById(CAREER.currentRole).title; // promotion deferred — stays Intern
  saveCareerState();
  renderResourceBar();
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
    ],
    evidenceEmpty: 'No evidence yet. Use the terminal to review the files, then classify what you find.',
    risks: [
      { id: 'risk_pii',        label: 'Employee personal data (PII) is in the outbound release', triggeredBy: ['ev_pii_salary'] },
      { id: 'risk_pci',        label: 'Regulated customer payment records (PCI) are in the release', triggeredBy: ['ev_customer_pii'] },
      { id: 'risk_confidential',label: 'Confidential business information is bundled in', triggeredBy: ['ev_confidential_pricing', 'ev_confidential_roadmap'] },
      { id: 'risk_contractor', label: 'A contractor account accessed files outside its remit', triggeredBy: ['ev_contractor_access'] },
      { id: 'risk_noreview',   label: 'The release was assembled with no internal reviewer', triggeredBy: ['ev_release_context'] },
    ],
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
        setFlags: ['sensitiveDataExposed'],
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
        setFlags: [],
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
  renderResourceBar();

  const back = document.getElementById('careerBackBtn');
  if (back) back.addEventListener('click', returnFromCareerMission);

  const resetBtn = document.getElementById('simResetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetCareerState();
      if (document.getElementById('careerOps').style.display !== 'none') {
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
    if (document.getElementById('careerOps').style.display !== 'none') {
      // The network-map overlay takes Escape first, so it closes without
      // also exiting the mission underneath it.
      if (SIM.mapOpen) { closeSimMap(); return; }
      returnFromCareerMission();
    }
  });

  // Deep-link straight into a career mission for demoing / testing — mirrors the
  // legacy ?holo= / ?console= / ?lab= deep-links (e.g. /ops-center/?career=mission-001).
  try {
    const careerId = new URLSearchParams(window.location.search).get('career');
    if (careerId && CAREER_MISSIONS[careerId]) openCareerMission(careerId);
  } catch (_) { /* ignore malformed query strings */ }
}

document.addEventListener('DOMContentLoaded', simInit);
