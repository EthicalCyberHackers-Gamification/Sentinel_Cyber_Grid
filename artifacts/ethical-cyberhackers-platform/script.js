/**
 * script.js
 * ---------
 * Ethical CyberHackers Platform
 * Milestones 1-4: terminal simulation, progressive unlock, quiz, reset
 *
 * FLOW
 * ----
 *  1. Student clicks command buttons → terminal output (M1, M2)
 *  2. Commands unlock gradually as investigation progresses (M2)
 *  3. After reading suspicious_file.txt → quiz appears (M3)
 *  4. Correct answer → XP, rank update, completion screen (M3)
 *  5. Completion screen shows summary + Restart button (M4)
 *  6. Restart wipes everything back to the initial state (M4)
 *
 * DATA FILES
 * ----------
 *  missions.js — FILESYSTEM, COMMAND_BUTTONS, MISSION_STEPS, QUIZ, MISSIONS
 *  script.js   — all interaction logic (this file)
 *  index.html  — HTML structure
 *  style.css   — visual styling
 */

import {
  FILESYSTEM,
  COMMAND_BUTTONS,
  MISSION_STEPS,
  QUIZ,
  getMissionById,
  activeMissionId,
  // Milestone 23A — mission engine data + lookup
  MISSION_1,
  MISSION_2,
  MISSIONS_REGISTRY,
  getMissionData,
  setActiveMissionId,
  // Milestone 23C — mission template + safety helpers
  MISSION_TEMPLATE,
  createMissionFromTemplate,
  validateMissionData,
  // Milestone 23E — central mission registry (course catalog).
  // Note: the registry's `updateMissionStatus` is imported under an alias
  // (`setRegistryMissionStatus`) to avoid colliding with the engine's
  // own `updateMissionStatus` dispatcher that ticks status-checklist items.
  missionRegistry,
  MISSION_STATUS,
  getRegistryMission,
  getNextMissionId,
  getMissionStatus,
  updateMissionStatus as setRegistryMissionStatus,
} from "/missions.js";

// Phase B0 — best-effort, local-first Supabase backend foundation. Every call
// here is fire-and-forget and safe in "local-only mode"; gameplay never depends
// on it (localStorage remains authoritative).
import {
  getOrCreateAnonymousId,
  mountBackendStatusIndicator,
} from "./lib/supabaseClient.js";
import {
  startAssignmentAttempt,
  abandonAssignmentAttempt,
  completeAssignmentAttempt,
  trackGameEvent,
  trackXpEvent,
  cloudCompleteMissionAttempt,
  queueCloudSync,
  reconcileCloudProgress,
} from "./lib/backendSync.js";

// Background soundtrack — bundled by Vite (returns a served URL string).
import soundtrackUrl from "@assets/slower-2020-07-30_-_Conspiracy_Theory_-_David_Fesliyan_1780099440227.mp3";

/* ============================================================
   MISSION SOUNDTRACK
   Background music that plays across the whole game, from the
   moment the student enters the module through the end of all
   missions. The track is NOT seamlessly looped: when it ends we
   pause for a short break and then restart it from the beginning,
   repeating for as long as the session lasts. Playback is kicked
   off on the first real user gesture (the "Enter Module" click)
   so it satisfies browser autoplay policies. A small mute toggle
   lets the student silence it.
   ============================================================ */
const SOUNDTRACK_BREAK_MS = 4000; // quiet break between repeats
const SOUNDTRACK_VOLUME   = 0.35; // gentle background level
let soundtrackAudio       = null;
let soundtrackBreakTimer  = null;
let soundtrackStarted     = false;
let soundtrackMuted       = false;

function initSoundtrack() {
  if (soundtrackAudio) return soundtrackAudio;
  soundtrackAudio = new Audio(soundtrackUrl);
  soundtrackAudio.preload = "auto";
  soundtrackAudio.loop = false; // we restart manually after a break
  soundtrackAudio.volume = SOUNDTRACK_VOLUME;
  // When the track finishes, wait out the break, then start it over.
  soundtrackAudio.addEventListener("ended", () => {
    if (soundtrackBreakTimer) clearTimeout(soundtrackBreakTimer);
    soundtrackBreakTimer = setTimeout(() => {
      soundtrackBreakTimer = null;
      if (!soundtrackAudio) return;
      try { soundtrackAudio.currentTime = 0; } catch (_) {}
      // If the restart is rejected (tab/device policy), drop the started
      // flag so a later user gesture (e.g. the mute toggle) can recover
      // playback and keep the session-long repeat alive.
      soundtrackAudio.play().catch(() => { soundtrackStarted = false; });
    }, SOUNDTRACK_BREAK_MS);
  });
  return soundtrackAudio;
}

function startSoundtrack() {
  const audio = initSoundtrack();
  ensureSoundtrackToggle();
  if (soundtrackStarted) return;
  soundtrackStarted = true;
  audio.muted = soundtrackMuted;
  // Autoplay can still be rejected; if so, allow a later gesture to retry.
  audio.play().catch(() => { soundtrackStarted = false; });
}

function setSoundtrackMuted(muted) {
  soundtrackMuted = !!muted;
  if (soundtrackAudio) soundtrackAudio.muted = soundtrackMuted;
  const btn = document.getElementById("soundtrackToggle");
  if (btn) {
    btn.textContent = soundtrackMuted ? "Music: Off" : "Music: On";
    btn.classList.toggle("is-muted", soundtrackMuted);
    btn.setAttribute("aria-pressed", String(soundtrackMuted));
  }
}

function toggleSoundtrackMuted() {
  setSoundtrackMuted(!soundtrackMuted);
  // If music never managed to start (e.g. autoplay was blocked), unmuting
  // here is a fresh user gesture — use it to kick playback off.
  if (!soundtrackMuted && !soundtrackStarted) startSoundtrack();
}

function ensureSoundtrackToggle() {
  if (document.getElementById("soundtrackToggle")) return;
  const btn = document.createElement("button");
  btn.id = "soundtrackToggle";
  btn.type = "button";
  btn.className = "soundtrack-toggle";
  btn.textContent = soundtrackMuted ? "Music: Off" : "Music: On";
  btn.setAttribute("aria-pressed", String(soundtrackMuted));
  btn.setAttribute("aria-label", "Toggle background music");
  btn.addEventListener("click", toggleSoundtrackMuted);
  document.body.appendChild(btn);
}


/* ============================================================
   CONSTANTS
   Starting values that resetMission() restores to on every restart.
   ============================================================ */

/** XP the student starts with (demo baseline). */
const INITIAL_XP  = 750;

/** Max XP for the current rank tier. */
const MAX_XP = 1000;

/** Starting rank name. */
const INITIAL_RANK = "Script Kiddie";

/**
 * Build timestamp — update this string whenever you push a revision.
 * It appears in the footer so you can confirm you are running the latest version.
 * Format: "DD Mon YYYY — HH:MM UTC"
 */
const BUILD_TIME = "28 May 2026 — 21:05 CST";

/* Milestone 17 — Student name entered on the landing screen.
   Frontend-only variable. Persists across mission restart and across
   trips back to the Module Overview (the input keeps its value because
   we only toggle display, never tear down the DOM). */
let studentName = "";

/* ============================================================
   LOCAL PROGRESS SAVE  (Milestone 18)
   Lightweight localStorage layer. Single key holds an object
   so save/load is atomic and easy to version. No backend.
   ============================================================ */

const STORAGE_KEY = "ech.progress.v1";

/* ============================================================
   Milestone 24A — Evidence Collection System (Phase B)
   ------------------------------------------------------------
   The evidence system supports future decision consequences and
   threat scoring. Each mission accumulates findings ("evidence")
   as the student runs investigative commands. The collected
   evidence is shown in the dashboard's "Evidence Collected"
   panel and surfaced again in the mission scorecard.

   Storage shape (in-memory + persisted to localStorage):
     evidenceLog = {
       "mission-001": [ { id, text, at }, ... ],
       "mission-002": [ { id, text, at }, ... ],
     }

   Frontend-only. No backend, no AI, no DB.
   ============================================================ */
const evidenceLog = {
  "mission-001": [],
  "mission-002": [],
  "mission-003": [],
};

/* ============================================================
   Challenge Layer 1 — Evidence Confidence System
   ------------------------------------------------------------
   A simple 0–100% confidence value per mission. Reading files /
   running commands raises it. Each contributor is counted once
   (tracked via a Set of contributor keys) so re-reading the same
   file cannot inflate the score. Frontend-only, no AI/DB.

   Mission 1 weights:
     false lead reviewed (each)   +5
     security_policy.txt reviewed +25
     suspicious_file.txt reviewed +50
     correct finding submitted    +20
   Mission 2 weights:
     local IP identified          +20
     unreachable host checked     +5
     reachable host confirmed     +30
     nmap scan completed          +30
     services reviewed            +20
   ============================================================ */
const CONFIDENCE_CAP = 100;
let m1Confidence = 0;
let m2Confidence = 0;
let m3Confidence = 0;
const m1ConfidenceContributors = new Set();
const m2ConfidenceContributors = new Set();
const m3ConfidenceContributors = new Set();

// Milestone 31A — Mission 2 ANALYST CONFIDENCE (separate from Evidence
// Confidence above). This is the "Low → Ready" reasoning track that climbs as
// the student correctly interprets each network step. m2ReasoningAnswered guards
// one-time credit per step; m2DecisionDrift counts poor decision attempts (B/D)
// for the outcome tier. All three are persisted + reset with the mission.
let m2AnalystConfidence = 0;
let m3AnalystConfidence = 0;
const m2ReasoningAnswered = new Set();
const m3ReasoningAnswered = new Set();
let m2DecisionDrift = 0;
let m3DecisionDrift = 0;
// Pending reasoning UI timers (pin-offer / retry). Tracked so navigation/reset
// can cancel them and a stale callback can't mutate the UI off-screen.
let m2ReasoningTimers = [];
let m3ReasoningTimers = [];
function clearM2ReasoningTimers() {
  m2ReasoningTimers.forEach((t) => window.clearTimeout(t));
  m2ReasoningTimers = [];
}
function clearM3ReasoningTimers() {
  m3ReasoningTimers.forEach((t) => window.clearTimeout(t));
  m3ReasoningTimers = [];
}

// Challenge Layer 1 — Mission 1 investigation tracking (for the scorecard).
const m1FilesReviewed     = new Set();
const m1FalseLeadsChecked = new Set();
let   m1BonusFound        = false;
let   m1ProgressiveHintIx = 0;

// Milestone 27A — Investigative Reasoning Layer (Mission 1 only).
// Analyst Confidence = quality of the student's REASONING (kept separate from
// Evidence Confidence, which measures strength of pinned evidence). The score is
// DERIVED (recomputed) from correct reasoning answers + correct classifications,
// so it's idempotent across re-reads / reloads.
let   m1AnalystScore         = 0;          // derived; see recomputeM1AnalystScore
const m1ReasoningCorrect     = new Set();  // file names whose reasoning prompt was answered correctly
let   m1ReasoningBonusAwarded = false;     // one-time +25 XP (both supporting files correct)
let   m1AnalysisTimer        = null;       // pending "Submitting analysis..." delay (cancel-safe)

// Milestone 33A — Persistent Player Identity & Career Reputation.
// The ONLY new persisted state is a compact operational-history log; all
// reputation/ratings/traits are DERIVED at render from already-persisted signals
// (mission completion, trust, outcomes, containment, confidence, evidence) so the
// career memory survives reload without duplicating any existing system.
let   operationalHistory     = [];         // [{id,label,status:"success"|"warn",at}]
const OPERATIONAL_HISTORY_MAX = 12;

// Milestone 28A — Emotional Gameplay Decision Layer (Mission 1 only) state.
let   m1DecisionTimer        = null;       // pending "Submitting Blue Team recommendation..." (cancel-safe)
let   m1DecisionPending      = false;      // true while a Blue Team submit is in flight
const INCIDENT_TIMELINE_BASE_MIN = 9 * 60 + 12; // 09:12 synthetic incident clock start
const INCIDENT_TIMELINE_MAX  = 6;          // keep the timeline compact (latest events)
const incidentTimeline       = { "mission-001": [] }; // [{ t:"09:12", label:"..." }]
const incidentTimelineSeq    = { "mission-001": 0 };  // monotonic clock index

// Milestone 28B — Reactive Incident Evolution (Mission 1 only) state. The
// incident reacts to Blue Team decisions with delayed, believable "beats"
// (queue + single cancel-safe timer). Ephemeral — never persisted; a deferred
// beat only fires in a live, on-screen, in-progress Mission 1.
let   incidentEvolutionTimer = null;       // pending evolution beat (cancel-safe)
let   incidentEvolutionQueue = [];         // remaining beats for the active reaction
let   incidentEvolutionKind  = null;       // the decision id driving the reaction

const M1_PROGRESSIVE_HINTS = [
  "Not every file is suspicious. Review files carefully.",
  "Company policy may help you judge whether a file is dangerous.",
  "Look for a file asking for sensitive information.",
];

/** Returns the live confidence value for a mission. */
function getConfidence(missionId) {
  return missionId === "mission-003" ? m3Confidence : missionId === "mission-002" ? m2Confidence : m1Confidence;
}

/** Add a one-time confidence contribution for a mission. */
function addConfidence(missionId, contributorKey, amount) {
  const set = missionId === "mission-003"
    ? m3ConfidenceContributors
    : missionId === "mission-002"
    ? m2ConfidenceContributors
    : m1ConfidenceContributors;
  if (set.has(contributorKey)) return;
  set.add(contributorKey);
  if (missionId === "mission-003") {
    m3Confidence = Math.min(CONFIDENCE_CAP, m3Confidence + amount);
  } else if (missionId === "mission-002") {
    m2Confidence = Math.min(CONFIDENCE_CAP, m2Confidence + amount);
  } else {
    m1Confidence = Math.min(CONFIDENCE_CAP, m1Confidence + amount);
  }
  renderConfidenceMeter(missionId);
}

/** Render the "Evidence Confidence" meter for the given mission id. */
function renderConfidenceMeter(missionId) {
  const mid    = missionId || getActiveMissionId();
  const hostId = mid === "mission-003" ? "m3ConfidenceMeter" : mid === "mission-002" ? "m2ConfidenceMeter" : "confidenceMeter";
  const host   = document.getElementById(hostId);
  if (!host) return;
  const pct = Math.max(0, Math.min(CONFIDENCE_CAP, getConfidence(mid)));
  const ready = pct >= 50;
  host.innerHTML = `
    <h3 class="objectives-title">
      Evidence Confidence
      <span class="confidence-pill">${pct}%</span>
    </h3>
    <div class="confidence-bar">
      <div class="confidence-bar-fill" style="width: ${pct}%;"></div>
    </div>
    <p class="confidence-caption">
      ${ready
        ? "You have enough evidence to submit a finding."
        : "Gather stronger evidence before submitting a finding."}
    </p>
  `;
}

/* ============================================================
   Investigation Board — Evidence Prioritization
   ------------------------------------------------------------
   Students manually PIN findings to the Investigation Board and
   CLASSIFY how suspicious each one is. Correct prioritization —
   not command clicks — drives Evidence Confidence, small Trust
   gains, and (Mission 1) the gate to escalate. Frontend-only.
   ============================================================ */
const SUSPICION_LEVELS = {
  normal:   { label: "Normal Activity",             useful: false, critical: false },
  low:      { label: "Low Suspicion",               useful: false, critical: false },
  helpful:  { label: "Helpful Supporting Evidence", useful: true,  critical: false },
  critical: { label: "Critical Threat Evidence",    useful: true,  critical: true  },
};

const CLASSIFICATION_ORDER = ["normal", "low", "helpful", "critical"];

// Correct classification per pinnable finding. Keyed by mission, then by
// the finding key (M1 = lowercased filename; M2 = command key).
const EVIDENCE_RATINGS = {
  "mission-001": {
    "meeting_schedule.txt": { title: "Meeting Schedule",   correct: "normal"   },
    "finance_update.txt":   { title: "Finance Update",     correct: "normal"   },
    "employee_notes.txt":   { title: "Employee Notes",     correct: "helpful"  },
    "security_policy.txt":  { title: "Security Policy",     correct: "helpful"  },
    "suspicious_file.txt":  { title: "Suspicious File",    correct: "critical" },
  },
  "mission-002": {
    "ping-bad": { title: "Unreachable Host (10.0.0.8)",        correct: "normal"   },
    "ip-addr":  { title: "Local IP Address (10.0.0.12)",      correct: "helpful"  },
    // Milestone 31A — reachable host + service review become pinnable too, so the
    // M2 evidence taxonomy mirrors Mission 1 (offered one at a time after the
    // matching reasoning step, to keep cognitive load low).
    "ping":     { title: "Reachable Host (10.0.0.5)",         correct: "helpful"  },
    "nmap":     { title: "Open Services (SSH / HTTP / HTTPS)", correct: "critical" },
    "review":   { title: "Service Review Required",           correct: "helpful"  },
  },
  // Assignment 3 — Reconnaissance Detection. Keys mirror M3_COMMANDS keys.
  // The repeated CONNECTIONS and the unknown SOURCE are helpful supporting
  // signals; the systematic PROBE PATTERN is the critical recon evidence; the
  // known CDN is a benign false lead (normal).
  "mission-003": {
    "ping-bad": { title: "Known CDN Source (198.51.100.20)",   correct: "normal"   },
    "ip-addr":  { title: "Repeated External Connections",      correct: "helpful"  },
    "ping":     { title: "Unknown Source (203.0.113.77)",      correct: "helpful"  },
    "nmap":     { title: "Service-Probe Pattern",              correct: "critical" },
    "review":   { title: "Reconnaissance Correlation",         correct: "helpful"  },
  },
};

// Pinned findings per mission: key -> { title, level, levelLabel, correct, useful, critical }
const investigationPins = {
  "mission-001": {},
  "mission-002": {},
  "mission-003": {},
};
// Findings reviewed and therefore available to pin (key set per mission).
const pinnableFindings = {
  "mission-001": new Set(),
  "mission-002": new Set(),
  "mission-003": new Set(),
};
// One-time XP guard keyed by `${missionId}:${key}` so re-classifying can't farm XP.
const pinXpAwarded = new Set();

/* ============================================================
   GUIDED ONE-CLUE-AT-A-TIME FLOW (Mission 1)
   Files reveal one at a time: each file card (a cat-* command button)
   is unlocked only after the previous file is opened AND classified (or
   skipped). The student focuses on a single investigative decision at a
   time instead of being shown every file/command at once.
   ============================================================ */

// Reveal order (file name ↔ its cat-* command button key). The order here
// drives BOTH which file unlocks next and the active-file spotlight.
const M1_FILE_REVEAL = [
  { file: "employee_notes.txt",  btn: "cat-employee-notes"  },
  { file: "meeting_schedule.txt", btn: "cat-meeting-schedule" },
  { file: "finance_update.txt",  btn: "cat-finance-update"   },
  { file: "security_policy.txt", btn: "cat-security-policy"  },
  { file: "suspicious_file.txt", btn: "cat-suspicious"       },
];

// The cat-* button key for the file currently "under investigation" (opened
// and awaiting classification). null when no file is actively being judged.
let m1ActiveFileKey = null;

/** Map a cat-* button key → its file name (or null). */
function m1FileForBtnKey(key) {
  const entry = M1_FILE_REVEAL.find((f) => f.btn === key);
  return entry ? entry.file : null;
}
/** Map an M1 file name → its cat-* button key (or null). */
function m1BtnKeyForFile(file) {
  const entry = M1_FILE_REVEAL.find((f) => f.file === file);
  return entry ? entry.btn : null;
}

/** Set (or clear) the file currently under investigation + repaint cards. */
function setM1ActiveFile(btnKey) {
  m1ActiveFileKey = btnKey || null;
  document.body.classList.toggle("m1-file-active", !!m1ActiveFileKey);
  // Repaint so the active/reviewed/next card states update immediately.
  try { renderButtons(); } catch (_) { /* btnContainer may not exist yet */ }
}

/**
 * Reveal the NEXT file card in M1_FILE_REVEAL after `currentFile`.
 * Called once a file's classification interaction completes (correct,
 * incorrect, or skipped). No-op on the last file. Resume-safe: re-reading an
 * already-classified file walks the chain forward.
 */
function revealNextM1File(currentFile) {
  const idx = M1_FILE_REVEAL.findIndex((f) => f.file === currentFile);
  if (idx < 0) return;
  const next = M1_FILE_REVEAL[idx + 1];
  if (!next) return; // last file (suspicious_file) — nothing further to reveal
  const newly = unlockButtons([next.btn]);
  renderButtons(newly); // newly-unlocked card gets the .cmd-btn--unlocking fade/pulse
  if (newly.length) {
    showEventToast("Next File Available", "A new document is ready to inspect.", "info");
    setCurrentObjective("mission-001", "Goal: keep comparing the evidence. Open the next document and judge what it suggests.");
  }
}

/** Confidence awarded for a pin given correctness + chosen level. */
function pinConfidenceAmount(correct, level) {
  if (!correct) return 3;
  if (level === "critical") return 50;
  if (level === "helpful")  return 20;
  return 10; // correct normal / low
}
/** Trust awarded for a correct pin (none for incorrect — guide, don't punish). */
function pinTrustAmount(correct, level) {
  if (!correct) return 0;
  return level === "critical" ? 5 : 3;
}
/** XP awarded the first time a finding is correctly classified. */
function pinXpAmount(correct, level) {
  if (!correct) return 0;
  if (level === "critical") return 25;
  if (level === "helpful")  return 15;
  return 10;
}

/* ============================================================
   MILESTONE 27A — INVESTIGATIVE REASONING LAYER (Mission 1)
   Per-file reasoning prompts ("What does this file suggest?"),
   an Analyst Confidence meter (quality of the student's reasoning,
   kept separate from Evidence Confidence), delayed "Submitting
   analysis to manager..." validation, "why this matters" micro-
   feedback, and a one-time reasoning bonus. Frontend-only.
   Mission 2 is untouched; the opt-in demo follows its own curated
   path and bypasses these prompts.
   ============================================================ */

// Per-file reasoning question shown right after a file is opened. Exactly one
// option is correct. `why` is the short "why this matters" feedback shown after
// a correct answer.
const M1_REASONING = {
  "employee_notes.txt": {
    question: "What does this file suggest?",
    options: [
      { id: "A", text: "It is a threat because it mentions passwords.", correct: false },
      { id: "B", text: "It is a reminder that supports safe reporting behavior.", correct: true },
      { id: "C", text: "It proves an attacker is already inside the network.", correct: false },
      { id: "D", text: "It should be escalated as an active attack.", correct: false },
    ],
    why: "Awareness reminders support an investigation, but they are not the attack itself.",
    hint: "Ask whether the file actually requests anything — a password, a login, an action — or just reminds staff about safe behavior.",
  },
  "meeting_schedule.txt": {
    question: "What does this file suggest?",
    options: [
      { id: "A", text: "It is automatically dangerous because it says urgent.", correct: false },
      { id: "B", text: "It appears to be normal business activity.", correct: true },
      { id: "C", text: "It proves password theft.", correct: false },
      { id: "D", text: "It should be escalated immediately.", correct: false },
    ],
    why: "Urgent language alone is not enough. Analysts look for credential requests, unknown links, or external pressure.",
    hint: "Urgent wording isn't a threat by itself. Look for a credential request, an external link, or pressure from outside.",
  },
  "finance_update.txt": {
    question: "What does this file suggest?",
    options: [
      { id: "A", text: "Finance files are always dangerous.", correct: false },
      { id: "B", text: "It is normal activity — no password or external login request.", correct: true },
      { id: "C", text: "It is proof of a phishing attempt.", correct: false },
      { id: "D", text: "It must be escalated immediately.", correct: false },
    ],
    why: "Sensitive-sounding files are only a threat when they request credentials or external action.",
    hint: "A sensitive topic isn't the same as an attack. Does it ask you to log in or hand over credentials?",
  },
  "security_policy.txt": {
    question: "What does this file suggest?",
    options: [
      { id: "A", text: "It is a threat because it talks about passwords.", correct: false },
      { id: "B", text: "It is company policy that helps judge unsafe behavior.", correct: true },
      { id: "C", text: "It is the attack itself.", correct: false },
      { id: "D", text: "It is irrelevant to the investigation.", correct: false },
    ],
    why: "Policy evidence helps explain WHY the suspicious file violates safe behavior.",
    hint: "Policy documents describe the rules — they're evidence that explains why behavior is unsafe, not the attack itself.",
  },
  "suspicious_file.txt": {
    question: "What does this file suggest?",
    options: [
      { id: "A", text: "It is normal because it sounds urgent.", correct: false },
      { id: "B", text: "It is dangerous — it asks for a password through an unknown external email.", correct: true },
      { id: "C", text: "It is harmless because it is in the documents folder.", correct: false },
      { id: "D", text: "It only needs to be ignored.", correct: false },
    ],
    why: "Password requests from unknown external emails are strong phishing indicators.",
    hint: "Check who it's from and what it wants — an unknown external sender asking for a password is the classic phishing pattern.",
  },
};

/** Random "Submitting analysis to manager..." delay (700–1200 ms) for anticipation. */
function m1AnalysisDelay() {
  return 700 + Math.floor(Math.random() * 500);
}

/** UF-3 — short "Reviewing analyst assessment..." delay (650–1050 ms) before a
 *  per-step reasoning verdict is revealed (Assignments 2 & 3). Keeps the gate
 *  feeling weighed without being slow or frustrating. */
function reviewAssessmentDelay() {
  return 650 + Math.floor(Math.random() * 400);
}

/** Cancel a pending "Submitting analysis..." delay so a stale callback can never
 *  mutate pins/XP/UI after the student resets, navigates away, or starts the demo. */
function clearM1AnalysisTimer() {
  if (m1AnalysisTimer !== null) {
    clearTimeout(m1AnalysisTimer);
    m1AnalysisTimer = null;
  }
}

/* ============================================================
   Milestone 28A — Emotional Gameplay Decision Layer (Mission 1)
   Cancel-safe timers for the Blue Team decision submit-delay and the
   delayed "continue silently" red-team event, plus the compact Incident
   Timeline and the mission outcome variation. All Mission 1 only — Mission
   2 is untouched. No backend / AI.
   ============================================================ */

/** Cancel the pending "Submitting Blue Team recommendation..." delay. */
function clearM1DecisionTimer() {
  if (m1DecisionTimer !== null) {
    clearTimeout(m1DecisionTimer);
    m1DecisionTimer = null;
  }
}

/** Tear down every Milestone 28A/28B timer + the in-flight submit flag. Called
 *  on every mission-exit (via endGuidedRun) so a stale callback can never fire
 *  off-screen after a reset / navigation / demo. */
function clearM1DecisionTimers() {
  clearM1DecisionTimer();
  clearIncidentEvolution(); // Milestone 28B — cancel pending reactive beats.
  m1DecisionPending = false;
}

/** Synthetic incident clock — 09:12, +2 min per event (HH:MM, 24h). */
function incidentTimelineClock(ix) {
  const total = INCIDENT_TIMELINE_BASE_MIN + (ix * 2);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/** Append an event to the Mission 1 Incident Timeline (de-duped, trimmed,
 *  rendered, persisted). No-op for any other mission. */
function addTimelineEvent(missionId, label) {
  if (missionId !== "mission-001") return;
  if (!Array.isArray(incidentTimeline["mission-001"])) incidentTimeline["mission-001"] = [];
  const list = incidentTimeline["mission-001"];
  if (list.length && list[list.length - 1].label === label) return; // de-dupe repeat
  list.push({ t: incidentTimelineClock(incidentTimelineSeq["mission-001"]++), label });
  if (list.length > INCIDENT_TIMELINE_MAX) list.shift();
  renderIncidentTimeline("mission-001");
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Paint the compact Incident Timeline (latest events). Hidden when empty. */
function renderIncidentTimeline(missionId) {
  if (missionId !== "mission-001") return;
  const host = document.getElementById("incidentTimeline");
  if (!host) return;
  const body = host.querySelector(".incident-timeline-list");
  if (!body) return;
  const list = Array.isArray(incidentTimeline["mission-001"]) ? incidentTimeline["mission-001"] : [];
  if (!list.length) {
    host.style.display = "none";
    body.innerHTML = "";
    return;
  }
  host.style.display = "";
  body.innerHTML = list
    .map((e) => `
      <li class="incident-timeline-row">
        <span class="incident-timeline-time">${escapeHtml(e.t)}</span>
        <span class="incident-timeline-label">${escapeHtml(e.label)}</span>
      </li>`)
    .join("");
}

/** Determine the Mission 1 outcome variation from how the incident unfolded.
 *  Reactive (Milestone 28B): the summary varies by the decisiveness of the
 *  Blue Team response AND whether the adversary managed to move (peak pressure).
 *  NEVER a hard fail — always returns a completed-mission outcome. */
function m1OutcomeVariation() {
  const peak = (typeof escalationPeak === "object" && escalationPeak)
    ? (escalationPeak["mission-001"] || 0) : 0;
  const taken = decisionTaken["mission-001"];
  const kind = (taken && DECISION_ACTIONS[taken]) ? DECISION_ACTIONS[taken].kind : null;
  // Decisive, clean response — the adversary never gained ground.
  if (kind === "correct" && peak === 0) {
    return { key: "excellent", title: "Excellent Containment",
             text: "Threat contained before additional spread." };
  }
  // Decisive response, but the incident had already started to move —
  // operational escalation stabilized it.
  if (kind === "correct" && peak > 0) {
    return { key: "reactive", title: "Reactive Recovery",
             text: "Threat stabilized after operational escalation." };
  }
  // A slower, evidence-first call let limited phishing expansion occur first.
  if (kind === "acceptable") {
    return { key: "delayed", title: "Delayed Containment",
             text: "Threat contained after limited phishing expansion." };
  }
  // Fallback — escalation dominated the response.
  return { key: "weak", title: "Weak Response",
           text: "Incident escalated after delayed Blue Team action." };
}

/** Completion-screen markup for the Mission 1 outcome variation. */
function buildM1OutcomeVariationHTML() {
  const o = m1OutcomeVariation();
  return `
      <div class="mission-outcome mission-outcome--${o.key}" role="status">
        <span class="mission-outcome-title">${escapeHtml(o.title)}</span>
        <span class="mission-outcome-text">${escapeHtml(o.text)}</span>
      </div>`;
}

/* ============================================================
   Milestone 28B — Reactive Incident Evolution (Mission 1 only)
   ------------------------------------------------------------
   Make the incident react BELIEVABLY to the Blue Team decision so
   the student feels "my earlier action changed what happened next."
   This is a thin reactive LAYER on top of the existing Stage 1–4 +
   28A primitives — no backend / AI / multiplayer / giant branching.

   Each decision schedules a short, data-driven sequence of delayed
   "beats" (INCIDENT_EVOLUTION). One cancel-safe timer drives the
   queue; every beat re-checks that Mission 1 is still live + on
   screen (incidentEvolutionActive) so a stale callback can never
   fire off-screen. The whole reaction is torn down on every
   mission-exit via clearM1DecisionTimers (already in endGuidedRun).

   Reusable API (per the task spec):
     - triggerIncidentEvolution(eventType) — start a reaction
     - advanceIncidentState()             — apply the next beat
     - renderIncidentTimelineUpdate(label)— add + highlight a row
   ============================================================ */

// Per-decision reactive sequences. Beats fire in order, each after its own
// `delay` (ms). Fields are all optional and reuse existing primitives:
//   red:{label,text}  → triggerEscalationEvent (pressure+threat pulse+flag+toast)
//   toast:{label,text,type} → showEventToast flavor update ([BLUE TEAM]/[INCIDENT])
//   contain (string)  → record in the Blue Team feed (no extra toast)
//   manager (string)  → scripted manager chat reaction
//   trust (number)    → trust delta   | containment (number) → containment delta
//   threatDown (bool) → ease threat one notch | pressure (number) → red beat amount
//   timeline (string) → add a timeline row (highlighted)
const INCIDENT_EVOLUTION = {
  // Escalate immediately → strong, decisive containment.
  "m1-escalate": [
    { delay: 1400, toast: { label: "BLUE TEAM UPDATE", text: "Lead analyst reviewing containment request.", type: "blueteam" } },
    { delay: 2000, toast: { label: "INCIDENT UPDATE", text: "Potential credential spread interrupted early.", type: "blueteam" },
      contain: "Credential spread interrupted early.",
      manager: "Strong escalation timing helped reduce operational risk.",
      trust: 4, containment: 10, timeline: "Credential spread interrupted" },
  ],
  // Isolate the workstation → spread reduced, some evidence lost.
  "m1-isolate": [
    { delay: 1400, toast: { label: "BLUE TEAM ACTION", text: "Workstation isolation successful.", type: "blueteam" } },
    { delay: 2000, toast: { label: "INCIDENT UPDATE", text: "External communication attempts reduced.", type: "blueteam" },
      contain: "External communication attempts reduced.",
      manager: "Containment reduced threat spread, though some evidence collection was limited.",
      threatDown: true, containment: 15, timeline: "External comms reduced" },
  ],
  // Continue gathering evidence silently → delayed adversary movement.
  "m1-continue": [
    { delay: 3200, red: { label: "RED TEAM ACTIVITY", text: "Additional suspicious outbound activity detected." },
      pressure: 10,
      manager: "The threat may be spreading beyond the original workstation.",
      timeline: "Additional outbound activity detected" },
  ],
  // Ignore for now (poor, non-advancing) → wider phishing exposure. Kept LIGHT
  // (the immediate decision already applied the trust/threat penalty) so the
  // student is nudged, not heavily punished.
  "m1-ignore": [
    { delay: 2800, red: { label: "RED TEAM MOVEMENT", text: "Additional employee targeted by suspicious email activity." },
      pressure: 12,
      manager: "We may now be dealing with wider phishing exposure.",
      timeline: "Phishing exposure widening" },
  ],
};

/** Cancel any in-flight reactive sequence (cancel-safe, idempotent). */
function clearIncidentEvolution() {
  if (incidentEvolutionTimer !== null) {
    clearTimeout(incidentEvolutionTimer);
    incidentEvolutionTimer = null;
  }
  incidentEvolutionQueue = [];
  incidentEvolutionKind = null;
}

/** True only when Mission 1 is live, on screen, in progress, not in the demo —
 *  the same guard the 28A delayed red-team beat used. */
function incidentEvolutionActive() {
  const m1Visible = dashboardEl && dashboardEl.style.display !== "none";
  return !!(
    m1Visible &&
    document.body.classList.contains("mission-running") &&
    missionStarted &&
    !missionComplete &&
    !demoRunning
  );
}

/** Start the reactive incident sequence for a Blue Team decision (Mission 1). */
function triggerIncidentEvolution(eventType) {
  const seq = INCIDENT_EVOLUTION[eventType];
  if (!Array.isArray(seq) || !seq.length) return;
  clearIncidentEvolution();
  incidentEvolutionKind = eventType;
  incidentEvolutionQueue = seq.map((beat, i) => ({ ...beat, _i: i }));
  scheduleNextIncidentBeat();
}

/** Arm the timer for the next queued beat (no-op when the queue is empty). */
function scheduleNextIncidentBeat() {
  if (!incidentEvolutionQueue.length) { incidentEvolutionKind = null; return; }
  const delay = typeof incidentEvolutionQueue[0].delay === "number"
    ? incidentEvolutionQueue[0].delay : 1500;
  incidentEvolutionTimer = window.setTimeout(advanceIncidentState, delay);
}

/** Apply the next beat then schedule the following one. Bails (and tears down)
 *  if Mission 1 is no longer the live, on-screen, in-progress mission. */
function advanceIncidentState() {
  incidentEvolutionTimer = null;
  const beat = incidentEvolutionQueue.shift();
  if (!beat) { incidentEvolutionKind = null; return; }
  if (!incidentEvolutionActive()) { clearIncidentEvolution(); return; }
  applyIncidentBeat(beat);
  if (incidentEvolutionQueue.length) scheduleNextIncidentBeat();
  else incidentEvolutionKind = null;
}

/** Apply one reactive beat's effects, reusing the existing primitives. */
function applyIncidentBeat(beat) {
  if (beat.red) {
    // Adversary gains a little ground: pressure + threat pulse + red flag +
    // long-dwell red toast + active-node pulse (all handled inside).
    triggerEscalationEvent("mission-001", {
      event: beat.red,
      amount: typeof beat.pressure === "number" ? beat.pressure : ESCALATION_STEP,
    });
  } else {
    if (beat.toast) {
      showEventToast(beat.toast.label, beat.toast.text, beat.toast.type || "blueteam",
        { duration: BLUE_TEAM_TOAST_MS });
    }
    if (beat.contain) showBlueTeamUpdate("mission-001", beat.contain); // feed record (no 2nd toast)
    if (typeof pulseActiveMissionNode === "function") pulseActiveMissionNode();
  }
  if (typeof beat.trust === "number") {
    if (beat.trust > 0) increaseTrustScore(beat.trust);
    else if (beat.trust < 0) decreaseTrustScore(-beat.trust);
  }
  if (typeof beat.containment === "number") {
    updateContainmentProgress("mission-001", beat.containment, {
      stepId: "evo-" + incidentEvolutionKind + "-" + beat._i, // one-time credit
    });
  }
  if (beat.threatDown) {
    // Reuse the existing monotonic threat-lowering helper, then pulse the meter
    // so the containment reads as a visible, reactive change.
    lowerThreatOneStep("mission-001");
    fxPulseThreat("mission-001");
  }
  if (beat.manager) pushManagerMessage("mission-001", beat.manager);
  if (beat.timeline) renderIncidentTimelineUpdate(beat.timeline);
}

/** Add a timeline row AND briefly highlight the newest entry (reactive feel). */
function renderIncidentTimelineUpdate(label) {
  if (label) addTimelineEvent("mission-001", label);
  else renderIncidentTimeline("mission-001");
  const host = document.getElementById("incidentTimeline");
  if (!host) return;
  const rows = host.querySelectorAll(".incident-timeline-row");
  const last = rows[rows.length - 1];
  if (last) fxFlash(last, "incident-timeline-row--new", 1300);
}

/** True once suspicious_file.txt is correctly classified Critical (the primary threat). */
function m1CriticalIdentified() {
  return canCompleteM1();
}

/** Recompute Analyst Confidence score from correct reasoning + correct
 *  classifications. Derived (idempotent) so re-reads / reloads never double-count. */
function recomputeM1AnalystScore() {
  let s = 0;
  s += m1ReasoningCorrect.size; // +1 per correctly reasoned file
  const pins = investigationPins["mission-001"] || {};
  const ratings = EVIDENCE_RATINGS["mission-001"] || {};
  const POINTS = { critical: 3, helpful: 2, low: 1, normal: 1 };
  Object.keys(pins).forEach((key) => {
    if (!ratings[key]) return;               // corrupt-state hardening: only known M1 files
    const p = pins[key];
    if (!p || !p.correct) return;            // incorrect classification pauses (no gain)
    const pts = POINTS[p.level];             // only count valid suspicion levels
    if (pts) s += pts;
  });
  m1AnalystScore = s;
  return s;
}

/** Map the analyst score (+ critical-identified) to a level. Ready requires the
 *  primary threat to be correctly identified. */
function m1AnalystLevel() {
  if (m1CriticalIdentified()) return "Ready";
  if (m1AnalystScore >= 6) return "Strong";
  if (m1AnalystScore >= 3) return "Building";
  return "Low";
}

/** Completion-gate helper: reasoning strong enough to submit the final finding. */
function m1AnalystReadyToSubmit() {
  const lvl = m1AnalystLevel();
  return lvl === "Strong" || lvl === "Ready";
}

/** Render the Analyst Confidence meter (Mission 1 only). */
function renderAnalystConfidence() {
  const host = document.getElementById("analystConfidence");
  if (!host) return;
  const level = m1AnalystLevel();
  const pct = { Low: 18, Building: 48, Strong: 76, Ready: 100 }[level] || 0;
  const caption = {
    Low:      "Inspect and reason through each file to build your case.",
    Building: "Good progress. Keep comparing clues and eliminating false leads.",
    Strong:   "Strong reasoning. Confirm the primary threat to finish.",
    Ready:    "You have the reasoning to submit your final finding.",
  }[level];
  host.innerHTML = `
    <h3 class="objectives-title">
      Analyst Confidence
      <span class="analyst-pill analyst-pill--${level.toLowerCase()}">${level}</span>
    </h3>
    <div class="analyst-bar">
      <div class="analyst-bar-fill analyst-bar-fill--${level.toLowerCase()}" style="width: ${pct}%;"></div>
    </div>
    <p class="confidence-caption">${escapeHtml(caption)}</p>
  `;
}

/** Award the one-time Reasoning Bonus when BOTH supporting files are correctly classified. */
function maybeAwardReasoningBonus() {
  if (m1ReasoningBonusAwarded) return;
  const pins = investigationPins["mission-001"] || {};
  const ok = (p) => p && p.correct && p.level === "helpful";
  if (ok(pins["employee_notes.txt"]) && ok(pins["security_policy.txt"])) {
    m1ReasoningBonusAwarded = true;
    awardXP(25);
    showEventToast("Reasoning Bonus", "Supporting evidence identified.", "success");
    try { saveProgress(); } catch (_) { /* non-fatal */ }
  }
}

/** Build the reasoning-prompt HTML (one prompt for the active file). */
function buildM1ReasoningHTML(key, feedback) {
  const prompt = M1_REASONING[key];
  if (!prompt) return "";
  const rating = EVIDENCE_RATINGS["mission-001"][key];
  const opts = prompt.options.map((o) => `
    <button class="reason-btn" type="button" data-reason-id="${o.id}" data-key="${escapeHtml(key)}">
      <span class="reason-letter">${o.id}</span>
      <span class="reason-text">${escapeHtml(o.text)}</span>
    </button>
  `).join("");
  return `
    <div class="reason-panel">
      <p class="classify-active-file">🔎 Current File Under Investigation</p>
      <p class="classify-subject">${escapeHtml(rating ? rating.title : key)}</p>
      <p class="reason-question">${escapeHtml(prompt.question)}</p>
      <div class="reason-options">${opts}</div>
      ${prompt.hint ? `<details class="reason-hint"><summary>Need a hint?</summary><p>${escapeHtml(prompt.hint)}</p></details>` : ""}
      ${feedback ? `<div class="reason-feedback ${feedback.cls}">${feedback.html}</div>` : ""}
    </div>
  `;
}

/** Show the reasoning prompt for the active file (or skip straight to
 *  classification if its reasoning was already answered correctly — e.g. re-read). */
function showM1ReasoningPrompt(key) {
  if (!M1_REASONING[key] || m1ReasoningCorrect.has(key)) {
    showClassificationPrompt("mission-001", key);
    return;
  }
  const host = document.getElementById(pinHostId("mission-001"));
  if (!host) return;
  host.style.display = "";
  host.innerHTML = buildM1ReasoningHTML(key, null);
  host.querySelectorAll(".reason-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleM1Reasoning(key, btn.getAttribute("data-reason-id")));
  });
}

/** Handle a reasoning answer: delayed "submitting" → manager feedback → on correct,
 *  show "why this matters" + Continue to classification; on wrong, allow a retry. */
function handleM1Reasoning(key, answerId) {
  const prompt = M1_REASONING[key];
  if (!prompt) return;
  try { trackGameEvent("reasoning_answer_selected", { assignment_id: "mission-001", key, answer: answerId }); } catch (_) { /* non-fatal */ }
  const chosen = prompt.options.find((o) => o.id === answerId);
  if (!chosen) return;
  const host = document.getElementById(pinHostId("mission-001"));
  if (!host) return;

  // Anticipation — disable options and show the "submitting" state.
  host.querySelectorAll(".reason-btn").forEach((b) => { b.disabled = true; });
  const panel = host.querySelector(".reason-panel");
  if (panel) {
    const pending = document.createElement("div");
    pending.className = "reason-feedback reason-feedback--pending";
    pending.textContent = "Reviewing analyst assessment...";
    panel.appendChild(pending);
  }

  clearM1AnalysisTimer();
  m1AnalysisTimer = setTimeout(() => {
    m1AnalysisTimer = null;
    if (chosen.correct) {
      if (!m1ReasoningCorrect.has(key)) {
        m1ReasoningCorrect.add(key);
        recomputeM1AnalystScore();
        renderAnalystConfidence();
      }
      setManagerText("mission-001", "Good reasoning. " + prompt.why);
      host.innerHTML = buildM1ReasoningHTML(key, {
        cls: "reason-feedback--correct",
        html: `
          <p class="reason-why"><span class="reason-why-label">Why this matters:</span> ${escapeHtml(prompt.why)}</p>
          <button class="reason-continue-btn" type="button">Continue to classification →</button>
        `,
      });
      host.querySelectorAll(".reason-btn").forEach((b) => {
        b.disabled = true;
        if (b.getAttribute("data-reason-id") === answerId) b.classList.add("reason-btn--correct");
      });
      const cont = host.querySelector(".reason-continue-btn");
      if (cont) cont.addEventListener("click", () => showClassificationPrompt("mission-001", key));
      try { saveProgress(); } catch (_) { /* non-fatal */ }
    } else {
      setManagerText("mission-001", "Look closer. Compare the wording against what a real threat does.");
      host.innerHTML = buildM1ReasoningHTML(key, {
        cls: "reason-feedback--wrong",
        html: "Not quite. Re-read the file and consider what it actually asks for.",
      });
      host.querySelectorAll(".reason-btn").forEach((b) => {
        b.disabled = false;
        b.addEventListener("click", () => handleM1Reasoning(key, b.getAttribute("data-reason-id")));
      });
    }
  }, m1AnalysisDelay());
}

/** M1 classification submit — adds the "Submitting analysis..." delay before
 *  committing the pin. The demo bypasses this (calls handlePinClassification directly). */
function submitM1Classification(key, level) {
  const host = document.getElementById(pinHostId("mission-001"));
  if (host) {
    host.querySelectorAll(".classify-btn").forEach((b) => { b.disabled = true; });
    const panel = host.querySelector(".classify-panel");
    if (panel) {
      const pending = document.createElement("div");
      pending.className = "reason-feedback reason-feedback--pending";
      pending.textContent = "Submitting analysis to manager...";
      panel.appendChild(pending);
    }
  }
  clearM1AnalysisTimer();
  m1AnalysisTimer = setTimeout(() => {
    m1AnalysisTimer = null;
    handlePinClassification("mission-001", key, level);
  }, m1AnalysisDelay());
}

/** Build the "Investigation Reasoning" scorecard rows (Mission 1). */
function buildReasoningScorecardHTML() {
  const pins = investigationPins["mission-001"] || {};
  const ratings = EVIDENCE_RATINGS["mission-001"] || {};
  let falseLeads = 0, supporting = 0;
  Object.keys(pins).forEach((key) => {
    const p = pins[key]; const r = ratings[key];
    if (!p || !p.correct || !r) return;
    if (r.correct === "normal" || r.correct === "low") falseLeads += 1;
    if (r.correct === "helpful") supporting += 1;
  });
  const critical = m1CriticalIdentified() ? "Yes" : "No";
  const bonus = m1ReasoningBonusAwarded ? "Yes (+25 XP)" : "No";
  return `
        <li class="outcome-row outcome-row--section">
          <span class="outcome-key outcome-key--section">Investigation Reasoning</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Analyst Confidence</span>
          <span class="outcome-val outcome-val--cyan">${m1AnalystLevel()}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">False Leads Eliminated</span>
          <span class="outcome-val">${falseLeads}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Supporting Evidence Identified</span>
          <span class="outcome-val">${supporting}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Critical Threat Identified</span>
          <span class="outcome-val">${critical}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Reasoning Bonus Earned</span>
          <span class="outcome-val">${bonus}</span>
        </li>`;
}

/** Recompute a mission's Evidence Confidence purely from pinned findings. */
function recomputeConfidenceFromPins(missionId) {
  const pins = investigationPins[missionId] || {};
  let total = 0;
  Object.keys(pins).forEach((key) => {
    total += pinConfidenceAmount(pins[key].correct, pins[key].level);
  });
  total = Math.max(0, Math.min(CONFIDENCE_CAP, total));
  if (missionId === "mission-003") m3Confidence = total;
  else if (missionId === "mission-002") m2Confidence = total;
  else m1Confidence = total;
  renderConfidenceMeter(missionId);
  return total;
}

/** True once suspicious_file.txt is pinned AND classified Critical (M1 gate). */
function canCompleteM1() {
  const p = investigationPins["mission-001"]["suspicious_file.txt"];
  return !!(p && p.level === "critical" && p.correct);
}

/** DOM host id for a mission's pin-action area. */
function pinHostId(missionId) {
  return missionId === "mission-003" ? "m3PinPanel" : missionId === "mission-002" ? "m2PinPanel" : "pinPanel";
}
/** DOM host id for a mission's Investigation Board. */
function boardHostId(missionId) {
  return missionId === "mission-003" ? "m3InvestigationBoard" : missionId === "mission-002" ? "m2InvestigationBoard" : "investigationBoard";
}

/** Set the supervisor message for the active mission using raw text. */
function setManagerText(missionId, text) {
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage(missionId, text);
}

/** Show the "Pin to Investigation Board" action for a reviewed finding. */
function showPinPrompt(missionId, key) {
  const rating = EVIDENCE_RATINGS[missionId] && EVIDENCE_RATINGS[missionId][key];
  if (!rating) return;
  pinnableFindings[missionId].add(key);
  const host = document.getElementById(pinHostId(missionId));
  if (!host) return;
  const existing = investigationPins[missionId][key];
  // Correctly pinned findings are locked — nothing more to do.
  if (existing && existing.correct) {
    host.style.display = "none";
    host.innerHTML = "";
    return;
  }
  const reclass = existing ? " pin-prompt--reclassify" : "";
  const verb = existing ? "Re-classify on Board" : "Pin to Investigation Board";
  host.style.display = "";
  host.innerHTML = `
    <div class="pin-prompt${reclass}">
      <p class="pin-prompt-title">${escapeHtml(rating.title)}</p>
      <p class="pin-prompt-text">
        ${existing
          ? "Your earlier call didn't fit. Re-judge this finding."
          : "You reviewed this finding. Decide whether it belongs on your Investigation Board."}
      </p>
      <button class="pin-btn" type="button" data-pin-key="${escapeHtml(key)}">
        📌 ${escapeHtml(verb)}
      </button>
    </div>
  `;
  const btn = host.querySelector(".pin-btn");
  if (btn) btn.addEventListener("click", () => {
    try { trackGameEvent("evidence_pinned", { assignment_id: missionId, finding: key }); } catch (_) { /* non-fatal */ }
    showClassificationPrompt(missionId, key);
  });

  // Milestone 25B — when a finding first becomes pinnable during a live
  // guided run, spotlight the pin action (fires once per mission).
  if (igEnabled) igShow(missionId, "board", host);
}

/** Surface the next reviewed-but-not-yet-correctly-pinned finding (if any). */
function showNextPinnable(missionId) {
  const host = document.getElementById(pinHostId(missionId));
  if (!host) return;
  const pending = Array.from(pinnableFindings[missionId]).filter((key) => {
    const p = investigationPins[missionId][key];
    return !(p && p.correct);
  });
  if (pending.length === 0) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }
  showPinPrompt(missionId, pending[0]);
}

/** Render the "How suspicious is this evidence?" classification choices. */
function showClassificationPrompt(missionId, key) {
  const rating = EVIDENCE_RATINGS[missionId] && EVIDENCE_RATINGS[missionId][key];
  if (!rating) return;
  const host = document.getElementById(pinHostId(missionId));
  if (!host) return;
  host.style.display = "";
  const opts = CLASSIFICATION_ORDER.map((lvl) => `
    <button class="classify-btn classify-btn--${lvl}" type="button"
            data-level="${lvl}" data-key="${escapeHtml(key)}">
      ${escapeHtml(SUSPICION_LEVELS[lvl].label)}
    </button>
  `).join("");

  // Guided one-clue-at-a-time flow (Mission 1): frame this as the single file
  // currently "under investigation". UF-1 (Req 6): the suspicion call IS the
  // interpretation gate, so EVERY file now requires a classification to advance
  // — there is no "skip" bypass. A wrong call still advances with guidance, so
  // the student is never stuck, but progress always reflects a real decision.
  const isM1 = missionId === "mission-001";
  const activeHeader = isM1
    ? `<p class="classify-active-file">🔎 Current File Under Investigation</p>`
    : "";

  host.innerHTML = `
    <div class="classify-panel">
      ${activeHeader}
      <p class="classify-title">How suspicious is this evidence?</p>
      <p class="classify-subject">${escapeHtml(rating.title)}</p>
      <div class="classify-options">${opts}</div>
    </div>
  `;
  host.querySelectorAll(".classify-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const lvl = btn.getAttribute("data-level");
      // Milestone 27A — Mission 1 routes through a delayed "Submitting analysis
      // to manager..." wrapper; Mission 2 commits immediately (unchanged).
      if (missionId === "mission-001") submitM1Classification(key, lvl);
      else handlePinClassification(missionId, key, lvl);
    });
  });
}

/** Commit a pin + classification, apply effects, react, and re-render. */
function handlePinClassification(missionId, key, level) {
  const rating = EVIDENCE_RATINGS[missionId] && EVIDENCE_RATINGS[missionId][key];
  const meta   = SUSPICION_LEVELS[level];
  if (!rating || !meta) return;
  try { trackGameEvent("evidence_classified", { assignment_id: missionId, finding: key, level }); } catch (_) { /* non-fatal */ }

  const correct = level === rating.correct;
  investigationPins[missionId][key] = {
    title: rating.title,
    level,
    levelLabel: meta.label,
    correct,
    useful: meta.useful,
    critical: meta.critical,
  };

  // Evidence Confidence:
  //  - Mission 1 is driven entirely by pins (robust to re-classification).
  //  - Mission 2 keeps its existing command-based confidence and adds the
  //    pin contribution lightly on top (one-time per finding).
  if (missionId === "mission-002" || missionId === "mission-003") {
    addConfidence(missionId, `pin-${key}`, pinConfidenceAmount(correct, level));
  } else {
    recomputeConfidenceFromPins("mission-001");
    // Milestone 27A — Analyst Confidence is derived from reasoning + correct
    // classifications; recompute and refresh the meter, then check the bonus.
    recomputeM1AnalystScore();
    renderAnalystConfidence();
    maybeAwardReasoningBonus();
  }

  // Trust: small reward for correct prioritization; no punishment for wrong.
  const t = pinTrustAmount(correct, level);
  if (t > 0) increaseTrustScore(t);

  // XP: one-time per finding, only when correctly classified.
  const xpKey = `${missionId}:${key}`;
  if (correct && !pinXpAwarded.has(xpKey)) {
    const xp = pinXpAmount(correct, level);
    if (xp > 0) { pinXpAwarded.add(xpKey); awardXP(xp); }
  }

  // Pinned findings become collected evidence (only pinned items count).
  addEvidence(`pin-${missionId}-${key}`, `${rating.title} — ${meta.label}`, missionId);

  // Supervisor reaction (positive for correct; guiding for incorrect).
  setManagerText(missionId, pinReactionText(missionId, key, level, correct));

  // Visual board update.
  renderInvestigationBoard(missionId);

  // Milestone 25A — interactive feedback for pinning evidence.
  fxPulseBoard(missionId);
  fxPulseConfidence(missionId);
  // Stage 3 — correctly flagging critical evidence interrupts the adversary's
  // spread (no-ops quietly when there's no active pressure to contain).
  if (correct && meta.critical) containThreatActivity(missionId);
  // Milestone 26A — event toasts: evidence pinned, then classify outcome.
  showEventToast("Evidence Added", `${rating.title} pinned to the board.`, "info");
  if (correct) {
    showEventToast("Evidence Classified", "Suspicion level recorded correctly.", "success");
    // UF-5 — contextual pacing beat: surface the SOC "thinking" between the
    // classification and the board update (non-blocking; the ambient rotation
    // resumes on its own next tick).
    setAmbientLine("Correlating evidence across the investigation board…");
  } else {
    showEventToast("Re-check Evidence", "This finding's priority looks off.", "warning");
  }

  // Mission 1 gate: correctly tagging the suspicious file as Critical
  // is what unlocks the escalation / finding flow.
  if (missionId === "mission-001" && key === "suspicious_file.txt") {
    if (correct) {
      setThreatLevel("High", "mission-001");
      updateManagerReaction("threat_increased", { missionId: "mission-001" });
      // Stage 2 — Blue Team: critical evidence logged → containment up.
      updateContainmentProgress("mission-001", 25, { stepId: "classify-critical", caption: "Critical evidence logged." });
      showBlueTeamUpdate("mission-001", "Evidence logged.");
      // Milestone 28A — mark the find on the Incident Timeline.
      addTimelineEvent("mission-001", "Suspicious file identified");
      // Stage 4 — critical evidence unlocks the strong containment responses.
      renderContainmentActions("mission-001");
      setTimeout(() => {
        if (decisionAdvanced["mission-001"]) showFindingPanel();
        else showDecisionActions("mission-001");
      }, 800);
    } else {
      setHint("You have not identified the primary threat evidence yet.", "warning");
    }
  }

  // Stage 2 — Blue Team (Mission 2): correctly classifying an exposed-services
  // finding as Critical advances network containment (one-time).
  if ((missionId === "mission-002" || missionId === "mission-003") && correct && meta.critical) {
    updateContainmentProgress(missionId, 25, { stepId: (missionId === "mission-003" ? "m3-critical" : "m2-critical"), caption: "Critical evidence logged." });
    showBlueTeamUpdate(missionId, "Evidence logged.");
  }

  // Refresh the pin action area.
  const host = document.getElementById(pinHostId(missionId));
  if (host) {
    if (missionId === "mission-001") {
      // Guided one-clue-at-a-time flow: the classification interaction is now
      // complete (correct OR incorrect), so clear the active-file panel and
      // reveal the next file. NEVER re-show the "Pin to Board" prompt or the
      // "Your earlier call didn't fit" reclassification warning — the manager
      // reaction already guides a misjudged file, and the student can simply
      // reopen the file card to try again.
      host.innerHTML = ""; host.style.display = "none";
      setM1ActiveFile(null);
      revealNextM1File(key);
    } else if (correct) {
      host.innerHTML = ""; host.style.display = "none"; showNextPinnable(missionId);
    } else {
      showPinPrompt(missionId, key);
    }
  }

  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Scripted supervisor reaction text for a pin. */
function pinReactionText(missionId, key, level, correct) {
  if (!correct) {
    // FIX 2 — clearer guidance when the employee notes finding is misjudged.
    if (missionId === "mission-001" && key === "employee_notes.txt") {
      return "This file supports security awareness, but it is not the primary threat.";
    }
    return "This appears to be normal business activity. Focus on evidence involving credentials, external communication, or policy violations.";
  }
  if (missionId === "mission-001") {
    if (key === "suspicious_file.txt") return "Excellent. Requests for passwords through unknown email channels are a major phishing indicator.";
    // FIX 2 — employee notes correctly tagged as Helpful Supporting Evidence.
    if (key === "employee_notes.txt") return "Good. This note supports proper reporting behavior.";
    if (key === "security_policy.txt") return "Good supporting evidence. Company policy helps validate your conclusion.";
    if (level === "helpful") return "Good supporting evidence. That strengthens your case.";
    return "Good judgment. Not every file is suspicious.";
  }
  // mission-002
  if (key === "nmap") return "Exactly. Multiple exposed services are the critical risk on this host.";
  if (key === "ip-addr") return "Useful context. Knowing your local address helps you map the network.";
  return "Good judgment. An unreachable host isn't itself a threat.";
}

/** Render the Investigation Board panel for a mission. */
function renderInvestigationBoard(missionId) {
  const host = document.getElementById(boardHostId(missionId));
  if (!host) return;
  const pins = investigationPins[missionId] || {};
  const keys = Object.keys(pins);
  if (keys.length === 0) {
    host.innerHTML = `
      <h3 class="objectives-title">Investigation Board</h3>
      <p class="board-empty">No evidence pinned yet.</p>
    `;
    return;
  }
  const cards = keys.map((key) => {
    const p = pins[key];
    const tone = !p.correct ? "caution" : (p.critical ? "critical" : "success");
    return `
      <li class="board-card board-card--${tone}">
        <div class="board-card-head">
          <span class="board-card-title">${escapeHtml(p.title)}</span>
          <span class="board-card-level">${escapeHtml(p.levelLabel)}</span>
        </div>
        <div class="board-card-tags">
          <span class="board-tag ${p.useful ? "board-tag--yes" : "board-tag--no"}">
            ${p.useful ? "Useful" : "Not useful"}
          </span>
          <span class="board-tag ${p.critical ? "board-tag--crit" : "board-tag--norm"}">
            ${p.critical ? "Critical" : "Non-critical"}
          </span>
          <span class="board-tag ${p.correct ? "board-tag--ok" : "board-tag--warn"}">
            ${p.correct ? "Good call" : "Re-check priority"}
          </span>
        </div>
      </li>
    `;
  }).join("");
  host.innerHTML = `
    <h3 class="objectives-title">
      Investigation Board
      <span class="board-count">${keys.length}</span>
    </h3>
    <ul class="board-list">${cards}</ul>
  `;
}

/** Build the "Investigation Quality" summary rows shown at completion. */
function buildInvestigationQualityHTML(missionId) {
  const ratings = EVIDENCE_RATINGS[missionId] || {};
  const pins = investigationPins[missionId] || {};
  let criticalCorrect = 0, supportingCorrect = 0, falseLeadsReviewed = 0;
  let totalPins = 0, correctPins = 0;
  Object.keys(pins).forEach((key) => {
    const p = pins[key];
    totalPins += 1;
    if (p.correct) correctPins += 1;
    if (p.correct && p.level === "critical") criticalCorrect += 1;
    if (p.correct && p.level === "helpful") supportingCorrect += 1;
    const r = ratings[key];
    if (r && (r.correct === "normal" || r.correct === "low")) falseLeadsReviewed += 1;
  });
  const accuracy = totalPins ? Math.round((correctPins / totalPins) * 100) : 0;
  return `
        <li class="outcome-row">
          <span class="outcome-key">Correct Evidence Identified</span>
          <span class="outcome-val outcome-val--cyan">${criticalCorrect}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Supporting Evidence Found</span>
          <span class="outcome-val">${supportingCorrect}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">False Leads Reviewed</span>
          <span class="outcome-val">${falseLeadsReviewed}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Investigation Accuracy</span>
          <span class="outcome-val outcome-val--cyan">${accuracy}%</span>
        </li>`;
}

/* =====================================================================
   MILESTONE 24I — MISSION BRIEFING ROOM SYSTEM
   A reusable preparation layer shown after mission selection and before
   the investigation begins. Students review briefing cards (gated launch)
   so they feel like an employee preparing for a real assignment.

   Reusable: each mission defines its assignment + cards in
   MISSION_BRIEFINGS, and the same render/gate/launch code drives both.
   ===================================================================== */

// Source of truth — per-mission manager assignment + briefing cards.
const MISSION_BRIEFINGS = {
  "mission-001": {
    assignment:
      "Finance has reported a suspicious file on an employee workstation. " +
      "Before investigating, review the briefing materials and prepare your approach.",
    cards: [
      {
        id: "phishing",
        title: "Phishing Indicators",
        points: [
          "Requests for passwords",
          "Urgent language",
          "Unknown senders",
          "External email domains",
        ],
        reaction: "Good. Understanding phishing indicators will help identify suspicious activity.",
      },
      {
        id: "evidence",
        title: "Evidence Collection",
        points: [
          "Gather facts first",
          "Do not assume",
          "Document findings",
          "Verify suspicious activity",
        ],
        reaction: "Good. Evidence should be collected before conclusions are made.",
      },
      {
        id: "passwords",
        title: "Password Safety",
        points: [
          "Passwords should never be shared",
          "External requests are suspicious",
          "Company policy should be reviewed",
        ],
        reaction: "Good. Analysts must understand why a policy exists before applying it.",
      },
    ],
  },
  "mission-002": {
    assignment:
      "A network alert has identified a potentially exposed host. " +
      "Review the briefing materials before beginning your investigation.",
    cards: [
      {
        id: "ip",
        title: "IP Addresses",
        points: [
          "Devices use IP addresses",
          "Analysts identify hosts before scanning",
        ],
        reaction: "Good. Identifying hosts is the first step of any network investigation.",
      },
      {
        id: "reachability",
        title: "Network Reachability",
        points: [
          "Reachability helps confirm targets",
          "Unreachable systems cannot be investigated directly",
        ],
        reaction: "Good. Confirming reachability tells you which targets are worth your time.",
      },
      {
        id: "services",
        title: "Open Services",
        points: [
          "Services provide functionality",
          "Exposed services increase attack surface",
        ],
        reaction: "Good. Exposed services are exactly what an analyst looks for.",
      },
    ],
  },
  "mission-003": {
    assignment:
      "Network monitoring flagged unusual activity from an external source. " +
      "Review the briefing materials before hunting for reconnaissance.",
    cards: [
      {
        id: "recon",
        title: "Reconnaissance",
        points: [
          "Attackers gather information before attacking",
          "Probing services is an early warning sign",
        ],
        reaction: "Good. Catching reconnaissance early lets the Blue Team respond before a breach.",
      },
      {
        id: "weak-signals",
        title: "Weak Signals",
        points: [
          "A single connection can look harmless",
          "Repeated activity from one source is the real clue",
        ],
        reaction: "Good. Analysts correlate small signals into one bigger picture.",
      },
      {
        id: "blue-team",
        title: "Blue Team Response",
        points: [
          "Defenders watch for unknown external sources",
          "Reporting recon early prevents the next stage",
        ],
        reaction: "Good. Knowing how the Blue Team responds shapes your recommendation.",
      },
    ],
  },
};

// Reviewed-card ids per mission, and a one-time XP guard per mission.
const briefingReviewed = {
  "mission-001": new Set(),
  "mission-002": new Set(),
  "mission-003": new Set(),
};
const briefingXpAwarded = new Set();

/** DOM host id for a mission's Briefing Room. */
function briefingHostId(missionId) {
  return missionId === "mission-003" ? "m3BriefingRoom" : missionId === "mission-002" ? "m2BriefingRoom" : "briefingRoom";
}
/** Total briefing cards defined for a mission. */
function briefingCardCount(missionId) {
  const b = MISSION_BRIEFINGS[missionId];
  return b ? b.cards.length : 0;
}
/** How many briefing cards the student has reviewed for a mission. */
function briefingReviewedCount(missionId) {
  return briefingReviewed[missionId] ? briefingReviewed[missionId].size : 0;
}
/** True once every briefing card for a mission has been reviewed. */
function isBriefingComplete(missionId) {
  const total = briefingCardCount(missionId);
  return total > 0 && briefingReviewedCount(missionId) >= total;
}
/** Mission Readiness as a 0–100 percentage (clamped defensively). */
function briefingReadinessPct(missionId) {
  const total = briefingCardCount(missionId);
  if (!total) return 0;
  const pct = Math.round((briefingReviewedCount(missionId) / total) * 100);
  return Math.max(0, Math.min(100, pct));
}

/** Set the supervisor message for whichever mission is being briefed. */
function setBriefingManagerText(missionId, text) {
  // Reuse the per-mission manager panels used elsewhere in the app.
  setManagerText(missionId, text);
}

/** Render (or refresh) a mission's Briefing Room panel. */
function renderBriefingRoom(missionId) {
  const host = document.getElementById(briefingHostId(missionId));
  if (!host) return;
  const briefing = MISSION_BRIEFINGS[missionId];
  if (!briefing) { host.innerHTML = ""; return; }

  const reviewedCount = briefingReviewedCount(missionId);
  const total = briefingCardCount(missionId);
  const complete = isBriefingComplete(missionId);
  const readinessLabel = complete
    ? "Ready For Investigation"
    : `${reviewedCount} / ${total} Briefings Reviewed`;

  const cards = briefing.cards.map((card) => {
    const reviewed = briefingReviewed[missionId].has(card.id);
    const points = card.points
      .map((p) => `<li><span class="briefing-card-bullet">▹</span>${escapeHtml(p)}</li>`)
      .join("");
    return `
      <li class="briefing-card ${reviewed ? "briefing-card--reviewed" : ""}">
        <div class="briefing-card-head">
          <span class="briefing-card-title">${escapeHtml(card.title)}</span>
          ${reviewed ? `<span class="briefing-card-check">✓ Reviewed</span>` : ""}
        </div>
        <ul class="briefing-card-points">${points}</ul>
        <button class="briefing-review-btn" type="button"
                data-briefing-card="${escapeHtml(card.id)}" ${reviewed ? "disabled" : ""}>
          ${reviewed ? "Reviewed" : "Review Briefing"}
        </button>
      </li>
    `;
  }).join("");

  host.innerHTML = `
    <div class="briefing-room-inner">
      <div class="briefing-room-head">
        <h3 class="briefing-room-title">Mission Briefing Room</h3>
        <button class="replay-guide-btn briefing-replay-btn" type="button"
                title="Replay the full briefing, then the on-screen walkthrough">↻ Replay Briefing</button>
      </div>
      <p class="briefing-assignment">${escapeHtml(briefing.assignment)}</p>
      <ul class="briefing-card-list">${cards}</ul>
      <div class="briefing-readiness ${complete ? "briefing-readiness--ready" : ""}">
        <span class="briefing-readiness-label">Mission Readiness</span>
        <span class="briefing-readiness-value">${escapeHtml(readinessLabel)}</span>
        <div class="briefing-readiness-bar">
          <div class="briefing-readiness-fill" style="width:${briefingReadinessPct(missionId)}%"></div>
        </div>
      </div>
      <p class="briefing-warning" style="display:none;">
        Review all briefing materials before starting the assignment.
      </p>
    </div>
  `;

  host.querySelectorAll(".briefing-review-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      reviewBriefingCard(missionId, btn.getAttribute("data-briefing-card"))
    );
  });

  // Task #6 — presentation-only "Replay Briefing" control (briefing recap →
  // spotlight tour). Never touches progress/XP/sync.
  const replayBtn = host.querySelector(".briefing-replay-btn");
  if (replayBtn) replayBtn.addEventListener("click", () => startBriefingReplay(missionId));

  updateBriefingGate(missionId);
}

/** Mark a briefing card reviewed, react, award XP once when complete. */
function reviewBriefingCard(missionId, cardId) {
  const briefing = MISSION_BRIEFINGS[missionId];
  if (!briefing) return;
  const card = briefing.cards.find((c) => c.id === cardId);
  if (!card) return;
  if (briefingReviewed[missionId].has(cardId)) return;

  briefingReviewed[missionId].add(cardId);

  // Supervisor acknowledges the reviewed card.
  setBriefingManagerText(missionId, card.reaction);

  // Completing the whole briefing room awards XP exactly once per mission.
  if (isBriefingComplete(missionId) && !briefingXpAwarded.has(missionId)) {
    briefingXpAwarded.add(missionId);
    awardXP(10);
    setBriefingManagerText(
      missionId,
      "Preparation complete. You're ready to begin the investigation."
    );
  }

  renderBriefingRoom(missionId);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Reflect briefing completion onto the mission's launch button. */
function updateBriefingGate(missionId) {
  const complete = isBriefingComplete(missionId);
  const host = document.getElementById(briefingHostId(missionId));
  if (host) {
    const warn = host.querySelector(".briefing-warning");
    if (warn && complete) warn.style.display = "none";
  }
  if (missionId === "mission-002") {
    const btn = document.getElementById("m2BeginBtn");
    if (btn) {
      btn.classList.toggle("begin-locked", !complete);
      btn.innerHTML = complete
        ? "\u25B6&nbsp; Begin Investigation"
        : "\u25B6&nbsp; Begin Investigation \uD83D\uDD12";
    }
  } else if (missionId === "mission-003") {
    const btn = document.getElementById("m3BeginBtn");
    if (btn) {
      btn.classList.toggle("begin-locked", !complete);
      btn.innerHTML = complete
        ? "\u25B6&nbsp; Begin Investigation"
        : "\u25B6&nbsp; Begin Investigation \uD83D\uDD12";
    }
  } else {
    const btn = document.getElementById("beginMissionBtn");
    // Only gate the fresh-start ("begin") CTA — returning students on the
    // "continue" path bypass the briefing room entirely.
    if (btn && btn.getAttribute("data-mode") !== "continue") {
      btn.classList.toggle("begin-locked", !complete);
      btn.innerHTML = complete
        ? "\u25B6&nbsp; Begin Investigation"
        : "\u25B6&nbsp; Begin Investigation \uD83D\uDD12";
      // Re-sync the awaiting hint / Current Objective with the gate state so
      // reviewing the briefing immediately updates the guidance. Guarded to the
      // pre-launch state so it never overwrites in-mission or completed hints.
      if (!missionStarted && !missionComplete) {
        setHint(m1AwaitingHint(), "muted");
      }
    }
  }
}

/** Show the "review everything first" warning for an early launch attempt. */
function showBriefingWarning(missionId) {
  const host = document.getElementById(briefingHostId(missionId));
  if (!host) return;
  const warn = host.querySelector(".briefing-warning");
  if (warn) warn.style.display = "";
  setBriefingManagerText(
    missionId,
    "Review all briefing materials before starting the assignment."
  );
}

/** Play a short launch sequence in the briefing host, then run onDone. */
function runBriefingLaunch(missionId, onDone) {
  const host = document.getElementById(briefingHostId(missionId));
  const lines = [
    "Preparing Investigation Environment...",
    "Loading Mission Data...",
    "Initializing Analyst Workstation...",
    "Mission Ready.",
  ];
  if (!host) { if (onDone) onDone(); return; }

  host.innerHTML = `
    <div class="briefing-launch">
      <h3 class="briefing-room-title">Launching Investigation</h3>
      <ul class="briefing-launch-lines"></ul>
    </div>
  `;
  const list = host.querySelector(".briefing-launch-lines");
  let i = 0;
  function tick() {
    if (!list) { if (onDone) onDone(); return; }
    if (i < lines.length) {
      const li = document.createElement("li");
      li.className = "briefing-launch-line";
      const done = i === lines.length - 1;
      li.innerHTML =
        `<span class="briefing-launch-mark">${done ? "✓" : "›"}</span> ` +
        `<span>${escapeHtml(lines[i])}</span>`;
      list.appendChild(li);
      i += 1;
      setTimeout(tick, done ? 500 : 420);
    } else if (onDone) {
      onDone();
    }
  }
  tick();
}

/** Gate + launch entry point for a mission's "Begin Investigation" button. */
function beginInvestigation(missionId, startFn) {
  if (!isBriefingComplete(missionId)) {
    showBriefingWarning(missionId);
    return;
  }
  runBriefingLaunch(missionId, () => {
    if (typeof startFn === "function") startFn();
  });
}

/** Build the Briefing Room scorecard rows for a mission. */
function buildBriefingSummaryHTML(missionId) {
  const complete = isBriefingComplete(missionId);
  return `
        <li class="outcome-row">
          <span class="outcome-key">Briefing Completion</span>
          <span class="outcome-val ${complete ? "outcome-val--cyan" : ""}">${complete ? "Complete" : "Incomplete"}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Mission Readiness</span>
          <span class="outcome-val outcome-val--cyan">${briefingReadinessPct(missionId)}%</span>
        </li>`;
}

/** Returns the active mission id by inspecting which dashboard is visible.
 *  Uses computed style rather than the inline `style.display` string:
 *  beginMission2 reveals the dashboard with `display = ""` (an empty
 *  string, which is falsy), so an inline-string check would mis-report
 *  Mission 2 as Mission 1 and misroute things like manager reactions. */
function getActiveMissionId() {
  const m3 = document.getElementById("mission3Dashboard");
  if (m3 && getComputedStyle(m3).display !== "none") {
    return "mission-003";
  }
  const m2 = document.getElementById("mission2Dashboard");
  if (m2 && getComputedStyle(m2).display !== "none") {
    return "mission-002";
  }
  return "mission-001";
}

/** True if the given evidence id has already been recorded for the mission. */
function hasEvidence(evidenceId, missionId) {
  const mid = missionId || getActiveMissionId();
  const list = evidenceLog[mid];
  if (!list) return false;
  return list.some((e) => e.id === evidenceId);
}

/**
 * Add a piece of evidence to a mission. No-op if the same evidenceId
 * has already been added (prevents duplicates when a command is
 * re-clicked). Re-renders the panel and persists progress.
 *
 * Future Phase B mechanics (trust score, threat meter, dynamic
 * manager reactions) will read from evidenceLog to react to what
 * the student has actually uncovered.
 */
function addEvidence(evidenceId, evidenceText, missionId) {
  const mid = missionId || getActiveMissionId();
  if (!evidenceLog[mid]) evidenceLog[mid] = [];
  if (hasEvidence(evidenceId, mid)) return false;
  evidenceLog[mid].push({
    id: evidenceId,
    text: String(evidenceText || ""),
    at: Date.now(),
  });
  renderEvidencePanel(mid);
  // Milestone 24E — first evidence in the loop moves the alert from
  // Investigating to Evidence Found. Don't downgrade later states
  // (Decision Required / Contained / Resolved) if more evidence is
  // added afterwards.
  const a = alertByMission[mid];
  if (a && (a.state === "New" || a.state === "Investigating")) {
    setAlertState(mid, "Evidence Found");
  }
  // Milestone 24F — dynamic manager reaction: the supervisor acknowledges
  // freshly collected evidence. Scripted, not AI; routed to the active
  // mission's Supervisor panel.
  updateManagerReaction("evidence_found", { missionId: mid });
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
  return true;
}

/** Clear all evidence for a single mission (used on mission restart). */
function clearEvidenceForMission(missionId) {
  const mid = missionId || getActiveMissionId();
  evidenceLog[mid] = [];
  renderEvidencePanel(mid);
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
}

/** Render the "Evidence Collected" panel for the given mission id. */
function renderEvidencePanel(missionId) {
  const mid    = missionId || getActiveMissionId();
  const hostId = mid === "mission-003" ? "m3EvidencePanel" : mid === "mission-002" ? "m2EvidencePanel" : "evidencePanel";
  const host   = document.getElementById(hostId);
  if (!host) return;
  const list = evidenceLog[mid] || [];

  if (list.length === 0) {
    host.innerHTML = `
      <h3 class="objectives-title">Evidence Collected</h3>
      <p class="evidence-empty">No evidence collected yet.</p>
    `;
    return;
  }

  host.innerHTML = `
    <h3 class="objectives-title">
      Evidence Collected
      <span class="evidence-count">${list.length}</span>
    </h3>
    <ul class="evidence-list">
      ${list.map((e) => `
        <li class="evidence-item">
          <span class="evidence-bullet">▹</span>
          <span class="evidence-text">${escapeHtml(e.text)}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

/* ============================================================
   Milestone 24G — Tool Unlock System (Phase B)
   ------------------------------------------------------------
   The tool unlock system prepares the platform for larger
   SOC-style investigations with multiple interactive tools.
   Instead of showing every tool at once, each mission exposes
   a small set of tools that unlock as the student progresses
   through the alert → investigate → evidence → decision →
   consequence loop. This creates guided discovery.

   Tool states (ordered):
     "locked"    — not yet available
     "available" — unlocked, ready to use
     "active"    — currently the focus of the investigation
     "completed" — the student finished this tool's step

   This milestone is intentionally additive and visual: it
   complements the existing command-progression unlocking
   (COMMAND_BUTTONS / m2UnlockedCmds) rather than replacing it.
   Tool ids are globally unique (mission-prefixed) so the
   reusable functions below can take just a toolId.
   ============================================================ */
const TOOL_STATES = ["locked", "available", "active", "completed"];

const TOOL_DEFINITIONS = {
  "mission-001": [
    {
      id: "m1-file-inspector",
      name: "File Inspector",
      description: "Open and read workstation files to spot suspicious content.",
      initial: "available",
    },
    {
      id: "m1-terminal",
      name: "Terminal",
      description: "Run investigation commands to explore the workstation.",
      initial: "available",
    },
    {
      id: "m1-finding-report",
      name: "Finding Report",
      description: "Report the suspicious activity you discovered.",
      initial: "locked",
    },
    {
      id: "m1-quiz",
      name: "Quiz",
      description: "Confirm your understanding of the threat.",
      initial: "locked",
    },
    {
      id: "m1-reflection",
      name: "Reflection",
      description: "Reflect on what you learned from the investigation.",
      initial: "locked",
    },
  ],
  "mission-002": [
    {
      id: "m2-network-identity",
      name: "Network Identity",
      description: "Identify your own host's position on the network.",
      initial: "available",
    },
    {
      id: "m2-reachability",
      name: "Reachability Check",
      description: "Confirm whether the target host is reachable.",
      initial: "available",
    },
    {
      id: "m2-service-scanner",
      name: "Service Scanner",
      description: "Scan the target for open network services.",
      initial: "locked",
    },
    {
      id: "m2-analyst-review",
      name: "Analyst Review",
      description: "Assess the exposed services and recommend action.",
      initial: "locked",
    },
    {
      id: "m2-quiz",
      name: "Quiz",
      description: "Confirm your understanding of open services.",
      initial: "locked",
    },
  ],
  "mission-003": [
    {
      id: "m3-network-identity",
      name: "Connection Monitor",
      description: "Review the host's active network connections.",
      initial: "available",
    },
    {
      id: "m3-reachability",
      name: "Source Lookup",
      description: "Look up who an external source belongs to.",
      initial: "available",
    },
    {
      id: "m3-service-scanner",
      name: "Log Analyzer",
      description: "Search the access log for a source's activity.",
      initial: "locked",
    },
    {
      id: "m3-analyst-review",
      name: "Analyst Review",
      description: "Correlate the signals and identify the activity.",
      initial: "locked",
    },
    {
      id: "m3-quiz",
      name: "Quiz",
      description: "Confirm your understanding of reconnaissance.",
      initial: "locked",
    },
  ],
};

/* Build a quick toolId → missionId lookup so the reusable functions
   can resolve a tool's mission from its id alone. */
const TOOL_MISSION_BY_ID = (() => {
  const map = {};
  Object.entries(TOOL_DEFINITIONS).forEach(([mid, tools]) => {
    tools.forEach((t) => { map[t.id] = mid; });
  });
  return map;
})();

/* Live tool-state store, keyed by mission id then tool id. Populated by
   initializeMissionTools(). In-memory only (re-derived as the student
   plays); it is never persisted because mission start is not persisted. */
const toolStateByMission = {
  "mission-001": {},
  "mission-002": {},
  "mission-003": {},
};

/** Returns the human-readable label for a tool state (for the panel pill). */
function toolStateLabel(state) {
  switch (state) {
    case "available": return "Available";
    case "active":    return "Active";
    case "completed": return "Completed";
    default:          return "Locked";
  }
}

/** Reset a mission's tools to the starting states from TOOL_DEFINITIONS. */
function initializeMissionTools(missionId) {
  const mid   = missionId || getActiveMissionId();
  const defs  = TOOL_DEFINITIONS[mid];
  if (!defs) return;
  const state = {};
  defs.forEach((t) => { state[t.id] = t.initial; });
  toolStateByMission[mid] = state;
  renderAvailableTools(mid);
}

/** Unlock a locked tool → "available". No-op if already past locked. */
function unlockTool(toolId) {
  const mid = TOOL_MISSION_BY_ID[toolId];
  if (!mid) return;
  const state = toolStateByMission[mid];
  if (!state) return;
  if (state[toolId] === "locked") {
    state[toolId] = "available";
    renderAvailableTools(mid);
    // Milestone 25A — glow the tool panel + toast when a tool unlocks.
    fxFlash(document.getElementById(mid === "mission-003" ? "m3ToolsPanel" : mid === "mission-002" ? "m2ToolsPanel" : "toolsPanel"), "fx-glow", 1100);
    fxToast("Tool Unlocked", "info");
  }
}

/** Make a tool the active focus. Demotes any other active tool in the same
 *  mission back to "available", and unlocks the target first if needed.
 *  Completed tools are left as-is (you don't re-activate finished work). */
function setActiveTool(toolId) {
  const mid = TOOL_MISSION_BY_ID[toolId];
  if (!mid) return;
  const state = toolStateByMission[mid];
  if (!state) return;
  if (state[toolId] === "completed") return;
  Object.keys(state).forEach((id) => {
    if (id !== toolId && state[id] === "active") state[id] = "available";
  });
  state[toolId] = "active";
  renderAvailableTools(mid);
}

/** Mark a tool as completed. */
function markToolCompleted(toolId) {
  const mid = TOOL_MISSION_BY_ID[toolId];
  if (!mid) return;
  const state = toolStateByMission[mid];
  if (!state) return;
  state[toolId] = "completed";
  renderAvailableTools(mid);
}

/** Mark every tool in a mission as completed (used on mission completion). */
function markAllToolsCompleted(missionId) {
  const mid   = missionId || getActiveMissionId();
  const state = toolStateByMission[mid];
  if (!state) return;
  Object.keys(state).forEach((id) => { state[id] = "completed"; });
  renderAvailableTools(mid);
}

/** Restart helper — same as initialize, named per the spec. */
function resetToolsForMission(missionId) {
  initializeMissionTools(missionId);
}

/** Returns the list of completed tool names for a mission (for scorecards). */
function getCompletedToolNames(missionId) {
  const mid   = missionId || getActiveMissionId();
  const defs  = TOOL_DEFINITIONS[mid] || [];
  const state = toolStateByMission[mid] || {};
  return defs.filter((t) => state[t.id] === "completed").map((t) => t.name);
}

/** Builds the "TOOLS USED" scorecard section for a mission. Reuses the
 *  existing .scorecard-section / .scorecard-skills chrome. */
function buildToolsScorecardHTML(missionId) {
  const names = getCompletedToolNames(missionId);
  if (!names.length) return "";
  const items = names.map((n) =>
    `<li><span class="scorecard-bullet">▹</span>${escapeHtml(n)}</li>`
  ).join("");
  return `
    <div class="scorecard-section scorecard-tools scorecard-section--collapsed">
      <span class="scorecard-section-label">TOOLS USED</span>
      <ul class="scorecard-skills">${items}</ul>
    </div>
  `;
}

/* ============================================================
   Milestone 24H — Mission Outcome Summary (Phase B)
   ------------------------------------------------------------
   The Mission Outcome Summary reinforces the full simulation
   loop and helps students understand the impact of their
   decisions. It restates the complete SOC-style cycle the
   student just completed — Alert → Investigation → Evidence →
   Decision → Consequence → Reward — reading from existing
   mission state only (alert, collected evidence, selected
   decision, consequence text, threat level, trust score, XP,
   tools used, manager feedback). No new state, no backend, no
   AI: it's a richer, honest read-out of what actually happened,
   including poor or neutral decisions.
   ============================================================ */
function buildOutcomeSummaryHTML(missionId) {
  // --- Alert Received (24E state, with static-definition fallback) ---
  const alert = alertByMission[missionId] || null;
  const alertTitle = alert && alert.title
    ? alert.title
    : (ALERT_DEFINITIONS[missionId] ? ALERT_DEFINITIONS[missionId].title : "—");

  // --- Evidence Collected (24A state) ---
  const evidence = getEvidenceList(missionId);
  const evidenceHTML = evidence.length
    ? `<ul class="outcome-evidence-list">${evidence
        .map((t) => `<li><span class="scorecard-bullet">▹</span>${escapeHtml(t)}</li>`)
        .join("")}</ul>`
    : `<span class="outcome-empty">No evidence was recorded.</span>`;

  // --- Decision Taken + Consequence (24D state) ---
  // Reflects the student's actual choice honestly, whether the
  // decision was correct, acceptable/neutral, or poor.
  const actionId = decisionTaken[missionId];
  const def = actionId ? DECISION_ACTIONS[actionId] : null;
  const decisionLabel = def ? def.label : "No decision recorded";
  const consequence = def
    ? def.consequence
    : "No consequence was recorded for this mission.";
  const kind = def ? def.kind : null;
  const kindClass =
    kind === "correct" ? " outcome-val--good"
      : kind === "poor" ? " outcome-val--poor"
      : kind === "acceptable" ? " outcome-val--neutral"
      : "";

  // --- Final Threat Level (24B state) ---
  const threat = getThreatLevel(missionId);

  // --- Trust Score Change (24C state) ---
  // The only per-mission trust movement comes from the decision's
  // trustDelta; show that change alongside the resulting score.
  const delta = def && typeof def.trustDelta === "number" ? def.trustDelta : 0;
  const deltaText = delta > 0 ? `+${delta}` : `${delta}`;
  const trustNow = getTrustScore();

  // --- XP Earned (per-mission quiz reward) ---
  const xp = missionId === "mission-003"
    ? (typeof M3_QUIZ === "object" && M3_QUIZ ? M3_QUIZ.xpReward : 0)
    : missionId === "mission-002"
    ? (typeof M2_QUIZ === "object" && M2_QUIZ ? M2_QUIZ.xpReward : 0)
    : (typeof QUIZ === "object" && QUIZ ? QUIZ.xpReward : 0);

  // --- Tools Used (24G state) ---
  const tools = getCompletedToolNames(missionId);
  const toolsText = tools.length ? tools.join(", ") : "None";

  // --- Manager Final Feedback (24F scripted reaction) ---
  const managerFinal =
    (MANAGER_REACTIONS[missionId] && MANAGER_REACTIONS[missionId].mission_completed) ||
    "Mission complete.";

  // --- Challenge Layer 1 — investigation quality rows ---
  const confidencePct = Math.max(0, Math.min(CONFIDENCE_CAP, getConfidence(missionId)));
  let challengeRows = "";
  const investigationQuality = buildInvestigationQualityHTML(missionId);
  if (missionId === "mission-001") {
    challengeRows = `
        <li class="outcome-row outcome-row--section">
          <span class="outcome-key outcome-key--section">Investigation Quality</span>
        </li>
${investigationQuality}
        <li class="outcome-row">
          <span class="outcome-key">Files Reviewed</span>
          <span class="outcome-val">${m1FilesReviewed.size}</span>
        </li>
        <li class="outcome-row">
          <span class="outcome-key">Final Evidence Confidence</span>
          <span class="outcome-val outcome-val--cyan">${confidencePct}%</span>
        </li>
${buildReasoningScorecardHTML()}`;
  } else {
    challengeRows = `
        <li class="outcome-row outcome-row--section">
          <span class="outcome-key outcome-key--section">Investigation Quality</span>
        </li>
${investigationQuality}
        <li class="outcome-row">
          <span class="outcome-key">Final Evidence Confidence</span>
          <span class="outcome-val outcome-val--cyan">${confidencePct}%</span>
        </li>`;
  }

  return `
    <div class="scorecard-section scorecard-outcome">
      <span class="scorecard-section-label">MISSION OUTCOME SUMMARY</span>
      <p class="outcome-loop">Alert → Investigation → Evidence → Decision → Consequence → Reward</p>
      <ul class="outcome-rows">

        <li class="outcome-row">
          <span class="outcome-key">Alert Received</span>
          <span class="outcome-val">${escapeHtml(alertTitle)}</span>
        </li>

        <li class="outcome-row outcome-row--block">
          <span class="outcome-key">Evidence Collected</span>
          <span class="outcome-val">${evidenceHTML}</span>
        </li>

        <li class="outcome-row">
          <span class="outcome-key">Decision Taken</span>
          <span class="outcome-val${kindClass}">${escapeHtml(decisionLabel)}</span>
        </li>

        <li class="outcome-row outcome-row--block">
          <span class="outcome-key">Consequence</span>
          <span class="outcome-val">${escapeHtml(consequence)}</span>
        </li>

        <li class="outcome-row">
          <span class="outcome-key">Final Threat Level</span>
          <span class="outcome-val outcome-val--threat outcome-val--threat-${threat.toLowerCase()}">${escapeHtml(threat)}</span>
        </li>

        <li class="outcome-row">
          <span class="outcome-key">Trust Score Change</span>
          <span class="outcome-val outcome-val--cyan">${deltaText} (now ${trustNow} / 100)</span>
        </li>

        <li class="outcome-row">
          <span class="outcome-key">XP Earned</span>
          <span class="outcome-val outcome-val--cyan">+${xp} XP</span>
        </li>

        <li class="outcome-row">
          <span class="outcome-key">Tools Used</span>
          <span class="outcome-val">${escapeHtml(toolsText)}</span>
        </li>

        <li class="outcome-row outcome-row--block">
          <span class="outcome-key">Manager Final Feedback</span>
          <span class="outcome-val outcome-val--manager">${escapeHtml(managerFinal)}</span>
        </li>
${challengeRows}

        <li class="outcome-row outcome-row--section">
          <span class="outcome-key outcome-key--section">Mission Preparation</span>
        </li>
${buildBriefingSummaryHTML(missionId)}

      </ul>
    </div>
  `;
}

/** Render the "Available Tools" panel for the given mission id. */
function renderAvailableTools(missionId) {
  const mid    = missionId || getActiveMissionId();
  const hostId = mid === "mission-003" ? "m3ToolsPanel" : mid === "mission-002" ? "m2ToolsPanel" : "toolsPanel";
  const host   = document.getElementById(hostId);
  if (!host) return;
  const defs  = TOOL_DEFINITIONS[mid] || [];
  const state = toolStateByMission[mid] || {};

  const items = defs.map((t) => {
    const s = state[t.id] || "locked";
    return `
      <li class="tool-item tool-item--${s}">
        <div class="tool-item-head">
          <span class="tool-item-name">${escapeHtml(t.name)}</span>
          <span class="tool-item-pill">${toolStateLabel(s)}</span>
        </div>
        <p class="tool-item-desc">${escapeHtml(t.description)}</p>
      </li>
    `;
  }).join("");

  host.innerHTML = `
    <h3 class="objectives-title">Available Tools</h3>
    <p class="tools-caption">Tools unlock as your investigation progresses.</p>
    <ul class="tools-list">${items}</ul>
  `;
}

/* ============================================================
   Milestone 24B — Threat Level Meter (Phase B)
   ------------------------------------------------------------
   The threat level meter prepares the platform for future
   decision consequences. Each mission tracks a single threat
   level that rises when fresh indicators of compromise are
   surfaced (e.g. reading a suspicious file, finding open
   services) and falls when the analyst takes a corrective
   step (submitting a finding, completing a review, finishing
   the mission). Phase B systems (trust score, dynamic
   manager reactions, decision branching) will read from
   threatLevelByMission to react to investigation pressure.

   Levels (ordered low → severe):
     "Low" | "Medium" | "High" | "Critical"
   ============================================================ */
const THREAT_LEVELS = ["Low", "Medium", "High", "Critical"];
const DEFAULT_THREAT_LEVEL = "Medium";

const threatLevelByMission = {
  "mission-001": DEFAULT_THREAT_LEVEL,
  "mission-002": DEFAULT_THREAT_LEVEL,
  "mission-003": DEFAULT_THREAT_LEVEL,
};

/** Returns true if the given string is a recognized threat level. */
function isValidThreatLevel(level) {
  return typeof level === "string" && THREAT_LEVELS.indexOf(level) >= 0;
}

/** Read the current threat level for a mission (defaults to active mission). */
function getThreatLevel(missionId) {
  const mid = missionId || getActiveMissionId();
  return threatLevelByMission[mid] || DEFAULT_THREAT_LEVEL;
}

/**
 * Set the threat level for a mission. Re-renders the meter and persists.
 * Invalid levels are ignored so callers can pass through user-derived
 * values without crashing. Returns the resolved level.
 */
function setThreatLevel(level, missionId) {
  const mid = missionId || getActiveMissionId();
  if (!isValidThreatLevel(level)) return getThreatLevel(mid);
  const prev = threatLevelByMission[mid];
  threatLevelByMission[mid] = level;
  renderThreatLevel(mid);
  fxPulseThreat(mid); // Milestone 25A — pulse the threat meter on change.
  // Milestone 26A — event toast only when the threat RISES during active play
  // (gated on mission-running so a resume/restore never fires a stale toast).
  if (
    prev &&
    THREAT_LEVELS.indexOf(level) > THREAT_LEVELS.indexOf(prev) &&
    document.body.classList.contains("mission-running")
  ) {
    showEventToast("Threat Rising", `Threat level raised to ${level}.`, "danger");
  }
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
  try { updateOpsStrip(mid); } catch (_) { /* 29A — non-fatal */ }
  return level;
}

/** Reset a mission's threat level back to the starting baseline (Medium). */
function resetThreatLevelForMission(missionId) {
  const mid = missionId || getActiveMissionId();
  threatLevelByMission[mid] = DEFAULT_THREAT_LEVEL;
  renderThreatLevel(mid);
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
}

/** Render the threat-level panel for the given mission id. */
function renderThreatLevel(missionId) {
  const mid    = missionId || getActiveMissionId();
  const hostId = mid === "mission-003" ? "m3ThreatMeter" : mid === "mission-002" ? "m2ThreatMeter" : "threatMeter";
  const host   = document.getElementById(hostId);
  if (!host) return;
  const level    = getThreatLevel(mid);
  const cssLevel = level.toLowerCase();
  // Map level → readable indicator (4 segments filled progressively).
  const filled = Math.max(1, THREAT_LEVELS.indexOf(level) + 1);
  const segments = THREAT_LEVELS.map((_, i) =>
    `<span class="threat-meter-segment ${i < filled ? "threat-meter-segment--on" : ""}"></span>`
  ).join("");

  host.className = `threat-meter threat-meter--${cssLevel}`;
  host.innerHTML = `
    <h3 class="objectives-title">
      Threat Level
      <span class="threat-meter-pill">${escapeHtml(level)}</span>
    </h3>
    <div class="threat-meter-bar" aria-label="Threat level: ${escapeHtml(level)}">
      ${segments}
    </div>
    <p class="threat-meter-caption">
      Threat level changes as the investigation develops.
    </p>
  `;
}

/* UF-5 — Completion "telemetry stabilizing" calm on a mission's threat meter
   when the incident is contained. Visual only — never changes threat state.
   Honors prefers-reduced-motion via the CSS keyframe guard. The trigger is a
   short deferred timer (see notifyAssignmentComplete), tracked so it stays
   cancel-safe on any mission-exit. */
let completionSettleTimer = null;
let settleClassTimer = null;
function clearCompletionSettle() {
  if (completionSettleTimer !== null) { clearTimeout(completionSettleTimer); completionSettleTimer = null; }
  if (settleClassTimer !== null) { clearTimeout(settleClassTimer); settleClassTimer = null; }
}
function settleThreatMeter(missionId) {
  const hostId = missionId === "mission-003" ? "m3ThreatMeter"
              : missionId === "mission-002" ? "m2ThreatMeter" : "threatMeter";
  const host = document.getElementById(hostId);
  if (!host) return;
  host.classList.remove("threat-meter--settling");
  void host.offsetWidth; // restart the animation
  host.classList.add("threat-meter--settling");
  if (settleClassTimer !== null) clearTimeout(settleClassTimer);
  settleClassTimer = window.setTimeout(() => {
    settleClassTimer = null;
    host.classList.remove("threat-meter--settling");
  }, 1300);
}

/* ============================================================
   Milestone 24C — Trust Score System (Phase B)
   ------------------------------------------------------------
   Trust Score prepares the platform for future decision
   consequences and manager reactions. Unlike threat level
   (per-mission, dynamic) and evidence (per-mission, additive),
   trust is a SINGLE GLOBAL score representing the supervisor's
   cumulative confidence in the analyst across the whole course.
   It rises when the student demonstrates careful, correct
   analyst work (correct findings, correct quiz answers,
   completed missions) and is intentionally NOT reset on a
   mission restart — only "Clear Saved Progress" zeroes it.
   Phase B systems (decision branching, dynamic manager tone,
   alert loop) will read getTrustScore() to react.

   Range: 0 – 100, starting at 50.
   ============================================================ */
const DEFAULT_TRUST_SCORE = 50;
const TRUST_MIN = 0;
const TRUST_MAX = 100;
let trustScore = DEFAULT_TRUST_SCORE;

/** Clamp helper for trust values. */
function clampTrust(n) {
  if (typeof n !== "number" || !isFinite(n)) return trustScore;
  return Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(n)));
}

/** Read the current trust score (0–100). */
function getTrustScore() {
  return trustScore;
}

/** Set the trust score to an absolute value. Clamps, re-renders, persists. */
function setTrustScore(value) {
  trustScore = clampTrust(value);
  renderTrustScore();
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
  return trustScore;
}

/** Increase trust by `amount` (default 10). Caps at 100. */
function increaseTrustScore(amount) {
  const delta = typeof amount === "number" && isFinite(amount) ? amount : 10;
  const result = setTrustScore(trustScore + delta);
  fxPulseTrust(); // Milestone 25A — pulse the trust meter on a gain.
  return result;
}

/** Decrease trust by `amount` (default 10). Floors at 0. */
function decreaseTrustScore(amount) {
  const delta = typeof amount === "number" && isFinite(amount) ? amount : 10;
  return setTrustScore(trustScore - delta);
}

/** Reset trust score to the demo baseline (50). Used by Clear Saved Progress. */
function resetTrustScoreForDemo() {
  trustScore = DEFAULT_TRUST_SCORE;
  renderTrustScore();
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
  return trustScore;
}

/**
 * Render the Trust Score panel into both #trustScore (M1 dashboard) and
 * #m2TrustScore (M2 dashboard). The score is global, so both panels show
 * the same value — whichever dashboard is currently visible will reflect
 * the latest change. Safe to call before either panel exists (no-op).
 */
function renderTrustScore() {
  const tier =
    trustScore >= 75 ? "high"   :
    trustScore >= 50 ? "medium" :
    trustScore >= 25 ? "low"    : "critical";
  const pct = Math.max(0, Math.min(100, trustScore));

  ["trustScore", "m2TrustScore"].forEach((hostId) => {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.className = `trust-score trust-score--${tier}`;
    host.innerHTML = `
      <h3 class="objectives-title">
        Trust Score
        <span class="trust-score-pill">${trustScore} / 100</span>
      </h3>
      <div class="trust-score-bar" aria-label="Trust score: ${trustScore} out of 100">
        <div class="trust-score-bar-fill" style="width: ${pct}%;"></div>
      </div>
      <p class="trust-score-caption">
        Manager confidence in your investigation work.
      </p>
    `;
  });
}

/* ============================================================
   Milestone 24D — Decision Consequence System (Phase B)
   ------------------------------------------------------------
   The decision system creates consequences and prepares the
   platform for the addictive alert-investigate-decide-reward
   loop. Each mission reaches a decision point after evidence
   has been gathered. The analyst then chooses an action; the
   choice affects Trust Score, Threat Level, the manager's tone,
   and whether the mission advances to the next step.

   Decision kinds:
     - "correct"     → +10 trust, eases threat, advances flow
     - "acceptable"  → no trust change, keeps threat, advances
     - "poor"        → -10 trust, raises threat, does NOT
                        advance — the manager guides the
                        student back to make a better choice
                        (mission cannot be failed by this).

   The decision the student ultimately commits to (the one
   that advanced the flow) is recorded for the scorecard.
   ============================================================ */

/** Action catalog. `advance: true` means correct/acceptable → unlock next step. */
const DECISION_ACTIONS = {
  /* ---------- Mission 1 (Milestone 28A — Blue Team response options) ---------- */
  "m1-escalate": {
    missionId: "mission-001",
    label:     "Escalate immediately to lead analyst",
    kind:      "correct",
    trustDelta: +10,
    threatLevel: "Medium",
    managerMsg: "Good judgment. Early escalation helps contain credential attacks.",
    consequence: "Lead analyst briefed early; containment was coordinated before the threat could spread.",
    advance: true,
  },
  "m1-continue": {
    missionId: "mission-001",
    label:     "Continue gathering evidence silently",
    kind:      "acceptable",
    trustDelta: +2,
    threatLevel: "High",
    managerMsg: "More evidence helps, but delayed containment can increase operational risk.",
    consequence: "Investigation continued quietly; additional suspicious activity surfaced before containment.",
    advance: true,
  },
  "m1-isolate": {
    missionId: "mission-001",
    label:     "Isolate the workstation",
    kind:      "correct",
    trustDelta: +6,
    threatLevel: "Low",
    managerMsg: "Workstation isolated. Threat spread reduced.",
    consequence: "Workstation isolated from the network; threat spread reduced, though some evidence sources went offline.",
    advance: true,
  },
  "m1-ignore": {
    missionId: "mission-001",
    label:     "Ignore for now",
    kind:      "poor",
    trustDelta: -10,
    threatLevel: "Critical",
    managerMsg: "We cannot ignore possible credential theft activity.",
    consequence: "Manager flagged the dismissal as risky. Choose a safer action before continuing.",
    advance: false,
  },

  /* ---------- Mission 2 (Milestone 31A — Blue Team network response) ----------
     Four options, presented A/B/C/D to mirror Mission 1's decision moment:
       A recommend  — correct (decisive, rewarded)
       B ignore     — poor    (no advance; re-decide)
       C shut-down  — acceptable (advances but blunt/over-reactive, not rewarded)
       D continue   — poor    (scope drift; no advance; re-decide)                */
  "m2-recommend": {
    missionId: "mission-002",
    label:     "Recommend a security review of the exposed services",
    kind:      "correct",
    trustDelta: +10,
    threatLevel: "Medium",
    managerMsg: "Good recommendation. Exposed services should be reviewed for secure configuration.",
    consequence: "Security review queued for the exposed services; the right teams were engaged proportionately.",
    advance: true,
  },
  "m2-ignore": {
    missionId: "mission-002",
    label:     "Ignore the open services for now",
    kind:      "poor",
    trustDelta: -10,
    threatLevel: "High",
    managerMsg: "Open services should not be ignored. They increase attack surface if poorly secured.",
    consequence: "Manager flagged the dismissal as risky. Try a safer action before continuing.",
    advance: false,
  },
  "m2-shutdown": {
    missionId: "mission-002",
    label:     "Shut down all services on the host immediately",
    kind:      "acceptable",
    trustDelta: 0,
    threatLevel: "Medium",
    managerMsg: "That stops the exposure, but pulling every service offline is heavy-handed and disrupts the business. A targeted review is usually better.",
    consequence: "All services were taken offline — the exposure stopped, but the blunt response caused avoidable disruption.",
    advance: true,
  },
  "m2-continue": {
    missionId: "mission-002",
    label:     "Continue scanning unrelated hosts",
    kind:      "poor",
    trustDelta: -6,
    threatLevel: "High",
    managerMsg: "Stay focused — the exposed host in front of you needs a recommendation before you widen the scan.",
    consequence: "Scope drifted to unrelated hosts while the exposed services sat unaddressed.",
    advance: false,
  },

  /* ---------- Mission 3 (Reconnaissance Detection — Blue Team response) -------
     Four options, A/B/C/D, mirroring Mission 2's decision moment:
       A recommend  — correct (report & monitor the scanning source)
       B ignore     — poor    (no advance; re-decide)
       C shutdown   — acceptable (block the source — stops it, but blunt)
       D continue   — poor    (dismiss as normal traffic; no advance)            */
  "m3-recommend": {
    missionId: "mission-003",
    label:     "Report the source and recommend heightened monitoring",
    kind:      "correct",
    trustDelta: +10,
    threatLevel: "Medium",
    managerMsg: "Exactly right. Reconnaissance is an early warning — reporting the source and watching it closely is the proportionate call.",
    consequence: "The scanning source was reported and monitoring was increased; the team is ready before any follow-on attack.",
    advance: true,
  },
  "m3-ignore": {
    missionId: "mission-003",
    label:     "Ignore the scanning activity for now",
    kind:      "poor",
    trustDelta: -10,
    threatLevel: "High",
    managerMsg: "Reconnaissance should never be ignored — it is often the first stage of a real attack.",
    consequence: "Manager flagged the dismissal as risky. Try a safer action before continuing.",
    advance: false,
  },
  "m3-shutdown": {
    missionId: "mission-003",
    label:     "Block the source IP at the firewall immediately",
    kind:      "acceptable",
    trustDelta: 0,
    threatLevel: "Medium",
    managerMsg: "Blocking stops this source, but a determined attacker just switches IPs. Reporting and monitoring usually teaches you more.",
    consequence: "The source IP was blocked at the firewall — the probing stopped, but the blunt response gave up visibility into the attacker.",
    advance: true,
  },
  "m3-continue": {
    missionId: "mission-003",
    label:     "Dismiss it as normal internet background traffic",
    kind:      "poor",
    trustDelta: -6,
    threatLevel: "High",
    managerMsg: "A repeated, targeted scan against your own host is not background noise. Look again before you dismiss it.",
    consequence: "The repeated scan was written off as noise while the source kept mapping the network.",
    advance: false,
  },
};

/** Final committed decision per mission (the one that advanced the flow). */
let decisionTaken = {};      // { "mission-001": "m1-escalate", ... }
/** Has the decision flow advanced for this mission? (gates re-show) */
let decisionAdvanced = {};   // { "mission-001": true, ... }

/** Map missionId → host DOM id for the decision panel. */
function decisionHostId(missionId) {
  return missionId === "mission-003" ? "m3DecisionActions" : missionId === "mission-002" ? "m2DecisionActions" : "decisionActions";
}

/**
 * Reveal the Decision Actions panel for `missionId`. Called when the
 * mission reaches its decision point (after evidence is collected).
 * Idempotent — once a decision has advanced this mission, this is a
 * no-op so re-clicking the trigger command (e.g. `cat suspicious_file.txt`
 * or `review services`) cannot re-summon the panel.
 */
function showDecisionActions(missionId) {
  if (decisionAdvanced[missionId]) return;
  const host = document.getElementById(decisionHostId(missionId));
  if (!host) return;

  // Milestone 28A — Mission 1 decision becomes the screen focus (dim behind).
  if (missionId === "mission-001") document.body.classList.add("m1-blueteam-decision");

  // Idempotency — if the panel is already rendered and waiting on the
  // student (e.g. they made a poor choice and then re-clicked the
  // trigger command like `cat suspicious_file.txt` or `review services`),
  // do NOT rebuild it. Rebuilding would re-enable the poor button and
  // allow trust to be farmed downward by repeating the same bad choice.
  if (host.querySelector(".decision-panel")) {
    host.style.display = "";
    return;
  }

  const actions = Object.entries(DECISION_ACTIONS)
    .filter(([, def]) => def.missionId === missionId);

  // Milestone 28A / 31A — both missions now use the Blue Team operational
  // framing with lettered (A/B/C/D) options.
  const isM1 = missionId === "mission-001";
  const panelClass    = "decision-panel decision-panel--blueteam";
  const decisionLabel = "BLUE TEAM RESPONSE REQUIRED";
  const decisionBadge = "Act now";
  const decisionQ     = isM1
    ? "A workstation appears to be involved in a credential harvesting attempt. What should Blue Team do next?"
    : "A target host is exposing multiple network services. What should Blue Team do next?";

  const LETTERS = ["A", "B", "C", "D", "E", "F"];

  host.style.display = "";
  host.innerHTML = `
    <div class="${panelClass}" data-mission="${missionId}">
      <div class="decision-header">
        <span class="decision-label">${escapeHtml(decisionLabel)}</span>
        <span class="decision-badge">${escapeHtml(decisionBadge)}</span>
      </div>
      <p class="decision-question">
        ${escapeHtml(decisionQ)}
      </p>
      <div class="decision-buttons">
        ${actions.map(([id, def], i) => `
          <button class="decision-btn decision-btn--${def.kind}"
                  type="button"
                  data-decision="${id}">
            <span class="decision-letter">${LETTERS[i] || ""}</span>
            <span class="decision-btn-label">${escapeHtml(def.label)}</span>
          </button>
        `).join("")}
      </div>
      <div class="decision-feedback" data-feedback style="display:none;"></div>
    </div>
  `;

  host.querySelectorAll(".decision-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleDecisionAction(btn.getAttribute("data-decision"))
    );
  });

  // Milestone 24E — alert moves into Decision Required when the
  // student is presented with the consequence choices.
  markAlertDecisionRequired(missionId);

  // Milestone 25B — spotlight the Decision Actions during a live guided run.
  if (igEnabled) igShow(missionId, "decision", host);
}

/** Hide and clear the decision panel for `missionId`. */
function hideDecisionActions(missionId) {
  // Milestone 28A — clear the Mission 1 "decision focus" dim.
  if (missionId === "mission-001") document.body.classList.remove("m1-blueteam-decision");
  const host = document.getElementById(decisionHostId(missionId));
  if (!host) return;
  host.style.display = "none";
  host.innerHTML = "";
}

/**
 * Apply the consequence side-effects for `actionId` — trust delta,
 * threat level, and manager message. Pure data application; does NOT
 * touch the DOM panel or unlock next steps (that's handleDecisionAction).
 */
function applyDecisionConsequence(actionId) {
  const def = DECISION_ACTIONS[actionId];
  if (!def) return null;

  // 1. Trust delta (clamped 0–100 inside the trust helpers).
  if (def.trustDelta > 0)      increaseTrustScore(def.trustDelta);
  else if (def.trustDelta < 0) decreaseTrustScore(-def.trustDelta);

  // 2. Threat level for this mission.
  setThreatLevel(def.threatLevel, def.missionId);

  // 3. Manager message — M1 writes directly to #managerText (the
  //    legacy setManagerMessage only accepts MANAGER_MESSAGES keys);
  //    M2 has a raw-text helper.
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage(def.missionId, def.managerMsg);

  return def;
}

/**
 * Handle a click on a Decision Action button. Applies the consequence,
 * shows inline feedback, and — for correct/acceptable actions — hides
 * the panel and unlocks the next mission step. Poor actions disable
 * just the poor button (so trust cannot be farmed downward) but keep
 * the other choices enabled so the student can make a better call.
 */
function handleDecisionAction(actionId) {
  const def = DECISION_ACTIONS[actionId];
  if (!def) return;
  if (decisionAdvanced[def.missionId]) return; // already resolved
  try { trackGameEvent("blue_team_decision_made", { assignment_id: def.missionId, action: actionId }); } catch (_) { /* non-fatal */ }

  const host = document.getElementById(decisionHostId(def.missionId));
  if (!host) return;

  // Idempotency — if this specific button has already been clicked,
  // don't re-apply its consequence.
  const btn = host.querySelector(`.decision-btn[data-decision="${actionId}"]`);
  if (btn && btn.disabled) return;

  // Milestone 28A — Mission 1 Blue Team submit-delay tension. Disable the
  // panel, show "Submitting Blue Team recommendation..." for 700–1400ms, then
  // resolve. Mission 2 resolves immediately (unchanged). The delay timer is
  // cancel-safe (cleared on every mission-exit via endGuidedRun).
  if (def.missionId === "mission-001") {
    if (m1DecisionPending) return; // a submit is already in flight
    m1DecisionPending = true;
    host.querySelectorAll(".decision-btn").forEach((b) => { b.disabled = true; });
    if (btn) btn.classList.add("decision-btn--chosen");
    const fb = host.querySelector("[data-feedback]");
    if (fb) {
      fb.style.display = "";
      fb.className   = "decision-feedback decision-feedback--pending";
      fb.textContent = "Submitting Blue Team recommendation...";
    }
    const delay = 700 + Math.floor(Math.random() * 700); // 700–1400ms
    clearM1DecisionTimer();
    m1DecisionTimer = window.setTimeout(() => {
      m1DecisionTimer = null;
      m1DecisionPending = false;
      resolveDecisionAction(actionId);
    }, delay);
    return;
  }

  // Mission 2 — resolve immediately (preserve existing behavior).
  resolveDecisionAction(actionId);
}

/**
 * Apply a decision's consequences, feedback, and flow advance. Split out
 * from handleDecisionAction (Milestone 28A) so Mission 1 can interpose a
 * "Submitting Blue Team recommendation..." delay before this runs.
 */
function resolveDecisionAction(actionId) {
  const def = DECISION_ACTIONS[actionId];
  if (!def) return;
  if (decisionAdvanced[def.missionId]) return; // already resolved

  const host = document.getElementById(decisionHostId(def.missionId));
  if (!host) return;
  const btn = host.querySelector(`.decision-btn[data-decision="${actionId}"]`);

  applyDecisionConsequence(actionId);

  // Milestone 24F — dynamic manager reaction keyed to decision quality.
  // correct → decision_correct, poor → decision_poor, acceptable →
  // decision_neutral. Scripted strings only — no AI.
  const DECISION_EVENT_BY_KIND = {
    correct:    "decision_correct",
    poor:       "decision_poor",
    acceptable: "decision_neutral",
  };
  const reactionEvent = DECISION_EVENT_BY_KIND[def.kind];
  if (reactionEvent) updateManagerReaction(reactionEvent, { missionId: def.missionId });

  // Inline feedback inside the panel.
  const fb = host.querySelector("[data-feedback]");
  if (fb) {
    fb.style.display = "";
    fb.className     = `decision-feedback decision-feedback--${def.kind}`;
    fb.textContent   = def.managerMsg;
  }

  // Disable the button the student just chose so the same consequence
  // cannot be re-triggered. Mark with a state class for styling.
  if (btn) {
    btn.disabled = true;
    btn.classList.add("decision-btn--chosen");
  }

  if (def.advance) {
    // Correct or acceptable → record final decision, advance the flow.
    decisionTaken[def.missionId]    = actionId;
    decisionAdvanced[def.missionId] = true;

    // Milestone 24E — spec #11: a CORRECT decision moves the alert
    // into Contained. Acceptable decisions advance the flow but the
    // alert stays in Decision Required until mission completion
    // ("Alert Resolved").
    if (def.kind === "correct") {
      markAlertContained(def.missionId);
      // Stage 1 — blue-team response to a correct escalation (Mission 1).
      if (def.missionId === "mission-001") {
        // Milestone 28A — the consequence differs by the action chosen.
        if (actionId === "m1-isolate") {
          triggerBlueTeamResponse("Workstation isolated — threat spread reduced.");
          updateContainmentProgress("mission-001", 20, {
            stepId: "isolate",
            incident: "Containing",
            assignment: "Isolate the workstation",
            caption: "Workstation isolated from the network.",
          });
          showBlueTeamUpdate("mission-001", "Workstation isolated. Threat spread reduced.");
          containThreatActivity("mission-001");
        } else {
          triggerBlueTeamResponse("Suspicious credential activity contained.");
          // Stage 2 — escalation is the decisive containment step.
          updateContainmentProgress("mission-001", 30, {
            stepId: "escalate",
            incident: "Escalating",
            assignment: "Escalate to lead analyst",
            caption: "Incident escalated to the lead analyst.",
          });
          showBlueTeamUpdate("mission-001", "Incident escalated to lead analyst.");
          // Stage 3 — a correct, decisive call interrupts the adversary's spread.
          containThreatActivity("mission-001");
        }
      } else if (def.missionId === "mission-002" || def.missionId === "mission-003") {
        // Stage 2 (Mission 2 / Mission 3) — escalation is the decisive containment step.
        const isM3 = def.missionId === "mission-003";
        updateContainmentProgress(def.missionId, 30, {
          stepId: isM3 ? "m3-escalate" : "m2-escalate",
          incident: "Escalating",
          assignment: isM3 ? "Recommend security review" : "Escalate to lead analyst",
          caption: isM3
            ? "Reconnaissance escalated for security review."
            : "Incident escalated to the lead analyst.",
        });
        showBlueTeamUpdate(
          def.missionId,
          isM3
            ? "Reconnaissance escalated for security review."
            : "Incident escalated to lead analyst.",
          { toast: true }
        );
        // Stage 3 — a correct, decisive call interrupts the adversary's spread.
        containThreatActivity(def.missionId);
        // Milestone 31A — cinematic beat for the correct recommendation.
        showIncidentInterruption("containment-success", { force: true });
      }
    }

    // Milestone 31A (Mission 2) — the "shut down all services" option is
    // ACCEPTABLE: it advances and stops the exposure, but bluntly (no trust
    // reward) and with some containment credit.
    if (def.kind === "acceptable" && (def.missionId === "mission-002" || def.missionId === "mission-003")) {
      const isM3 = def.missionId === "mission-003";
      updateContainmentProgress(def.missionId, 20, {
        stepId: isM3 ? "m3-block" : "m2-shutdown",
        incident: "Containing",
        assignment: isM3 ? "Source IP blocked" : "Services taken offline",
        caption: isM3
          ? "Source IP blocked at the firewall — probing stopped."
          : "All services taken offline — exposure stopped.",
      });
      showBlueTeamUpdate(
        def.missionId,
        isM3
          ? "Source IP blocked at the firewall — probing stopped."
          : "All services taken offline — exposure stopped.",
        { toast: true }
      );
      containThreatActivity(def.missionId);
      showIncidentInterruption("containment-success", { force: true });
    }

    // Milestone 28B — record a decision-specific Incident Timeline entry and
    // kick off the reactive incident evolution (delayed, believable beats that
    // make the student feel their choice changed what happened next).
    if (def.missionId === "mission-001") {
      const M1_DECISION_TIMELINE = {
        "m1-escalate": "Escalation initiated",
        "m1-isolate":  "Workstation isolated",
        "m1-continue": "Investigation continued quietly",
      };
      if (M1_DECISION_TIMELINE[actionId]) {
        addTimelineEvent("mission-001", M1_DECISION_TIMELINE[actionId]);
      }
      triggerIncidentEvolution(actionId);
    }

    try { saveProgress(); } catch (_) { /* non-fatal */ }

    // Brief pause so the student reads the feedback, then advance.
    setTimeout(() => {
      hideDecisionActions(def.missionId);
      if (def.missionId === "mission-003") {
        renderM3AnalystReview();
      } else if (def.missionId === "mission-002") {
        renderM2AnalystReview();
      } else {
        showFindingPanel();
      }
    }, 1100);
  } else {
    // Poor action — persist trust/threat changes; do NOT advance.
    try { saveProgress(); } catch (_) { /* non-fatal */ }
    // Milestone 28A — the M1 submit-delay disabled ALL buttons; a poor choice
    // does not advance, so re-enable the other options for a better call.
    if (def.missionId === "mission-001") {
      host.querySelectorAll(".decision-btn").forEach((b) => {
        if (!b.classList.contains("decision-btn--chosen")) b.disabled = false;
      });
    }
    // Stage 1 — a poor decision lets the adversary gain ground (Mission 1).
    if (def.missionId === "mission-001") {
      triggerAdversaryEvent("Potential phishing spread risk increasing.", "high", { force: true });
      // Stage 2 — a poor call slows containment (one-time penalty per action).
      updateContainmentProgress("mission-001", -10, {
        stepId: "poor-" + actionId,
        caption: "Containment slowed — the attacker gained ground.",
      });
      showBlueTeamUpdate("mission-001", "Hold position — re-evaluating the threat.");
      // Stage 3 — a poor decision lets the adversary escalate the incident.
      triggerEscalationEvent("mission-001");
      // Milestone 28B — a poor call has a believable LATER consequence (wider
      // phishing exposure) + a scripted manager concern. Kept light — the
      // student still re-decides, so this nudges rather than punishes.
      addTimelineEvent("mission-001", "Threat dismissed — re-evaluating");
      triggerIncidentEvolution("m1-ignore");
    } else if (def.missionId === "mission-002" || def.missionId === "mission-003") {
      // Milestone 31A — count poor M2/M3 decision attempts for the outcome tier.
      if (def.missionId === "mission-003") m3DecisionDrift++;
      else m2DecisionDrift++;
      try { saveProgress(); } catch (_) { /* non-fatal */ }
      // Stage 2 (Mission 2 / Mission 3) — a poor call slows network containment.
      updateContainmentProgress(def.missionId, -10, {
        stepId: "poor-" + actionId,
        caption: "Containment slowed — the attacker gained ground.",
      });
      showBlueTeamUpdate(def.missionId, "Hold position — re-evaluating the threat.");
      // Stage 3 — a poor decision lets the adversary escalate the incident.
      triggerEscalationEvent(def.missionId);
      // Milestone 31A — cinematic beat for a poor network decision.
      showIncidentInterruption("additional-targeting", { force: true });
    }
  }
}

/** Reset decision state for a mission. Used by resetMission / resetMission2. */
function resetDecisionForMission(missionId) {
  delete decisionTaken[missionId];
  delete decisionAdvanced[missionId];
  hideDecisionActions(missionId);
}

/** Build the "Decision Taken" + "Consequence" scorecard rows for a mission. */
function renderDecisionScorecardRows(missionId) {
  const actionId = decisionTaken[missionId];
  const def = actionId ? DECISION_ACTIONS[actionId] : null;
  if (!def) return "";
  return `
          <li class="scorecard-row">
            <span class="scorecard-key">Decision Taken</span>
            <span class="scorecard-val scorecard-val--cyan">${escapeHtml(def.label)}</span>
          </li>
          <li class="scorecard-row scorecard-row--wide">
            <span class="scorecard-key">Consequence</span>
            <span class="scorecard-val">${escapeHtml(def.consequence)}</span>
          </li>`;
}

/* ============================================================
   Milestone 24E — Alert Loop System (Phase B)
   ------------------------------------------------------------
   The alert loop system creates the foundation for a real
   SOC-style mission cycle. Each mission opens with a SIEM-style
   alert; the alert moves through states as the student works
   the loop:

     New → Investigating → Evidence Found → Decision Required
         → Contained → Resolved

   Wiring:
     - beginMission / beginMission2  → markAlertInvestigating
     - addEvidence (first time)       → state "Evidence Found"
     - showDecisionActions            → markAlertDecisionRequired
     - correct decision (kind=correct)→ markAlertContained
     - completeMission / M2 complete  → "Alert Resolved" badge
     - resetMission / resetMission2   → clearAlert + recreate
   ============================================================ */

/** Allowed alert states. The order matches the loop's natural progression. */
const ALERT_STATES = ["New", "Investigating", "Evidence Found",
                      "Decision Required", "Contained", "Resolved"];

/** Static alert definitions per mission. Pulled in by createMissionAlert. */
const ALERT_DEFINITIONS = {
  "mission-001": {
    title:    "Suspicious File Detected",
    message:  "A workstation contains a file requesting password sharing with an unknown external email.",
    severity: "Medium",
  },
  "mission-002": {
    title:    "Unknown Network Exposure",
    message:  "A target host is exposing multiple network services that require review.",
    severity: "Medium",
  },
  "mission-003": {
    title:    "Suspicious External Activity",
    message:  "An unknown external source is repeatedly contacting internal services. Investigate for reconnaissance.",
    severity: "Medium",
  },
};

/** Per-mission alert objects: { title, message, severity, state }. */
let alertByMission = {};

/** Map missionId → DOM host id for the Alert Center panel. */
function alertHostId(missionId) {
  return missionId === "mission-003" ? "m3AlertCenter" : missionId === "mission-002" ? "m2AlertCenter" : "alertCenter";
}

/**
 * Build (or rebuild) the alert object for `missionId` from its static
 * definition and render it. Called by beginMission/beginMission2 and
 * by the mission-reset helpers. Idempotent — re-creating an alert
 * starts it back in the "New" state.
 */
function createMissionAlert(missionId) {
  const def = ALERT_DEFINITIONS[missionId];
  if (!def) return null;
  alertByMission[missionId] = {
    title:    def.title,
    message:  def.message,
    severity: def.severity,
    state:    "New",
  };
  renderAlertCenter(missionId);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
  return alertByMission[missionId];
}

/** Internal — set the alert's state if the alert exists, then re-render. */
function setAlertState(missionId, state) {
  const a = alertByMission[missionId];
  if (!a) return;
  if (!ALERT_STATES.includes(state)) return;
  a.state = state;
  renderAlertCenter(missionId);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Transition helpers required by the spec. */
function markAlertInvestigating(missionId) {
  setAlertState(missionId || getActiveMissionId(), "Investigating");
}
function markAlertEvidenceFound(missionId) {
  setAlertState(missionId || getActiveMissionId(), "Evidence Found");
}
function markAlertDecisionRequired(missionId) {
  setAlertState(missionId || getActiveMissionId(), "Decision Required");
}
function markAlertContained(missionId) {
  setAlertState(missionId || getActiveMissionId(), "Contained");
}
function markAlertResolved(missionId) {
  setAlertState(missionId || getActiveMissionId(), "Resolved");
}

/** Update the alert's severity badge (Low / Medium / High / Critical). */
function updateAlertSeverity(severity, missionId) {
  const mid = missionId || getActiveMissionId();
  const a   = alertByMission[mid];
  if (!a) return;
  const allowed = ["Low", "Medium", "High", "Critical"];
  if (!allowed.includes(severity)) return;
  a.severity = severity;
  renderAlertCenter(mid);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Remove the alert for a mission and hide its panel. */
function clearAlert(missionId) {
  const mid = missionId || getActiveMissionId();
  delete alertByMission[mid];
  const host = document.getElementById(alertHostId(mid));
  if (host) {
    host.style.display = "none";
    host.innerHTML     = "";
  }
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Lowercase / no-space slug for CSS state classes. */
function alertStateSlug(state) {
  return String(state || "").toLowerCase().replace(/\s+/g, "-");
}

/**
 * Render the Alert Center panel for `missionId`. When the state is
 * "Resolved", show the "Alert Resolved" treatment per spec #12.
 */
function renderAlertCenter(missionId) {
  const mid  = missionId || getActiveMissionId();
  const host = document.getElementById(alertHostId(mid));
  if (!host) return;
  const a    = alertByMission[mid];
  if (!a) {
    host.style.display = "none";
    host.innerHTML     = "";
    return;
  }

  const sevSlug   = String(a.severity || "Medium").toLowerCase();
  const stateSlug = alertStateSlug(a.state);
  const isResolved = a.state === "Resolved";

  host.style.display = "";
  host.innerHTML = `
    <section class="alert-center alert-center--${sevSlug} alert-center--state-${stateSlug}"
             aria-live="polite">
      <header class="alert-center-header">
        <span class="alert-center-label">Alert Center</span>
        <span class="alert-center-severity">${escapeHtml(a.severity)}</span>
      </header>
      <h3 class="alert-center-title">${escapeHtml(a.title)}</h3>
      <p class="alert-center-message">${escapeHtml(a.message)}</p>
      <div class="alert-center-state-row">
        <span class="alert-center-state-key">Status</span>
        <span class="alert-center-state-pill alert-center-state-pill--${stateSlug}">
          ${isResolved ? "Alert Resolved" : escapeHtml(a.state)}
        </span>
      </div>
    </section>
  `;
}

/* ------------------------------------------------------------
   Milestone 24E-2 — Interactive Alert Modal
   ------------------------------------------------------------
   When a mission's alert is created in the "New" state, a modal
   pops over the dashboard with the alert details and a single
   [ ▶ Investigate ] button. The student must click it to
   acknowledge the alert — only then does the alert transition
   to "Investigating" and the mission proceed.

   This makes the "New" state meaningful (otherwise it was only
   visible for a frame) and mirrors how a real SOC analyst
   acknowledges an incoming SIEM alert before working it.

   Modal behavior:
     - Forced acknowledgement: ESC and backdrop click do nothing.
     - Focus moves to the Investigate button on open.
     - On reload while alert is still "New", the modal re-fires
       the next time the dashboard is entered (state is the
       source of truth — not a session flag).
   ============================================================ */

let _previousFocus = null;

/**
 * Show the modal if and only if the alert exists and is in "New".
 * No-op for any other state, so callers can fire-and-forget on
 * dashboard entry / mission begin.
 */
function showAlertModal(missionId) {
  const mid = missionId || getActiveMissionId();
  const a   = alertByMission[mid];
  if (!a || a.state !== "New") return;

  const root = document.getElementById("alertModalRoot");
  if (!root) return;
  if (root.querySelector(".alert-modal")) return; // already open

  const sevSlug = String(a.severity || "Medium").toLowerCase();
  _previousFocus = document.activeElement;

  root.style.display = "";
  root.innerHTML = `
    <div class="alert-modal-backdrop" data-modal-backdrop></div>
    <div class="alert-modal alert-modal--${sevSlug}"
         role="dialog"
         aria-modal="true"
         aria-labelledby="alertModalTitle"
         aria-describedby="alertModalMessage"
         data-mission="${mid}">
      <header class="alert-modal-header">
        <span class="alert-modal-label">⚠ Incoming Alert</span>
        <span class="alert-modal-severity">${escapeHtml(a.severity)}</span>
      </header>
      <h2 id="alertModalTitle" class="alert-modal-title">${escapeHtml(a.title)}</h2>
      <p  id="alertModalMessage" class="alert-modal-message">${escapeHtml(a.message)}</p>
      <div class="alert-modal-meta">
        <span class="alert-modal-meta-key">Status</span>
        <span class="alert-modal-state-pill">New — awaiting acknowledgement</span>
      </div>
      <button id="alertModalInvestigateBtn"
              class="alert-modal-investigate"
              type="button"
              data-mission="${mid}">
        ▶&nbsp; Investigate
      </button>
    </div>
  `;

  // Forced acknowledgement — ESC and backdrop click are ignored.
  // Capture-phase listener on the modal root swallows Escape so it
  // can't bubble to any global handlers.
  const swallowEsc = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); }
  };
  root._escHandler = swallowEsc;
  document.addEventListener("keydown", swallowEsc, true);

  // Lock body scroll so the dashboard can't be peeked behind the modal.
  document.body.classList.add("alert-modal-open");

  const btn = document.getElementById("alertModalInvestigateBtn");
  if (btn) {
    btn.addEventListener("click", () => {
      const targetMid = btn.getAttribute("data-mission") || mid;
      closeAlertModal();
      markAlertInvestigating(targetMid);
    });
    // Move focus to the only actionable control.
    try { btn.focus(); } catch (_) { /* non-fatal */ }
  }
}

/** Tear down the modal and restore page state. Idempotent. */
function closeAlertModal() {
  const root = document.getElementById("alertModalRoot");
  if (!root) return;
  if (root._escHandler) {
    document.removeEventListener("keydown", root._escHandler, true);
    root._escHandler = null;
  }
  root.innerHTML     = "";
  root.style.display = "none";
  document.body.classList.remove("alert-modal-open");
  if (_previousFocus && typeof _previousFocus.focus === "function") {
    try { _previousFocus.focus(); } catch (_) { /* non-fatal */ }
  }
  _previousFocus = null;
}

/** Read the current alert state for a mission (for tests / scorecard). */
function getAlertState(missionId) {
  const mid = missionId || getActiveMissionId();
  return alertByMission[mid] ? alertByMission[mid].state : null;
}

/** Build the "Alert" + "Alert Status" scorecard rows for a mission. */
function renderAlertScorecardRows(missionId) {
  const a = alertByMission[missionId];
  if (!a) return "";
  const stateSlug = alertStateSlug(a.state);
  const stateText = a.state === "Resolved" ? "Alert Resolved" : a.state;
  return `
          <li class="scorecard-row">
            <span class="scorecard-key">Alert</span>
            <span class="scorecard-val scorecard-val--cyan">${escapeHtml(a.title)}</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Alert Status</span>
            <span class="scorecard-val alert-status-val alert-status-val--${stateSlug}">${escapeHtml(stateText)}</span>
          </li>`;
}

/** Returns an array of plain-text evidence strings for a mission. */
function getEvidenceList(missionId) {
  const mid = missionId || getActiveMissionId();
  return (evidenceLog[mid] || []).map((e) => e.text);
}

/** Renders the evidence section that appears inside completion scorecards. */
function buildEvidenceScorecardHTML(missionId) {
  const items = getEvidenceList(missionId);
  if (!items.length) {
    return `
      <div class="scorecard-section scorecard-evidence scorecard-section--collapsed">
        <span class="scorecard-section-label">EVIDENCE COLLECTED</span>
        <p class="scorecard-evidence-empty">No evidence was recorded during this mission.</p>
      </div>
    `;
  }
  return `
    <div class="scorecard-section scorecard-evidence scorecard-section--collapsed">
      <span class="scorecard-section-label">EVIDENCE COLLECTED</span>
      <ul class="scorecard-skills">
        ${items.map((t) =>
          `<li><span class="scorecard-bullet">▹</span>${escapeHtml(t)}</li>`).join("")}
      </ul>
    </div>
  `;
}

/** Read the saved progress object, or null if nothing/invalid. */
function loadSavedProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (e) {
    // localStorage disabled, quota error, malformed JSON — fail closed.
    return null;
  }
}

/* When true, saveProgress() silently no-ops. Used by clearSavedProgress()
   so the downstream reset helpers (which normally persist) don't immediately
   repopulate STORAGE_KEY after we wiped it. */
let suppressSave = false;

/** Write the current in-memory state to localStorage. Safe no-op on error. */
function saveProgress() {
  if (suppressSave) return;
  try {
    const data = {
      // Phase 3B — monotonic save marker used by cloud restore reconciliation
      // (newest/most-advanced wins; never overwrites more-advanced local state).
      savedAt: new Date().toISOString(),
      studentName,
      xp: currentXP,
      rank: rankNameEl ? rankNameEl.textContent : INITIAL_RANK,
      mission1Complete: !!missionComplete,
      mission2Unlocked: !!missionComplete, // mirrors completion in this build
      // Milestone 22 — Mission 2 completion flag (kept separate from M1).
      mission2Complete: !!mission2Complete,
      // Milestone 24A — persist collected evidence so it survives reload.
      evidence: (typeof evidenceLog === "object" && evidenceLog) ? evidenceLog : {},
      // Milestone 24B — persist per-mission threat level so it survives reload.
      threatLevels: (typeof threatLevelByMission === "object" && threatLevelByMission)
        ? threatLevelByMission : {},
      // Milestone 24C — persist global trust score so it survives reload.
      trustScore: typeof trustScore === "number" ? trustScore : DEFAULT_TRUST_SCORE,
      // Milestone 24D — persist decision system state so it survives reload.
      decisionTaken:    (typeof decisionTaken    === "object" && decisionTaken)    ? decisionTaken    : {},
      decisionAdvanced: (typeof decisionAdvanced === "object" && decisionAdvanced) ? decisionAdvanced : {},
      // Milestone 24E — persist alert state per mission so it survives reload.
      alertByMission: (typeof alertByMission === "object" && alertByMission) ? alertByMission : {},
      // Challenge Layer 1 — persist Evidence Confidence + investigation state
      // so it survives reload. Sets are serialized to arrays.
      m1Confidence,
      m2Confidence,
      m3Confidence,
      m1ConfidenceContributors: Array.from(m1ConfidenceContributors),
      m2ConfidenceContributors: Array.from(m2ConfidenceContributors),
      m3ConfidenceContributors: Array.from(m3ConfidenceContributors),
      // Milestone 31A — Mission 2 Analyst Confidence + reasoning + decision drift.
      m2AnalystConfidence,
      m2ReasoningAnswered: Array.from(m2ReasoningAnswered),
      m2DecisionDrift,
      // Assignment 3 — Analyst Confidence + reasoning + decision drift.
      m3AnalystConfidence,
      m3ReasoningAnswered: Array.from(m3ReasoningAnswered),
      m3DecisionDrift,
      m1FilesReviewed:     Array.from(m1FilesReviewed),
      m1FalseLeadsChecked: Array.from(m1FalseLeadsChecked),
      m1BonusFound,
      // Milestone 27A — Investigative Reasoning Layer (score is recomputed on
      // restore from these + pins, so it isn't persisted directly).
      m1ReasoningCorrect:      Array.from(m1ReasoningCorrect),
      m1ReasoningBonusAwarded,
      // Milestone 33A — persistent career history (the only new persisted state;
      // all reputation/ratings/traits are derived at render, not stored).
      operationalHistory: Array.isArray(operationalHistory) ? operationalHistory : [],
      // Investigation Board — persist pins + pinnable findings + XP guards.
      investigationPins: (typeof investigationPins === "object" && investigationPins) ? investigationPins : {},
      pinnableFindings: {
        "mission-001": Array.from(pinnableFindings["mission-001"]),
        "mission-002": Array.from(pinnableFindings["mission-002"]),
        "mission-003": Array.from(pinnableFindings["mission-003"]),
      },
      pinXpAwarded: Array.from(pinXpAwarded),
      // Milestone 24I — persist Briefing Room state + one-time XP guard.
      briefingReviewed: {
        "mission-001": Array.from(briefingReviewed["mission-001"]),
        "mission-002": Array.from(briefingReviewed["mission-002"]),
        "mission-003": Array.from(briefingReviewed["mission-003"]),
      },
      briefingXpAwarded: Array.from(briefingXpAwarded),
      // Milestone 25B (resume-safe) — persist per-mission "investigation launched"
      // so a mid-mission reload resumes directly instead of re-onboarding.
      missionLaunched: (typeof missionLaunched === "object" && missionLaunched) ? missionLaunched : {},
      // Stage 2 — persist Blue Team / containment state (Mission 1 + Mission 2).
      blueTeamContainment: { ...blueTeamContainment },
      blueTeamSteps: {
        "mission-001": Array.from(blueTeamSteps["mission-001"]),
        "mission-002": Array.from(blueTeamSteps["mission-002"]),
        "mission-003": Array.from(blueTeamSteps["mission-003"]),
      },
      blueTeamRedActive: { ...blueTeamRedActive },
      blueTeamFeeds: {
        "mission-001": blueTeamFeeds["mission-001"].slice(-BLUE_TEAM_FEED_MAX),
        "mission-002": blueTeamFeeds["mission-002"].slice(-BLUE_TEAM_FEED_MAX),
        "mission-003": blueTeamFeeds["mission-003"].slice(-BLUE_TEAM_FEED_MAX),
      },
      // Stage 3 — Adversary Escalation: incident pressure + idle-escalation cap.
      incidentPressure: { ...incidentPressure },
      escalationIdleCount: { ...escalationIdleCount },
      escalationPeak: { ...escalationPeak },
      // Milestone 28A — Incident Timeline (Mission 1) + synthetic clock seq.
      incidentTimeline: {
        "mission-001": Array.isArray(incidentTimeline["mission-001"])
          ? incidentTimeline["mission-001"].slice(-INCIDENT_TIMELINE_MAX) : [],
      },
      incidentTimelineSeq: { "mission-001": incidentTimelineSeq["mission-001"] || 0 },
      // Stage 4 — Containment Actions: which defensive actions were performed.
      containmentActionsUsed: {
        "mission-001": Array.from(containmentActionsUsed["mission-001"]),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateSaveIndicator(true);
    // Phase B0 — best-effort cloud mirror/backup (heavily debounced inside the
    // backend layer). localStorage above is the authoritative save.
    try { queueCloudSync(data); } catch (_) { /* non-fatal */ }
  } catch (e) {
    updateSaveIndicator(false);
  }
}

/** Refreshes the "Progress Saved Locally" pills (landing + dashboard). */
function updateSaveIndicator(saved) {
  const has = saved && !!localStorage.getItem(STORAGE_KEY);
  document.querySelectorAll(".save-indicator").forEach((el) => {
    el.classList.toggle("save-indicator--saved", has);
    el.textContent = has
      ? "✓ Progress Saved Locally"
      : "No saved progress yet";
  });
  // Clear button is only meaningful when there's something to clear
  document.querySelectorAll(".clear-progress-btn").forEach((el) => {
    el.disabled = !has;
  });
}

/**
 * Restore saved progress on page load. Called once from boot() AFTER all
 * DOM references and renderers are wired up.
 *
 * Note: we deliberately do NOT auto-show the completion screen / certificate
 * on reload. Restoring sets the dashboard state to reflect completion
 * (badge = COMPLETE, course progress shows Mission 2 unlocked, XP/rank
 * restored), and the student can Restart Mission to replay if they want.
 */
function restoreSavedProgress() {
  const data = loadSavedProgress();
  if (!data) {
    updateSaveIndicator(false);
    return;
  }

  // 1. Student name — fill input, enable Enter Module button
  if (typeof data.studentName === "string" && data.studentName.trim()) {
    studentName = data.studentName.trim();
    const nameInput = document.getElementById("studentNameInput");
    const enterBtn  = document.getElementById("enterModuleBtn");
    if (nameInput) nameInput.value = studentName;
    if (enterBtn)  enterBtn.disabled = false;
  }

  // 2. XP — restore value and bar width (no animation on initial load)
  if (typeof data.xp === "number" && isFinite(data.xp)) {
    currentXP = Math.max(0, Math.min(data.xp, MAX_XP));
    if (currentXPEl) currentXPEl.textContent = currentXP;
    if (xpBarEl) {
      xpBarEl.style.transition = "none";
      xpBarEl.style.width = `${Math.round((currentXP / MAX_XP) * 100)}%`;
    }
  }

  // 3. Rank
  if (typeof data.rank === "string" && data.rank && rankNameEl) {
    rankNameEl.textContent = data.rank;
    if (data.rank !== INITIAL_RANK) {
      rankNameEl.classList.add("rank-name--upgraded");
    }
  }

  // 4. Mission 1 completion → also unlocks Mission 2 via renderCourseProgress
  if (data.mission1Complete) {
    missionComplete = true;
    if (missionBadge) {
      missionBadge.textContent = "COMPLETE";
      missionBadge.classList.add("mission-status-badge--complete");
    }
    // Mark all tracker steps complete to mirror state
    PROGRESS_STEPS.forEach((s) => completedProgressSteps.add(s.id));
    renderProgressTracker();
    renderCourseProgress();
    // Milestone 22 — returning student: swap M1 primary CTA to "Continue".
    updateMission1CTA();
  }

  // 5. Milestone 22 — Mission 2 completion. Mirror state so the
  //    Course Progress card shows Mission 2 as Completed on reload.
  if (data.mission2Complete) {
    mission2Complete = true;
    // Mark all M2 status entries done so re-entering the M2 dashboard
    // shows the full checklist of ticks (matches what the student saw).
    M2_STATUS.forEach((s) => m2CompletedStatus.add(s.id));
    renderCourseProgress();
  }

  // Assignment 3 completion — mirror M2 so the map shows A3 as completed and
  // re-entering the A3 dashboard shows its full status checklist.
  if (data.mission3Complete) {
    mission3Complete = true;
    M3_STATUS.forEach((s) => m3CompletedStatus.add(s.id));
    renderCourseProgress();
  }

  // 6. Milestone 24A — restore evidence collected during prior sessions.
  //    Filtered to known mission ids so a corrupted/older save can't
  //    inject arbitrary keys into evidenceLog.
  if (data.evidence && typeof data.evidence === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      const arr = data.evidence[mid];
      if (Array.isArray(arr)) {
        evidenceLog[mid] = arr
          .filter((e) => e && typeof e.id === "string" && typeof e.text === "string")
          .map((e) => ({ id: e.id, text: e.text, at: e.at || Date.now() }));
      }
    });
    renderEvidencePanel("mission-001");
    renderEvidencePanel("mission-002");
    renderEvidencePanel("mission-003");
  }

  // 7. Milestone 24B — restore threat levels (validated against THREAT_LEVELS).
  if (data.threatLevels && typeof data.threatLevels === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      const lvl = data.threatLevels[mid];
      if (isValidThreatLevel(lvl)) threatLevelByMission[mid] = lvl;
    });
    renderThreatLevel("mission-001");
    renderThreatLevel("mission-002");
    renderThreatLevel("mission-003");
  }

  // 8. Milestone 24C — restore trust score (clamped to 0–100).
  if (typeof data.trustScore === "number" && isFinite(data.trustScore)) {
    trustScore = clampTrust(data.trustScore);
  }
  renderTrustScore();

  // Stage 2 — restore Blue Team / containment state (Mission 1 + Mission 2),
  // validated. Mission 1 falls back to the legacy pre-generalization keys so
  // existing saves (m1Containment / redTeamActive / m1BlueFeed) survive upgrade.
  restoreBlueTeamMission(data, "mission-001", {
    containment: data.m1Containment,
    steps: data.m1ContainmentSteps,
    red: data.redTeamActive,
    feed: data.m1BlueFeed,
  });
  restoreBlueTeamMission(data, "mission-002", null);
  restoreBlueTeamMission(data, "mission-003", null);
  // Backward-compat: a completed mission is, by definition, fully contained.
  if (missionComplete)  blueTeamContainment["mission-001"] = 100;
  if (mission2Complete) blueTeamContainment["mission-002"] = 100;
  if (mission3Complete) blueTeamContainment["mission-003"] = 100;

  // Stage 3 — restore Adversary Escalation state (incident pressure + idle cap),
  // validated and clamped. A completed mission has zero residual pressure.
  ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
    const p = data.incidentPressure && data.incidentPressure[mid];
    if (typeof p === "number" && isFinite(p)) {
      incidentPressure[mid] = Math.max(0, Math.min(ESCALATION_MAX, Math.round(p)));
    }
    const c = data.escalationIdleCount && data.escalationIdleCount[mid];
    if (typeof c === "number" && isFinite(c)) {
      escalationIdleCount[mid] = Math.max(0, Math.min(ESCALATION_MAX_IDLE_EVENTS, Math.round(c)));
    }
  });
  if (missionComplete)  incidentPressure["mission-001"] = 0;
  if (mission2Complete) incidentPressure["mission-002"] = 0;
  if (mission3Complete) incidentPressure["mission-003"] = 0;

  // Stage 3 — restore escalation peak (clamped); used by the M1 end summary.
  ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
    const pk = data.escalationPeak && data.escalationPeak[mid];
    if (typeof pk === "number" && isFinite(pk)) {
      escalationPeak[mid] = Math.max(0, Math.min(ESCALATION_MAX, Math.round(pk)));
    }
  });

  // Milestone 28A — restore the Incident Timeline (Mission 1), validated.
  incidentTimeline["mission-001"] = [];
  const savedTimeline = data.incidentTimeline && data.incidentTimeline["mission-001"];
  if (Array.isArray(savedTimeline)) {
    savedTimeline
      .filter((e) => e && typeof e.t === "string" && typeof e.label === "string")
      .slice(-INCIDENT_TIMELINE_MAX)
      .forEach((e) => incidentTimeline["mission-001"].push({ t: e.t, label: e.label }));
  }
  const savedSeq = data.incidentTimelineSeq && data.incidentTimelineSeq["mission-001"];
  incidentTimelineSeq["mission-001"] =
    (typeof savedSeq === "number" && isFinite(savedSeq) && savedSeq >= 0)
      ? Math.round(savedSeq)
      : incidentTimeline["mission-001"].length;
  renderIncidentTimeline("mission-001");

  // Stage 4 — restore containment actions used (validated against known ids).
  containmentActionsUsed["mission-001"].clear();
  const savedActions = data.containmentActionsUsed && data.containmentActionsUsed["mission-001"];
  if (Array.isArray(savedActions)) {
    savedActions.forEach((id) => {
      if (CONTAINMENT_ACTIONS["mission-001"][id]) containmentActionsUsed["mission-001"].add(id);
    });
  }

  renderBlueTeamPanel("mission-001");
  renderBlueTeamPanel("mission-002");
  renderBlueTeamPanel("mission-003");
  renderContainmentActions("mission-001"); // Stage 4 — restore action panel.

  // 9. Milestone 24D — restore decision system state. Only known
  //    action ids are accepted; unknown keys are ignored.
  decisionTaken    = {};
  decisionAdvanced = {};
  if (data.decisionTaken && typeof data.decisionTaken === "object") {
    Object.entries(data.decisionTaken).forEach(([mid, actionId]) => {
      if (DECISION_ACTIONS[actionId] && DECISION_ACTIONS[actionId].missionId === mid) {
        decisionTaken[mid] = actionId;
      }
    });
  }
  if (data.decisionAdvanced && typeof data.decisionAdvanced === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      if (data.decisionAdvanced[mid] === true) decisionAdvanced[mid] = true;
    });
  }

  // 10. Milestone 24E — restore alert state per mission. Only known
  //     mission ids and known alert states are accepted; everything
  //     else is ignored so corrupt storage cannot crash the loop.
  alertByMission = {};
  if (data.alertByMission && typeof data.alertByMission === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      const a   = data.alertByMission[mid];
      const def = ALERT_DEFINITIONS[mid];
      if (!a || typeof a !== "object" || !def) return;
      alertByMission[mid] = {
        title:    def.title,
        message:  def.message,
        severity: ["Low", "Medium", "High", "Critical"].includes(a.severity)
                    ? a.severity : def.severity,
        state:    ALERT_STATES.includes(a.state) ? a.state : "New",
      };
      renderAlertCenter(mid);
    });
  }

  // 11. Challenge Layer 1 — restore Evidence Confidence + investigation state.
  //     Values are clamped/validated so corrupt storage cannot break the meters.
  if (typeof data.m1Confidence === "number" && isFinite(data.m1Confidence)) {
    m1Confidence = Math.max(0, Math.min(CONFIDENCE_CAP, data.m1Confidence));
  }
  if (typeof data.m2Confidence === "number" && isFinite(data.m2Confidence)) {
    m2Confidence = Math.max(0, Math.min(CONFIDENCE_CAP, data.m2Confidence));
  }
  if (typeof data.m3Confidence === "number" && isFinite(data.m3Confidence)) {
    m3Confidence = Math.max(0, Math.min(CONFIDENCE_CAP, data.m3Confidence));
  }
  m1ConfidenceContributors.clear();
  if (Array.isArray(data.m1ConfidenceContributors)) {
    data.m1ConfidenceContributors.forEach((k) => {
      if (typeof k === "string") m1ConfidenceContributors.add(k);
    });
  }
  m2ConfidenceContributors.clear();
  if (Array.isArray(data.m2ConfidenceContributors)) {
    data.m2ConfidenceContributors.forEach((k) => {
      if (typeof k === "string") m2ConfidenceContributors.add(k);
    });
  }
  m3ConfidenceContributors.clear();
  if (Array.isArray(data.m3ConfidenceContributors)) {
    data.m3ConfidenceContributors.forEach((k) => {
      if (typeof k === "string") m3ConfidenceContributors.add(k);
    });
  }
  // Milestone 31A — restore Mission 2 Analyst Confidence + reasoning + drift,
  // clamped/validated so corrupt storage cannot break the meter or tier.
  if (typeof data.m2AnalystConfidence === "number" && isFinite(data.m2AnalystConfidence)) {
    m2AnalystConfidence = Math.max(0, Math.min(100, data.m2AnalystConfidence));
  }
  m2ReasoningAnswered.clear();
  if (Array.isArray(data.m2ReasoningAnswered)) {
    data.m2ReasoningAnswered.forEach((k) => {
      if (typeof k === "string" && M2_REASONING[k]) m2ReasoningAnswered.add(k);
    });
  }
  if (typeof data.m2DecisionDrift === "number" && isFinite(data.m2DecisionDrift)) {
    m2DecisionDrift = Math.max(0, data.m2DecisionDrift);
  }
  // Assignment 3 — restore Analyst Confidence + reasoning + drift.
  if (typeof data.m3AnalystConfidence === "number" && isFinite(data.m3AnalystConfidence)) {
    m3AnalystConfidence = Math.max(0, Math.min(100, data.m3AnalystConfidence));
  }
  m3ReasoningAnswered.clear();
  if (Array.isArray(data.m3ReasoningAnswered)) {
    data.m3ReasoningAnswered.forEach((k) => {
      if (typeof k === "string" && M3_REASONING[k]) m3ReasoningAnswered.add(k);
    });
  }
  if (typeof data.m3DecisionDrift === "number" && isFinite(data.m3DecisionDrift)) {
    m3DecisionDrift = Math.max(0, data.m3DecisionDrift);
  }
  m1FilesReviewed.clear();
  if (Array.isArray(data.m1FilesReviewed)) {
    data.m1FilesReviewed.forEach((k) => {
      if (typeof k === "string") m1FilesReviewed.add(k);
    });
  }
  m1FalseLeadsChecked.clear();
  if (Array.isArray(data.m1FalseLeadsChecked)) {
    data.m1FalseLeadsChecked.forEach((k) => {
      if (typeof k === "string") m1FalseLeadsChecked.add(k);
    });
  }
  m1BonusFound     = data.m1BonusFound === true;

  // Milestone 27A — restore Investigative Reasoning state (score recomputed below
  // once pins are also restored). Only accept reasoning keys that exist.
  m1ReasoningCorrect.clear();
  if (Array.isArray(data.m1ReasoningCorrect)) {
    data.m1ReasoningCorrect.forEach((k) => {
      if (typeof k === "string" && M1_REASONING[k]) m1ReasoningCorrect.add(k);
    });
  }
  m1ReasoningBonusAwarded = data.m1ReasoningBonusAwarded === true;

  // Milestone 33A — restore the persistent career history (validated + capped).
  operationalHistory = [];
  if (Array.isArray(data.operationalHistory)) {
    const seen = new Set();
    data.operationalHistory.forEach((e) => {
      if (!e || typeof e !== "object") return;
      if (typeof e.id !== "string" || typeof e.label !== "string") return;
      if (seen.has(e.id)) return;
      seen.add(e.id);
      operationalHistory.push({
        id: e.id,
        label: e.label,
        status: e.status === "success" ? "success" : "warn",
        at: typeof e.at === "number" ? e.at : Date.now(),
      });
    });
    if (operationalHistory.length > OPERATIONAL_HISTORY_MAX) {
      operationalHistory = operationalHistory.slice(-OPERATIONAL_HISTORY_MAX);
    }
  }

  // Investigation Board — restore pins, pinnable findings, and XP guards.
  investigationPins["mission-001"] = {};
  investigationPins["mission-002"] = {};
  investigationPins["mission-003"] = {};
  if (data.investigationPins && typeof data.investigationPins === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      const saved = data.investigationPins[mid];
      if (saved && typeof saved === "object") {
        Object.keys(saved).forEach((key) => {
          const p = saved[key];
          if (p && typeof p === "object") investigationPins[mid][key] = p;
        });
      }
    });
  }
  pinnableFindings["mission-001"].clear();
  pinnableFindings["mission-002"].clear();
  pinnableFindings["mission-003"].clear();
  if (data.pinnableFindings && typeof data.pinnableFindings === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      if (Array.isArray(data.pinnableFindings[mid])) {
        data.pinnableFindings[mid].forEach((k) => {
          if (typeof k === "string") pinnableFindings[mid].add(k);
        });
      }
    });
  }
  pinXpAwarded.clear();
  if (Array.isArray(data.pinXpAwarded)) {
    data.pinXpAwarded.forEach((k) => { if (typeof k === "string") pinXpAwarded.add(k); });
  }
  // Milestone 27A — pins are now restored, so derive Analyst Confidence and paint the meter.
  recomputeM1AnalystScore();
  renderAnalystConfidence();
  // Milestone 24I — restore Briefing Room state + one-time XP guard.
  briefingReviewed["mission-001"].clear();
  briefingReviewed["mission-002"].clear();
  briefingReviewed["mission-003"].clear();
  if (data.briefingReviewed && typeof data.briefingReviewed === "object") {
    ["mission-001", "mission-002", "mission-003"].forEach((mid) => {
      if (Array.isArray(data.briefingReviewed[mid])) {
        // Only accept card IDs that actually exist in this mission's briefing,
        // so corrupt/tampered save state can't inflate readiness past 100%
        // or falsely satisfy the launch gate.
        const validIds = new Set(
          (MISSION_BRIEFINGS[mid] ? MISSION_BRIEFINGS[mid].cards : []).map((c) => c.id)
        );
        data.briefingReviewed[mid].forEach((k) => {
          if (typeof k === "string" && validIds.has(k)) briefingReviewed[mid].add(k);
        });
      }
    });
  }
  briefingXpAwarded.clear();
  if (Array.isArray(data.briefingXpAwarded)) {
    data.briefingXpAwarded.forEach((k) => { if (typeof k === "string") briefingXpAwarded.add(k); });
  }
  // Milestone 25B (resume-safe) — restore the durable "investigation launched"
  // flags so a mid-mission reload resumes directly (no onboarding overlay).
  if (data.missionLaunched && typeof data.missionLaunched === "object") {
    missionLaunched["mission-001"] = !!data.missionLaunched["mission-001"];
    missionLaunched["mission-002"] = !!data.missionLaunched["mission-002"];
    missionLaunched["mission-003"] = !!data.missionLaunched["mission-003"];
  }
  renderBriefingRoom("mission-001");
  renderBriefingRoom("mission-002");
  renderBriefingRoom("mission-003");
  // Mission 1 confidence is pin-driven — recompute it as the source of truth.
  recomputeConfidenceFromPins("mission-001");
  renderConfidenceMeter("mission-002");
  renderM2AnalystConfidence(); // Milestone 31A — restore Analyst Confidence meter.
  renderConfidenceMeter("mission-003");
  renderM3AnalystConfidence(); // Assignment 3 — restore Analyst Confidence meter.
  renderInvestigationBoard("mission-001");
  renderInvestigationBoard("mission-002");
  renderInvestigationBoard("mission-003");

  updateSaveIndicator(true);
  // Milestone 32A — reflect restored progress onto the Operations Center home.
  renderOperationsCenter();
}

/**
 * Spec #6 — wipe saved data and reset the entire UI to its initial state.
 * Resets student name, XP, rank, mission completion, and re-locks Mission 2.
 */
function clearSavedProgress() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }

  // Reset student name + input + Enter Module button
  studentName = "";
  const nameInput = document.getElementById("studentNameInput");
  const enterBtn  = document.getElementById("enterModuleBtn");
  if (nameInput) nameInput.value = "";
  if (enterBtn)  enterBtn.disabled = true;

  // Reset welcome line (will be re-populated next time they enter)
  const welcomeEl = document.getElementById("welcomeMessage");
  if (welcomeEl) welcomeEl.innerHTML = "";

  // Milestone 24B fix — resetMission()/resetMission2() now reach
  // clearEvidenceForMission() and resetThreatLevelForMission(), both of
  // which normally call saveProgress(). That would re-populate STORAGE_KEY
  // immediately after we just wiped it. Suppress saves for the duration
  // of the wipe so the cleared state actually sticks.
  suppressSave = true;
  try {
    // Reset Mission 1 gameplay + XP + rank + badge + course progress + tracker.
    resetMission();
    // Milestone 20 — also reset Mission 2 state + UI.
    resetMission2();
    // Assignment 3 — also reset Mission 3 state + UI.
    resetMission3();
    // Milestone 24C — Clear Saved Progress zeroes the trust score back to 50
    // (spec #12). Mission-restart does NOT reset it (spec #11).
    resetTrustScoreForDemo();
  } finally {
    suppressSave = false;
  }

  // We deliberately do NOT call saveProgress() here — leave storage empty.
  updateSaveIndicator(false);

  // If the M2 overview is currently showing, return the user to landing.
  const overview = document.getElementById("mission2Overview");
  if (overview && overview.style.display !== "none") {
    hideMission2Overview();
  }

  // Milestone 33A — clearing progress wipes the persistent career history too.
  operationalHistory = [];

  // Milestone 32A — reset the Operations Center home to its fresh-recruit state.
  renderOperationsCenter();
}


/* ============================================================
   FINDING  (Milestone 7 — Student Report Submission)
   ============================================================
   Multiple-choice "Submit Finding" panel that appears between
   reading suspicious_file.txt and the knowledge-check quiz.
   The student must identify the actual suspicious behavior
   before the quiz unlocks — teaches them to document findings
   like a real analyst.
   ============================================================ */

const FINDING = {
  question: "What suspicious behavior did you find?",
  answers: [
    { id: "A", text: "A file asked the user to share their password with an unknown external email.", correct: true },
    { id: "B", text: "The documents folder contained two files.",                                      correct: false },
    { id: "C", text: "The terminal showed the current directory.",                                     correct: false },
    { id: "D", text: "The workstation had a reports folder.",                                          correct: false },
  ],
  correctFeedback:   "Finding submitted. Good analyst work.",
  incorrectFeedback: "Review the suspicious file before submitting your finding.",
  reportSummary:     "Possible phishing attempt involving password theft.",
};


/* ============================================================
   HINTS  (Milestone 6 — Guided Hints and Error Prevention)
   ============================================================
   Beginner-friendly guidance shown in the Hint Panel above the
   command buttons. The hint changes after each step the student
   completes so they always know what to do next without typing.

   Three hint "tones":
     muted    — the awaiting/briefing screen (calm gray)
     normal   — standard step-by-step guidance (cyan)
     warning  — student clicked out of sequence (yellow)
   ============================================================ */

/* ============================================================
   MANAGER MESSAGES  (Milestone 13)
   Scripted supervisor messages shown in the "Supervisor Message"
   panel. Keys map to lifecycle moments (awaiting, started, etc.)
   and command-button keys. Updated by setManagerMessage().
   No AI — purely scripted strings.
   ============================================================ */
const MANAGER_MESSAGES = {
  awaiting:             "Welcome, intern. Your first task is to inspect this workstation and report anything suspicious.",
  started:              "Start with basic orientation. Find out where you are in the system.",
  "pwd":                "Good. Now inspect the current directory.",
  "ls-home":            "You found several folders. Open the documents folder.",
  "cd-documents":       "List the files inside this folder.",
  "ls-documents":       "Review the available files carefully.",
  "cat-employee-notes": "You've reviewed the staff notes. Decide how they matter and pin them to your Investigation Board.",
  "cat-meeting-schedule": "You've reviewed the schedule. Judge how suspicious it is and pin it to your Investigation Board.",
  "cat-finance-update":   "You've reviewed the finance update. Judge how suspicious it is and pin it to your Investigation Board.",
  "cat-security-policy":  "You've reviewed the company policy. Decide how it supports your case and pin it to your Investigation Board.",
  "cat-suspicious":     "That message looks alarming. Pin it to your Investigation Board and classify how serious it is.",
  needMoreEvidence:     "You need stronger evidence before submitting your finding.",
  findingCorrect:       "Good analyst work. Now confirm your understanding in the quiz.",
  missionComplete:      "Assignment complete. You identified a phishing attempt and reported it properly. Your next assignment — Network Exposure Review — is now active on the operations map.",
};

/* ============================================================
   Milestone 24F — Dynamic Manager Reaction System (Phase B)
   ------------------------------------------------------------
   Dynamic manager reactions make the mission feel responsive
   while remaining safe and scripted. The manager's words change
   based on what the student actually does — discovering evidence,
   driving the threat level up, making a good or poor decision,
   answering the quiz, and finishing the mission. There is no AI:
   every line is a fixed string chosen by (missionId, eventType).

   Supported event types (spec #6):
     mission_started | evidence_found | threat_increased
     decision_correct | decision_poor | decision_neutral
     quiz_correct | quiz_incorrect | mission_completed

   Reactions are routed to whichever mission's Supervisor panel is
   currently on screen (Mission 1 #managerText, Mission 2
   #m2ManagerText) via renderManagerReaction().
   ============================================================ */
const MANAGER_REACTIONS = {
  "mission-001": {
    mission_started:   "Start with the workstation files. Look for anything that asks for sensitive information.",
    evidence_found:    "Good catch. A password request from an unknown external email is suspicious.",
    threat_increased:  "This may indicate phishing behavior. Continue carefully.",
    decision_correct:  "Good decision. You escalated the suspicious password request with evidence.",
    decision_poor:     "Ignoring a password theft indicator can put the organization at risk.",
    decision_neutral:  "Continue investigating, but prepare to submit a clear finding.",
    quiz_correct:      "You understand the risk. Password requests through unknown email channels are dangerous.",
    quiz_incorrect:    "Review the evidence again. Focus on what the message asked the user to do.",
    mission_completed: "Assignment complete. Phishing attempt identified and reported. Network Exposure Review is now active as your next assignment.",
  },
  "mission-002": {
    mission_started:   "With the phishing incident contained, monitoring is elevated. Identify your network position, then check whether the target host is reachable.",
    evidence_found:    "Good. Exposed services are important evidence during network review.",
    threat_increased:  "Multiple exposed services increase the attack surface if they are poorly secured.",
    decision_correct:  "Good recommendation. Security review is the right next step.",
    decision_poor:     "Open services should not be ignored. They require proper review.",
    decision_neutral:  "Continue the investigation until your recommendation is supported by evidence.",
    quiz_correct:      "You understand that open services can accept network connections and require assessment.",
    quiz_incorrect:    "Review the scan output again. Focus on what the open service list means.",
    mission_completed: "Assignment complete. You contained a phishing incident and reviewed network exposure — solid intern work. Reconnaissance Detection is being prepared next as operational complexity increases.",
  },
  "mission-003": {
    mission_started:   "Network monitoring flagged unusual activity. Review the active connections, then find out who that repeated external source is.",
    evidence_found:    "Good. A repeated unknown source probing services is exactly the kind of signal we watch for.",
    threat_increased:  "Systematic probing across services suggests an attacker is mapping our environment.",
    decision_correct:  "Good call. Reporting reconnaissance early gives the Blue Team time to respond.",
    decision_poor:     "Ignoring reconnaissance lets an attacker quietly map the network before striking.",
    decision_neutral:  "Keep correlating the signals until your recommendation is well supported.",
    quiz_correct:      "You understand reconnaissance — the quiet information-gathering stage before an attack.",
    quiz_incorrect:    "Review the activity again. Focus on what systematic probing from an unknown source means.",
    mission_completed: "Assignment complete. You detected reconnaissance before it became a breach. You're learning to think like a SOC analyst.",
  },
};

/* ============================================================
   REFLECTION CHECKPOINT  (Milestone 14)
   Shown after a correct quiz answer, BEFORE XP is awarded and
   BEFORE the Mission Scorecard. Turns the activity into a
   learning moment rather than just button-clicking.
   ============================================================ */
/* ============================================================
   PROGRESS TRACKER  (Milestone 15)
   10-step lifecycle tracker shown in the mission panel.
   Each step has status "locked" | "current" | "complete".
   - Order in the array IS the order students see.
   - "Briefing" starts complete on page load.
   - "Begin Mission" is the initial current step.
   - The first non-complete step is automatically highlighted
     as current — no separate "current" state to maintain.
   markProgressStep() flips a step to complete and re-renders.
   resetProgressTracker() returns everything to the initial state.
   ============================================================ */
const PROGRESS_STEPS = [
  { id: "briefing",         label: "Briefing"         },
  { id: "begin-mission",    label: "Begin Mission"    },
  { id: "inspect-location", label: "Inspect Location" },
  { id: "list-files",       label: "List Files"       },
  { id: "open-documents",   label: "Open Documents"   },
  { id: "inspect-files",    label: "Inspect Files"    },
  { id: "submit-finding",   label: "Submit Finding"   },
  { id: "quiz",             label: "Quiz"             },
  { id: "reflection",       label: "Reflection"       },
  { id: "complete",         label: "Complete"         },
];

// Source of truth for completion. Briefing is always pre-completed.
const completedProgressSteps = new Set(["briefing"]);

const REFLECTION = {
  question: "What did this mission teach you?",
  answers: [
    {
      id: "A",
      text: "Cybersecurity analysts inspect files carefully before trusting them.",
      correct: true,
    },
    {
      id: "B",
      text: "Any file inside a documents folder is automatically safe.",
      correct: false,
    },
    {
      id: "C",
      text: "Sharing passwords through email is normal if the message sounds urgent.",
      correct: false,
    },
  ],
  correctFeedback:   "Correct. Careful inspection is part of cybersecurity analysis.",
  incorrectFeedback: "Review the mission. The key lesson is to inspect suspicious messages carefully and never trust password requests.",
};

const HINTS = {
  awaiting:             "Review the mission briefing first, then begin the investigation.",
  started:              "Start by checking your current location.",
  "pwd":                "Now list the files and folders in your current location.",
  "ls-home":            "You found several folders. Open the documents folder.",
  "cd-documents":       "Now list the files inside the documents folder.",
  "ls-documents":       "Read both files. One contains normal guidance. One contains suspicious behavior.",
  "cat-employee-notes": "This file looks normal. Continue checking the remaining file.",
  "cat-suspicious":     "You found suspicious behavior. Submit your finding to unlock the quiz.",
  outOfSequence:        "Follow the mission path. Use the highlighted command next.",
};

// Strict forward sequence (cat-employee-notes is optional and handled separately)
const HINT_SEQUENCE = ["pwd", "ls-home", "cd-documents", "ls-documents", "cat-suspicious"];

/** State-aware "awaiting launch" guidance for Mission 1. The Begin button is
 *  relabeled and gated behind the Briefing Room ("Begin Investigation 🔒" until
 *  the briefing is reviewed), so point the student at the correct next action
 *  for the current briefing state instead of a fixed button label. */
function m1AwaitingHint() {
  return isBriefingComplete("mission-001")
    ? "Briefing reviewed — begin the investigation when you're ready."
    : HINTS.awaiting;
}

/** Boot messages shown in the terminal on load and after every restart. */
const BOOT_MESSAGES = [
  { type: "system", text: "Ethical CyberHackers Platform v1.0.0 \u2014 Boot sequence complete." },
  { type: "system", text: "Welcome back, Agent GHOST_ZERO. Mission briefing loaded." },
];


/* ============================================================
   DOM REFERENCES
   ============================================================ */

const terminalOutput = document.getElementById("terminalOutput");
const terminalInput  = document.getElementById("terminalInput");
// Milestone 35A — Assignment 2 & 3 terminal inputs (now student-driven: a
// clicked command card loads into the input, the student presses Enter to run).
const m2TerminalInput = document.getElementById("m2TerminalInput");
const m3TerminalInput = document.getElementById("m3TerminalInput");
const missionTimer   = document.getElementById("missionTimer");
const promptLabel    = document.querySelector(".terminal-prompt-label");
const terminalTitle  = document.querySelector(".terminal-title");
const btnContainer   = document.getElementById("commandButtonsContainer");
const statusList     = document.getElementById("missionStatusList");
const quizPanel      = document.getElementById("quizPanel");
const findingPanel   = document.getElementById("findingPanel");
const commandsHint   = document.querySelector(".commands-hint");
const courseProgressEl = document.getElementById("courseProgress");

// Milestone 10 — Module landing screen elements
const moduleLandingEl  = document.getElementById("moduleLanding");
const dashboardEl      = document.getElementById("dashboard");

// Milestone 11 — Simulation loading screen elements
const simLoaderEl        = document.getElementById("simLoader");
const simLoaderLinesEl   = document.getElementById("simLoaderLines");
const simLoaderCurrentEl = document.getElementById("simLoaderCurrent");
const simLoaderBarEl     = document.getElementById("simLoaderBar");
const simLoaderPctEl     = document.getElementById("simLoaderPct");
const simLoaderStatusEl  = document.getElementById("simLoaderStatus");

/**
 * Boot lines shown by the simulation loader. Each entry becomes one
 * row in the fake terminal, with the progress bar advancing in step.
 * Total runtime is roughly LINE_DELAY_MS * SIM_BOOT_LINES.length.
 */
// Milestone 32A — operational "report for duty" launch sequence (replaces the
// old course/simulation boot lines). Plays when the player starts their shift.
const SIM_BOOT_LINES = [
  "Initializing Blue Team workspace...",
  "Synchronizing threat intelligence...",
  "Loading active assignments...",
  "Connecting to Mission Control...",
  "Operations Center ready.",
];
const SIM_LINE_DELAY_MS = 450;     // delay between lines (≈4 s total)
const SIM_FINAL_PAUSE_MS = 500;    // brief pause after the last line

// XP panel elements (right sidebar)
const xpBarEl     = document.getElementById("xpBar");
const currentXPEl = document.getElementById("currentXP");
const maxXPEl     = document.getElementById("maxXP");
const rankNameEl  = document.getElementById("rankName");

// Mission panel badge ("IN PROGRESS" ↔ "COMPLETE")
const missionBadge = document.querySelector(".mission-status-badge");


/* ============================================================
   APPLICATION STATE
   These variables track the current session.
   resetMission() restores all of them to their initial values.
   ============================================================ */

let currentDir       = "~";     // which folder the student is in
let currentXP        = INITIAL_XP;
let missionComplete  = false;
let missionStarted   = false;   // false until student clicks "Begin Mission"
// Milestone 25B (resume-safe) — DURABLE per-mission "investigation launched"
// flag. Unlike session-only missionStarted/m2Started, this is persisted so a
// mid-mission reload can skip the guided onboarding overlay and resume directly.
let missionLaunched  = { "mission-001": false, "mission-002": false, "mission-003": false };
let furthestSeqIndex = -1;      // tracks how far along HINT_SEQUENCE the student is

// Which button keys are currently visible to the student
const unlockedKeys = new Set();

// Which mission step IDs have been checked off
const completedSteps = new Set();


/* ============================================================
   TIMER
   ============================================================ */

let timerInterval = null;
let secondsLeft   = 0;

function formatTime(total) {
  const mm = Math.floor(total / 60).toString().padStart(2, "0");
  const ss = (total % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function startTimer(durationSeconds) {
  if (timerInterval) clearInterval(timerInterval);
  secondsLeft = durationSeconds;
  if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);
  timerInterval = setInterval(() => {
    secondsLeft -= 1;
    if (missionTimer) missionTimer.textContent = formatTime(secondsLeft);
    if (secondsLeft <= 0) clearInterval(timerInterval);
  }, 1000);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}


/* ============================================================
   PROMPT HELPERS
   ============================================================ */

function getPrompt() {
  return `student@cybercorp:${currentDir}$`;
}

function updatePromptDisplay() {
  const p = getPrompt();
  if (terminalTitle) terminalTitle.textContent = p;
  if (promptLabel)   promptLabel.textContent   = p;
}


/* ============================================================
   TERMINAL OUTPUT HELPERS
   ============================================================ */

/* ============================================================
   FIX 1 — Readable terminal OUTPUT pacing.
   Command echoes still appear instantly (and are typed in for clicks),
   but OUTPUT lines are revealed one at a time so beginners can read
   them. Clicking the terminal body skips the reveal and shows
   everything immediately.
   ============================================================ */
const TERMINAL_LINE_DELAY = 550;   // ms between revealed terminal OUTPUT lines
let outputRevealQueue = [];        // hidden output <div>s awaiting reveal
let outputRevealTimer = null;

function queueTerminalReveal(el) {
  el.classList.add("term-pending");
  outputRevealQueue.push(el);
  if (!outputRevealTimer) {
    outputRevealTimer = setTimeout(revealNextTerminalLine, TERMINAL_LINE_DELAY);
  }
}

function revealNextTerminalLine() {
  outputRevealTimer = null;
  const el = outputRevealQueue.shift();
  if (el) {
    el.classList.remove("term-pending");
    const c = el.parentElement;
    if (c) c.scrollTop = c.scrollHeight;
  }
  if (outputRevealQueue.length) {
    outputRevealTimer = setTimeout(revealNextTerminalLine, TERMINAL_LINE_DELAY);
  }
}

/** Skip the reveal animation — show every pending output line at once. */
function flushTerminalOutput() {
  if (outputRevealTimer) { clearTimeout(outputRevealTimer); outputRevealTimer = null; }
  while (outputRevealQueue.length) {
    outputRevealQueue.shift().classList.remove("term-pending");
  }
  ["terminalOutput", "m2Terminal"].forEach((id) => {
    const c = document.getElementById(id);
    if (c) c.scrollTop = c.scrollHeight;
  });
}

/** Drop pending reveals without showing them (used when clearing). */
function clearTerminalOutputQueue() {
  if (outputRevealTimer) { clearTimeout(outputRevealTimer); outputRevealTimer = null; }
  outputRevealQueue = [];
}

function printCommand(command) {
  // A fresh command flushes any still-revealing output so order stays correct.
  flushTerminalOutput();
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt">${getPrompt()}</span>` +
    `<span class="terminal-text terminal-text--success">${command}</span>`;
  terminalOutput.appendChild(line);
  scrollTerminal();
}

function printOutput(text, type = "default") {
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt" style="opacity:0;user-select:none;">$</span>` +
    `<span class="terminal-text terminal-text--${type}">${text}</span>`;
  terminalOutput.appendChild(line);
  queueTerminalReveal(line); // FIX 1 — paced reveal
}

function printBlankLine() {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = "&nbsp;";
  terminalOutput.appendChild(line);
  queueTerminalReveal(line); // FIX 1 — keep blank spacing in output order
}

function scrollTerminal() {
  if (terminalOutput) terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

/**
 * Prints the initial system boot messages.
 * Called on first load AND after every restart so the terminal always
 * starts with the same familiar two lines.
 */
function printBootMessages() {
  BOOT_MESSAGES.forEach((msg) => {
    const line = document.createElement("div");
    line.className = "terminal-line terminal-line--system";
    line.innerHTML =
      `<span class="terminal-prompt">${msg.type}</span>` +
      `<span class="terminal-text">${msg.text}</span>`;
    terminalOutput.appendChild(line);
  });
  // Boot lines stay instant (no paced reveal queue).
  const blank = document.createElement("div");
  blank.className = "terminal-line";
  blank.innerHTML = "&nbsp;";
  terminalOutput.appendChild(blank);
  scrollTerminal();
}

function clearTerminal() {
  clearTerminalOutputQueue(); // FIX 1 — drop any pending reveals
  terminalOutput.innerHTML = "";
}


/* ============================================================
   COMMAND PROCESSOR
   Reads FILESYSTEM data and produces the right output per command.
   ============================================================ */

/**
 * Challenge Layer 1 — central handler for a successful Mission 1 file read.
 * Runs for both typed (`cat finance_update.txt`) and clicked commands, so
 * confidence/bonus/false-lead reactions are consistent either way.
 *
 * - false leads (meeting_schedule / finance_update): no major evidence,
 *   small confidence bump, "keep looking" supervisor nudge.
 * - security_policy: bonus evidence + one-time bonus XP + confidence.
 * - suspicious_file: the required evidence flow lives in afterCommand();
 *   here we only credit confidence.
 */
function handleM1FileRead(filename) {
  const name = (filename || "").toLowerCase();
  const firstRead = !m1FilesReviewed.has(name);
  m1FilesReviewed.add(name);

  // Milestone 26A — event toast: the key suspicious file was opened (first read only).
  if (firstRead && name === "suspicious_file.txt") {
    showEventToast("Suspicious File", "A password request from an unknown sender.", "warning");
    // Stage 1 — adversary presence: opening the phishing file confirms an
    // active credential-collection attempt.
    triggerAdversaryEvent("Unknown external email attempting credential collection.", "medium", { force: true });
    // Stage 2 — Blue Team: isolate the file and advance containment.
    updateContainmentProgress("mission-001", 15, {
      stepId: "open-suspicious",
      incident: "Active Threat",
      assignment: "Isolate the suspicious file",
      caption: "Suspicious file located and flagged.",
    });
    showBlueTeamUpdate("mission-001", "Suspicious file isolated.");
  }

  if (name === "meeting_schedule.txt" || name === "finance_update.txt") {
    m1FalseLeadsChecked.add(name);
  }
  if (name === "security_policy.txt") {
    // Reviewing the policy still counts as locating the bonus reference; the
    // student is rewarded once they correctly pin it as supporting evidence.
    m1BonusFound = true;
  }

  // Guided one-clue-at-a-time flow — opening a file does not auto-confirm a
  // finding or auto-advance. The student must CLASSIFY how suspicious it is.
  // Reading goes STRAIGHT to the classification choices (no intermediate
  // "Pin to Board" step), framed as the single active investigative decision.
  // The opt-in demo follows its OWN curated path (it classifies the suspicious
  // file explicitly), so suppress the per-file prompt while it runs.
  if (EVIDENCE_RATINGS["mission-001"][name] && !demoRunning) {
    const existing = investigationPins["mission-001"][name];
    if (existing && existing.correct) {
      // Already correctly classified (e.g. a re-read on resume). Don't re-prompt;
      // instead walk the guided chain forward so the next file stays reachable.
      revealNextM1File(name);
    } else {
      pinnableFindings["mission-001"].add(name);
      setM1ActiveFile(m1BtnKeyForFile(name));
      // Milestone 27A — reason first ("What does this file suggest?"), then classify.
      setCurrentObjective("mission-001", "Read this file closely: what is it actually asking for, and does that make it a threat?");
      showM1ReasoningPrompt(name);
      // Milestone 25B — spotlight the classification action during a guided run.
      if (igEnabled) {
        const host = document.getElementById(pinHostId("mission-001"));
        if (host) igShow("mission-001", "board", host);
      }
    }
  }
}

function processCommand(command, buttonKey) {
  try { trackGameEvent("command_executed", { assignment_id: "mission-001", command: String(command || "").trim() }); } catch (_) { /* non-fatal */ }
  // FIX 6 — normalize: collapse whitespace + lowercase for matching so
  // `cd documents/`, `ls documents`, `cat ./File.txt`, mixed case all work.
  const raw     = command.trim().replace(/\s+/g, " ");
  const cmd     = raw.toLowerCase();
  const dirData = FILESYSTEM[currentDir];

  // FIX 4/7 — a TYPED command (no buttonKey) during an active Mission 1 drives
  // the SAME progression as clicking the matching button. We resolve the typed
  // command to its button key so afterCommand() runs (unlock / advance /
  // objective / button-state). Clicks pass their own key (unchanged). The
  // teaching demo keeps read-only typed commands keyless, and Mission 2 has its
  // own command system, so both are unaffected.
  const manual = !buttonKey && missionStarted && !demoRunning;
  const keyFor = (k) => (buttonKey ? buttonKey : (manual ? (k || "") : ""));

  // pwd
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    afterCommand(keyFor("pwd"));
    return;
  }

  // ls (current directory)
  if (cmd === "ls") {
    printOutput(dirData.ls.join("  "));
    printBlankLine();
    afterCommand(keyFor(currentDir === "~/documents" ? "ls-documents" : "ls-home"));
    return;
  }

  // FIX 6 — ls <folder>: peek into a subdirectory without entering it.
  if (cmd.startsWith("ls ")) {
    const target = cmd.slice(3).trim().replace(/\/+$/, "");
    const path   = `${currentDir}/${target}`.replace("~//", "~/");
    if (dirData.subdirs.includes(target) && FILESYSTEM[path]) {
      printOutput(FILESYSTEM[path].ls.join("  "));
      printOutput(`Tip: type "cd ${target}" to enter the ${target} folder.`, "info");
    } else {
      printOutput(`There's no folder named "${target}" here. Type "ls" to see what's available.`, "warn");
    }
    printBlankLine();
    return;
  }

  // cd <folder>
  if (cmd.startsWith("cd ")) {
    const target = cmd.slice(3).trim().replace(/\/+$/, ""); // FIX 6 — drop trailing slash

    // "cd ." / "cd" (stay put) — no movement, and crucially NO progression.
    if (target === "" || target === ".") {
      printBlankLine();
      return;
    }

    // FIX 5 — already inside the requested folder → friendly, state unchanged.
    // Compare the target against the CURRENT folder's leaf name (not a nested
    // path) so a repeated `cd documents` from ~/documents is recognised.
    const currentLeaf = currentDir === "~" ? "~" : currentDir.split("/").pop();
    if (target === currentLeaf) {
      const label = currentDir === "~" ? "home" : currentLeaf;
      printOutput(`Already inside ${label} folder.`, "info");
      printBlankLine();
      // Only the documents folder gates progression — keep its NEXT marker
      // correct (idempotent). Never advance for any other already-here case.
      if (target === "documents") afterCommand(keyFor("cd-documents"));
      return;
    }

    const newPath = `${currentDir}/${target}`.replace("~//", "~/");
    if (dirData.subdirs.includes(target) && FILESYSTEM[newPath]) {
      currentDir = newPath;
      updatePromptDisplay();
      printBlankLine();
      afterCommand(keyFor(target === "documents" ? "cd-documents" : m1KeyForCommand(`cd ${target}`)));
    } else {
      // FIX 8 — guidance instead of a harsh bash error.
      printOutput(`There's no folder named "${target}" here. Type "ls" to see the folders you can open.`, "warn");
      printBlankLine();
    }
    return;
  }

  // cat <filename>
  if (cmd.startsWith("cat ")) {
    const filename = cmd.slice(4).trim().replace(/^\.\//, ""); // FIX 6 — drop leading ./
    const files    = dirData.files;

    if (files[filename]) {
      files[filename].forEach((line) => {
        if (line === "") {
          printBlankLine();
        } else {
          printOutput(line, line.startsWith("[!") ? "warn" : "default");
        }
      });
      // Challenge Layer 1 — apply confidence / bonus / false-lead logic for
      // EVERY successful file read, whether the command was typed or clicked.
      handleM1FileRead(filename);
      printBlankLine();
      afterCommand(keyFor(m1BtnKeyForFile(filename)));
    } else {
      // FIX 8 — guidance instead of a harsh access-denied error.
      printOutput(`There's no file named "${filename}" in this folder. Type "ls" to see the files here.`, "warn");
      printBlankLine();
    }
    return;
  }

  // clear
  if (cmd === "clear") {
    clearTerminal();
    printBootMessages();
    return;
  }

  // unknown — FIX 8 — friendly guidance instead of "command not found".
  printOutput(`"${cmd.split(" ")[0]}" isn't a command here. Try: pwd, ls, cd <folder>, or cat <file>.`, "warn");
  printBlankLine();
}


/* ============================================================
   UNLOCK & PROGRESSION ENGINE
   ============================================================ */

/**
 * Called after every command button runs.
 * Unlocks any buttons gated on this key, marks mission steps,
 * and triggers the quiz if this was "cat-suspicious".
 *
 * @param {string} buttonKey
 */
/**
 * Updates the Hint Panel text + tone based on the button the student
 * just clicked. Called at the top of afterCommand() so the hint reacts
 * to every click, including out-of-sequence ones.
 */
function updateHint(buttonKey) {
  // cat-employee-notes is optional — only available after cd-documents
  if (buttonKey === "cat-employee-notes") {
    if (furthestSeqIndex >= 2) {           // i.e. cd-documents already done
      setHint(HINTS["cat-employee-notes"], "normal");
    } else {
      setHint(HINTS.outOfSequence, "warning");
    }
    return;
  }

  const clickedIndex = HINT_SEQUENCE.indexOf(buttonKey);
  if (clickedIndex === -1) return;          // unknown button; leave hint alone

  if (clickedIndex > furthestSeqIndex + 1) {
    // Skipping ahead — gentle nudge back to the highlighted button
    setHint(HINTS.outOfSequence, "warning");
    return;
  }

  if (clickedIndex <= furthestSeqIndex) {
    // Re-running an earlier command (e.g. pwd, ls) — keep current hint
    return;
  }

  // Normal forward progression
  furthestSeqIndex = clickedIndex;
  setHint(HINTS[buttonKey], "normal");
}

/**
 * Milestone 13: Updates the Supervisor Message panel.
 * Pure DOM update + brief flash animation. No state, no AI.
 * @param {string} key  Key into MANAGER_MESSAGES
 */
function setManagerMessage(key) {
  const msg = MANAGER_MESSAGES[key];
  if (!msg) return;
  // Milestone 25A — route through the supervisor chat feed (dedupe is
  // handled inside pushManagerMessage).
  pushManagerMessage("mission-001", msg);
}

/** Writes text + tone class to the hint panel. */
function setHint(text, tone) {
  const panel = document.getElementById("hintPanel");
  const textEl = document.getElementById("hintText");
  const iconEl = document.getElementById("hintIcon");
  if (!panel || !textEl) return;

  textEl.textContent = text;
  panel.classList.remove("hint-panel--muted", "hint-panel--normal", "hint-panel--warning");
  panel.classList.add(`hint-panel--${tone}`);
  if (iconEl) iconEl.textContent = tone === "warning" ? "⚠️" : "💡";

  // Brief flash so the change is noticeable
  panel.classList.remove("hint-panel--flash");
  void panel.offsetWidth;                    // force reflow to restart animation
  panel.classList.add("hint-panel--flash");

  // Milestone 25A — keep the Current Objective card in sync with the hint.
  setCurrentObjective("mission-001", text);
}


function afterCommand(buttonKey) {
  if (!buttonKey) return;

  // Stage 3 — real investigation progress resets the idle-escalation clock.
  noteInvestigationActivity();

  // Milestone 6: update the hint panel BEFORE other logic so out-of-sequence
  // warnings show even though the command itself still executes normally.
  updateHint(buttonKey);

  // Unlock buttons whose condition was just met
  let newlyUnlocked = [];
  const btnDef = COMMAND_BUTTONS.find((b) => b.key === buttonKey);
  if (btnDef && btnDef.unlocksAfterRun.length > 0) {
    newlyUnlocked = unlockButtons(btnDef.unlocksAfterRun);
  }

  // Check off any mission steps triggered by this button
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === buttonKey && !completedSteps.has(step.id)) {
      completeStep(step.id);
    }
  });

  // Re-render buttons once so the "next step" highlight moves forward and
  // the just-used button gets dimmed — even when nothing new unlocked.
  renderButtons(newlyUnlocked);

  // Guided one-clue-at-a-time flow — keep the Current Objective focused on the
  // single next action as the student walks into the documents folder.
  if (buttonKey === "cd-documents") {
    setCurrentObjective("mission-001", "Goal: see what this workstation is holding. List the contents of the documents folder.");
  } else if (buttonKey === "ls-documents") {
    setCurrentObjective("mission-001", "Goal: start building a picture of what's here. Open the first document and read what it actually says.");
  }

  // Milestone 7: show the "Submit Finding" panel 800ms after reading the
  // suspicious file. The quiz is no longer triggered directly — it now
  // unlocks only after the student submits the correct finding.
  if (buttonKey === "cat-suspicious") {
    // Evidence Prioritization — reading the file reveals it but no longer
    // auto-confirms evidence or auto-advances. The student must PIN it and
    // classify it as Critical Threat Evidence (handled in handleM1FileRead →
    // showPinPrompt, with the decision flow triggered on a correct pin).
    // Tool inspection state still advances since the file was inspected.
    markToolCompleted("m1-file-inspector");
    markToolCompleted("m1-terminal");
    unlockTool("m1-finding-report");
    setActiveTool("m1-finding-report");

    // Resume-safe gate re-entry: if the suspicious file was ALREADY pinned
    // correctly as Critical in a prior session (so showPinPrompt suppresses
    // the prompt for completed pins), re-reading the file must still be able
    // to re-open the decision/finding flow. Without this, a reload mid-mission
    // could soft-lock the learner out of submitting their finding.
    if (canCompleteM1()) {
      setTimeout(() => {
        if (decisionAdvanced["mission-001"]) showFindingPanel();
        else showDecisionActions("mission-001");
      }, 800);
    }
  }

  // Milestone 13: supervisor message for this command (if any).
  // Uses the same key as HINTS so the mapping stays consistent.
  if (MANAGER_MESSAGES[buttonKey]) {
    setManagerMessage(buttonKey);
  }

  // Milestone 15: map command keys → progress tracker step ids.
  // Steps not listed here advance via their own dedicated hooks
  // (submit-finding, quiz, reflection, complete).
  const PROGRESS_BY_COMMAND = {
    "pwd":            "inspect-location",
    "ls-home":        "list-files",
    "cd-documents":   "open-documents",
    "cat-suspicious": "inspect-files",
  };
  if (PROGRESS_BY_COMMAND[buttonKey]) {
    markProgressStep(PROGRESS_BY_COMMAND[buttonKey]);
  }
}

/**
 * Adds keys to unlockedKeys and returns the subset that was actually new.
 * Does NOT re-render — afterCommand() handles a single render pass so the
 * "next step" highlight and "used" dimming stay in sync.
 */
function unlockButtons(keys) {
  const newlyUnlocked = [];
  keys.forEach((key) => {
    if (!unlockedKeys.has(key)) {
      unlockedKeys.add(key);
      newlyUnlocked.push(key);
    }
  });
  return newlyUnlocked;
}

function completeStep(stepId) {
  completedSteps.add(stepId);
  renderMissionStatus();
}


/* ============================================================
   RENDER: COMMAND BUTTONS
   ============================================================ */

function renderButtons(newlyUnlocked = []) {
  if (!btnContainer) return;
  btnContainer.innerHTML = "";

  // The "next recommended" button = the triggeredBy of the first
  // incomplete mission step that has a real trigger (skips auto-completed
  // steps like "Mission Started" whose triggeredBy is null).
  let nextKey = null;
  for (const step of MISSION_STEPS) {
    if (step.triggeredBy && !completedSteps.has(step.id)) {
      nextKey = step.triggeredBy;
      break;
    }
  }

  // Buttons that have already advanced the mission — dimmed to push the
  // student's eye toward fresh options. They remain clickable so students
  // can re-run pwd / ls etc. to reinforce the habit.
  const usedKeys = new Set();
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy && completedSteps.has(step.id)) {
      usedKeys.add(step.triggeredBy);
    }
  });

  // Guided one-clue-at-a-time flow — the SINGLE next file to open is the
  // earliest unlocked, unclassified file in reveal order. Only that card glows
  // as "next" so exactly one clue is highlighted even after a skip (which can
  // leave more than one unlocked-but-unclassified file on the board).
  let m1NextFileBtnKey = null;
  if (!m1ActiveFileKey) {
    for (const f of M1_FILE_REVEAL) {
      if (unlockedKeys.has(f.btn) && !investigationPins["mission-001"][f.file]) {
        m1NextFileBtnKey = f.btn;
        break;
      }
    }
  }

  // Milestone 25A — group commands by category with labels so the panel
  // reads like an investigation workflow (Navigate → Inspect Files).
  // Groups are created lazily and only when they have a visible button.
  const groupHosts = {};
  const ensureGroup = (label) => {
    if (groupHosts[label]) return groupHosts[label];
    const group = document.createElement("div");
    group.className = "cmd-group";
    group.dataset.cmdGroup = label; // Milestone 25B — spotlight target hook
    const head = document.createElement("span");
    head.className = "cmd-group-label";
    head.textContent = label;
    group.appendChild(head);
    btnContainer.appendChild(group);
    groupHosts[label] = group;
    return group;
  };

  COMMAND_BUTTONS.forEach((btn) => {
    if (!unlockedKeys.has(btn.key)) return;

    const el = document.createElement("button");
    el.className = `cmd-btn cmd-btn--${btn.style}`;
    el.dataset.command   = btn.command;
    el.dataset.buttonKey = btn.key;

    // Guided one-clue-at-a-time flow: file cards (cat-*) carry their own
    // investigation state — the active file is spotlighted, already-classified
    // files are dimmed as "reviewed", and the single unclassified-but-unlocked
    // file glows as the one to open next. These override the generic next/used
    // styling for file cards so the student's eye lands on exactly one card.
    const fileName = m1FileForBtnKey(btn.key);
    let fileStyled = false;
    if (fileName) {
      const pin = investigationPins["mission-001"][fileName];
      if (m1ActiveFileKey === btn.key) {
        el.classList.add("cmd-btn--active-file");
        fileStyled = true;
      } else if (pin) {
        el.classList.add("cmd-btn--reviewed");
        fileStyled = true;
      } else if (!m1ActiveFileKey && m1NextFileBtnKey === btn.key) {
        // No file under investigation — only the SINGLE earliest unlocked,
        // unclassified file glows as the one clue to open next.
        el.classList.add("cmd-btn--next");
        fileStyled = true;
      }
    }

    // Spotlight the next step (overrides "used" dimming if both apply)
    if (!fileStyled) {
      if (btn.key === nextKey) {
        el.classList.add("cmd-btn--next");
      } else if (usedKeys.has(btn.key)) {
        el.classList.add("cmd-btn--used");
      }
    }

    if (newlyUnlocked.includes(btn.key)) {
      el.classList.add("cmd-btn--unlocking");
      el.addEventListener("animationend", () => {
        el.classList.remove("cmd-btn--unlocking");
      }, { once: true });
    }

    el.innerHTML =
      `<span class="cmd-icon">${btn.icon}</span>` +
      `<span class="cmd-name">${btn.label}</span>` +
      `<code class="cmd-code">${btn.command}</code>` +
      `<span class="cmd-desc">${btn.desc}</span>`;

    el.addEventListener("click", () => {
      // Milestone 35A — clicking a card LOADS the command into the terminal
      // input so the student can review it; they press Enter to execute it.
      // It is NOT run on click anymore.
      loadCommandToTerminal(btn.command, terminalInput);
    });

    // Milestone 35B — hover/focus learning tooltip for this command card.
    attachCommandTooltip(el, btn.command);

    ensureGroup(m1CommandCategory(btn.key)).appendChild(el);
  });

  // Milestone 25B — when file-inspection commands first appear during a live
  // guided run, spotlight them (fires once per mission).
  if (igEnabled) {
    const inspect = btnContainer.querySelector('[data-cmd-group="Inspect Files"]');
    if (inspect) igShow("mission-001", "files", inspect);
  }
}

/** Milestone 25A — map an M1 command key to its workflow category label. */
function m1CommandCategory(key) {
  if (typeof key === "string" && key.startsWith("cat-")) return "Inspect Files";
  return "Navigate";
}


/* ============================================================
   RENDER: MISSION STATUS TRACKER
   ============================================================ */

function renderMissionStatus() {
  if (!statusList) return;
  statusList.innerHTML = "";

  // Before the mission starts, show a single "Awaiting" placeholder row
  if (!missionStarted) {
    const li = document.createElement("li");
    li.className = "step-item step-item--awaiting";
    li.innerHTML =
      `<span class="step-icon">⏸</span>` +
      `<span class="step-emoji">⏳</span>` +
      `<span class="step-label">Awaiting Mission Start</span>`;
    statusList.appendChild(li);
    return;
  }

  MISSION_STEPS.forEach((step) => {
    const done = completedSteps.has(step.id);
    const li   = document.createElement("li");
    li.className = `step-item ${done ? "step-item--complete" : "step-item--pending"}`;
    li.innerHTML =
      `<span class="step-icon">${done ? "✓" : "○"}</span>` +
      `<span class="step-emoji">${step.icon}</span>` +
      `<span class="step-label">${step.label}</span>`;
    statusList.appendChild(li);
  });
}


/* ============================================================
   SUBMIT FINDING  (Milestone 7)
   Appears between reading suspicious_file.txt and the quiz.
   Student must pick the correct suspicious behavior to unlock
   the knowledge-check quiz.
   ============================================================ */

/** Reveals the finding panel and hides command buttons. */
function showFindingPanel() {
  if (!findingPanel || missionComplete) return;

  // Milestone 27A — completion gate: the suspicious file must be reviewed AND
  // correctly classified Critical (canCompleteM1) AND Analyst Confidence must be
  // Strong/Ready before the final finding can be submitted. Correctly identifying
  // the threat sets Ready, so this never soft-locks a legitimate finish.
  if (!(canCompleteM1() && m1AnalystReadyToSubmit())) {
    setHint("You need stronger reasoning before submitting the final finding.", "warning");
    return;
  }

  // Hide the command-button UI while the analyst writes their report
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";

  findingPanel.style.display = "block";
  findingPanel.innerHTML     = buildFindingHTML();

  // Wire up answer buttons
  findingPanel.querySelectorAll(".finding-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleFindingAnswer(btn.dataset.answerId));
  });
}

/** Builds the HTML for the Submit Finding panel. */
function buildFindingHTML() {
  const answersHTML = FINDING.answers
    .map(
      (a) =>
        `<button class="finding-answer-btn" data-answer-id="${a.id}">
          <span class="finding-answer-letter">${a.id}</span>
          <span class="finding-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="finding-header">
      <span class="finding-label">SUBMIT FINDING</span>
      <span class="finding-badge">ANALYST REPORT</span>
    </div>
    <p class="finding-question">${FINDING.question}</p>
    <div class="finding-answers">${answersHTML}</div>
    <div class="finding-feedback" id="findingFeedback"></div>
  `;
}

/**
 * Handles a student's selection in the Submit Finding panel.
 *  - Correct → shows success + Analyst Report summary, then unlocks the quiz
 *  - Wrong   → shows retry message, quiz stays locked, buttons re-enabled
 *
 * @param {string} answerId  "A", "B", "C", or "D"
 */
function handleFindingAnswer(answerId) {
  const chosen  = FINDING.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;
  const feedbackEl = document.getElementById("findingFeedback");

  // Visually mark the chosen answer
  findingPanel.querySelectorAll(".finding-answer-btn").forEach((btn) => {
    btn.disabled = correct;             // only freeze the UI on a correct answer
    if (btn.dataset.answerId === answerId) {
      btn.classList.add(correct ? "finding-answer--correct" : "finding-answer--wrong");
    }
  });

  if (!feedbackEl) return;

  if (correct) {
    // 1. Success message
    feedbackEl.textContent = FINDING.correctFeedback;
    feedbackEl.className   = "finding-feedback finding-feedback--correct";

    // Milestone 13: supervisor acknowledges the finding
    setManagerMessage("findingCorrect");
    // Evidence Prioritization — Mission 1 confidence is now derived PURELY
    // from pinned/classified findings (recomputeConfidenceFromPins). The
    // finding submission no longer adds confidence on top, so the value stays
    // consistent across reloads (restore recomputes confidence from pins).
    // Milestone 15: tracker — Submit Finding complete; Quiz is now current
    markProgressStep("submit-finding");
    // Milestone 24B — analyst submitted correct finding → threat eases.
    setThreatLevel("Medium", "mission-001");
    // Milestone 26A — event toast: correct finding submitted.
    showEventToast("Finding Submitted", "Phishing attempt confirmed.", "success");
    // Stage 2 — Blue Team: a documented finding advances containment.
    updateContainmentProgress("mission-001", 20, { stepId: "finding", caption: "Phishing attempt documented." });
    showBlueTeamUpdate("mission-001", "Phishing attempt confirmed and documented.");
    // Milestone 24C — careful analyst work → +10 trust.
    increaseTrustScore(10);
    // Milestone 24G — finding submitted → Finding Report done; Quiz unlocks.
    markToolCompleted("m1-finding-report");
    unlockTool("m1-quiz");
    setActiveTool("m1-quiz");

    // 2. Append a small Analyst Report summary card
    const report = document.createElement("div");
    report.className = "analyst-report";
    report.innerHTML = `
      <span class="analyst-report-label">ANALYST REPORT</span>
      <p class="analyst-report-line">
        <span class="analyst-report-key">Finding:</span>
        <span class="analyst-report-value">${FINDING.reportSummary}</span>
      </p>
    `;
    findingPanel.appendChild(report);

    // 3. Unlock the quiz after a short pause so the student can read the report
    setTimeout(() => {
      if (findingPanel) {
        findingPanel.style.display = "none";
        findingPanel.innerHTML     = "";
      }
      showQuiz();
    }, 2200);
  } else {
    // Wrong answer — keep the quiz locked, let them try again
    feedbackEl.textContent = FINDING.incorrectFeedback;
    feedbackEl.className   = "finding-feedback finding-feedback--wrong";

    // Re-enable the wrong button after a moment so the student can retry
    setTimeout(() => {
      const wrongBtn = findingPanel.querySelector(`.finding-answer-btn[data-answer-id="${answerId}"]`);
      if (wrongBtn) wrongBtn.classList.remove("finding-answer--wrong");
    }, 1200);
  }
}


/* ============================================================
   QUIZ  (Milestone 3)
   Appears after the student submits the correct Finding.
   ============================================================ */

/** Hides command buttons and shows the quiz in their place. */
function showQuiz() {
  if (!quizPanel || missionComplete) return;

  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display  = "none";

  quizPanel.style.display = "block";
  quizPanel.innerHTML     = buildQuizHTML();

  // Wire up answer buttons
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleAnswer(btn.dataset.answerId));
  });
}

/** Returns the HTML string for the quiz panel. */
function buildQuizHTML() {
  const answersHTML = QUIZ.answers
    .map(
      (a) =>
        `<button class="quiz-answer-btn" data-answer-id="${a.id}">
          <span class="quiz-answer-letter">${a.id}</span>
          <span class="quiz-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="quiz-header">
      <span class="quiz-label">KNOWLEDGE CHECK</span>
      <span class="quiz-badge">Mission 001</span>
    </div>
    <p class="quiz-question">${QUIZ.question}</p>
    <div class="quiz-answers">${answersHTML}</div>
    <div class="quiz-feedback" id="quizFeedback"></div>
  `;
}

/**
 * Called when the student clicks an answer button.
 * Awards XP and completes the mission on a correct answer;
 * shows a retry message on a wrong answer.
 *
 * @param {string} answerId  "A", "B", "C", or "D"
 */
function handleAnswer(answerId) {
  const chosen  = QUIZ.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;

  // Disable all buttons immediately to prevent re-clicking
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.disabled = true;

    const btnId = btn.dataset.answerId;
    if (btnId === answerId && correct)  btn.classList.add("quiz-answer--correct");
    if (btnId === answerId && !correct) btn.classList.add("quiz-answer--wrong");

    // If the student was wrong, quietly reveal which answer was right
    if (QUIZ.answers.find((a) => a.id === btnId && a.correct) && !correct) {
      btn.classList.add("quiz-answer--reveal");
    }
  });

  const feedbackEl = document.getElementById("quizFeedback");
  if (!feedbackEl) return;

  if (correct) {
    feedbackEl.textContent = QUIZ.correctFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--correct";

    // Milestone 24F — dynamic manager reaction for a correct M1 quiz answer.
    updateManagerReaction("quiz_correct", { missionId: "mission-001" });

    // Milestone 15: tracker — Quiz complete; Reflection is now current
    markProgressStep("quiz");

    // Milestone 24C — correct Mission 1 quiz → +10 trust.
    increaseTrustScore(10);

    // Milestone 24G — quiz passed → Quiz done; Reflection unlocks.
    markToolCompleted("m1-quiz");
    unlockTool("m1-reflection");
    setActiveTool("m1-reflection");

    // Milestone 14: insert Reflection Checkpoint BEFORE XP + scorecard.
    // XP is awarded only after a correct reflection (see handleReflectionAnswer).
    setTimeout(showReflection, 1400);
  } else {
    feedbackEl.textContent = QUIZ.incorrectFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--wrong";

    // Milestone 24F — dynamic manager reaction for a wrong M1 quiz answer.
    updateManagerReaction("quiz_incorrect", { missionId: "mission-001" });
  }
}


/* ============================================================
   REFLECTION CHECKPOINT  (Milestone 14)
   Reuses the quizPanel container — same pattern as finding→quiz.
   On correct: award XP, then run completeMission() (scorecard).
   On wrong:   show review message, allow retry. No XP yet.
   ============================================================ */

/** Swaps the quiz UI for the reflection prompt. */
function showReflection() {
  if (!quizPanel || missionComplete) return;
  quizPanel.innerHTML = buildReflectionHTML();
  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleReflectionAnswer(btn.dataset.answerId));
  });
}

/** Returns the HTML for the Reflection Checkpoint panel.
 *  Reuses the existing .quiz-* classes so styling stays consistent
 *  with the rest of the mission UI (no new CSS required). */
function buildReflectionHTML() {
  const answersHTML = REFLECTION.answers
    .map(
      (a) =>
        `<button class="quiz-answer-btn" data-answer-id="${a.id}">
          <span class="quiz-answer-letter">${a.id}</span>
          <span class="quiz-answer-text">${a.text}</span>
        </button>`
    )
    .join("");

  return `
    <div class="quiz-header">
      <span class="quiz-label">REFLECTION CHECKPOINT</span>
      <span class="quiz-badge">Mission 001</span>
    </div>
    <p class="quiz-question">${REFLECTION.question}</p>
    <div class="quiz-answers">${answersHTML}</div>
    <div class="quiz-feedback" id="reflectionFeedback"></div>
  `;
}

/**
 * Handles reflection-answer clicks.
 *  - Correct: success message → award XP → completeMission (scorecard)
 *  - Wrong:   review message, re-enable buttons after a beat for retry
 */
function handleReflectionAnswer(answerId) {
  const chosen  = REFLECTION.answers.find((a) => a.id === answerId);
  const correct = chosen && chosen.correct;
  const feedbackEl = document.getElementById("reflectionFeedback");

  quizPanel.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.disabled = correct;             // freeze UI only on correct answer
    const btnId = btn.dataset.answerId;
    if (btnId === answerId && correct)  btn.classList.add("quiz-answer--correct");
    if (btnId === answerId && !correct) btn.classList.add("quiz-answer--wrong");
  });

  if (!feedbackEl) return;

  if (correct) {
    feedbackEl.textContent = REFLECTION.correctFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--correct";

    // Milestone 15: tracker — Reflection complete; Complete is now current
    markProgressStep("reflection");

    // Milestone 24C — correct Mission 1 reflection → +10 trust.
    increaseTrustScore(10);

    // NOW it's safe to award XP and proceed to the Mission Scorecard.
    awardXP(QUIZ.xpReward);
    setTimeout(() => completeMission(QUIZ.newRank), 1500);
  } else {
    feedbackEl.textContent = REFLECTION.incorrectFeedback;
    feedbackEl.className   = "quiz-feedback quiz-feedback--wrong";

    // Let the student try again — clear the wrong-state styling after a beat.
    setTimeout(() => {
      const wrongBtn = quizPanel.querySelector(`.quiz-answer-btn[data-answer-id="${answerId}"]`);
      if (wrongBtn) wrongBtn.classList.remove("quiz-answer--wrong");
    }, 1200);
  }
}


/* ============================================================
   XP REWARD  (Milestone 3)
   ============================================================ */

/**
 * Adds XP to the student's total and animates the XP bar.
 * @param {number} amount  XP to add (e.g. 100)
 */
function awardXP(amount) {
  currentXP = Math.min(currentXP + amount, MAX_XP);
  saveProgress(); // Milestone 18 — persist XP after every reward

  if (currentXPEl) currentXPEl.textContent = currentXP;

  const pct = Math.round((currentXP / MAX_XP) * 100);
  if (xpBarEl) {
    xpBarEl.style.transition = "width 1s ease";
    xpBarEl.style.width      = `${pct}%`;
    xpBarEl.classList.add("xp-bar--pulse");
    setTimeout(() => xpBarEl.classList.remove("xp-bar--pulse"), 1200);
  }

  printOutput(`[+${amount} XP awarded]`, "info");
  printBlankLine();

  // Milestone 25A — visible reward feedback (toast + rank-badge pulse).
  fxToast(`+${amount} XP`, "success");
  fxPulseXP();
}


/* ============================================================
   MISSION COMPLETION  (Milestones 3 & 4)
   ============================================================ */

/**
 * Called after a correct quiz answer (with a 1.5 s delay so the student
 * sees the XP bar animate first).
 *
 * Replaces the quiz panel content with the full Mission Complete screen,
 * which lists the four summary lines and includes a Restart button.
 *
 * @param {string} newRank  Rank name to display (e.g. "Cyber Intern Level 1")
 */
function completeMission(newRank) {
  missionComplete = true;
  notifyAssignmentComplete("mission-001");

  // Milestone 13: supervisor's closing message
  setManagerMessage("missionComplete");
  // Milestone 24F — dynamic manager reaction for mission completion (M1).
  updateManagerReaction("mission_completed", { missionId: "mission-001" });

  // Milestone 24B — mission complete → workstation is now safe (Low).
  setThreatLevel("Low", "mission-001");

  // Milestone 24C — Mission 1 complete → +10 trust.
  increaseTrustScore(10);

  // Milestone 24E — mission complete ⇒ alert moves to Resolved
  // ("Alert Resolved" badge per spec #12).
  markAlertResolved("mission-001");

  // Stage 3 — incident resolved: clear escalation pressure + stop the watch.
  clearEscalationWatch();
  incidentPressure["mission-001"] = 0;
  renderIncidentPressure("mission-001");

  // Stage 2 — Blue Team: threat fully contained on mission completion.
  setRedTeamActive("mission-001", false);
  updateContainmentProgress("mission-001", 0, {
    set: 100,
    incident: "Contained",
    assignment: "Incident contained — stand down",
    caption: "Threat fully contained. Workstation secured.",
  });
  showBlueTeamUpdate("mission-001", "Threat fully contained. Excellent work, Intern.");
  // Stage 4 — celebrate the win + lock the containment-action panel.
  showEventToast("THREAT CONTAINED", "Assignment 1 secured. The workstation is safe.", "blueteam", { duration: 8000 }); // FIX 2 — assignment complete dwells 8s
  renderContainmentActions("mission-001");
  // Milestone 28A — final Incident Timeline entry.
  addTimelineEvent("mission-001", "Threat contained");

  // Milestone 24G — mission complete → every M1 tool is marked completed.
  markAllToolsCompleted("mission-001");

  // Milestone 15: mark every step complete (spec #8). The loop is a safety
  // net in case any earlier step's hook didn't fire (e.g. the optional
  // "cat-employee-notes" path); the final "complete" step is always set here.
  PROGRESS_STEPS.forEach((s) => completedProgressSteps.add(s.id));
  renderProgressTracker();
  renderAllMiniMaps(); // Milestone 25D — M1 node flips to completed.
  glowOpsRegion("mission-001"); // Milestone 29A — Mission Operations win glow.
  try { updateOpsStrip("mission-001"); } catch (_) { /* 29A — non-fatal */ }

  // Update rank in the XP sidebar
  if (rankNameEl) {
    rankNameEl.textContent = newRank;
    rankNameEl.classList.add("rank-name--upgraded");
  }

  // Flip the mission badge from "IN PROGRESS" to "COMPLETE"
  if (missionBadge) {
    missionBadge.textContent = "COMPLETE";
    missionBadge.classList.add("mission-status-badge--complete");
  }

  // Keep the Mission 2 dashboard's AGENT PROFILE in sync after XP award
  syncM2XPPanel();

  // Mission is over — hide the command buttons, their hint paragraph, and
  // the HINT pill. The completion screen takes over the COMMANDS panel,
  // so leaving the old training buttons (pwd / ls / cat / cd) visible
  // just adds noise. Re-shown by resetMission() if the student restarts.
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";
  const hintPanelEl = document.getElementById("hintPanel");
  if (hintPanelEl) hintPanelEl.style.display = "none";

  // Print a terminal confirmation
  printOutput("[ ASSIGNMENT COMPLETE \u2014 Well done, Agent. ]", "info");

  // Milestone 9 — flip Mission 1 to Completed and unlock Mission 2 in the
  // Course Progress panel. Also print an unlock notice to the terminal.
  printOutput("[ Assignment 2 unlocked: Network Exposure Review ]", "info");
  // Milestone 26A — event toast: a new assignment is available.
  showEventToast("New Assignment", "Assignment 2 unlocked on the operations map.", "unlock");
  renderCourseProgress();

  // Milestone 22 — swap the M1 primary CTA from "Begin Mission" to
  // "Continue to Mission 2 →" so the next step is obvious if the
  // student stays on / re-enters the M1 dashboard. (The button is
  // currently hidden behind the completion screen until the student
  // chooses Restart, but we update it eagerly so it's correct the
  // moment they do.)
  updateMission1CTA();

  // Replace the quiz panel with the full completion screen
  if (quizPanel) {
    quizPanel.innerHTML = buildCompletionHTML(newRank);

    // Wire up the Restart Mission button
    const restartBtn = document.getElementById("restartMissionBtn");
    if (restartBtn) restartBtn.addEventListener("click", resetMission);

    // FIX 3 — wire the Next Step panel buttons.
    wireNextStepButtons("mission-001");
  }

  // FIX 4 — pulse the Mission Map buttons until the student opens the map.
  setMapButtonsAttention("mission-001", true);
  // FIX 5 — completion-state clarity: point the objective + manager at the map.
  setCurrentObjective("mission-001", COMPLETION_OBJECTIVE);
  setManagerText("mission-001", COMPLETION_MANAGER);

  // Milestone 18 — persist completion + new rank + unlock state
  saveProgress();

  // Milestone 33A — record this operation in the persistent career history.
  updateOperationalReputation("mission-001");

  // Milestone 28C — cinematic mission-complete transition: a BRIEF "MISSION
  // COMPLETE / Threat Contained" caption + Mission 2 node unlock glow, layered
  // AROUND the existing completion alerts/objective (timing/location unchanged).
  playMissionCompleteCinema("mission-001");
}

/* ============================================================
   FIX 3/4/5 — Post-completion "Next Step" guidance.
   After a mission completes the student gets: a clear Next Step panel
   (Open Mission Map / Review Scorecard) at the top of the completion
   screen, pulsing Mission Map buttons with a "Next Step" badge, locked
   command buttons, and a Current Objective + manager line that both
   point back to the Mission Map.
   ============================================================ */
const NEXT_STEP_TEXT = {
  "mission-001": "Assignment 1 complete. Return to the Operations Map to unlock and start Assignment 2.",
  "mission-002": "Assignment 2 complete. Return to the Operations Map to review your progress and see the next locked assignment.",
};
const COMPLETION_OBJECTIVE = "Assignment complete. Open the Operations Map to continue.";
const COMPLETION_MANAGER   = "Good work. Return to the Mission Map to continue your training path.";

function buildNextStepHTML(missionId) {
  const text = NEXT_STEP_TEXT[missionId] || COMPLETION_OBJECTIVE;
  const sfx  = missionId === "mission-003" ? "M3" : missionId === "mission-002" ? "M2" : "M1";
  return `
    <div class="next-step-panel" id="nextStepPanel${sfx}">
      <span class="next-step-label">NEXT STEP</span>
      <p class="next-step-text">${escapeHtml(text)}</p>
      <div class="next-step-actions">
        <button type="button" class="next-step-btn next-step-btn--primary" id="nextStepMap${sfx}">
          Open Mission Map
        </button>
        <button type="button" class="next-step-btn next-step-btn--secondary" id="nextStepScore${sfx}">
          Review Scorecard
        </button>
        <button type="button" class="next-step-btn next-step-btn--secondary" id="nextStepReplay${sfx}">
          ↻ Replay Briefing
        </button>
      </div>
    </div>
  `;
}

function wireNextStepButtons(missionId) {
  const sfx = missionId === "mission-003" ? "M3" : missionId === "mission-002" ? "M2" : "M1";
  const mapBtn = document.getElementById(`nextStepMap${sfx}`);
  if (mapBtn) mapBtn.addEventListener("click", showMissionsMap);
  const scoreBtn = document.getElementById(`nextStepScore${sfx}`);
  if (scoreBtn) scoreBtn.addEventListener("click", () => {
    const hostId = missionId === "mission-003" ? "m3AnalystReview" : missionId === "mission-002" ? "m2AnalystReview" : "quizPanel";
    const host = document.getElementById(hostId);
    const card = host ? host.querySelector(".scorecard") : null;
    if (card && card.scrollIntoView) card.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  // Task #6 — post-completion "Replay Briefing" (presentation-only; keeps the
  // replay reachable after a mission is finished).
  const replayBtn = document.getElementById(`nextStepReplay${sfx}`);
  if (replayBtn) replayBtn.addEventListener("click", () => startBriefingReplay(missionId));
}

/**
 * Active-layout fix — scroll to the student's current action.
 * Finds the visible interactive prompt lowest in the active dashboard
 * (board pin/classify, reasoning, decision, quiz, scorecard, or the
 * post-completion Next Step panel) and brings it into view. Falls back to
 * the command buttons. Never mutates progress — purely a scroll helper.
 */
function jumpToNextAction() {
  const dash = ["dashboard", "mission2Dashboard", "mission3Dashboard"]
    .map((id) => document.getElementById(id))
    .find((el) => el && el.offsetParent !== null);
  if (!dash) return;

  const SELECTORS = [
    ".pin-panel-host",
    ".m2-reasoning-host",
    ".finding-panel",
    ".decision-actions-host",
    ".quiz-panel",
    ".scorecard",
    ".next-step-panel",
  ].join(",");

  const isVisible = (el) =>
    el && el.offsetParent !== null && el.getClientRects().length > 0;

  const candidates = Array.from(dash.querySelectorAll(SELECTORS)).filter(isVisible);
  // The current action is the lowest visible prompt (flow appends downward).
  // Fall back to the command grid (M1 .command-buttons, M2/M3 cmd grids) so the
  // Jump button always scrolls somewhere useful in early mission states.
  const target = candidates.length
    ? candidates[candidates.length - 1]
    : dash.querySelector(".command-buttons, .m2-cmd-grid, .m3-cmd-grid");

  if (target && target.scrollIntoView) {
    try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
  }
}

/** FIX 4 — pulse the Mission Map buttons + show a "Next Step" badge. */
function setMapButtonsAttention(missionId, on) {
  const ids = missionId === "mission-003"
    ? ["m3MapBackBtn", "m3OpenFullMapBtn", "m3OverviewMapBackBtn"]
    : missionId === "mission-002"
    ? ["m2MapBackBtn", "m2OpenFullMapBtn", "m2OverviewMapBackBtn"]
    : ["m1MapBackBtn", "m1OpenFullMapBtn"];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("map-cta-attention", !!on);
  });
}

/** Clear the pulsing attention from every mission's map buttons. */
function clearAllMapButtonsAttention() {
  setMapButtonsAttention("mission-001", false);
  setMapButtonsAttention("mission-002", false);
  setMapButtonsAttention("mission-003", false);
}

/**
 * Returns the HTML string for the Mission Complete screen.
 * Shown inside quizPanel after a correct answer.
 *
 * @param {string} newRank  The newly unlocked rank name
 */
function buildCompletionHTML(newRank) {
  return `
    <div class="completion-screen">

      <!-- ===== Header (kept from Milestone 4) ===== -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Assignment Complete</h2>
          <p class="completion-subtitle">You identified a phishing attempt.</p>
        </div>
      </div>

      <!-- Stage 4 — THREAT CONTAINED banner on mission success. -->
      <div class="threat-contained-banner" role="status">
        <span class="threat-contained-dot" aria-hidden="true"></span>
        <span class="threat-contained-text">THREAT CONTAINED</span>
      </div>

      <!-- Milestone 28A — mission outcome variation (Excellent / Delayed / Weak). -->
      ${buildM1OutcomeVariationHTML()}

      <!-- FIX 3 — clear Next Step guidance at the top of the screen. -->
      ${buildNextStepHTML("mission-001")}

      <!-- ===== MISSION SCORECARD (Milestone 8) =====
           Replaces the old 3-row summary with a full training summary.
           All values are derived from the existing QUIZ + mission data so
           they stay in sync if those change later. -->
      <div class="scorecard">

        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">MISSION SCORECARD</span>

        <!-- Key/value rows -->
        <ul class="scorecard-rows">
          <li class="scorecard-row">
            <span class="scorecard-key">Mission</span>
            <span class="scorecard-val">New Cybersecurity Intern</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Result</span>
            <span class="scorecard-val scorecard-val--green">Completed</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Threat Identified</span>
            <span class="scorecard-val">Phishing attempt involving password theft</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">XP Earned</span>
            <span class="scorecard-val scorecard-val--cyan">+${QUIZ.xpReward} XP</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Rank</span>
            <span class="scorecard-val scorecard-val--yellow">${newRank}</span>
          </li>
          <!-- Milestone 24B — final threat level recorded for this mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Final Threat Level</span>
            <span class="scorecard-val scorecard-val--threat scorecard-val--threat-${getThreatLevel("mission-001").toLowerCase()}">${escapeHtml(getThreatLevel("mission-001"))}</span>
          </li>
          <!-- Milestone 24C — manager trust score at end of mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Trust Score</span>
            <span class="scorecard-val scorecard-val--cyan">${getTrustScore()} / 100</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Mission Outcome</span>
            <span class="scorecard-val scorecard-val--cyan">${escapeHtml(m1OutcomeVariation().title)}</span>
          </li>
          ${renderDecisionScorecardRows("mission-001")}
          ${renderAlertScorecardRows("mission-001")}
        </ul>
        </div>

        <!-- Milestone 24H — Mission Outcome Summary (Mission 1).
             Restates the full Alert → Investigation → Evidence →
             Decision → Consequence → Reward loop the student completed. -->
        ${buildOutcomeSummaryHTML("mission-001")}
        ${buildOperationalAssessmentHTML("mission-001")}

        <!-- Skills Practiced -->
        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">SKILLS PRACTICED</span>
          <ul class="scorecard-skills">
            <li><span class="scorecard-bullet">▹</span>Basic Linux navigation</li>
            <li><span class="scorecard-bullet">▹</span>Reading terminal output</li>
            <li><span class="scorecard-bullet">▹</span>Inspecting files</li>
            <li><span class="scorecard-bullet">▹</span>Identifying suspicious messages</li>
            <li><span class="scorecard-bullet">▹</span>Reporting cybersecurity findings</li>
          </ul>
        </div>

        <!-- Milestone 24G — Tools Used (Mission 1 scorecard) -->
        ${buildToolsScorecardHTML("mission-001")}

        <!-- Milestone 24A — Evidence Collected (Mission 1 scorecard) -->
        ${buildEvidenceScorecardHTML("mission-001")}

        <!-- Stage 4 — Blue Team Defense Summary (Mission 1 scorecard) -->
        ${buildContainmentSummaryHTML("mission-001")}

        <!-- What You Learned -->
        <div class="scorecard-section scorecard-learned scorecard-section--collapsed">
          <span class="scorecard-section-label">WHAT YOU LEARNED</span>
          <p class="scorecard-learned-text">
            You learned how cybersecurity analysts use simple command-line
            investigation steps to inspect files, identify suspicious
            behavior, and report a possible phishing attempt.
          </p>
        </div>

        <!-- Next Assignment Preview -->
        <div class="scorecard-section scorecard-next scorecard-section--collapsed">
          <span class="scorecard-section-label">NEXT ASSIGNMENT PREVIEW</span>
          <p class="scorecard-next-text">
            <strong class="scorecard-next-title">Network Exposure Review</strong>
            — Learn how analysts identify devices and services on a network.
          </p>
        </div>

      </div>

      <!-- ===== CERTIFICATE PREVIEW (Milestone 16) =====
           Rendered inline inside the completion screen so it's
           automatically cleared by resetMission() (which wipes
           quizPanel.innerHTML) — no extra reset wiring needed. -->
      <div class="certificate-preview" aria-label="Certificate of Completion Preview">

        <div class="certificate-card">
          <div class="certificate-watermark" aria-hidden="true">CYBERCORP</div>

          <div class="certificate-header">
            <span class="certificate-eyebrow">CyberCorp Training Academy</span>
            <h3 class="certificate-title">Certificate of Completion Preview</h3>
            <span class="certificate-seal" aria-hidden="true">★</span>
          </div>

          <div class="certificate-body">
            <div class="certificate-field">
              <span class="certificate-label">Awarded to</span>
              <span class="certificate-value certificate-value--name">${escapeHtml(studentName) || "Student Cyber Intern"}</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">For completing</span>
              <span class="certificate-value">Assignment 1 — New Cybersecurity Intern</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Skills Demonstrated</span>
              <ul class="certificate-skills">
                <li><span class="certificate-bullet">▹</span>Basic Linux-style investigation</li>
                <li><span class="certificate-bullet">▹</span>File inspection</li>
                <li><span class="certificate-bullet">▹</span>Phishing recognition</li>
                <li><span class="certificate-bullet">▹</span>Cybersecurity reporting</li>
              </ul>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Status</span>
              <span class="certificate-value certificate-value--status">Assignment 1 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all assignments in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all assignments are complete">
              🔒&nbsp; Download Certificate — Locked
            </button>
          </div>
        </div>
      </div>

      <!-- Restart button -->
      <button id="restartMissionBtn" class="restart-btn">
        ↺ &nbsp;Restart Mission
      </button>

    </div>
  `;
}


/* ============================================================
   Milestone 22 — Mission 1 primary CTA state machine.
   When the student lands on the M1 dashboard:
     * Fresh student (missionComplete = false) → "▶ Begin Mission"
     * Returning student (missionComplete = true) → "▶ Continue to Mission 2 →"
       plus a small "Replay Mission 1" secondary link underneath.
   The dispatcher attached in DOMContentLoaded reads data-mode to
   decide whether to call beginMission() or showMission2Overview().
   ============================================================ */
function updateMission1CTA() {
  const btn  = document.getElementById("beginMissionBtn");
  const link = document.getElementById("replayMission1Link");
  if (!btn) return;
  if (missionComplete) {
    btn.setAttribute("data-mode", "continue");
    btn.innerHTML = "\u25B6&nbsp; Continue to Assignment 2 \u2192";
    if (link) link.style.display = "";
  } else {
    btn.setAttribute("data-mode", "begin");
    btn.innerHTML = "\u25B6&nbsp; Begin Mission";
    if (link) link.style.display = "none";
    // Milestone 24I — relabel + gate behind the Briefing Room.
    updateBriefingGate("mission-001");
  }
}

/* ============================================================
   BEGIN MISSION  (Milestone 5)
   Called when the student clicks the "Begin Mission" button.
   Transitions the UI from the briefing screen into the active
   mission: reveals command buttons, marks Mission Started, and
   prints a system line in the terminal.
   ============================================================ */

function beginMission() {
  if (missionStarted) return;
  try { startAssignmentAttempt("mission-001"); } catch (_) { /* non-fatal */ }
  // Stage 1 — only treat a genuinely fresh launch (not a mid-mission resume)
  // as the moment the adversary first appears.
  const freshStart = !missionLaunched["mission-001"];
  missionStarted = true;
  furthestSeqIndex = -1;

  // First in-mission hint
  setHint(HINTS.started, "normal");
  // Milestone 13: supervisor's first in-mission message
  setManagerMessage("started");
  // Milestone 24F — dynamic manager reaction for mission start (M1).
  updateManagerReaction("mission_started", { missionId: "mission-001" });
  // Milestone 26A — event toast: investigation begins.
  showEventToast("Investigation Started", "Inspect the workstation and gather evidence.", "info");
  // Stage 1 — adversary presence: an attacker is already probing as the
  // mission opens. Delayed slightly so it reads as emergent activity rather
  // than stacking on the "Investigation Started" toast; gated so it never
  // fires off-screen or on a resume.
  if (freshStart) {
    if (m1AdversaryIntroTimer) clearTimeout(m1AdversaryIntroTimer);
    m1AdversaryIntroTimer = window.setTimeout(() => {
      m1AdversaryIntroTimer = null;
      // Strong context gate: the M1 dashboard must be the on-screen, active,
      // in-progress mission — so a stale timer can never fire during M2 or
      // after a reset/navigation.
      const m1Visible = dashboardEl && dashboardEl.style.display !== "none";
      if (
        m1Visible &&
        document.body.classList.contains("mission-running") &&
        missionStarted &&
        !missionComplete
      ) {
        triggerAdversaryEvent("Suspicious credential request detected.", "low", { force: true });
      }
    }, 2200);
  }
  // Milestone 28A — seed the Incident Timeline on a genuinely fresh launch.
  if (freshStart && incidentTimeline["mission-001"].length === 0) {
    addTimelineEvent("mission-001", "Incident detected");
    addTimelineEvent("mission-001", "Analyst assigned");
  }
  // Milestone 24G — initialize the M1 tool set (File Inspector + Terminal
  // available, rest locked) and make the Terminal the active focus.
  initializeMissionTools("mission-001");
  setActiveTool("m1-terminal");
  // Stage 4 — render the containment-action panel (strong responses locked
  // until critical evidence is collected).
  renderContainmentActions("mission-001");
  // Milestone 15: advance tracker — Begin Mission done, Inspect Location is now current
  markProgressStep("begin-mission");
  // Milestone 24E / 24E-2 — ensure the M1 alert exists in the "New"
  // state, then pop the interactive modal so the student must click
  // [ ▶ Investigate ] to acknowledge it. The modal's button is what
  // calls markAlertInvestigating(); we no longer auto-transition.
  if (!alertByMission["mission-001"]) createMissionAlert("mission-001");
  showAlertModal("mission-001");

  // Mark the "Mission Started" step as complete
  MISSION_STEPS.forEach((step) => {
    if (step.triggeredBy === null) completedSteps.add(step.id);
  });

  // Hide the briefing panel
  const briefing = document.getElementById("missionBriefing");
  if (briefing) briefing.style.display = "none";

  // Show the command buttons + their hint paragraph
  if (btnContainer) btnContainer.style.display = "";
  if (commandsHint) commandsHint.style.display = "";

  // Re-render mission progress (now shows the 4 real steps)
  renderMissionStatus();

  // Append the system "Mission started" line to the terminal
  const line = document.createElement("div");
  line.className = "terminal-line terminal-line--system terminal-line--new";
  line.innerHTML =
    `<span class="terminal-prompt">system</span>` +
    `<span class="terminal-text">Mission started. Begin workstation inspection.</span>`;
  terminalOutput.appendChild(line);
  printBlankLine();
  scrollTerminal();

  // Milestone 25A — entering the investigation activates Focus Mode.
  setMissionRunning(true);
  enterFocusMode();

  // Milestone 25B (resume-safe) — persist that M1's investigation has launched
  // so a reload resumes here instead of re-showing the onboarding overlay.
  missionLaunched["mission-001"] = true;
  saveProgress();

  // Stage 3 — begin watching for investigation delays (idle escalation).
  startEscalationWatch("mission-001");

  if (terminalInput) terminalInput.focus();
}


/* ============================================================
   RESET  (Milestone 4)
   Wipes all state back to the starting point so the student
   can replay the mission without refreshing the browser.
   ============================================================ */

/**
 * Resets the entire session to its initial state:
 *  - Terminal cleared and boot messages reprinted
 *  - All state variables returned to starting values
 *  - Command buttons and mission tracker re-rendered
 *  - Quiz / completion panel hidden
 *  - XP, rank, and mission badge restored
 *  - Timer restarted
 */
function resetMission() {
  try { abandonAssignmentAttempt("mission-001"); trackGameEvent("assignment_restarted", { assignment_id: "mission-001" }); } catch (_) { /* non-fatal */ }
  // Stop any in-progress command typing so a pending command can't fire
  // into the terminal after we've reset.
  cancelTerminalTyping();
  clearM1AnalysisTimer(); // Milestone 27A — drop a pending analysis-submit delay
  setMapButtonsAttention("mission-001", false); // FIX 4 — restart clears the prompt.
  // 1. Reset state variables — back to the pre-briefing state
  currentDir       = "~";
  currentXP        = INITIAL_XP;
  missionComplete  = false;
  missionStarted   = false;    // back to "Awaiting Mission Start"
  missionLaunched["mission-001"] = false; // Milestone 25B — clear durable launch flag
  furthestSeqIndex = -1;

  // Milestone 25A — replaying returns to the briefing; leave Focus Mode.
  setMissionRunning(false);
  // Milestone 25B — end any guided spotlight tour on restart.
  endGuidedRun();
  renderAllMiniMaps(); // Milestone 25D — refresh compact route maps.

  // Reset hint back to the pre-briefing message
  setHint(m1AwaitingHint(), "muted");
  // Milestone 13: reset supervisor message back to the welcome line
  setManagerMessage("awaiting");
  // Milestone 15: reset progress tracker (Briefing complete, Begin Mission current)
  resetProgressTracker();

  unlockedKeys.clear();
  completedSteps.clear();

  // Stage 2 — reset Mission 1 Blue Team / containment state.
  resetBlueTeam("mission-001");
  // Stage 3 — reset Mission 1 Adversary Escalation state.
  resetEscalation("mission-001");
  // Stage 4 — reset Mission 1 Containment Actions.
  resetContainmentActions("mission-001");

  // Challenge Layer 1 — reset Mission 1 confidence + investigation tracking.
  m1Confidence = 0;
  m1ConfidenceContributors.clear();
  m1FilesReviewed.clear();
  m1FalseLeadsChecked.clear();
  m1BonusFound     = false;
  m1ProgressiveHintIx = 0;
  renderConfidenceMeter("mission-001");

  // Milestone 27A — clear Analyst Confidence / reasoning state on restart.
  // (Also covers any leakage from the opt-in demo, which classifies directly.)
  m1AnalystScore = 0;
  m1ReasoningCorrect.clear();
  m1ReasoningBonusAwarded = false;
  renderAnalystConfidence();

  // Milestone 28A — clear the Incident Timeline on restart.
  incidentTimeline["mission-001"] = [];
  incidentTimelineSeq["mission-001"] = 0;
  renderIncidentTimeline("mission-001");

  // Investigation Board — clear Mission 1 pins + pin UI on restart.
  investigationPins["mission-001"] = {};
  pinnableFindings["mission-001"].clear();
  Array.from(pinXpAwarded).forEach((k) => {
    if (k.startsWith("mission-001:")) pinXpAwarded.delete(k);
  });
  renderInvestigationBoard("mission-001");
  const pinHostM1 = document.getElementById("pinPanel");
  if (pinHostM1) { pinHostM1.innerHTML = ""; pinHostM1.style.display = "none"; }

  // Guided one-clue-at-a-time flow — clear the active-file spotlight state.
  m1ActiveFileKey = null;
  document.body.classList.remove("m1-file-active");

  // Milestone 24I — replaying clears Mission 1's Briefing Room state.
  briefingReviewed["mission-001"].clear();
  briefingXpAwarded.delete("mission-001");
  renderBriefingRoom("mission-001");

  // Milestone 24A — restarting Mission 1 clears only Mission 1's evidence.
  clearEvidenceForMission("mission-001");
  // Milestone 24B — restart resets Mission 1's threat level to baseline.
  resetThreatLevelForMission("mission-001");
  // Milestone 24G — restart resets Mission 1's tools to their start states.
  resetToolsForMission("mission-001");

  // Pre-populate the starting buttons (they stay hidden until Begin Mission)
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // NOTE: do NOT auto-complete the "Mission Started" step here.
  // beginMission() checks it off when the student clicks Begin Mission.

  // Re-show the briefing panel
  const briefing = document.getElementById("missionBriefing");
  if (briefing) briefing.style.display = "";

  // Milestone 22 — restore the primary CTA to its current correct state
  // (Replay leaves missionComplete=false; revisits after a finish stay
  //  on "Continue to Mission 2").
  updateMission1CTA();

  // 2. Reset XP sidebar
  if (currentXPEl) currentXPEl.textContent = INITIAL_XP;
  if (xpBarEl) {
    xpBarEl.style.transition = "width 0.4s ease";
    xpBarEl.style.width      = `${Math.round((INITIAL_XP / MAX_XP) * 100)}%`;
    xpBarEl.classList.remove("xp-bar--pulse");
  }

  // 3. Reset rank
  if (rankNameEl) {
    rankNameEl.textContent = INITIAL_RANK;
    rankNameEl.classList.remove("rank-name--upgraded");
  }

  // 4. Reset mission badge
  if (missionBadge) {
    missionBadge.textContent = "IN PROGRESS";
    missionBadge.classList.remove("mission-status-badge--complete");
  }

  // 5. Clear terminal and reprint boot messages
  clearTerminal();
  printBootMessages();

  // 6. Update prompt (directory changed back to ~)
  updatePromptDisplay();

  // 7. Re-render command buttons and mission tracker
  renderButtons();
  renderMissionStatus();
  renderCourseProgress();   // Milestone 9 — re-lock Mission 2 on restart

  // 8. Hide command buttons + hint (they reappear after Begin Mission),
  //    and hide the quiz/completion panel.
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";
  // Restore the HINT pill that completeMission() hid
  const hintPanelReset = document.getElementById("hintPanel");
  if (hintPanelReset) hintPanelReset.style.display = "";
  if (quizPanel) {
    quizPanel.style.display = "none";
    quizPanel.innerHTML     = "";
  }
  // Milestone 7: also hide & clear the Submit Finding panel on restart
  if (findingPanel) {
    findingPanel.style.display = "none";
    findingPanel.innerHTML     = "";
  }
  // Milestone 24D — clear the Mission 1 decision state on restart so
  // the student must re-make their decision when they reach the
  // decision point again.
  resetDecisionForMission("mission-001");

  // Milestone 24E — restarting a mission resets its alert (spec #14).
  // Recreate it immediately in the "New" state so the Alert Center
  // is populated; beginMission() will flip it to "Investigating".
  clearAlert("mission-001");
  createMissionAlert("mission-001");

  // 9. Restart countdown timer
  stopTimer();
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Return focus to terminal input
  if (terminalInput) {
    terminalInput.value = "";
    terminalInput.focus();
  }
}


/* ============================================================
   RUN A COMMAND END-TO-END
   ============================================================ */

function runCommand(command, buttonKey = "") {
  const trimmed = command.trim();
  if (!trimmed) return;
  printCommand(trimmed);
  processCommand(trimmed, buttonKey);
}


/* ============================================================
   COMMAND TYPING ANIMATION
   When a command BUTTON is clicked we first "type" the command,
   character by character, into the terminal entry so the player
   can SEE what is being sent to the command line, then it runs.
   Reused by the opt-in demo to mimic real, manual usage.
   ============================================================ */
const TERMINAL_TYPE_SPEED = 40;            // FIX 1 — per-character command typing speed (25–40ms)
const TERMINAL_TYPE_MS = TERMINAL_TYPE_SPEED; // alias kept for existing references below
// Milestone 28C — dramatic pacing: a cinematic interruption may briefly bump
// this multiplier so command typing slows for a beat, then it restores to 1.
let terminalPaceMultiplier = 1;
let terminalTypeState = null;  // { command, onDone, timer } | null

/** Stop any in-progress typing WITHOUT running its command. */
function cancelTerminalTyping() {
  if (terminalTypeState && terminalTypeState.timer) {
    clearTimeout(terminalTypeState.timer);
  }
  terminalTypeState = null;
}

/** Immediately finish an in-progress typing run: show the full command and
 *  fire its onDone, so a rapid second click can never drop a command. */
function flushTerminalTyping() {
  const s = terminalTypeState;
  if (!s) return;
  if (s.timer) clearTimeout(s.timer);
  terminalTypeState = null;
  if (terminalInput) terminalInput.value = s.command;
  if (typeof s.onDone === "function") s.onDone();
}

/** Animate-type `command` into the terminal entry, then call `onDone`.
 *  Any in-progress typing is flushed first so commands never overlap. */
function typeCommandIntoTerminal(command, onDone) {
  if (!terminalInput) { if (typeof onDone === "function") onDone(); return; }
  flushTerminalTyping();
  const text = String(command);
  terminalInput.value = "";
  try { terminalInput.focus(); } catch (_) {}
  const state = { command: text, onDone, timer: null };
  terminalTypeState = state;
  let i = 0;
  const step = () => {
    if (terminalTypeState !== state) return; // superseded / cancelled
    if (i < text.length) {
      terminalInput.value += text.charAt(i++);
      state.timer = setTimeout(step, TERMINAL_TYPE_MS * terminalPaceMultiplier);
    } else {
      terminalTypeState = null;
      state.timer = null;
      if (typeof onDone === "function") onDone();
    }
  };
  step();
}


/* ============================================================
   Milestone 35A — COMMAND PREVIEW + MANUAL EXECUTION
   Clicking a command card no longer runs the command instantly.
   Instead it LOADS the command text into that assignment's terminal
   input; the student reviews it and presses Enter to execute. This
   makes the game feel like real terminal work. Manual typing still
   works, and the same parser runs typed and card-loaded commands.
   Applies to Assignment 1, 2, and 3. Frontend-only.
   ============================================================ */

/** Load a command string into a terminal input WITHOUT executing it. The
 *  student presses Enter to run it. `inputEl` defaults to Mission 1's
 *  terminal; Mission 2 / 3 pass their own input element. */
function loadCommandToTerminal(commandText, inputEl) {
  const input = inputEl || terminalInput;
  if (!input) return;
  try { trackGameEvent("command_loaded", { command: String(commandText || "").trim() }); } catch (_) { /* non-fatal */ }
  // Cancel any in-progress M1 typing animation so it can't overwrite us.
  cancelTerminalTyping();
  input.value = String(commandText);
  try {
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  } catch (_) {}
  // State-aware guidance: a command is now loaded but not yet executed. Point the
  // student at the next concrete action (press Enter) on the matching mission's
  // hint / Current Objective. This never runs the command.
  const loadedMsg = "Command loaded — press Enter to execute it.";
  if (input === m2TerminalInput) setM2Hint(loadedMsg);
  else if (input === m3TerminalInput) setM3Hint(loadedMsg);
  else setHint(loadedMsg, "normal");
}

/** Resolve typed terminal text to a command key for a key-driven mission
 *  (Mission 2 / 3, whose command maps store the literal command in `.cmd`).
 *  Whitespace/case-insensitive. Returns the key, or null if no match. */
function keyForTypedCommand(commandsMap, text) {
  const norm = String(text).trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return null;
  for (const k of Object.keys(commandsMap)) {
    const def = commandsMap[k];
    if (def && String(def.cmd).toLowerCase().replace(/\s+/g, " ") === norm) {
      return k;
    }
  }
  return null;
}

/** Execute a command the student typed (or loaded from a card) into the
 *  Mission 2 terminal. Maps the text to a command key, then runs the SAME
 *  path as a card click. Gives friendly guidance when the command is
 *  unrecognized, locked, or edited incorrectly. */
function submitM2TerminalInput(text) {
  if (!m2Started) return;
  const trimmed = String(text).trim();
  if (!trimmed) return;
  const echo = () => printM2Line(
    `<span class="m2-prompt">student@cybercorp:~$</span> ${escapeHtml(trimmed)}`,
    "m2-line--prompt"
  );
  const key = keyForTypedCommand(M2_COMMANDS, trimmed);
  if (!key) {
    echo();
    printM2Line(
      "That command isn't recognized here. Tip: click a command card to load the exact command, then press Enter.",
      "m2-line--output"
    );
    printM2Line("", "m2-line--blank");
    return;
  }
  if (mission2Complete || !m2UnlockedCmds.has(key)) {
    echo();
    printM2Line(
      "That command isn't available yet — finish the current step first, then it will unlock.",
      "m2-line--output"
    );
    printM2Line("", "m2-line--blank");
    return;
  }
  runM2Command(key);
}

/** Mission 3 equivalent of submitM2TerminalInput(). */
function submitM3TerminalInput(text) {
  if (!m3Started) return;
  const trimmed = String(text).trim();
  if (!trimmed) return;
  const echo = () => printM3Line(
    `<span class="m3-prompt">student@cybercorp:~$</span> ${escapeHtml(trimmed)}`,
    "m3-line--prompt"
  );
  const key = keyForTypedCommand(M3_COMMANDS, trimmed);
  if (!key) {
    echo();
    printM3Line(
      "That command isn't recognized here. Tip: click a command card to load the exact command, then press Enter.",
      "m3-line--output"
    );
    printM3Line("", "m3-line--blank");
    return;
  }
  if (mission3Complete || !m3UnlockedCmds.has(key)) {
    echo();
    printM3Line(
      "That command isn't available yet — finish the current step first, then it will unlock.",
      "m3-line--output"
    );
    printM3Line("", "m3-line--blank");
    return;
  }
  runM3Command(key);
}


/* ============================================================
   Milestone 35B — COMMAND KNOWLEDGE (hover/focus learning tooltips)
   ------------------------------------------------------------
   A reusable, frontend-only learning layer. Hovering or keyboard-focusing
   ANY command card shows a concise explanation: what the command does, why a
   SOC analyst uses it, and what to look for in the output — without leaving
   the mission flow. Keyed by the literal command text so the SAME data set
   serves Assignments 1, 2 and 3 (M1 cards use `command`; M2/M3 use `.cmd`).

   Metadata fields per command:
     commandText, shortDescription, socUse, whatToLookFor,
     beginnerExplanation, advancedEquivalent (optional)
   ============================================================ */
const COMMAND_KNOWLEDGE = {
  /* --- Assignment 1 — file investigation --- */
  "pwd": {
    shortDescription: "Shows the current folder.",
    socUse: "Confirms where the analyst is working.",
    whatToLookFor: "Whether you are in the expected directory.",
    beginnerExplanation: "Every terminal session has a \u201ccurrent folder.\u201d pwd (print working directory) tells you exactly where you are so you don't run commands in the wrong place.",
    advancedEquivalent: "pwd",
  },
  "ls": {
    shortDescription: "Lists files and folders.",
    socUse: "Shows which items are available to inspect.",
    whatToLookFor: "Suspicious or unfamiliar filenames.",
    beginnerExplanation: "ls (list) prints the names of everything in the current folder so you can decide what to open next.",
    advancedEquivalent: "ls -la",
  },
  "cd documents": {
    shortDescription: "Moves into the documents folder.",
    socUse: "Lets the analyst inspect user files.",
    whatToLookFor: "Files that may contain suspicious requests.",
    beginnerExplanation: "cd (change directory) walks you into a folder so you can look at what's inside it.",
    advancedEquivalent: "cd ./documents",
  },
  "cat suspicious_file.txt": {
    shortDescription: "Displays the contents of a text file.",
    socUse: "Lets the analyst review possible evidence.",
    whatToLookFor: "Password requests, urgent language, unknown senders, external links.",
    beginnerExplanation: "cat prints a text file straight to the screen so you can read it without opening an editor.",
    advancedEquivalent: "cat suspicious_file.txt",
  },

  /* --- Assignment 2 — network exposure review --- */
  "ip addr": {
    shortDescription: "Shows network address information.",
    socUse: "Helps identify the local workstation's network position.",
    whatToLookFor: "Your IP address and network range.",
    beginnerExplanation: "ip addr lists the network addresses assigned to this machine \u2014 your starting point for mapping the network.",
    advancedEquivalent: "ip addr show / ifconfig",
  },
  "ping 10.0.0.8": {
    shortDescription: "Tests whether a host is reachable.",
    socUse: "Helps determine if a target system is active.",
    whatToLookFor: "A timeout \u2014 meaning this host did not respond.",
    beginnerExplanation: "ping sends a small probe and waits for a reply. No reply (a timeout) means the host is unreachable right now.",
    advancedEquivalent: "ping -c 4 10.0.0.8",
  },
  "ping 10.0.0.5": {
    shortDescription: "Tests whether a host is reachable.",
    socUse: "Helps determine if a target system is active.",
    whatToLookFor: "Successful replies or timeouts.",
    beginnerExplanation: "ping sends a small probe and waits for a reply. Replies mean the host is online and worth investigating further.",
    advancedEquivalent: "ping -c 4 10.0.0.5",
  },
  "nmap 10.0.0.5": {
    shortDescription: "Simulates service discovery on a host.",
    socUse: "Helps identify exposed services.",
    whatToLookFor: "Open ports and service names.",
    beginnerExplanation: "nmap scans a host to see which \u201cdoors\u201d (ports) are open and what's running behind them.",
    advancedEquivalent: "nmap -sV 10.0.0.5",
  },
  "review services": {
    shortDescription: "Summarizes the services you found.",
    socUse: "Helps the analyst interpret what the exposed services mean.",
    whatToLookFor: "Which services could be risky if poorly secured.",
    beginnerExplanation: "This step pauses the investigation so you can think about what the discovered services mean before deciding what to do.",
  },

  /* --- Assignment 3 — reconnaissance detection --- */
  "netstat -an": {
    shortDescription: "Shows active network connections.",
    socUse: "Helps review network activity and suspicious connections.",
    whatToLookFor: "Repeated sources, external IPs, unusual states.",
    beginnerExplanation: "netstat lists the live connections in and out of this machine, including the addresses on the other end.",
    advancedEquivalent: "netstat -an / ss -an",
  },
  "whois 198.51.100.20": {
    shortDescription: "Looks up information about an IP address.",
    socUse: "Helps analysts understand source context.",
    whatToLookFor: "Whether the owner is a known, legitimate organization.",
    beginnerExplanation: "whois queries public registries to tell you who an IP address belongs to \u2014 a recognized owner usually means normal traffic.",
    advancedEquivalent: "whois 198.51.100.20",
  },
  "whois 203.0.113.77": {
    shortDescription: "Looks up information about an IP address.",
    socUse: "Helps analysts understand source context.",
    whatToLookFor: "Unfamiliar or external sources.",
    beginnerExplanation: "whois queries public registries to tell you who an IP address belongs to \u2014 an unknown, unregistered owner is a red flag.",
    advancedEquivalent: "whois 203.0.113.77",
  },
  "grep 203.0.113.77 access.log": {
    shortDescription: "Searches logs for a specific IP address.",
    socUse: "Helps find repeated activity from a source.",
    whatToLookFor: "Repeated hits across services or over time.",
    beginnerExplanation: "grep scans a file and prints only the lines that match what you searched for \u2014 here, one IP across the access log.",
    advancedEquivalent: "grep 203.0.113.77 access.log",
  },
  "review recon": {
    shortDescription: "Summarizes the signals you correlated.",
    socUse: "Helps the analyst name the attacker's behavior.",
    whatToLookFor: "Whether the pattern matches reconnaissance.",
    beginnerExplanation: "This step pauses the investigation so you can think about what all the signals add up to before responding.",
  },
};

// Generic fall-backs by command verb, so cards whose exact text isn't listed
// (e.g. the other readable files in Assignment 1: cat employee_notes.txt,
// cat meeting_schedule.txt, ...) still get a sensible, consistent tooltip.
const COMMAND_KNOWLEDGE_FALLBACK = {
  "pwd": {
    shortDescription: "Shows the current folder.",
    socUse: "Confirms where the analyst is working.",
    whatToLookFor: "Whether you are in the expected directory.",
    beginnerExplanation: "Every terminal session has a \u201ccurrent folder.\u201d pwd (print working directory) tells you exactly where you are so you don't run commands in the wrong place.",
    advancedEquivalent: "pwd",
  },
  "ls": {
    shortDescription: "Lists files and folders.",
    socUse: "Shows which items are available to inspect.",
    whatToLookFor: "Suspicious or unfamiliar filenames.",
    beginnerExplanation: "ls (list) prints the names of everything in the current folder so you can decide what to open next.",
    advancedEquivalent: "ls -la",
  },
  "cd": {
    shortDescription: "Moves into a different folder.",
    socUse: "Lets the analyst navigate to where the evidence lives.",
    whatToLookFor: "That you've landed in the folder you intended to inspect.",
    beginnerExplanation: "cd (change directory) walks you into a folder so you can work with what's inside it.",
    advancedEquivalent: "cd <path>",
  },
  "cat": {
    shortDescription: "Displays the contents of a text file.",
    socUse: "Lets the analyst review a file as possible evidence.",
    whatToLookFor: "Unusual requests, urgent language, or unfamiliar senders.",
    beginnerExplanation: "cat prints a text file straight to the screen so you can read it without opening an editor.",
    advancedEquivalent: "cat <file>",
  },
  "ip": {
    shortDescription: "Shows network address information.",
    socUse: "Helps identify the local workstation's network position.",
    whatToLookFor: "Your IP address and network range.",
    beginnerExplanation: "ip addr lists the network addresses assigned to this machine \u2014 your starting point for mapping the network.",
    advancedEquivalent: "ip addr show / ifconfig",
  },
  "ping": {
    shortDescription: "Tests whether a host is reachable.",
    socUse: "Helps determine if a target system is active.",
    whatToLookFor: "Successful replies or timeouts.",
    beginnerExplanation: "ping sends a small probe and waits for a reply. Replies mean the host is online; a timeout means it isn't responding.",
    advancedEquivalent: "ping -c 4 <host>",
  },
  "nmap": {
    shortDescription: "Scans a host for open services.",
    socUse: "Reveals which services a system is exposing to the network.",
    whatToLookFor: "Open ports and the services running behind them.",
    beginnerExplanation: "nmap checks a host to see which \u201cdoors\u201d (ports) are open and what's listening behind them.",
    advancedEquivalent: "nmap -sV <host>",
  },
  "netstat": {
    shortDescription: "Lists active network connections.",
    socUse: "Helps review who a machine is talking to right now.",
    whatToLookFor: "Repeated sources, external IPs, or unusual connection states.",
    beginnerExplanation: "netstat shows the live connections in and out of a machine, including the address on the other end.",
    advancedEquivalent: "netstat -an / ss -an",
  },
  "ps": {
    shortDescription: "Lists the processes running on a system.",
    socUse: "Helps spot unexpected or malicious programs that are running.",
    whatToLookFor: "Unfamiliar process names or programs that shouldn't be running.",
    beginnerExplanation: "ps aux lists every program currently running on the machine so you can spot anything that looks out of place.",
    advancedEquivalent: "ps aux / ps -ef",
  },
  "whois": {
    shortDescription: "Looks up information about an IP address.",
    socUse: "Helps analysts understand source context.",
    whatToLookFor: "Whether the source is known/legitimate or unfamiliar.",
    beginnerExplanation: "whois queries public registries to tell you who an IP address belongs to.",
    advancedEquivalent: "whois <ip>",
  },
  "grep": {
    shortDescription: "Searches a file for matching text.",
    socUse: "Helps find repeated activity from a source.",
    whatToLookFor: "Repeated hits across services or over time.",
    beginnerExplanation: "grep scans a file and prints only the lines that match what you searched for.",
    advancedEquivalent: "grep <pattern> <file>",
  },
  "review": {
    shortDescription: "Summarizes what you found so far.",
    socUse: "Helps the analyst interpret the evidence before acting.",
    whatToLookFor: "How the individual clues fit together.",
    beginnerExplanation: "This step pauses the investigation so you can think about what your findings mean before deciding what to do.",
  },
};

/** Normalize a command string for lookup (lowercase, single spaces). */
function normalizeCommandText(text) {
  return String(text || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Resolve the learning metadata for a command, by exact text then by verb. */
function getCommandKnowledge(commandText) {
  const norm = normalizeCommandText(commandText);
  if (!norm) return null;
  if (COMMAND_KNOWLEDGE[norm]) return COMMAND_KNOWLEDGE[norm];
  const verb = norm.split(" ")[0];
  return COMMAND_KNOWLEDGE_FALLBACK[verb] || null;
}

/* ------------------------------------------------------------
   Reusable hover/focus tooltip UI for command cards.
   A single shared tooltip node is positioned BESIDE the hovered card
   (right, or left when there's no room) so it never covers the terminal
   input, which sits above the command cards. The tooltip itself is
   interactive so the optional "More detail" expansion is clickable.
   ------------------------------------------------------------ */
let _cmdTipEl = null;
let _cmdTipAnchor = null;
let _cmdTipHideTimer = null;
let _cmdTipGlobalsBound = false;

function ensureCommandTip() {
  if (_cmdTipEl) return _cmdTipEl;
  const tip = document.createElement("div");
  tip.id = "commandKnowledgeTip";
  tip.className = "cmd-tip";
  tip.setAttribute("role", "tooltip");
  tip.style.display = "none";
  const cancelHide = () => {
    if (_cmdTipHideTimer) { clearTimeout(_cmdTipHideTimer); _cmdTipHideTimer = null; }
  };
  tip.addEventListener("mouseenter", cancelHide);
  tip.addEventListener("mouseleave", scheduleHideCommandTip);
  // Keep the tooltip open while keyboard focus is inside it, so the optional
  // "More detail" button is reachable for keyboard users (a11y).
  tip.addEventListener("focusin", cancelHide);
  tip.addEventListener("focusout", scheduleHideCommandTip);
  document.body.appendChild(tip);
  _cmdTipEl = tip;

  if (!_cmdTipGlobalsBound) {
    _cmdTipGlobalsBound = true;
    const reflow = () => {
      if (_cmdTipEl && _cmdTipEl.style.display !== "none" && _cmdTipAnchor) {
        positionCommandTip(_cmdTipAnchor);
      }
    };
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideCommandTip();
    });
  }
  return tip;
}

function buildCommandTipHTML(info, commandText) {
  const rows = [];
  rows.push(`<code class="cmd-tip__cmd">${escapeHtml(commandText)}</code>`);
  rows.push(`<p class="cmd-tip__desc">${escapeHtml(info.shortDescription)}</p>`);
  rows.push(`<dl class="cmd-tip__meta">`);
  rows.push(`<div class="cmd-tip__row"><dt>SOC use</dt><dd>${escapeHtml(info.socUse)}</dd></div>`);
  rows.push(`<div class="cmd-tip__row"><dt>Look for</dt><dd>${escapeHtml(info.whatToLookFor)}</dd></div>`);
  rows.push(`</dl>`);
  if (info.beginnerExplanation || info.advancedEquivalent) {
    rows.push(`<button type="button" class="cmd-tip__more" aria-expanded="false">More detail</button>`);
    rows.push(`<div class="cmd-tip__extra" hidden>`);
    if (info.beginnerExplanation) {
      rows.push(`<p class="cmd-tip__beginner">${escapeHtml(info.beginnerExplanation)}</p>`);
    }
    if (info.advancedEquivalent) {
      rows.push(`<p class="cmd-tip__adv"><span class="cmd-tip__adv-label">Advanced</span> <code>${escapeHtml(info.advancedEquivalent)}</code></p>`);
    }
    rows.push(`</div>`);
  }
  return rows.join("");
}

function showCommandTip(anchor, commandText) {
  const info = getCommandKnowledge(commandText);
  if (!info) return;
  const tip = ensureCommandTip();
  if (_cmdTipHideTimer) { clearTimeout(_cmdTipHideTimer); _cmdTipHideTimer = null; }
  _cmdTipAnchor = anchor;
  tip.innerHTML = buildCommandTipHTML(info, commandText);

  const moreBtn = tip.querySelector(".cmd-tip__more");
  if (moreBtn) {
    moreBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const extra = tip.querySelector(".cmd-tip__extra");
      if (!extra) return;
      const collapsed = extra.hasAttribute("hidden");
      if (collapsed) {
        extra.removeAttribute("hidden");
        moreBtn.textContent = "Less detail";
        moreBtn.setAttribute("aria-expanded", "true");
      } else {
        extra.setAttribute("hidden", "");
        moreBtn.textContent = "More detail";
        moreBtn.setAttribute("aria-expanded", "false");
      }
      positionCommandTip(anchor);
    });
  }

  tip.style.display = "";
  tip.style.visibility = "hidden"; // measure before placing
  positionCommandTip(anchor);
  tip.style.visibility = "";
}

function positionCommandTip(anchor) {
  const tip = _cmdTipEl;
  if (!tip || !anchor) return;
  const r = anchor.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  const gap = 12;
  const pad = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer the right of the card; fall back to the left; clamp into view.
  let left = r.right + gap;
  if (left + tw > vw - pad) left = r.left - gap - tw;
  if (left < pad) left = Math.min(Math.max(pad, r.left), Math.max(pad, vw - tw - pad));

  // Align with the card top; keep fully on screen. Anchored to the card (which
  // sits below the terminal), so the tooltip never covers the terminal input.
  let top = r.top;
  if (top + th > vh - pad) top = vh - th - pad;
  if (top < pad) top = pad;

  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
}

function scheduleHideCommandTip() {
  if (_cmdTipHideTimer) clearTimeout(_cmdTipHideTimer);
  _cmdTipHideTimer = setTimeout(hideCommandTip, 140);
}

function hideCommandTip() {
  if (_cmdTipHideTimer) { clearTimeout(_cmdTipHideTimer); _cmdTipHideTimer = null; }
  if (_cmdTipEl) _cmdTipEl.style.display = "none";
  _cmdTipAnchor = null;
}

/** Attach hover + keyboard-focus learning tooltip to a command card. */
function attachCommandTooltip(el, commandText) {
  if (!el || !commandText) return;
  if (!getCommandKnowledge(commandText)) return;
  el.classList.add("has-cmd-tip");
  el.setAttribute("aria-describedby", "commandKnowledgeTip");
  el.addEventListener("mouseenter", () => showCommandTip(el, commandText));
  el.addEventListener("mouseleave", scheduleHideCommandTip);
  el.addEventListener("focus", () => showCommandTip(el, commandText));
  el.addEventListener("blur", scheduleHideCommandTip);
}

/* ============================================================
   SOC TOOLKIT — always-available, learning-only command reference
   ------------------------------------------------------------
   A small, toggleable panel that lets students browse what each
   command means at their own pace, grouped by purpose. It is
   purely educational: selecting a command ONLY reveals its
   explanation — it never runs a command, loads a terminal, or
   changes any mission state. Assignments 1–3 play identically
   whether or not the Toolkit is ever opened.

   Adding a new command or category later is a DATA-ONLY edit to
   SOC_TOOLKIT below: list its command string under a category and
   (if it isn't already covered) add a matching entry to
   COMMAND_KNOWLEDGE / COMMAND_KNOWLEDGE_FALLBACK. The panel rebuilds
   itself from this array — no per-command wiring is needed. Each
   command resolves through the shared getCommandKnowledge() source so
   explanations stay defined in exactly one place.
   ============================================================ */
const SOC_TOOLKIT = [
  { category: "Network Tools", icon: "🌐", commands: ["ip addr", "ping", "nmap", "netstat"] },
  { category: "Log Tools",     icon: "📑", commands: ["grep"] },
  { category: "Process Tools", icon: "⚙",  commands: ["ps aux"] },
  { category: "File Tools",    icon: "📁", commands: ["pwd", "ls", "cd", "cat"] },
];

let _socToolkitBuilt = false;
let _socToolkitToggleEl = null;
let _socToolkitPanelEl = null;
let _socToolkitBackdropEl = null;

/** Build the five-facet explanation markup for one resolved command entry. */
function buildToolkitCommandFacets(info) {
  const rows = [];
  rows.push(`<p class="soc-tk-desc">${escapeHtml(info.shortDescription)}</p>`);
  rows.push(`<dl class="soc-tk-meta">`);
  rows.push(`<div class="soc-tk-row"><dt>SOC use</dt><dd>${escapeHtml(info.socUse)}</dd></div>`);
  rows.push(`<div class="soc-tk-row"><dt>Look for</dt><dd>${escapeHtml(info.whatToLookFor)}</dd></div>`);
  if (info.beginnerExplanation) {
    rows.push(`<div class="soc-tk-row"><dt>Beginner</dt><dd>${escapeHtml(info.beginnerExplanation)}</dd></div>`);
  }
  if (info.advancedEquivalent) {
    rows.push(`<div class="soc-tk-row"><dt>Advanced</dt><dd><code>${escapeHtml(info.advancedEquivalent)}</code></dd></div>`);
  }
  rows.push(`</dl>`);
  return rows.join("");
}

/** Render the grouped command list into the panel body from SOC_TOOLKIT. */
function renderSocToolkitBody(host) {
  if (!host) return;
  host.innerHTML = "";
  SOC_TOOLKIT.forEach((group) => {
    const cmds = group.commands
      .map((command) => ({ command, info: getCommandKnowledge(command) }))
      .filter((x) => x.info);
    if (!cmds.length) return; // skip a category whose commands lack knowledge entries

    const section = document.createElement("section");
    section.className = "soc-tk-group";

    const head = document.createElement("h3");
    head.className = "soc-tk-group-title";
    head.innerHTML =
      `<span class="soc-tk-group-icon" aria-hidden="true">${escapeHtml(group.icon || "›")}</span>` +
      escapeHtml(group.category);
    section.appendChild(head);

    cmds.forEach(({ command, info }) => {
      const item = document.createElement("div");
      item.className = "soc-tk-item";

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "soc-tk-cmd";
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML =
        `<code class="soc-tk-cmd-code">${escapeHtml(command)}</code>` +
        `<span class="soc-tk-cmd-short">${escapeHtml(info.shortDescription)}</span>` +
        `<span class="soc-tk-cmd-caret" aria-hidden="true">▸</span>`;

      const detail = document.createElement("div");
      detail.className = "soc-tk-detail";
      detail.hidden = true;
      detail.innerHTML = buildToolkitCommandFacets(info);

      // Learning-only: this ONLY shows/hides the explanation. It never runs the
      // command, loads a terminal, or mutates mission state.
      btn.addEventListener("click", () => {
        const willOpen = detail.hidden;
        detail.hidden = !willOpen;
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
        item.classList.toggle("soc-tk-item--open", willOpen);
      });

      item.appendChild(btn);
      item.appendChild(detail);
      section.appendChild(item);
    });

    host.appendChild(section);
  });
}

function isSocToolkitOpen() {
  return !!(_socToolkitPanelEl && _socToolkitPanelEl.classList.contains("is-open"));
}

function openSocToolkit() {
  if (_socToolkitPanelEl) {
    _socToolkitPanelEl.classList.add("is-open");
    _socToolkitPanelEl.setAttribute("aria-hidden", "false");
  }
  if (_socToolkitBackdropEl) _socToolkitBackdropEl.classList.add("is-open");
  if (_socToolkitToggleEl) _socToolkitToggleEl.setAttribute("aria-expanded", "true");
  const closeBtn = _socToolkitPanelEl && _socToolkitPanelEl.querySelector(".soc-tk-close");
  if (closeBtn) closeBtn.focus();
}

function closeSocToolkit() {
  if (_socToolkitPanelEl) {
    _socToolkitPanelEl.classList.remove("is-open");
    _socToolkitPanelEl.setAttribute("aria-hidden", "true");
  }
  if (_socToolkitBackdropEl) _socToolkitBackdropEl.classList.remove("is-open");
  if (_socToolkitToggleEl) {
    _socToolkitToggleEl.setAttribute("aria-expanded", "false");
    _socToolkitToggleEl.focus();
  }
}

/** Mount the floating toggle + reference panel once, then render its contents. */
function initSocToolkit() {
  if (_socToolkitBuilt) return;
  _socToolkitBuilt = true;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.id = "socToolkitToggle";
  toggle.className = "soc-toolkit-toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "socToolkitPanel");
  toggle.innerHTML =
    `<span class="soc-tk-toggle-icon" aria-hidden="true">🧰</span>` +
    `<span class="soc-tk-toggle-label">SOC Toolkit</span>`;
  document.body.appendChild(toggle);
  _socToolkitToggleEl = toggle;

  const backdrop = document.createElement("div");
  backdrop.className = "soc-toolkit-backdrop";
  document.body.appendChild(backdrop);
  _socToolkitBackdropEl = backdrop;

  const panel = document.createElement("aside");
  panel.id = "socToolkitPanel";
  panel.className = "soc-toolkit-panel";
  panel.setAttribute("aria-hidden", "true");
  panel.setAttribute("aria-label", "SOC Toolkit — command reference");
  panel.innerHTML =
    `<div class="soc-tk-head">` +
      `<div class="soc-tk-head-text">` +
        `<span class="soc-tk-eyebrow">REFERENCE</span>` +
        `<h2 class="soc-tk-title">SOC Toolkit</h2>` +
        `<p class="soc-tk-sub">What each command does and why an analyst uses it. Learning only — nothing here runs.</p>` +
      `</div>` +
      `<button type="button" class="soc-tk-close" aria-label="Close SOC Toolkit">✕</button>` +
    `</div>` +
    `<div class="soc-tk-body" id="socToolkitBody"></div>`;
  document.body.appendChild(panel);
  _socToolkitPanelEl = panel;

  renderSocToolkitBody(panel.querySelector("#socToolkitBody"));

  toggle.addEventListener("click", () => {
    if (isSocToolkitOpen()) closeSocToolkit();
    else openSocToolkit();
  });
  const closeBtn = panel.querySelector(".soc-tk-close");
  if (closeBtn) closeBtn.addEventListener("click", closeSocToolkit);
  backdrop.addEventListener("click", closeSocToolkit);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isSocToolkitOpen()) closeSocToolkit();
  });
}

/* ============================================================
   KEYBOARD INPUT (optional — typed commands bypass unlock logic)
   ============================================================ */

function initTerminalInput() {
  // FIX 1 — clicking anywhere in either terminal skips the paced output reveal.
  ["terminalOutput", "m2Terminal"].forEach((id) => {
    const c = document.getElementById(id);
    if (c) c.addEventListener("click", () => {
      if (outputRevealQueue.length) flushTerminalOutput();
    });
  });
  // Milestone 35A — Assignment 2 & 3 terminals are now student-driven too:
  // press Enter to run the loaded/typed command through the same parser.
  if (m2TerminalInput) {
    m2TerminalInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const typed = m2TerminalInput.value;
      m2TerminalInput.value = "";
      submitM2TerminalInput(typed);
    });
  }
  if (m3TerminalInput) {
    m3TerminalInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const typed = m3TerminalInput.value;
      m3TerminalInput.value = "";
      submitM3TerminalInput(typed);
    });
  }
  if (!terminalInput) return;
  terminalInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const typed = terminalInput.value;
      terminalInput.value = "";
      runCommand(typed, "");
    }
  });
}

const clrButton = document.querySelector(".terminal-btn");
if (clrButton) clrButton.addEventListener("click", () => {
  clearTerminal();
  printBootMessages();
});


/* ============================================================
   MODULE LANDING  (Milestone 10)
   Visibility-only toggle between the landing screen and the live
   dashboard. Does NOT reset mission progress — students can come
   back to the module overview mid-mission and resume seamlessly.
   The existing "Begin Mission" gate inside the mission panel
   remains in place after entering the module.
   ============================================================ */

/* ============================================================
   Milestone 32A — Cyber Operations Career Entry Experience.
   renderOperationsCenter() reflects the player's locally-saved
   progress onto the Operations Center home screen: career-track
   promotion progress, Active Assignment statuses (mapped to the
   existing missions), Sarah Reyes' manager direction, the live
   threat/containment line, and the analyst XP / trust chips.
   Pure presentation — reads existing state only (missionComplete,
   mission2Complete, currentXP, trustScore). Every element is
   guarded so it no-ops if the home markup isn't present.
   ============================================================ */
function setOpsAssignment(rowId, statusId, label, state) {
  const row = document.getElementById(rowId);
  const badge = document.getElementById(statusId);
  if (badge) badge.textContent = label;
  if (row) {
    row.classList.remove(
      "ops-assign--available", "ops-assign--completed",
      "ops-assign--locked", "ops-assign--monitoring"
    );
    row.classList.add(`ops-assign--${state}`);
  }
}

/* ============================================================
   OPS CENTER V2 — Three-Panel Layout  (graduated from prototype)
   ------------------------------------------------------------
   Wired to real localStorage progress + mission data. Pure
   presentation layer: never writes state, never calls saveProgress.
   Entry points:
     renderOcPanelV2()  — called from renderOperationsCenter() to
                          sync alert feed + node states + analyst name.
     initOcv2()         — called once (guarded) to wire up clock,
                          ticker, comms, node clicks, incident card.
   ============================================================ */

/**
 * OCV2-specific presentation data for the three world-map nodes.
 * Narrative fields (title / briefing text / threat type) are NOT stored
 * here — they are read at call time from MISSION_MAP (the canonical
 * source) to prevent divergence. Only data that has no equivalent in
 * MISSION_MAP lives here: map severity classification, geographic region
 * label, and the comms-character metadata for the SOC right panel.
 */
const OCV2_NODE_META = {
  "mission-001": {
    severity:    "CRITICAL",
    region:      "EMEA REGION",
    commsAuthor: "lead",
    commsName:   "Sarah Reyes",
    commsRole:   "SOC Lead",
  },
  "mission-002": {
    severity:    "HIGH",
    region:      "APAC REGION",
    commsAuthor: "intel",
    commsName:   "Marcus Chen",
    commsRole:   "Threat Intel",
  },
  "mission-003": {
    severity:    "HIGH",
    region:      "NA-EAST REGION",
    commsAuthor: "cmd",
    commsName:   "Cmdr. Brooks",
    commsRole:   "Incident Cmd",
  },
};

const OCV2_TICKER_IOCS = [
  { sev: "critical", text: "IOC: external-reyes@cybercorp-support[.]net — Active credential phishing domain" },
  { sev: "high",     text: "Network exposure on target APAC host — 4 open services require triage" },
  { sev: "high",     text: "External source repeatedly contacting internal NA-East services — recon pattern confirmed" },
  { sev: "info",     text: "CISA AA26-071A: CVE-2026-1033 active exploitation confirmed in enterprise VPN appliances" },
  { sev: "medium",   text: "PowerShell obfuscation pattern detected — NA-EAST endpoint — policy alert triggered" },
  { sev: "high",     text: "Domain: cybercorp-support[.]net — Bulletproof hosting AS8003 — confirmed malicious" },
  { sev: "info",     text: "Threat feed update: 148 new IOCs ingested from MISP — SIEM rules refreshed" },
  { sev: "medium",   text: "Anomalous auth events — multiple failed MFA challenges on privileged accounts" },
  { sev: "critical", text: "Finance workstation — suspicious file requesting credential share to external domain" },
  { sev: "high",     text: "Shodan fingerprinting signatures detected against internal service endpoints" },
];

const OCV2_INTEL_ITEMS = [
  { kind: "threat",  text: "Phishing domain cybercorp-support[.]net traced to bulletproof hosting AS8003." },
  { kind: "network", text: "Target host in APAC segment — services 22, 80, 443, 8080 confirmed reachable." },
  { kind: "recon",   text: "External probe pattern consistent with Shodan fingerprinting methodology." },
  { kind: "info",    text: "CISA advisory AA26-071A: active exploitation of CVE-2026-1033 in VPN appliances." },
  { kind: "threat",  text: "Credential collection via spoofed executive domain active for 48+ hours." },
];

/**
 * Character-specific completion acknowledgements for the SOC comms feed, keyed
 * by mission and outcome tier. The responsible character (Sarah / Marcus /
 * Brooks — see OCV2_NODE_META) reacts to how the assignment went so the Ops
 * Center feels alive when the player returns. M1 tiers are excellent / reactive
 * / delayed / weak; M2 & M3 are excellent / delayed / weak (lowercased labels).
 */
const OCV2_COMPLETION_COMMS = {
  "mission-001": {
    excellent: "Phishing assignment closed — clean containment, zero spread. Textbook work, analyst. The EMEA node is dark.",
    reactive:  "Threat was already moving, but you stabilized it fast — solid reactive recovery. EMEA node is clear.",
    delayed:   "Credential phishing handled, though it expanded a little before you locked it down. EMEA node is clear — let's tighten the timing next round.",
    weak:      "EMEA phishing incident is closed, but the response lagged and the threat gained ground. We'll debrief on faster containment.",
  },
  "mission-002": {
    excellent: "APAC exposure review complete — correct call, no scope drift, high confidence. Host is locked down. Sharp triage, analyst.",
    delayed:   "APAC network recommendation landed — right answer, just took a few detours. Exposure closed. Tighten the scope next time.",
    weak:      "APAC host is contained, but the ideal Blue Team recommendation slipped past. Good effort — let's sharpen the analysis.",
  },
  "mission-003": {
    excellent: "NA-East recon detection wrapped — correct report-and-monitor call, clean and confident. Outstanding work, analyst.",
    delayed:   "NA-East recon assignment closed — right recommendation reached after some drift. Source is on the monitor list.",
    weak:      "NA-East reconnaissance reported, but the optimal call was missed. Source is monitored — review the decision tree with me.",
  },
};

/**
 * Build the initial SOC comms feed from canonical MISSION_MAP transmission
 * text.  The `transmission` field on each MISSION_MAP entry is the official
 * in-world briefing voice for that assignment; reusing it here keeps the
 * narrative single-sourced and prevents copy drift.
 */
function ocv2BuildInitialComms() {
  const m1 = MISSION_MAP["mission-001"] || {};
  const m2 = MISSION_MAP["mission-002"] || {};
  const m3 = MISSION_MAP["mission-003"] || {};
  return [
    { author: "lead",   name: "Sarah Reyes",  role: "SOC Lead",
      time: "06:10", text: m1.transmission || "Blue Team active. Assignments are pending." },
    { author: "intel",  name: "Marcus Chen",  role: "Threat Intel",
      time: "06:11", text: m2.transmission || "APAC network exposure scoped. Awaiting triage assignment." },
    { author: "cmd",    name: "Cmdr. Brooks", role: "Incident Cmd",
      time: "06:12", text: m3.transmission || "NA-East monitoring elevated. External recon pattern is persistent." },
    { author: "junior", name: "Alex Torres",  role: "Junior Analyst",
      time: "06:13", text: "All assignments queued. Standing by for analyst deployment." },
  ];
}

/** Module-level state for the ops center panel. */
let ocv2ActiveNodeId = null;
let ocv2Initialized  = false;

/**
 * Deep-link mission ID set when the player arrives from the prototype OC via
 * a ?mission= URL param.  Cleared once the auto-launch fires so it doesn't
 * re-trigger on subsequent navigations.
 */
let pendingDeepLinkMission = null;

/** Return HH:MM UTC string for comms timestamps. */
function ocv2NowTime() {
  const n = new Date();
  return String(n.getUTCHours()).padStart(2,"0") + ":" + String(n.getUTCMinutes()).padStart(2,"0");
}

/** Tick the live UTC clock in the header. */
function ocv2UpdateClock() {
  const n  = new Date();
  const hh = String(n.getUTCHours()).padStart(2,"0");
  const mm = String(n.getUTCMinutes()).padStart(2,"0");
  const ss = String(n.getUTCSeconds()).padStart(2,"0");
  const el = document.getElementById("ocv2Clock");
  if (el) el.textContent = `${hh}:${mm}:${ss} UTC`;
}

/** Append one message to the SOC comms feed. Caps the feed at 14 items. */
function ocv2RenderCommsMsg(data) {
  const feed = document.getElementById("ocv2CommsFeed");
  if (!feed) return;
  const el   = document.createElement("div");
  el.className = "ocv2-comms-msg";
  const time    = data.time || ocv2NowTime();
  const initials = data.name.split(" ").map((p) => p[0]).join("").slice(0, 2);
  el.innerHTML = `
    <div class="ocv2-comms-av ocv2-av--${escapeHtml(data.author)}">${escapeHtml(initials)}</div>
    <div class="ocv2-comms-body">
      <div class="ocv2-comms-meta">
        <span class="ocv2-comms-name ocv2-comms-name--${escapeHtml(data.author)}">${escapeHtml(data.name)}</span>
        <span class="ocv2-comms-role">// ${escapeHtml(data.role)}</span>
        <span class="ocv2-comms-time">${escapeHtml(time)}</span>
      </div>
      <div class="ocv2-comms-text">${escapeHtml(data.text)}</div>
    </div>`;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  while (feed.children.length > 14) feed.removeChild(feed.firstChild);
}

/** Fill the IOC ticker with two copies so the loop is seamless. */
function ocv2InitTicker() {
  const track = document.getElementById("ocv2TickerTrack");
  if (!track || track.children.length) return; // already populated
  const items = [...OCV2_TICKER_IOCS, ...OCV2_TICKER_IOCS]; // duplicate for seamless loop
  items.forEach((ioc) => {
    const el = document.createElement("span");
    el.className = "ocv2-ticker-item";
    el.innerHTML = `<span class="ocv2-ticker-sev ocv2-ticker-sev--${escapeHtml(ioc.sev)}">${escapeHtml(ioc.sev.toUpperCase())}</span>${escapeHtml(ioc.text)}`;
    track.appendChild(el);
  });
}

/** Fill the intel feed (left panel, lower section). Idempotent. */
function ocv2InitIntelFeed() {
  const feed = document.getElementById("ocv2IntelFeed");
  if (!feed || feed.children.length) return; // already populated
  OCV2_INTEL_ITEMS.forEach((item) => {
    const el = document.createElement("div");
    el.className = `ocv2-intel-item ocv2-intel--${escapeHtml(item.kind)}`;
    el.innerHTML = `<span class="ocv2-intel-dot" aria-hidden="true"></span><span class="ocv2-intel-text">${escapeHtml(item.text)}</span>`;
    feed.appendChild(el);
  });
}

/**
 * Redirect attention to the signin strip and pulse its border when a player
 * tries to interact with the Ops Center before starting their shift.
 */
function ocv2PromptOnboarding() {
  const strip = document.querySelector(".ocv2-signin-strip");
  const nameInput = document.getElementById("studentNameInput");
  if (strip) {
    strip.classList.remove("ocv2-signin--pulse");
    // Force reflow so re-adding the class restarts the animation.
    void strip.offsetWidth;
    strip.classList.add("ocv2-signin--pulse");
    strip.addEventListener("animationend", () => strip.classList.remove("ocv2-signin--pulse"), { once: true });
  }
  if (nameInput) nameInput.focus();
}

function showOcv2IncidentCard(missionId) {
  // Onboarding gate: mission cards must not open before the analyst has
  // started their shift (name entry → enterModule side effects: saveProgress,
  // soundtrack, loader). Returning players have studentName from loadProgress().
  if (!studentName || !studentName.trim()) {
    ocv2PromptOnboarding();
    return;
  }

  // Presentation-only metadata (severity, region, comms character).
  const meta = OCV2_NODE_META[missionId];
  if (!meta) return;

  // Narrative content sourced from the canonical MISSION_MAP entry.
  const mapData = MISSION_MAP[missionId] || {};

  ocv2ActiveNodeId = missionId;

  // Highlight the selected node; deselect all others.
  document.querySelectorAll(".ocv2-node[data-mission]").forEach((n) =>
    n.classList.remove("ocv2-node--active"));
  const nodeIds = { "mission-001": "ocv2NodeEmea", "mission-002": "ocv2NodeApac", "mission-003": "ocv2NodeNaEast" };
  const node = document.getElementById(nodeIds[missionId] || "");
  if (node) node.classList.add("ocv2-node--active");

  const m1Done = !!missionComplete;
  const m2Done = !!mission2Complete;
  const m3Done = !!mission3Complete;
  const isLocked = (missionId === "mission-002" && !m1Done) ||
                   (missionId === "mission-003" && !m2Done);
  const isDone   = (missionId === "mission-001" && m1Done) ||
                   (missionId === "mission-002" && m2Done) ||
                   (missionId === "mission-003" && m3Done);

  const card = document.getElementById("ocv2IncidentCard");
  if (!card) return;

  card.setAttribute("data-severity", meta.severity);
  card.style.display = "block";

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set("ocv2CardSev",    meta.severity);
  set("ocv2CardRegion", meta.region);
  // Title, briefing description, and threat type come from MISSION_MAP — single source of truth.
  set("ocv2CardTitle",  mapData.title    || missionId);
  set("ocv2CardDesc",   mapData.briefing || "—");
  set("ocv2CardThreat", mapData.threat   || "—");
  set("ocv2CardStatus", isDone ? "Completed" : isLocked ? "Locked — complete prior assignment first" : "Active — pending investigation");

  const launchBtn   = document.getElementById("ocv2LaunchBtn");
  const lockedNote  = document.getElementById("ocv2LockedNote");
  if (launchBtn)  {
    launchBtn.style.display = isLocked ? "none" : "block";
    if (!isLocked) launchBtn.textContent = `▶\u00a0${isDone ? "REPLAY" : "LAUNCH"} INVESTIGATION`;
  }
  if (lockedNote) lockedNote.style.display = isLocked ? "block" : "none";

  // Post a contextual comms message using the mission's canonical transmission
  // text attributed to the character responsible for this node.
  if (mapData.transmission) {
    setTimeout(() => ocv2RenderCommsMsg({
      author: meta.commsAuthor,
      name:   meta.commsName,
      role:   meta.commsRole,
      text:   mapData.transmission,
      time:   null,
    }), 600);
  }
}

/** Hide the incident card and deselect all nodes. */
function hideOcv2IncidentCard() {
  const card = document.getElementById("ocv2IncidentCard");
  if (card) card.style.display = "none";
  document.querySelectorAll(".ocv2-node[data-mission]").forEach((n) =>
    n.classList.remove("ocv2-node--active"));
  ocv2ActiveNodeId = null;
}

/**
 * Post a character-specific completion acknowledgement to the SOC comms feed
 * when the player finishes an assignment, so the Ops Center reflects the win
 * live the moment they return (no reload). The responsible character reacts to
 * the outcome tier of the run. Presentation-only: reads outcome state, writes
 * nothing persistent. ocv2RenderCommsMsg is a no-op if the feed isn't mounted
 * and self-caps the feed at 14 messages.
 */
function ocv2PostCompletionComms(missionId) {
  const meta = OCV2_NODE_META[missionId];
  if (!meta) return;

  // Normalize each mission's outcome tier to the shared comms keys.
  let tier = "excellent";
  try {
    if (missionId === "mission-001") {
      tier = m1OutcomeVariation().key;            // excellent|reactive|delayed|weak
    } else if (missionId === "mission-002") {
      tier = (m2OutcomeTier().label || "").toLowerCase(); // excellent|delayed|weak
    } else if (missionId === "mission-003") {
      tier = (m3OutcomeTier().label || "").toLowerCase(); // excellent|delayed|weak
    }
  } catch (_) { /* fall back to the neutral excellent line */ }

  const byTier = OCV2_COMPLETION_COMMS[missionId] || {};
  const text = byTier[tier] || byTier.excellent || "Assignment closed. Good work, analyst.";

  ocv2RenderCommsMsg({
    author: meta.commsAuthor,
    name:   meta.commsName,
    role:   meta.commsRole,
    text,
    time:   null,
  });
}

/**
 * One-time initialization of the ops center panel.
 * Called (guarded) from renderOcPanelV2() on first render.
 * Wires: clock tick, ticker, intel feed, comms seed, node clicks,
 *        card close, launch button, click-outside dismiss, Escape key.
 */
function initOcv2() {
  if (ocv2Initialized) return;
  ocv2Initialized = true;

  // Live UTC clock
  ocv2UpdateClock();
  setInterval(ocv2UpdateClock, 1000);

  // Static feeds (idempotent)
  ocv2InitIntelFeed();
  ocv2InitTicker();

  // Seed the comms feed with initial team messages derived from MISSION_MAP.
  const feed = document.getElementById("ocv2CommsFeed");
  if (feed && !feed.children.length) {
    ocv2BuildInitialComms().forEach((msg) => ocv2RenderCommsMsg(msg));
  }

  // Wire mission-node buttons (EMEA / APAC / NA-EAST)
  document.querySelectorAll(".ocv2-node[data-mission]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mid = btn.getAttribute("data-mission");
      if (ocv2ActiveNodeId === mid) {
        hideOcv2IncidentCard(); // second click toggles off
      } else {
        showOcv2IncidentCard(mid);
      }
    });
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); btn.click(); }
    });
  });

  // Close button on the incident card
  const closeBtn = document.getElementById("ocv2CardClose");
  if (closeBtn) closeBtn.addEventListener("click", hideOcv2IncidentCard);

  // "Launch Investigation" → hand off to existing mission launch flow
  const launchBtn = document.getElementById("ocv2LaunchBtn");
  if (launchBtn) {
    launchBtn.addEventListener("click", () => {
      const mid = ocv2ActiveNodeId;
      if (!mid) return;
      hideOcv2IncidentCard();
      launchMissionFromMap(mid);
    });
  }

  // Click outside the card (but not on a node) to dismiss it
  const mapContainer = document.getElementById("ocv2MapContainer");
  if (mapContainer) {
    mapContainer.addEventListener("click", (e) => {
      const card = document.getElementById("ocv2IncidentCard");
      if (!card || card.style.display === "none") return;
      if (!card.contains(e.target) && !e.target.closest(".ocv2-node[data-mission]")) {
        hideOcv2IncidentCard();
      }
    });
  }

  // Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ocv2ActiveNodeId) hideOcv2IncidentCard();
  });
}

/**
 * Render the three-panel ops center elements from live progress state.
 * Called at the end of renderOperationsCenter() — idempotent, read-only.
 */
function renderOcPanelV2() {
  const m1Done = !!missionComplete;
  const m2Done = !!mission2Complete;
  const m3Done = !!mission3Complete;

  // Analyst name in header
  const nameEl = document.getElementById("ocv2AnalystName");
  if (nameEl) {
    nameEl.textContent = (studentName && studentName.trim())
      ? studentName.trim().toUpperCase()
      : "GHOST_ZERO";
  }

  // Analyst XP + Trust sub-chips (derived from existing state, no new persistence)
  const xpEl = document.getElementById("ocv2AnalystXp");
  if (xpEl) {
    const xp = (typeof currentXP === "number" && isFinite(currentXP)) ? Math.max(0, Math.round(currentXP)) : 0;
    xpEl.textContent = `XP ${xp}`;
  }
  const trustEl = document.getElementById("ocv2AnalystTrust");
  if (trustEl) {
    const trust = clampTrust(typeof trustScore === "number" ? trustScore : DEFAULT_TRUST_SCORE);
    trustEl.textContent = `TRUST ${Math.round(trust)}`;
  }

  // Alert feed — 3 mission-derived items
  const feed = document.getElementById("ocv2AlertFeed");
  if (feed) {
    const m2Avail  = m1Done;
    const m3Avail  = m2Done;
    const m1Sev    = m1Done ? "ok"       : "critical";
    const m2Sev    = m2Done ? "ok"       : (m2Avail ? "high" : "locked");
    const m3Sev    = m3Done ? "ok"       : (m3Avail ? "high" : "locked");

    // Names and regions sourced from MISSION_MAP (canonical) and OCV2_NODE_META.
    const alerts = [
      { id: "mission-001", sev: m1Sev,
        name:   (MISSION_MAP["mission-001"] || {}).title  || "Mission 001",
        region: ((OCV2_NODE_META["mission-001"] || {}).region || "EMEA").split(" ")[0],
        time: "06:14" },
      { id: "mission-002", sev: m2Sev,
        name:   (MISSION_MAP["mission-002"] || {}).title  || "Mission 002",
        region: ((OCV2_NODE_META["mission-002"] || {}).region || "APAC").split(" ")[0],
        time: "04:38" },
      { id: "mission-003", sev: m3Sev,
        name:   (MISSION_MAP["mission-003"] || {}).title  || "Mission 003",
        region: ((OCV2_NODE_META["mission-003"] || {}).region || "NA-EAST").split(" ")[0],
        time: "03:52" },
    ];

    feed.innerHTML = "";
    alerts.forEach((a) => {
      const isCompleted = a.sev === "ok";
      const isLocked    = a.sev === "locked";
      const el = document.createElement("div");
      el.className = [
        "ocv2-alert-item",
        isCompleted ? "ocv2-alert--completed" : "",
        isLocked    ? "ocv2-alert--locked"    : "",
      ].filter(Boolean).join(" ");

      const sevLabel = isCompleted ? "CLOSED" : isLocked ? "LOCKED" : a.sev.toUpperCase();
      const sevKey   = isCompleted ? "ok"     : isLocked ? "locked" : a.sev;
      el.innerHTML = `
        <div class="ocv2-alert-top">
          <span class="ocv2-alert-sev ocv2-alert-sev--${escapeHtml(sevKey)}">${escapeHtml(sevLabel)}</span>
          <span class="ocv2-alert-name">${escapeHtml(a.name)}</span>
        </div>
        <div class="ocv2-alert-meta">
          <span class="ocv2-alert-region">${escapeHtml(a.region)}</span>
          <span class="ocv2-alert-time">${escapeHtml(a.time)}</span>
        </div>`;

      // Clicking an alert row also opens the incident card (except locked items)
      if (!isLocked) {
        el.style.cursor = "pointer";
        el.addEventListener("click", () => showOcv2IncidentCard(a.id));
      }
      feed.appendChild(el);
    });

    // Update the alert count badge
    const badge = document.getElementById("ocv2AlertCount");
    const activeN = alerts.filter((a) => a.sev !== "ok" && a.sev !== "locked").length;
    if (badge) badge.textContent = `${activeN} ACTIVE`;
  }

  // Update node locked / completed visual state
  const nodeIds = {
    "mission-001": "ocv2NodeEmea",
    "mission-002": "ocv2NodeApac",
    "mission-003": "ocv2NodeNaEast",
  };
  const nodeStates = {
    "mission-001": m1Done ? "completed" : "active",
    "mission-002": m2Done ? "completed" : (m1Done ? "active" : "locked"),
    "mission-003": m3Done ? "completed" : (m2Done ? "active" : "locked"),
  };
  Object.entries(nodeIds).forEach(([mid, nid]) => {
    const node = document.getElementById(nid);
    if (!node) return;
    const state = nodeStates[mid];
    node.classList.toggle("ocv2-node--locked", state === "locked");
    node.classList.toggle("ocv2-node--done",   state === "completed");
    // aria-disabled prevents interaction on locked nodes (no pointer-events)
    if (state === "locked") {
      node.setAttribute("aria-disabled", "true");
      node.setAttribute("tabindex", "-1");
    } else {
      node.removeAttribute("aria-disabled");
      node.setAttribute("tabindex", "0");
    }
  });

  // Refresh incident card if it's visible (state may have changed)
  if (ocv2ActiveNodeId) showOcv2IncidentCard(ocv2ActiveNodeId);

  // Wire on first render (guarded internally)
  initOcv2();
}

function renderOperationsCenter() {
  const home = document.getElementById("moduleLanding");
  if (!home) return;

  const m1Done = !!missionComplete;
  const m2Done = !!mission2Complete;
  const m3Done = !!mission3Complete;
  const missionsDone = (m1Done ? 1 : 0) + (m2Done ? 1 : 0) + (m3Done ? 1 : 0);

  // Promotion progress toward Junior SOC Analyst: completed assignments are the
  // primary driver, with XP contributing a smaller, smoother share. Clamped 0–100.
  const xpFrac = MAX_XP > 0 ? Math.min(1, Math.max(0, currentXP / MAX_XP)) : 0;
  const promo = Math.max(0, Math.min(100,
    Math.round((missionsDone / 3) * 70 + xpFrac * 30)
  ));
  const promoBar = document.getElementById("opsPromoBar");
  const promoPct = document.getElementById("opsPromoPct");
  if (promoBar) promoBar.style.width = `${promo}%`;
  if (promoPct) promoPct.textContent = `${promo}%`;
  // Phase 2 — once all Intern assignments are cleared, the promotion line reads
  // as readiness for the next role rather than progress toward it.
  const promoText = document.getElementById("opsPromoText");
  if (promoText) {
    promoText.textContent = m3Done
      ? "ready for Junior SOC Analyst review"
      : "toward Junior SOC Analyst";
  }

  // Active Assignments → existing missions.
  setOpsAssignment("opsAssign1", "opsAssign1Status",
    m1Done ? "Completed" : "Available",
    m1Done ? "completed" : "available");
  setOpsAssignment("opsAssign2", "opsAssign2Status",
    m2Done ? "Completed" : (m1Done ? "Available" : "Locked"),
    m2Done ? "completed" : (m1Done ? "available" : "locked"));
  // Assignment 3 (Mission 3) — available once the network exposure review is done.
  setOpsAssignment("opsAssign3", "opsAssign3Status",
    m3Done ? "Completed" : (m2Done ? "Available" : "Locked"),
    m3Done ? "completed" : (m2Done ? "available" : "locked"));

  // Manager direction (Sarah Reyes) adapts to progress. Milestone 33A — it now
  // also recognizes prior operations and reflects cumulative operational behavior
  // (manager trust evolution), so the world feels persistent and the manager
  // "remembers" how the analyst has performed.
  const mgr = document.getElementById("opsManagerMsg");
  if (mgr) {
    const base = "Welcome to Blue Team Operations. Your first assignments are " +
      "designed to build your investigation, evidence handling, and incident " +
      "response judgment.";
    let next, recog = "";
    if (!m1Done) {
      next = "Start with Credential Phishing Investigation.";
    } else if (!m2Done) {
      next = "Your next assignment is Network Exposure Review.";
      recog = "Previous phishing incident successfully contained.";
    } else if (!m3Done) {
      next = "Your next assignment is Reconnaissance Detection — operational complexity is increasing.";
      recog = "You handled the network exposure review well.";
    } else {
      // End-of-track direction: all Intern assignments cleared. Point the
      // analyst toward promotion readiness.
      next = "You're ready for Junior SOC Analyst review — strong work across all three assignments.";
      recog = "Reconnaissance activity was detected and reported correctly.";
    }
    const evolution = managerTrustEvolutionMessage();
    mgr.textContent = [base, recog, evolution, next].filter(Boolean).join(" ");
  }

  // Live threat / containment line + analyst chips.
  const contain = document.getElementById("opsContainStatus");
  if (contain) contain.textContent = missionsDone > 0 ? "Stable" : "In Progress";
  const xpChip = document.getElementById("opsAnalystXp");
  if (xpChip) xpChip.textContent = String(Math.max(0, Math.round(currentXP)));
  const trustChip = document.getElementById("opsAnalystTrust");
  if (trustChip) trustChip.textContent = String(Math.max(0, Math.round(trustScore)));

  // Phase 2 — living SOC board. The threat rows react to operational progress so
  // the environment feels persistent: as Blue Team contains each threat, the rows
  // flip from "watch" to "contained", while Red Team reconnaissance pressure rises
  // (Blue/Red rhythm) and foreshadows the upcoming Reconnaissance Detection work.
  const setThreatRow = (id, text, tone) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("ops-threat-row--watch", "ops-threat-row--info", "ops-threat-row--ok");
    el.classList.add(`ops-threat-row--${tone}`);
    el.innerHTML = `<span class="ops-threat-dot" aria-hidden="true"></span>${escapeHtml(text)}`;
  };
  setThreatRow("opsThreatPhishing",
    m1Done ? "Credential phishing activity contained" : "Credential phishing activity detected",
    m1Done ? "ok" : "watch");
  setThreatRow("opsThreatProbing",
    m2Done ? "Exposed network services reviewed" : "External probing activity monitored",
    m2Done ? "ok" : "watch");
  setThreatRow("opsThreatRecon",
    m3Done ? "Reconnaissance activity detected and reported"
           : (m2Done ? "Reconnaissance pressure increasing — detection assignment pending"
                     : "Reconnaissance activity under observation"),
    m3Done ? "ok" : (m2Done ? "watch" : "info"));

  // Red Team rhythm: monitored → active → escalating (recon) as Blue Team clears
  // assignments. Updates only the value/strong + the row tone (keeps the label).
  const redTeam = document.getElementById("opsRedTeamStatus");
  if (redTeam) redTeam.textContent = missionsDone >= 2 ? "Escalating (Recon)" : (missionsDone === 1 ? "Active" : "Monitored");
  const redRow = document.getElementById("opsThreatRedTeam");
  if (redRow) {
    redRow.classList.toggle("ops-threat-row--watch", missionsDone >= 2);
    redRow.classList.toggle("ops-threat-row--info", missionsDone < 2);
  }

  // Milestone 33A — persistent world recognition: once any operation is on
  // record, Blue Team readiness improves visibly on the threat board.
  const readinessRow = document.getElementById("opsReadinessRow");
  if (readinessRow) readinessRow.style.display = missionsDone > 0 ? "" : "none";

  // Milestone 33A — refresh the persistent Analyst Profile / reputation / history.
  renderAnalystProfile();

  // Ops Center V2 — sync the three-panel layout elements (alert feed, node
  // states, analyst name) and initialize the panel on first call.
  renderOcPanelV2();
}

/* ============================================================
   Milestone 33A — Persistent Player Identity & Career Reputation
   ------------------------------------------------------------
   A lightweight, PROFESSIONAL reputation layer (no RPG, no fantasy,
   no raw stat dashboards). Reputation is DERIVED at render time from
   signals the game already persists, so it survives reload without a
   second progress system. Only `operationalHistory` is new state.

   Public API (per the task spec):
     - calculateAnalystBehavior() — normalized behavioral signals (internal)
     - updateOperationalReputation(missionId) — record an operation on completion
     - renderAnalystProfile() — paint the profile / traits / history on the home
   ============================================================ */

/** Count critical-classified pins for a mission (reused evidence signal). */
function countCriticalPins(missionId) {
  const keys = pinnableFindings[missionId] ? Array.from(pinnableFindings[missionId]) : [];
  return keys.filter((k) => {
    const pin = investigationPins[missionId] && investigationPins[missionId][k];
    return pin && pin.critical === true;
  }).length;
}

/**
 * Derive normalized behavioral signals (0..1, higher = better) from existing
 * persisted state. No raw numbers are surfaced to the player — these feed the
 * professional reputation language only.
 */
function calculateAnalystBehavior() {
  const m1Done = !!missionComplete;
  const m2Done = !!mission2Complete;
  const m3Done = !!mission3Complete;
  const missionsDone = (m1Done ? 1 : 0) + (m2Done ? 1 : 0) + (m3Done ? 1 : 0);

  // Manager trust (0..100 → 0..1).
  const trust = clampTrust(typeof trustScore === "number" ? trustScore : DEFAULT_TRUST_SCORE);

  // Containment effectiveness — average over completed missions.
  let containSum = 0, containN = 0;
  if (m1Done) { containSum += Math.max(0, Math.min(100, blueTeamContainment["mission-001"] || 0)); containN++; }
  if (m2Done) { containSum += Math.max(0, Math.min(100, blueTeamContainment["mission-002"] || 0)); containN++; }
  if (m3Done) { containSum += Math.max(0, Math.min(100, blueTeamContainment["mission-003"] || 0)); containN++; }
  const containment = containN ? (containSum / containN) / 100 : 0;

  // Escalation timing (M1) — a low adversary peak means a fast, clean response.
  const peak1 = (escalationPeak["mission-001"] || 0);
  const escBad = ESCALATION_MAX > 0 ? Math.min(1, peak1 / ESCALATION_MAX) : 0;
  const escalationTiming = m1Done ? (1 - escBad) : 0;

  // Reasoning accuracy — correct M1 reasoning + M2/M3 analyst confidence.
  const m1Reason = m1ReasoningCorrect ? m1ReasoningCorrect.size : 0;
  const m2Conf = Math.max(0, Math.min(100, m2AnalystConfidence || 0));
  const m3Conf = Math.max(0, Math.min(100, m3AnalystConfidence || 0));
  let reasonSum = 0, reasonN = 0;
  if (m1Done) { reasonSum += Math.min(1, m1Reason / 2); reasonN++; }
  if (m2Done) { reasonSum += m2Conf / 100; reasonN++; }
  if (m3Done) { reasonSum += m3Conf / 100; reasonN++; }
  const reasoning = reasonN ? reasonSum / reasonN : 0;

  // Evidence discipline — avoided distractions (M1 false leads) + critical pins.
  const falseLeads = m1FalseLeadsChecked ? m1FalseLeadsChecked.size : 0;
  const critPins = countCriticalPins("mission-001") + countCriticalPins("mission-002")
    + countCriticalPins("mission-003");
  let evidence = 0;
  if (missionsDone > 0) {
    const cleanM1 = m1Done ? (falseLeads === 0 ? 1 : 0.5) : 0.5;
    const pinScore = Math.min(1, critPins / Math.max(1, missionsDone));
    evidence = (cleanM1 + pinScore) / 2;
  }

  // Decision quality — outcome tiers + M2/M3 scope drift.
  const m1Out = m1Done ? m1OutcomeVariation().key : null;     // excellent|reactive|delayed|weak
  const m2Out = m2Done ? m2OutcomeTier().label : null;        // Excellent|Delayed|Weak
  const m3Out = m3Done ? m3OutcomeTier().label : null;        // Excellent|Delayed|Weak
  const drift = Math.max(0, m2DecisionDrift || 0) + Math.max(0, m3DecisionDrift || 0);
  let decisionSum = 0, decisionN = 0;
  if (m1Out) {
    decisionSum += (m1Out === "excellent") ? 1 : (m1Out === "reactive") ? 0.8
      : (m1Out === "delayed") ? 0.55 : 0.3;
    decisionN++;
  }
  if (m2Out) {
    decisionSum += (m2Out === "Excellent") ? 1 : (m2Out === "Delayed") ? 0.6 : 0.4;
    decisionN++;
  }
  if (m3Out) {
    decisionSum += (m3Out === "Excellent") ? 1 : (m3Out === "Delayed") ? 0.6 : 0.4;
    decisionN++;
  }
  let decisionQuality = decisionN ? decisionSum / decisionN : 0;
  if (drift > 0) decisionQuality = Math.max(0, decisionQuality - Math.min(0.3, drift * 0.1));

  return {
    m1Done, m2Done, m3Done, missionsDone,
    trust: trust / 100,
    containment, escalationTiming, reasoning, evidence, decisionQuality,
    falseLeads, critPins, drift,
    m1Out, m2Out, m3Out,
  };
}

/** Tier helper: pick a label by value thresholds. */
function repTier(value, lowLabel, midLabel, highLabel) {
  if (value >= 0.75) return highLabel;
  if (value >= 0.45) return midLabel;
  return lowLabel;
}

/** Professional ratings for the Analyst Profile (no raw numbers). */
function analystProfileRatings() {
  const b = calculateAnalystBehavior();
  if (b.missionsDone === 0) {
    return { containment: "Developing", threatResponse: "Developing", managerTrust: repTier(b.trust, "Low", "Moderate", "High") };
  }
  // Blend escalation timing + decision quality into "threat response".
  const threat = (b.escalationTiming + b.decisionQuality) / 2;
  return {
    containment: repTier(b.containment, "Developing", "Stable", "Strong"),
    threatResponse: repTier(threat, "Developing", "Improving", "Reliable"),
    managerTrust: repTier(b.trust, "Low", "Moderate", "High"),
  };
}

/** Overall reputation standing headline. */
function analystReputationStanding() {
  const b = calculateAnalystBehavior();
  if (b.missionsDone === 0) return "Awaiting First Assignment";
  const overall = (b.containment + b.escalationTiming + b.reasoning + b.evidence + b.decisionQuality + b.trust) / 6;
  if (overall >= 0.75) return "Trusted Operator";
  if (overall >= 0.5) return "Steady Analyst";
  return "Developing Analyst";
}

/**
 * Pick 1–2 DOMINANT operational reputation traits from behavior. Kept short and
 * professional — never gamey, never fantasy. Falls back to "Developing Analyst".
 */
function analystReputationTraits() {
  const b = calculateAnalystBehavior();
  if (b.missionsDone === 0) return ["Developing Analyst"];

  const candidates = [
    { label: "Threat Stabilizer",        score: b.containment >= 0.85 ? b.containment + 0.1 : 0 },
    { label: "Fast Responder",           score: b.escalationTiming >= 0.85 ? b.escalationTiming : 0 },
    { label: "Careful Analyst",          score: (b.falseLeads === 0 && b.m1Done) ? 0.8 + b.evidence * 0.1 : 0 },
    { label: "Evidence Focused",         score: b.critPins >= 2 ? 0.75 + Math.min(0.2, b.critPins * 0.05) : 0 },
    { label: "Reliable Investigator",    score: (b.reasoning >= 0.7 && b.decisionQuality >= 0.7) ? b.reasoning : 0 },
    { label: "Operationally Disciplined", score: (b.drift === 0 && b.decisionQuality >= 0.7) ? b.decisionQuality - 0.02 : 0 },
  ].filter((c) => c.score > 0).sort((a, c) => c.score - a.score);

  if (!candidates.length) {
    return b.decisionQuality >= 0.5 ? ["Improving Responder"] : ["Developing Analyst"];
  }
  return candidates.slice(0, 2).map((c) => c.label);
}

/**
 * Cumulative manager trust evolution line (scripted, no AI). Empty until the
 * analyst has at least one operation on record.
 */
function managerTrustEvolutionMessage() {
  const b = calculateAnalystBehavior();
  if (b.missionsDone === 0) return "";
  const overall = (b.containment + b.decisionQuality + b.evidence + b.trust) / 4;
  if (b.evidence < 0.45) return "We need stronger evidence discipline before escalation.";
  if (overall >= 0.7) return "You consistently prioritize containment effectively.";
  return "Your operational judgment is improving.";
}

/**
 * Phase 2 — derived career-readiness line for the Analyst Profile. Reflects how
 * close the intern is to the Junior SOC Analyst promotion, purely from existing
 * completion flags (no new persisted state).
 */
function analystCareerReadiness() {
  const m1 = !!missionComplete, m2 = !!mission2Complete;
  if (!m1 && !m2) return "Career Readiness: Onboarding";
  if (m1 && !m2) return "Career Readiness: Building toward Junior SOC Analyst";
  return "Career Readiness: Promotion-Ready — Junior SOC Analyst";
}

/**
 * Append an operation to the persistent history on mission completion. Idempotent
 * per mission (stable ids), capped, and saved. The icon/status reflects outcome.
 */
function updateOperationalReputation(missionId) {
  // Upsert one canonical record per stable id: a replay with a different outcome
  // refreshes the existing entry (status/label) instead of duplicating it, so the
  // career history stays idempotent yet reflects the latest result.
  const add = (id, label, status) => {
    const existing = operationalHistory.find((e) => e.id === id);
    if (existing) {
      existing.label = label;
      existing.status = status;
      existing.at = Date.now();
      return;
    }
    operationalHistory.push({ id, label, status, at: Date.now() });
  };

  if (missionId === "mission-001") {
    const out = m1OutcomeVariation().key; // excellent|reactive|delayed|weak
    const good = (out === "excellent" || out === "reactive");
    add("op-m1", "Credential Phishing Investigation", good ? "success" : "warn");
    add("op-m1-outcome",
      good ? "Threat Contained Successfully" : "Delayed Containment Incident",
      good ? "success" : "warn");
  } else if (missionId === "mission-002") {
    const tier = m2OutcomeTier().label; // Excellent|Delayed|Weak
    const good = (tier === "Excellent" || tier === "Delayed");
    add("op-m2", "Network Exposure Review", good ? "success" : "warn");
    add("op-m2-outcome",
      good ? "Network Threat Stabilized" : "Exposure Review — Recommendation Missed",
      good ? "success" : "warn");
  } else if (missionId === "mission-003") {
    const tier = m3OutcomeTier().label; // Excellent|Delayed|Weak
    const good = (tier === "Excellent" || tier === "Delayed");
    add("op-m3", "Reconnaissance Detection", good ? "success" : "warn");
    add("op-m3-outcome",
      good ? "Reconnaissance Detected & Reported" : "Recon Review — Recommendation Missed",
      good ? "success" : "warn");
  }

  if (operationalHistory.length > OPERATIONAL_HISTORY_MAX) {
    operationalHistory = operationalHistory.slice(-OPERATIONAL_HISTORY_MAX);
  }
  saveProgress();
  renderAnalystProfile();
}

/** Paint the persistent Analyst Profile, reputation traits, ratings, and history. */
function renderAnalystProfile() {
  const nameEl = document.getElementById("opsProfileName");
  if (nameEl) {
    nameEl.textContent = (studentName && studentName.trim())
      ? `${studentName.trim()} — Blue Team Analyst`
      : "Blue Team Analyst";
  }

  const standingEl = document.getElementById("opsRepStanding");
  if (standingEl) standingEl.textContent = analystReputationStanding();

  const traitsEl = document.getElementById("opsRepTraits");
  if (traitsEl) {
    traitsEl.innerHTML = analystReputationTraits()
      .map((t) => `<span class="ops-rep-trait">${escapeHtml(t)}</span>`)
      .join("");
  }

  const readinessEl = document.getElementById("opsRepReadiness");
  if (readinessEl) readinessEl.textContent = analystCareerReadiness();

  const ratings = analystProfileRatings();
  const setRating = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setRating("opsRatingContainment", ratings.containment);
  setRating("opsRatingThreat", ratings.threatResponse);
  setRating("opsRatingTrust", ratings.managerTrust);

  const histEl = document.getElementById("opsHistoryList");
  if (histEl) {
    if (!operationalHistory.length) {
      histEl.innerHTML =
        `<li class="ops-history-empty">No operations on record yet. Complete your first assignment to begin building your operational history.</li>`;
    } else {
      // Most recent first.
      histEl.innerHTML = operationalHistory.slice().reverse().map((e) => {
        const icon = e.status === "success" ? "✔" : "⚠";
        return `<li class="ops-history-row ops-history-row--${e.status === "success" ? "ok" : "warn"}">` +
          `<span class="ops-history-mark" aria-hidden="true">${icon}</span>` +
          `<span class="ops-history-label">${escapeHtml(e.label)}</span></li>`;
      }).join("");
    }
  }
}

/**
 * Milestone 33A — Operational Assessment block for the mission scorecards: a
 * short, professional evaluation derived from that mission's behavior.
 */
function buildOperationalAssessmentHTML(missionId) {
  const b = calculateAnalystBehavior();
  const items = [];
  const pos = (t) => items.push({ t, tone: "pos" });
  const watch = (t) => items.push({ t, tone: "watch" });

  if (missionId === "mission-001") {
    if (b.m1Out === "excellent" || b.m1Out === "reactive") pos("Strong containment timing");
    else if (b.m1Out === "delayed") watch("Containment timing needs refinement");
    else watch("Delayed Blue Team response");

    if (b.falseLeads === 0) pos("Reliable evidence prioritization");
    else watch("Investigation thoroughness improving");

    if ((m1ReasoningCorrect ? m1ReasoningCorrect.size : 0) >= 1) pos("Good escalation discipline");
    else watch("Escalation reasoning needs refinement");
  } else if (missionId === "mission-002") {
    if (decisionTaken["mission-002"] === "m2-recommend" && b.drift === 0) pos("Correct Blue Team recommendation");
    else if (decisionTaken["mission-002"] === "m2-recommend") watch("Escalation timing needs refinement");
    else watch("Ideal Blue Team recommendation missed");

    if ((m2AnalystConfidence || 0) >= 70) pos("Strong analyst confidence");
    else watch("Analyst confidence developing");

    if (countCriticalPins("mission-002") >= 1) pos("Reliable network evidence handling");
    else watch("Investigation thoroughness improving");
  } else if (missionId === "mission-003") {
    if (decisionTaken["mission-003"] === "m3-recommend" && b.drift === 0) pos("Correct Blue Team recommendation");
    else if (decisionTaken["mission-003"] === "m3-recommend") watch("Escalation timing needs refinement");
    else watch("Ideal Blue Team recommendation missed");

    if ((m3AnalystConfidence || 0) >= 70) pos("Strong analyst confidence");
    else watch("Analyst confidence developing");

    if (countCriticalPins("mission-003") >= 1) pos("Reliable reconnaissance evidence handling");
    else watch("Investigation thoroughness improving");
  }

  if (!items.length) return "";
  const rows = items.map((it) =>
    `<li class="op-assessment-item op-assessment-item--${it.tone}">` +
    `<span class="op-assessment-mark" aria-hidden="true">${it.tone === "pos" ? "▹" : "△"}</span>` +
    `${escapeHtml(it.t)}</li>`).join("");
  return `
        <div class="scorecard-section scorecard-assessment">
          <span class="scorecard-section-label">OPERATIONAL ASSESSMENT</span>
          <ul class="op-assessment-list">${rows}</ul>
        </div>`;
}

function enterModule() {
  // Milestone 17 — capture the student name from the landing input.
  // Safety net: ignore clicks if the name is empty (button should already
  // be disabled, but defensive against keyboard / programmatic triggers).
  const nameInput = document.getElementById("studentNameInput");
  const typed = nameInput ? nameInput.value.trim() : "";
  if (!typed) return;
  studentName = typed;

  // Kick off the background soundtrack — this click is a user gesture, so
  // browser autoplay policies allow playback to begin here.
  startSoundtrack();

  // Render personalized greeting at the top of the mission panel
  const welcomeEl = document.getElementById("welcomeMessage");
  if (welcomeEl) {
    welcomeEl.innerHTML = `Welcome, <strong>${escapeHtml(studentName)}</strong>`;
  }

  // Milestone 18 — persist the name as soon as the student enters the module
  saveProgress();

  // Milestone 11 — show the simulation loader first, then the dashboard.
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  // Task 8 — after the loader, the student lands on the three-panel Operations
  // Center (the single hub) instead of the legacy missions-map screen. The
  // Ops Center's own mission nodes hand off to the M1/M2/M3 flow directly.
  // Deep-link: if the player arrived from the prototype OC with ?mission=,
  // skip the hub and go straight to the requested investigation.
  runSimulationLoader(() => {
    if (pendingDeepLinkMission) {
      const mid = pendingDeepLinkMission;
      pendingDeepLinkMission = null;
      launchMissionFromMap(mid);
    } else {
      showModuleLanding();
    }
  });
}

/* ============================================================
   CYBER MISSIONS MAP  (Milestone 25C)
   ------------------------------------------------------------
   A 2D dark/cyber mission-selection screen shown AFTER name
   entry + the simulation loader, and BEFORE the investigation.
   Pure selection layer: it reuses the existing localStorage /
   registry progress (missionComplete / mission2Complete) — it
   does NOT introduce a second progress system. Launching a
   mission hands off to the existing flow:
     M1 -> openMission1Dashboard()  (the old enterModule reveal)
     M2 -> showMission2Overview()
     M3 -> locked / coming soon (no launch)
   ============================================================ */

// Per-mission map content. Mission 3 is a not-yet-built placeholder.
const MISSION_MAP = {
  "mission-001": {
    num: "01",
    nodeId: "mapNode1",
    statusId: "mapNode1Status",
    title: "Credential Phishing Investigation",
    role: "Cybersecurity Intern",
    threat: "Phishing / Credential Theft",
    briefing:
      "A finance workstation contains a suspicious file asking an employee to " +
      "share their password with an unknown external address. Inspect the files, " +
      "weigh the evidence, and report what you find.",
    skills: [
      "Inspecting files safely",
      "Classifying evidence",
      "Recognizing phishing",
      "Reporting findings",
    ],
    transmission:
      "Finance reported suspicious workstation activity. Review the assignment " +
      "brief, then launch the investigation.",
  },
  "mission-002": {
    num: "02",
    nodeId: "mapNode2",
    statusId: "mapNode2Status",
    title: "Network Exposure Review",
    role: "Cybersecurity Intern",
    threat: "Network Exposure",
    briefing:
      "Following the credential-phishing containment, network monitoring is " +
      "elevated. A target host is now exposing services that need review. Map the " +
      "local network, confirm which host is reachable, and assess the open " +
      "services for risk.",
    skills: [
      "Identifying IP addresses",
      "Testing host reachability",
      "Scanning open services",
      "Reasoning about attack surface",
    ],
    transmission:
      "With phishing contained, monitoring around exposed services has increased. " +
      "Investigate the network safely and report your findings.",
  },
  "mission-003": {
    num: "03",
    nodeId: "mapNode3",
    statusId: "mapNode3Status",
    title: "Reconnaissance Detection",
    role: "Cybersecurity Intern",
    threat: "Early-Stage Reconnaissance",
    briefing:
      "Network monitoring has flagged unusual activity from an external source. " +
      "Review the active connections, identify the unknown source that keeps " +
      "appearing, search the logs for what it has been doing, and correlate the " +
      "signals to confirm reconnaissance before it becomes a breach.",
    skills: [
      "Reviewing active connections",
      "Identifying an unknown source",
      "Recognizing a probe pattern",
      "Correlating reconnaissance signals",
    ],
    transmission:
      "An unknown external source is repeatedly contacting internal services. " +
      "Review the assignment brief, then launch the investigation.",
  },
};

// Remembers which node the student last selected so re-opening the map keeps
// the same details panel in view. Defaults to Mission 1.
let currentMapSelection = "mission-001";

/**
 * Derive a mission's map status from the EXISTING progress state.
 *   M1: "completed" once missionComplete, else "available".
 *   M2: "completed" once mission2Complete; "available" once M1 is complete
 *       (the existing unlock rule); otherwise "locked".
 *   M3: always "locked" (coming soon).
 */
function missionMapStatus(missionId) {
  if (missionId === "mission-001") return missionComplete ? "completed" : "available";
  if (missionId === "mission-002") {
    if (mission2Complete) return "completed";
    return missionComplete ? "available" : "locked";
  }
  if (missionId === "mission-003") {
    if (mission3Complete) return "completed";
    return mission2Complete ? "available" : "locked";
  }
  return "locked";
}

function mapStatusLabel(missionId, status) {
  // Milestone 29A — the M3 recon sector stays LOCKED but reads as "alive".
  if (MISSION_MAP[missionId] && MISSION_MAP[missionId].comingSoon) return "Monitoring";
  if (status === "completed") return "Completed";
  if (status === "available") return "Available";
  return "Locked";
}

/** Refresh node visual states + path lines from current progress. */
function renderMissionMapStates() {
  Object.keys(MISSION_MAP).forEach((mid) => {
    const def = MISSION_MAP[mid];
    const node = document.getElementById(def.nodeId);
    if (!node) return;
    const status = missionMapStatus(mid);
    node.classList.remove(
      "mission-node--available",
      "mission-node--completed",
      "mission-node--locked"
    );
    node.classList.add(`mission-node--${status}`);
    // Milestone 29A — coming-soon recon sector stays alive (monitoring pulse).
    node.classList.toggle("mission-node--monitoring", !!def.comingSoon);
    // Locked nodes stay CLICKABLE so the student can still read their locked
    // details panel; only the Launch button is disabled (in renderMissionDetails).
    const badge = document.getElementById(def.statusId);
    if (badge) badge.textContent = mapStatusLabel(mid, status);
  });

  // Path lines light up when the mission they lead to is reachable.
  const p12 = document.getElementById("mapPath12");
  if (p12) p12.classList.toggle("map-path-line--lit", missionMapStatus("mission-002") !== "locked");
  const p23 = document.getElementById("mapPath23");
  if (p23) p23.classList.toggle("map-path-line--lit", missionMapStatus("mission-003") !== "locked");
}

/**
 * Milestone 25D — render a compact "Mission Route" map inside a mission's
 * Mission Control panel. Derives node states from the SAME progress flags as
 * the full map (missionMapStatus) and highlights the panel's own mission.
 * @param {string} rootId          id of the .mini-map container (e.g. "m1MiniMap")
 * @param {string} activeMissionId the mission this panel belongs to
 */
function renderMiniMap(rootId, activeMissionId) {
  const root = document.getElementById(rootId);
  if (!root) return;
  root.querySelectorAll(".mini-node").forEach((node) => {
    const mid = node.getAttribute("data-mission");
    const status = missionMapStatus(mid);
    node.classList.remove(
      "mini-node--available",
      "mini-node--completed",
      "mini-node--locked",
      "mini-node--active"
    );
    node.classList.add(`mini-node--${status}`);
    if (mid === activeMissionId) node.classList.add("mini-node--active");
    // Milestone 29A — keep the recon (coming-soon) sector subtly alive.
    node.classList.toggle("mini-node--monitoring", !!(MISSION_MAP[mid] && MISSION_MAP[mid].comingSoon));
  });
  const p12 = root.querySelector('.mini-path[data-path="12"]');
  if (p12) p12.classList.toggle("mini-path--lit", missionMapStatus("mission-002") !== "locked");
  const p23 = root.querySelector('.mini-path[data-path="23"]');
  if (p23) p23.classList.toggle("mini-path--lit", missionMapStatus("mission-003") !== "locked");
}

/** Refresh both dashboards' compact route maps from current progress. */
function renderAllMiniMaps() {
  renderMiniMap("m1MiniMap", "mission-001");
  renderMiniMap("m2MiniMap", "mission-002");
  renderMiniMap("m3MiniMap", "mission-003");
}

/** Select a node: highlight it + render its details + transmission. */
function selectMissionNode(missionId) {
  if (!MISSION_MAP[missionId]) missionId = "mission-001";
  currentMapSelection = missionId;
  Object.keys(MISSION_MAP).forEach((mid) => {
    const node = document.getElementById(MISSION_MAP[mid].nodeId);
    if (node) node.classList.toggle("mission-node--selected", mid === missionId);
  });
  renderMissionDetails(missionId);
  renderMapTransmission(missionId);
}

/** Render the right-side mission details panel + Launch button. */
function renderMissionDetails(missionId) {
  const panel = document.getElementById("missionDetailsPanel");
  const def = MISSION_MAP[missionId];
  if (!panel || !def) return;
  const status = missionMapStatus(missionId);
  const locked = status === "locked";
  const statusLabel = mapStatusLabel(missionId, status);

  const skillsHtml = def.skills.length
    ? `<ul class="mission-details-skills">${def.skills
        .map((s) => `<li><span class="mission-details-skill-bullet">▹</span>${escapeHtml(s)}</li>`)
        .join("")}</ul>`
    : `<p class="mission-details-empty">Skills will be revealed when this mission unlocks.</p>`;

  let btnHtml;
  if (def.comingSoon) {
    btnHtml = `<button class="mission-launch-btn" id="missionLaunchBtn" type="button" disabled>Recon Monitoring · Coming Next</button>`;
  } else if (locked) {
    btnHtml = `<button class="mission-launch-btn" id="missionLaunchBtn" type="button" disabled>🔒 Locked</button>`;
  } else {
    const label = status === "completed" ? "▶ Launch Again" : "▶ Launch Assignment";
    btnHtml = `<button class="mission-launch-btn" id="missionLaunchBtn" type="button" data-mission="${missionId}">${label}</button>`;
  }

  panel.innerHTML = `
    <div class="mission-details-head">
      <span class="mission-details-num">ASSIGNMENT ${escapeHtml(def.num)}</span>
      <span class="mission-details-statuspill mission-details-statuspill--${status}">${escapeHtml(statusLabel)}</span>
    </div>
    <h2 class="mission-details-title">${escapeHtml(def.title)}</h2>
    <div class="mission-details-rows">
      <div class="mission-details-row">
        <span class="mission-details-row-label">ROLE</span>
        <span class="mission-details-row-value">${escapeHtml(def.role)}</span>
      </div>
      <div class="mission-details-row">
        <span class="mission-details-row-label">THREAT</span>
        <span class="mission-details-row-value">${escapeHtml(def.threat)}</span>
      </div>
    </div>
    <div class="mission-details-block">
      <span class="mission-details-block-label">BRIEFING</span>
      <p class="mission-details-briefing">${escapeHtml(def.briefing)}</p>
    </div>
    <div class="mission-details-block">
      <span class="mission-details-block-label">SKILLS</span>
      ${skillsHtml}
    </div>
    ${btnHtml}
  `;

  const launchBtn = document.getElementById("missionLaunchBtn");
  if (launchBtn && !locked && !def.comingSoon) {
    launchBtn.addEventListener("click", () => launchMissionFromMap(missionId));
  }
}

/** Update the Sarah Reyes transmission text for the selected mission. */
function renderMapTransmission(missionId) {
  const el = document.getElementById("mapTransmissionText");
  const def = MISSION_MAP[missionId];
  if (el && def) el.textContent = def.transmission;
}

/**
 * Launch a mission from the map. Locked/coming-soon missions do nothing
 * (their buttons are disabled, but guard defensively). Otherwise hand off
 * to the existing flow.
 */
function launchMissionFromMap(missionId) {
  // Defensive onboarding gate — route through the signin strip if called
  // before enterModule() has run (new player, no studentName set).
  if (!studentName || !studentName.trim()) {
    ocv2PromptOnboarding();
    return;
  }
  if (missionMapStatus(missionId) === "locked") return;
  if (missionId === "mission-001") {
    openMission1Dashboard();
  } else if (missionId === "mission-002") {
    showMission2Overview();
  } else if (missionId === "mission-003") {
    showMission3Overview();
  }
}

/** Hide every other screen and show the Missions Map. Resume-safe. */
function showMissionsMap() {
  try { trackGameEvent("mission_map_opened", {}); } catch (_) { /* non-fatal */ }
  // Leave any active mission UI cleanly (parity with backToModuleOverview).
  setMissionRunning(false);
  endGuidedRun();
  clearAllMapButtonsAttention(); // FIX 4 — student followed the Next Step prompt.
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (simLoaderEl)     simLoaderEl.style.display     = "none";
  const m2o = document.getElementById("mission2Overview");
  if (m2o) m2o.style.display = "none";
  const m2d = document.getElementById("mission2Dashboard");
  if (m2d) m2d.style.display = "none";
  const m3o = document.getElementById("mission3Overview");
  if (m3o) m3o.style.display = "none";
  const m3d = document.getElementById("mission3Dashboard");
  if (m3d) m3d.style.display = "none";
  const map = document.getElementById("missionsMap");
  if (map) {
    map.style.display = "";
    map.scrollTop = 0;
  }
  window.scrollTo({ top: 0, behavior: "instant" });

  const welcome = document.getElementById("missionsMapWelcome");
  if (welcome) {
    welcome.textContent = studentName
      ? `Welcome, ${studentName}. Select an assignment to view its briefing.`
      : "Select an assignment to view its briefing.";
  }

  renderMissionMapStates();
  renderAllMiniMaps();
  selectMissionNode(currentMapSelection);
}

/**
 * Land on the Operations Center (#moduleLanding). This is the primary
 * post-login destination and the place mission "Back" buttons return to.
 * Mirrors showMissionsMap()'s cleanup (leave any active mission UI cleanly)
 * but reveals the Ops Center home instead of the legacy missions map.
 */
function showModuleLanding() {
  // Leave any active mission UI cleanly (parity with showMissionsMap).
  setMissionRunning(false);
  endGuidedRun();
  clearAllMapButtonsAttention();
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (simLoaderEl)     simLoaderEl.style.display     = "none";
  const m2o = document.getElementById("mission2Overview");
  if (m2o) m2o.style.display = "none";
  const m2d = document.getElementById("mission2Dashboard");
  if (m2d) m2d.style.display = "none";
  const m3o = document.getElementById("mission3Overview");
  if (m3o) m3o.style.display = "none";
  const m3d = document.getElementById("mission3Dashboard");
  if (m3d) m3d.style.display = "none";
  const map = document.getElementById("missionsMap");
  if (map) map.style.display = "none";
  if (moduleLandingEl) {
    moduleLandingEl.style.display = "";
    moduleLandingEl.scrollTop = 0;
  }
  window.scrollTo({ top: 0, behavior: "instant" });
  // Refresh so career/assignment/XP/trust changes are reflected (no stale state).
  renderOperationsCenter();
}

/**
 * Reveal the Mission 1 dashboard. This is the body of the old enterModule()
 * loader callback, extracted so the Missions Map can launch M1. Resume-safe:
 * startGuidedBriefing() resumes an in-progress mission instead of re-onboarding.
 */
function openMission1Dashboard() {
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  const map = document.getElementById("missionsMap");
  if (map) map.style.display = "none";
  const m2o = document.getElementById("mission2Overview");
  if (m2o) m2o.style.display = "none";
  const m2d = document.getElementById("mission2Dashboard");
  if (m2d) m2d.style.display = "none";

  if (dashboardEl) dashboardEl.style.display = "";
  // Milestone 24I — render the Mission 1 Briefing Room on entry.
  renderBriefingRoom("mission-001");
  updateMission1CTA();
  renderAllMiniMaps();
  // Milestone 27A — paint the Analyst Confidence meter on dashboard entry.
  renderAnalystConfidence();
  // Milestone 25A — if Mission 1 was already in progress, re-assert the
  // mission-running control bar on dashboard re-entry.
  if (missionStarted && !missionComplete) {
    setMissionRunning(true);
    enterFocusMode();
    // Stage 3 — re-arm the idle escalation watch on in-progress re-entry
    // (the watch is torn down on every mission exit via endGuidedRun).
    startEscalationWatch("mission-001");
  }
  if (terminalInput) terminalInput.focus();
  // Milestone 25B — auto-open the guided briefing overlay on a FRESH start.
  // Resume-safe: skipped once the mission is started or complete.
  if (!missionStarted && !missionComplete) {
    startGuidedBriefing("mission-001", beginMission);
  }
}

/** Milestone 17 — escape user-supplied text before injecting into HTML. */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Milestone 11 — Simulation Loading Visualization.
 * Plays a short fake boot sequence (≈4 s) then calls onDone().
 * Purely visual: no real work happens, just timed DOM updates.
 *
 * @param {Function} onDone  Callback fired after the loader hides
 */
function runSimulationLoader(onDone) {
  if (!simLoaderEl) { onDone && onDone(); return; }

  // Reset loader to a clean starting state every time it runs
  if (simLoaderLinesEl)   simLoaderLinesEl.innerHTML = "";
  if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = "";
  if (simLoaderBarEl)     simLoaderBarEl.style.width = "0%";
  if (simLoaderPctEl)     simLoaderPctEl.textContent = "0%";
  if (simLoaderStatusEl)  simLoaderStatusEl.textContent = "BOOTING…";

  simLoaderEl.style.display = "";

  const total = SIM_BOOT_LINES.length;
  let i = 0;

  // Show one line at a time. The "current" line shows below the
  // committed lines with a blinking cursor; on the next tick it gets
  // committed to the list and replaced by the next line.
  function tick() {
    if (i > 0 && simLoaderLinesEl) {
      // Commit the previous "current" line into the scroll-back list
      const prev = document.createElement("div");
      prev.className = "sim-loader-line";
      prev.innerHTML =
        `<span class="sim-loader-prompt">[ ok ]</span> ` +
        `<span class="sim-loader-line-text">${SIM_BOOT_LINES[i - 1]}</span>`;
      simLoaderLinesEl.appendChild(prev);
    }

    if (i >= total) {
      // Final line committed — fill bar to 100%, then hand off
      if (simLoaderBarEl)    simLoaderBarEl.style.width = "100%";
      if (simLoaderPctEl)    simLoaderPctEl.textContent = "100%";
      if (simLoaderStatusEl) simLoaderStatusEl.textContent = "READY";
      if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = "";

      setTimeout(() => {
        simLoaderEl.style.display = "none";
        onDone && onDone();
      }, SIM_FINAL_PAUSE_MS);
      return;
    }

    // Show the next line as the active/current line
    if (simLoaderCurrentEl) simLoaderCurrentEl.textContent = SIM_BOOT_LINES[i];

    // Advance the progress bar proportionally
    const pct = Math.round(((i + 1) / total) * 100);
    if (simLoaderBarEl) simLoaderBarEl.style.width = `${pct}%`;
    if (simLoaderPctEl) simLoaderPctEl.textContent = `${pct}%`;

    i++;
    setTimeout(tick, SIM_LINE_DELAY_MS);
  }

  tick();
}

function backToModuleOverview() {
  setMissionRunning(false); // Milestone 25A — leave Focus Mode / hide bar.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "";
  // Scroll the landing back to the top so the student sees the title
  if (moduleLandingEl) moduleLandingEl.scrollTop = 0;
  // Milestone 32A — refresh the Operations Center so returning to the home
  // reflects in-session career/assignment/XP/trust changes (no stale state).
  renderOperationsCenter();
}


/* ============================================================
   COURSE PROGRESS  (Milestone 9)
   Renders the two mission cards in the left sidebar.
   Mission 1's status is derived from `missionComplete`.
   Mission 2 is locked until Mission 1 is completed; once unlocked
   the card grows a "Start Mission 2" button that opens a small
   placeholder panel (Mission 2 itself is not built yet).
   ============================================================ */

/* ============================================================
   PROGRESS TRACKER  (Milestone 15) — renderers + helpers
   ============================================================ */

/**
 * Renders the 10-row tracker. The status of each row is derived:
 *   - "complete" if its id is in completedProgressSteps
 *   - "current"  if it's the FIRST non-complete row
 *   - "locked"   otherwise
 * This means we only ever mutate the completed set — current/locked
 * are computed at render time so the highlight always lines up.
 */
function renderProgressTracker() {
  const el = document.getElementById("progressTracker");
  if (!el) return;

  // Find index of the first non-complete step (the "current" one).
  const currentIdx = PROGRESS_STEPS.findIndex(
    (s) => !completedProgressSteps.has(s.id)
  );

  // Overall % complete — used to fill the connector bar behind the nodes.
  const completedCount = PROGRESS_STEPS.filter((s) =>
    completedProgressSteps.has(s.id)
  ).length;
  // The "filled" portion runs from the first node to the current node.
  // With N nodes, each gap is 1/(N-1). Stop the fill at the current node
  // (or 100% when everything is complete).
  const fillIdx = currentIdx === -1 ? PROGRESS_STEPS.length - 1 : currentIdx;
  const fillPct = (fillIdx / (PROGRESS_STEPS.length - 1)) * 100;

  el.innerHTML = `
    <div class="progress-tracker-bar" role="list" aria-label="Mission progress">
      <div class="progress-tracker-rail" aria-hidden="true"></div>
      <div class="progress-tracker-rail-fill" aria-hidden="true" style="width:${fillPct}%;"></div>
      ${PROGRESS_STEPS.map((step, i) => {
        let status;
        if (completedProgressSteps.has(step.id))      status = "complete";
        else if (i === currentIdx)                    status = "current";
        else                                          status = "locked";

        const symbol = status === "complete" ? "✓" : (i + 1);

        return `
          <div class="progress-tracker-step progress-tracker-step--${status}"
               role="listitem"
               aria-current="${status === "current" ? "step" : "false"}"
               title="${step.label} — ${status.toUpperCase()}">
            <div class="progress-tracker-node">${symbol}</div>
            <div class="progress-tracker-caption">${step.label}</div>
          </div>
        `;
      }).join("")}
    </div>
    <div class="progress-tracker-meta">
      <span class="progress-tracker-meta-count">${completedCount} / ${PROGRESS_STEPS.length}</span>
      <span class="progress-tracker-meta-label">steps complete</span>
    </div>
  `;
}

/** Marks a single step as complete and re-renders. Safe to call twice. */
function markProgressStep(id) {
  if (completedProgressSteps.has(id)) return;
  completedProgressSteps.add(id);
  renderProgressTracker();
}

/** Resets the tracker to its initial state (only Briefing complete). */
function resetProgressTracker() {
  completedProgressSteps.clear();
  completedProgressSteps.add("briefing");
  renderProgressTracker();
}


/* ============================================================
   COURSE PROGRESS — registry-driven render  (Milestone 23E)
   ------------------------------------------------------------
   The mission registry controls course order and mission
   availability. renderCourseProgress() now loops missionRegistry
   instead of hardcoding mission cards manually:

     1. syncRegistryFromState() derives each entry's status from
        the live state flags (missionComplete / mission2Complete)
        which remain the source of truth for save/load.
     2. We filter out placeholder-only entries when their gating
        condition isn't met (Mission 3 stays hidden until Mission 2
        is complete, preserving existing UX).
     3. buildCourseCardHTML() turns one registry entry into its
        course-card markup, including the Start/Replay button for
        Mission 2 (the only mission with an action button today).
   ============================================================ */

/**
 * Mirrors the live state flags onto the mission registry's `status`
 * field. Called at the top of renderCourseProgress() so the registry
 * always reflects current state without duplicating it.
 */
function syncRegistryFromState() {
  // Mission 1 — Available until completed, then Completed
  setRegistryMissionStatus(
    "mission1",
    missionComplete ? MISSION_STATUS.COMPLETED : MISSION_STATUS.AVAILABLE,
  );

  // Mission 2 — Locked → Unlocked (after M1) → Completed
  let m2;
  if (mission2Complete)      m2 = MISSION_STATUS.COMPLETED;
  else if (missionComplete)  m2 = MISSION_STATUS.UNLOCKED;
  else                       m2 = MISSION_STATUS.LOCKED;
  setRegistryMissionStatus("mission2", m2);

  // Mission 3 — Locked → Unlocked (after M2) → Completed
  let m3;
  if (mission3Complete)      m3 = MISSION_STATUS.COMPLETED;
  else if (mission2Complete) m3 = MISSION_STATUS.UNLOCKED;
  else                       m3 = MISSION_STATUS.LOCKED;
  setRegistryMissionStatus("mission3", m3);
}

/** Capitalizes the first letter of a status string for display. */
function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

/**
 * Builds the HTML for a single course card from a registry entry.
 * Returns "" for entries that should be hidden at this moment.
 */
function buildCourseCardHTML(entry) {
  // Mission 3 is a locked placeholder — only surface it once Mission 2 is
  // complete, matching the prior milestone's UX.
  if (entry.placeholderOnly && !mission2Complete) return "";

  const num    = String(entry.order).padStart(2, "0");
  const mod    = entry.status;            // "locked" | "available" | "unlocked" | "completed"
  const label  = statusLabel(entry.status);
  const lock   = (mod === "locked") ? "🔒 " : "";

  // The Start/Replay action button is currently Mission-2-specific. Any
  // future mission that needs one can opt in here without changing the
  // card scaffold above.
  let actionHTML = "";
  if (entry.missionId === "mission2") {
    if (missionComplete && !mission2Complete) {
      actionHTML = `
        <div class="course-card-unlock-note">
          ✓ Assignment 2 unlocked: Network Exposure Review
        </div>
        <button id="startMission2Btn" class="course-start-btn">
          ▶&nbsp; Start Mission 2
        </button>
      `;
    } else if (mission2Complete) {
      actionHTML = `
        <button id="startMission2Btn" class="course-start-btn course-start-btn--completed">
          ▶&nbsp; Replay Mission 2
        </button>
      `;
    }
  }

  return `
    <li class="course-card course-card--${mod}">
      <div class="course-card-row">
        <span class="course-card-num">${num}</span>
        <div class="course-card-info">
          <span class="course-card-title">${entry.title}</span>
          <span class="course-card-desc">${entry.description}</span>
        </div>
        <span class="course-card-status course-card-status--${mod}">
          ${lock}${label}
        </span>
      </div>
      ${actionHTML}
    </li>
  `;
}

function renderCourseProgress() {
  if (!courseProgressEl) return;

  // 1. Sync registry status from live state flags
  syncRegistryFromState();

  // 2. Sort by `order` (defensive — the registry is already in order)
  //    and render each visible card
  const cardsHTML = missionRegistry
    .slice()
    .sort((a, b) => a.order - b.order)
    .map(buildCourseCardHTML)
    .join("");

  // 3. Header summary — Mission 3 only counts toward the total once it's
  //    visible (after Mission 2 completion), preserving prior behavior.
  const totalLabel = mission2Complete ? "3 missions" : "2 missions";

  courseProgressEl.innerHTML = `
    <div class="course-progress-header">
      <span class="course-progress-label">COURSE PROGRESS</span>
      <span class="course-progress-sub">${totalLabel}</span>
    </div>
    <ul class="course-list">
      ${cardsHTML}
    </ul>
  `;

  // 4. Wire up the Start/Replay Mission 2 button (only present when
  //    Mission 1 is complete). Same handler as before.
  if (missionComplete) {
    const startBtn = document.getElementById("startMission2Btn");
    if (startBtn) startBtn.addEventListener("click", showMission2Overview);
  }
}

/* ============================================================
   MISSION 2 OVERVIEW  (Milestone 19)
   Takeover screen previewing Mission 2. Hides the dashboard
   and the module landing; "Back to Module Overview" returns
   to the landing screen. Mission 2 gameplay is not yet built.
   ============================================================ */

function showMission2Overview() {
  const overview = document.getElementById("mission2Overview");
  if (!overview) return;
  setMissionRunning(false); // Milestone 25A — overview is not an active dashboard.
  // Milestone 28C — the M1→M2 "Continue" path lands here WITHOUT routing through
  // endGuidedRun(), so tear down any live cinematic (cancels its fade/follow-up/
  // glow timers) explicitly — otherwise a delayed callback could fire on M2.
  clearIncidentCinema();
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  // Milestone 25C — also hide the Missions Map when launching M2 from it, so
  // screens never stack (parity with openMission1Dashboard()).
  const mapEl = document.getElementById("missionsMap");
  if (mapEl) mapEl.style.display = "none";
  overview.style.display = "";
  overview.scrollTop = 0;
  // Milestone 24I — render the Mission 2 Briefing Room on entry.
  renderBriefingRoom("mission-002");
  renderAllMiniMaps();
  window.scrollTo({ top: 0, behavior: "instant" });
  // Milestone 25B fix — auto-open the guided briefing overlay for a FRESH M2
  // start (parity with Mission 1). Skipped once M2 has started OR is complete
  // (m2Started is session-only, so the completion guard covers reload-after-finish).
  if (!m2Started && !mission2Complete) startGuidedBriefing("mission-002", beginMission2);
}

function hideMission2Overview() {
  setMissionRunning(false); // Milestone 25A — leave Focus Mode / hide bar.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  const overview = document.getElementById("mission2Overview");
  if (overview) overview.style.display = "none";
  if (moduleLandingEl) {
    moduleLandingEl.style.display = "";
    moduleLandingEl.scrollTop = 0;
  }
  // Milestone 32A — keep the Operations Center home in sync on return.
  renderOperationsCenter();
}

/* ============================================================
   MISSION 2 GAMEPLAY  (Milestone 20)
   Guided 4-command sequence on the Mission 2 Overview screen.
   Self-contained — does not touch Mission 1 state.
   ============================================================ */

// Ordered status entries. Each is marked complete as the student progresses.
const M2_STATUS = [
  { id: "started",            label: "Mission 2 Started" },
  { id: "ip-addr",            label: "Local IP Identified" },
  { id: "ping",               label: "Host Reachability Confirmed" },
  { id: "nmap",               label: "Open Services Found" },
  { id: "review",             label: "Services Reviewed" },
  // Milestone 21 — Analyst Review + Threat Assessment
  { id: "analyst-review",     label: "Analyst Review Completed" },
  { id: "threat-assessment",  label: "Threat Assessment Complete" },
  // Milestone 22 — Mission 2 final completion (quiz passed)
  { id: "m2-complete",        label: "Mission 2 Complete" },
];

// Milestone 22 — Mission 2 quiz, XP reward, and scorecard data.
const M2_QUIZ = {
  question: "What does an open network service mean?",
  answers: [
    { letter: "A", text: "The computer is automatically hacked." },
    { letter: "B", text: "The computer is running a service that can accept network connections." },
    { letter: "C", text: "The computer has no security risks." },
    { letter: "D", text: "The IP address is fake." },
  ],
  correct:    "B",
  correctMsg: "Correct. Open services are normal, but analysts must review them for security risk.",
  wrongMsg:   "Review the scan output again. Open services accept network connections and must be assessed.",
  xpReward:   100,
  newRank:    "Cyber Intern Level 2",
};

const M2_SCORECARD = {
  missionName:     "Network Exposure Review",
  subtitle:        "You completed a network reconnaissance exercise.",
  skills: [
    "Identifying local IP address",
    "Checking host reachability",
    "Reading scan-style output",
    "Recognizing open services",
    "Understanding attack surface",
  ],
  threatAssessment: "The target host exposes SSH, HTTP, and HTTPS services that should be reviewed for secure configuration.",
  whatYouLearned: "You learned how cybersecurity analysts map a network by identifying their own host, confirming reachability, scanning for open services, and assessing which services may increase the attack surface.",
  nextMissionTitle: "Reconnaissance & Discovery",
  nextMissionDesc:  "Go deeper into how analysts gather information about a target before any active scanning.",
  certSkills: [
    "Network host identification",
    "Reachability testing",
    "Service enumeration",
    "Attack-surface reasoning",
  ],
};

let mission2Complete    = false;
let m2QuizAnswered      = false;

// Per-command: terminal output lines + hint shown AFTER the command runs +
// commands this one unlocks next + supervisor message fired after the run.
const M2_COMMANDS = {
  "ip-addr": {
    cmd:    "ip addr",
    output: ["eth0: inet 10.0.0.12/24"],
    nextHint: "Next: find out whether the suspect host is even alive — a host that never answers can't be exposing anything. Confirm the target responds.",
    unlocks: [],
    managerMsg: "Good — you've identified your local IP. Now confirm whether the target host is reachable.",
  },
  // Challenge Layer 1 (M2) — false lead: an unreachable host. Provides a
  // little confidence for checking, but does NOT unlock the scan.
  "ping-bad": {
    cmd:    "ping 10.0.0.8",
    output: ["Request timed out. Host not reachable."],
    nextHint: "Silent — a dead end, which is still useful to rule out. Now confirm which host from the alert actually responds.",
    unlocks: [],
    managerMsg: "That host is not reachable. Try another target from the alert.",
  },
  "ping": {
    cmd:    "ping 10.0.0.5",
    output: ["64 bytes from 10.0.0.5: host is reachable"],
    nextHint: "The host is alive, so find out what it's exposing — scan it to see which services (open doors) are reachable from the network.",
    unlocks: ["nmap"],
    managerMsg: "The host is alive. Let's see what services it's exposing — try a quick port scan.",
  },
  "nmap": {
    cmd:    "nmap 10.0.0.5",
    output: [
      "PORT     STATE  SERVICE",
      "22/tcp   open   ssh",
      "80/tcp   open   http",
      "443/tcp  open   https",
    ],
    nextHint: "You can see the open ports. Now work out what they mean for risk — review the exposed services as an analyst would.",
    unlocks: ["review"],
    managerMsg: "Three open ports — SSH, HTTP, and HTTPS. Review what those services tell us about this host.",
  },
  "review": {
    cmd:    "review services",
    output: ["The host has SSH, HTTP, and HTTPS services exposed."],
    nextHint: "Decide what this exposure means for the network — answer the Analyst Review below to make your call.",
    unlocks: [],
    managerMsg: "Good. You've enumerated the services. Now think like an analyst — which of these exposed services could become a risk?",
  },
};

// Milestone 21 — Analyst Review question shown after `review services`.
const M2_ANALYST_REVIEW = {
  question: "Which exposed service could be risky if poorly secured?",
  answers: [
    { letter: "A", text: "SSH (22)" },
    { letter: "B", text: "HTTP (80)" },
    { letter: "C", text: "HTTPS (443)" },
    { letter: "D", text: "Any exposed service could become risky if misconfigured or poorly secured." },
  ],
  correct: "D",
  correctMsg: "Correct. Cybersecurity analysts evaluate all exposed services for possible weaknesses or misconfigurations.",
  wrongMsg:   "Not quite. Analysts must evaluate all exposed services because any service can become vulnerable if configured improperly.",
  finding:    "The target host exposes multiple network services that should be reviewed for security hardening and updates.",
  summary:    "Open services increase functionality, but every exposed service can increase attack surface if not secured properly.",
};

/* ============================================================
   Milestone 31A — Mission 2 PER-STEP REASONING PROMPTS
   ------------------------------------------------------------
   After each major network command runs, the student answers ONE short
   "what does this mean?" question before moving on — mirroring Mission 1's
   one-clue-at-a-time investigative reasoning. A correct answer raises the
   ANALYST CONFIDENCE track and then offers the matching evidence pin.
   The 5th step ("what should Blue Team do") is intentionally MERGED into the
   Blue Team decision moment (the decision IS that reasoning), so there is no
   separate prompt for `review` — keeping cognitive load low.

   `conf` = one-time Analyst Confidence gain for a correct interpretation.
   ============================================================ */
const M2_REASONING = {
  "ip-addr": {
    title: "Local Network Identity",
    question: "What does this output tell you?",
    answers: [
      { letter: "A", text: "This identifies the student workstation's local network address." },
      { letter: "B", text: "This is the address of the attacker's machine." },
      { letter: "C", text: "This proves the network has already been breached." },
    ],
    correct: "A",
    conf: 15,
    correctMsg: "Right — knowing your own host address is the baseline for mapping a network.",
    wrongMsg:   "Not quite. `ip addr` shows YOUR workstation's local address — your starting point.",
    hint: "This is the address of the machine you're working from — your reference point for everything else on the network.",
  },
  "ping-bad": {
    title: "Unreachable Host",
    question: "What does this result suggest?",
    answers: [
      { letter: "A", text: "The host is reachable and exposing services." },
      { letter: "B", text: "The host is not reachable right now." },
      { letter: "C", text: "The host is definitely compromised." },
    ],
    correct: "B",
    conf: 15,
    correctMsg: "Correct — no reply means this host isn't reachable. A useful negative result.",
    wrongMsg:   "Look again — the request timed out, which means the host did not respond.",
    hint: "No reply within the timeout means the host didn't answer — and a silent host can't be exposing services.",
  },
  "ping": {
    title: "Reachable Host",
    question: "What does this result suggest?",
    answers: [
      { letter: "A", text: "The host is offline and can be ignored." },
      { letter: "B", text: "The host is reachable and can be investigated further." },
      { letter: "C", text: "The host has no open services." },
    ],
    correct: "B",
    conf: 25,
    correctMsg: "Correct — a reply confirms the host is live, so it's worth scanning.",
    wrongMsg:   "Re-read the output — the host replied, so it IS reachable and worth a closer look.",
    hint: "A reply confirms the host is alive on the network, so it's worth a closer look.",
  },
  "nmap": {
    title: "Open Services",
    question: "What is the main security concern here?",
    answers: [
      { letter: "A", text: "The host exposes network services that should be reviewed." },
      { letter: "B", text: "Open ports mean the host is automatically hacked." },
      { letter: "C", text: "Open ports are always completely safe." },
    ],
    correct: "A",
    conf: 35,
    correctMsg: "Exactly — exposed services are attack surface and must be assessed for risk.",
    wrongMsg:   "Not quite. Open services aren't auto-hacked, but each one is attack surface to review.",
    hint: "Each open port is a service reachable from the network — attack surface to assess, not automatically 'hacked' or automatically 'safe'.",
  },
};

// Five Analyst Confidence tiers (Low → Ready). The label is derived from the
// numeric value; reaching Ready (100) requires the correct analyst review.
const M2_ANALYST_CONF_TIERS = [
  { min: 100, label: "Ready",      caption: "You're ready to make a recommendation." },
  { min: 70,  label: "Strong",     caption: "Your read on the network is strong." },
  { min: 40,  label: "Developing", caption: "Your assessment is taking shape." },
  { min: 20,  label: "Building",   caption: "You're starting to understand the network." },
  { min: 0,   label: "Low",        caption: "Interpret each finding to build confidence." },
];

let m2AnalystAnswered = false;

function setM2ManagerMessage(text) {
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage("mission-002", text);
}

/** Mirror current XP/Rank/stats from M1 elements into the M2 dashboard's
 *  AGENT PROFILE panel. Single source of truth is the M1 element values
 *  (and the currentXP / MAX_XP / mission1Complete state vars). Called on
 *  every M2 dashboard entry plus after XP changes. */
function syncM2XPPanel() {
  // XP value + bar
  const m2Cur  = document.getElementById("m2CurrentXP");
  const m2Max  = document.getElementById("m2MaxXP");
  const m2Bar  = document.getElementById("m2XpBar");
  if (m2Cur) m2Cur.textContent = currentXPEl ? currentXPEl.textContent : currentXP;
  if (m2Max) m2Max.textContent = maxXPEl    ? maxXPEl.textContent    : MAX_XP;
  if (m2Bar) {
    const pct = Math.round((currentXP / MAX_XP) * 100);
    m2Bar.style.width = `${pct}%`;
  }
  // Rank name
  const m2Rank = document.getElementById("m2RankName");
  if (m2Rank && rankNameEl) m2Rank.textContent = rankNameEl.textContent;
  // Missions completed (M1 only awards; M2 doesn't yet)
  const m2Stat = document.getElementById("m2StatMissions");
  const m1Stat = document.getElementById("statMissions");
  if (m2Stat && m1Stat) m2Stat.textContent = m1Stat.textContent;
}

let m2Started = false;
const m2UnlockedCmds = new Set();
const m2CompletedStatus = new Set();

function beginMission2() {
  try { startAssignmentAttempt("mission-002"); } catch (_) { /* non-fatal */ }
  // Navigate from the Mission 2 Overview to the Mission 2 Dashboard.
  // (Idempotent — re-clicking just re-shows the dashboard.)
  const overview  = document.getElementById("mission2Overview");
  const dashboard = document.getElementById("mission2Dashboard");
  if (overview)  overview.style.display  = "none";
  if (dashboard) dashboard.style.display = "";
  syncM2XPPanel();
  window.scrollTo({ top: 0, behavior: "instant" });

  // Milestone 25A — the M2 dashboard is active; show the control bar and
  // (re)enter Focus Mode. Done BEFORE the resume early-return so resuming an
  // in-progress Mission 2 never leaves a stale/missing control bar.
  setMissionRunning(true);
  enterFocusMode();
  // Stage 3 — (re)arm the idle escalation watch BEFORE the resume early-return,
  // so resuming an in-progress Mission 2 keeps the adversary watch alive.
  startEscalationWatch("mission-002");

  if (m2Started) return;
  m2Started = true;

  // Unlock the starting commands (ip addr + both ping targets — the
  // unreachable host is a Challenge Layer 1 false lead).
  m2UnlockedCmds.add("ip-addr");
  m2UnlockedCmds.add("ping-bad");
  m2UnlockedCmds.add("ping");
  syncM2Buttons();
  renderConfidenceMeter("mission-002");
  renderM2AnalystConfidence(); // Milestone 31A — show Analyst Confidence meter.

  // Status + opening hint + supervisor briefing
  markM2Status("started");
  setM2Hint("First, get your bearings: find your own address on the network so you have a reference point. Check your local IP to begin.");
  setM2ManagerMessage("Welcome to your next assignment, Agent. Let's map this network — start by identifying your local IP address.");
  // Milestone 24F — dynamic manager reaction for mission start (M2).
  updateManagerReaction("mission_started", { missionId: "mission-002" });
  // Milestone 26A — event toast: investigation begins.
  showEventToast("Investigation Started", "Map the network and assess the target host.", "info");

  // Print a small system line in the terminal so it's not empty
  printM2Line("[ Assignment 2 environment ready ]", "m2-line--info");

  // Milestone 24B — mission starts at baseline threat. resetThreatLevel..()
  // already runs on a fresh page, but call it explicitly here so a returning
  // student who left Mission 2 mid-way starts the replay from Medium too.
  setThreatLevel("Medium", "mission-002");

  // Milestone 24E / 24E-2 — same forced-acknowledgement modal for M2.
  if (!alertByMission["mission-002"]) createMissionAlert("mission-002");
  showAlertModal("mission-002");

  // Milestone 25A — entering the investigation activates Focus Mode.
  setMissionRunning(true);
  enterFocusMode();

  // Milestone 25B (resume-safe) — persist that M2's investigation has launched.
  missionLaunched["mission-002"] = true;
  saveProgress();

  // Stage 3 — begin watching for investigation delays (idle escalation).
  startEscalationWatch("mission-002");
}

/** Return from the Mission 2 Dashboard back to the Mission 2 Overview.
 *  Mission 2 progress (m2Started, unlocks, status) is preserved so the
 *  student can resume by clicking Begin Mission 2 again. */
function backToMission2Overview() {
  setMissionRunning(false); // Milestone 25A — leave Focus Mode / hide bar.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  const overview  = document.getElementById("mission2Overview");
  const dashboard = document.getElementById("mission2Dashboard");
  if (dashboard) dashboard.style.display = "none";
  if (overview)  overview.style.display  = "";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function runM2Command(key) {
  if (!m2Started) return;
  if (!m2UnlockedCmds.has(key)) return;
  const def = M2_COMMANDS[key];
  if (!def) return;
  try { trackGameEvent("command_executed", { assignment_id: "mission-002", command: key }); } catch (_) { /* non-fatal */ }

  // Stage 3 — real investigation progress resets the idle-escalation clock.
  noteInvestigationActivity();

  // Milestone 26A — capture "first run" BEFORE the unlock chain below adds the
  // next command, so event toasts fire once (not on every re-click).
  const firstPing = key === "ping" && !m2UnlockedCmds.has("nmap");
  const firstNmap = key === "nmap" && !m2UnlockedCmds.has("review");

  // Print prompt line + each output line
  printM2Line(`<span class="m2-prompt">student@cybercorp:~$</span> ${escapeHtml(def.cmd)}`, "m2-line--prompt");
  def.output.forEach((line) => printM2Line(escapeHtml(line), "m2-line--output"));
  printM2Line("", "m2-line--blank");

  // Mark this status step complete. UF-1 (Req 6): if this command has an
  // interpretation prompt the student hasn't answered yet, DEFER unlocking the
  // next command until they interpret the result correctly (see
  // handleM2Reasoning). Commands without a pending reasoning prompt — and
  // re-runs after the reasoning was already answered (resume-safe) — unlock
  // immediately, preserving the original flow.
  markM2Status(key);
  const m2GateReasoning = !!M2_REASONING[key] && !m2ReasoningAnswered.has(key);
  if (!m2GateReasoning) {
    def.unlocks.forEach((next) => m2UnlockedCmds.add(next));
  }
  syncM2Buttons();
  setM2Hint(m2GateReasoning
    ? "Interpret this result in Analyst Reasoning below — the next step unlocks once you do."
    : def.nextHint);
  if (def.managerMsg) setM2ManagerMessage(def.managerMsg);

  // Challenge Layer 1 (M2) — raise evidence confidence per command (once each).
  const M2_CONFIDENCE = {
    "ip-addr":  20,
    "ping-bad":  5,
    "ping":     30,
    "nmap":     30,
    "review":   20,
  };
  if (M2_CONFIDENCE[key]) {
    addConfidence("mission-002", `m2-${key}`, M2_CONFIDENCE[key]);
  }

  // Milestone 24A — Evidence Collection (Mission 2).
  // `nmap` reveals the open services; `review services` is the analyst
  // step that flags those services as needing follow-up. addEvidence is
  // idempotent, so re-clicking either command will not duplicate items.
  if (firstPing) {
    // Milestone 26A — event toast: target host responded.
    showEventToast("Host Reachable", "Target 10.0.0.5 responded.", "success");
  }
  if (key === "nmap") {
    addEvidence(
      "m2-open-ports",
      "Target host exposes SSH, HTTP, and HTTPS services",
      "mission-002"
    );
    // Milestone 26A — event toast: open services discovered (first scan only).
    if (firstNmap) {
      showEventToast("Services Found", "Open ports detected on the target.", "info");
      // Stage 2 — Blue Team (Mission 2): exposed services = red-team-exploitable
      // attack surface → raise the Red Team flag and advance containment.
      setRedTeamActive("mission-002", true);
      updateContainmentProgress("mission-002", 15, {
        stepId: "m2-recon",
        incident: "Active Threat",
        assignment: "Assess exposed services",
        caption: "Exposed services identified.",
      });
      showBlueTeamUpdate("mission-002", "Exposed services identified.", { toast: true });
    }
    // Milestone 24B — open services discovered → threat rises.
    setThreatLevel("High", "mission-002");
    // Milestone 24F — threat just rose to High → manager reacts.
    updateManagerReaction("threat_increased", { missionId: "mission-002" });
    // Milestone 24G — service scan done; service evidence collected →
    // Service Scanner complete, Analyst Review unlocks.
    markToolCompleted("m2-service-scanner");
    unlockTool("m2-analyst-review");
  }
  if (key === "review") {
    addEvidence(
      "m2-services-review",
      "Multiple exposed services require security review",
      "mission-002"
    );
    // Milestone 24B — analyst has reviewed and flagged the services → threat eases.
    setThreatLevel("Medium", "mission-002");
    // Milestone 24G — student opened the analyst review step → make it active.
    setActiveTool("m2-analyst-review");
  }
  // Milestone 24G — per-command tool transitions for the early M2 steps.
  if (key === "ip-addr") {
    // Host identified → Network Identity work is done.
    markToolCompleted("m2-network-identity");
  }
  if (key === "ping") {
    // Reachability confirmed → Reachability Check done; Service Scanner unlocks.
    markToolCompleted("m2-reachability");
    unlockTool("m2-service-scanner");
    setActiveTool("m2-service-scanner");
  }

  // Milestone 31A — per-step REASONING gate. After a major command runs, the
  // student must interpret the result before the matching evidence pin is
  // offered (one-thing-at-a-time flow). The pin offer is DEFERRED to
  // handleM2Reasoning() on a correct answer. `review` has no reasoning prompt
  // (its reasoning IS the Blue Team decision below), so it offers its pin
  // immediately, then proceeds to the decision.
  if (M2_REASONING[key]) {
    renderM2Reasoning(key);
  } else if (EVIDENCE_RATINGS["mission-002"][key]) {
    showPinPrompt("mission-002", key);
  }

  // Milestone 31A — cinematic emphasis at key network beats.
  if (firstPing) {
    showIncidentInterruption("m2-reachable", {
      title: "HOST RESPONDING",
      line:  "Target 10.0.0.5 is live on the network.",
    });
  }
  if (firstNmap) {
    showIncidentInterruption("m2-services", {
      title: "EXPOSED SERVICES DETECTED",
      line:  "SSH, HTTP, and HTTPS are open on the target host.",
    });
  }

  // Milestone 21/24D — after `review services`, gate the Analyst Review
  // behind the Decision Actions panel. Only a correct/acceptable
  // decision advances to renderM2AnalystReview(). If the student has
  // already passed the decision earlier in this session,
  // showDecisionActions is a no-op and we go straight to the review.
  if (key === "review") {
    if (decisionAdvanced["mission-002"]) {
      renderM2AnalystReview();
    } else {
      showDecisionActions("mission-002");
    }
  }
}

/* ============================================================
   Milestone 31A — Mission 2 per-step reasoning + Analyst Confidence
   ============================================================ */

/** Render the multiple-choice reasoning prompt for a network command. */
function renderM2Reasoning(key) {
  const def = M2_REASONING[key];
  const host = document.getElementById("m2Reasoning");
  if (!def || !host) return;
  // Already answered correctly — keep it collapsed, just (re-)offer the pin.
  if (m2ReasoningAnswered.has(key)) {
    host.style.display = "none";
    host.innerHTML = "";
    if (EVIDENCE_RATINGS["mission-002"][key]) showPinPrompt("mission-002", key);
    return;
  }
  host.style.display = "";
  host.innerHTML = `
    <div class="m2-reasoning" data-key="${escapeHtml(key)}">
      <div class="m2-reasoning-head">
        <span class="m2-reasoning-label">Analyst Reasoning</span>
        <span class="m2-reasoning-topic">${escapeHtml(def.title)}</span>
      </div>
      <p class="m2-reasoning-q">${escapeHtml(def.question)}</p>
      ${def.hint ? `<details class="m2-reasoning-hint"><summary>Need a hint?</summary><p>${escapeHtml(def.hint)}</p></details>` : ""}
      <div class="m2-reasoning-answers">
        ${def.answers.map((a) => `
          <button class="m2-reasoning-btn" type="button"
                  data-reasoning-key="${escapeHtml(key)}"
                  data-reasoning-letter="${escapeHtml(a.letter)}">
            <span class="m2-reasoning-letter">${escapeHtml(a.letter)}</span>
            <span class="m2-reasoning-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div class="m2-reasoning-feedback" data-reasoning-feedback style="display:none;"></div>
    </div>
  `;
  host.querySelectorAll(".m2-reasoning-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleM2Reasoning(
        btn.getAttribute("data-reasoning-key"),
        btn.getAttribute("data-reasoning-letter")
      )
    );
  });
}

/** Handle a reasoning answer. Correct → confidence + manager confirm + pin
 *  offer + next objective. Wrong → gentle retry (no penalty). */
function handleM2Reasoning(key, letter) {
  const def = M2_REASONING[key];
  const host = document.getElementById("m2Reasoning");
  if (!def || !host) return;
  if (m2ReasoningAnswered.has(key)) return;
  try { trackGameEvent("reasoning_answer_selected", { assignment_id: "mission-002", key, answer: letter }); } catch (_) { /* non-fatal */ }

  const isCorrect = letter === def.correct;
  const fb = host.querySelector("[data-reasoning-feedback]");
  const answersWrap = host.querySelector(".m2-reasoning-answers");

  if (answersWrap) {
    answersWrap.querySelectorAll(".m2-reasoning-btn").forEach((b) => {
      const l = b.getAttribute("data-reasoning-letter");
      if (l === def.correct) {
        b.classList.add(isCorrect ? "m2-reasoning-btn--correct" : "m2-reasoning-btn--reveal");
      } else if (l === letter) {
        b.classList.add("m2-reasoning-btn--wrong");
      }
      if (isCorrect || l === letter) b.disabled = true;
    });
  }
  // Wrong — reveal the gentle correction immediately, then re-open the untried
  // options after a beat (no penalty).
  if (!isCorrect) {
    if (fb) {
      fb.style.display = "";
      fb.textContent   = def.wrongMsg;
      fb.classList.remove("m2-reasoning-feedback--pending", "m2-reasoning-feedback--correct");
      fb.classList.add("m2-reasoning-feedback--wrong");
    }
    m2ReasoningTimers.push(setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".m2-reasoning-btn").forEach((b) => {
        const l = b.getAttribute("data-reasoning-letter");
        if (l === letter) return;
        b.disabled = false;
        b.classList.remove("m2-reasoning-btn--reveal");
      });
    }, 600));
    return;
  }

  // Correct — commit the gate completion IMMEDIATELY so progress is never lost
  // if the learner navigates away during the pacing beat (keeps the resume-safe,
  // idempotent-completion pattern). The "Reviewing analyst assessment..." beat
  // below is purely cosmetic pacing on top of an already-committed result.
  m2ReasoningAnswered.add(key);
  addM2AnalystConfidence(def.conf || 0);
  // UF-1 (Req 6): completing the interpretation is what unlocks the next
  // command. runM2Command deliberately held it back, so the student can't
  // advance the investigation on raw command output alone.
  const m2CmdDef = M2_COMMANDS[key];
  if (m2CmdDef && Array.isArray(m2CmdDef.unlocks)) {
    let m2Unlocked = false;
    m2CmdDef.unlocks.forEach((next) => {
      if (!m2UnlockedCmds.has(next)) { m2UnlockedCmds.add(next); m2Unlocked = true; }
    });
    if (m2Unlocked) syncM2Buttons();
  }
  try { saveProgress(); } catch (_) { /* non-fatal */ }

  if (fb) {
    fb.style.display = "";
    fb.textContent   = "Reviewing analyst assessment...";
    fb.classList.remove("m2-reasoning-feedback--correct", "m2-reasoning-feedback--wrong");
    fb.classList.add("m2-reasoning-feedback--pending");
  }
  m2ReasoningTimers.push(setTimeout(() => {
    if (fb) {
      fb.classList.remove("m2-reasoning-feedback--pending");
      fb.textContent = def.correctMsg;
      fb.classList.add("m2-reasoning-feedback--correct");
    }
    setM2ManagerMessage(def.correctMsg);

    // Offer the matching evidence pin (one-thing-at-a-time flow), then point
    // the student at the next step.
    m2ReasoningTimers.push(setTimeout(() => {
      host.style.display = "none";
      host.innerHTML = "";
      if (EVIDENCE_RATINGS["mission-002"][key]) showPinPrompt("mission-002", key);
      const nextDef = M2_COMMANDS[key];
      if (nextDef && nextDef.nextHint) setCurrentObjective("mission-002", nextDef.nextHint);
    }, 700));
  }, reviewAssessmentDelay()));
}

/** Derive the Analyst Confidence tier (label + caption) for a numeric value. */
function m2AnalystConfTier(val) {
  return M2_ANALYST_CONF_TIERS.find((t) => val >= t.min) ||
         M2_ANALYST_CONF_TIERS[M2_ANALYST_CONF_TIERS.length - 1];
}

/** Add to the Analyst Confidence track (clamped 0–100) and re-render. */
function addM2AnalystConfidence(amount) {
  m2AnalystConfidence = Math.max(0, Math.min(100, m2AnalystConfidence + (amount || 0)));
  renderM2AnalystConfidence();
  fxPulse("m2AnalystConfidence");
}

/** Set the Analyst Confidence track to an absolute value (clamped) + render. */
function setM2AnalystConfidence(val) {
  m2AnalystConfidence = Math.max(0, Math.min(100, val || 0));
  renderM2AnalystConfidence();
}

/** Paint the Analyst Confidence meter from m2AnalystConfidence. */
function renderM2AnalystConfidence() {
  const wrap = document.getElementById("m2AnalystConfidence");
  if (!wrap) return;
  const tier = m2AnalystConfTier(m2AnalystConfidence);
  const pill = wrap.querySelector(".analyst-conf-pill");
  const fill = wrap.querySelector(".analyst-conf-bar-fill");
  const cap  = wrap.querySelector(".analyst-conf-caption");
  if (pill) pill.textContent = tier.label;
  if (fill) fill.style.width = `${m2AnalystConfidence}%`;
  if (cap)  cap.textContent = tier.caption;
  wrap.className = "analyst-confidence analyst-confidence--" + tier.label.toLowerCase();
}

/* ============================================================
   Milestone 21 — Analyst Review (Mission 2)
   ============================================================ */

function renderM2AnalystReview() {
  const host = document.getElementById("m2AnalystReview");
  if (!host) return;
  // Milestone 24C idempotency — once the analyst review has been answered
  // correctly (or the mission is complete), do NOT re-render. Re-rendering
  // would wipe host.innerHTML (removing the #m2QuizPanel below it) and
  // reset m2AnalystAnswered/m2QuizAnswered to false, letting the student
  // farm trust/XP by re-clicking `review services`.
  if (m2AnalystAnswered || mission2Complete) return;
  // Reuse Mission 1's .quiz-panel chrome for visual consistency.
  host.style.display = "";
  host.innerHTML = `
    <div class="quiz-panel quiz-panel--m2" style="display:block;">
      <div class="quiz-header">
        <span class="quiz-label">Analyst Review</span>
        <span class="quiz-badge">Threat Assessment</span>
      </div>
      <p class="quiz-question">${M2_ANALYST_REVIEW.question}</p>
      <div class="quiz-answers" id="m2AnalystAnswers">
        ${M2_ANALYST_REVIEW.answers.map((a) => `
          <button class="quiz-answer-btn" type="button" data-m2letter="${a.letter}">
            <span class="quiz-answer-letter">${a.letter}</span>
            <span class="quiz-answer-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div id="m2AnalystFeedback" class="quiz-feedback" style="display:none;"></div>
      <div id="m2AnalystOutcome" style="display:none;"></div>
    </div>
  `;
  // Wire up answer buttons
  host.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleM2AnalystAnswer(btn.getAttribute("data-m2letter")));
  });
  m2AnalystAnswered = false;
}

function handleM2AnalystAnswer(letter) {
  if (m2AnalystAnswered) return;
  const isCorrect = letter === M2_ANALYST_REVIEW.correct;

  const answersWrap = document.getElementById("m2AnalystAnswers");
  if (answersWrap) {
    answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
      const l = btn.getAttribute("data-m2letter");
      btn.disabled = true;
      if (l === M2_ANALYST_REVIEW.correct) {
        btn.classList.add(isCorrect ? "quiz-answer--correct" : "quiz-answer--reveal");
      } else if (l === letter) {
        btn.classList.add("quiz-answer--wrong");
      }
    });
  }

  const fb = document.getElementById("m2AnalystFeedback");
  if (fb) {
    fb.style.display = "";
    fb.textContent   = isCorrect ? M2_ANALYST_REVIEW.correctMsg : M2_ANALYST_REVIEW.wrongMsg;
    fb.classList.toggle("quiz-feedback--correct", isCorrect);
    fb.classList.toggle("quiz-feedback--wrong",  !isCorrect);
  }

  if (!isCorrect) {
    // Allow retry — re-enable the non-correct buttons (except the one tried)
    setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
        const l = btn.getAttribute("data-m2letter");
        if (l === letter || l === M2_ANALYST_REVIEW.correct) return;
        btn.disabled = false;
      });
      // Allow retry of the correct (in case the student wants to re-pick D)
      const correctBtn = answersWrap.querySelector(`.quiz-answer-btn[data-m2letter="${M2_ANALYST_REVIEW.correct}"]`);
      if (correctBtn) {
        correctBtn.disabled = false;
        correctBtn.classList.remove("quiz-answer--reveal");
      }
    }, 600);
    return;
  }

  // Correct path — finalize
  m2AnalystAnswered = true;
  // Milestone 26A — event toast: correct analyst review.
  showEventToast("Analysis Correct", "Threat assessment recorded.", "success");
  // Milestone 24C — correct M2 analyst review → +10 trust.
  increaseTrustScore(10);
  // Milestone 24G — analyst review answered → Analyst Review done; Quiz unlocks.
  markToolCompleted("m2-analyst-review");
  unlockTool("m2-quiz");
  setActiveTool("m2-quiz");
  markM2Status("analyst-review");
  markM2Status("threat-assessment");
  // Milestone 31A — a correct analyst review means the student is ready to
  // make a recommendation → Analyst Confidence reaches "Ready" (100).
  setM2AnalystConfidence(100);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
  // Stage 2 — Blue Team (Mission 2): a documented threat assessment advances containment.
  updateContainmentProgress("mission-002", 20, { stepId: "m2-analyst", caption: "Threat assessment documented." });
  showBlueTeamUpdate("mission-002", "Threat assessment confirmed and documented.");
  setM2Hint("Assignment 2 threat assessment complete. Final assessment incoming.");
  setM2ManagerMessage("Excellent reasoning, Agent. You're starting to think like an analyst — one final question to confirm your understanding.");

  const outcome = document.getElementById("m2AnalystOutcome");
  if (outcome) {
    outcome.style.display = "";
    outcome.innerHTML = `
      <div class="m2-finding-block">
        <div class="m2-finding-label">Network Analyst Finding</div>
        <p class="m2-finding-text">${M2_ANALYST_REVIEW.finding}</p>
      </div>
      <div class="m2-summary-block">
        <div class="m2-summary-label">Learning Summary</div>
        <p class="m2-summary-text">${M2_ANALYST_REVIEW.summary}</p>
      </div>
    `;
  }

  // Terminal confirmation
  printM2Line("[ ANALYST REVIEW COMPLETE — Threat assessment recorded. ]", "m2-line--info");

  // Milestone 22 — reveal the Mission 2 final quiz after the outcome blocks.
  renderM2Quiz();
}

/* ============================================================
   Milestone 22 — Mission 2 Quiz, XP Reward, Completion
   ============================================================ */

function renderM2Quiz() {
  // Append a second .quiz-panel into the same #m2AnalystReview host.
  const host = document.getElementById("m2AnalystReview");
  if (!host) return;
  // Avoid duplicating if already rendered
  if (host.querySelector("#m2QuizPanel")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "m2QuizPanel";
  wrapper.innerHTML = `
    <div class="quiz-panel quiz-panel--m2" style="display:block; margin-top: 16px;">
      <div class="quiz-header">
        <span class="quiz-label">Final Assessment</span>
        <span class="quiz-badge">Mission 2 Quiz</span>
      </div>
      <p class="quiz-question">${M2_QUIZ.question}</p>
      <div class="quiz-answers" id="m2QuizAnswers">
        ${M2_QUIZ.answers.map((a) => `
          <button class="quiz-answer-btn" type="button" data-m2quiz="${a.letter}">
            <span class="quiz-answer-letter">${a.letter}</span>
            <span class="quiz-answer-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div id="m2QuizFeedback" class="quiz-feedback" style="display:none;"></div>
    </div>
  `;
  host.appendChild(wrapper);
  wrapper.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleM2QuizAnswer(btn.getAttribute("data-m2quiz")));
  });
  m2QuizAnswered = false;
}

function handleM2QuizAnswer(letter) {
  if (m2QuizAnswered) return;
  const isCorrect = letter === M2_QUIZ.correct;

  const answersWrap = document.getElementById("m2QuizAnswers");
  if (answersWrap) {
    answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
      const l = btn.getAttribute("data-m2quiz");
      btn.disabled = true;
      if (l === M2_QUIZ.correct) {
        btn.classList.add(isCorrect ? "quiz-answer--correct" : "quiz-answer--reveal");
      } else if (l === letter) {
        btn.classList.add("quiz-answer--wrong");
      }
    });
  }

  const fb = document.getElementById("m2QuizFeedback");
  if (fb) {
    fb.style.display = "";
    fb.textContent   = isCorrect ? M2_QUIZ.correctMsg : M2_QUIZ.wrongMsg;
    fb.classList.toggle("quiz-feedback--correct", isCorrect);
    fb.classList.toggle("quiz-feedback--wrong",  !isCorrect);
  }

  if (!isCorrect) {
    // Milestone 24F — dynamic manager reaction for a wrong M2 quiz answer.
    updateManagerReaction("quiz_incorrect", { missionId: "mission-002" });
    // Allow retry on wrong answers, same pattern as analyst review.
    setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
        const l = btn.getAttribute("data-m2quiz");
        if (l === letter) return;
        btn.disabled = false;
        btn.classList.remove("quiz-answer--reveal");
      });
    }, 600);
    return;
  }

  // Milestone 24F — dynamic manager reaction for a correct M2 quiz answer.
  updateManagerReaction("quiz_correct", { missionId: "mission-002" });

  // Correct path — complete Mission 2
  m2QuizAnswered   = true;
  mission2Complete = true;
  notifyAssignmentComplete("mission-002");
  renderAllMiniMaps(); // Milestone 25D — M2 node flips to completed.

  // Milestone 24C — correct M2 quiz (+10) AND M2 completion (+10) → +20 trust.
  increaseTrustScore(10);
  increaseTrustScore(10);

  // Milestone 24E — M2 complete ⇒ alert moves to Resolved.
  markAlertResolved("mission-002");

  // Milestone 24G — mission complete → every M2 tool is marked completed.
  markAllToolsCompleted("mission-002");

  // Award XP (uses the existing M1 XP system — M2 shares the global bar)
  awardXP(M2_QUIZ.xpReward);

  // Rank bump (only if it's a forward move — don't downgrade if already higher)
  if (rankNameEl && rankNameEl.textContent !== M2_QUIZ.newRank) {
    rankNameEl.textContent = M2_QUIZ.newRank;
    rankNameEl.classList.add("rank-name--upgraded");
  }

  // Persist + sync the M2 dashboard's mirrored profile panel
  saveProgress();
  // Milestone 33A — record this operation in the persistent career history.
  updateOperationalReputation("mission-002");
  syncM2XPPanel();

  // Mark final status + update course progress
  markM2Status("m2-complete");
  setM2Hint("Assignment 2 complete. See your scorecard below.");
  setM2ManagerMessage("Outstanding, Agent. You've completed Assignment 2. Review your scorecard — Reconnaissance Detection is being prepared as your next assignment.");
  // Milestone 24F — dynamic manager reaction for mission completion (M2).
  // Fires after the closing briefing so the scripted reaction is the
  // final line the student sees in the Supervisor panel.
  updateManagerReaction("mission_completed", { missionId: "mission-002" });
  renderCourseProgress();

  // Milestone 24B — Mission 2 complete → network secured (Low).
  setThreatLevel("Low", "mission-002");

  // Stage 3 — incident resolved: clear escalation pressure + stop the watch.
  clearEscalationWatch();
  incidentPressure["mission-002"] = 0;
  renderIncidentPressure("mission-002");

  // Stage 2 — Blue Team (Mission 2): threat fully contained on completion.
  setRedTeamActive("mission-002", false);
  updateContainmentProgress("mission-002", 0, {
    set: 100,
    incident: "Contained",
    assignment: "Incident contained — stand down",
    caption: "Network secured. All exposed services hardened.",
  });
  showBlueTeamUpdate("mission-002", "Network secured. Excellent work, Agent.");

  // FIX 5 — completion-state clarity for Mission 2.
  syncM2Buttons(); // lock command buttons now that the mission is complete
  setCurrentObjective("mission-002", COMPLETION_OBJECTIVE);
  setM2ManagerMessage(COMPLETION_MANAGER);
  // FIX 4 — pulse the Mission Map buttons until the student opens the map.
  setMapButtonsAttention("mission-002", true);

  // Milestone 31A — cinematic emphasis on mission completion (parity with M1).
  showIncidentInterruption("mission-complete", { force: true });

  // Replace the analyst review host content with the completion + scorecard
  // (keeps everything inside the COMMANDS panel — same pattern as M1).
  setTimeout(() => renderM2Scorecard(), 1200);

  // Terminal confirmation
  printM2Line("[ ASSIGNMENT 2 COMPLETE — Network Exposure Review passed. +100 XP awarded. ]", "m2-line--info");
}

/* Milestone 31A — Mission 2 outcome tier (never a fail). Mirrors M1's notion of
   a graded outcome: the strongest result needs the correct Blue Team
   recommendation, no scope drift, and high analyst confidence; otherwise it is
   "Delayed" (got there but with detours) or "Weak" (acceptable-but-not-ideal). */
function m2OutcomeTier() {
  const correct = decisionTaken["mission-002"] === "m2-recommend";
  if (correct && m2DecisionDrift === 0 && m2AnalystConfidence >= 70) {
    return { label: "Excellent", tone: "green",
      note: "Correct recommendation, no scope drift, strong analyst confidence." };
  }
  if (correct) {
    return { label: "Delayed", tone: "yellow",
      note: "Right call reached, but after detours or with lower confidence." };
  }
  return { label: "Weak", tone: "yellow",
    note: "Network contained, but the ideal Blue Team recommendation was missed." };
}

/* Milestone 31A — network-themed scorecard rows summarizing the M2 run. */
function renderM2NetworkScorecardRows() {
  const tier = m2OutcomeTier();
  const confTier = m2AnalystConfTier(m2AnalystConfidence);
  const critPins = (pinnableFindings["mission-002"]
    ? Array.from(pinnableFindings["mission-002"]) : [])
    .filter((k) => {
      const pin = investigationPins["mission-002"] && investigationPins["mission-002"][k];
      return pin && pin.critical === true;
    }).length;
  const redState = redTeamStatesFor("mission-002")[computeRedTeamState("mission-002")]
    || redTeamStatesFor("mission-002").recon;
  const recLabel = {
    "m2-recommend": "Recommend service restriction (correct)",
    "m2-shutdown":  "Shut down all services (acceptable)",
    "m2-ignore":    "No action taken",
    "m2-continue":  "Continued unrelated scanning",
  }[decisionTaken["mission-002"]] || "Not recorded";
  const contain = (typeof blueTeamContainment === "object" && blueTeamContainment
    && typeof blueTeamContainment["mission-002"] === "number")
    ? Math.max(0, Math.min(100, blueTeamContainment["mission-002"])) : null;
  let rows = `
    <li class="scorecard-row">
      <span class="scorecard-key">Operational Outcome</span>
      <span class="scorecard-val scorecard-val--${tier.tone}">${escapeHtml(tier.label)}</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Analyst Confidence (Final)</span>
      <span class="scorecard-val scorecard-val--cyan">${escapeHtml(confTier.label)} (${m2AnalystConfidence}%)</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Critical Network Evidence</span>
      <span class="scorecard-val">${critPins} pinned</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Red Team State</span>
      <span class="scorecard-val">${escapeHtml(redState.label)}</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Blue Team Recommendation</span>
      <span class="scorecard-val">${escapeHtml(recLabel)}</span>
    </li>`;
  if (contain !== null) {
    rows += `
    <li class="scorecard-row">
      <span class="scorecard-key">Containment Progress</span>
      <span class="scorecard-val scorecard-val--green">${contain}%</span>
    </li>`;
  }
  return rows;
}

function renderM2Scorecard() {
  const host = document.getElementById("m2AnalystReview");
  if (!host) return;
  const currentRank = rankNameEl ? rankNameEl.textContent : M2_QUIZ.newRank;
  const m2Tier = m2OutcomeTier();
  // Mirrors M1's buildCompletionHTML() exactly — same .completion-screen
  // / .scorecard / .certificate-preview chrome so M1 and M2 look identical.
  host.innerHTML = `
    <div class="completion-screen">

      <!-- ===== Header ===== -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Assignment 2 Complete</h2>
          <p class="completion-subtitle">
            <span class="m2-outcome-tier m2-outcome-tier--${m2Tier.tone}">${escapeHtml(m2Tier.label)}</span>
            — ${escapeHtml(m2Tier.note)}
          </p>
        </div>
      </div>

      <!-- FIX 3 — clear Next Step guidance at the top of the screen. -->
      ${buildNextStepHTML("mission-002")}

      <!-- ===== MISSION SCORECARD ===== -->
      <div class="scorecard">

        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">MISSION SCORECARD</span>

        <ul class="scorecard-rows">
          <li class="scorecard-row">
            <span class="scorecard-key">Mission</span>
            <span class="scorecard-val">${M2_SCORECARD.missionName}</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Result</span>
            <span class="scorecard-val scorecard-val--green">Completed</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Threat Assessment</span>
            <span class="scorecard-val">${escapeHtml(M2_SCORECARD.threatAssessment)}</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">XP Earned</span>
            <span class="scorecard-val scorecard-val--cyan">+${M2_QUIZ.xpReward} XP</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Rank</span>
            <span class="scorecard-val scorecard-val--yellow">${escapeHtml(currentRank)}</span>
          </li>
          <!-- Milestone 24B — final threat level recorded for this mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Final Threat Level</span>
            <span class="scorecard-val scorecard-val--threat scorecard-val--threat-${getThreatLevel("mission-002").toLowerCase()}">${escapeHtml(getThreatLevel("mission-002"))}</span>
          </li>
          <!-- Milestone 24C — manager trust score at end of mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Trust Score</span>
            <span class="scorecard-val scorecard-val--cyan">${getTrustScore()} / 100</span>
          </li>
          ${renderM2NetworkScorecardRows()}
          ${renderDecisionScorecardRows("mission-002")}
          ${renderAlertScorecardRows("mission-002")}
        </ul>
        </div>

        <!-- Milestone 24H — Mission Outcome Summary (Mission 2).
             Restates the full Alert → Investigation → Evidence →
             Decision → Consequence → Reward loop the student completed. -->
        ${buildOutcomeSummaryHTML("mission-002")}
        ${buildOperationalAssessmentHTML("mission-002")}

        <!-- Skills Practiced -->
        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">SKILLS PRACTICED</span>
          <ul class="scorecard-skills">
            ${M2_SCORECARD.skills.map((s) =>
              `<li><span class="scorecard-bullet">▹</span>${escapeHtml(s)}</li>`).join("")}
          </ul>
        </div>

        <!-- Milestone 24G — Tools Used (Mission 2 scorecard) -->
        ${buildToolsScorecardHTML("mission-002")}

        <!-- Milestone 24A — Evidence Collected (Mission 2 scorecard) -->
        ${buildEvidenceScorecardHTML("mission-002")}

        <!-- What You Learned -->
        <div class="scorecard-section scorecard-learned scorecard-section--collapsed">
          <span class="scorecard-section-label">WHAT YOU LEARNED</span>
          <p class="scorecard-learned-text">
            ${escapeHtml(M2_SCORECARD.whatYouLearned)}
          </p>
        </div>

        <!-- Next Assignment Preview -->
        <div class="scorecard-section scorecard-next scorecard-section--collapsed">
          <span class="scorecard-section-label">NEXT ASSIGNMENT PREVIEW</span>
          <p class="scorecard-next-text">
            <strong class="scorecard-next-title">${escapeHtml(M2_SCORECARD.nextMissionTitle)}</strong>
            — ${escapeHtml(M2_SCORECARD.nextMissionDesc)}
          </p>
        </div>

      </div>

      <!-- ===== CERTIFICATE PREVIEW (parity with M1) ===== -->
      <div class="certificate-preview" aria-label="Certificate of Completion Preview">

        <div class="certificate-card">
          <div class="certificate-watermark" aria-hidden="true">CYBERCORP</div>

          <div class="certificate-header">
            <span class="certificate-eyebrow">CyberCorp Training Academy</span>
            <h3 class="certificate-title">Certificate of Completion Preview</h3>
            <span class="certificate-seal" aria-hidden="true">★</span>
          </div>

          <div class="certificate-body">
            <div class="certificate-field">
              <span class="certificate-label">Awarded to</span>
              <span class="certificate-value certificate-value--name">${escapeHtml(studentName) || "Student Cyber Intern"}</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">For completing</span>
              <span class="certificate-value">Assignment 2 — Network Exposure Review</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Skills Demonstrated</span>
              <ul class="certificate-skills">
                ${M2_SCORECARD.certSkills.map((s) =>
                  `<li><span class="certificate-bullet">▹</span>${escapeHtml(s)}</li>`).join("")}
              </ul>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Status</span>
              <span class="certificate-value certificate-value--status">Assignment 2 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all assignments in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all assignments are complete">
              🔒&nbsp; Download Certificate — Locked
            </button>
          </div>
        </div>
      </div>

      <!-- Restart button (matches M1's .restart-btn styling) -->
      <button id="restartMission2Btn" class="restart-btn" type="button">
        ↺ &nbsp;Restart Mission 2
      </button>

    </div>
  `;
  host.style.display = "";

  const restartBtn = document.getElementById("restartMission2Btn");
  if (restartBtn) restartBtn.addEventListener("click", () => {
    // Restart Mission 2 only — does not touch Mission 1.
    resetMission2();
    beginMission2();
  });

  // FIX 3 — wire the Next Step panel buttons.
  wireNextStepButtons("mission-002");
}

function syncM2Buttons() {
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    const key = btn.getAttribute("data-m2cmd");
    const unlocked = m2UnlockedCmds.has(key);
    // Milestone 35B — lock via aria-disabled (not the `disabled` attribute) so
    // locked cards stay hoverable/focusable for their learning tooltip. The
    // click handler ignores aria-disabled cards, so they still can't be run.
    const locked = !unlocked || mission2Complete; // FIX 5 — lock after completion
    btn.setAttribute("aria-disabled", String(locked));
    btn.classList.toggle("m2-cmd-btn--unlocked", unlocked);
    if (unlocked) btn.removeAttribute("title");
  });
}

function printM2Line(html, cls = "") {
  const term = document.getElementById("m2Terminal");
  if (!term) return;
  const div = document.createElement("div");
  div.className = `m2-line ${cls}`.trim();
  div.innerHTML = html;
  term.appendChild(div);
  // FIX 1 — command echoes (demo "cmd" + the main flow's "prompt" lines) show
  // instantly; everything else (output/blank/info) reveals one line at a time.
  if (cls.includes("cmd") || cls.includes("prompt")) {
    flushTerminalOutput();          // command echo shows instantly
    term.scrollTop = term.scrollHeight;
  } else {
    queueTerminalReveal(div);       // FIX 1 — paced output reveal
  }
}

function setM2Hint(text) {
  const el = document.getElementById("m2Hint");
  if (el) el.textContent = text;
  // Milestone 25A — keep the Current Objective card in sync with the hint.
  setCurrentObjective("mission-002", text);
}

function markM2Status(id) {
  if (m2CompletedStatus.has(id)) return;
  m2CompletedStatus.add(id);
  renderM2Status();
}

function renderM2Status() {
  const list = document.getElementById("m2StatusList");
  if (!list) return;
  list.innerHTML = M2_STATUS.map((s) => {
    const done = m2CompletedStatus.has(s.id);
    return `
      <li class="m2-status-item ${done ? "m2-status-item--done" : "m2-status-item--pending"}">
        <span class="m2-status-icon">${done ? "✓" : "•"}</span>
        <span class="m2-status-label">${s.label}</span>
      </li>
    `;
  }).join("");
}

/** Resets Mission 2 in-memory state + dashboard UI back to a fresh state. */
function resetMission2() {
  try { abandonAssignmentAttempt("mission-002"); trackGameEvent("assignment_restarted", { assignment_id: "mission-002" }); } catch (_) { /* non-fatal */ }
  setMissionRunning(false); // Milestone 25A — leave Focus Mode on restart.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  m2Started = false;
  missionLaunched["mission-002"] = false; // Milestone 25B — clear durable launch flag
  m2UnlockedCmds.clear();
  m2CompletedStatus.clear();
  m2AnalystAnswered = false;
  m2QuizAnswered    = false;
  mission2Complete  = false;
  renderAllMiniMaps(); // Milestone 25D — refresh AFTER mission2Complete cleared.
  // Challenge Layer 1 — reset Mission 2 confidence.
  m2Confidence = 0;
  m2ConfidenceContributors.clear();
  renderConfidenceMeter("mission-002");

  // Milestone 31A — reset Mission 2 Analyst Confidence + reasoning + drift.
  clearM2ReasoningTimers();
  m2AnalystConfidence = 0;
  m2ReasoningAnswered.clear();
  m2DecisionDrift = 0;
  renderM2AnalystConfidence();
  const reasoningHost = document.getElementById("m2Reasoning");
  if (reasoningHost) { reasoningHost.innerHTML = ""; reasoningHost.style.display = "none"; }

  // Investigation Board — clear Mission 2 pins + pin UI on restart.
  investigationPins["mission-002"] = {};
  pinnableFindings["mission-002"].clear();
  Array.from(pinXpAwarded).forEach((k) => {
    if (k.startsWith("mission-002:")) pinXpAwarded.delete(k);
  });
  renderInvestigationBoard("mission-002");
  const pinHostM2 = document.getElementById("m2PinPanel");
  if (pinHostM2) { pinHostM2.innerHTML = ""; pinHostM2.style.display = "none"; }

  // Milestone 24I — replaying clears Mission 2's Briefing Room state.
  briefingReviewed["mission-002"].clear();
  briefingXpAwarded.delete("mission-002");
  renderBriefingRoom("mission-002");

  // Milestone 24A — restarting Mission 2 clears only Mission 2's evidence.
  clearEvidenceForMission("mission-002");
  // Milestone 24B — restart resets Mission 2's threat level to baseline.
  resetThreatLevelForMission("mission-002");
  // Milestone 24G — restart resets Mission 2's tools to their start states.
  resetToolsForMission("mission-002");
  // Stage 2 — restart clears Mission 2's Blue Team containment state.
  resetBlueTeam("mission-002");
  // Stage 3 — restart clears Mission 2's Adversary Escalation state.
  resetEscalation("mission-002");
  // Persist — clears mission2Complete flag from localStorage too
  saveProgress();
  // Course progress reflects the regression (M2 back to "Unlocked")
  renderCourseProgress();

  setMapButtonsAttention("mission-002", false); // FIX 4 — restart clears the prompt.
  clearTerminalOutputQueue();                   // FIX 1 — drop any pending reveals.
  const term = document.getElementById("m2Terminal");
  if (term) term.innerHTML = "";
  setM2Hint("First, get your bearings: find your own address on the network so you have a reference point. Check your local IP to begin.");
  setM2ManagerMessage("Welcome back. This assignment is a network reconnaissance exercise. Click any unlocked command to begin.");
  renderM2Status();

  // Milestone 21 — clear and hide the Analyst Review panel on reset
  const review = document.getElementById("m2AnalystReview");
  if (review) { review.innerHTML = ""; review.style.display = "none"; }

  // Milestone 24D — clear the Mission 2 decision state on restart.
  resetDecisionForMission("mission-002");

  // Milestone 24E — restarting Mission 2 resets its alert (spec #14).
  clearAlert("mission-002");
  createMissionAlert("mission-002");

  // Buttons back to disabled
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    btn.setAttribute("aria-disabled", "true"); // Milestone 35B — keep hoverable
    btn.classList.remove("m2-cmd-btn--unlocked");
  });

  // Hide the dashboard if it's currently showing
  const dashboard = document.getElementById("mission2Dashboard");
  if (dashboard) dashboard.style.display = "none";
}

/* ============================================================
   MISSION 3 ENGINE  (Assignment 3 — Reconnaissance Detection)
   Mirror of the Mission 2 engine, renamed m2->m3 and themed for
   network reconnaissance detection. Keyed by "mission-003".
   ============================================================ */
function showMission3Overview() {
  const overview = document.getElementById("mission3Overview");
  if (!overview) return;
  setMissionRunning(false); // Milestone 25A — overview is not an active dashboard.
  // Milestone 28C — the M1→M3 "Continue" path lands here WITHOUT routing through
  // endGuidedRun(), so tear down any live cinematic (cancels its fade/follow-up/
  // glow timers) explicitly — otherwise a delayed callback could fire on M3.
  clearIncidentCinema();
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  // Milestone 25C — also hide the Missions Map when launching M3 from it, so
  // screens never stack (parity with openMission1Dashboard()).
  const mapEl = document.getElementById("missionsMap");
  if (mapEl) mapEl.style.display = "none";
  overview.style.display = "";
  overview.scrollTop = 0;
  // Milestone 24I — render the Mission 3 Briefing Room on entry.
  renderBriefingRoom("mission-003");
  renderAllMiniMaps();
  window.scrollTo({ top: 0, behavior: "instant" });
  // Milestone 25B fix — auto-open the guided briefing overlay for a FRESH M3
  // start (parity with Mission 1). Skipped once M3 has started OR is complete
  // (m3Started is session-only, so the completion guard covers reload-after-finish).
  if (!m3Started && !mission3Complete) startGuidedBriefing("mission-003", beginMission3);
}

function hideMission3Overview() {
  setMissionRunning(false); // Milestone 25A — leave Focus Mode / hide bar.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  const overview = document.getElementById("mission3Overview");
  if (overview) overview.style.display = "none";
  if (moduleLandingEl) {
    moduleLandingEl.style.display = "";
    moduleLandingEl.scrollTop = 0;
  }
  // Milestone 32A — keep the Operations Center home in sync on return.
  renderOperationsCenter();
}

/* ============================================================
   MISSION 2 GAMEPLAY  (Milestone 20)
   Guided 4-command sequence on the Mission 3 Overview screen.
   Self-contained — does not touch Mission 1 state.
   ============================================================ */

// Ordered status entries. Each is marked complete as the student progresses.
const M3_STATUS = [
  { id: "started",            label: "Mission 3 Started" },
  { id: "ip-addr",            label: "Connections Reviewed" },
  { id: "ping",               label: "Suspicious Source Identified" },
  { id: "nmap",               label: "Probe Pattern Found" },
  { id: "review",             label: "Recon Activity Confirmed" },
  // Milestone 21 — Analyst Review + Threat Assessment
  { id: "analyst-review",     label: "Analyst Review Completed" },
  { id: "threat-assessment",  label: "Threat Assessment Complete" },
  // Milestone 22 — Mission 3 final completion (quiz passed)
  { id: "m3-complete",        label: "Mission 3 Complete" },
];

// Milestone 22 — Mission 3 quiz, XP reward, and scorecard data.
const M3_QUIZ = {
  question: "What is reconnaissance in a cyber attack?",
  answers: [
    { letter: "A", text: "A type of computer virus." },
    { letter: "B", text: "When an attacker gathers information about a target before attacking." },
    { letter: "C", text: "A setting on a firewall." },
    { letter: "D", text: "A way to make the network faster." },
  ],
  correct:    "B",
  correctMsg: "Correct. Reconnaissance is the quiet information-gathering stage attackers use before an attack.",
  wrongMsg:   "Review the activity again. Reconnaissance is when an attacker quietly gathers information about a target before striking.",
  xpReward:   100,
  newRank:    "Cyber Analyst Trainee",
};

const M3_SCORECARD = {
  missionName:     "Reconnaissance Detection",
  subtitle:        "You detected and analyzed early-stage reconnaissance activity.",
  skills: [
    "Reviewing active connections",
    "Spotting a repeated external source",
    "Identifying an unknown source",
    "Recognizing a service-probe pattern",
    "Correlating reconnaissance signals",
  ],
  threatAssessment: "An unknown external host (203.0.113.77) was systematically probing internal services — classic early-stage reconnaissance.",
  whatYouLearned: "You learned how analysts detect reconnaissance by reviewing connections, identifying an unknown repeated source, recognizing a service-probe pattern, and correlating weak signals into one conclusion.",
  nextMissionTitle: "Threat Containment",
  nextMissionDesc:  "Go deeper into how Blue Teams respond once an active threat is confirmed.",
  certSkills: [
    "Connection analysis",
    "Source attribution",
    "Probe-pattern recognition",
    "Reconnaissance reasoning",
  ],
};

let mission3Complete    = false;
let m3QuizAnswered      = false;

// Per-command: terminal output lines + hint shown AFTER the command runs +
// commands this one unlocks next + supervisor message fired after the run.
const M3_COMMANDS = {
  "ip-addr": {
    cmd:    "netstat -an",
    output: [
      "Active connections:",
      "203.0.113.77:443   ESTABLISHED",
      "203.0.113.77:80    TIME_WAIT",
      "203.0.113.77:22    SYN_SENT",
    ],
    nextHint: "One external address keeps reappearing. Find out who it is — a known service is harmless, an unknown one is a lead. Look it up.",
    unlocks: [],
    managerMsg: "Good — you've reviewed the active connections. One external address keeps appearing. Find out who it is.",
  },
  // Challenge Layer 1 (M3) — false lead: a benign known source. Provides a
  // little confidence for checking, but does NOT unlock the next step.
  "ping-bad": {
    cmd:    "whois 198.51.100.20",
    output: [
      "OrgName: Global CDN Services",
      "Status:  Known content-delivery network",
    ],
    nextHint: "A known CDN — normal traffic you can rule out. Now identify the source that keeps repeating instead.",
    unlocks: [],
    managerMsg: "That's a known content-delivery network — legitimate traffic. Focus on the address that keeps repeating.",
  },
  "ping": {
    cmd:    "whois 203.0.113.77",
    output: [
      "OrgName: Unknown / Unregistered",
      "Country: --",
      "Status:  No abuse contact on file",
    ],
    nextHint: "This source is unknown and unregistered — a real red flag. Find out what it's been doing by checking the logs.",
    unlocks: ["nmap"],
    managerMsg: "An unknown, unregistered source — that's a red flag. Check the logs to see what it's been doing.",
  },
  "nmap": {
    cmd:    "grep 203.0.113.77 access.log",
    output: [
      "203.0.113.77 -> port 22 (ssh)    probe",
      "203.0.113.77 -> port 80 (http)   probe",
      "203.0.113.77 -> port 443 (https) probe",
      "203.0.113.77 -> port 3306 (mysql) probe",
    ],
    nextHint: "You can see what the source touched. Now work out what the pattern means — review whether this looks like scanning.",
    unlocks: ["review"],
    managerMsg: "It's probing one service after another — that's a scanning pattern. Review what this tells us.",
  },
  "review": {
    cmd:    "review recon",
    output: ["One unknown external host is systematically probing multiple services."],
    nextHint: "Decide what stage of an attack this is — answer the Analyst Review below to make your call.",
    unlocks: [],
    managerMsg: "Good. You've correlated the signals. Now think like an analyst — what stage of an attack is this?",
  },
};

// Milestone 21 — Analyst Review question shown after `review recon`.
const M3_ANALYST_REVIEW = {
  question: "What does this activity represent?",
  answers: [
    { letter: "A", text: "An active data breach in progress." },
    { letter: "B", text: "A denial-of-service attack." },
    { letter: "C", text: "A normal software update." },
    { letter: "D", text: "Reconnaissance — an attacker gathering information before an attack." },
  ],
  correct: "D",
  correctMsg: "Correct. Systematic probing from an unknown source is reconnaissance — the information-gathering stage before an attack.",
  wrongMsg:   "Not quite. Nothing is being stolen or overwhelmed yet — this is quiet information-gathering, i.e. reconnaissance.",
  finding:    "An unknown external host (203.0.113.77) is performing systematic reconnaissance against internal services.",
  summary:    "Reconnaissance is an early warning. Detecting it lets the Blue Team respond before an attacker finds a way in.",
};

/* ============================================================
   Milestone 31A — Mission 3 PER-STEP REASONING PROMPTS
   ------------------------------------------------------------
   After each major network command runs, the student answers ONE short
   "what does this mean?" question before moving on — mirroring Mission 1's
   one-clue-at-a-time investigative reasoning. A correct answer raises the
   ANALYST CONFIDENCE track and then offers the matching evidence pin.
   The 5th step ("what should Blue Team do") is intentionally MERGED into the
   Blue Team decision moment (the decision IS that reasoning), so there is no
   separate prompt for `review` — keeping cognitive load low.

   `conf` = one-time Analyst Confidence gain for a correct interpretation.
   ============================================================ */
const M3_REASONING = {
  "ip-addr": {
    title: "Active Connections",
    question: "What stands out in these connections?",
    answers: [
      { letter: "A", text: "One external address is connecting repeatedly." },
      { letter: "B", text: "All connections are internal and normal." },
      { letter: "C", text: "The workstation is offline." },
    ],
    correct: "A",
    conf: 15,
    correctMsg: "Right — one external address keeps reappearing. That repetition is worth investigating.",
    wrongMsg:   "Look again — the same external address (203.0.113.77) appears on several connections.",
    hint: "Scan the list for an address that keeps reappearing — repetition from one external source is the signal here.",
  },
  "ping-bad": {
    title: "Known Source",
    question: "What does this lookup tell you?",
    answers: [
      { letter: "A", text: "This source is an unknown attacker." },
      { letter: "B", text: "This source is a known, legitimate CDN." },
      { letter: "C", text: "This proves the network is breached." },
    ],
    correct: "B",
    conf: 15,
    correctMsg: "Correct — a known CDN is normal traffic. Ruling a source out is useful too.",
    wrongMsg:   "Re-read it — this is a registered content-delivery network, i.e. legitimate traffic.",
    hint: "A registered content-delivery network is normal traffic. Ruling a source out is still progress.",
  },
  "ping": {
    title: "Unknown Source",
    question: "Why is this source concerning?",
    answers: [
      { letter: "A", text: "It is a trusted internal server." },
      { letter: "B", text: "It is unknown and unregistered, with no abuse contact." },
      { letter: "C", text: "It has no open services." },
    ],
    correct: "B",
    conf: 25,
    correctMsg: "Correct — an unregistered, unknown source connecting repeatedly is a real red flag.",
    wrongMsg:   "Look again — the lookup shows an unknown, unregistered source with no abuse contact.",
    hint: "Check whether the source is registered and has an abuse contact — an unknown, unregistered source connecting repeatedly is the red flag.",
  },
  "nmap": {
    title: "Probe Pattern",
    question: "What does this log pattern show?",
    answers: [
      { letter: "A", text: "The source is systematically probing many services." },
      { letter: "B", text: "The source downloaded one file by accident." },
      { letter: "C", text: "The log is empty." },
    ],
    correct: "A",
    conf: 35,
    correctMsg: "Exactly — probing one service after another is a classic reconnaissance scan.",
    wrongMsg:   "Not quite. The same source is hitting many different services in sequence — a scanning pattern.",
    hint: "One source touching many different services in sequence is a scanning / reconnaissance pattern, not a single accidental hit.",
  },
};

// Five Analyst Confidence tiers (Low → Ready). The label is derived from the
// numeric value; reaching Ready (100) requires the correct analyst review.
const M3_ANALYST_CONF_TIERS = [
  { min: 100, label: "Ready",      caption: "You're ready to make a recommendation." },
  { min: 70,  label: "Strong",     caption: "Your read on the activity is strong." },
  { min: 40,  label: "Developing", caption: "Your assessment is taking shape." },
  { min: 20,  label: "Building",   caption: "You're starting to understand the activity." },
  { min: 0,   label: "Low",        caption: "Interpret each finding to build confidence." },
];

let m3AnalystAnswered = false;

function setM3ManagerMessage(text) {
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage("mission-003", text);
}

/** Mirror current XP/Rank/stats from M1 elements into the M3 dashboard's
 *  AGENT PROFILE panel. Single source of truth is the M1 element values
 *  (and the currentXP / MAX_XP / mission1Complete state vars). Called on
 *  every M3 dashboard entry plus after XP changes. */
function syncM3XPPanel() {
  // XP value + bar
  const m3Cur  = document.getElementById("m3CurrentXP");
  const m3Max  = document.getElementById("m3MaxXP");
  const m3Bar  = document.getElementById("m3XpBar");
  if (m3Cur) m3Cur.textContent = currentXPEl ? currentXPEl.textContent : currentXP;
  if (m3Max) m3Max.textContent = maxXPEl    ? maxXPEl.textContent    : MAX_XP;
  if (m3Bar) {
    const pct = Math.round((currentXP / MAX_XP) * 100);
    m3Bar.style.width = `${pct}%`;
  }
  // Rank name
  const m3Rank = document.getElementById("m3RankName");
  if (m3Rank && rankNameEl) m3Rank.textContent = rankNameEl.textContent;
  // Missions completed (M1 only awards; M3 doesn't yet)
  const m3Stat = document.getElementById("m3StatMissions");
  const m1Stat = document.getElementById("statMissions");
  if (m3Stat && m1Stat) m3Stat.textContent = m1Stat.textContent;
}

let m3Started = false;
const m3UnlockedCmds = new Set();
const m3CompletedStatus = new Set();

function beginMission3() {
  try { startAssignmentAttempt("mission-003"); } catch (_) { /* non-fatal */ }
  // Navigate from the Mission 3 Overview to the Mission 3 Dashboard.
  // (Idempotent — re-clicking just re-shows the dashboard.)
  const overview  = document.getElementById("mission3Overview");
  const dashboard = document.getElementById("mission3Dashboard");
  if (overview)  overview.style.display  = "none";
  if (dashboard) dashboard.style.display = "";
  syncM3XPPanel();
  window.scrollTo({ top: 0, behavior: "instant" });

  // Milestone 25A — the M3 dashboard is active; show the control bar and
  // (re)enter Focus Mode. Done BEFORE the resume early-return so resuming an
  // in-progress Mission 3 never leaves a stale/missing control bar.
  setMissionRunning(true);
  enterFocusMode();
  // Stage 3 — (re)arm the idle escalation watch BEFORE the resume early-return,
  // so resuming an in-progress Mission 3 keeps the adversary watch alive.
  startEscalationWatch("mission-003");

  if (m3Started) return;
  m3Started = true;

  // Unlock the starting commands (ip addr + both ping targets — the
  // unreachable host is a Challenge Layer 1 false lead).
  m3UnlockedCmds.add("ip-addr");
  m3UnlockedCmds.add("ping-bad");
  m3UnlockedCmds.add("ping");
  syncM3Buttons();
  renderConfidenceMeter("mission-003");
  renderM3AnalystConfidence(); // Milestone 31A — show Analyst Confidence meter.

  // Status + opening hint + supervisor briefing
  markM3Status("started");
  setM3Hint("Goal: find out who this workstation is talking to. Repeated or unfamiliar connections are the first sign of recon — start by reviewing the active connections.");
  setM3ManagerMessage("Welcome to your next assignment, Agent. We've flagged unusual traffic — start by reviewing the active connections.");
  // Milestone 24F — dynamic manager reaction for mission start (M3).
  updateManagerReaction("mission_started", { missionId: "mission-003" });
  // Milestone 26A — event toast: investigation begins.
  showEventToast("Investigation Started", "Review the traffic and identify the suspicious source.", "info");

  // Print a small system line in the terminal so it's not empty
  printM3Line("[ Assignment 3 environment ready ]", "m3-line--info");

  // Milestone 24B — mission starts at baseline threat. resetThreatLevel..()
  // already runs on a fresh page, but call it explicitly here so a returning
  // student who left Mission 3 mid-way starts the replay from Medium too.
  setThreatLevel("Medium", "mission-003");

  // Milestone 24E / 24E-2 — same forced-acknowledgement modal for M3.
  if (!alertByMission["mission-003"]) createMissionAlert("mission-003");
  showAlertModal("mission-003");

  // Milestone 25A — entering the investigation activates Focus Mode.
  setMissionRunning(true);
  enterFocusMode();

  // Milestone 25B (resume-safe) — persist that M3's investigation has launched.
  missionLaunched["mission-003"] = true;
  saveProgress();

  // Stage 3 — begin watching for investigation delays (idle escalation).
  startEscalationWatch("mission-003");
}

/** Return from the Mission 3 Dashboard back to the Mission 3 Overview.
 *  Mission 3 progress (m3Started, unlocks, status) is preserved so the
 *  student can resume by clicking Begin Mission 3 again. */
function backToMission3Overview() {
  setMissionRunning(false); // Milestone 25A — leave Focus Mode / hide bar.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  const overview  = document.getElementById("mission3Overview");
  const dashboard = document.getElementById("mission3Dashboard");
  if (dashboard) dashboard.style.display = "none";
  if (overview)  overview.style.display  = "";
  window.scrollTo({ top: 0, behavior: "instant" });
}

function runM3Command(key) {
  if (!m3Started) return;
  if (!m3UnlockedCmds.has(key)) return;
  const def = M3_COMMANDS[key];
  if (!def) return;
  try { trackGameEvent("command_executed", { assignment_id: "mission-003", command: key }); } catch (_) { /* non-fatal */ }

  // Stage 3 — real investigation progress resets the idle-escalation clock.
  noteInvestigationActivity();

  // Milestone 26A — capture "first run" BEFORE the unlock chain below adds the
  // next command, so event toasts fire once (not on every re-click).
  const firstPing = key === "ping" && !m3UnlockedCmds.has("nmap");
  const firstNmap = key === "nmap" && !m3UnlockedCmds.has("review");

  // Print prompt line + each output line
  printM3Line(`<span class="m3-prompt">student@cybercorp:~$</span> ${escapeHtml(def.cmd)}`, "m3-line--prompt");
  def.output.forEach((line) => printM3Line(escapeHtml(line), "m3-line--output"));
  printM3Line("", "m3-line--blank");

  // Mark this status step complete. UF-1 (Req 6): if this command has an
  // interpretation prompt the student hasn't answered yet, DEFER unlocking the
  // next command until they interpret the result correctly (see
  // handleM3Reasoning). Commands without a pending reasoning prompt — and
  // re-runs after the reasoning was already answered (resume-safe) — unlock
  // immediately, preserving the original flow.
  markM3Status(key);
  const m3GateReasoning = !!M3_REASONING[key] && !m3ReasoningAnswered.has(key);
  if (!m3GateReasoning) {
    def.unlocks.forEach((next) => m3UnlockedCmds.add(next));
  }
  syncM3Buttons();
  setM3Hint(m3GateReasoning
    ? "Interpret this result in Analyst Reasoning below — the next step unlocks once you do."
    : def.nextHint);
  if (def.managerMsg) setM3ManagerMessage(def.managerMsg);

  // Challenge Layer 1 (M3) — raise evidence confidence per command (once each).
  const M3_CONFIDENCE = {
    "ip-addr":  20,
    "ping-bad":  5,
    "ping":     30,
    "nmap":     30,
    "review":   20,
  };
  if (M3_CONFIDENCE[key]) {
    addConfidence("mission-003", `m3-${key}`, M3_CONFIDENCE[key]);
  }

  // Milestone 24A — Evidence Collection (Mission 3).
  // `nmap` reveals the open services; `review services` is the analyst
  // step that flags those services as needing follow-up. addEvidence is
  // idempotent, so re-clicking either command will not duplicate items.
  if (firstPing) {
    // Milestone 26A — event toast: suspicious source identified.
    showEventToast("Suspicious Source", "Unknown external host 203.0.113.77 identified.", "info");
  }
  if (key === "nmap") {
    addEvidence(
      "m3-open-ports",
      "Unknown source 203.0.113.77 is systematically probing multiple services",
      "mission-003"
    );
    // Milestone 26A — event toast: probe pattern discovered (first scan only).
    if (firstNmap) {
      showEventToast("Probe Pattern Found", "Sequential service probes detected.", "info");
      // Stage 2 — Blue Team (Mission 3): active reconnaissance = red-team activity
      // → raise the Red Team flag and advance containment.
      setRedTeamActive("mission-003", true);
      updateContainmentProgress("mission-003", 15, {
        stepId: "m3-recon",
        incident: "Active Threat",
        assignment: "Assess reconnaissance scope",
        caption: "Reconnaissance activity identified.",
      });
      showBlueTeamUpdate("mission-003", "Reconnaissance activity identified.", { toast: true });
    }
    // Milestone 24B — active reconnaissance discovered → threat rises.
    setThreatLevel("High", "mission-003");
    // Milestone 24F — threat just rose to High → manager reacts.
    updateManagerReaction("threat_increased", { missionId: "mission-003" });
    // Milestone 24G — service scan done; service evidence collected →
    // Service Scanner complete, Analyst Review unlocks.
    markToolCompleted("m3-service-scanner");
    unlockTool("m3-analyst-review");
  }
  if (key === "review") {
    addEvidence(
      "m3-services-review",
      "Correlated signals confirm reconnaissance against internal services",
      "mission-003"
    );
    // Milestone 24B — analyst has correlated and reported the activity → threat eases.
    setThreatLevel("Medium", "mission-003");
    // Milestone 24G — student opened the analyst review step → make it active.
    setActiveTool("m3-analyst-review");
  }
  // Milestone 24G — per-command tool transitions for the early M3 steps.
  if (key === "ip-addr") {
    // Connections reviewed → Connection Review work is done.
    markToolCompleted("m3-network-identity");
  }
  if (key === "ping") {
    // Suspicious source identified → Source Lookup done; Log Scanner unlocks.
    markToolCompleted("m3-reachability");
    unlockTool("m3-service-scanner");
    setActiveTool("m3-service-scanner");
  }

  // Milestone 31A — per-step REASONING gate. After a major command runs, the
  // student must interpret the result before the matching evidence pin is
  // offered (one-thing-at-a-time flow). The pin offer is DEFERRED to
  // handleM3Reasoning() on a correct answer. `review` has no reasoning prompt
  // (its reasoning IS the Blue Team decision below), so it offers its pin
  // immediately, then proceeds to the decision.
  if (M3_REASONING[key]) {
    renderM3Reasoning(key);
  } else if (EVIDENCE_RATINGS["mission-003"][key]) {
    showPinPrompt("mission-003", key);
  }

  // Milestone 31A — cinematic emphasis at key network beats.
  if (firstPing) {
    showIncidentInterruption("m3-reachable", {
      title: "UNKNOWN SOURCE IDENTIFIED",
      line:  "External host 203.0.113.77 is unregistered.",
    });
  }
  if (firstNmap) {
    showIncidentInterruption("m3-services", {
      title: "RECON PATTERN DETECTED",
      line:  "203.0.113.77 is probing one service after another.",
    });
  }

  // Milestone 21/24D — after `review services`, gate the Analyst Review
  // behind the Decision Actions panel. Only a correct/acceptable
  // decision advances to renderM3AnalystReview(). If the student has
  // already passed the decision earlier in this session,
  // showDecisionActions is a no-op and we go straight to the review.
  if (key === "review") {
    if (decisionAdvanced["mission-003"]) {
      renderM3AnalystReview();
    } else {
      showDecisionActions("mission-003");
    }
  }
}

/* ============================================================
   Milestone 31A — Mission 3 per-step reasoning + Analyst Confidence
   ============================================================ */

/** Render the multiple-choice reasoning prompt for a network command. */
function renderM3Reasoning(key) {
  const def = M3_REASONING[key];
  const host = document.getElementById("m3Reasoning");
  if (!def || !host) return;
  // Already answered correctly — keep it collapsed, just (re-)offer the pin.
  if (m3ReasoningAnswered.has(key)) {
    host.style.display = "none";
    host.innerHTML = "";
    if (EVIDENCE_RATINGS["mission-003"][key]) showPinPrompt("mission-003", key);
    return;
  }
  host.style.display = "";
  host.innerHTML = `
    <div class="m2-reasoning" data-key="${escapeHtml(key)}">
      <div class="m2-reasoning-head">
        <span class="m2-reasoning-label">Analyst Reasoning</span>
        <span class="m2-reasoning-topic">${escapeHtml(def.title)}</span>
      </div>
      <p class="m2-reasoning-q">${escapeHtml(def.question)}</p>
      ${def.hint ? `<details class="m2-reasoning-hint"><summary>Need a hint?</summary><p>${escapeHtml(def.hint)}</p></details>` : ""}
      <div class="m2-reasoning-answers">
        ${def.answers.map((a) => `
          <button class="m2-reasoning-btn" type="button"
                  data-reasoning-key="${escapeHtml(key)}"
                  data-reasoning-letter="${escapeHtml(a.letter)}">
            <span class="m2-reasoning-letter">${escapeHtml(a.letter)}</span>
            <span class="m2-reasoning-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div class="m2-reasoning-feedback" data-reasoning-feedback style="display:none;"></div>
    </div>
  `;
  host.querySelectorAll(".m2-reasoning-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleM3Reasoning(
        btn.getAttribute("data-reasoning-key"),
        btn.getAttribute("data-reasoning-letter")
      )
    );
  });
}

/** Handle a reasoning answer. Correct → confidence + manager confirm + pin
 *  offer + next objective. Wrong → gentle retry (no penalty). */
function handleM3Reasoning(key, letter) {
  const def = M3_REASONING[key];
  const host = document.getElementById("m3Reasoning");
  if (!def || !host) return;
  if (m3ReasoningAnswered.has(key)) return;
  try { trackGameEvent("reasoning_answer_selected", { assignment_id: "mission-003", key, answer: letter }); } catch (_) { /* non-fatal */ }

  const isCorrect = letter === def.correct;
  const fb = host.querySelector("[data-reasoning-feedback]");
  const answersWrap = host.querySelector(".m2-reasoning-answers");

  if (answersWrap) {
    answersWrap.querySelectorAll(".m2-reasoning-btn").forEach((b) => {
      const l = b.getAttribute("data-reasoning-letter");
      if (l === def.correct) {
        b.classList.add(isCorrect ? "m2-reasoning-btn--correct" : "m2-reasoning-btn--reveal");
      } else if (l === letter) {
        b.classList.add("m2-reasoning-btn--wrong");
      }
      if (isCorrect || l === letter) b.disabled = true;
    });
  }

  // Wrong — reveal the gentle correction immediately, then re-open the untried
  // options after a beat (no penalty).
  if (!isCorrect) {
    if (fb) {
      fb.style.display = "";
      fb.textContent   = def.wrongMsg;
      fb.classList.remove("m2-reasoning-feedback--pending", "m2-reasoning-feedback--correct");
      fb.classList.add("m2-reasoning-feedback--wrong");
    }
    m3ReasoningTimers.push(setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".m2-reasoning-btn").forEach((b) => {
        const l = b.getAttribute("data-reasoning-letter");
        if (l === letter) return;
        b.disabled = false;
        b.classList.remove("m2-reasoning-btn--reveal");
      });
    }, 600));
    return;
  }

  // Correct — commit the gate completion IMMEDIATELY so progress is never lost
  // if the learner navigates away during the pacing beat (keeps the resume-safe,
  // idempotent-completion pattern). The "Reviewing analyst assessment..." beat
  // below is purely cosmetic pacing on top of an already-committed result.
  m3ReasoningAnswered.add(key);
  addM3AnalystConfidence(def.conf || 0);
  // UF-1 (Req 6): completing the interpretation is what unlocks the next
  // command. runM3Command deliberately held it back, so the student can't
  // advance the investigation on raw command output alone.
  const m3CmdDef = M3_COMMANDS[key];
  if (m3CmdDef && Array.isArray(m3CmdDef.unlocks)) {
    let m3Unlocked = false;
    m3CmdDef.unlocks.forEach((next) => {
      if (!m3UnlockedCmds.has(next)) { m3UnlockedCmds.add(next); m3Unlocked = true; }
    });
    if (m3Unlocked) syncM3Buttons();
  }
  try { saveProgress(); } catch (_) { /* non-fatal */ }

  if (fb) {
    fb.style.display = "";
    fb.textContent   = "Reviewing analyst assessment...";
    fb.classList.remove("m2-reasoning-feedback--correct", "m2-reasoning-feedback--wrong");
    fb.classList.add("m2-reasoning-feedback--pending");
  }
  m3ReasoningTimers.push(setTimeout(() => {
    if (fb) {
      fb.classList.remove("m2-reasoning-feedback--pending");
      fb.textContent = def.correctMsg;
      fb.classList.add("m2-reasoning-feedback--correct");
    }
    setM3ManagerMessage(def.correctMsg);

    // Offer the matching evidence pin (one-thing-at-a-time flow), then point
    // the student at the next step.
    m3ReasoningTimers.push(setTimeout(() => {
      host.style.display = "none";
      host.innerHTML = "";
      if (EVIDENCE_RATINGS["mission-003"][key]) showPinPrompt("mission-003", key);
      const nextDef = M3_COMMANDS[key];
      if (nextDef && nextDef.nextHint) setCurrentObjective("mission-003", nextDef.nextHint);
    }, 700));
  }, reviewAssessmentDelay()));
}

/** Derive the Analyst Confidence tier (label + caption) for a numeric value. */
function m3AnalystConfTier(val) {
  return M3_ANALYST_CONF_TIERS.find((t) => val >= t.min) ||
         M3_ANALYST_CONF_TIERS[M3_ANALYST_CONF_TIERS.length - 1];
}

/** Add to the Analyst Confidence track (clamped 0–100) and re-render. */
function addM3AnalystConfidence(amount) {
  m3AnalystConfidence = Math.max(0, Math.min(100, m3AnalystConfidence + (amount || 0)));
  renderM3AnalystConfidence();
  fxPulse("m3AnalystConfidence");
}

/** Set the Analyst Confidence track to an absolute value (clamped) + render. */
function setM3AnalystConfidence(val) {
  m3AnalystConfidence = Math.max(0, Math.min(100, val || 0));
  renderM3AnalystConfidence();
}

/** Paint the Analyst Confidence meter from m3AnalystConfidence. */
function renderM3AnalystConfidence() {
  const wrap = document.getElementById("m3AnalystConfidence");
  if (!wrap) return;
  const tier = m3AnalystConfTier(m3AnalystConfidence);
  const pill = wrap.querySelector(".analyst-conf-pill");
  const fill = wrap.querySelector(".analyst-conf-bar-fill");
  const cap  = wrap.querySelector(".analyst-conf-caption");
  if (pill) pill.textContent = tier.label;
  if (fill) fill.style.width = `${m3AnalystConfidence}%`;
  if (cap)  cap.textContent = tier.caption;
  wrap.className = "analyst-confidence analyst-confidence--" + tier.label.toLowerCase();
}

/* ============================================================
   Milestone 21 — Analyst Review (Mission 3)
   ============================================================ */

function renderM3AnalystReview() {
  const host = document.getElementById("m3AnalystReview");
  if (!host) return;
  // Milestone 24C idempotency — once the analyst review has been answered
  // correctly (or the mission is complete), do NOT re-render. Re-rendering
  // would wipe host.innerHTML (removing the #m3QuizPanel below it) and
  // reset m3AnalystAnswered/m3QuizAnswered to false, letting the student
  // farm trust/XP by re-clicking `review services`.
  if (m3AnalystAnswered || mission3Complete) return;
  // Reuse Mission 1's .quiz-panel chrome for visual consistency.
  host.style.display = "";
  host.innerHTML = `
    <div class="quiz-panel quiz-panel--m3" style="display:block;">
      <div class="quiz-header">
        <span class="quiz-label">Analyst Review</span>
        <span class="quiz-badge">Threat Assessment</span>
      </div>
      <p class="quiz-question">${M3_ANALYST_REVIEW.question}</p>
      <div class="quiz-answers" id="m3AnalystAnswers">
        ${M3_ANALYST_REVIEW.answers.map((a) => `
          <button class="quiz-answer-btn" type="button" data-m3letter="${a.letter}">
            <span class="quiz-answer-letter">${a.letter}</span>
            <span class="quiz-answer-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div id="m3AnalystFeedback" class="quiz-feedback" style="display:none;"></div>
      <div id="m3AnalystOutcome" style="display:none;"></div>
    </div>
  `;
  // Wire up answer buttons
  host.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleM3AnalystAnswer(btn.getAttribute("data-m3letter")));
  });
  m3AnalystAnswered = false;
}

function handleM3AnalystAnswer(letter) {
  if (m3AnalystAnswered) return;
  const isCorrect = letter === M3_ANALYST_REVIEW.correct;

  const answersWrap = document.getElementById("m3AnalystAnswers");
  if (answersWrap) {
    answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
      const l = btn.getAttribute("data-m3letter");
      btn.disabled = true;
      if (l === M3_ANALYST_REVIEW.correct) {
        btn.classList.add(isCorrect ? "quiz-answer--correct" : "quiz-answer--reveal");
      } else if (l === letter) {
        btn.classList.add("quiz-answer--wrong");
      }
    });
  }

  const fb = document.getElementById("m3AnalystFeedback");
  if (fb) {
    fb.style.display = "";
    fb.textContent   = isCorrect ? M3_ANALYST_REVIEW.correctMsg : M3_ANALYST_REVIEW.wrongMsg;
    fb.classList.toggle("quiz-feedback--correct", isCorrect);
    fb.classList.toggle("quiz-feedback--wrong",  !isCorrect);
  }

  if (!isCorrect) {
    // Allow retry — re-enable the non-correct buttons (except the one tried)
    setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
        const l = btn.getAttribute("data-m3letter");
        if (l === letter || l === M3_ANALYST_REVIEW.correct) return;
        btn.disabled = false;
      });
      // Allow retry of the correct (in case the student wants to re-pick D)
      const correctBtn = answersWrap.querySelector(`.quiz-answer-btn[data-m3letter="${M3_ANALYST_REVIEW.correct}"]`);
      if (correctBtn) {
        correctBtn.disabled = false;
        correctBtn.classList.remove("quiz-answer--reveal");
      }
    }, 600);
    return;
  }

  // Correct path — finalize
  m3AnalystAnswered = true;
  // Milestone 26A — event toast: correct analyst review.
  showEventToast("Analysis Correct", "Threat assessment recorded.", "success");
  // Milestone 24C — correct M3 analyst review → +10 trust.
  increaseTrustScore(10);
  // Milestone 24G — analyst review answered → Analyst Review done; Quiz unlocks.
  markToolCompleted("m3-analyst-review");
  unlockTool("m3-quiz");
  setActiveTool("m3-quiz");
  markM3Status("analyst-review");
  markM3Status("threat-assessment");
  // Milestone 31A — a correct analyst review means the student is ready to
  // make a recommendation → Analyst Confidence reaches "Ready" (100).
  setM3AnalystConfidence(100);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
  // Stage 2 — Blue Team (Mission 3): a documented threat assessment advances containment.
  updateContainmentProgress("mission-003", 20, { stepId: "m3-analyst", caption: "Threat assessment documented." });
  showBlueTeamUpdate("mission-003", "Threat assessment confirmed and documented.");
  setM3Hint("Assignment 3 threat assessment complete. Final assessment incoming.");
  setM3ManagerMessage("Excellent reasoning, Agent. You're starting to think like an analyst — one final question to confirm your understanding.");

  const outcome = document.getElementById("m3AnalystOutcome");
  if (outcome) {
    outcome.style.display = "";
    outcome.innerHTML = `
      <div class="m3-finding-block">
        <div class="m3-finding-label">Reconnaissance Analyst Finding</div>
        <p class="m3-finding-text">${M3_ANALYST_REVIEW.finding}</p>
      </div>
      <div class="m3-summary-block">
        <div class="m3-summary-label">Learning Summary</div>
        <p class="m3-summary-text">${M3_ANALYST_REVIEW.summary}</p>
      </div>
    `;
  }

  // Terminal confirmation
  printM3Line("[ ANALYST REVIEW COMPLETE — Threat assessment recorded. ]", "m3-line--info");

  // Milestone 22 — reveal the Mission 3 final quiz after the outcome blocks.
  renderM3Quiz();
}

/* ============================================================
   Milestone 22 — Mission 3 Quiz, XP Reward, Completion
   ============================================================ */

function renderM3Quiz() {
  // Append a second .quiz-panel into the same #m3AnalystReview host.
  const host = document.getElementById("m3AnalystReview");
  if (!host) return;
  // Avoid duplicating if already rendered
  if (host.querySelector("#m3QuizPanel")) return;

  const wrapper = document.createElement("div");
  wrapper.id = "m3QuizPanel";
  wrapper.innerHTML = `
    <div class="quiz-panel quiz-panel--m3" style="display:block; margin-top: 16px;">
      <div class="quiz-header">
        <span class="quiz-label">Final Assessment</span>
        <span class="quiz-badge">Mission 3 Quiz</span>
      </div>
      <p class="quiz-question">${M3_QUIZ.question}</p>
      <div class="quiz-answers" id="m3QuizAnswers">
        ${M3_QUIZ.answers.map((a) => `
          <button class="quiz-answer-btn" type="button" data-m3quiz="${a.letter}">
            <span class="quiz-answer-letter">${a.letter}</span>
            <span class="quiz-answer-text">${escapeHtml(a.text)}</span>
          </button>
        `).join("")}
      </div>
      <div id="m3QuizFeedback" class="quiz-feedback" style="display:none;"></div>
    </div>
  `;
  host.appendChild(wrapper);
  wrapper.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
    btn.addEventListener("click", () => handleM3QuizAnswer(btn.getAttribute("data-m3quiz")));
  });
  m3QuizAnswered = false;
}

function handleM3QuizAnswer(letter) {
  if (m3QuizAnswered) return;
  const isCorrect = letter === M3_QUIZ.correct;

  const answersWrap = document.getElementById("m3QuizAnswers");
  if (answersWrap) {
    answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
      const l = btn.getAttribute("data-m3quiz");
      btn.disabled = true;
      if (l === M3_QUIZ.correct) {
        btn.classList.add(isCorrect ? "quiz-answer--correct" : "quiz-answer--reveal");
      } else if (l === letter) {
        btn.classList.add("quiz-answer--wrong");
      }
    });
  }

  const fb = document.getElementById("m3QuizFeedback");
  if (fb) {
    fb.style.display = "";
    fb.textContent   = isCorrect ? M3_QUIZ.correctMsg : M3_QUIZ.wrongMsg;
    fb.classList.toggle("quiz-feedback--correct", isCorrect);
    fb.classList.toggle("quiz-feedback--wrong",  !isCorrect);
  }

  if (!isCorrect) {
    // Milestone 24F — dynamic manager reaction for a wrong M3 quiz answer.
    updateManagerReaction("quiz_incorrect", { missionId: "mission-003" });
    // Allow retry on wrong answers, same pattern as analyst review.
    setTimeout(() => {
      if (!answersWrap) return;
      answersWrap.querySelectorAll(".quiz-answer-btn").forEach((btn) => {
        const l = btn.getAttribute("data-m3quiz");
        if (l === letter) return;
        btn.disabled = false;
        btn.classList.remove("quiz-answer--reveal");
      });
    }, 600);
    return;
  }

  // Milestone 24F — dynamic manager reaction for a correct M3 quiz answer.
  updateManagerReaction("quiz_correct", { missionId: "mission-003" });

  // Correct path — complete Mission 3
  m3QuizAnswered   = true;
  mission3Complete = true;
  notifyAssignmentComplete("mission-003");
  renderAllMiniMaps(); // Milestone 25D — M3 node flips to completed.

  // Milestone 24C — correct M3 quiz (+10) AND M3 completion (+10) → +20 trust.
  increaseTrustScore(10);
  increaseTrustScore(10);

  // Milestone 24E — M3 complete ⇒ alert moves to Resolved.
  markAlertResolved("mission-003");

  // Milestone 24G — mission complete → every M3 tool is marked completed.
  markAllToolsCompleted("mission-003");

  // Award XP (uses the existing M1 XP system — M3 shares the global bar)
  awardXP(M3_QUIZ.xpReward);

  // Rank bump (only if it's a forward move — don't downgrade if already higher)
  if (rankNameEl && rankNameEl.textContent !== M3_QUIZ.newRank) {
    rankNameEl.textContent = M3_QUIZ.newRank;
    rankNameEl.classList.add("rank-name--upgraded");
  }

  // Persist + sync the M3 dashboard's mirrored profile panel
  saveProgress();
  // Milestone 33A — record this operation in the persistent career history.
  updateOperationalReputation("mission-003");
  syncM3XPPanel();

  // Mark final status + update course progress
  markM3Status("m3-complete");
  setM3Hint("Assignment 3 complete. See your scorecard below.");
  setM3ManagerMessage("Outstanding, Agent. You've completed Assignment 3. You're learning to think like a SOC analyst — that instinct for spotting reconnaissance is exactly what we need.");
  // Milestone 24F — dynamic manager reaction for mission completion (M3).
  // Fires after the closing briefing so the scripted reaction is the
  // final line the student sees in the Supervisor panel.
  updateManagerReaction("mission_completed", { missionId: "mission-003" });
  renderCourseProgress();

  // Milestone 24B — Mission 3 complete → network secured (Low).
  setThreatLevel("Low", "mission-003");

  // Stage 3 — incident resolved: clear escalation pressure + stop the watch.
  clearEscalationWatch();
  incidentPressure["mission-003"] = 0;
  renderIncidentPressure("mission-003");

  // Stage 2 — Blue Team (Mission 3): threat fully contained on completion.
  setRedTeamActive("mission-003", false);
  updateContainmentProgress("mission-003", 0, {
    set: 100,
    incident: "Contained",
    assignment: "Incident contained — stand down",
    caption: "Reconnaissance detected and reported to the Blue Team.",
  });
  showBlueTeamUpdate("mission-003", "Reconnaissance reported and source flagged. Excellent work, Agent.");

  // FIX 5 — completion-state clarity for Mission 3.
  syncM3Buttons(); // lock command buttons now that the mission is complete
  setCurrentObjective("mission-003", COMPLETION_OBJECTIVE);
  setM3ManagerMessage(COMPLETION_MANAGER);
  // FIX 4 — pulse the Mission Map buttons until the student opens the map.
  setMapButtonsAttention("mission-003", true);

  // Milestone 31A — cinematic emphasis on mission completion (parity with M1).
  showIncidentInterruption("mission-complete", { force: true });

  // Replace the analyst review host content with the completion + scorecard
  // (keeps everything inside the COMMANDS panel — same pattern as M1).
  setTimeout(() => renderM3Scorecard(), 1200);

  // Terminal confirmation
  printM3Line("[ ASSIGNMENT 3 COMPLETE — Reconnaissance Detection passed. +100 XP awarded. ]", "m3-line--info");
}

/* Milestone 31A — Mission 3 outcome tier (never a fail). Mirrors M1's notion of
   a graded outcome: the strongest result needs the correct Blue Team
   recommendation, no scope drift, and high analyst confidence; otherwise it is
   "Delayed" (got there but with detours) or "Weak" (acceptable-but-not-ideal). */
function m3OutcomeTier() {
  const correct = decisionTaken["mission-003"] === "m3-recommend";
  if (correct && m3DecisionDrift === 0 && m3AnalystConfidence >= 70) {
    return { label: "Excellent", tone: "green",
      note: "Correct Blue Team recommendation, no scope drift, strong analyst confidence." };
  }
  if (correct) {
    return { label: "Delayed", tone: "yellow",
      note: "Right call reached, but after detours or with lower confidence." };
  }
  return { label: "Weak", tone: "yellow",
    note: "Reconnaissance reported, but the ideal Blue Team recommendation was missed." };
}

/* Milestone 31A — network-themed scorecard rows summarizing the M3 run. */
function renderM3NetworkScorecardRows() {
  const tier = m3OutcomeTier();
  const confTier = m3AnalystConfTier(m3AnalystConfidence);
  const critPins = (pinnableFindings["mission-003"]
    ? Array.from(pinnableFindings["mission-003"]) : [])
    .filter((k) => {
      const pin = investigationPins["mission-003"] && investigationPins["mission-003"][k];
      return pin && pin.critical === true;
    }).length;
  const redState = redTeamStatesFor("mission-003")[computeRedTeamState("mission-003")]
    || redTeamStatesFor("mission-003").recon;
  const recLabel = {
    "m3-recommend": "Report & monitor the source (correct)",
    "m3-shutdown":  "Block the source at the firewall (acceptable)",
    "m3-ignore":    "No action taken",
    "m3-continue":  "Dismissed as normal traffic",
  }[decisionTaken["mission-003"]] || "Not recorded";
  const contain = (typeof blueTeamContainment === "object" && blueTeamContainment
    && typeof blueTeamContainment["mission-003"] === "number")
    ? Math.max(0, Math.min(100, blueTeamContainment["mission-003"])) : null;
  let rows = `
    <li class="scorecard-row">
      <span class="scorecard-key">Operational Outcome</span>
      <span class="scorecard-val scorecard-val--${tier.tone}">${escapeHtml(tier.label)}</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Analyst Confidence (Final)</span>
      <span class="scorecard-val scorecard-val--cyan">${escapeHtml(confTier.label)} (${m3AnalystConfidence}%)</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Critical Recon Evidence</span>
      <span class="scorecard-val">${critPins} pinned</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Red Team State</span>
      <span class="scorecard-val">${escapeHtml(redState.label)}</span>
    </li>
    <li class="scorecard-row">
      <span class="scorecard-key">Blue Team Recommendation</span>
      <span class="scorecard-val">${escapeHtml(recLabel)}</span>
    </li>`;
  if (contain !== null) {
    rows += `
    <li class="scorecard-row">
      <span class="scorecard-key">Containment Progress</span>
      <span class="scorecard-val scorecard-val--green">${contain}%</span>
    </li>`;
  }
  return rows;
}

function renderM3Scorecard() {
  const host = document.getElementById("m3AnalystReview");
  if (!host) return;
  const currentRank = rankNameEl ? rankNameEl.textContent : M3_QUIZ.newRank;
  const m3Tier = m3OutcomeTier();
  // Mirrors M1's buildCompletionHTML() exactly — same .completion-screen
  // / .scorecard / .certificate-preview chrome so M1 and M3 look identical.
  host.innerHTML = `
    <div class="completion-screen">

      <!-- ===== Header ===== -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Assignment 3 Complete</h2>
          <p class="completion-subtitle">
            <span class="m3-outcome-tier m3-outcome-tier--${m3Tier.tone}">${escapeHtml(m3Tier.label)}</span>
            — ${escapeHtml(m3Tier.note)}
          </p>
        </div>
      </div>

      <!-- FIX 3 — clear Next Step guidance at the top of the screen. -->
      ${buildNextStepHTML("mission-003")}

      <!-- ===== MISSION SCORECARD ===== -->
      <div class="scorecard">

        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">MISSION SCORECARD</span>

        <ul class="scorecard-rows">
          <li class="scorecard-row">
            <span class="scorecard-key">Mission</span>
            <span class="scorecard-val">${M3_SCORECARD.missionName}</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Result</span>
            <span class="scorecard-val scorecard-val--green">Completed</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Threat Assessment</span>
            <span class="scorecard-val">${escapeHtml(M3_SCORECARD.threatAssessment)}</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">XP Earned</span>
            <span class="scorecard-val scorecard-val--cyan">+${M3_QUIZ.xpReward} XP</span>
          </li>
          <li class="scorecard-row">
            <span class="scorecard-key">Rank</span>
            <span class="scorecard-val scorecard-val--yellow">${escapeHtml(currentRank)}</span>
          </li>
          <!-- Milestone 24B — final threat level recorded for this mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Final Threat Level</span>
            <span class="scorecard-val scorecard-val--threat scorecard-val--threat-${getThreatLevel("mission-003").toLowerCase()}">${escapeHtml(getThreatLevel("mission-003"))}</span>
          </li>
          <!-- Milestone 24C — manager trust score at end of mission. -->
          <li class="scorecard-row">
            <span class="scorecard-key">Trust Score</span>
            <span class="scorecard-val scorecard-val--cyan">${getTrustScore()} / 100</span>
          </li>
          ${renderM3NetworkScorecardRows()}
          ${renderDecisionScorecardRows("mission-003")}
          ${renderAlertScorecardRows("mission-003")}
        </ul>
        </div>

        <!-- Milestone 24H — Mission Outcome Summary (Mission 3).
             Restates the full Alert → Investigation → Evidence →
             Decision → Consequence → Reward loop the student completed. -->
        ${buildOutcomeSummaryHTML("mission-003")}
        ${buildOperationalAssessmentHTML("mission-003")}

        <!-- Skills Practiced -->
        <div class="scorecard-section scorecard-section--collapsed">
          <span class="scorecard-section-label">SKILLS PRACTICED</span>
          <ul class="scorecard-skills">
            ${M3_SCORECARD.skills.map((s) =>
              `<li><span class="scorecard-bullet">▹</span>${escapeHtml(s)}</li>`).join("")}
          </ul>
        </div>

        <!-- Milestone 24G — Tools Used (Mission 3 scorecard) -->
        ${buildToolsScorecardHTML("mission-003")}

        <!-- Milestone 24A — Evidence Collected (Mission 3 scorecard) -->
        ${buildEvidenceScorecardHTML("mission-003")}

        <!-- What You Learned -->
        <div class="scorecard-section scorecard-learned scorecard-section--collapsed">
          <span class="scorecard-section-label">WHAT YOU LEARNED</span>
          <p class="scorecard-learned-text">
            ${escapeHtml(M3_SCORECARD.whatYouLearned)}
          </p>
        </div>

        <!-- Next Assignment Preview -->
        <div class="scorecard-section scorecard-next scorecard-section--collapsed">
          <span class="scorecard-section-label">NEXT ASSIGNMENT PREVIEW</span>
          <p class="scorecard-next-text">
            <strong class="scorecard-next-title">${escapeHtml(M3_SCORECARD.nextMissionTitle)}</strong>
            — ${escapeHtml(M3_SCORECARD.nextMissionDesc)}
          </p>
        </div>

      </div>

      <!-- ===== CERTIFICATE PREVIEW (parity with M1) ===== -->
      <div class="certificate-preview" aria-label="Certificate of Completion Preview">

        <div class="certificate-card">
          <div class="certificate-watermark" aria-hidden="true">CYBERCORP</div>

          <div class="certificate-header">
            <span class="certificate-eyebrow">CyberCorp Training Academy</span>
            <h3 class="certificate-title">Certificate of Completion Preview</h3>
            <span class="certificate-seal" aria-hidden="true">★</span>
          </div>

          <div class="certificate-body">
            <div class="certificate-field">
              <span class="certificate-label">Awarded to</span>
              <span class="certificate-value certificate-value--name">${escapeHtml(studentName) || "Student Cyber Intern"}</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">For completing</span>
              <span class="certificate-value">Assignment 3 — Reconnaissance Detection</span>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Skills Demonstrated</span>
              <ul class="certificate-skills">
                ${M3_SCORECARD.certSkills.map((s) =>
                  `<li><span class="certificate-bullet">▹</span>${escapeHtml(s)}</li>`).join("")}
              </ul>
            </div>

            <div class="certificate-field">
              <span class="certificate-label">Status</span>
              <span class="certificate-value certificate-value--status">Assignment 3 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all assignments in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all assignments are complete">
              🔒&nbsp; Download Certificate — Locked
            </button>
          </div>
        </div>
      </div>

      <!-- Restart button (matches M1's .restart-btn styling) -->
      <button id="restartMission3Btn" class="restart-btn" type="button">
        ↺ &nbsp;Restart Mission 3
      </button>

    </div>
  `;
  host.style.display = "";

  const restartBtn = document.getElementById("restartMission3Btn");
  if (restartBtn) restartBtn.addEventListener("click", () => {
    // Restart Mission 3 only — does not touch Mission 1.
    resetMission3();
    beginMission3();
  });

  // FIX 3 — wire the Next Step panel buttons.
  wireNextStepButtons("mission-003");
}

function syncM3Buttons() {
  document.querySelectorAll(".m3-cmd-btn[data-m3cmd]").forEach((btn) => {
    const key = btn.getAttribute("data-m3cmd");
    const unlocked = m3UnlockedCmds.has(key);
    // Milestone 35B — lock via aria-disabled (not the `disabled` attribute) so
    // locked cards stay hoverable/focusable for their learning tooltip. The
    // click handler ignores aria-disabled cards, so they still can't be run.
    const locked = !unlocked || mission3Complete; // FIX 5 — lock after completion
    btn.setAttribute("aria-disabled", String(locked));
    btn.classList.toggle("m3-cmd-btn--unlocked", unlocked);
    if (unlocked) btn.removeAttribute("title");
  });
}

function printM3Line(html, cls = "") {
  const term = document.getElementById("m3Terminal");
  if (!term) return;
  const div = document.createElement("div");
  div.className = `m3-line ${cls}`.trim();
  div.innerHTML = html;
  term.appendChild(div);
  // FIX 1 — command echoes (demo "cmd" + the main flow's "prompt" lines) show
  // instantly; everything else (output/blank/info) reveals one line at a time.
  if (cls.includes("cmd") || cls.includes("prompt")) {
    flushTerminalOutput();          // command echo shows instantly
    term.scrollTop = term.scrollHeight;
  } else {
    queueTerminalReveal(div);       // FIX 1 — paced output reveal
  }
}

function setM3Hint(text) {
  const el = document.getElementById("m3Hint");
  if (el) el.textContent = text;
  // Milestone 25A — keep the Current Objective card in sync with the hint.
  setCurrentObjective("mission-003", text);
}

function markM3Status(id) {
  if (m3CompletedStatus.has(id)) return;
  m3CompletedStatus.add(id);
  renderM3Status();
}

function renderM3Status() {
  const list = document.getElementById("m3StatusList");
  if (!list) return;
  list.innerHTML = M3_STATUS.map((s) => {
    const done = m3CompletedStatus.has(s.id);
    return `
      <li class="m3-status-item ${done ? "m3-status-item--done" : "m3-status-item--pending"}">
        <span class="m3-status-icon">${done ? "✓" : "•"}</span>
        <span class="m3-status-label">${s.label}</span>
      </li>
    `;
  }).join("");
}

/** Resets Mission 3 in-memory state + dashboard UI back to a fresh state. */
function resetMission3() {
  try { abandonAssignmentAttempt("mission-003"); trackGameEvent("assignment_restarted", { assignment_id: "mission-003" }); } catch (_) { /* non-fatal */ }
  setMissionRunning(false); // Milestone 25A — leave Focus Mode on restart.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  m3Started = false;
  missionLaunched["mission-003"] = false; // Milestone 25B — clear durable launch flag
  m3UnlockedCmds.clear();
  m3CompletedStatus.clear();
  m3AnalystAnswered = false;
  m3QuizAnswered    = false;
  mission3Complete  = false;
  renderAllMiniMaps(); // Milestone 25D — refresh AFTER mission3Complete cleared.
  // Challenge Layer 1 — reset Mission 3 confidence.
  m3Confidence = 0;
  m3ConfidenceContributors.clear();
  renderConfidenceMeter("mission-003");

  // Milestone 31A — reset Mission 3 Analyst Confidence + reasoning + drift.
  clearM3ReasoningTimers();
  m3AnalystConfidence = 0;
  m3ReasoningAnswered.clear();
  m3DecisionDrift = 0;
  renderM3AnalystConfidence();
  const reasoningHost = document.getElementById("m3Reasoning");
  if (reasoningHost) { reasoningHost.innerHTML = ""; reasoningHost.style.display = "none"; }

  // Investigation Board — clear Mission 3 pins + pin UI on restart.
  investigationPins["mission-003"] = {};
  pinnableFindings["mission-003"].clear();
  Array.from(pinXpAwarded).forEach((k) => {
    if (k.startsWith("mission-003:")) pinXpAwarded.delete(k);
  });
  renderInvestigationBoard("mission-003");
  const pinHostM3 = document.getElementById("m3PinPanel");
  if (pinHostM3) { pinHostM3.innerHTML = ""; pinHostM3.style.display = "none"; }

  // Milestone 24I — replaying clears Mission 3's Briefing Room state.
  briefingReviewed["mission-003"].clear();
  briefingXpAwarded.delete("mission-003");
  renderBriefingRoom("mission-003");

  // Milestone 24A — restarting Mission 3 clears only Mission 3's evidence.
  clearEvidenceForMission("mission-003");
  // Milestone 24B — restart resets Mission 3's threat level to baseline.
  resetThreatLevelForMission("mission-003");
  // Milestone 24G — restart resets Mission 3's tools to their start states.
  resetToolsForMission("mission-003");
  // Stage 2 — restart clears Mission 3's Blue Team containment state.
  resetBlueTeam("mission-003");
  // Stage 3 — restart clears Mission 3's Adversary Escalation state.
  resetEscalation("mission-003");
  // Persist — clears mission3Complete flag from localStorage too
  saveProgress();
  // Course progress reflects the regression (M3 back to "Unlocked")
  renderCourseProgress();

  setMapButtonsAttention("mission-003", false); // FIX 4 — restart clears the prompt.
  clearTerminalOutputQueue();                   // FIX 1 — drop any pending reveals.
  const term = document.getElementById("m3Terminal");
  if (term) term.innerHTML = "";
  setM3Hint("Goal: find out who this workstation is talking to. Repeated or unfamiliar connections are the first sign of recon — start by reviewing the active connections.");
  setM3ManagerMessage("Welcome back. This assignment is a network reconnaissance exercise. Click any unlocked command to begin.");
  renderM3Status();

  // Milestone 21 — clear and hide the Analyst Review panel on reset
  const review = document.getElementById("m3AnalystReview");
  if (review) { review.innerHTML = ""; review.style.display = "none"; }

  // Milestone 24D — clear the Mission 3 decision state on restart.
  resetDecisionForMission("mission-003");

  // Milestone 24E — restarting Mission 3 resets its alert (spec #14).
  clearAlert("mission-003");
  createMissionAlert("mission-003");

  // Buttons back to disabled
  document.querySelectorAll(".m3-cmd-btn[data-m3cmd]").forEach((btn) => {
    btn.setAttribute("aria-disabled", "true"); // Milestone 35B — keep hoverable
    btn.classList.remove("m3-cmd-btn--unlocked");
  });

  // Hide the dashboard if it's currently showing
  const dashboard = document.getElementById("mission3Dashboard");
  if (dashboard) dashboard.style.display = "none";
}



/* ============================================================
   MISSION ENGINE  (Milestone 23A)
   ------------------------------------------------------------
   This mission engine allows future missions to be added by
   creating mission data objects instead of hardcoding each
   mission. The functions below are a thin, reusable dispatch
   layer: each one reads the currently-active mission from
   `currentMissionId` and forwards to the right legacy
   implementation (the M1 helpers above for `mission-001`, the
   M2 helpers above for `mission-002`).

   Phase A is conservative on purpose: the existing M1 and M2
   code paths remain the source of truth for behavior. Nothing
   below replaces an existing call — these are *additional*
   entry points that callers (including future Mission 3) can
   use without knowing which mission is active.

   To add Mission 3:
     1. Add a MISSION_3 object to missions.js and register it.
     2. Add a `"mission-003"` branch to each dispatcher below.
     3. Implement the per-mission renderers (or, ideally, make
        them table-driven so step 2 becomes unnecessary).
   ============================================================ */

/** The mission the engine currently routes to. Defaults to Mission 1. */
let currentMissionId = "mission-001";

/** Returns the structured mission data object for the active mission. */
function getActiveMission() {
  return getMissionData(currentMissionId) || MISSION_1;
}

/**
 * Switches the active mission. Updates both the engine's local id and
 * the shared `activeMissionId` exported by missions.js so any future
 * consumer (e.g. analytics, save-state) sees the same value.
 */
function loadMission(missionId) {
  if (!MISSIONS_REGISTRY[missionId]) {
    console.warn(`[engine] loadMission: unknown missionId "${missionId}"`);
    return;
  }
  currentMissionId = missionId;
  setActiveMissionId(missionId);
}

/** Renders the mission briefing / overview screen for the active mission. */
function renderMissionBriefing() {
  if (currentMissionId === "mission-003") {
    showMission3Overview();
  } else if (currentMissionId === "mission-002") {
    showMission2Overview();
  } else {
    // Mission 1's "briefing" lives in the Module Overview screen; the
    // dashboard itself opens via beginMission(). We expose the overview
    // navigation here so callers don't need to know the difference.
    backToModuleOverview();
  }
}

/** Renders / refreshes the command-button panel for the active mission. */
function renderCommandButtons() {
  if (currentMissionId === "mission-003") {
    syncM3Buttons();
  } else if (currentMissionId === "mission-002") {
    syncM2Buttons();
  } else {
    renderButtons();
  }
}

/**
 * Executes a single command by its key.
 *   M1 keys are COMMAND_BUTTONS[].key (e.g. "ls-home", "cat-suspicious").
 *   M2 keys are M2_COMMANDS keys      (e.g. "ip", "ping", "nmap", "review").
 */
function handleCommandClick(commandId) {
  if (currentMissionId === "mission-003") {
    runM3Command(commandId);
    return;
  }
  if (currentMissionId === "mission-002") {
    runM2Command(commandId);
    return;
  }
  const btn = COMMAND_BUTTONS.find((b) => b.key === commandId);
  if (!btn) {
    console.warn(`[engine] handleCommandClick: unknown M1 command "${commandId}"`);
    return;
  }
  runCommand(btn.command, btn.key);
}

/** Appends a single command + its output to the active mission's terminal. */
function appendTerminalOutput(commandText, outputText) {
  if (currentMissionId === "mission-003") {
    if (commandText) printM3Line(`<span class="m3-prompt">$</span> ${escapeHtml(commandText)}`, "m3-line--cmd");
    if (outputText)  printM3Line(escapeHtml(outputText));
  } else if (currentMissionId === "mission-002") {
    if (commandText) printM2Line(`<span class="m2-prompt">$</span> ${escapeHtml(commandText)}`, "m2-line--cmd");
    if (outputText)  printM2Line(escapeHtml(outputText));
  } else {
    if (commandText) printCommand(commandText);
    if (outputText)  printOutput(outputText);
  }
}

/**
 * Marks a status entry complete by id (preferred) or, as a fallback,
 * sets a free-text status label. Both missions track status via their
 * own checklists, so callers normally pass an id.
 */
function updateMissionStatus(statusIdOrText) {
  if (currentMissionId === "mission-003") {
    markM3Status(statusIdOrText);
  } else if (currentMissionId === "mission-002") {
    markM2Status(statusIdOrText);
  } else {
    completeStep(statusIdOrText);
  }
}

/** Updates the hint-panel text for the active mission. */
function updateHintPanel(hintText) {
  if (currentMissionId === "mission-003") {
    setM3Hint(hintText);
  } else if (currentMissionId === "mission-002") {
    setM2Hint(hintText);
  } else {
    setHint(hintText);
  }
}

/**
 * Updates the supervisor / manager message panel for the active mission.
 * M1's legacy setManagerMessage takes a KEY into MANAGER_MESSAGES; the
 * engine accepts free text and writes it through to the M1 element
 * directly so callers can stay mission-agnostic.
 */
function updateManagerMessage(messageText) {
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage(currentMissionId, messageText);
}

/* ------------------------------------------------------------
   Milestone 24F — Dynamic Manager Reaction helpers
   ------------------------------------------------------------
   Dynamic manager reactions make the mission feel responsive
   while remaining safe and scripted. These three functions are
   the public API used by the mission loop:

     getManagerReaction(eventType, context)    → returns the line
     renderManagerReaction(messageText)        → paints + flashes
     updateManagerReaction(eventType, context) → get + render

   `context.missionId` overrides the mission; otherwise the active
   mission (visible dashboard) is used. Unknown mission/event
   combinations return "" and render nothing, so callers can
   fire-and-forget without guarding.
   ------------------------------------------------------------ */

/** Look up the scripted manager line for an event. Returns "" if none. */
function getManagerReaction(eventType, context) {
  const mid = (context && context.missionId) || getActiveMissionId();
  const byMission = MANAGER_REACTIONS[mid];
  if (!byMission) return "";
  return byMission[eventType] || "";
}

/**
 * Paint a manager line into the active mission's Supervisor panel and
 * give it the same brief flash used elsewhere so the change is noticed.
 * Routes to Mission 2's panel when its dashboard is on screen.
 */
function renderManagerReaction(messageText) {
  const text = String(messageText || "");
  if (!text) return;
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage(getActiveMissionId(), text);
}

/** Resolve a reaction for the event and render it. Returns the text used. */
function updateManagerReaction(eventType, context) {
  const text = getManagerReaction(eventType, context);
  if (text) renderManagerReaction(text);
  // Milestone 25A / 26A — event toast on mission completion (M1 + M2).
  if (eventType === "mission_completed") {
    const m = context && context.missionId === "mission-003"
      ? "Assignment 3 cleared. Reconnaissance source reported."
      : context && context.missionId === "mission-002"
      ? "Assignment 2 cleared. Network secured."
      : "Assignment 1 cleared. Phishing threat handled.";
    showEventToast("Assignment Complete", m, "success", { duration: 8000 }); // FIX 2 — assignment complete dwells 8s
  }
  return text;
}

/** Unlocks a single command in the active mission's command panel. */
function unlockCommand(commandId) {
  if (currentMissionId === "mission-003") {
    m3UnlockedCmds.add(commandId);
    syncM3Buttons();
  } else if (currentMissionId === "mission-002") {
    m2UnlockedCmds.add(commandId);
    syncM2Buttons();
  } else {
    unlockButtons([commandId]);
  }
}

/** Reveals the finding-submission step (M1 finding panel / M2 analyst review). */
function showFindingSubmission() {
  if (currentMissionId === "mission-003") {
    renderM3AnalystReview();
  } else if (currentMissionId === "mission-002") {
    renderM2AnalystReview();
  } else {
    showFindingPanel();
  }
}

/**
 * Reveals the multiple-choice quiz for the active mission.
 * Note: legacy M1 `showQuiz` already exists and is reused here; M2
 * routes to its renderer (`renderM2Quiz`).
 */
function showQuizEngine() {
  if (currentMissionId === "mission-003") {
    renderM3Quiz();
  } else if (currentMissionId === "mission-002") {
    renderM2Quiz();
  } else {
    showQuiz();
  }
}

/**
 * Reveals the reflection question. Mission 2 has no reflection step
 * in the current curriculum — this is a no-op there by design.
 */
function showReflectionEngine() {
  if (currentMissionId === "mission-002" || currentMissionId === "mission-003") return;
  showReflection();
}

/**
 * Marks the active mission complete. Both legacy paths handle their
 * own XP, rank bump, persistence, and status updates internally; the
 * engine just routes to the right finalizer.
 *
 * `newRank` is optional and only used by Mission 1's legacy
 * `completeMission(newRank)` signature — Mission 2 derives its rank
 * from M2_QUIZ.newRank.
 */
function completeMissionEngine(newRank) {
  if (currentMissionId === "mission-003") {
    // Mirror ALL side-effects of the M3 quiz-driven completion so engine-driven
    // completion is indistinguishable from the quiz path.
    if (mission3Complete) return;

    mission3Complete = true;
    m3QuizAnswered   = true;
    notifyAssignmentComplete("mission-003");
    renderAllMiniMaps(); // M3 node flips to completed.

    awardXP(M3_QUIZ.xpReward);

    const rankToSet = newRank || M3_QUIZ.newRank;
    if (rankNameEl && rankNameEl.textContent !== rankToSet) {
      rankNameEl.textContent = rankToSet;
      rankNameEl.classList.add("rank-name--upgraded");
    }

    markAlertResolved("mission-003");
    markAllToolsCompleted("mission-003");

    saveProgress();
    syncM3XPPanel();
    markM3Status("m3-complete");
    setM3Hint("Assignment 3 complete. See your scorecard below.");
    setM3ManagerMessage("Outstanding, Agent. You've completed Assignment 3. You're learning to think like a SOC analyst — that instinct for spotting reconnaissance is exactly what we need.");
    renderCourseProgress();

    updateOperationalReputation("mission-003");
    renderM3Scorecard();
    printM3Line("[ ASSIGNMENT 3 COMPLETE — Reconnaissance Detection passed. +100 XP awarded. ]", "m3-line--info");
    return;
  }
  if (currentMissionId === "mission-002") {
    // M2's normal completion runs inside handleM2QuizAnswer (quiz path).
    // Calling the engine directly must mirror ALL the side-effects of
    // that path so engine-driven completion is indistinguishable from
    // quiz-driven completion.
    if (mission2Complete) return;

    mission2Complete = true;
    m2QuizAnswered   = true;
    notifyAssignmentComplete("mission-002");
    renderAllMiniMaps(); // Milestone 25D — M2 node flips to completed.

    // XP award — was missing in 23A; fixed in 23B per architect review.
    awardXP(M2_QUIZ.xpReward);

    // Rank bump
    const rankToSet = newRank || M2_QUIZ.newRank;
    if (rankNameEl && rankNameEl.textContent !== rankToSet) {
      rankNameEl.textContent = rankToSet;
      rankNameEl.classList.add("rank-name--upgraded");
    }

    // Milestone 24E — engine-driven M2 completion also resolves the alert.
    markAlertResolved("mission-002");

    // Milestone 24G — engine-driven M2 completion finalizes the tool set too,
    // mirroring the quiz-driven path so the scorecard's TOOLS USED is correct.
    markAllToolsCompleted("mission-002");

    // Persist + dashboard sync + status checklist + supervisor/hint copy
    saveProgress();
    syncM2XPPanel();
    markM2Status("m2-complete");
    setM2Hint("Assignment 2 complete. See your scorecard below.");
    setM2ManagerMessage("Outstanding, Agent. You've completed Assignment 2. Review your scorecard — Reconnaissance Detection is being prepared as your next assignment.");
    renderCourseProgress();

    // Render the scorecard so engine-driven completion produces the
    // same final UI as the quiz path. printM2Line is best-effort —
    // if no M2 terminal is on-screen yet, it just no-ops.
    // Milestone 33A — record this operation in the persistent career history.
    updateOperationalReputation("mission-002");
    renderM2Scorecard();
    printM2Line("[ ASSIGNMENT 2 COMPLETE — Network Exposure Review passed. +100 XP awarded. ]", "m2-line--info");
    return;
  }
  completeMission(newRank || QUIZ.newRank);
}

/** Renders the completion / scorecard screen for the active mission. */
function showScorecard() {
  if (currentMissionId === "mission-003") {
    renderM3Scorecard();
  } else if (currentMissionId === "mission-002") {
    renderM2Scorecard();
  } else {
    // M1's scorecard is rendered inside the quiz panel via buildCompletionHTML.
    const panel = document.getElementById("quizPanel");
    if (panel) {
      panel.innerHTML  = buildCompletionHTML(rankNameEl ? rankNameEl.textContent : QUIZ.newRank);
      panel.style.display = "";
      const restart = document.getElementById("restartMissionBtn");
      if (restart) restart.addEventListener("click", resetMission);
    }
  }
}

/**
 * Resets a specific mission back to its starting state.
 *   resetMission("mission-001") → wipes M1 only
 *   resetMission("mission-002") → wipes M2 only (does NOT touch M1)
 * If no id is given, resets the currently active mission.
 */
function resetMissionEngine(missionId) {
  const target = missionId || currentMissionId;
  if (target === "mission-003") {
    resetMission3();
  } else if (target === "mission-002") {
    resetMission2();
  } else {
    resetMission();
  }
}

// Expose the engine on window so future modules / debugging can use it
// without changing the import shape of script.js. (Module scope means
// these names are otherwise unreachable from the devtools console.)
// Milestone 23C — also expose the mission template + safety helpers so
// future mission authors can do `MissionEngine.createMissionFromTemplate(...)`
// and `MissionEngine.validateMissionData(...)` from the console.
window.MissionEngine = {
  loadMission,
  getActiveMission,
  renderMissionBriefing,
  renderCommandButtons,
  handleCommandClick,
  appendTerminalOutput,
  updateMissionStatus,
  updateHintPanel,
  updateManagerMessage,
  unlockCommand,
  showFindingSubmission,
  showQuiz:        showQuizEngine,
  showReflection:  showReflectionEngine,
  awardXP,
  completeMission: completeMissionEngine,
  showScorecard,
  resetMission:    resetMissionEngine,
  // 23C — template system
  MISSION_TEMPLATE,
  createMissionFromTemplate,
  validateMissionData,
  // 23E — mission registry (course catalog)
  missionRegistry,
  MISSION_STATUS,
  getRegistryMission,
  getNextMissionId,
  getMissionStatus,
  setRegistryMissionStatus,
  // 23F — health check
  runMissionEngineHealthCheck,
  // 24A — evidence collection system (Phase B)
  addEvidence,
  renderEvidencePanel,
  hasEvidence,
  clearEvidenceForMission,
  getEvidenceList,
  evidenceLog,
  // 24B — threat level meter (Phase B)
  THREAT_LEVELS,
  setThreatLevel,
  getThreatLevel,
  renderThreatLevel,
  resetThreatLevelForMission,
  threatLevelByMission,
  // 24C — trust score system (Phase B)
  setTrustScore,
  increaseTrustScore,
  decreaseTrustScore,
  getTrustScore,
  renderTrustScore,
  resetTrustScoreForDemo,
  // 24D — decision consequence system (Phase B)
  DECISION_ACTIONS,
  showDecisionActions,
  handleDecisionAction,
  applyDecisionConsequence,
  hideDecisionActions,
  resetDecisionForMission,
  decisionTaken,
  decisionAdvanced,
  // 24E — alert loop system (Phase B)
  ALERT_STATES,
  ALERT_DEFINITIONS,
  alertByMission,
  createMissionAlert,
  renderAlertCenter,
  updateAlertSeverity,
  markAlertInvestigating,
  markAlertEvidenceFound,
  markAlertDecisionRequired,
  markAlertContained,
  markAlertResolved,
  clearAlert,
  getAlertState,
  // 24E-2 — interactive alert modal
  showAlertModal,
  closeAlertModal,
  // 24F — dynamic manager reaction system
  MANAGER_REACTIONS,
  getManagerReaction,
  renderManagerReaction,
  updateManagerReaction,
  // 24G — tool unlock system (Phase B)
  TOOL_DEFINITIONS,
  initializeMissionTools,
  unlockTool,
  setActiveTool,
  markToolCompleted,
  markAllToolsCompleted,
  resetToolsForMission,
  renderAvailableTools,
  getCompletedToolNames,
  toolStateByMission,
};


/* ============================================================
   MISSION ENGINE HEALTH CHECK  (Milestone 23F — Phase A)
   ------------------------------------------------------------
   The health check helps validate mission data before new
   missions are added. It runs a series of structural assertions
   over the Mission Registry, the structured mission data in
   MISSIONS_REGISTRY, and the engine-level helpers — and logs a
   PASS/FAIL line for each one to the browser console.

   The check is non-destructive (no DOM mutation, no state change).
   It is triggered manually via the "Run Mission Engine Check"
   button in the footer; students never see anything unless they
   click it. It is also exposed on window.MissionEngine so future
   developers can call it from the devtools console.
   ============================================================ */

/**
 * runMissionEngineHealthCheck()
 *
 * Returns: { ok: boolean, pass: string[], fail: string[] }
 *
 * The function prints a grouped block of PASS/FAIL lines to the
 * console and returns a summary object so callers (e.g. the footer
 * button handler) can render a short on-screen summary.
 */
function runMissionEngineHealthCheck() {
  const pass = [];
  const fail = [];

  const check = (label, condition) => {
    if (condition) pass.push(label);
    else           fail.push(label);
  };

  /* ---- 1. Mission Registry ---- */
  check("Mission registry found",
    Array.isArray(missionRegistry) && missionRegistry.length > 0);

  const m1Entry = getRegistryMission("mission1");
  const m2Entry = getRegistryMission("mission2");
  const m3Entry = getRegistryMission("mission3");

  check("Mission 1 found in registry", !!m1Entry);
  check("Mission 2 found in registry", !!m2Entry);
  // Mission 3 is a known placeholder — surface its presence but never
  // fail the run if it's intentionally absent.
  if (m3Entry) pass.push("Mission 3 placeholder found in registry");

  /* ---- 2. Registry order values valid (unique, sequential from 1) ---- */
  if (Array.isArray(missionRegistry)) {
    const orders = missionRegistry.map((m) => m.order).sort((a, b) => a - b);
    const uniqueOrders = new Set(orders).size === orders.length;
    const sequential   = orders.every((n, i) => n === i + 1);
    check("Registry order values are unique",     uniqueOrders);
    check("Registry order values are sequential", sequential);
  }

  /* ---- 3. Structured mission data (MISSIONS_REGISTRY) ---- */
  const dataMissions = MISSIONS_REGISTRY
    ? Object.entries(MISSIONS_REGISTRY)
    : [];

  check("Structured mission data registry found", dataMissions.length > 0);

  for (const [id, mission] of dataMissions) {
    const r = validateMissionData(mission);
    if (r.valid) {
      pass.push(`Mission data "${id}" has all required fields`);
    } else {
      fail.push(`Mission data "${id}" is missing: ${r.missing.join(", ")}`);
    }

    // scorecard presence (recommended field, but called out explicitly
    // because the Phase A spec requires it for every mission)
    const hasScorecard =
      mission && mission.scorecard && typeof mission.scorecard === "object";
    check(`Mission data "${id}" has a scorecard`, hasScorecard);
  }

  /* ---- 4. Commands shape (tolerant — accepts M1 and M2 schemas) ---- */
  //
  // The spec asks for each command to have:
  //   commandId, label, commandText, outputText
  //
  // Mission 1's COMMAND_BUTTONS uses {key, label, command, desc, ...}
  // and Mission 2's M2_COMMANDS is keyed-by-id with {cmd, output, ...}.
  // We accept either schema so the check works against today's data
  // without forcing a refactor.
  const validateCommand = (cmd, id) => {
    if (!cmd || typeof cmd !== "object") return false;
    const commandId   = cmd.commandId   || cmd.key || id;
    const label       = cmd.label;
    const commandText = cmd.commandText || cmd.command || cmd.cmd;
    const outputText  = cmd.outputText  || cmd.output  || cmd.desc;
    return (
      typeof commandId === "string"   && commandId.length > 0 &&
      typeof label === "string"       && label.length > 0     &&
      typeof commandText === "string" && commandText.length > 0 &&
      (typeof outputText === "string" || Array.isArray(outputText)) &&
      (Array.isArray(outputText) ? outputText.length > 0 : outputText.length > 0)
    );
  };

  for (const [id, mission] of dataMissions) {
    const commands = mission && mission.commands;
    let entries = [];
    if (Array.isArray(commands))        entries = commands.map((c) => [c.key || c.commandId, c]);
    else if (commands && typeof commands === "object") entries = Object.entries(commands);

    if (entries.length === 0) {
      fail.push(`Mission data "${id}" has no commands`);
      continue;
    }

    let allValid = true;
    const bad = [];
    for (const [cid, cmd] of entries) {
      if (!validateCommand(cmd, cid)) {
        allValid = false;
        bad.push(cid);
      }
    }
    if (allValid) {
      pass.push(`Commands valid for "${id}" (${entries.length} command${entries.length === 1 ? "" : "s"})`);
    } else {
      fail.push(`Commands invalid for "${id}": ${bad.join(", ")}`);
    }
  }

  /* ---- 5. Helper functions work ---- */
  try {
    const got = getMissionById("mission-001");
    check("getMissionById() resolves legacy id 'mission-001'", !!got);
  } catch (e) {
    fail.push(`getMissionById() threw: ${e.message}`);
  }
  try {
    const gotReg = getMissionById("mission1");
    check("getMissionById() resolves registry id 'mission1'", !!gotReg);
  } catch (e) {
    fail.push(`getMissionById() (registry id) threw: ${e.message}`);
  }
  try {
    const next1 = getNextMissionId("mission1");
    const next2 = getNextMissionId("mission2");
    const next3 = getNextMissionId("mission3");
    check("getNextMissionId('mission1') === 'mission2'", next1 === "mission2");
    check("getNextMissionId('mission2') === 'mission3'", next2 === "mission3");
    check("getNextMissionId('mission3') === null",       next3 === null);
  } catch (e) {
    fail.push(`getNextMissionId() threw: ${e.message}`);
  }

  /* ---- 6. Final overall verdict ---- */
  const ok = fail.length === 0;
  if (ok) pass.push("Mission engine ready");

  /* ---- 7. Pretty-print to the browser console ---- */
  // Use console.group when available so the block is collapsible.
  const groupFn   = typeof console.group       === "function" ? console.group       : console.log;
  const groupEnd  = typeof console.groupEnd    === "function" ? console.groupEnd    : () => {};
  groupFn("Mission Engine Health Check:");
  for (const line of pass) console.log(`PASS: ${line}`);
  for (const line of fail) console.warn(`FAIL: ${line}`);
  console.log(`— ${pass.length} passed, ${fail.length} failed —`);
  groupEnd();

  return { ok, pass, fail };
}

/**
 * Wires the footer's "Run Mission Engine Check" button. Renders a
 * short status message next to the button (auto-hides after 5s) and
 * funnels the full PASS/FAIL detail to the browser console.
 *
 * Students never see this — the button is a quiet developer link in
 * the footer.
 */
function wireMissionEngineHealthCheckButton() {
  const btn    = document.getElementById("missionEngineCheckBtn");
  const result = document.getElementById("missionEngineCheckResult");
  if (!btn) return;

  let hideTimer = null;

  btn.addEventListener("click", () => {
    const { ok, fail } = runMissionEngineHealthCheck();

    if (result) {
      result.textContent = ok
        ? "Mission Engine Check Complete. See browser console for details."
        : `Mission Engine Check Complete — ${fail.length} issue${fail.length === 1 ? "" : "s"} found. See browser console.`;
      result.classList.remove("is-pass", "is-fail");
      result.classList.add("is-visible", ok ? "is-pass" : "is-fail");

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        result.classList.remove("is-visible", "is-pass", "is-fail");
        result.textContent = "";
      }, 5000);
    }
  });
}


/* ============================================================
   BOOT — runs once on page load
   ============================================================ */

/* Phase B0 — best-effort attempt "score" (analyst confidence when available),
   used for best-score tracking on the cloud attempt record. */
function backendMissionScore(missionId) {
  if (missionId === "mission-002") return typeof m2AnalystConfidence === "number" ? m2AnalystConfidence : null;
  if (missionId === "mission-003") return typeof m3AnalystConfidence === "number" ? m3AnalystConfidence : null;
  return typeof m1Confidence === "number" ? m1Confidence : null;
}

/* Phase B0 — close the open cloud attempt as completed. Idempotent across the
   game's multiple completion code paths (quiz path + engine path). Never throws. */
function notifyAssignmentComplete(missionId) {
  let closedAttempt = null;
  try {
    closedAttempt = completeAssignmentAttempt(missionId, {
      score: backendMissionScore(missionId),
      xp_total: currentXP,
    });
  } catch (_) { /* non-fatal */ }

  // Phase 3B — append a meaningful XP/reputation event to the cloud ledger
  // (best-effort, append-only, anon-permitted). Fully local-first: failures are
  // swallowed and never affect gameplay or the authoritative localStorage save.
  // Gated on `closedAttempt` so it fires once per real completion: a duplicate
  // completion call closes nothing (returns null) and emits no extra row, while
  // a genuine replay opens a new attempt and is correctly logged again.
  if (closedAttempt) {
    try {
      const reward =
        missionId === "mission-003"
          ? (typeof M3_QUIZ === "object" && M3_QUIZ ? M3_QUIZ.xpReward : 0)
          : missionId === "mission-002"
            ? (typeof M2_QUIZ === "object" && M2_QUIZ ? M2_QUIZ.xpReward : 0)
            : (typeof QUIZ === "object" && QUIZ ? QUIZ.xpReward : 0);
      void trackXpEvent("mission_completion", {
        xp_change: typeof reward === "number" ? reward : 0,
        description: `Completed ${missionId}`,
        metadata: {
          mission_code: missionId,
          xp_total: currentXP,
          confidence: backendMissionScore(missionId),
          attempt_id: closedAttempt.attempt_id,
          attempt_number: closedAttempt.attempt_number,
        },
      });

      // Phase B1 — write the attempt record to Supabase `mission_attempts`.
      // Server-side triggers (003_server_triggers.sql) automatically upsert
      // `student_progress` and increment `profiles.missions_completed` and
      // `profiles.xp_total` in response. Fully best-effort; never throws.
      const containment = (typeof blueTeamContainment === "object" && blueTeamContainment)
        ? (typeof blueTeamContainment[missionId] === "number" ? blueTeamContainment[missionId] : null)
        : null;
      const evidenceConf = typeof getConfidence === "function" ? getConfidence(missionId) : null;
      const analystConf  = backendMissionScore(missionId);
      const reasoningScr = missionId === "mission-001"
        ? (typeof m1AnalystScore === "number" ? m1AnalystScore : null)
        : null;
      const rewardNum = typeof reward === "number" ? reward : 0;
      void cloudCompleteMissionAttempt(missionId, {
        attempt_number:    closedAttempt.attempt_number,
        started_at:        closedAttempt.started_at,
        xp_earned:         rewardNum,
        trust_delta:       typeof trustScore === "number" ? trustScore : 0,
        analyst_confidence:analystConf,
        containment_score: containment,
        evidence_score:    evidenceConf,
        reasoning_score:   reasoningScr,
        scorecard_json: {
          mission_code:      missionId,
          xp_earned:         rewardNum,
          xp_total:          currentXP,
          analyst_confidence:analystConf,
          containment_score: containment,
          evidence_score:    evidenceConf,
          reasoning_score:   reasoningScr,
          trust_score:       typeof trustScore === "number" ? trustScore : 0,
          attempt_id:        closedAttempt.attempt_id,
        },
        displayName: typeof studentName === "string" ? studentName : null,
      });
    } catch (_) { /* non-fatal */ }
  }

  // Task — the responsible SOC character acknowledges the completed assignment
  // in the Ops Center comms feed so it updates live when the player returns (no
  // reload). Gated on `closedAttempt` so it posts once per real completion (a
  // duplicate completion call closes nothing and stays silent; a genuine replay
  // re-acknowledges). Presentation-only; the feed self-caps at 14 messages.
  if (closedAttempt) {
    try { ocv2PostCompletionComms(missionId); } catch (_) { /* non-fatal */ }
  }

  // UF-5 — incident contained: the threat telemetry visually "settles" and a
  // calm ambient line confirms containment. Deferred one tick so it runs AFTER
  // the path's own synchronous threat re-render (M1 lowers threat to Low right
  // after this call, which rebuilds the meter). Cancel-safe via endGuidedRun().
  clearCompletionSettle();
  completionSettleTimer = window.setTimeout(() => {
    completionSettleTimer = null;
    setAmbientLine("Threat telemetry stabilizing — containment holding.");
    settleThreatMeter(missionId);
  }, 60);
}

function boot() {
  // Deep-link: read ?mission= URL param before any page manipulation.
  // The prototype OC sends the player here with e.g. ?mission=mission-001
  // so the right investigation auto-launches after progress is loaded.
  {
    const _dlParams = new URLSearchParams(window.location.search);
    const _dlMission = _dlParams.get("mission");
    const _valid = ["mission-001", "mission-002", "mission-003"];
    if (_dlMission && _valid.includes(_dlMission)) {
      pendingDeepLinkMission = _dlMission;
      // Strip the param from the URL so reloads don't re-trigger it.
      history.replaceState(null, "", window.location.pathname);
    }
  }

  // Phase B0 — initialize the local-first backend foundation (all best-effort):
  // ensure an anonymous id exists, mount the subtle dev status indicator, and
  // warm the connection. loadCloudProgress does NOT overwrite local state.
  try {
    getOrCreateAnonymousId();
    mountBackendStatusIndicator();
    // Phase 3B — local-first cloud restore. Runs async (never blocks boot) and
    // only restores when there is no usable local save, or the cloud snapshot is
    // strictly more advanced (e.g. local was cleared/rolled back). On restore we
    // reload once so the normal local boot path rehydrates the restored state.
    void (async () => {
      try {
        const res = await reconcileCloudProgress();
        const RELOAD_GUARD = "ech.cloud_restore_reloaded";
        if (res && res.restored) {
          // Reload once to rehydrate from the freshly-restored localStorage. The
          // guard prevents a reload loop; the next (non-restoring) boot clears it.
          if (!sessionStorage.getItem(RELOAD_GUARD)) {
            sessionStorage.setItem(RELOAD_GUARD, "1");
            location.reload();
          }
        } else {
          // Nothing restored this boot — release the one-shot guard so a future
          // legitimate restore in this same tab can trigger its reload again.
          sessionStorage.removeItem(RELOAD_GUARD);
        }
      } catch (_) { /* non-fatal */ }
    })();
  } catch (_) { /* non-fatal — game runs fully offline */ }

  // Pre-populate the starting buttons (stay hidden until Begin Mission)
  COMMAND_BUTTONS.forEach((btn) => {
    if (btn.unlockedAtStart) unlockedKeys.add(btn.key);
  });

  // NOTE: missionStarted is false on load, so "Mission Started" is NOT
  // auto-completed. beginMission() handles that when the student clicks Begin.

  updatePromptDisplay();
  printBootMessages();
  renderButtons();
  renderMissionStatus();
  renderCourseProgress();   // Milestone 9 — initial render (Mission 2 locked)
  renderProgressTracker();  // Milestone 15 — initial render (Briefing complete, Begin Mission current)

  // Milestone 24G — render the Available Tools panels at their starting
  // states for both missions so the panels aren't empty before the
  // student clicks Begin Mission. Re-initialized on begin/reset.
  initializeMissionTools("mission-001");
  initializeMissionTools("mission-002");

  // Milestone 6: show the awaiting hint on initial load
  setHint(m1AwaitingHint(), "muted");

  // Hide command buttons + hint until the student clicks Begin Mission
  if (btnContainer) btnContainer.style.display = "none";
  if (commandsHint) commandsHint.style.display = "none";

  // Wire up the Begin Mission button
  // Milestone 22 — primary CTA dispatches based on data-mode set by
  // updateMission1CTA(). "begin" → start M1; "continue" → jump to M2.
  const beginBtn = document.getElementById("beginMissionBtn");
  if (beginBtn) beginBtn.addEventListener("click", () => {
    const mode = beginBtn.getAttribute("data-mode");
    if (mode === "continue") {
      showMission2Overview();
    } else {
      // Milestone 25B — guided, center-stage briefing flow (reviews the
      // briefing room one card at a time, then launches the mission).
      startGuidedBriefing("mission-001", beginMission);
    }
  });
  const replayLink = document.getElementById("replayMission1Link");
  if (replayLink) replayLink.addEventListener("click", () => {
    // Replay = restart M1 from the briefing screen.
    resetMission();
    updateMission1CTA();
  });
  updateMission1CTA();

  // Milestone 10 — wire up Enter Module + Back to Module Overview
  const enterBtn = document.getElementById("enterModuleBtn");
  if (enterBtn) enterBtn.addEventListener("click", enterModule);
  const backBtn = document.getElementById("backToModuleBtn");
  if (backBtn) backBtn.addEventListener("click", backToModuleOverview);

  // Milestone 25C — Cyber Missions Map wiring.
  document.querySelectorAll(".mission-node[data-mission]").forEach((node) => {
    node.addEventListener("click", () => selectMissionNode(node.getAttribute("data-mission")));
  });
  // Task 8 — "Back to Ops Center" buttons across the mission screens return to
  // the Operations Center hub (no progress loss).
  const m1MapBack = document.getElementById("m1MapBackBtn");
  if (m1MapBack) m1MapBack.addEventListener("click", showModuleLanding);
  const m2MapBack = document.getElementById("m2MapBackBtn");
  if (m2MapBack) m2MapBack.addEventListener("click", showModuleLanding);
  const m2OvMapBack = document.getElementById("m2OverviewMapBackBtn");
  if (m2OvMapBack) m2OvMapBack.addEventListener("click", showModuleLanding);
  const m3MapBack = document.getElementById("m3MapBackBtn");
  if (m3MapBack) m3MapBack.addEventListener("click", showModuleLanding);
  const m3OvMapBack = document.getElementById("m3OverviewMapBackBtn");
  if (m3OvMapBack) m3OvMapBack.addEventListener("click", showModuleLanding);
  // Milestone 25D — "Open Full Map" buttons in the right control panels.
  const m1OpenFullMap = document.getElementById("m1OpenFullMapBtn");
  if (m1OpenFullMap) m1OpenFullMap.addEventListener("click", showMissionsMap);
  const m2OpenFullMap = document.getElementById("m2OpenFullMapBtn");
  if (m2OpenFullMap) m2OpenFullMap.addEventListener("click", showMissionsMap);
  const m3OpenFullMap = document.getElementById("m3OpenFullMapBtn");
  if (m3OpenFullMap) m3OpenFullMap.addEventListener("click", showMissionsMap);
  // Active-layout fix — "Jump to Next Action" buttons scroll to the current
  // interactive prompt (board action, decision, scorecard, Next Step).
  ["jumpNextBtn", "m2JumpNextBtn", "m3JumpNextBtn"].forEach((id) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", jumpToNextAction);
  });
  // Task #6 — "Replay Briefing" buttons re-show the briefing cards then flow
  // into the on-demand spotlight tour for their mission, as one presentation-
  // only sequence (UI-only; no gameplay/XP/backend side-effects).
  [["replayGuideBtn", "mission-001"], ["m2ReplayGuideBtn", "mission-002"], ["m3ReplayGuideBtn", "mission-003"]].forEach(([id, mid]) => {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener("click", () => startBriefingReplay(mid));
  });
  renderAllMiniMaps(); // Milestone 25D — initial compact route map render.
  initOpsStrips();     // Milestone 29A — inject the persistent operations strip.
  initRedTeamPanels(); // Milestone 30A — inject the RED TEAM ACTIVITY panel.

  // Milestone 17 — Student Name input gating.
  // The button starts disabled (set in index.html) and becomes enabled
  // as soon as the input has a non-empty trimmed value. Pressing Enter
  // inside the field triggers Enter Module when the name is valid.
  const nameInput = document.getElementById("studentNameInput");
  if (nameInput && enterBtn) {
    const syncEnterBtn = () => {
      const hasName = nameInput.value.trim().length > 0;
      enterBtn.disabled = !hasName;
    };
    nameInput.addEventListener("input", syncEnterBtn);
    nameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !enterBtn.disabled) {
        e.preventDefault();
        enterModule();
      }
    });
    syncEnterBtn();
  }

  // Start mission timer
  const mission = getMissionById(activeMissionId);
  if (mission && mission.timeLimitSec > 0) {
    startTimer(mission.timeLimitSec);
  }

  // Inject the build timestamp into the footer so it's always visible
  const buildEl = document.getElementById("buildTimestamp");
  if (buildEl) buildEl.textContent = `build: ${BUILD_TIME}`;

  // Milestone 23F — wire the developer-only Mission Engine Health Check
  // button. Silent for students unless they click it.
  wireMissionEngineHealthCheckButton();

  // Milestone 19 — wire the "Back to Module Overview" button on the
  // Mission 2 Overview takeover screen
  const m2BackBtn = document.getElementById("mission2BackBtn");
  if (m2BackBtn) m2BackBtn.addEventListener("click", hideMission2Overview);

  // Milestone 20 — Mission 2 gameplay wiring
  const m2BeginBtn = document.getElementById("m2BeginBtn");
  if (m2BeginBtn) m2BeginBtn.addEventListener("click", () => {
    // Milestone 25B — guided, center-stage briefing flow for Mission 2.
    startGuidedBriefing("mission-002", beginMission2);
  });
  const m2DashBackBtn = document.getElementById("m2DashBackBtn");
  if (m2DashBackBtn) m2DashBackBtn.addEventListener("click", backToMission2Overview);
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    const def = M2_COMMANDS[btn.getAttribute("data-m2cmd")];
    // Milestone 35A — load the command into the M2 terminal; the student
    // presses Enter to run it (no instant execution on click).
    btn.addEventListener("click", () => {
      // Milestone 35B — locked cards stay hoverable for their tooltip but must
      // not load a command.
      if (btn.getAttribute("aria-disabled") === "true") return;
      if (def) loadCommandToTerminal(def.cmd, m2TerminalInput);
    });
    // Milestone 35B — hover/focus learning tooltip.
    if (def) attachCommandTooltip(btn, def.cmd);
  });
  renderM2Status();

  // Assignment 03 — Mission 3 gameplay wiring (mirrors Mission 2).
  const m3BackBtn = document.getElementById("mission3BackBtn");
  if (m3BackBtn) m3BackBtn.addEventListener("click", hideMission3Overview);
  const m3BeginBtn = document.getElementById("m3BeginBtn");
  if (m3BeginBtn) m3BeginBtn.addEventListener("click", () => {
    startGuidedBriefing("mission-003", beginMission3);
  });
  const m3DashBackBtn = document.getElementById("m3DashBackBtn");
  if (m3DashBackBtn) m3DashBackBtn.addEventListener("click", backToMission3Overview);
  document.querySelectorAll(".m3-cmd-btn[data-m3cmd]").forEach((btn) => {
    const def = M3_COMMANDS[btn.getAttribute("data-m3cmd")];
    // Milestone 35A — load the command into the M3 terminal; the student
    // presses Enter to run it (no instant execution on click).
    btn.addEventListener("click", () => {
      // Milestone 35B — locked cards stay hoverable for their tooltip but must
      // not load a command.
      if (btn.getAttribute("aria-disabled") === "true") return;
      if (def) loadCommandToTerminal(def.cmd, m3TerminalInput);
    });
    // Milestone 35B — hover/focus learning tooltip.
    if (def) attachCommandTooltip(btn, def.cmd);
  });
  renderM3Status();

  // Challenge Layer 1 — progressive hint button for Mission 1. Each click
  // reveals the next hint (capped at the final, most direct hint).
  const m1HintBtn = document.getElementById("m1HintBtn");
  if (m1HintBtn) {
    m1HintBtn.addEventListener("click", () => {
      const ix = Math.min(m1ProgressiveHintIx, M1_PROGRESSIVE_HINTS.length - 1);
      setHint(M1_PROGRESSIVE_HINTS[ix], "normal");
      if (m1ProgressiveHintIx < M1_PROGRESSIVE_HINTS.length - 1) {
        m1ProgressiveHintIx++;
      }
    });
  }

  // Milestone 18 — wire Clear Saved Progress button(s)
  document.querySelectorAll(".clear-progress-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("Clear all saved progress? This cannot be undone.")) {
        clearSavedProgress();
      }
    });
  });

  // Milestone 24I — populate both Briefing Rooms up front so the hosts are
  // never empty, even on a clean session with no saved progress (restore
  // returns early when there's nothing saved). Restore re-renders these
  // with any saved review state afterwards.
  renderBriefingRoom("mission-001");
  renderBriefingRoom("mission-002");

  // Stage 4 — populate the M1 Containment Actions panel up front so the host
  // is never empty on a clean session (restore re-renders it afterwards).
  renderContainmentActions("mission-001");

  // Milestone 18 — restore saved progress (runs AFTER renderers + listeners
  // are in place, so any UI updates inside restore work correctly)
  restoreSavedProgress();

  // Collapsible scorecard sections — wire the delegated toggle so any
  // scorecard rendered now or later (Mission 1 / Mission 2) can be
  // minimized/maximized for easier scrolling.
  initCollapsibleSections();

  // Milestone 25A — generic collapsible cards + Focus Mode control bar.
  initCollapsibleCards();
  const focusToggleBtn = document.getElementById("focusToggleBtn");
  if (focusToggleBtn) focusToggleBtn.addEventListener("click", toggleFocusMode);
  updateFocusBar();

  initTerminalInput();
  if (terminalInput) terminalInput.focus();

  // Milestone 32A — paint the Operations Center home after restore so a fresh
  // OR returning recruit sees the correct career/assignment/threat state.
  renderOperationsCenter();

  // Phase UF-2 — mount the always-available, learning-only SOC Toolkit
  // reference panel (does not run commands or touch mission state).
  initSocToolkit();

  // Deep-link: if a ?mission= URL param arrived from the prototype OC AND the
  // player already has a saved session (studentName is set), skip the map and
  // launch the requested mission directly.  If there is no saved name the
  // player still needs to sign in — pendingDeepLinkMission is left set so
  // enterModule() can pick it up after the onboarding flow completes.
  if (pendingDeepLinkMission && studentName && studentName.trim()) {
    const mid = pendingDeepLinkMission;
    pendingDeepLinkMission = null;
    launchMissionFromMap(mid);
  }
}

/* ============================================================
   Collapsible scorecard sections
   ------------------------------------------------------------
   Lets students minimize/maximize each scorecard block
   ("Mission Scorecard", "Mission Outcome Summary", "Skills
   Practiced", etc.) so the completion screen is easier to
   scroll and navigate. Uses a single delegated listener so it
   works for every scorecard rendered now or in the future,
   across both missions. Each .scorecard-section is self-
   contained (its label + content live in the same element), so
   toggling a "collapsed" class on the section is all that's
   needed — CSS hides everything except the clickable label.
   Frontend-only; no state is persisted.
   ============================================================ */
function initCollapsibleSections() {
  const toggle = (label) => {
    const section = label.closest(".scorecard-section");
    if (!section) return;
    const collapsed = section.classList.toggle("scorecard-section--collapsed");
    label.setAttribute("aria-expanded", String(!collapsed));
  };

  document.addEventListener("click", (e) => {
    const label = e.target.closest(".scorecard-section-label");
    if (label) toggle(label);
  });

  // Keyboard support — Enter / Space toggles a focused label.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const label = e.target.closest(".scorecard-section-label");
    if (!label) return;
    e.preventDefault();
    toggle(label);
  });

  // Make any rendered labels focusable + announce their toggle role.
  // A MutationObserver covers scorecards injected after boot.
  const tagLabels = (root) => {
    (root.querySelectorAll
      ? root.querySelectorAll(".scorecard-section-label")
      : []
    ).forEach((label) => {
      if (label.dataset.collapsible === "1") return;
      label.dataset.collapsible = "1";
      label.setAttribute("role", "button");
      label.setAttribute("tabindex", "0");
      const section = label.closest(".scorecard-section");
      const collapsed = section
        ? section.classList.contains("scorecard-section--collapsed")
        : false;
      label.setAttribute("aria-expanded", String(!collapsed));
    });
  };
  tagLabels(document);
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) tagLabels(node);
      });
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

/* =====================================================================
   MILESTONE 25A — MISSION FOCUS MODE + IMMERSION REFINEMENTS
   ---------------------------------------------------------------------
   A frontend-only UX/immersion layer. Nothing here changes the mission
   state model or persistence: Focus Mode and card collapse states are
   ephemeral view preferences, not saved progress. All systems degrade
   gracefully (every DOM lookup is guarded) so they never break M1/M2.
   ===================================================================== */

/* ---- Manager chat feed ---------------------------------------------
   Both supervisor panels render a short scrolling feed of the last few
   scripted messages (NO AI — every line is still a fixed string chosen
   by the existing mission logic). Every legacy manager write routes
   through pushManagerMessage(): it appends a bubble, de-dupes a repeat
   of the most recent line, trims to the last 5, slides the bubble in,
   and flashes the panel so the change is noticed. */
function pushManagerMessage(missionId, text) {
  const feedId  = missionId === "mission-003" ? "m3ManagerText"
                : missionId === "mission-002" ? "m2ManagerText" : "managerText";
  const panelId = missionId === "mission-003" ? "m3ManagerPanel"
                : missionId === "mission-002" ? "m2ManagerPanel" : "managerPanel";
  const feed  = document.getElementById(feedId);
  const panel = document.getElementById(panelId);
  if (!feed) return;
  const msg = String(text == null ? "" : text).trim();
  if (!msg) return;
  const last = feed.lastElementChild;
  if (last && last.getAttribute("data-msg") === msg) return;
  const bubble = document.createElement("div");
  bubble.className = "manager-bubble manager-bubble--in";
  bubble.setAttribute("data-msg", msg);
  bubble.textContent = msg;
  feed.appendChild(bubble);
  while (feed.children.length > 3) feed.removeChild(feed.firstElementChild);
  if (panel) {
    panel.classList.remove("manager-panel--flash");
    void panel.offsetWidth;
    panel.classList.add("manager-panel--flash");
  }
  feed.scrollTop = feed.scrollHeight;
}

/* ---- Current Objective card ----------------------------------------
   A single, high-visibility instruction shown right above the command
   area so the student never loses sight of the immediate next action.
   Mirrors the active hint text (kept in sync via setHint / setM2Hint). */
function setCurrentObjective(missionId, text) {
  const objId = missionId === "mission-003" ? "m3CurrentObjective"
              : missionId === "mission-002" ? "m2CurrentObjective" : "currentObjective";
  const el = document.getElementById(objId);
  if (!el) return;
  const t = String(text == null ? "" : text).trim();
  if (!t) return;
  const valEl = el.querySelector(".current-objective-text");
  if (valEl) valEl.textContent = t;
  else el.textContent = t;
  el.classList.remove("current-objective--flash");
  void el.offsetWidth;
  el.classList.add("current-objective--flash");
}

/* ---- Focus Mode ----------------------------------------------------
   Focus Mode declutters the dashboard (collapses learning/context cards,
   hides the profile column, enlarges the terminal) so the student can
   concentrate on the investigation. It NEVER resets progress — it only
   toggles view classes. The floating control bar shows "MISSION ACTIVE"
   and a toggle button while a mission dashboard is on screen. */
let focusModeActive = false;

function isMissionRunning() {
  return document.body.classList.contains("mission-running");
}

function setMissionRunning(on) {
  document.body.classList.toggle("mission-running", !!on);
  if (!on) exitFocusMode();
  updateFocusBar();
  // Milestone 29A — operations-center atmosphere lifecycle.
  // Milestone 30A — persistent adversary beat starts/stops with the mission.
  if (on) { updateAllOpsStrips(); startAmbientOps(); updateAllAdversaryStatus(); startRedTeamMovement(); }
  else { stopAmbientOps(); clearOpsAtmosphere(); stopRedTeamMovement(); }
}

function enterFocusMode() {
  focusModeActive = true;
  document.body.classList.add("focus-mode");
  document.querySelectorAll(".focus-collapse").forEach((el) => el.classList.add("is-collapsed"));
  updateFocusBar();
}

function exitFocusMode() {
  focusModeActive = false;
  document.body.classList.remove("focus-mode");
  document.querySelectorAll(".focus-collapse").forEach((el) => el.classList.remove("is-collapsed"));
  updateFocusBar();
}

function toggleFocusMode() {
  if (focusModeActive) exitFocusMode();
  else enterFocusMode();
}

function updateFocusBar() {
  const bar = document.getElementById("focusControlBar");
  if (!bar) return;
  bar.style.display = isMissionRunning() ? "" : "none";
  bar.classList.toggle("focus-control-bar--focus", focusModeActive);
  const toggle = document.getElementById("focusToggleBtn");
  if (toggle) toggle.textContent = focusModeActive ? "Exit Focus Mode" : "Enter Focus Mode";
}

/* ---- Collapsible cards ---------------------------------------------
   Generic, render-safe collapse system. Each collapsible card has a
   stable .collapsible-head OUTSIDE any re-rendered region; toggling
   .is-collapsed on the .collapsible wrapper hides the .collapsible-body
   via CSS. A single delegated handler survives innerHTML re-renders. */
function initCollapsibleCards() {
  const toggle = (head) => {
    const card = head.closest(".collapsible");
    if (!card) return;
    const collapsed = card.classList.toggle("is-collapsed");
    head.setAttribute("aria-expanded", String(!collapsed));
  };
  document.addEventListener("click", (e) => {
    const head = e.target.closest(".collapsible-head");
    if (head) toggle(head);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const head = e.target.closest(".collapsible-head");
    if (!head) return;
    e.preventDefault();
    toggle(head);
  });
  document.querySelectorAll(".collapsible-head").forEach((head) => {
    head.setAttribute("role", "button");
    if (!head.hasAttribute("tabindex")) head.setAttribute("tabindex", "0");
    const card = head.closest(".collapsible");
    head.setAttribute("aria-expanded", String(!(card && card.classList.contains("is-collapsed"))));
  });
}

/* ---- Animation / feedback helpers ----------------------------------
   Lightweight, sound-free visual feedback. fxFlash re-triggers a CSS
   animation class; fxToast shows a transient corner toast; the pulse
   helpers target the relevant meter/board for the active mission. */
function fxFlash(el, cls, dur) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), dur || 900);
}

function fxToast(text, tone) {
  if (!text) return;
  const t = document.createElement("div");
  t.className = "fx-toast fx-toast--" + (tone || "success");
  t.textContent = text;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("fx-toast--show"));
  window.setTimeout(() => {
    t.classList.remove("fx-toast--show");
    window.setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
  }, 1800);
}

/* ============================================================
   Milestone 26A — Contextual Event Toast System
   ------------------------------------------------------------
   Short, focused event notifications that briefly guide student
   attention without adding persistent dashboard clutter. These do
   NOT replace manager messages or the Current Objective — they are
   transient event feedback only.
   - showEventToast(title, message, type)
   - types: info | success | warning | danger | unlock
   - top-right stack, pointer-events:none (never blocks the terminal),
     slides in, auto-fades after ~3.5s, max 2 visible at once.
   ============================================================ */
const EVENT_TOAST_TYPES = ["info", "success", "warning", "danger", "unlock", "adversary", "blueteam"];
const EVENT_TOAST_MAX = 1;        // FIX 3 — one major alert at a time; the rest queue
const EVENT_TOAST_MS = 5000;      // FIX 2 — default visible duration
const EVENT_TOAST_FADE_MS = 500;  // FIX 2 — slower slide/fade-out (matches CSS)
// FIX 2 — per-type read time: info/success 5s, warning/threat/unlock 7s.
// (Mission-complete callers pass duration: 8000 explicitly.)
const EVENT_TOAST_DURATIONS = {
  info:      5000,
  success:   5000,
  warning:   7000,
  unlock:    7000,
  danger:    7000,
  adversary: 7000,
  blueteam:  7000,
};
// Stage 2 — live-threat toasts (Red Team activity / Blue Team response) dwell
// LONGER so a student can follow and absorb the context before they disappear.
const ADVERSARY_TOAST_MS = 7000; // FIX 2 — threat alerts read for 7s
const BLUE_TEAM_TOAST_MS = 7000;
let eventToastHost = null;
let eventToastVisible = 0;        // currently on-screen count
const eventToastQueue = [];       // pending toasts beyond the visible cap

function ensureEventToastHost() {
  if (eventToastHost && document.body.contains(eventToastHost)) return eventToastHost;
  eventToastHost = document.createElement("div");
  eventToastHost.className = "event-toast-host";
  eventToastHost.setAttribute("aria-live", "polite");
  document.body.appendChild(eventToastHost);
  return eventToastHost;
}

/** Public API — enqueue a toast. Renders immediately if under the visible
 *  cap, otherwise queues so each toast still gets its full visible duration
 *  (no premature truncation under bursts). */
function showEventToast(title, message, type, opts) {
  if (!title && !message) return;
  const t = EVENT_TOAST_TYPES.includes(type) ? type : "info";
  const extraClass = (opts && opts.extraClass) || "";
  const duration = opts && typeof opts.duration === "number" ? opts.duration : 0;
  eventToastQueue.push({ title: title || "", message: message || "", type: t, extraClass, duration });
  pumpEventToasts();
}

function pumpEventToasts() {
  while (eventToastVisible < EVENT_TOAST_MAX && eventToastQueue.length) {
    renderEventToast(eventToastQueue.shift());
  }
}

function renderEventToast(item) {
  const host = ensureEventToastHost();
  eventToastVisible++;

  const el = document.createElement("div");
  el.className = `event-toast event-toast--${item.type}${item.extraClass ? " " + item.extraClass : ""}`;
  el.setAttribute("role", "status");
  el.setAttribute("aria-atomic", "true");
  el.innerHTML =
    `<span class="event-toast-dot" aria-hidden="true"></span>` +
    `<span class="event-toast-body">` +
    `<span class="event-toast-title"></span>` +
    `<span class="event-toast-msg"></span>` +
    `</span>`;
  el.querySelector(".event-toast-title").textContent = item.title;
  el.querySelector(".event-toast-msg").textContent = item.message;
  host.appendChild(el);

  const visibleMs = item.duration && item.duration > 0
    ? item.duration
    : (EVENT_TOAST_DURATIONS[item.type] || EVENT_TOAST_MS);
  requestAnimationFrame(() => el.classList.add("event-toast--show"));
  window.setTimeout(() => {
    el.classList.remove("event-toast--show");
    el.classList.add("event-toast--hide");
    window.setTimeout(() => {
      if (el.parentNode) el.parentNode.removeChild(el);
      eventToastVisible = Math.max(0, eventToastVisible - 1);
      pumpEventToasts(); // a slot freed up — show the next queued toast
    }, EVENT_TOAST_FADE_MS);
  }, visibleMs);
}

/* ============================================================
   Stage 1 — Simulated Adversary Presence
   Lightweight "an attacker is active" layer built ON TOP of the
   26A event-toast system. No backend / AI / multiplayer / real
   hacking — scripted, mission-driven flavor only.
   - triggerAdversaryEvent(eventText, severity) — severity:
     low | medium | high. Renders a RED-accent toast (visually
     distinct from manager chat) + a subtle pulse on the current
     mission node.
   - triggerBlueTeamResponse(eventText) — the defensive
     counter-message shown after a correct escalation.
   - Throttled so students are never spammed: at most one ambient
     adversary event per cooldown window; "important mission
     actions" pass { force: true } to bypass the cooldown.
   ============================================================ */
const ADVERSARY_SEVERITIES = ["low", "medium", "high"];
const ADVERSARY_COOLDOWN_MS = 22000; // ambient throttle (within the 20–40s spec window)
let lastAdversaryAt = 0;
let m1AdversaryIntroTimer = null; // tracked so a pending mission-start intro can be cancelled

/** Pulse the active node in whichever mission route map is on screen. */
function pulseActiveMissionNode() {
  const nodes = document.querySelectorAll(
    "#m1MiniMap .mini-node--active, #m2MiniMap .mini-node--active"
  );
  nodes.forEach((node) => {
    node.classList.remove("mini-node--adversary-pulse");
    void node.offsetWidth; // restart the animation if it is mid-flight
    node.classList.add("mini-node--adversary-pulse");
    window.setTimeout(() => node.classList.remove("mini-node--adversary-pulse"), 1600);
  });
}

/** Public API — surface a short adversary update. Returns true if shown. */
function triggerAdversaryEvent(eventText, severity, opts) {
  if (!eventText) return false;
  if (demoRunning) return false; // never intrude on the teaching demo
  const sev = ADVERSARY_SEVERITIES.includes(severity) ? severity : "low";
  const force = !!(opts && opts.force); // important mission actions bypass the cooldown
  const now = Date.now();
  if (!force && now - lastAdversaryAt < ADVERSARY_COOLDOWN_MS) return false;
  lastAdversaryAt = now;

  const label = sev === "high" ? "ATTACKER MOVEMENT" : "ATTACKER ACTIVITY";
  showEventToast(label, eventText, "adversary", {
    extraClass: `event-toast--sev-${sev}`,
    duration: ADVERSARY_TOAST_MS, // dwell longer — let the student absorb it
  });
  pulseActiveMissionNode();
  pulseIntelRegion("mission-001"); // Milestone 29A — Live Intelligence region reacts.
  // Stage 2 — Blue Team identity: surface the "Red Team Activity Detected" flag.
  setRedTeamActive("mission-001", true);
  // Milestone 28C — brief cinematic emphasis around major Red Team movement.
  showIncidentInterruption("red-team-movement");
  return true;
}

/** Defensive counter-message after a correct escalation. Routes through the
 *  Stage 2 Blue Team feed + a long-dwell blue toast. */
function triggerBlueTeamResponse(eventText) {
  if (!eventText) return;
  if (demoRunning) return;
  showBlueTeamUpdate("mission-001", eventText, { toast: true });
}

/* ============================================================
   Stage 2 — Blue Team Identity System (Mission 1)
   Casts the student as a Blue Team defender responding to the
   Stage 1 adversary. Pure front-end flavor + a Containment
   Progress model — no backend / AI / new global progress system.
   All DOM ids live in the Mission 1 panel, so these helpers
   no-op safely outside Mission 1 / before the panel exists.
   - updateContainmentProgress(amount, opts) — reusable; opts:
     { stepId (one-time guard), set (absolute 0–100), caption,
       incident, assignment }. Value is clamped 0–100.
   - showBlueTeamUpdate(text, opts) — appends a "[BLUE TEAM]"
     feed bubble; opts.toast also raises a long-dwell blue toast.
   ============================================================ */
const BLUE_TEAM_FEED_MAX = 4;
const BLUE_TEAM_STEP_IDS = [
  // Mission 1 containment steps
  "open-suspicious", "classify-critical", "escalate", "finding",
  // Mission 2 containment steps (network recon → service hardening)
  "m2-recon", "m2-critical", "m2-escalate", "m2-analyst",
];
// A credited step id is valid if it's a known fixed id or a one-time
// poor-decision penalty ("poor-<actionId>"). Guards restore from tampered state.
function isValidContainmentStep(id) {
  return typeof id === "string" &&
    (BLUE_TEAM_STEP_IDS.includes(id) || id.startsWith("poor-"));
}

// Blue Team state is keyed by mission so Mission 1 and Mission 2 each run the
// SAME engine against their own panel. Mission 1 keeps the original DOM ids;
// Mission 2 uses m2-prefixed ids — see BLUE_TEAM_DOM below.
const blueTeamContainment = { "mission-001": 0, "mission-002": 0, "mission-003": 0 };
const blueTeamSteps = {
  "mission-001": new Set(),
  "mission-002": new Set(),
  "mission-003": new Set(),
};
const blueTeamRedActive = { "mission-001": false, "mission-002": false, "mission-003": false };
let blueTeamFeeds = { "mission-001": [], "mission-002": [], "mission-003": [] };

// Per-mission DOM id map. Helpers resolve elements through this so one set of
// functions drives both panels; all lookups no-op safely when ids are absent.
const BLUE_TEAM_DOM = {
  "mission-001": {
    panel: "blueTeamPanel", fill: "containmentFill", pct: "containmentPct",
    caption: "containmentCaption", incident: "blueTeamIncident",
    assignment: "blueTeamAssignment", flag: "redTeamFlag", feed: "blueTeamFeed",
  },
  "mission-002": {
    panel: "m2BlueTeamPanel", fill: "m2ContainmentFill", pct: "m2ContainmentPct",
    caption: "m2ContainmentCaption", incident: "m2BlueTeamIncident",
    assignment: "m2BlueTeamAssignment", flag: "m2RedTeamFlag", feed: "m2BlueTeamFeed",
  },
  "mission-003": {
    panel: "m3BlueTeamPanel", fill: "m3ContainmentFill", pct: "m3ContainmentPct",
    caption: "m3ContainmentCaption", incident: "m3BlueTeamIncident",
    assignment: "m3BlueTeamAssignment", flag: "m3RedTeamFlag", feed: "m3BlueTeamFeed",
  },
};
function btMissionId(missionId) {
  return missionId === "mission-003" ? "mission-003" : missionId === "mission-002" ? "mission-002" : "mission-001";
}
function btDom(missionId, key) {
  const map = BLUE_TEAM_DOM[btMissionId(missionId)];
  return document.getElementById(map[key]);
}

function clampPct(n) {
  if (!isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function renderContainment(missionId) {
  missionId = btMissionId(missionId);
  const val  = blueTeamContainment[missionId];
  const fill = btDom(missionId, "fill");
  const pct  = btDom(missionId, "pct");
  if (fill) fill.style.width = val + "%";
  if (pct)  pct.textContent  = val + "%";
  const panel = btDom(missionId, "panel");
  if (panel) panel.classList.toggle("blue-team-panel--contained", val >= 100);
  try { updateOpsStrip(missionId); } catch (_) { /* 29A — non-fatal */ }
}

function setContainmentCaption(missionId, text) {
  const el = btDom(missionId, "caption");
  if (el && text) el.textContent = text;
}

function setIncidentStatus(missionId, text) {
  const el = btDom(missionId, "incident");
  if (!el || !text) return;
  el.textContent = text;
  const k = text.toLowerCase();
  el.classList.toggle("bt-incident--threat", k.includes("threat") || k.includes("escalat"));
  el.classList.toggle("bt-incident--contained", k.includes("contain"));
  try { updateOpsStrip(missionId); } catch (_) { /* 29A — non-fatal */ }
}

function setBlueTeamAssignment(missionId, text) {
  const el = btDom(missionId, "assignment");
  if (el && text) el.textContent = text;
}

/** Reveal/clear the "Red Team Activity Detected" flag for a mission. */
function setRedTeamActive(missionId, active) {
  missionId = btMissionId(missionId);
  blueTeamRedActive[missionId] = !!active;
  const flag = btDom(missionId, "flag");
  if (flag) flag.hidden = !blueTeamRedActive[missionId];
  if (blueTeamRedActive[missionId]) setIncidentStatus(missionId, "Active Threat");
  try { updateOpsStrip(missionId); } catch (_) { /* 29A — non-fatal */ }
}

/** Reusable — adjust a mission's containment. Returns the new value. */
function updateContainmentProgress(missionId, amount, opts) {
  missionId = btMissionId(missionId);
  opts = opts || {};
  if (opts.stepId) {
    if (blueTeamSteps[missionId].has(opts.stepId)) return blueTeamContainment[missionId]; // credit once
    blueTeamSteps[missionId].add(opts.stepId);
  }
  if (typeof opts.set === "number") blueTeamContainment[missionId] = clampPct(opts.set);
  else blueTeamContainment[missionId] = clampPct(blueTeamContainment[missionId] + (amount || 0));
  renderContainment(missionId);
  if (opts.caption)    setContainmentCaption(missionId, opts.caption);
  if (opts.incident)   setIncidentStatus(missionId, opts.incident);
  if (opts.assignment) setBlueTeamAssignment(missionId, opts.assignment);
  fxFlash(btDom(missionId, "panel"), "blue-team-panel--flash", 700);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
  return blueTeamContainment[missionId];
}

/** Append one "[BLUE TEAM]" bubble to a mission's feed DOM. `animate` slides it in. */
function appendBlueFeedBubble(missionId, text, animate) {
  const feed = btDom(missionId, "feed");
  if (!feed || !text) return;
  const bubble = document.createElement("div");
  bubble.className = "blue-team-update";
  bubble.innerHTML =
    `<span class="blue-team-update-label">[BLUE TEAM]</span>` +
    `<span class="blue-team-update-text"></span>`;
  bubble.querySelector(".blue-team-update-text").textContent = text;
  feed.appendChild(bubble);
  if (animate) requestAnimationFrame(() => bubble.classList.add("blue-team-update--show"));
  else bubble.classList.add("blue-team-update--show");
  while (feed.children.length > BLUE_TEAM_FEED_MAX) feed.removeChild(feed.firstChild);
}

/** Re-render a mission's persisted feed history into its panel (restore-safe). */
function renderBlueFeed(missionId) {
  missionId = btMissionId(missionId);
  const feed = btDom(missionId, "feed");
  if (!feed) return;
  feed.innerHTML = "";
  blueTeamFeeds[missionId].forEach((t) => appendBlueFeedBubble(missionId, t, false));
}

/** Reusable — a short Blue Team status update (feed bubble + optional toast). */
function showBlueTeamUpdate(missionId, text, opts) {
  missionId = btMissionId(missionId);
  if (!text) return;
  opts = opts || {};
  if (demoRunning) return; // never intrude on the teaching demo
  blueTeamFeeds[missionId].push(text);
  while (blueTeamFeeds[missionId].length > BLUE_TEAM_FEED_MAX) blueTeamFeeds[missionId].shift();
  appendBlueFeedBubble(missionId, text, true);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
  if (opts.toast) showEventToast("BLUE TEAM", text, "blueteam", { duration: BLUE_TEAM_TOAST_MS });
}

/** Re-derive incident/assignment from credited steps (restore-safe). */
function deriveBlueTeamState(missionId) {
  missionId = btMissionId(missionId);
  const steps = blueTeamSteps[missionId];
  let assignment, incident = "Monitoring";
  if (missionId === "mission-002") {
    assignment = "Map the network";
    if (steps.has("m2-recon"))    assignment = "Assess exposed services";
    if (steps.has("m2-escalate")) assignment = "Escalate to lead analyst";
  } else {
    assignment = "Investigate the workstation";
    if (steps.has("open-suspicious")) assignment = "Isolate the suspicious file";
    if (steps.has("escalate"))        assignment = "Escalate to lead analyst";
  }
  if (blueTeamRedActive[missionId]) incident = "Active Threat";
  const done = missionId === "mission-002"
    ? (mission2Complete || blueTeamContainment[missionId] >= 100)
    : (missionComplete  || blueTeamContainment[missionId] >= 100);
  if (done) {
    incident   = "Contained";
    assignment = "Incident contained — stand down";
  }
  return { assignment, incident };
}

/** Refresh a mission's whole Blue Team panel from current state (restore/reset). */
function renderBlueTeamPanel(missionId) {
  missionId = btMissionId(missionId);
  renderContainment(missionId);
  const flag = btDom(missionId, "flag");
  if (flag) flag.hidden = !blueTeamRedActive[missionId];
  const st = deriveBlueTeamState(missionId);
  setBlueTeamAssignment(missionId, st.assignment);
  setIncidentStatus(missionId, st.incident);
  renderBlueFeed(missionId);
  renderIncidentPressure(missionId); // Stage 3 — keep the pressure bar in sync.
}

/** Reset a mission's Blue Team state (called from resetMission / resetMission2). */
function resetBlueTeam(missionId) {
  missionId = btMissionId(missionId);
  blueTeamContainment[missionId] = 0;
  blueTeamSteps[missionId].clear();
  blueTeamRedActive[missionId] = false;
  blueTeamFeeds[missionId] = [];
  setContainmentCaption(missionId, missionId === "mission-002" ? "Awaiting service scan." : "Awaiting investigation.");
  renderBlueTeamPanel(missionId);
  // Milestone 30A — clear transient adversary flavor on reset (state is derived).
  try { resetAdversaryPresence(missionId); } catch (_) { /* 30A — non-fatal */ }
}

/** Restore one mission's Blue Team state from saved data (new mission-keyed
 *  shape, with a legacy fallback for Mission 1's pre-generalization keys). */
function restoreBlueTeamMission(data, missionId, legacy) {
  missionId = btMissionId(missionId);
  let c = data.blueTeamContainment && data.blueTeamContainment[missionId];
  if (!(typeof c === "number" && isFinite(c)) && legacy) c = legacy.containment;
  if (typeof c === "number" && isFinite(c)) blueTeamContainment[missionId] = clampPct(c);

  blueTeamSteps[missionId].clear();
  let steps = data.blueTeamSteps && data.blueTeamSteps[missionId];
  if (!Array.isArray(steps) && legacy) steps = legacy.steps;
  if (Array.isArray(steps)) {
    steps.forEach((s) => { if (isValidContainmentStep(s)) blueTeamSteps[missionId].add(s); });
  }

  let red = data.blueTeamRedActive && data.blueTeamRedActive[missionId];
  if (typeof red !== "boolean" && legacy) red = legacy.red;
  blueTeamRedActive[missionId] = !!red;

  blueTeamFeeds[missionId] = [];
  let feed = data.blueTeamFeeds && data.blueTeamFeeds[missionId];
  if (!Array.isArray(feed) && legacy) feed = legacy.feed;
  if (Array.isArray(feed)) {
    feed.filter((t) => typeof t === "string" && t)
        .slice(-BLUE_TEAM_FEED_MAX)
        .forEach((t) => blueTeamFeeds[missionId].push(t));
  }
}

/* ============================================================
   Stage 3 — Adversary Escalation System (Mission 1 + Mission 2)
   The attacker REACTS to investigation progress. Poor decisions
   or delays let the adversary gain ground ("Incident Pressure"
   rises, the Threat Level nudges up one notch, and Red Team
   movement messages appear). Acting correctly/quickly contains
   the spread ("[BLUE TEAM] Threat spread interrupted.").
   Beginner-friendly by design: pressure is capped at a MODERATE
   ceiling, idle escalations are capped per mission, and threat
   never auto-jumps to Critical from escalation alone — this adds
   tension/immersion, NOT frustration. Pure front-end flavor on
   TOP of the Stage 2 Blue Team engine — no backend / AI / new
   global progress system. Reuses the per-mission Blue Team DOM
   map (BLUE_TEAM_DOM) so one set of functions drives both panels
   and every lookup no-ops safely when the panel is absent.
   - triggerEscalationEvent(missionId, opts) — adversary gains
     ground: +Incident Pressure (capped), +Threat one notch (cap
     High), Red Team flag, red movement toast, urgency messaging.
   - containThreatActivity(missionId, opts) — the defensive
     counter: relieves pressure + "[BLUE TEAM] Threat spread
     interrupted." (only when there was pressure/red activity).
   ============================================================ */
const ESCALATION_MAX = 60;          // moderate ceiling (beginner-friendly)
const ESCALATION_STEP = 15;         // pressure added per escalation event
const ESCALATION_RELIEF = 20;       // pressure removed when contained
const ESCALATION_IDLE_MS = 40000;   // delay before an idle escalation fires
const ESCALATION_MAX_IDLE_EVENTS = 2; // cap idle-driven escalations per mission
const ESCALATION_THREAT_CAP = "High"; // escalation never forces Critical

// Adversary "movement" flavor lines (rotated). The decisive ones come from the
// task spec; kept short so the long-dwell toast reads at a glance.
const ESCALATION_EVENTS = [
  { label: "RED TEAM MOVEMENT", text: "Credential harvesting attempt spreading." },
  { label: "RED TEAM ACTIVITY", text: "Additional employee targeted." },
  { label: "RED TEAM MOVEMENT", text: "External communication frequency increasing." },
];

// Per-mission incident pressure (0–ESCALATION_MAX). Keyed like the Blue Team
// engine so Mission 1 and Mission 2 each run the SAME escalation logic.
const incidentPressure = { "mission-001": 0, "mission-002": 0, "mission-003": 0 };
const escalationIdleCount = { "mission-001": 0, "mission-002": 0, "mission-003": 0 };
// Stage 4 — highest pressure ever reached this run (the live value is zeroed on
// completion, so the mission-end "Threat Spread Prevented" summary reads the peak).
const escalationPeak = { "mission-001": 0, "mission-002": 0, "mission-003": 0 };
let escalationEventIndex = 0;       // rotates ESCALATION_EVENTS
let escalationIdleTimer = null;     // single active idle timer
let escalationIdleMission = null;   // the mission the idle timer watches

// Add Incident Pressure DOM ids to the shared per-mission map.
BLUE_TEAM_DOM["mission-001"].pressureFill  = "incidentPressureFill";
BLUE_TEAM_DOM["mission-001"].pressureLevel = "incidentPressureLevel";
BLUE_TEAM_DOM["mission-001"].pressureWrap  = "incidentPressureWrap";
BLUE_TEAM_DOM["mission-002"].pressureFill  = "m2IncidentPressureFill";
BLUE_TEAM_DOM["mission-002"].pressureLevel = "m2IncidentPressureLevel";
BLUE_TEAM_DOM["mission-002"].pressureWrap  = "m2IncidentPressureWrap";

/** Discrete escalation label — capped at Moderate (never higher). */
function escalationLevelLabel(p) {
  if (p <= 0) return "Stable";
  if (p < 30) return "Elevated";
  return "Moderate";
}

/** Paint a mission's Incident Pressure bar + level word. No-ops if absent. */
function renderIncidentPressure(missionId) {
  missionId = btMissionId(missionId);
  const p = incidentPressure[missionId];
  const fill = btDom(missionId, "pressureFill");
  const lvl  = btDom(missionId, "pressureLevel");
  if (fill) {
    fill.style.width = clampPct((p / ESCALATION_MAX) * 100) + "%";
    fill.classList.toggle("incident-pressure-fill--high", p >= ESCALATION_MAX);
  }
  if (lvl) {
    const word = escalationLevelLabel(p);
    lvl.textContent = word;
    lvl.className = "incident-pressure-level incident-pressure-level--" + word.toLowerCase();
  }
}

/** Raise a mission's Threat Level by ONE notch, capped (escalation flavor). */
function raiseThreatOneStep(missionId, cap) {
  missionId = btMissionId(missionId);
  const cur = threatLevelByMission[missionId];
  let i = THREAT_LEVELS.indexOf(cur);
  if (i < 0) i = 0;
  let capI = THREAT_LEVELS.indexOf(cap || ESCALATION_THREAT_CAP);
  if (capI < 0) capI = THREAT_LEVELS.length - 1;
  // Monotonic: never LOWER the threat. If we're already at/above the cap
  // (e.g. a poor decision already set Critical), leave it untouched.
  if (i >= capI) return;
  const next = THREAT_LEVELS[i + 1];
  if (next && next !== cur) setThreatLevel(next, missionId);
}

/** Reusable — the adversary gains ground. Beginner-friendly: pressure capped at
 *  a MODERATE ceiling, threat capped at High, never fires during the demo. */
function triggerEscalationEvent(missionId, opts) {
  missionId = btMissionId(missionId);
  if (demoRunning) return false; // never intrude on the teaching demo
  opts = opts || {};

  // Pick a movement message (caller may override; otherwise rotate).
  const ev = opts.event ||
    ESCALATION_EVENTS[escalationEventIndex % ESCALATION_EVENTS.length];
  escalationEventIndex++;

  // Raise pressure (capped at the moderate ceiling).
  const amount = typeof opts.amount === "number" ? opts.amount : ESCALATION_STEP;
  incidentPressure[missionId] = Math.min(ESCALATION_MAX, incidentPressure[missionId] + amount);
  escalationPeak[missionId] = Math.max(escalationPeak[missionId], incidentPressure[missionId]);
  renderIncidentPressure(missionId);

  // Visually nudge the Threat Level up one notch (never to Critical).
  raiseThreatOneStep(missionId, ESCALATION_THREAT_CAP);

  // Red Team flag + long-dwell red movement toast + map pulse.
  setRedTeamActive(missionId, true);
  showEventToast(ev.label, ev.text, "adversary", { duration: ADVERSARY_TOAST_MS });
  if (typeof pulseActiveMissionNode === "function") pulseActiveMissionNode();
  pulseIntelRegion(missionId); // Milestone 29A — Live Intelligence region reacts.

  // Urgency messaging in the Blue Team panel.
  setIncidentStatus(missionId, "Escalating");
  setContainmentCaption(missionId, "Pressure rising — act quickly to contain.");
  fxFlash(btDom(missionId, "panel"), "blue-team-panel--flash", 700);

  // Milestone 28C — cinematic emphasis around mission escalation.
  showIncidentInterruption("escalation");

  // Milestone 30A — the adversary ADAPTS when Blue Team is slow / escalation fires.
  try { adaptRedTeam(missionId, "escalate"); } catch (_) { /* 30A — non-fatal */ }

  try { saveProgress(); } catch (_) { /* non-fatal */ }
  return true;
}

/** Reusable — correct/quick defensive action interrupts the spread. Only speaks
 *  up when there is actually pressure or red activity to counter. */
function containThreatActivity(missionId, opts) {
  missionId = btMissionId(missionId);
  if (demoRunning) return;
  opts = opts || {};
  const hadPressure = incidentPressure[missionId] > 0 || blueTeamRedActive[missionId];
  if (!hadPressure && !opts.always) return; // nothing to interrupt

  const relief = typeof opts.amount === "number" ? opts.amount : ESCALATION_RELIEF;
  incidentPressure[missionId] = Math.max(0, incidentPressure[missionId] - relief);
  renderIncidentPressure(missionId);

  showBlueTeamUpdate(missionId, opts.text || "Threat spread interrupted.", { toast: true });

  // Milestone 28C — cinematic stabilization glow around successful containment.
  showIncidentInterruption("containment-success");

  // Milestone 30A — the adversary visibly stabilizes when Blue Team contains.
  try { adaptRedTeam(missionId, "contained"); } catch (_) { /* 30A — non-fatal */ }

  if (incidentPressure[missionId] <= 0) {
    setIncidentStatus(missionId, blueTeamRedActive[missionId] ? "Active Threat" : "Monitoring");
    setContainmentCaption(missionId, "Adversary movement slowed.");
  }
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Begin watching a mission for investigation DELAYS (idle escalation). */
function startEscalationWatch(missionId) {
  missionId = btMissionId(missionId);
  clearEscalationWatch();
  escalationIdleMission = missionId;
  scheduleEscalationIdle();
}

/** (Re)arm the idle timer. Called on activity so progress resets the clock. */
function scheduleEscalationIdle() {
  if (escalationIdleTimer) { clearTimeout(escalationIdleTimer); }
  escalationIdleTimer = window.setTimeout(onEscalationIdle, ESCALATION_IDLE_MS);
}

/** Idle fired — the student stalled. Escalate (capped) then keep watching. */
function onEscalationIdle() {
  escalationIdleTimer = null;
  const mid = escalationIdleMission;
  if (!mid) return;
  if (demoRunning) { scheduleEscalationIdle(); return; }
  const complete = mid === "mission-003" ? mission3Complete : mid === "mission-002" ? mission2Complete : missionComplete;
  if (complete || !document.body.classList.contains("mission-running")) {
    clearEscalationWatch();
    return;
  }
  if (escalationIdleCount[mid] >= ESCALATION_MAX_IDLE_EVENTS ||
      incidentPressure[mid] >= ESCALATION_MAX) {
    clearEscalationWatch(); // ceiling reached — stop piling on (beginner-friendly)
    return;
  }
  escalationIdleCount[mid]++;
  triggerEscalationEvent(mid);
  scheduleEscalationIdle();
}

/** Stop watching a mission (mission exit / completion / reset). */
function clearEscalationWatch() {
  if (escalationIdleTimer) { clearTimeout(escalationIdleTimer); escalationIdleTimer = null; }
  escalationIdleMission = null;
}

/** Meaningful investigation activity resets the delay clock. */
function noteInvestigationActivity() {
  if (demoRunning) return;
  if (escalationIdleMission && document.body.classList.contains("mission-running")) {
    scheduleEscalationIdle();
  }
}

/** Reset a mission's escalation state (called from resetMission/resetMission2). */
function resetEscalation(missionId) {
  missionId = btMissionId(missionId);
  if (escalationIdleMission === missionId) clearEscalationWatch();
  incidentPressure[missionId] = 0;
  escalationIdleCount[missionId] = 0;
  escalationPeak[missionId] = 0;
  renderIncidentPressure(missionId);
}

/* ============================================================
   Stage 4 — Containment Actions (Mission 1)
   A "Blue Team response" layer on top of the Stage 2 containment
   engine + Stage 3 escalation. The student picks defensive ACTIONS
   to neutralize the threat. No backend / AI — scripted, gated on the
   evidence the student has already collected.
   - Three CORRECT actions (Isolate Workstation / Block External
     Sender / Escalate to Security Manager) unlock only AFTER critical
     evidence is collected; each raises Trust, lowers Threat one step,
     and advances Containment Progress (one-time credit).
   - One POOR action (Monitor Activity) is always available but only
     gives manager guidance — no punishment, on-theme nudge to act.
   - "[BLUE TEAM ACTION]" toasts confirm each action.
   - On mission success a "THREAT CONTAINED" banner + a Blue Team
     defense summary are shown on the completion screen.
   ============================================================ */
const CONTAINMENT_ACTION_TOAST_TITLE = "BLUE TEAM ACTION";
const CONTAINMENT_ACTIONS = {
  "mission-001": {
    "isolate-workstation": {
      label: "Isolate Workstation",
      kind: "correct",
      requiresEvidence: true,
      trust: 8,
      contain: 15,
      toast: "Workstation isolated successfully.",
      manager: "Smart move. Isolating the workstation stops the threat from spreading.",
      feed: "Workstation isolated from the network.",
    },
    "block-sender": {
      label: "Block External Sender",
      kind: "correct",
      requiresEvidence: true,
      trust: 8,
      contain: 15,
      toast: "External sender blocked.",
      manager: "Good. Blocking the sender cuts off the phishing channel.",
      feed: "Malicious external sender blocked.",
    },
    "escalate-manager": {
      label: "Escalate to Security Manager",
      kind: "correct",
      requiresEvidence: true,
      trust: 8,
      contain: 15,
      toast: "Incident escalated to the Security Manager.",
      manager: "Escalation logged. Leadership is now aware of the incident.",
      feed: "Incident escalated to the Security Manager.",
    },
    "monitor-activity": {
      label: "Monitor Activity",
      kind: "poor",
      requiresEvidence: false,
      trust: 0,
      contain: 0,
      toast: "Monitoring network activity.",
      manager: "Monitoring alone won't stop an active threat. Collect evidence, then isolate the workstation or block the sender.",
      feed: "Monitoring network activity (no containment yet).",
    },
  },
};
// Display order — strong responses first, the passive option last.
const CONTAINMENT_ACTION_ORDER = [
  "isolate-workstation",
  "block-sender",
  "escalate-manager",
  "monitor-activity",
];
// One-time guard: which containment actions have already been performed.
const containmentActionsUsed = { "mission-001": new Set() };

/** True once enough evidence is collected to unlock the strong responses
 *  (the suspicious file pinned Critical — the same M1 evidence gate). */
function containmentEvidenceReady() {
  return canCompleteM1();
}

/** Is a given containment action currently unlocked? */
function containmentActionUnlocked(missionId, id) {
  const def = CONTAINMENT_ACTIONS[missionId] && CONTAINMENT_ACTIONS[missionId][id];
  if (!def) return false;
  return !def.requiresEvidence || containmentEvidenceReady();
}

/** Lower a mission's Threat Level by one step (monotonic; never raises). */
function lowerThreatOneStep(missionId, floor) {
  missionId = btMissionId(missionId);
  const cur = threatLevelByMission[missionId];
  const i = THREAT_LEVELS.indexOf(cur);
  if (i < 0) return;
  let floorI = THREAT_LEVELS.indexOf(floor || "Low");
  if (floorI < 0) floorI = 0;
  if (i <= floorI) return; // already at/below the floor — never raise
  const next = THREAT_LEVELS[i - 1];
  if (next && next !== cur) setThreatLevel(next, missionId);
}

/** Render the Containment Actions list for a mission (M1). Buttons reflect
 *  locked / available / used state; safe to call repeatedly. */
function renderContainmentActions(missionId) {
  missionId = btMissionId(missionId);
  const defs = CONTAINMENT_ACTIONS[missionId];
  const host = document.getElementById(
    missionId === "mission-003" ? "m3ContainmentActionsList" : missionId === "mission-002" ? "m2ContainmentActionsList" : "containmentActionsList"
  );
  if (!defs || !host) return;

  const ready = containmentEvidenceReady();
  const used = containmentActionsUsed[missionId];
  // Once the mission is contained, the panel is read-only — no further
  // trust/threat/containment mutation is possible (post-completion lock).
  const missionDone = missionId === "mission-003" ? mission3Complete : missionId === "mission-002" ? mission2Complete : missionComplete;

  host.innerHTML = CONTAINMENT_ACTION_ORDER
    .filter((id) => defs[id])
    .map((id) => {
      const def = defs[id];
      const isUsed = used.has(id);
      const locked = def.requiresEvidence && !ready;
      const disabled = isUsed || locked || missionDone;
      const cls = [
        "containment-action-btn",
        `containment-action-btn--${def.kind}`,
        isUsed ? "containment-action-btn--used" : "",
        (locked && !missionDone) ? "containment-action-btn--locked" : "",
      ].filter(Boolean).join(" ");
      const note = isUsed
        ? "Completed"
        : missionDone
          ? "Threat contained"
          : locked
            ? "Unlocks after evidence is collected"
            : (def.kind === "correct" ? "Recommended response" : "Passive — limited effect");
      return `
        <button type="button" class="${cls}" data-containment-action="${id}"
                ${disabled ? "disabled" : ""}>
          <span class="containment-action-label">${escapeHtml(def.label)}${isUsed ? " ✓" : ""}</span>
          <span class="containment-action-note">${escapeHtml(note)}</span>
        </button>`;
    })
    .join("");

  host.querySelectorAll("[data-containment-action]").forEach((btn) => {
    btn.addEventListener("click", () =>
      handleContainmentAction(missionId, btn.getAttribute("data-containment-action"))
    );
  });

  // Status line summarizing how many responses are still available.
  const statusEl = document.getElementById(
    missionId === "mission-003" ? "m3ContainmentActionsStatus" : missionId === "mission-002" ? "m2ContainmentActionsStatus" : "containmentActionsStatus"
  );
  if (statusEl) {
    statusEl.textContent = missionDone
      ? "Threat contained — actions closed."
      : ready
        ? "Evidence confirmed — choose a containment response."
        : "Collect critical evidence to unlock containment responses.";
  }
}

/** Perform a containment action: apply effects (correct) or guide (poor). */
function handleContainmentAction(missionId, id) {
  missionId = btMissionId(missionId);
  if (demoRunning) return; // never intrude on the teaching demo
  const missionDone = missionId === "mission-003" ? mission3Complete : missionId === "mission-002" ? mission2Complete : missionComplete;
  if (missionDone) return; // post-completion lock — panel is read-only
  const def = CONTAINMENT_ACTIONS[missionId] && CONTAINMENT_ACTIONS[missionId][id];
  if (!def) return;
  if (containmentActionsUsed[missionId].has(id)) return; // one-time
  if (!containmentActionUnlocked(missionId, id)) return; // still locked

  containmentActionsUsed[missionId].add(id);

  if (def.kind === "correct") {
    if (def.trust > 0) increaseTrustScore(def.trust);
    lowerThreatOneStep(missionId, "Low");
    updateContainmentProgress(missionId, def.contain, {
      stepId: `action-${id}`,
      caption: def.feed,
    });
    // A decisive defensive move also relieves adversary pressure.
    containThreatActivity(missionId);
    showBlueTeamUpdate(missionId, def.feed); // feed bubble (no own toast)
    pushManagerMessage("mission-001", def.manager);
    showEventToast(CONTAINMENT_ACTION_TOAST_TITLE, def.toast, "blueteam", {
      duration: BLUE_TEAM_TOAST_MS,
    });
    fxPulseThreat(missionId);
  } else {
    // Poor / passive action — guidance only, no punishment.
    pushManagerMessage("mission-001", def.manager);
    showBlueTeamUpdate(missionId, def.feed);
    showEventToast(CONTAINMENT_ACTION_TOAST_TITLE, def.toast, "blueteam", {
      duration: BLUE_TEAM_TOAST_MS,
    });
  }

  renderContainmentActions(missionId);
  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Reset a mission's containment-action state (called from resetMission). */
function resetContainmentActions(missionId) {
  missionId = btMissionId(missionId);
  if (containmentActionsUsed[missionId]) containmentActionsUsed[missionId].clear();
  renderContainmentActions(missionId);
}

/** Count of correctly classified findings collected this run (for the summary). */
function collectedEvidenceCount(missionId) {
  const pins = investigationPins[missionId] || {};
  return Object.keys(pins).filter((k) => pins[k] && pins[k].correct).length;
}

/** Build the Blue Team defense summary shown on the M1 completion screen. */
function buildContainmentSummaryHTML(missionId) {
  missionId = btMissionId(missionId);
  const correctActions = CONTAINMENT_ACTION_ORDER.filter((id) => {
    const def = CONTAINMENT_ACTIONS[missionId] && CONTAINMENT_ACTIONS[missionId][id];
    return def && def.kind === "correct" && containmentActionsUsed[missionId].has(id);
  });
  const actionsUsedCount = containmentActionsUsed[missionId].size;
  const evidenceCount = collectedEvidenceCount(missionId);
  const peak = escalationPeak[missionId] || 0;

  let spread, spreadCls;
  if (peak <= 0) { spread = "Yes — no spread detected"; spreadCls = "scorecard-val--green"; }
  else if (peak < ESCALATION_MAX) { spread = "Yes — contained before it spread"; spreadCls = "scorecard-val--green"; }
  else { spread = "Mostly — pressure peaked before containment"; spreadCls = "scorecard-val--yellow"; }

  let perf, perfCls;
  if (correctActions.length >= 2 && peak < ESCALATION_MAX) { perf = "Excellent"; perfCls = "scorecard-val--green"; }
  else if (correctActions.length >= 1) { perf = "Strong"; perfCls = "scorecard-val--cyan"; }
  else { perf = "Good"; perfCls = "scorecard-val--yellow"; }

  const actionLabels = correctActions
    .map((id) => CONTAINMENT_ACTIONS[missionId][id].label)
    .join(", ") || "Containment handled automatically";

  return `
    <div class="scorecard-section scorecard-section--collapsed containment-summary">
      <span class="scorecard-section-label">BLUE TEAM DEFENSE SUMMARY</span>
      <ul class="scorecard-rows">
        <li class="scorecard-row">
          <span class="scorecard-key">Threat Spread Prevented</span>
          <span class="scorecard-val ${spreadCls}">${escapeHtml(spread)}</span>
        </li>
        <li class="scorecard-row">
          <span class="scorecard-key">Evidence Collected</span>
          <span class="scorecard-val scorecard-val--cyan">${evidenceCount} finding${evidenceCount === 1 ? "" : "s"}</span>
        </li>
        <li class="scorecard-row">
          <span class="scorecard-key">Containment Actions Used</span>
          <span class="scorecard-val">${actionsUsedCount} (${escapeHtml(actionLabels)})</span>
        </li>
        <li class="scorecard-row">
          <span class="scorecard-key">Blue Team Performance</span>
          <span class="scorecard-val ${perfCls}">${escapeHtml(perf)}</span>
        </li>
      </ul>
    </div>`;
}

function fxPulse(id) {
  fxFlash(document.getElementById(id), "fx-pulse", 700);
}

function fxPulseConfidence(missionId) {
  fxPulse(missionId === "mission-003" ? "m3ConfidenceMeter" : missionId === "mission-002" ? "m2ConfidenceMeter" : "confidenceMeter");
}

function fxPulseThreat(missionId) {
  fxPulse(missionId === "mission-003" ? "m3ThreatMeter" : missionId === "mission-002" ? "m2ThreatMeter" : "threatMeter");
}

function fxPulseBoard(missionId) {
  fxFlash(document.getElementById(boardHostId(missionId)), "fx-board-highlight", 1100);
}

function fxPulseTrust() {
  fxPulse("trustScore");
  fxPulse("m2TrustScore");
}

function fxPulseXP() {
  document.querySelectorAll(".rank-badge").forEach((el) => fxFlash(el, "fx-pulse", 700));
}

/* ============================================================
   Milestone 28C — Cinematic Incident Interruptions
   ------------------------------------------------------------
   A thin "emotional emphasis" layer that briefly dramatises MAJOR
   incident moments. It renders AROUND the existing event-toast system
   (its position, timing, queue and durations are UNCHANGED) — never
   instead of it. Every layer is pointer-events:none so it NEVER blocks
   the terminal or buttons, only ONE emphasis runs at a time, and each
   effect fades cleanly so the UI calmly returns to investigation mode.
   - showIncidentInterruption(eventType, opts) — single reusable entry.
   - severities: info | caution | threat | containment | mission.
   - never intrudes on the teaching demo; fully torn down on every
     mission-exit via endGuidedRun() → clearIncidentCinema().
   ============================================================ */
const INCIDENT_SEVERITIES = ["info", "caution", "threat", "containment", "mission"];

// Semantic event name → severity (+ short, operational manager follow-up).
// Callers may also pass a raw severity directly as the eventType.
const INCIDENT_INTERRUPTIONS = {
  "red-team-movement":    { severity: "threat" },
  "escalation":           { severity: "threat",      manager: "We may be losing containment." },
  "additional-targeting": { severity: "caution",     manager: "This may no longer be isolated to one employee." },
  "containment-success":  { severity: "containment", manager: "Good response. Threat spread appears reduced." },
  "workstation-isolated": { severity: "containment", manager: "Good response. Threat spread appears reduced." },
  "mission-complete":     { severity: "mission" },
  "assignment-unlocked":  { severity: "info" },
};

// How long the dim/glow emphasis dwells before it fades (ms). "mission" lingers
// a touch longer for weight; everything else is a brief flourish.
const INCIDENT_CINEMA_HOLD = { info: 700, caution: 800, threat: 950, containment: 950, mission: 1500 };
const INCIDENT_CINEMA_FADE_MS = 520;      // matches the CSS fade-out
const INCIDENT_CINEMA_COOLDOWN_MS = 1200; // ignore rapid re-triggers (anti-spam)

let incidentCinemaLayer = null;
let incidentCinemaActive = false;         // one cinematic emphasis at a time
let lastIncidentCinemaAt = 0;
let incidentCinemaTimers = [];            // all pending teardown/follow-up timers

/** Track a timer so clearIncidentCinema() can cancel it on a mission-exit. */
function cinemaTimer(fn, ms) {
  const id = window.setTimeout(() => {
    incidentCinemaTimers = incidentCinemaTimers.filter((t) => t !== id);
    fn();
  }, ms);
  incidentCinemaTimers.push(id);
  return id;
}

function ensureIncidentCinemaLayer() {
  if (incidentCinemaLayer && document.body.contains(incidentCinemaLayer)) return incidentCinemaLayer;
  incidentCinemaLayer = document.createElement("div");
  incidentCinemaLayer.id = "incidentCinemaLayer";
  incidentCinemaLayer.className = "incident-cinema";
  incidentCinemaLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(incidentCinemaLayer);
  return incidentCinemaLayer;
}

/** The mission whose dashboard is currently on screen (M3/M2 if visible, else M1). */
function activeCinemaMission() {
  const m3 = document.getElementById("mission3Dashboard");
  if (m3 && m3.style.display !== "none") return "mission-003";
  const m2 = document.getElementById("mission2Dashboard");
  return (m2 && m2.style.display !== "none") ? "mission-002" : "mission-001";
}

/** The active mission's terminal OUTPUT element (for the dramatic flicker). */
function activeTerminalOutput() {
  const m = activeCinemaMission();
  return document.getElementById(
    m === "mission-003" ? "m3Terminal" : m === "mission-002" ? "m2Terminal" : "terminalOutput"
  );
}

/** Briefly slow command typing + flicker the terminal for dramatic pacing, then
 *  cleanly restore. NEVER freezes input — it only paces the animation. */
function applyTerminalDramaticPacing(severity) {
  const term = activeTerminalOutput();
  if (term) fxFlash(term, "terminal--cinema-flicker", 900);
  terminalPaceMultiplier = severity === "mission" ? 2.4 : 1.8;
  cinemaTimer(() => { terminalPaceMultiplier = 1; }, 1100);
}

/** Pulse the containment progress panel + fill for a mission (no-op safe). */
function pulseContainmentPanel(missionId) {
  const panel = btDom(missionId, "panel");
  if (panel) fxFlash(panel, "blue-team-panel--cinema", 1100);
  const fill = btDom(missionId, "fill");
  if (fill) fxFlash(fill, "containment-fill--cinema", 1100);
}

/** Pulse the manager transmission indicator (no-op safe outside M1/M2). */
function pulseTransmissionIndicator(missionId) {
  const panel = document.getElementById(
    missionId === "mission-003" ? "m3ManagerPanel" : missionId === "mission-002" ? "m2ManagerPanel" : "managerPanel"
  );
  if (panel) fxFlash(panel, "manager-panel--cinema", 1200);
}

/** Glow a mission node (mini-maps + full map) to signal a new assignment. */
function glowNextMissionNode(missionId) {
  const sel = `[data-mission="${missionId}"]`;
  document
    .querySelectorAll(`#m1MiniMap ${sel}, #m2MiniMap ${sel}`)
    .forEach((n) => fxFlash(n, "mini-node--unlock-glow", 2900));
  const mapNode = document.querySelector(`#missionsMap ${sel}`);
  if (mapNode) fxFlash(mapNode, "mission-node--unlock-glow", 2900);
}

/** PUBLIC API — add brief cinematic emphasis around a MAJOR incident event.
 *  Renders dim/glow/pulses AROUND the existing alerts (never changes them).
 *  Returns true if an emphasis played. */
function showIncidentInterruption(eventType, opts) {
  opts = opts || {};
  if (demoRunning) return false; // never intrude on the teaching demo

  const cfg = INCIDENT_INTERRUPTIONS[eventType] || null;
  const severity = INCIDENT_SEVERITIES.includes(opts.severity)
    ? opts.severity
    : (cfg ? cfg.severity
           : (INCIDENT_SEVERITIES.includes(eventType) ? eventType : "info"));

  // One emphasis at a time + a short cooldown so bursts never stack or spam.
  const now = Date.now();
  if (incidentCinemaActive) return false;
  if (!opts.force && now - lastIncidentCinemaAt < INCIDENT_CINEMA_COOLDOWN_MS) return false;
  lastIncidentCinemaAt = now;
  incidentCinemaActive = true;

  const mission = activeCinemaMission();

  // 1) Background dim + brief severity tint (pointer-events:none — never blocks).
  const layer = ensureIncidentCinemaLayer();
  layer.className = "incident-cinema incident-cinema--" + severity;
  void layer.offsetWidth;
  layer.classList.add("incident-cinema--show");

  // 2) Terminal dramatic pacing (flicker + brief typing slowdown).
  applyTerminalDramaticPacing(severity);

  // 3) Mission Control reactions — active node pulse + the relevant indicator.
  if (typeof pulseActiveMissionNode === "function") pulseActiveMissionNode();
  if (severity === "threat" || severity === "caution") {
    fxPulseThreat(mission);
  } else if (severity === "containment" || severity === "mission") {
    pulseContainmentPanel(mission);
  } else {
    fxPulseConfidence(mission);
  }
  // 4) Manager transmission indicator reacts shortly afterward.
  pulseTransmissionIndicator(mission);

  // 5) Short, operational manager follow-up a beat later (deduped by
  //    pushManagerMessage so repeats of the same line never spam the feed).
  const managerLine = opts.manager || (cfg && cfg.manager) || "";
  if (managerLine) cinemaTimer(() => pushManagerMessage(mission, managerLine), 1100);

  // 6) Hold, then fade out and calmly return to investigation mode.
  const hold = INCIDENT_CINEMA_HOLD[severity] || 800;
  cinemaTimer(() => {
    layer.classList.remove("incident-cinema--show");
    layer.classList.add("incident-cinema--hide");
    cinemaTimer(() => {
      layer.classList.remove("incident-cinema--hide");
      incidentCinemaActive = false;
    }, INCIDENT_CINEMA_FADE_MS);
  }, hold);
  return true;
}

/** Mission-complete cinematic transition: a BRIEF, auto-dismiss centered caption
 *  ("MISSION COMPLETE / Threat Contained") + the next mission node unlock glow.
 *  Layered AROUND the existing completion alerts/objective — it changes none of
 *  the alert timing/location and adds no persistent popup. */
function playMissionCompleteCinema(missionId) {
  if (demoRunning) return;
  showIncidentInterruption("mission-complete", { force: true });

  let banner = document.getElementById("incidentCinemaBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "incidentCinemaBanner";
    banner.className = "incident-cinema-banner";
    banner.setAttribute("aria-hidden", "true");
    banner.innerHTML =
      '<span class="incident-cinema-banner-title">ASSIGNMENT COMPLETE</span>' +
      '<span class="incident-cinema-banner-sub">Threat Contained</span>';
    document.body.appendChild(banner);
  }
  banner.classList.remove("incident-cinema-banner--show");
  void banner.offsetWidth;
  banner.classList.add("incident-cinema-banner--show");
  cinemaTimer(() => {
    banner.classList.remove("incident-cinema-banner--show");
    cinemaTimer(() => { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 600);
  }, 1900);

  // The next assignment (Mission 2) node glows on the map shortly afterward.
  cinemaTimer(() => glowNextMissionNode("mission-002"), 700);
}

/** Tear down all cinematic state/timers + clear the dim layer. Called from
 *  endGuidedRun() so EVERY mission-exit fully resets the cinematic layer and a
 *  pending fade/follow-up can never fire off-screen. */
function clearIncidentCinema() {
  incidentCinemaTimers.forEach((id) => clearTimeout(id));
  incidentCinemaTimers = [];
  terminalPaceMultiplier = 1;
  incidentCinemaActive = false;
  if (incidentCinemaLayer) {
    incidentCinemaLayer.classList.remove("incident-cinema--show", "incident-cinema--hide");
  }
  const banner = document.getElementById("incidentCinemaBanner");
  if (banner && banner.parentNode) banner.parentNode.removeChild(banner);
}

/* ============================================================
   Milestone 25B — Guided Spotlight Mission Flow
   ------------------------------------------------------------
   Turns the static left-panel Briefing Room into a guided,
   center-stage onboarding: dim the UI and spotlight ONE briefing
   card at a time with Sarah Reyes guidance, a "Briefing Step X of
   N" counter, a "Mission Ready" screen, and an "Initializing
   analyst workstation..." launch sequence. During the live
   investigation a lightweight, dismissible, NON-BLOCKING spotlight
   walks the student through commands → file inspection →
   Investigation Board → Decision Actions.

   This layer reuses ALL existing briefing state + logic
   (MISSION_BRIEFINGS, briefingReviewed, the one-time XP guard,
   reviewBriefingCard, save/restore). It never duplicates flow
   logic. It is RESUME-SAFE: an already-started mission skips the
   overlay entirely, and the investigation spotlight only runs
   after a live guided launch (igEnabled) — never during restore.
   ============================================================ */

// Supervisor lead-in shown above each briefing card (before the card content).
const GUIDED_BRIEFING_INTROS = {
  "mission-001": {
    phishing:  "First, review phishing indicators. These will help you identify suspicious files.",
    evidence:  "Next, remember how analysts collect evidence before making conclusions.",
    passwords: "Finally, review password safety. This will be important during the investigation.",
  },
  "mission-002": {
    ip:           "First, understand IP addresses — you identify hosts before scanning.",
    reachability: "Next, recall how reachability confirms which targets are worth investigating.",
    services:     "Finally, review open services — exposed services are exactly what we hunt for.",
  },
  "mission-003": {
    "recon":        "First, understand reconnaissance — attackers gather information before they attack.",
    "weak-signals": "Next, remember that repeated activity from one source is the real clue.",
    "blue-team":    "Finally, review how the Blue Team responds — reporting recon early prevents the next stage.",
  },
};

let guidedState = null;
// Pending launch-sequence timers, tracked so endGuidedRun() can cancel them
// (prevents a stale launch callback from re-opening the mission after teardown).
let guidedLaunchTimers = [];
function clearGuidedLaunchTimers() {
  guidedLaunchTimers.forEach((t) => clearTimeout(t));
  guidedLaunchTimers = [];
}

function guidedIntroFor(missionId, cardId) {
  const m = GUIDED_BRIEFING_INTROS[missionId];
  return (m && m[cardId]) || "Review this briefing material before you begin.";
}

/**
 * Milestone 25B (resume-safe) — detect whether an investigation is ALREADY
 * underway for a mission, derived purely from PERSISTED/restored state (not the
 * session-only `missionStarted`/`m2Started` flags). Used to skip the guided
 * onboarding overlay on a mid-mission reload so the student is never re-trapped
 * in the briefing; instead we resume straight into the live investigation.
 */
function hasMissionProgress(missionId) {
  // Durable "launched" flag covers the case where the investigation started but
  // no evidence/pins were collected yet before the reload.
  if (missionLaunched && missionLaunched[missionId]) return true;
  const complete = missionId === "mission-003" ? mission3Complete : missionId === "mission-002" ? mission2Complete : missionComplete;
  if (complete) return true;
  const ev = (evidenceLog && evidenceLog[missionId]) || [];
  if (ev.length) return true;
  const pins = (investigationPins && investigationPins[missionId]) || {};
  if (Object.keys(pins).length) return true;
  if (decisionTaken && decisionTaken[missionId]) return true;
  if (missionId === "mission-001") {
    if (m1FilesReviewed && m1FilesReviewed.size) return true;
    if (typeof m1Confidence === "number" && m1Confidence > 0) return true;
  } else {
    if (typeof m2Confidence === "number" && m2Confidence > 0) return true;
  }
  return false;
}

function startGuidedBriefing(missionId, startFn) {
  const alreadyStarted = missionId === "mission-003" ? m3Started : missionId === "mission-002" ? m2Started : missionStarted;
  // Resume-safe: skip onboarding if the mission is already running this session
  // OR persisted progress shows an investigation is underway — resume directly.
  if (alreadyStarted || hasMissionProgress(missionId)) {
    if (typeof startFn === "function") startFn();
    return;
  }
  const briefing = MISSION_BRIEFINGS[missionId];
  if (!briefing || !briefing.cards.length) {
    if (typeof startFn === "function") startFn();
    return;
  }
  guidedState = { missionId, startFn, step: 0, total: briefing.cards.length };
  renderGuidedOverlay();
}

function closeGuidedOverlay() {
  const o = document.getElementById("guidedOverlay");
  if (o && o.parentNode) o.parentNode.removeChild(o);
}

function renderGuidedOverlay() {
  if (!guidedState) return;
  closeGuidedOverlay();
  const overlay = document.createElement("div");
  overlay.id = "guidedOverlay";
  overlay.className = "guided-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  document.body.appendChild(overlay);
  console.log("Guided briefing overlay opened");
  renderGuidedStep();
}

function renderGuidedStep() {
  const overlay = document.getElementById("guidedOverlay");
  if (!overlay || !guidedState) return;
  const { missionId, step, total } = guidedState;
  const briefing = MISSION_BRIEFINGS[missionId];
  if (step >= total) { renderGuidedReady(); return; }

  const card  = briefing.cards[step];
  const intro = guidedIntroFor(missionId, card.id);
  // Mirror Sarah's guidance into the persistent manager feed too.
  pushManagerMessage(missionId, intro);

  const points = card.points
    .map((p) => `<li><span class="guided-point-bullet">▹</span>${escapeHtml(p)}</li>`)
    .join("");

  overlay.innerHTML = `
    <div class="guided-card" role="document">
      <div class="guided-room-title">Mission Briefing Room</div>
      <div class="guided-progress">Briefing Step ${step + 1} of ${total}</div>
      <div class="guided-sarah">
        <span class="guided-sarah-avatar" aria-hidden="true">SR</span>
        <div class="guided-sarah-body">
          <span class="guided-sarah-name">Sarah Reyes · Supervisor</span>
          <p class="guided-sarah-text">${escapeHtml(intro)}</p>
        </div>
      </div>
      <h3 class="guided-title">${escapeHtml(card.title)}</h3>
      <ul class="guided-points">${points}</ul>
      <div class="guided-actions">
        <button id="guidedNextBtn" class="guided-next-btn" type="button">
          ${step + 1 < total ? "Got it — Next ›" : "Got it — Finish ›"}
        </button>
      </div>
    </div>
  `;
  const next = overlay.querySelector("#guidedNextBtn");
  if (next) next.addEventListener("click", advanceGuidedStep);
}

function advanceGuidedStep() {
  if (!guidedState) return;
  const { missionId, step } = guidedState;
  const briefing = MISSION_BRIEFINGS[missionId];
  const card = briefing.cards[step];
  // Reuse the existing review logic: marks reviewed, supervisor reaction,
  // one-time +10 XP on completion, re-renders the left panel, persists.
  if (card) reviewBriefingCard(missionId, card.id);
  guidedState.step += 1;
  if (guidedState.step >= guidedState.total) renderGuidedReady();
  else renderGuidedStep();
}

function renderGuidedReady() {
  const overlay = document.getElementById("guidedOverlay");
  if (!overlay || !guidedState) return;
  const task = guidedState.missionId === "mission-002"
    ? "Your task: map the network, find the exposed host, and identify its risky services."
    : "Your task: investigate the workstation and identify the strongest threat evidence.";
  overlay.innerHTML = `
    <div class="guided-card guided-card--ready" role="document">
      <div class="guided-ready-badge">✓ Briefing Complete</div>
      <h3 class="guided-title guided-title--ready">Mission Ready</h3>
      <p class="guided-ready-text">You reviewed the briefing materials.</p>
      <p class="guided-ready-task">${escapeHtml(task)}</p>
      <div class="guided-actions guided-actions--center">
        ${guidedState.missionId === "mission-001"
          ? `<button id="guidedDemoBtn" class="guided-next-btn guided-demo-btn" type="button">
               👁 Watch Demo First
             </button>`
          : ``}
        <button id="guidedLaunchBtn" class="guided-next-btn guided-launch-btn" type="button">
          ▶ Launch Investigation
        </button>
      </div>
      ${guidedState.missionId === "mission-001"
        ? `<p class="guided-demo-note">New here? Watch a quick demo of how to use the app, then try it yourself.</p>`
        : ``}
    </div>
  `;
  const launch = overlay.querySelector("#guidedLaunchBtn");
  if (launch) launch.addEventListener("click", runGuidedLaunch);
  const demo = overlay.querySelector("#guidedDemoBtn");
  if (demo) demo.addEventListener("click", () => startDemo("mission-001"));
}

/** Play the launch sequence in the overlay (terminal-styled), then start. */
function runGuidedLaunch() {
  const overlay = document.getElementById("guidedOverlay");
  if (!overlay || !guidedState) return;
  const { missionId, startFn } = guidedState;
  console.log("Guided briefing complete. Investigation launched.");
  const lines = [
    "Initializing analyst workstation...",
    "Loading file investigation tools...",
    "Mission ready.",
  ];
  overlay.innerHTML = `
    <div class="guided-card guided-card--launch" role="document">
      <h3 class="guided-title">Launching Investigation</h3>
      <ul class="guided-launch-lines" id="guidedLaunchLines"></ul>
    </div>
  `;
  const list = overlay.querySelector("#guidedLaunchLines");
  let i = 0;
  clearGuidedLaunchTimers();
  (function tick() {
    if (!list) { finishGuidedLaunch(missionId, startFn); return; }
    if (i < lines.length) {
      const li = document.createElement("li");
      li.className = "guided-launch-line";
      const done = i === lines.length - 1;
      li.innerHTML =
        `<span class="guided-launch-mark">${done ? "✓" : "›"}</span> ` +
        `<span>${escapeHtml(lines[i])}</span>`;
      list.appendChild(li);
      i += 1;
      guidedLaunchTimers.push(setTimeout(tick, done ? 520 : 430));
    } else {
      guidedLaunchTimers.push(setTimeout(() => finishGuidedLaunch(missionId, startFn), 360));
    }
  })();
}

function finishGuidedLaunch(missionId, startFn) {
  clearGuidedLaunchTimers();
  // Guard against a stale launch callback firing after teardown (reset/back/
  // leave nulls guidedState via endGuidedRun) — never resurrect a torn-down run.
  if (!guidedState) return;
  closeGuidedOverlay();
  guidedState = null;
  if (typeof startFn === "function") startFn();
  // Milestone 25B fix — set the explicit first objective after launch (M1).
  if (missionId === "mission-001") {
    setCurrentObjective("mission-001", "Goal: find the source of the alert. Open the documents folder and inspect what's inside.");
  }
  // Enable the in-investigation spotlight tour for THIS live run only.
  igEnabled = true;
  igPhasesShown.clear();
  igPending.clear();
  // First stop: the command center (defers automatically if the mission's
  // alert modal is still up — see igShow's modal-open guard).
  setTimeout(() => igShow(missionId, "commands"), 480);
}

/* ---- Investigation spotlight (non-blocking, dismissible) -----------
   A light dim layer (pointer-events:none, so it NEVER blocks clicks), a
   glow ring on the current target, and a coach tip with a "Got it"
   button. Each phase fires once per mission per live guided run. */
let igEnabled = false;
const igPhasesShown = new Set();
const igPending = new Set();

const IG_PHASES = {
  commands: {
    target: (m) => document.getElementById(m === "mission-003" ? "m3CurrentObjective" : m === "mission-002" ? "m2CurrentObjective" : "currentObjective"),
    text: "This is your command Center. Click or Type a command to run it in the terminal - new commands unlock as you progress.",
  },
  files: {
    target: () => document.querySelector('#commandButtonsContainer [data-cmd-group="Inspect Files"]'),
    text: "New file-inspection commands unlocked. Open and read each file to gather evidence.",
  },
  board: {
    target: (m) => document.getElementById(m === "mission-003" ? "m3InvestigationBoard" : m === "mission-002" ? "m2InvestigationBoard" : "investigationBoard"),
    text: "You found something worth keeping. Pin it to your Investigation Board, then classify how suspicious it is.",
  },
  decision: {
    target: (m) => document.getElementById(m === "mission-003" ? "m3DecisionActions" : m === "mission-002" ? "m2DecisionActions" : "decisionActions"),
    text: "Evidence is in. Choose your decision action carefully — it affects your trust score.",
  },
};

/** True while a blocking modal (the mission alert modal or the guided
 *  briefing overlay) is on screen — the spotlight waits for it to close. */
function igModalOpen() {
  if (document.getElementById("guidedOverlay")) return true;
  // Task #6 — the presentation-only briefing-replay recap is also blocking;
  // defer any live spotlight while it is on screen.
  if (document.getElementById("rgbOverlay")) return true;
  const a = document.getElementById("alertModalRoot");
  if (a && getComputedStyle(a).display !== "none" && a.childElementCount > 0) return true;
  return false;
}

// Active spotlight target + its click handler, so igTeardown can actively
// unbind it (the {once:true} listener would otherwise linger if the student
// dismissed via the coach button instead of clicking the target).
let igTargetEl = null;
let igTargetHandler = null;

function igTeardown() {
  const dim = document.getElementById("igDim");
  if (dim && dim.parentNode) dim.parentNode.removeChild(dim);
  const tip = document.getElementById("igCoach");
  if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
  if (igTargetEl && igTargetHandler) {
    igTargetEl.removeEventListener("click", igTargetHandler);
  }
  igTargetEl = null;
  igTargetHandler = null;
  document.querySelectorAll(".ig-spotlight-target")
    .forEach((el) => el.classList.remove("ig-spotlight-target"));
}

/** End the guided investigation tour (reset / back / leave a mission). */
function endGuidedRun() {
  // Stop any in-progress command typing so a deferred runCommand can't fire
  // off-screen and mutate state after the student has navigated away. This
  // path is shared by every mission-exit (map/overview/back/reset), so one
  // call here covers them all.
  cancelTerminalTyping();
  // UF-5 — cancel a pending completion "telemetry settling" beat so a stale
  // cosmetic callback can't touch a meter after the student has navigated away.
  clearCompletionSettle();
  // Milestone 27A — cancel a pending "Submitting analysis..." delay so a stale
  // reasoning/classification callback can't mutate pins/XP/UI after the exit.
  clearM1AnalysisTimer();
  // Milestone 31A — cancel pending M2 reasoning pin-offer / retry timers so a
  // stale callback can't open a pin prompt off-screen after navigation.
  clearM2ReasoningTimers();
  clearM3ReasoningTimers();
  // Milestone 28A — cancel a pending Blue Team decision submit / delayed red-team
  // event, and clear the decision-focus dim, on every mission-exit.
  clearM1DecisionTimers();
  document.body.classList.remove("m1-blueteam-decision");
  // Stage 3 — stop the idle-escalation watch on every mission-exit so a pending
  // timer can never fire off-screen after the student navigates away.
  clearEscalationWatch();
  // Milestone 28C — tear down any in-flight cinematic interruption (dim layer,
  // banner, follow-up/fade timers, pacing) so nothing fires off-screen.
  clearIncidentCinema();
  // If an opt-in demo is mid-flight, tear it down on ANY navigation exit so
  // its timers can't fire off-screen and `suppressSave` is never left stuck.
  if (demoRunning) abortDemo();
  // Stage 1 — cancel a pending mission-start adversary intro so it can never
  // fire off-screen after a navigation/reset (this hub covers every exit).
  if (m1AdversaryIntroTimer) {
    clearTimeout(m1AdversaryIntroTimer);
    m1AdversaryIntroTimer = null;
  }
  igEnabled = false;
  igPhasesShown.clear();
  igPending.clear();
  clearGuidedLaunchTimers();
  igTeardown();
  // Task #5 — also tear down an on-demand Replay Guide on any mission-exit so
  // its dim/coach can never be left stuck after navigation (no-op if inactive).
  endReplayGuide();
  // Task #6 — also tear down a briefing-replay recap on any mission-exit so
  // its overlay can never be left stuck after navigation (no-op if inactive).
  endBriefingReplay();
  guidedState = null;
  closeGuidedOverlay();
}

function igShow(missionId, phase, targetEl) {
  if (!igEnabled) return;
  // Task #5 — never let a live (reactive) spotlight fire over an on-demand
  // Replay Guide. This is purely cosmetic suppression; it touches no gameplay
  // state and does not flip igEnabled, keeping the two paths fully independent.
  if (rgActive) return;
  const def = IG_PHASES[phase];
  if (!def) return;
  const key = missionId + ":" + phase;
  if (igPhasesShown.has(key)) return;

  // Defer while a blocking modal is open (alert modal / guided overlay).
  if (igModalOpen()) {
    if (igPending.has(key)) return;
    igPending.add(key);
    let tries = 0;
    const retry = () => {
      igPending.delete(key);
      if (!igEnabled || igPhasesShown.has(key)) return;
      if (igModalOpen()) {
        if (++tries > 40) return; // give up after ~20s
        igPending.add(key);
        setTimeout(retry, 500);
        return;
      }
      igShow(missionId, phase);
    };
    setTimeout(retry, 500);
    return;
  }

  const el = targetEl || def.target(missionId);
  if (!el || el.offsetParent === null) return; // only spotlight visible targets

  igPhasesShown.add(key);
  igTeardown();

  const dim = document.createElement("div");
  dim.id = "igDim";
  dim.className = "ig-dim";
  document.body.appendChild(dim);

  el.classList.add("ig-spotlight-target");
  try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}

  const tip = document.createElement("div");
  tip.id = "igCoach";
  tip.className = "ig-coach";
  tip.innerHTML =
    `<p class="ig-coach-text">${escapeHtml(def.text)}</p>` +
    `<button class="ig-coach-dismiss" type="button">Got it</button>`;
  document.body.appendChild(tip);

  const dismissBtn = tip.querySelector(".ig-coach-dismiss");
  if (dismissBtn) dismissBtn.addEventListener("click", igTeardown);
  // Dismiss as soon as the student actually interacts with the target.
  // Track el + handler so igTeardown can unbind it even if the student
  // dismisses via the coach button instead of clicking the target.
  igTargetEl = el;
  igTargetHandler = igTeardown;
  el.addEventListener("click", igTargetHandler, { once: true });

  positionCoach(tip, el);
}

/** Place the coach tip near its target, flipping above/below to stay in view. */
function positionCoach(tip, el) {
  const r  = el.getBoundingClientRect();
  const tr = tip.getBoundingClientRect();
  const margin = 12;
  let top = r.bottom + margin;
  if (top + tr.height > window.innerHeight - margin) {
    top = r.top - tr.height - margin; // flip above
  }
  if (top < margin) top = margin;
  // Final clamp: if the target is scrolled near/below the viewport edge, keep
  // the whole tip (and its nav buttons) on screen so it stays clickable.
  top = Math.max(margin, Math.min(top, window.innerHeight - tr.height - margin));
  let left = r.left + (r.width / 2) - (tr.width / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - tr.width - margin));
  tip.style.top  = top + "px";
  tip.style.left = left + "px";
}

/* ============================================================
   REPLAY GUIDE (Task #5) — on-demand spotlight replay, UI ONLY
   ------------------------------------------------------------
   Re-runs the Milestone 25B spotlight phases for the current
   mission on demand (for players who skipped or forgot the live
   walkthrough). Fully self-contained: its own dim/coach nodes
   (#rgDim / #rgCoach) and teardown, INDEPENDENT of the live
   igEnabled / igShow path so the two can never overlap. Reuses
   the exact 25B visuals (.ig-dim, .ig-spotlight-target,
   .ig-coach) and the existing IG_PHASES copy/targets.

   Touches NO gameplay state — no XP, evidence, attempts, command
   unlocks, Supabase writes, or progress localStorage. The only
   permitted write is one optional, non-functional UI flag. */
const RG_PHASE_ORDER = ["commands", "files", "board", "decision"];
let rgActive = false;
let rgMissionId = null;
let rgPlan = [];
let rgIndex = 0;
let rgTargetEl = null;
let rgKeyHandler = null;

/** Resolve a phase's target for a mission, returning it only if visible.
 *  Mirrors igShow's `offsetParent === null` guard so off-screen / display:none
 *  targets are skipped safely (no stuck dim, no trapped clicks). */
function rgVisibleTarget(phase, missionId) {
  const def = IG_PHASES[phase];
  if (!def) return null;
  let el = null;
  try { el = def.target(missionId); } catch (_) { el = null; }
  if (!el || el.offsetParent === null) return null;
  return el;
}

/** Launch the replay tour for a mission (no-op if one is already running). */
function startReplayGuide(missionId) {
  if (rgActive) return;
  // Enforce exclusivity with the live first-run tour: if a live spotlight
  // overlay (#igDim / #igCoach + ring) happens to be on screen, remove ITS
  // visuals first so only one dim/coach can ever exist. This does NOT flip
  // igEnabled or clear igPhasesShown — the live tour's logical state is left
  // intact; we only clear its current visual. While rgActive, igShow's
  // `if (rgActive) return` guard then prevents any new live spotlight.
  igTeardown();
  // Build the plan from phases whose targets are currently on screen, in the
  // fixed 25B order: commands -> files -> board -> decision.
  const plan = RG_PHASE_ORDER.filter((p) => rgVisibleTarget(p, missionId));
  rgActive = true;
  rgMissionId = missionId;
  rgPlan = plan;
  rgIndex = 0;
  // Optional, non-functional UI flag only (no gameplay meaning). Best-effort —
  // never throws and never affects ech.progress.v1 or any backend sync.
  try { localStorage.setItem("ech.replayGuideUsed.v1", "1"); } catch (_) {}
  console.log("Replay Guide started for " + missionId + " (" + plan.length + " step(s))");
  // Escape cancels the replay at any time.
  rgKeyHandler = (e) => { if (e.key === "Escape") endReplayGuide(); };
  document.addEventListener("keydown", rgKeyHandler);
  rgShowStep();
}

function rgShowStep() {
  if (!rgActive) return;
  // Advance past any phase whose target became unavailable since planning.
  while (rgIndex < rgPlan.length) {
    const phase = rgPlan[rgIndex];
    const el = rgVisibleTarget(phase, rgMissionId);
    if (el) { rgRender(phase, el); return; }
    rgIndex += 1;
  }
  endReplayGuide(); // nothing left to show — clean exit, no stuck overlay
}

function rgRender(phase, el) {
  rgTeardownVisual();
  const def = IG_PHASES[phase];

  const dim = document.createElement("div");
  dim.id = "rgDim";
  dim.className = "ig-dim"; // reuse the exact 25B dim (pointer-events:none)
  document.body.appendChild(dim);

  el.classList.add("ig-spotlight-target");
  rgTargetEl = el;
  try { el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}

  const isLast = rgIndex >= rgPlan.length - 1;
  const tip = document.createElement("div");
  tip.id = "rgCoach";
  tip.className = "ig-coach rg-coach";
  tip.innerHTML =
    `<p class="ig-coach-text">${escapeHtml(def.text)}</p>` +
    `<div class="rg-coach-foot">` +
      `<span class="rg-coach-step">Step ${rgIndex + 1} of ${rgPlan.length}</span>` +
      `<span class="rg-coach-btns">` +
        `<button class="rg-coach-close" type="button">Close</button>` +
        `<button class="ig-coach-dismiss rg-coach-next" type="button">${isLast ? "Done" : "Next ›"}</button>` +
      `</span>` +
    `</div>`;
  document.body.appendChild(tip);

  const nextBtn = tip.querySelector(".rg-coach-next");
  if (nextBtn) nextBtn.addEventListener("click", rgAdvance);
  const closeBtn = tip.querySelector(".rg-coach-close");
  if (closeBtn) closeBtn.addEventListener("click", endReplayGuide);

  positionCoach(tip, el);
}

function rgAdvance() {
  if (!rgActive) return;
  rgIndex += 1;
  rgShowStep();
}

function rgTeardownVisual() {
  const dim = document.getElementById("rgDim");
  if (dim && dim.parentNode) dim.parentNode.removeChild(dim);
  const tip = document.getElementById("rgCoach");
  if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
  if (rgTargetEl) {
    rgTargetEl.classList.remove("ig-spotlight-target");
    rgTargetEl = null;
  }
}

/** End the replay (Close button, Escape, finished, or navigation). Safe to
 *  call when inactive — leaves no dim layer and traps no clicks. */
function endReplayGuide() {
  rgTeardownVisual();
  if (rgKeyHandler) {
    document.removeEventListener("keydown", rgKeyHandler);
    rgKeyHandler = null;
  }
  rgActive = false;
  rgMissionId = null;
  rgPlan = [];
  rgIndex = 0;
}

/* ============================================================
   BRIEFING REPLAY (Task #6) — presentation-only briefing recap
   ------------------------------------------------------------
   Re-shows a mission's briefing cards (MISSION_BRIEFINGS) in a
   read-only overlay (#rgbOverlay), then flows directly into the
   spotlight Replay Guide so the whole thing feels like one
   onboarding sequence. Dedicated overlay + teardown, fully
   independent of the first-run guided briefing.

   Touches NO gameplay state. It deliberately does NOT call
   reviewBriefingCard / advanceGuidedStep / startGuidedBriefing
   (which persist + award one-time briefing XP), nor saveProgress
   / awardXP. The only permitted write is the same inert, never-
   read UI flag used by the Replay Guide. */
let rgbActive = false;
let rgbState = null; // { missionId, step, total }
let rgbKeyHandler = null;

/** Entry point for every "Replay Briefing" control. Shows the briefing
 *  cards first (if any), then chains into the spotlight Replay Guide. */
function startBriefingReplay(missionId) {
  // Never stack: ignore if a briefing recap or spotlight replay is running.
  if (rgbActive || rgActive) return;
  const briefing = MISSION_BRIEFINGS[missionId];
  if (!briefing || !briefing.cards.length) {
    // No briefing cards — just run the spotlight replay (which itself
    // exits cleanly when no targets are currently visible).
    startReplayGuide(missionId);
    return;
  }
  // Exclusivity — never let the recap stack on top of a live (reactive)
  // spotlight; tear it down first (same pattern startReplayGuide uses).
  igTeardown();
  rgbActive = true;
  rgbState = { missionId, step: 0, total: briefing.cards.length };
  // Optional, non-functional UI flag only — best-effort, never throws and
  // never touches ech.progress.v1 or any backend sync.
  try { localStorage.setItem("ech.replayGuideUsed.v1", "1"); } catch (_) {}
  console.log("Briefing replay started for " + missionId + " (" + briefing.cards.length + " card(s))");
  rgbKeyHandler = (e) => { if (e.key === "Escape") endBriefingReplay(); };
  document.addEventListener("keydown", rgbKeyHandler);
  rgbRenderStep();
}

function rgbRenderStep() {
  if (!rgbActive || !rgbState) return;
  let overlay = document.getElementById("rgbOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "rgbOverlay";
    overlay.className = "guided-overlay rgb-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    document.body.appendChild(overlay);
  }
  const { missionId, step, total } = rgbState;
  const briefing = MISSION_BRIEFINGS[missionId];
  const card = briefing.cards[step];
  if (!card) { rgbFinish(); return; }
  const points = card.points
    .map((p) => `<li><span class="guided-point-bullet">▹</span>${escapeHtml(p)}</li>`)
    .join("");
  const isLast = step + 1 >= total;
  overlay.innerHTML = `
    <div class="guided-card" role="document">
      <div class="guided-room-title">Mission Briefing Replay</div>
      <div class="guided-progress">Briefing Step ${step + 1} of ${total}</div>
      <h3 class="guided-title">${escapeHtml(card.title)}</h3>
      <ul class="guided-points">${points}</ul>
      <div class="guided-actions guided-actions--split">
        <button id="rgbCloseBtn" class="rgb-close-btn" type="button">Close</button>
        <button id="rgbNextBtn" class="guided-next-btn" type="button">
          ${isLast ? "Continue to walkthrough ›" : "Got it — Next ›"}
        </button>
      </div>
    </div>
  `;
  const next = overlay.querySelector("#rgbNextBtn");
  if (next) next.addEventListener("click", rgbAdvance);
  const close = overlay.querySelector("#rgbCloseBtn");
  if (close) close.addEventListener("click", () => endBriefingReplay());
}

function rgbAdvance() {
  if (!rgbActive || !rgbState) return;
  rgbState.step += 1;
  if (rgbState.step >= rgbState.total) { rgbFinish(); return; }
  rgbRenderStep();
}

/** Briefing cards done — tear down the recap overlay and flow into the
 *  spotlight Replay Guide as one continuous sequence. */
function rgbFinish() {
  const missionId = rgbState ? rgbState.missionId : null;
  endBriefingReplay();
  if (missionId) startReplayGuide(missionId);
}

/** End the briefing recap (Close button, Escape, finished, or navigation).
 *  Safe to call when inactive — leaves no overlay behind. */
function endBriefingReplay() {
  const overlay = document.getElementById("rgbOverlay");
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  if (rgbKeyHandler) {
    document.removeEventListener("keydown", rgbKeyHandler);
    rgbKeyHandler = null;
  }
  rgbActive = false;
  rgbState = null;
}

/* ============================================================
   OPT-IN GUIDED DEMO  (Mission 1 — "Watch how it works")
   A self-contained, automated walkthrough the student can opt into
   from the "Mission Ready" screen BEFORE starting for real. It
   launches a CLEAN Mission 1, runs real example commands while a
   pop-out MOVES near each location (command center → terminal →
   files → Investigation Board → decision), then fully resets so the
   student starts fresh.
   Safety: persistence is suppressed during the demo (reuses
   `suppressSave`) and `resetMission()` wipes every side effect at the
   end; the real spotlight tour (`igEnabled`) is held off so the two
   never overlap.
   ============================================================ */
let demoRunning = false;
let demoTimers  = [];
let demoStepIx  = 0;
let demoMaxRun  = -1; // furthest step whose real action has been executed
let demoTrustSnapshot = DEFAULT_TRUST_SCORE;
const DEMO_ACTION_DELAY_MS = 450; // let an action's DOM settle before re-pointing

function demoWait(fn, ms) {
  const id = setTimeout(fn, ms);
  demoTimers.push(id);
  return id;
}

function clearDemoTimers() {
  demoTimers.forEach((id) => clearTimeout(id));
  demoTimers = [];
}

/* Each step: narration text + the element to point at + an optional
   real action to run first. `action` runs, then after `actionDelay`
   the pop-out moves to `target`, then we hold for `hold` and advance. */
const DEMO_STEPS = [
  {
    text: "👋 Welcome, analyst! This is your workstation. I'll give you a quick tour and run a few commands the SAME way you will. Use Next and Back to go at your own pace.",
    target: null,
  },
  {
    text: "These are your COMMAND BUTTONS. Each one runs a real Linux command for you — just click and it does the typing. No experience needed!",
    target: () => document.getElementById("commandButtonsContainer"),
  },
  {
    text: "Watch closely: I'll CLICK the 'ls' button. See how the command first appears in the terminal entry below, then runs. 'ls' lists the files in the current folder.",
    action: () => demoClickCommand("ls"),
    target: () => document.getElementById("terminalInput"),
  },
  {
    text: "This is the TERMINAL — the computer's text screen. Every command you send and its result show up here. You can scroll it any time to re-read.",
    target: () => document.getElementById("terminalOutput"),
  },
  {
    text: "You don't have to use buttons — you can TYPE commands yourself too. Watch me type 'pwd' (print working directory) to show exactly where we are right now.",
    action: () => demoTypeCommand("pwd"),
    target: () => document.getElementById("terminalInput"),
  },
  {
    text: "Now I'll click 'cd documents' to OPEN the documents folder. 'cd' means change directory — it's how you move between folders.",
    action: () => demoClickCommand("cd documents"),
    target: () => document.getElementById("terminalInput"),
  },
  {
    text: "Let's see what's inside by listing the files again with 'ls'.",
    action: () => demoClickCommand("ls"),
    target: () => document.getElementById("terminalOutput"),
  },
  {
    text: "To read a file, use 'cat'. This one — finance_update.txt — is normal business activity. Nothing alarming here.",
    action: () => demoClickCommand("cat finance_update.txt"),
    target: () => document.getElementById("terminalOutput"),
  },
  {
    text: "⚠️ This file looks SUSPICIOUS. Reading it flags it as a finding you can investigate further. Reading files carefully is how you catch the bad guys!",
    action: () => demoClickCommand("cat suspicious_file.txt"),
    target: () => document.getElementById("terminalOutput"),
  },
  {
    text: "See this CURRENT OBJECTIVE card? It always tells you your next step — check here any time you're not sure what to do.",
    target: () => document.getElementById("currentObjective"),
  },
  {
    text: "Over here is your LIVE STATUS: Threat Level, Trust Score and Evidence Confidence. These update automatically as you investigate.",
    target: () => document.getElementById("threatMeter"),
  },
  {
    text: "Important clues get PINNED to your INVESTIGATION BOARD and rated by how suspicious they are. Watch — we pin this one as Critical Threat Evidence.",
    action: () => { try { handlePinClassification("mission-001", "suspicious_file.txt", "critical"); } catch (_) {} },
    target: () => document.getElementById("investigationBoard"),
  },
  {
    text: "Ever feel stuck? Click 'Request Hint' for a nudge in the right direction. There's no penalty for asking.",
    target: () => document.getElementById("m1HintBtn"),
  },
  {
    text: "Finally, you pick a DECISION ACTION to close the case. Your choice affects your Trust Score, so think it through.",
    target: () => document.getElementById("decisionActions") || document.getElementById("investigationBoard"),
  },
  {
    text: "🎉 That's the whole workflow! Close this demo and click ▶ Launch Investigation to solve it yourself. You've got this!",
    target: null,
    last: true,
  },
];

/** Look up the COMMAND_BUTTONS key for a raw command string, so demo
 *  commands fire the SAME unlock/progression logic a real click would. */
function m1KeyForCommand(command) {
  const def = COMMAND_BUTTONS.find((b) => b.command === command);
  return def ? def.key : "";
}

/** Demo: simulate a real button CLICK — flash the button as "pressed", let
 *  it type the command into the entry, then run it (with its key so unlocks
 *  fire exactly as in real play). Falls back to a keyed run + typing if the
 *  button isn't rendered yet (keeps the progression chain intact). */
function demoClickCommand(command) {
  let btn = btnContainer
    ? btnContainer.querySelector(`[data-command="${command}"]`)
    : null;
  // The guided one-clue-at-a-time flow reveals file cards one at a time, but the
  // demo walks a curated path (it skips ahead to finance/suspicious). Reveal the
  // needed command button on demand so the demo's "watch me click" fidelity is
  // preserved. Side effects stay isolated (suppressSave + resetMission teardown).
  if (!btn && btnContainer) {
    const key = m1KeyForCommand(command);
    if (key && !unlockedKeys.has(key)) {
      unlockButtons([key]);
      renderButtons();
      btn = btnContainer.querySelector(`[data-command="${command}"]`);
    }
  }
  // Milestone 35A — card clicks now only LOAD the command (the student
  // presses Enter to run). The watch-me demo must still auto-run, so it
  // types + runs directly instead of relying on the click handler.
  if (btn) {
    btn.classList.add("demo-press");
    demoWait(() => btn.classList.remove("demo-press"), 520);
  }
  typeCommandIntoTerminal(command, () => runCommand(command, m1KeyForCommand(command)));
}

/** Demo: simulate MANUAL typing — type into the entry with NO button, then
 *  run as a typed command (empty key, like a real keyboard entry). Use only
 *  for read-only commands that don't gate progression (e.g. pwd). */
function demoTypeCommand(command) {
  typeCommandIntoTerminal(command, () => runCommand(command, ""));
}

/** Begin the opt-in demo from the Mission Ready screen (M1 only). */
function startDemo() {
  if (demoRunning) return;
  if (missionStarted) return; // only run from a not-yet-started mission

  // Tear down the briefing overlay + any spotlight FIRST, while demoRunning is
  // still false — otherwise endGuidedRun()'s `if (demoRunning) abortDemo()`
  // guard would immediately self-cancel the demo we are about to start.
  igEnabled = false; // hold off the real spotlight so they never overlap
  endGuidedRun();

  // Now arm the demo.
  demoRunning = true;
  // Snapshot the trust score: resetMission() does NOT reset it, so we restore
  // it on teardown to keep the demo fully side-effect-neutral for the real run.
  demoTrustSnapshot = (typeof trustScore === "number") ? trustScore : DEFAULT_TRUST_SCORE;
  suppressSave = true; // nothing the demo does is persisted

  // Launch a clean Mission 1 dashboard so every real panel is on screen.
  beginMission();

  // Declutter the floating controls (focus bar + music toggle) that otherwise
  // overlap the demo coach's nav buttons in the bottom-right corner.
  document.body.classList.add("demo-active");

  // Auto-acknowledge the "Incoming Alert" modal, then show the FIRST step.
  // The demo is now MANUAL — the student drives it with Next / Back / Cancel.
  demoWait(() => {
    if (!demoRunning) return;
    const ack = document.getElementById("alertModalInvestigateBtn");
    if (ack) ack.click();
    demoMaxRun = -1;
    demoGo(0);
  }, 950);
}

/** Navigate to step `ix`. Forward navigation runs any not-yet-run real actions
 *  (terminal commands, pinning) ONCE; Back just re-points the pop-out without
 *  re-running side effects, since terminal output is cumulative and can't be
 *  cleanly undone. */
function demoGo(ix) {
  if (!demoRunning) return;
  ix = Math.max(0, Math.min(ix, DEMO_STEPS.length - 1));

  // Run actions for any newly-revealed steps (forward only, each exactly once).
  let ranAction = false;
  while (demoMaxRun < ix) {
    demoMaxRun += 1;
    const s = DEMO_STEPS[demoMaxRun];
    if (s && typeof s.action === "function") {
      try { s.action(); ranAction = true; } catch (_) { /* non-fatal in demo */ }
    }
  }

  demoStepIx = ix;
  clearDemoTimers(); // dedupe rapid clicks: drop any pending re-point render
  if (ranAction) {
    demoWait(() => { if (demoRunning) renderDemoStep(); }, DEMO_ACTION_DELAY_MS);
  } else {
    renderDemoStep();
  }
}

/** Advance one step, or finish the demo from the last step. */
function demoNext() {
  if (!demoRunning) return;
  if (demoStepIx >= DEMO_STEPS.length - 1) { endDemo(); return; }
  demoGo(demoStepIx + 1);
}

/** Step back one (no side effects re-run). No-op on the first step. */
function demoBack() {
  if (!demoRunning) return;
  if (demoStepIx <= 0) return;
  demoGo(demoStepIx - 1);
}

/** Render the pop-out for the current step. */
function renderDemoStep() {
  if (!demoRunning) return;
  const step = DEMO_STEPS[demoStepIx];
  if (!step) return;
  const target = typeof step.target === "function" ? step.target() : null;
  showDemoCoach(step, target, demoStepIx, DEMO_STEPS.length);
}

/** Render / move the demo pop-out near `target` (smooth CSS transition). */
function showDemoCoach(step, target, ix, total) {
  let dim = document.getElementById("demoDim");
  if (!dim) {
    dim = document.createElement("div");
    dim.id = "demoDim";
    dim.className = "ig-dim";
    document.body.appendChild(dim);
  }

  // Spotlight ring on the active, visible target only.
  document.querySelectorAll(".ig-spotlight-target")
    .forEach((el) => el.classList.remove("ig-spotlight-target"));
  const visible = target && target.offsetParent !== null;
  if (visible) {
    target.classList.add("ig-spotlight-target");
    try { target.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (_) {}
  }

  let tip = document.getElementById("demoCoach");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "demoCoach";
    tip.className = "ig-coach demo-coach";
    document.body.appendChild(tip);
  }
  const isFirst = ix === 0;
  const isLast  = ix === total - 1;
  tip.innerHTML =
    `<div class="demo-coach-head">` +
      `<span class="demo-coach-tag">● DEMO</span>` +
      `<span class="demo-coach-counter">Step ${ix + 1} of ${total}</span>` +
    `</div>` +
    `<p class="ig-coach-text demo-coach-text">${escapeHtml(step.text)}</p>` +
    `<div class="demo-coach-nav">` +
      `<button class="demo-coach-btn demo-coach-back" type="button"${isFirst ? " disabled" : ""}>← Back</button>` +
      `<button class="demo-coach-btn demo-coach-cancel" type="button">Cancel</button>` +
      `<button class="demo-coach-btn demo-coach-next" type="button">${isLast ? "Finish ✓" : "Next →"}</button>` +
    `</div>`;
  const backBtn   = tip.querySelector(".demo-coach-back");
  const cancelBtn = tip.querySelector(".demo-coach-cancel");
  const nextBtn   = tip.querySelector(".demo-coach-next");
  if (backBtn)   backBtn.addEventListener("click", demoBack);
  if (cancelBtn) cancelBtn.addEventListener("click", endDemo);
  if (nextBtn)   nextBtn.addEventListener("click", demoNext);

  positionDemoCoach(tip, visible ? target : null);
}

/** Place the pop-out near its target, or center it when there is none. */
function positionDemoCoach(tip, target) {
  if (target) { positionCoach(tip, target); return; }
  const tr = tip.getBoundingClientRect();
  const top  = Math.max(16, (window.innerHeight - tr.height) / 2);
  const left = Math.max(16, (window.innerWidth - tr.width) / 2);
  tip.style.top  = top + "px";
  tip.style.left = left + "px";
}

function teardownDemoCoach() {
  const dim = document.getElementById("demoDim");
  if (dim && dim.parentNode) dim.parentNode.removeChild(dim);
  const tip = document.getElementById("demoCoach");
  if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
  document.querySelectorAll(".ig-spotlight-target")
    .forEach((el) => el.classList.remove("ig-spotlight-target"));
}

/** Silent teardown of the demo: stop timers, remove the pop-out, wipe every
 *  side effect, and restore suppressSave/trust. Safe to call from ANY exit
 *  (navigation, reset, or endDemo) — re-entrant via the demoRunning guard.
 *  NOTE: resetMission() calls endGuidedRun() which calls abortDemo() again,
 *  but demoRunning is already false by then, so that nested call is a no-op. */
function abortDemo() {
  if (!demoRunning) return;
  demoRunning = false;
  demoMaxRun = -1;
  cancelTerminalTyping(); // drop any pending demo command typing
  clearDemoTimers();
  teardownDemoCoach();
  document.body.classList.remove("demo-active");

  // Wipe every demo side effect (terminal, pins, XP, evidence, alert, etc.).
  try { resetMission(); } catch (_) { /* non-fatal */ }
  // resetMission() does NOT reset trust — restore the pre-demo snapshot so the
  // demo's auto-classification never leaks into the real run.
  trustScore = clampTrust(demoTrustSnapshot);
  try { renderTrustScore(); } catch (_) {}

  suppressSave = false; // fail-safe: persistence can never stay stuck off
}

/** End the demo gracefully (skip / finish): tear everything down, then return
 *  the student to the Mission Ready screen so they can launch for real. */
function endDemo() {
  if (!demoRunning) return;
  abortDemo();

  // Re-open the guided "Mission Ready" screen so the student launches fresh.
  guidedState = { missionId: "mission-001", startFn: beginMission, step: 0, total: 0 };
  let overlay = document.getElementById("guidedOverlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "guidedOverlay";
    overlay.className = "guided-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    document.body.appendChild(overlay);
  }
  renderGuidedReady();
}

/* ============================================================
   Milestone 29A — Cyber Operations Center Spatial Layout
   Additive atmosphere on top of the existing 25E three-column
   workstation: a persistent operations strip, ambient operational
   updates, and subtle environmental reactions. No new gameplay
   systems and no progress changes — everything READS from existing
   state (threat / containment / incident). All helpers no-op safely
   before the strip exists (boot) and during the teaching demo.
   ============================================================ */
const OPS_DASHBOARDS = [
  { dashId: "dashboard", missionId: "mission-001" },
  { dashId: "mission2Dashboard", missionId: "mission-002" },
];

/** Build the compact operations strip for a dashboard. */
function buildOpsStrip(missionId) {
  const strip = document.createElement("div");
  strip.className = "ops-strip";
  strip.dataset.mission = missionId;
  strip.setAttribute("aria-hidden", "true");
  strip.innerHTML =
    '<span class="ops-chip ops-chip--team">' +
      '<span class="ops-chip-key">Blue Team</span>' +
      '<span class="ops-chip-val" data-ops="team">Active</span></span>' +
    '<span class="ops-chip">' +
      '<span class="ops-chip-key">Incident</span>' +
      '<span class="ops-chip-val" data-ops="incident">Investigating</span></span>' +
    '<span class="ops-chip">' +
      '<span class="ops-chip-key">Threat</span>' +
      '<span class="ops-chip-val" data-ops="threat">Medium</span></span>' +
    '<span class="ops-chip">' +
      '<span class="ops-chip-key">Containment</span>' +
      '<span class="ops-chip-val" data-ops="containment">None</span></span>' +
    '<span class="ops-chip ops-chip--ambient">' +
      '<span class="ops-chip-dot" aria-hidden="true"></span>' +
      '<span class="ops-chip-val" data-ops="ambient">Security monitoring online.</span></span>';
  return strip;
}

/** Inject one ops strip at the top of each dashboard grid (idempotent). */
function initOpsStrips() {
  OPS_DASHBOARDS.forEach(({ dashId, missionId }) => {
    const dash = document.getElementById(dashId);
    if (!dash || dash.querySelector(".ops-strip")) return;
    dash.insertBefore(buildOpsStrip(missionId), dash.firstChild);
  });
  updateAllOpsStrips();
}

/** Containment percentage → compact label + tint suffix. */
function opsContainmentLabel(val) {
  if (val >= 100) return { text: "Contained", cls: "full" };
  if (val > 0) return { text: "Partial " + val + "%", cls: "partial" };
  return { text: "None", cls: "none" };
}

/** Refresh ONE dashboard's ops strip from current mission state. No-op
 *  until the strip exists; safe to call during restore. */
function updateOpsStrip(missionId) {
  const mid = btMissionId(missionId);
  const dash = document.getElementById(mid === "mission-003" ? "mission3Dashboard" : mid === "mission-002" ? "mission2Dashboard" : "dashboard");
  const strip = dash && dash.querySelector(".ops-strip");
  if (!strip) return;

  const threat = (getThreatLevel(mid) || "Medium");
  const tEl = strip.querySelector('[data-ops="threat"]');
  if (tEl) {
    tEl.textContent = threat;
    tEl.className = "ops-chip-val ops-chip-val--threat-" + threat.toLowerCase();
  }

  const cVal = (blueTeamContainment && blueTeamContainment[mid]) || 0;
  const c = opsContainmentLabel(cVal);
  const cEl = strip.querySelector('[data-ops="containment"]');
  if (cEl) {
    cEl.textContent = c.text;
    cEl.className = "ops-chip-val ops-chip-val--contain-" + c.cls;
  }

  const incSrc = btDom(mid, "incident");
  const incEl = strip.querySelector('[data-ops="incident"]');
  if (incEl) {
    incEl.textContent = (incSrc && incSrc.textContent && incSrc.textContent.trim()) || "Investigating";
  }

  // Milestone 30A — keep the RED TEAM ACTIVITY panel in sync with the same state.
  try { updateRedTeamActivity(mid); } catch (_) { /* 30A — non-fatal */ }
}

function updateAllOpsStrips() {
  updateOpsStrip("mission-001");
  updateOpsStrip("mission-002");
}

/* ---- Ambient operational updates (one rotating compact line) -------- */
const AMBIENT_OPS_INTERVAL_MS = 22000;
const AMBIENT_OPS_LINES = [
  "Security monitoring online.",
  "Email gateway filtering suspicious traffic.",
  "Endpoint sensors reporting normal baseline.",
  "Network telemetry streaming to the SOC.",
  "Firewall rules synced across segments.",
  "Threat-intel feed updated.",
  "Log pipeline healthy.",
  "Identity provider sessions nominal.",
  // Milestone 30A — additional environmental operational updates.
  "Email filtering rules updating.",
  "Security monitoring elevated.",
  "SOC analysts reviewing outbound traffic.",
  "Finance department notified of phishing risk.",
];
let ambientOpsTimer = null;
let ambientOpsIndex = 0;

function setAmbientLine(text) {
  document.querySelectorAll(".ops-chip--ambient").forEach((chip) => {
    const val = chip.querySelector('[data-ops="ambient"]');
    if (!val) return;
    chip.classList.add("ops-ambient-swap");
    window.setTimeout(() => {
      val.textContent = text;
      chip.classList.remove("ops-ambient-swap");
    }, 380);
  });
}

function scheduleAmbientOps() {
  ambientOpsTimer = window.setTimeout(() => {
    ambientOpsIndex = (ambientOpsIndex + 1) % AMBIENT_OPS_LINES.length;
    setAmbientLine(AMBIENT_OPS_LINES[ambientOpsIndex]);
    scheduleAmbientOps();
  }, AMBIENT_OPS_INTERVAL_MS);
}

function startAmbientOps() {
  if (ambientOpsTimer || demoRunning) return;
  scheduleAmbientOps();
}

function stopAmbientOps() {
  if (ambientOpsTimer) { clearTimeout(ambientOpsTimer); ambientOpsTimer = null; }
}

/* ---- Environmental density reactions (transient region cues) -------- */
function opsRegionEl(missionId, selector) {
  const dash = document.getElementById(missionId === "mission-003" ? "mission3Dashboard" : missionId === "mission-002" ? "mission2Dashboard" : "dashboard");
  return dash ? dash.querySelector(selector) : null;
}

function flashRegion(el, cls, ms) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart the animation
  el.classList.add(cls);
  window.setTimeout(() => el.classList.remove(cls), ms);
}

/** Right column (Live Intelligence) reacts to adversary pressure. */
function pulseIntelRegion(missionId) {
  if (demoRunning) return;
  flashRegion(opsRegionEl(btMissionId(missionId), ".xp-panel"), "region--intel-pulse", 1400);
}

/** Left column (Mission Operations) celebrates a contained incident. */
function glowOpsRegion(missionId) {
  flashRegion(opsRegionEl(btMissionId(missionId), ".mission-panel"), "region--ops-glow", 1700);
}

/** Strip lingering atmosphere classes (mission exit / teardown). */
function clearOpsAtmosphere() {
  document.querySelectorAll(".region--intel-pulse").forEach((el) => el.classList.remove("region--intel-pulse"));
  document.querySelectorAll(".region--ops-glow").forEach((el) => el.classList.remove("region--ops-glow"));
}

/* ============================================================
   Milestone 30A — Persistent Adversary Presence
   Makes the Red Team feel like a continuously active, adapting
   opposing force instead of occasional scripted events. ADDITIVE on
   top of the existing Stage 2/3 Blue Team + Escalation engines and the
   29A operations center — NO backend / AI / new progress system.
   The panel's resting STATE and the gradually-revealed "Possible
   Adversary Goal" chips are DERIVED from existing, already-persisted
   state (threat / containment / credited steps / red-active), so
   nothing new needs saving or restoring. Only a transient "movement"
   flavor line lives in memory. Every helper no-ops safely before the
   panel exists (boot / restore) and during the teaching demo.
   ============================================================ */
const RED_TEAM_PANELS = [
  { panelId: "redTeamPanel",   anchorId: "threatMeter",   missionId: "mission-001" },
  { panelId: "m2RedTeamPanel", anchorId: "m2ThreatMeter", missionId: "mission-002" },
];

// Six operational states (task spec). tone drives the subtle red identity.
const RED_TEAM_STATES = {
  recon:      { label: "Recon Activity Detected",       tone: "watch"  },
  harvest:    { label: "Credential Harvesting Attempt", tone: "warn"   },
  outbound:   { label: "Suspicious Outbound Traffic",   tone: "warn"   },
  expanding:  { label: "Threat Expanding",              tone: "danger" },
  pressure:   { label: "Containment Pressure Rising",   tone: "danger" },
  stabilized: { label: "Activity Stabilized",           tone: "calm"   },
};

// Revealed gradually (one per credited containment step) — never dumped at once.
const ADVERSARY_GOALS = [
  "Internal Reconnaissance",
  "Credential Theft",
  "Phishing Expansion",
  "Unauthorized Access",
];

// Background "alive" movement lines, rotated on the ambient red-team beat.
const RED_TEAM_MOVEMENT_LINES = [
  "Probing alternate employee accounts.",
  "Testing reused credentials against remote access.",
  "Scanning internal shares for sensitive files.",
  "Attempting to escalate access quietly.",
  "Rotating through phishing payloads.",
];

// Adaptation reactions to Blue Team decisions (task spec examples).
const RED_TEAM_ADAPT = {
  escalate:  "Suspicious activity shifting to an alternate employee account.",
  contained: "Threat activity partially stabilized.",
};

/* Milestone 31A — Mission 2 (Network Exposure) Red Team flavor. Same derived
   state machine as Mission 1, but network-themed labels/goals/movement so the
   adversary panel reads as a network intrusion rather than phishing. */
const RED_TEAM_STATES_M2 = {
  recon:      { label: "Network Recon Detected",        tone: "watch"  },
  harvest:    { label: "External Probing Observed",     tone: "warn"   },
  outbound:   { label: "Service Enumeration Underway",  tone: "warn"   },
  expanding:  { label: "Exposed Services Targeted",     tone: "danger" },
  pressure:   { label: "Attack Surface Pressure Rising",tone: "danger" },
  stabilized: { label: "Activity Stabilized",           tone: "calm"   },
};
const ADVERSARY_GOALS_M2 = [
  "Service Enumeration",
  "Misconfiguration Discovery",
  "Initial Access Preparation",
];
const RED_TEAM_MOVEMENT_LINES_M2 = [
  "Sweeping the host for additional open ports.",
  "Fingerprinting exposed service versions.",
  "Probing the web service for weak configuration.",
  "Testing SSH for default or reused credentials.",
  "Mapping reachable hosts on the subnet.",
];

/* Assignment 3 (Reconnaissance Detection) Red Team flavor — same derived state
   machine, recon-themed labels so the adversary panel reads as early-stage
   information gathering from an unknown external source. */
const RED_TEAM_STATES_M3 = {
  recon:      { label: "External Recon Detected",       tone: "watch"  },
  harvest:    { label: "Unknown Source Probing",        tone: "warn"   },
  outbound:   { label: "Service Scanning Underway",     tone: "warn"   },
  expanding:  { label: "Probe Pattern Widening",        tone: "danger" },
  pressure:   { label: "Reconnaissance Pressure Rising",tone: "danger" },
  stabilized: { label: "Activity Stabilized",           tone: "calm"   },
};
const ADVERSARY_GOALS_M3 = [
  "Network Mapping",
  "Service Discovery",
  "Vulnerability Identification",
];
const RED_TEAM_MOVEMENT_LINES_M3 = [
  "Probing SSH on internal hosts.",
  "Testing the web service for responses.",
  "Enumerating exposed database ports.",
  "Repeating connections from an unknown source.",
  "Cataloguing which services answer.",
];

// Transient only — NOT persisted (resting state + goals are derived on render).
const adversaryMovement = { "mission-001": "", "mission-002": "", "mission-003": "" };
let redTeamMoveIndex = 0;

function redTeamPanelEl(missionId) {
  const mid = btMissionId(missionId);
  return document.getElementById(mid === "mission-003" ? "m3RedTeamPanel" : mid === "mission-002" ? "m2RedTeamPanel" : "redTeamPanel");
}

/** Build the compact RED TEAM ACTIVITY panel (injected into .live-status). */
function buildRedTeamPanel(missionId, panelId) {
  const panel = document.createElement("div");
  panel.className = "red-team-panel red-team-panel--watch";
  panel.id = panelId;
  panel.dataset.mission = missionId;
  panel.innerHTML =
    '<div class="rt-head">' +
      '<span class="rt-icon" aria-hidden="true">⚠</span>' +
      '<span class="rt-title">Red Team Activity</span>' +
      '<span class="rt-dot" aria-hidden="true"></span>' +
    '</div>' +
    '<div class="rt-state" data-rt="state">Recon Activity Detected</div>' +
    '<div class="rt-movement" data-rt="movement" style="display:none;"></div>' +
    '<div class="rt-goals" style="display:none;">' +
      '<span class="rt-goals-label">Possible Adversary Goal</span>' +
      '<div class="rt-goals-list" data-rt="goals"></div>' +
    '</div>';
  return panel;
}

/** Inject one panel above the threat meter in each Live Status column (idempotent). */
function initRedTeamPanels() {
  RED_TEAM_PANELS.forEach(({ panelId, anchorId, missionId }) => {
    if (document.getElementById(panelId)) return;
    const anchor = document.getElementById(anchorId);
    const live = anchor && anchor.closest(".live-status");
    if (!live) return;
    live.insertBefore(buildRedTeamPanel(missionId, panelId), anchor);
  });
  updateAllAdversaryStatus();
}

/** Resting Red Team state, DERIVED from existing mission state. */
function computeRedTeamState(missionId) {
  const mid = btMissionId(missionId);
  const complete = mid === "mission-003" ? mission3Complete : mid === "mission-002" ? mission2Complete : missionComplete;
  const contain  = (blueTeamContainment && blueTeamContainment[mid]) || 0;
  if (complete || contain >= 60) return "stabilized";
  const threat   = getThreatLevel(mid);
  const pressure = (incidentPressure && incidentPressure[mid]) || 0;
  const red      = !!(blueTeamRedActive && blueTeamRedActive[mid]);
  if (threat === "Critical") return "pressure";
  if (threat === "High")     return "expanding";
  if (pressure >= 30)        return "outbound";
  if (red)                   return "harvest";
  if (threat === "Medium" && pressure > 0) return "outbound";
  return "recon";
}

/* Milestone 31A — pick the Red Team flavor set per mission. Mission 2 reads as
   a network intrusion; Mission 1 keeps the original phishing flavor. */
function redTeamStatesFor(mid)   { return mid === "mission-003" ? RED_TEAM_STATES_M3 : mid === "mission-002" ? RED_TEAM_STATES_M2 : RED_TEAM_STATES; }
function adversaryGoalsFor(mid)   { return mid === "mission-003" ? ADVERSARY_GOALS_M3 : mid === "mission-002" ? ADVERSARY_GOALS_M2 : ADVERSARY_GOALS; }
function redTeamMovementFor(mid)  { return mid === "mission-003" ? RED_TEAM_MOVEMENT_LINES_M3 : mid === "mission-002" ? RED_TEAM_MOVEMENT_LINES_M2 : RED_TEAM_MOVEMENT_LINES; }

/** How many adversary goals have been uncovered (gradual, via real progress). */
function adversaryGoalsRevealed(missionId) {
  const mid = btMissionId(missionId);
  const goals = adversaryGoalsFor(mid);
  const complete = mid === "mission-003" ? mission3Complete : mid === "mission-002" ? mission2Complete : missionComplete;
  if (complete) return goals.length;
  let n = (blueTeamSteps && blueTeamSteps[mid]) ? blueTeamSteps[mid].size : 0;
  if (n < 1 && blueTeamRedActive && blueTeamRedActive[mid]) n = 1;
  return Math.max(0, Math.min(goals.length, n));
}

/** Render the compact panel from derived state + the transient movement line.
 *  No-ops safely until the panel has been injected (boot / restore). */
function renderAdversaryStatus(missionId) {
  const mid = btMissionId(missionId);
  const panel = redTeamPanelEl(mid);
  if (!panel) return;

  const states = redTeamStatesFor(mid);
  const stId = computeRedTeamState(mid);
  const st = states[stId] || states.recon;
  panel.className = "red-team-panel red-team-panel--" + st.tone;

  const stEl = panel.querySelector('[data-rt="state"]');
  if (stEl) stEl.textContent = st.label;

  const mvEl = panel.querySelector('[data-rt="movement"]');
  if (mvEl) {
    let mv = adversaryMovement[mid] || "";
    if (stId === "stabilized") mv = "Threat activity stabilizing under containment.";
    mvEl.textContent = mv;
    mvEl.style.display = mv ? "" : "none";
  }

  const goalsWrap = panel.querySelector(".rt-goals");
  const goalsEl = panel.querySelector('[data-rt="goals"]');
  const n = adversaryGoalsRevealed(mid);
  if (goalsWrap && goalsEl) {
    if (n <= 0) {
      goalsWrap.style.display = "none";
    } else {
      goalsWrap.style.display = "";
      goalsEl.innerHTML = "";
      adversaryGoalsFor(mid).slice(0, n).forEach((g) => {
        const chip = document.createElement("span");
        chip.className = "rt-goal-chip";
        chip.textContent = g;
        goalsEl.appendChild(chip);
      });
    }
  }
}

/** Public API alias — recompute one mission's derived adversary status. */
function updateRedTeamActivity(missionId) { renderAdversaryStatus(missionId); }
function updateAllAdversaryStatus() {
  renderAdversaryStatus("mission-001");
  renderAdversaryStatus("mission-002");
}

/** Subtle red identity pulse on the panel (alert vs calm tone). */
function pulseRedTeamPanel(missionId, kind) {
  const panel = redTeamPanelEl(missionId);
  if (!panel) return;
  const cls = kind === "calm" ? "red-team-panel--calm-pulse" : "red-team-panel--pulse";
  panel.classList.remove("red-team-panel--pulse", "red-team-panel--calm-pulse");
  void panel.offsetWidth; // restart the animation
  panel.classList.add(cls);
  window.setTimeout(() => panel.classList.remove(cls), 1500);
}

/** Neighboring mission nodes subtly react when the adversary moves. */
function flashAdversaryMapReaction() {
  const nodes = document.querySelectorAll(
    "#m1MiniMap .mini-node, #m2MiniMap .mini-node, .mission-node"
  );
  nodes.forEach((node) => {
    node.classList.remove("node--adversary-react");
    void node.offsetWidth;
    node.classList.add("node--adversary-react");
    window.setTimeout(() => node.classList.remove("node--adversary-react"), 1500);
  });
}

/** A background "alive" beat — rotate a movement line + pulse + refresh. */
function triggerRedTeamMovement(missionId) {
  if (demoRunning) return;
  if (!document.body.classList.contains("mission-running")) return;
  const mid = btMissionId(missionId || getActiveMissionId());
  const complete = mid === "mission-003" ? mission3Complete : mid === "mission-002" ? mission2Complete : missionComplete;
  if (complete) return;
  const moves = redTeamMovementFor(mid);
  adversaryMovement[mid] = moves[redTeamMoveIndex % moves.length];
  redTeamMoveIndex++;
  renderAdversaryStatus(mid);
  pulseRedTeamPanel(mid, "alert");
}

/** Red Team ADAPTS to a Blue Team decision (escalation / containment). */
function adaptRedTeam(missionId, kind) {
  if (demoRunning) return;
  const mid = btMissionId(missionId);
  const line = RED_TEAM_ADAPT[kind];
  if (!line) return;
  adversaryMovement[mid] = line;
  renderAdversaryStatus(mid);
  pulseRedTeamPanel(mid, kind === "contained" ? "calm" : "alert");
  if (kind !== "contained") flashAdversaryMapReaction();
}

/** Clear transient adversary flavor on mission reset (state is derived). */
function resetAdversaryPresence(missionId) {
  const mid = btMissionId(missionId);
  if (adversaryMovement) adversaryMovement[mid] = "";
  renderAdversaryStatus(mid);
}

/* ---- Continuous red-team beat (cancel-safe; torn down on mission exit) ---- */
const RED_TEAM_MOVE_INTERVAL_MS = 30000;
let redTeamMoveTimer = null;

function scheduleRedTeamMovement() {
  redTeamMoveTimer = window.setTimeout(() => {
    triggerRedTeamMovement();
    scheduleRedTeamMovement();
  }, RED_TEAM_MOVE_INTERVAL_MS);
}
function startRedTeamMovement() {
  if (redTeamMoveTimer || demoRunning) return;
  scheduleRedTeamMovement();
}
function stopRedTeamMovement() {
  if (redTeamMoveTimer) { clearTimeout(redTeamMoveTimer); redTeamMoveTimer = null; }
}

document.addEventListener("DOMContentLoaded", boot);
