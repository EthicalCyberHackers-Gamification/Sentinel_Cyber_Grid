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
  evidence: new Set(),      // evidence ids surfaced
  classified: {},           // fileName -> classification value
  decision: null,           // chosen action id
  recommendations: [],      // submitted recommendation results
  runToken: 0,              // invalidates stray timers across opens
};

function careerMission() { return SIM.def; }

function openCareerMission(missionId) {
  const def = CAREER_MISSIONS[missionId];
  if (!def) return;

  SIM.runToken++;
  SIM.missionId = missionId;
  SIM.def = def;
  SIM.stage = 'investigation';
  SIM.listed = false;
  SIM.read = new Set();
  SIM.evidence = new Set();
  SIM.classified = {};
  SIM.decision = null;
  SIM.recommendations = [];

  document.getElementById('opsCenter').style.display = 'none';
  document.getElementById('careerOps').style.display = 'flex';

  renderResourceBar();
  renderCareerHeader();
  renderBriefPanel();
  renderEvidencePanel();
  renderTerminalPanel();
  renderFeedbackPanel();

  const input = document.getElementById('simTermInput');
  if (input) setTimeout(() => input.focus(), 50);
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
function renderEvidencePanel() {
  const host = document.getElementById('simEvidence');
  if (!host) return;

  const evItems = simEvidenceDefs()
    .filter(e => SIM.evidence.has(e.id))
    .map(e => {
      const tier = e.qualityWeight >= 3 ? 'KEY' : e.qualityWeight === 2 ? 'NOTABLE' : 'MINOR';
      return `
        <div class="sim-ev-item">
          <div class="sim-ev-label">${e.label}</div>
          <div class="sim-ev-meta">
            <span class="sim-ev-quality">${tier} FINDING</span>
            <span class="sim-ev-src">${e.source || ''}</span>
          </div>
        </div>`;
    }).join('');

  const evHtml = evItems ||
    `<p class="sim-empty">No evidence yet. Use the terminal to review the files, then classify what you find.</p>`;

  // Classification rows appear for every file the player has read.
  const readFiles = simFiles().filter(f => SIM.read.has(f.name));
  let classHtml = '';
  if (readFiles.length) {
    const rows = readFiles.map(f => {
      const chosen = SIM.classified[f.name];
      const opts = CLASSIFICATIONS.map(c =>
        `<button type="button" class="sim-classify-btn${chosen === c.id ? ' sim-classify-btn--active' : ''}" data-classify-file="${f.name}" data-classify-val="${c.id}">${c.label}</button>`
      ).join('');
      return `<div class="sim-classify-row"><div class="sim-classify-file">${f.name}</div><div class="sim-classify-opts">${opts}</div></div>`;
    }).join('');
    const done = simFiles().filter(f => SIM.classified[f.name]).length;
    classHtml = `
      <div class="sim-classify">
        <div class="sim-classify-head">FILE CLASSIFICATION — ${done}/${simFiles().length}</div>
        ${rows}
      </div>`;
  }

  host.innerHTML = `
    <div class="sim-panel-head">EVIDENCE <span class="sim-panel-count">${SIM.evidence.size}</span></div>
    <div class="sim-evidence-body">${evHtml}${classHtml}</div>`;
}

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
  simPrint('intern@cybercorp:~/release$ ' + cmd, 'cmd');
  const parts = cmd.split(/\s+/);
  const verb = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').trim();
  switch (verb) {
    case 'help':   return simCmdHelp();
    case 'clear':  { const out = document.getElementById('simTerminal'); if (out) out.innerHTML = ''; return; }
    case 'ls':
    case 'dir':    return simCmdLs();
    case 'cat':
    case 'less':
    case 'more':
    case 'open':   return simCmdRead(arg, verb);
    case 'decide':
    case 'actions':return simRevealActions(true);
    default:
      simPrint(`command not found: ${verb}. Try: ls, cat <file>, less <file>, decide, help.`, 'err');
  }
}

function simCmdHelp() {
  simPrint('Available commands:', 'head');
  simPrint('  ls            list the files queued for release', 'dim');
  simPrint('  cat <file>    read a file (surfaces evidence)', 'dim');
  simPrint('  less <file>   page through a file (same as cat here)', 'dim');
  simPrint('  decide        reveal the handling actions when ready', 'dim');
  simPrint('  clear         clear the terminal', 'dim');
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
}

function setClassification(fileName, value) {
  if (!simFileByName(fileName)) return;
  if (!CLASSIFICATIONS.some(c => c.id === value)) return;
  SIM.classified[fileName] = value;
  renderEvidencePanel();
}

/* ================================================================== *
 * DECISION + CONSEQUENCE + LOCKED-AUTHORITY + RECOMMENDATION (P3)
 * ================================================================== */
function simRevealActions(manual) {
  if (SIM.stage === 'report') return;   // decision already made
  SIM.stage = 'decision';
  renderActions();
  if (manual && !allFilesRead()) {
    simPrint('Note: you have not reviewed every file. Acting on incomplete evidence weakens your recommendation.', 'warn');
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
  const cq = classificationQuality();
  const timing = SIM.evidence.size > 0 ? 1 : 0;
  const sev = (SIM.def && SIM.def.severity) || 'MEDIUM';
  const sevBoost = sev === 'CRITICAL' ? 10 : sev === 'HIGH' ? 10 : sev === 'MEDIUM' ? 5 : 0;
  let score = 0;
  score += q * 30;                                   // evidence surfaced
  score += cq * 25;                                  // files classified correctly
  score += (CAREER.executiveTrust / 100) * 12;
  score += (CAREER.careerReputation / 100) * 8;
  score += timing ? 8 : 0;
  score += allFilesRead() ? 7 : 0;
  score += sevBoost;
  let verdict, multiplier;
  if (score >= 70)      { verdict = 'Approved';            multiplier = 1;   }
  else if (score >= 50) { verdict = 'Partially Approved';  multiplier = 0.6; }
  else if (score >= 30) { verdict = 'Deferred';            multiplier = 0.3; }
  else                  { verdict = 'Denied';              multiplier = 0;   }
  return { verdict, multiplier, score: Math.round(score), evidenceQuality: q, classificationQuality: cq };
}

function scaleDeltas(deltas, m) {
  const out = {};
  Object.keys(deltas).forEach(k => { out[k] = Math.round(deltas[k] * m); });
  return out;
}

function recommendationReason(o) {
  const ev = Math.round(o.evidenceQuality * 100);
  const cl = Math.round((o.classificationQuality || 0) * 100);
  if (o.verdict === 'Approved')           return `Strong, well-evidenced case — ${ev}% of evidence gathered, ${cl}% of files classified correctly. Leadership approved it in full.`;
  if (o.verdict === 'Partially Approved') return `Reasonable case — ${ev}% evidence, ${cl}% classified correctly. Leadership approved part of it, pending tighter work.`;
  if (o.verdict === 'Deferred')           return `Thin work — ${ev}% evidence, ${cl}% classified correctly. Leadership deferred the decision for now.`;
  return `Insufficient case — ${ev}% evidence, ${cl}% classified correctly. Leadership declined — investigate and classify before recommending.`;
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

function reportSectionHtml() {
  const setFlags = CANON_FLAGS.filter(f => CAREER.missionFlags[f]);
  const flagItems = setFlags.length
    ? setFlags.map(f => `<li class="sim-report-flag"><span class="sim-report-flag-icon">▸</span><span>${FLAG_LABELS[f] || f}</span></li>`).join('')
    : `<li class="sim-report-flag"><span class="sim-report-flag-icon">▸</span><span>No carry-forward flags raised.</span></li>`;

  // Classification review — GRADED: accuracy feeds the recommendation outcome.
  const files = simFiles();
  const correct = files.filter(f => SIM.classified[f.name] === f.trueClassification).length;
  const accPct = files.length ? Math.round((correct / files.length) * 100) : 0;
  const rows = files.map(f => {
    const chosen = SIM.classified[f.name];
    const mark = !chosen ? '—' : (chosen === f.trueClassification ? '✓' : '✗');
    return `<li class="sim-report-flag"><span class="sim-report-flag-icon">${mark}</span><span>${f.name} — should be <strong>${classLabel(f.trueClassification)}</strong>${chosen ? ` · you marked ${classLabel(chosen)}` : ' · unclassified'}</span></li>`;
  }).join('');

  return `
    <div class="sim-report">
      <div class="sim-report-section">
        <div class="sim-conseq-label sim-conseq-label--future">CARRY-FORWARD FLAGS</div>
        <ul class="sim-report-flags">${flagItems}</ul>
      </div>
      <div class="sim-report-section">
        <div class="sim-conseq-label sim-conseq-label--business">CLASSIFICATION REVIEW — ${correct}/${files.length} correct (${accPct}%)</div>
        <ul class="sim-report-flags">${rows}</ul>
      </div>
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
        evidenceIds: ['ev_contractor_access'],
      },
    ],

    /* ---- Ground-truth evidence (weighted; quality drives recommendations) ---- */
    evidence: [
      { id: 'ev_release_context',     label: 'Release was prepared by the contractor account itself.',        qualityWeight: 1, source: 'release_notes.txt' },
      { id: 'ev_public_safe',         label: 'Public marketing collateral — safe to release externally.',     qualityWeight: 1, source: 'product_datasheet.txt' },
      { id: 'ev_confidential_pricing',label: 'Confidential partner pricing bundled into the release set.',     qualityWeight: 2, source: 'partner_pricing_2026.csv' },
      { id: 'ev_pii_salary',          label: 'Employee names and salaries (PII) present in the release set.',  qualityWeight: 3, source: 'employee_salaries.csv' },
      { id: 'ev_customer_pii',        label: 'Regulated customer payment records present (PCI scope).',        qualityWeight: 3, source: 'customer_payment_records.csv' },
      { id: 'ev_confidential_roadmap',label: 'Unannounced acquisition roadmap (material non-public info).',    qualityWeight: 2, source: 'acquisition_roadmap.txt' },
      { id: 'ev_contractor_access',   label: 'Contractor account read HR/Finance files outside its remit.',   qualityWeight: 3, source: 'access_log.txt', setFlag: 'contractorAccessDiscovered' },
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
};

window.CAREER_MISSION_IDS = Object.keys(CAREER_MISSIONS);

/* ================================================================== *
 * INIT
 * ================================================================== */
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
