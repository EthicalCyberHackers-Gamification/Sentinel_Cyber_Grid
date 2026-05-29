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
const m1ConfidenceContributors = new Set();
const m2ConfidenceContributors = new Set();

// Challenge Layer 1 — Mission 1 investigation tracking (for the scorecard).
const m1FilesReviewed     = new Set();
const m1FalseLeadsChecked = new Set();
let   m1BonusFound        = false;
let   m1ProgressiveHintIx = 0;

const M1_PROGRESSIVE_HINTS = [
  "Not every file is suspicious. Review files carefully.",
  "Company policy may help you judge whether a file is dangerous.",
  "Look for a file asking for sensitive information.",
];

/** Returns the live confidence value for a mission. */
function getConfidence(missionId) {
  return missionId === "mission-002" ? m2Confidence : m1Confidence;
}

/** Add a one-time confidence contribution for a mission. */
function addConfidence(missionId, contributorKey, amount) {
  const set = missionId === "mission-002"
    ? m2ConfidenceContributors
    : m1ConfidenceContributors;
  if (set.has(contributorKey)) return;
  set.add(contributorKey);
  if (missionId === "mission-002") {
    m2Confidence = Math.min(CONFIDENCE_CAP, m2Confidence + amount);
  } else {
    m1Confidence = Math.min(CONFIDENCE_CAP, m1Confidence + amount);
  }
  renderConfidenceMeter(missionId);
}

/** Render the "Evidence Confidence" meter for the given mission id. */
function renderConfidenceMeter(missionId) {
  const mid    = missionId || getActiveMissionId();
  const hostId = mid === "mission-002" ? "m2ConfidenceMeter" : "confidenceMeter";
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
    "nmap":     { title: "Open Services (SSH / HTTP / HTTPS)", correct: "critical" },
  },
};

// Pinned findings per mission: key -> { title, level, levelLabel, correct, useful, critical }
const investigationPins = {
  "mission-001": {},
  "mission-002": {},
};
// Findings reviewed and therefore available to pin (key set per mission).
const pinnableFindings = {
  "mission-001": new Set(),
  "mission-002": new Set(),
};
// One-time XP guard keyed by `${missionId}:${key}` so re-classifying can't farm XP.
const pinXpAwarded = new Set();

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

/** Recompute a mission's Evidence Confidence purely from pinned findings. */
function recomputeConfidenceFromPins(missionId) {
  const pins = investigationPins[missionId] || {};
  let total = 0;
  Object.keys(pins).forEach((key) => {
    total += pinConfidenceAmount(pins[key].correct, pins[key].level);
  });
  total = Math.max(0, Math.min(CONFIDENCE_CAP, total));
  if (missionId === "mission-002") m2Confidence = total;
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
  return missionId === "mission-002" ? "m2PinPanel" : "pinPanel";
}
/** DOM host id for a mission's Investigation Board. */
function boardHostId(missionId) {
  return missionId === "mission-002" ? "m2InvestigationBoard" : "investigationBoard";
}

/** Set the supervisor message for the active mission using raw text. */
function setManagerText(missionId, text) {
  // Milestone 25A — route through the supervisor chat feed.
  pushManagerMessage(missionId === "mission-002" ? "mission-002" : "mission-001", text);
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
  if (btn) btn.addEventListener("click", () => showClassificationPrompt(missionId, key));

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
  host.innerHTML = `
    <div class="classify-panel">
      <p class="classify-title">How suspicious is this evidence?</p>
      <p class="classify-subject">${escapeHtml(rating.title)}</p>
      <div class="classify-options">${opts}</div>
    </div>
  `;
  host.querySelectorAll(".classify-btn").forEach((btn) => {
    btn.addEventListener("click", () =>
      handlePinClassification(missionId, key, btn.getAttribute("data-level"))
    );
  });
}

/** Commit a pin + classification, apply effects, react, and re-render. */
function handlePinClassification(missionId, key, level) {
  const rating = EVIDENCE_RATINGS[missionId] && EVIDENCE_RATINGS[missionId][key];
  const meta   = SUSPICION_LEVELS[level];
  if (!rating || !meta) return;

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
  if (missionId === "mission-002") {
    addConfidence("mission-002", `pin-${key}`, pinConfidenceAmount(correct, level));
  } else {
    recomputeConfidenceFromPins("mission-001");
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
  if (correct) fxToast("Evidence Added", "success");
  else fxToast("Re-check priority", "caution");

  // Mission 1 gate: correctly tagging the suspicious file as Critical
  // is what unlocks the escalation / finding flow.
  if (missionId === "mission-001" && key === "suspicious_file.txt") {
    if (correct) {
      setThreatLevel("High", "mission-001");
      updateManagerReaction("threat_increased", { missionId: "mission-001" });
      setTimeout(() => {
        if (decisionAdvanced["mission-001"]) showFindingPanel();
        else showDecisionActions("mission-001");
      }, 800);
    } else {
      setHint("You have not identified the primary threat evidence yet.", "warning");
    }
  }

  // Refresh the pin action area: clear when correct, otherwise offer a
  // re-classification, then surface any remaining pending finding.
  const host = document.getElementById(pinHostId(missionId));
  if (host) {
    if (correct) { host.innerHTML = ""; host.style.display = "none"; showNextPinnable(missionId); }
    else { showPinPrompt(missionId, key); }
  }

  try { saveProgress(); } catch (_) { /* non-fatal */ }
}

/** Scripted supervisor reaction text for a pin. */
function pinReactionText(missionId, key, level, correct) {
  if (!correct) {
    return "This appears to be normal business activity. Focus on evidence involving credentials, external communication, or policy violations.";
  }
  if (missionId === "mission-001") {
    if (key === "suspicious_file.txt") return "Excellent. Requests for passwords through unknown email channels are a major phishing indicator.";
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
};

// Reviewed-card ids per mission, and a one-time XP guard per mission.
const briefingReviewed = {
  "mission-001": new Set(),
  "mission-002": new Set(),
};
const briefingXpAwarded = new Set();

/** DOM host id for a mission's Briefing Room. */
function briefingHostId(missionId) {
  return missionId === "mission-002" ? "m2BriefingRoom" : "briefingRoom";
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
      <h3 class="briefing-room-title">Mission Briefing Room</h3>
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
  } else {
    const btn = document.getElementById("beginMissionBtn");
    // Only gate the fresh-start ("begin") CTA — returning students on the
    // "continue" path bypass the briefing room entirely.
    if (btn && btn.getAttribute("data-mode") !== "continue") {
      btn.classList.toggle("begin-locked", !complete);
      btn.innerHTML = complete
        ? "\u25B6&nbsp; Begin Investigation"
        : "\u25B6&nbsp; Begin Investigation \uD83D\uDD12";
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
  const hostId = mid === "mission-002" ? "m2EvidencePanel" : "evidencePanel";
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
    fxFlash(document.getElementById(mid === "mission-002" ? "m2ToolsPanel" : "toolsPanel"), "fx-glow", 1100);
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
  const xp = missionId === "mission-002"
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
        </li>`;
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
  const hostId = mid === "mission-002" ? "m2ToolsPanel" : "toolsPanel";
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
  threatLevelByMission[mid] = level;
  renderThreatLevel(mid);
  fxPulseThreat(mid); // Milestone 25A — pulse the threat meter on change.
  try { saveProgress(); } catch (_) { /* save errors are non-fatal */ }
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
  const hostId = mid === "mission-002" ? "m2ThreatMeter" : "threatMeter";
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
  /* ---------- Mission 1 ---------- */
  "m1-escalate": {
    missionId: "mission-001",
    label:     "Escalate to Manager",
    kind:      "correct",
    trustDelta: +10,
    threatLevel: "Medium",
    managerMsg: "Good decision. You escalated the suspicious password request with evidence.",
    consequence: "Manager briefed; investigation continues with leadership aware of the phishing attempt.",
    advance: true,
  },
  "m1-ignore": {
    missionId: "mission-001",
    label:     "Ignore Alert",
    kind:      "poor",
    trustDelta: -10,
    threatLevel: "Critical",
    managerMsg: "Ignoring a suspicious password request can allow account compromise. Review the evidence.",
    consequence: "Manager flagged the dismissal as risky. Try a safer action before continuing.",
    advance: false,
  },
  "m1-continue": {
    missionId: "mission-001",
    label:     "Continue Investigation",
    kind:      "acceptable",
    trustDelta: 0,
    threatLevel: "High",
    managerMsg: "Continue investigating, but prepare to report the suspicious finding.",
    consequence: "Investigation continues; the suspicious finding will be reported soon.",
    advance: true,
  },

  /* ---------- Mission 2 ---------- */
  "m2-recommend": {
    missionId: "mission-002",
    label:     "Recommend Security Review",
    kind:      "correct",
    trustDelta: +10,
    threatLevel: "Medium",
    managerMsg: "Good recommendation. Exposed services should be reviewed for secure configuration.",
    consequence: "Security review queued for the exposed services.",
    advance: true,
  },
  "m2-ignore": {
    missionId: "mission-002",
    label:     "Ignore Open Services",
    kind:      "poor",
    trustDelta: -10,
    threatLevel: "High",
    managerMsg: "Open services should not be ignored. They increase attack surface if poorly secured.",
    consequence: "Manager flagged the dismissal as risky. Try a safer action before continuing.",
    advance: false,
  },
  "m2-continue": {
    missionId: "mission-002",
    label:     "Continue Investigation",
    kind:      "acceptable",
    trustDelta: 0,
    threatLevel: "Medium",
    managerMsg: "Continue reviewing the network findings before finalizing your report.",
    consequence: "Investigation continues; report will follow once findings are confirmed.",
    advance: true,
  },
};

/** Final committed decision per mission (the one that advanced the flow). */
let decisionTaken = {};      // { "mission-001": "m1-escalate", ... }
/** Has the decision flow advanced for this mission? (gates re-show) */
let decisionAdvanced = {};   // { "mission-001": true, ... }

/** Map missionId → host DOM id for the decision panel. */
function decisionHostId(missionId) {
  return missionId === "mission-002" ? "m2DecisionActions" : "decisionActions";
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

  host.style.display = "";
  host.innerHTML = `
    <div class="decision-panel" data-mission="${missionId}">
      <div class="decision-header">
        <span class="decision-label">Decision Actions</span>
        <span class="decision-badge">Choose carefully</span>
      </div>
      <p class="decision-question">
        Evidence is in. What's your next move?
      </p>
      <div class="decision-buttons">
        ${actions.map(([id, def]) => `
          <button class="decision-btn decision-btn--${def.kind}"
                  type="button"
                  data-decision="${id}">
            ${escapeHtml(def.label)}
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
  pushManagerMessage(def.missionId === "mission-002" ? "mission-002" : "mission-001", def.managerMsg);

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

  const host = document.getElementById(decisionHostId(def.missionId));
  if (!host) return;

  // Idempotency — if this specific button has already been clicked,
  // don't re-apply its consequence.
  const btn = host.querySelector(`.decision-btn[data-decision="${actionId}"]`);
  if (btn && btn.disabled) return;

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
    }

    try { saveProgress(); } catch (_) { /* non-fatal */ }

    // Brief pause so the student reads the feedback, then advance.
    setTimeout(() => {
      hideDecisionActions(def.missionId);
      if (def.missionId === "mission-002") {
        renderM2AnalystReview();
      } else {
        showFindingPanel();
      }
    }, 1100);
  } else {
    // Poor action — persist trust/threat changes; do NOT advance.
    try { saveProgress(); } catch (_) { /* non-fatal */ }
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
};

/** Per-mission alert objects: { title, message, severity, state }. */
let alertByMission = {};

/** Map missionId → DOM host id for the Alert Center panel. */
function alertHostId(missionId) {
  return missionId === "mission-002" ? "m2AlertCenter" : "alertCenter";
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
      m1ConfidenceContributors: Array.from(m1ConfidenceContributors),
      m2ConfidenceContributors: Array.from(m2ConfidenceContributors),
      m1FilesReviewed:     Array.from(m1FilesReviewed),
      m1FalseLeadsChecked: Array.from(m1FalseLeadsChecked),
      m1BonusFound,
      // Investigation Board — persist pins + pinnable findings + XP guards.
      investigationPins: (typeof investigationPins === "object" && investigationPins) ? investigationPins : {},
      pinnableFindings: {
        "mission-001": Array.from(pinnableFindings["mission-001"]),
        "mission-002": Array.from(pinnableFindings["mission-002"]),
      },
      pinXpAwarded: Array.from(pinXpAwarded),
      // Milestone 24I — persist Briefing Room state + one-time XP guard.
      briefingReviewed: {
        "mission-001": Array.from(briefingReviewed["mission-001"]),
        "mission-002": Array.from(briefingReviewed["mission-002"]),
      },
      briefingXpAwarded: Array.from(briefingXpAwarded),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    updateSaveIndicator(true);
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

  // 6. Milestone 24A — restore evidence collected during prior sessions.
  //    Filtered to known mission ids so a corrupted/older save can't
  //    inject arbitrary keys into evidenceLog.
  if (data.evidence && typeof data.evidence === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
      const arr = data.evidence[mid];
      if (Array.isArray(arr)) {
        evidenceLog[mid] = arr
          .filter((e) => e && typeof e.id === "string" && typeof e.text === "string")
          .map((e) => ({ id: e.id, text: e.text, at: e.at || Date.now() }));
      }
    });
    renderEvidencePanel("mission-001");
    renderEvidencePanel("mission-002");
  }

  // 7. Milestone 24B — restore threat levels (validated against THREAT_LEVELS).
  if (data.threatLevels && typeof data.threatLevels === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
      const lvl = data.threatLevels[mid];
      if (isValidThreatLevel(lvl)) threatLevelByMission[mid] = lvl;
    });
    renderThreatLevel("mission-001");
    renderThreatLevel("mission-002");
  }

  // 8. Milestone 24C — restore trust score (clamped to 0–100).
  if (typeof data.trustScore === "number" && isFinite(data.trustScore)) {
    trustScore = clampTrust(data.trustScore);
  }
  renderTrustScore();

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
    ["mission-001", "mission-002"].forEach((mid) => {
      if (data.decisionAdvanced[mid] === true) decisionAdvanced[mid] = true;
    });
  }

  // 10. Milestone 24E — restore alert state per mission. Only known
  //     mission ids and known alert states are accepted; everything
  //     else is ignored so corrupt storage cannot crash the loop.
  alertByMission = {};
  if (data.alertByMission && typeof data.alertByMission === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
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

  // Investigation Board — restore pins, pinnable findings, and XP guards.
  investigationPins["mission-001"] = {};
  investigationPins["mission-002"] = {};
  if (data.investigationPins && typeof data.investigationPins === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
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
  if (data.pinnableFindings && typeof data.pinnableFindings === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
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
  // Milestone 24I — restore Briefing Room state + one-time XP guard.
  briefingReviewed["mission-001"].clear();
  briefingReviewed["mission-002"].clear();
  if (data.briefingReviewed && typeof data.briefingReviewed === "object") {
    ["mission-001", "mission-002"].forEach((mid) => {
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
  renderBriefingRoom("mission-001");
  renderBriefingRoom("mission-002");
  // Mission 1 confidence is pin-driven — recompute it as the source of truth.
  recomputeConfidenceFromPins("mission-001");
  renderConfidenceMeter("mission-002");
  renderInvestigationBoard("mission-001");
  renderInvestigationBoard("mission-002");

  updateSaveIndicator(true);
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
  missionComplete:      "Mission complete. You identified a phishing attempt and reported it properly.",
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
    mission_completed: "Mission complete. You identified and reported a possible phishing attempt.",
  },
  "mission-002": {
    mission_started:   "Start by identifying your network position, then check whether the target host is reachable.",
    evidence_found:    "Good. Exposed services are important evidence during network review.",
    threat_increased:  "Multiple exposed services increase the attack surface if they are poorly secured.",
    decision_correct:  "Good recommendation. Security review is the right next step.",
    decision_poor:     "Open services should not be ignored. They require proper review.",
    decision_neutral:  "Continue the investigation until your recommendation is supported by evidence.",
    quiz_correct:      "You understand that open services can accept network connections and require assessment.",
    quiz_incorrect:    "Review the scan output again. Focus on what the open service list means.",
    mission_completed: "Mission complete. You identified exposed services and recommended review.",
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
  awaiting:             "Read the briefing, then click Begin Mission.",
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
const SIM_BOOT_LINES = [
  "Initializing CyberCorp training environment...",
  "Loading student profile...",
  "Starting simulated workstation...",
  "Mounting /home/student directory...",
  "Loading mission files...",
  "Checking terminal command system...",
  "Activating phishing detection scenario...",
  "Connecting analyst dashboard...",
  "Simulation ready.",
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

function printCommand(command) {
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
  scrollTerminal();
}

function printBlankLine() {
  const line = document.createElement("div");
  line.className = "terminal-line";
  line.innerHTML = "&nbsp;";
  terminalOutput.appendChild(line);
  scrollTerminal();
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
  printBlankLine();
  scrollTerminal();
}

function clearTerminal() {
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
  m1FilesReviewed.add(name);

  if (name === "meeting_schedule.txt" || name === "finance_update.txt") {
    m1FalseLeadsChecked.add(name);
  }
  if (name === "security_policy.txt") {
    // Reviewing the policy still counts as locating the bonus reference; the
    // student is rewarded once they correctly pin it as supporting evidence.
    m1BonusFound = true;
  }

  // Evidence Prioritization — reading a file no longer auto-confirms a
  // finding or auto-advances the mission. Instead, the student is offered
  // the choice to PIN it to the Investigation Board and CLASSIFY how
  // suspicious it is. Confidence/trust/decisions flow from that judgement.
  if (EVIDENCE_RATINGS["mission-001"][name]) {
    showPinPrompt("mission-001", name);
  }
}

function processCommand(command, buttonKey) {
  const cmd     = command.trim().toLowerCase();
  const dirData = FILESYSTEM[currentDir];

  // pwd
  if (cmd === "pwd") {
    printOutput(dirData.pwd);
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // ls
  if (cmd === "ls") {
    printOutput(dirData.ls.join("  "));
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // cd <folder>
  if (cmd.startsWith("cd ")) {
    const target     = cmd.slice(3).trim();
    const newPath    = `${currentDir}/${target}`;
    const normalised = newPath.replace("~//", "~/");

    if (dirData.subdirs.includes(target) && FILESYSTEM[normalised]) {
      currentDir = normalised;
      updatePromptDisplay();
      printBlankLine();
      afterCommand(buttonKey);
    } else {
      printOutput(`bash: cd: ${target}: No such file or directory`, "error");
      printBlankLine();
    }
    return;
  }

  // cat <filename>
  if (cmd.startsWith("cat ")) {
    const filename = command.trim().slice(4).trim();
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
    } else {
      printOutput(
        `cat: ${filename}: Access denied: file not found in current location.`,
        "error"
      );
    }
    printBlankLine();
    afterCommand(buttonKey);
    return;
  }

  // clear
  if (cmd === "clear") {
    clearTerminal();
    printBootMessages();
    return;
  }

  // unknown
  printOutput(`bash: ${cmd.split(" ")[0]}: command not found`, "error");
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

    // Spotlight the next step (overrides "used" dimming if both apply)
    if (btn.key === nextKey) {
      el.classList.add("cmd-btn--next");
    } else if (usedKeys.has(btn.key)) {
      el.classList.add("cmd-btn--used");
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
      runCommand(btn.command, btn.key);
      if (terminalInput) {
        terminalInput.value = "";
        terminalInput.focus();
      }
    });

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

  // Milestone 24G — mission complete → every M1 tool is marked completed.
  markAllToolsCompleted("mission-001");

  // Milestone 15: mark every step complete (spec #8). The loop is a safety
  // net in case any earlier step's hook didn't fire (e.g. the optional
  // "cat-employee-notes" path); the final "complete" step is always set here.
  PROGRESS_STEPS.forEach((s) => completedProgressSteps.add(s.id));
  renderProgressTracker();

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
  printOutput("[ MISSION COMPLETE \u2014 Well done, Agent. ]", "info");

  // Milestone 9 — flip Mission 1 to Completed and unlock Mission 2 in the
  // Course Progress panel. Also print an unlock notice to the terminal.
  printOutput("[ Mission 2 unlocked: Network Basics ]", "info");
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
  }

  // Milestone 18 — persist completion + new rank + unlock state
  saveProgress();
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
          <h2 class="completion-title">Mission Complete</h2>
          <p class="completion-subtitle">You identified a phishing attempt.</p>
        </div>
      </div>

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
          ${renderDecisionScorecardRows("mission-001")}
          ${renderAlertScorecardRows("mission-001")}
        </ul>
        </div>

        <!-- Milestone 24H — Mission Outcome Summary (Mission 1).
             Restates the full Alert → Investigation → Evidence →
             Decision → Consequence → Reward loop the student completed. -->
        ${buildOutcomeSummaryHTML("mission-001")}

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

        <!-- What You Learned -->
        <div class="scorecard-section scorecard-learned scorecard-section--collapsed">
          <span class="scorecard-section-label">WHAT YOU LEARNED</span>
          <p class="scorecard-learned-text">
            You learned how cybersecurity analysts use simple command-line
            investigation steps to inspect files, identify suspicious
            behavior, and report a possible phishing attempt.
          </p>
        </div>

        <!-- Next Mission Preview -->
        <div class="scorecard-section scorecard-next scorecard-section--collapsed">
          <span class="scorecard-section-label">NEXT MISSION PREVIEW</span>
          <p class="scorecard-next-text">
            <strong class="scorecard-next-title">Network Basics</strong>
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
              <span class="certificate-value">Mission 1 — New Cybersecurity Intern</span>
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
              <span class="certificate-value certificate-value--status">Mission 1 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all missions in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all missions are complete">
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
    btn.innerHTML = "\u25B6&nbsp; Continue to Mission 2 \u2192";
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
  missionStarted = true;
  furthestSeqIndex = -1;

  // First in-mission hint
  setHint(HINTS.started, "normal");
  // Milestone 13: supervisor's first in-mission message
  setManagerMessage("started");
  // Milestone 24F — dynamic manager reaction for mission start (M1).
  updateManagerReaction("mission_started", { missionId: "mission-001" });
  // Milestone 24G — initialize the M1 tool set (File Inspector + Terminal
  // available, rest locked) and make the Terminal the active focus.
  initializeMissionTools("mission-001");
  setActiveTool("m1-terminal");
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
  // 1. Reset state variables — back to the pre-briefing state
  currentDir       = "~";
  currentXP        = INITIAL_XP;
  missionComplete  = false;
  missionStarted   = false;    // back to "Awaiting Mission Start"
  furthestSeqIndex = -1;

  // Milestone 25A — replaying returns to the briefing; leave Focus Mode.
  setMissionRunning(false);
  // Milestone 25B — end any guided spotlight tour on restart.
  endGuidedRun();

  // Reset hint back to the pre-briefing message
  setHint(HINTS.awaiting, "muted");
  // Milestone 13: reset supervisor message back to the welcome line
  setManagerMessage("awaiting");
  // Milestone 15: reset progress tracker (Briefing complete, Begin Mission current)
  resetProgressTracker();

  unlockedKeys.clear();
  completedSteps.clear();

  // Challenge Layer 1 — reset Mission 1 confidence + investigation tracking.
  m1Confidence = 0;
  m1ConfidenceContributors.clear();
  m1FilesReviewed.clear();
  m1FalseLeadsChecked.clear();
  m1BonusFound     = false;
  m1ProgressiveHintIx = 0;
  renderConfidenceMeter("mission-001");

  // Investigation Board — clear Mission 1 pins + pin UI on restart.
  investigationPins["mission-001"] = {};
  pinnableFindings["mission-001"].clear();
  Array.from(pinXpAwarded).forEach((k) => {
    if (k.startsWith("mission-001:")) pinXpAwarded.delete(k);
  });
  renderInvestigationBoard("mission-001");
  const pinHostM1 = document.getElementById("pinPanel");
  if (pinHostM1) { pinHostM1.innerHTML = ""; pinHostM1.style.display = "none"; }

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
   KEYBOARD INPUT (optional — typed commands bypass unlock logic)
   ============================================================ */

function initTerminalInput() {
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

function enterModule() {
  // Milestone 17 — capture the student name from the landing input.
  // Safety net: ignore clicks if the name is empty (button should already
  // be disabled, but defensive against keyboard / programmatic triggers).
  const nameInput = document.getElementById("studentNameInput");
  const typed = nameInput ? nameInput.value.trim() : "";
  if (!typed) return;
  studentName = typed;

  // Render personalized greeting at the top of the mission panel
  const welcomeEl = document.getElementById("welcomeMessage");
  if (welcomeEl) {
    welcomeEl.innerHTML = `Welcome, <strong>${escapeHtml(studentName)}</strong>`;
  }

  // Milestone 18 — persist the name as soon as the student enters the module
  saveProgress();

  // Milestone 11 — show the simulation loader first, then the dashboard.
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  runSimulationLoader(() => {
    if (dashboardEl)   dashboardEl.style.display = "";
    // Milestone 24I — render the Mission 1 Briefing Room on entry.
    renderBriefingRoom("mission-001");
    updateMission1CTA();
    // Milestone 25A — if Mission 1 was already in progress, re-assert the
    // mission-running control bar on dashboard re-entry (beginMission()'s
    // early guard would otherwise skip this on resume).
    if (missionStarted && !missionComplete) {
      setMissionRunning(true);
      enterFocusMode();
    }
    if (terminalInput) terminalInput.focus();
    // Milestone 25B fix — auto-open the guided, center-stage briefing overlay on
    // a FRESH start so the student begins in the focused guided flow instead of
    // hunting for cards in the left sidebar. Resume-safe: skipped once the
    // mission is started or complete (startGuidedBriefing also guards this).
    if (!missionStarted && !missionComplete) {
      startGuidedBriefing("mission-001", beginMission);
    }
  });
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

  // Mission 3 — Locked for the duration of Phase A
  setRegistryMissionStatus("mission3", MISSION_STATUS.LOCKED);
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
          ✓ Mission 2 unlocked: Network Basics
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
  if (dashboardEl)     dashboardEl.style.display     = "none";
  if (moduleLandingEl) moduleLandingEl.style.display = "none";
  overview.style.display = "";
  overview.scrollTop = 0;
  // Milestone 24I — render the Mission 2 Briefing Room on entry.
  renderBriefingRoom("mission-002");
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
  missionName:     "Network Basics",
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
    nextHint: "Now check whether the target host is reachable.",
    unlocks: [],
    managerMsg: "Good — you've identified your local IP. Now confirm whether the target host is reachable.",
  },
  // Challenge Layer 1 (M2) — false lead: an unreachable host. Provides a
  // little confidence for checking, but does NOT unlock the scan.
  "ping-bad": {
    cmd:    "ping 10.0.0.8",
    output: ["Request timed out. Host not reachable."],
    nextHint: "That host didn't respond. Try the other target from the alert.",
    unlocks: [],
    managerMsg: "That host is not reachable. Try another target from the alert.",
  },
  "ping": {
    cmd:    "ping 10.0.0.5",
    output: ["64 bytes from 10.0.0.5: host is reachable"],
    nextHint: "The host is reachable. Scan for open services.",
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
    nextHint: "Review the services and think about what they mean.",
    unlocks: ["review"],
    managerMsg: "Three open ports — SSH, HTTP, and HTTPS. Review what those services tell us about this host.",
  },
  "review": {
    cmd:    "review services",
    output: ["The host has SSH, HTTP, and HTTPS services exposed."],
    nextHint: "Now think like an analyst — answer the Analyst Review question below.",
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

  if (m2Started) return;
  m2Started = true;

  // Unlock the starting commands (ip addr + both ping targets — the
  // unreachable host is a Challenge Layer 1 false lead).
  m2UnlockedCmds.add("ip-addr");
  m2UnlockedCmds.add("ping-bad");
  m2UnlockedCmds.add("ping");
  syncM2Buttons();
  renderConfidenceMeter("mission-002");

  // Status + opening hint + supervisor briefing
  markM2Status("started");
  setM2Hint("Start by identifying your local IP address.");
  setM2ManagerMessage("Welcome to Mission 2, Agent. Let's map this network — start by identifying your local IP address.");
  // Milestone 24F — dynamic manager reaction for mission start (M2).
  updateManagerReaction("mission_started", { missionId: "mission-002" });

  // Print a small system line in the terminal so it's not empty
  printM2Line("[ Mission 2 environment ready ]", "m2-line--info");

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

  // Print prompt line + each output line
  printM2Line(`<span class="m2-prompt">student@cybercorp:~$</span> ${escapeHtml(def.cmd)}`, "m2-line--prompt");
  def.output.forEach((line) => printM2Line(escapeHtml(line), "m2-line--output"));
  printM2Line("", "m2-line--blank");

  // Mark this status step complete + unlock next commands
  markM2Status(key);
  def.unlocks.forEach((next) => m2UnlockedCmds.add(next));
  syncM2Buttons();
  setM2Hint(def.nextHint);
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
  if (key === "nmap") {
    addEvidence(
      "m2-open-ports",
      "Target host exposes SSH, HTTP, and HTTPS services",
      "mission-002"
    );
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

  // Evidence Prioritization (M2 light version) — after revealing a
  // pinnable finding, offer the student the choice to pin + classify it
  // on the Investigation Board.
  if (EVIDENCE_RATINGS["mission-002"][key]) {
    showPinPrompt("mission-002", key);
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
  // Milestone 24C — correct M2 analyst review → +10 trust.
  increaseTrustScore(10);
  // Milestone 24G — analyst review answered → Analyst Review done; Quiz unlocks.
  markToolCompleted("m2-analyst-review");
  unlockTool("m2-quiz");
  setActiveTool("m2-quiz");
  markM2Status("analyst-review");
  markM2Status("threat-assessment");
  setM2Hint("Mission 2 threat assessment complete. Final assessment incoming.");
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
  syncM2XPPanel();

  // Mark final status + update course progress
  markM2Status("m2-complete");
  setM2Hint("Mission 2 complete. See your scorecard below.");
  setM2ManagerMessage("Outstanding, Agent. You've completed Mission 2. Review your scorecard and prepare for Mission 3.");
  // Milestone 24F — dynamic manager reaction for mission completion (M2).
  // Fires after the closing briefing so the scripted reaction is the
  // final line the student sees in the Supervisor panel.
  updateManagerReaction("mission_completed", { missionId: "mission-002" });
  renderCourseProgress();

  // Milestone 24B — Mission 2 complete → network secured (Low).
  setThreatLevel("Low", "mission-002");

  // Replace the analyst review host content with the completion + scorecard
  // (keeps everything inside the COMMANDS panel — same pattern as M1).
  setTimeout(() => renderM2Scorecard(), 1200);

  // Terminal confirmation
  printM2Line("[ MISSION 2 COMPLETE — Network Basics passed. +100 XP awarded. ]", "m2-line--info");
}

function renderM2Scorecard() {
  const host = document.getElementById("m2AnalystReview");
  if (!host) return;
  const currentRank = rankNameEl ? rankNameEl.textContent : M2_QUIZ.newRank;
  // Mirrors M1's buildCompletionHTML() exactly — same .completion-screen
  // / .scorecard / .certificate-preview chrome so M1 and M2 look identical.
  host.innerHTML = `
    <div class="completion-screen">

      <!-- ===== Header ===== -->
      <div class="completion-header">
        <span class="completion-icon">🏆</span>
        <div class="completion-titles">
          <h2 class="completion-title">Mission 2 Complete</h2>
          <p class="completion-subtitle">${escapeHtml(M2_SCORECARD.subtitle)}</p>
        </div>
      </div>

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
          ${renderDecisionScorecardRows("mission-002")}
          ${renderAlertScorecardRows("mission-002")}
        </ul>
        </div>

        <!-- Milestone 24H — Mission Outcome Summary (Mission 2).
             Restates the full Alert → Investigation → Evidence →
             Decision → Consequence → Reward loop the student completed. -->
        ${buildOutcomeSummaryHTML("mission-002")}

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

        <!-- Next Mission Preview -->
        <div class="scorecard-section scorecard-next scorecard-section--collapsed">
          <span class="scorecard-section-label">NEXT MISSION PREVIEW</span>
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
              <span class="certificate-value">Mission 2 — Network Basics</span>
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
              <span class="certificate-value certificate-value--status">Mission 2 Completed</span>
            </div>
          </div>

          <div class="certificate-footer">
            <p class="certificate-note">
              Full certificate unlocks after completing all missions in the course.
            </p>
            <button class="certificate-download-btn" type="button" disabled
                    title="Locked until all missions are complete">
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
}

function syncM2Buttons() {
  document.querySelectorAll(".m2-cmd-btn[data-m2cmd]").forEach((btn) => {
    const key = btn.getAttribute("data-m2cmd");
    const unlocked = m2UnlockedCmds.has(key);
    btn.disabled = !unlocked;
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
  term.scrollTop = term.scrollHeight;
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
  setMissionRunning(false); // Milestone 25A — leave Focus Mode on restart.
  endGuidedRun(); // Milestone 25B — end any guided spotlight tour.
  m2Started = false;
  m2UnlockedCmds.clear();
  m2CompletedStatus.clear();
  m2AnalystAnswered = false;
  m2QuizAnswered    = false;
  mission2Complete  = false;
  // Challenge Layer 1 — reset Mission 2 confidence.
  m2Confidence = 0;
  m2ConfidenceContributors.clear();
  renderConfidenceMeter("mission-002");

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
  // Persist — clears mission2Complete flag from localStorage too
  saveProgress();
  // Course progress reflects the regression (M2 back to "Unlocked")
  renderCourseProgress();

  const term = document.getElementById("m2Terminal");
  if (term) term.innerHTML = "";
  setM2Hint("Start by identifying your local IP address.");
  setM2ManagerMessage("Welcome back. Mission 2 is a network reconnaissance exercise. Click any unlocked command to begin.");
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
    btn.disabled = true;
    btn.classList.remove("m2-cmd-btn--unlocked");
  });

  // Hide the dashboard if it's currently showing
  const dashboard = document.getElementById("mission2Dashboard");
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
  if (currentMissionId === "mission-002") {
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
  if (currentMissionId === "mission-002") {
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
  if (currentMissionId === "mission-002") {
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
  if (currentMissionId === "mission-002") {
    markM2Status(statusIdOrText);
  } else {
    completeStep(statusIdOrText);
  }
}

/** Updates the hint-panel text for the active mission. */
function updateHintPanel(hintText) {
  if (currentMissionId === "mission-002") {
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
  pushManagerMessage(currentMissionId === "mission-002" ? "mission-002" : "mission-001", messageText);
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
  // Milestone 25A — celebratory toast on mission completion (M1 + M2).
  if (eventType === "mission_completed") fxToast("Mission Complete!", "success");
  return text;
}

/** Unlocks a single command in the active mission's command panel. */
function unlockCommand(commandId) {
  if (currentMissionId === "mission-002") {
    m2UnlockedCmds.add(commandId);
    syncM2Buttons();
  } else {
    unlockButtons([commandId]);
  }
}

/** Reveals the finding-submission step (M1 finding panel / M2 analyst review). */
function showFindingSubmission() {
  if (currentMissionId === "mission-002") {
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
  if (currentMissionId === "mission-002") {
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
  if (currentMissionId === "mission-002") return;
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
  if (currentMissionId === "mission-002") {
    // M2's normal completion runs inside handleM2QuizAnswer (quiz path).
    // Calling the engine directly must mirror ALL the side-effects of
    // that path so engine-driven completion is indistinguishable from
    // quiz-driven completion.
    if (mission2Complete) return;

    mission2Complete = true;
    m2QuizAnswered   = true;

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
    setM2Hint("Mission 2 complete. See your scorecard below.");
    setM2ManagerMessage("Outstanding, Agent. You've completed Mission 2. Review your scorecard and prepare for Mission 3.");
    renderCourseProgress();

    // Render the scorecard so engine-driven completion produces the
    // same final UI as the quiz path. printM2Line is best-effort —
    // if no M2 terminal is on-screen yet, it just no-ops.
    renderM2Scorecard();
    printM2Line("[ MISSION 2 COMPLETE — Network Basics passed. +100 XP awarded. ]", "m2-line--info");
    return;
  }
  completeMission(newRank || QUIZ.newRank);
}

/** Renders the completion / scorecard screen for the active mission. */
function showScorecard() {
  if (currentMissionId === "mission-002") {
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
  if (target === "mission-002") {
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

function boot() {
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
  setHint(HINTS.awaiting, "muted");

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
    btn.addEventListener("click", () => runM2Command(btn.getAttribute("data-m2cmd")));
  });
  renderM2Status();

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
  const isM2  = missionId === "mission-002";
  const feed  = document.getElementById(isM2 ? "m2ManagerText" : "managerText");
  const panel = document.getElementById(isM2 ? "m2ManagerPanel" : "managerPanel");
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
  while (feed.children.length > 5) feed.removeChild(feed.firstElementChild);
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
  const isM2 = missionId === "mission-002";
  const el = document.getElementById(isM2 ? "m2CurrentObjective" : "currentObjective");
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

function fxPulse(id) {
  fxFlash(document.getElementById(id), "fx-pulse", 700);
}

function fxPulseConfidence(missionId) {
  fxPulse(missionId === "mission-002" ? "m2ConfidenceMeter" : "confidenceMeter");
}

function fxPulseThreat(missionId) {
  fxPulse(missionId === "mission-002" ? "m2ThreatMeter" : "threatMeter");
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

/** Entry point — replaces the direct beginInvestigation() call on the
 *  mission "Begin" buttons. Opens the guided briefing overlay for a fresh
 *  start; resumes straight into an already-started mission (no overlay). */
function startGuidedBriefing(missionId, startFn) {
  const alreadyStarted = missionId === "mission-002" ? m2Started : missionStarted;
  if (alreadyStarted) {
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
        <button id="guidedLaunchBtn" class="guided-next-btn guided-launch-btn" type="button">
          ▶ Launch Investigation
        </button>
      </div>
    </div>
  `;
  const launch = overlay.querySelector("#guidedLaunchBtn");
  if (launch) launch.addEventListener("click", runGuidedLaunch);
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
    setCurrentObjective("mission-001", "Open the documents folder and inspect the files.");
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
    target: (m) => document.getElementById(m === "mission-002" ? "m2CurrentObjective" : "currentObjective"),
    text: "This is your command center. Click a command to run it in the terminal — new commands unlock as you progress.",
  },
  files: {
    target: () => document.querySelector('#commandButtonsContainer [data-cmd-group="Inspect Files"]'),
    text: "New file-inspection commands unlocked. Open and read each file to gather evidence.",
  },
  board: {
    target: (m) => document.getElementById(m === "mission-002" ? "m2InvestigationBoard" : "investigationBoard"),
    text: "You found something worth keeping. Pin it to your Investigation Board, then classify how suspicious it is.",
  },
  decision: {
    target: (m) => document.getElementById(m === "mission-002" ? "m2DecisionActions" : "decisionActions"),
    text: "Evidence is in. Choose your decision action carefully — it affects your trust score.",
  },
};

/** True while a blocking modal (the mission alert modal or the guided
 *  briefing overlay) is on screen — the spotlight waits for it to close. */
function igModalOpen() {
  if (document.getElementById("guidedOverlay")) return true;
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
  igEnabled = false;
  igPhasesShown.clear();
  igPending.clear();
  clearGuidedLaunchTimers();
  igTeardown();
  guidedState = null;
  closeGuidedOverlay();
}

function igShow(missionId, phase, targetEl) {
  if (!igEnabled) return;
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
  let left = r.left + (r.width / 2) - (tr.width / 2);
  left = Math.max(margin, Math.min(left, window.innerWidth - tr.width - margin));
  tip.style.top  = top + "px";
  tip.style.left = left + "px";
}

document.addEventListener("DOMContentLoaded", boot);
