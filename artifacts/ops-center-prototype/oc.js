/**
 * oc.js — Operations Center Prototype
 * CyberCorp SOC — Interactive Logic
 * Mock data only. No backend, no localStorage writes.
 */

/* ============================================================
   MOCK DATA
   ============================================================ */

const INCIDENTS = {
  "emea": {
    id: "emea",
    severity: "CRITICAL",
    region: "EMEA REGION",
    title: "Credential Phishing Campaign",
    desc: "Active credential harvesting operation across EMEA corporate accounts. Multi-vector phishing with spoofed executive domains targeting 400+ employees.",
    detected: "Today 06:14 UTC",
    systems: "Email · Identity · VPN",
    assigned: "Unassigned — Priority Queue",
    opId: "OPS-2026-001",
    threatClass: "Spear Phishing / BEC",
    priority: "P1 — IMMEDIATE",
    objectives: [
      "Identify phishing email headers",
      "Map affected user accounts",
      "Trace external domain origin",
      "Draft containment & user advisory"
    ],
    managerNote: '"Ghost Zero — this one\'s active right now. Credential theft in progress. Move fast. — Reyes"',
    terminalBrief: "ALERT OPS-2026-001: Credential phishing campaign active. Spoofed domain external-reyes@cybercorp-support[.]net collecting VPN credentials.",
    commsOnSelect: {
      author: "lead",
      name: "Sarah Reyes",
      role: "SOC Lead",
      text: "Analyst — OPS-001 needs eyes now. Phishing wave is live. This is your priority."
    }
  },
  "apac": {
    id: "apac",
    severity: "HIGH",
    region: "APAC REGION",
    title: "Lateral Movement Detected",
    desc: "Unauthorized east-west traffic identified across three internal APAC segments. Possible credential reuse following prior breach.",
    detected: "Today 04:38 UTC",
    systems: "Internal Segmentation · AD · File Shares",
    assigned: "Marcus Chen",
    opId: "OPS-2026-002",
    threatClass: "Lateral Movement",
    priority: "P2 — HIGH",
    objectives: [
      "Map compromised host chain",
      "Identify credential source",
      "Isolate affected segments",
      "Escalate to Incident Commander"
    ],
    managerNote: '"Chen is lead on APAC. Back him up if needed. — Reyes"',
    terminalBrief: "ALERT OPS-2026-002: Lateral movement via pass-the-hash across APAC-SEG-3 → APAC-SEG-7. Source host: 10.44.2.19.",
    commsOnSelect: {
      author: "intel",
      name: "Marcus Chen",
      role: "Threat Intel",
      text: "APAC lateral is pass-the-hash. We've pinned the source to APAC-SEG-3. Working containment now."
    }
  },
  "na-east": {
    id: "na-east",
    severity: "HIGH",
    region: "NA-EAST REGION",
    title: "Malware Outbreak — Ransomware Precursor",
    desc: "Cobalt Strike beacon activity identified on 12 workstations across the NA-East segment. Likely precursor to ransomware deployment.",
    detected: "Today 03:52 UTC",
    systems: "Endpoints · AV · EDR",
    assigned: "Cmdr. Brooks",
    opId: "OPS-2026-003",
    threatClass: "Malware / C2 Activity",
    priority: "P2 — HIGH",
    objectives: [
      "Identify C2 beaconing hosts",
      "Block external C2 domains",
      "Quarantine affected endpoints",
      "Assess encryption readiness"
    ],
    managerNote: '"Brooks is handling NA-East. This could escalate quickly. Containment window is narrow. — Reyes"',
    terminalBrief: "ALERT OPS-2026-003: Cobalt Strike C2 beacon detected on 12 hosts. External C2: 185.220.101.47. EDR kill-switch ready.",
    commsOnSelect: {
      author: "cmd",
      name: "Cmdr. Brooks",
      role: "Incident Commander",
      text: "NA-East malware is Cobalt Strike stage 2. We have a 30-minute window before potential ransomware drop. Containment authorized."
    }
  },
  "latam": {
    id: "latam",
    severity: "MEDIUM",
    region: "LATAM REGION",
    title: "Reconnaissance Activity",
    desc: "Systematic port scanning observed against LATAM external perimeter from unknown IP range. Pattern consistent with pre-attack recon.",
    detected: "Today 02:07 UTC",
    systems: "Perimeter Firewall · IDS · Proxy",
    assigned: "Alex Torres",
    opId: "OPS-2026-004",
    threatClass: "Reconnaissance / Scanning",
    priority: "P3 — MEDIUM",
    objectives: [
      "Fingerprint scanning source IPs",
      "Cross-reference threat intel feeds",
      "Review exposed service surface",
      "Update firewall block rules"
    ],
    managerNote: '"Torres — good learning op. Document everything. Escalate if scanning turns to exploitation. — Reyes"',
    terminalBrief: "ALERT OPS-2026-004: External recon from 203.0.113.0/24. Sequential port scan 22,80,443,8080,3389 across perimeter subnets.",
    commsOnSelect: {
      author: "junior",
      name: "Alex Torres",
      role: "Junior Analyst",
      text: "On it — scanning pattern matches the Shodan fingerprinting playbook. Pulling the IP reputation report now."
    }
  },
  "mena": {
    id: "mena",
    severity: "MEDIUM",
    region: "MENA REGION",
    title: "Suspicious Login Activity",
    desc: "Anomalous authentication events detected — multiple failed MFA challenges from unfamiliar geolocations targeting privileged accounts.",
    detected: "Today 01:44 UTC",
    systems: "IAM · MFA · Cloud Auth",
    assigned: "Unassigned",
    opId: "OPS-2026-005",
    threatClass: "Account Takeover Attempt",
    priority: "P3 — MEDIUM",
    objectives: [
      "Review auth log anomalies",
      "Identify targeted accounts",
      "Geolocate source IPs",
      "Force MFA re-enrollment"
    ],
    managerNote: '"MENA needs an analyst. Take it if EMEA-001 is stable. — Reyes"',
    terminalBrief: "ALERT OPS-2026-005: 47 failed MFA challenges on 9 privileged accounts. Source: AS12345 (AS not in approved geo-list).",
    commsOnSelect: {
      author: "lead",
      name: "Sarah Reyes",
      role: "SOC Lead",
      text: "MENA-005 is open. Looks like an ATO attempt on admin accounts. Needs an analyst immediately."
    }
  },
  "sea": {
    id: "sea",
    severity: "LOW",
    region: "SE ASIA REGION",
    title: "Anomalous Port Scan Detected",
    desc: "Low-rate port scanning from a known CDN exit node against SEA DMZ services. Likely automated, low threat — logged for trending.",
    detected: "Yesterday 21:30 UTC",
    systems: "DMZ · WAF",
    assigned: "Monitoring",
    opId: "OPS-2026-006",
    threatClass: "Automated Scan",
    priority: "P4 — LOW",
    objectives: [
      "Verify CDN source attribution",
      "Confirm no exploitation attempts",
      "Log for 30-day trending report",
      "No further action unless escalated"
    ],
    managerNote: '"Low priority — observe and log. If pattern changes, escalate. — Reyes"',
    terminalBrief: "ALERT OPS-2026-006: CDN scan from 198.51.100.20 against SEA DMZ ports 80,443. Rate: 0.3 req/s. Automated probe pattern.",
    commsOnSelect: {
      author: "intel",
      name: "Marcus Chen",
      role: "Threat Intel",
      text: "SEA-006 is a known CDN scanner. Attribution confirmed — Shodan-adjacent crawl. Log and close unless it persists."
    }
  }
};

const INITIAL_ALERTS = [
  { severity: "critical", name: "Credential Phishing Campaign", region: "EMEA", time: "06:14" },
  { severity: "high",     name: "Lateral Movement Detected",    region: "APAC", time: "04:38" },
  { severity: "high",     name: "Malware Outbreak — C2 Beacon", region: "NA-EAST", time: "03:52" },
  { severity: "medium",   name: "Reconnaissance Sweep Active",  region: "LATAM", time: "02:07" },
  { severity: "medium",   name: "Suspicious Login — MFA Failure", region: "MENA", time: "01:44" },
  { severity: "low",      name: "Anomalous Port Scan Logged",   region: "SEA", time: "21:30" },
];

const ROLLING_ALERTS = [
  { severity: "info",    name: "TLS certificate anomaly — corp-mail.cybercorp.net", region: "GLOBAL", time: null },
  { severity: "medium",  name: "PowerShell obfuscation pattern detected", region: "NA-EAST", time: null },
  { severity: "info",    name: "DNS lookup spike — 3× baseline on resolver-02", region: "EMEA", time: null },
  { severity: "high",    name: "Privilege escalation attempt — SVC_BACKUP account", region: "APAC", time: null },
  { severity: "low",     name: "Unusual outbound traffic — 22MB to unknown ASN", region: "MENA", time: null },
  { severity: "medium",  name: "Shadow IT detection — unapproved SaaS OAuth token", region: "LATAM", time: null },
  { severity: "info",    name: "Threat feed update: 148 new IOCs ingested", region: "GLOBAL", time: null },
  { severity: "critical",name: "Endpoint AV disabled on host NA-WS-1092", region: "NA-EAST", time: null },
];

const INTEL_UPDATES = [
  { kind: "threat",  text: "New Cobalt Strike C2 infrastructure mapped to AS47337 (RU)." },
  { kind: "malware", text: "Black Basta ransomware precursor TTPs observed in NA-East beacon." },
  { kind: "recon",   text: "203.0.113.0/24 range flagged across 3 active threat intel feeds." },
  { kind: "network", text: "MFA bypass attempt uses SS7 relay — disable SMS auth on privileged accounts." },
  { kind: "info",    text: "CISA advisory AA26-071A: Active exploitation of CVE-2026-1033 in VPN appliances." },
  { kind: "threat",  text: "Phishing domain external-reyes@cybercorp-support[.]net registered 48h ago." },
  { kind: "recon",   text: "APAC-SEG-3 host fingerprint matches threat actor group FIN-12." },
  { kind: "info",    text: "Blue Team drill scheduled: 14:00 UTC — tabletop ransomware response." },
];

const INITIAL_COMMS = [
  {
    author: "lead", name: "Sarah Reyes", role: "SOC Lead", time: "06:10",
    text: "All analysts report. We have an active phishing wave in EMEA. OPS-001 is priority one. Stand by for assignments."
  },
  {
    author: "intel", name: "Marcus Chen", role: "Threat Intel", time: "06:11",
    text: "Threat intel confirms EMEA phishing is linked to FIN-12 group. Same domain spoofing pattern as the Q1 campaign."
  },
  {
    author: "cmd", name: "Cmdr. Brooks", role: "Incident Cmd", time: "06:12",
    text: "NA-East containment is authorized. I'm escalating Cobalt Strike hosts to P1 if we don't cut C2 in the next 20 minutes."
  },
  {
    author: "junior", name: "Alex Torres", role: "Junior Analyst", time: "06:13",
    text: "LATAM recon scope confirmed — 600 ports scanned across 12 hosts. No exploitation attempts yet. Firewall rules updated."
  }
];

const ROLLING_COMMS = [
  { author: "intel", name: "Marcus Chen", role: "Threat Intel", text: "Pulling additional IOCs from MISP feed. Will push to SIEM in 5 minutes." },
  { author: "cmd",   name: "Cmdr. Brooks", role: "Incident Cmd", text: "Escalation threshold: if any P2 becomes active encryption, we invoke IR protocol DELTA." },
  { author: "lead",  name: "Sarah Reyes", role: "SOC Lead", text: "Document everything in real time. Legal and compliance will need the timeline." },
  { author: "junior", name: "Alex Torres", role: "Junior Analyst", text: "MENA-005 auth logs are in. 47 failures across 9 accounts — all admins. This looks targeted." },
  { author: "intel", name: "Marcus Chen", role: "Threat Intel", text: "Domain registration for cybercorp-support[.]net traced to bulletproof hosting in AS8003. Confirmed malicious." },
  { author: "cmd",   name: "Cmdr. Brooks", role: "Incident Cmd", text: "NA-East — 6 hosts quarantined. C2 domain blocked at perimeter. Holding. Waiting for full forensic triage." },
  { author: "lead",  name: "Sarah Reyes", role: "SOC Lead", text: "Good work team. Holding the line. EMEA analyst — update me every 10 minutes." },
  { author: "junior", name: "Alex Torres", role: "Junior Analyst", text: "LATAM perimeter report filed. Recommend geo-blocking AS47337 range as proactive measure." },
];

const TICKER_IOCS = [
  { sev: "critical", text: "IOC: external-reyes@cybercorp-support[.]net — Active credential phishing domain" },
  { sev: "high",     text: "C2: 185.220.101.47:443 — Cobalt Strike beacon active on NA-EAST segment" },
  { sev: "high",     text: "Hash: 4d1f8e29a031bcc7 — Malware dropper on NA-WS-1092 — quarantine pending" },
  { sev: "medium",   text: "IP Range: 203.0.113.0/24 — Sequential port scan ongoing LATAM perimeter" },
  { sev: "medium",   text: "47 failed MFA challenges — Privileged accounts targeted in MENA region" },
  { sev: "high",     text: "Pass-the-hash lateral movement — APAC-SEG-3 → APAC-SEG-7 — source: 10.44.2.19" },
  { sev: "info",     text: "CISA AA26-071A: CVE-2026-1033 active exploitation confirmed in VPN appliances" },
  { sev: "low",      text: "CDN probe 198.51.100.20 — SEA DMZ ports 80,443 — automated scan, low rate" },
  { sev: "info",     text: "Threat feed update: 148 new IOCs ingested from MISP — SIEM rules refreshed" },
  { sev: "medium",   text: "PowerShell obfuscation pattern detected — NA-EAST endpoint — policy alert triggered" },
  { sev: "high",     text: "Domain: cybercorp-support[.]net — Bulletproof hosting AS8003 — confirmed malicious" },
  { sev: "info",     text: "Blue Team tabletop 14:00 UTC — ransomware response exercise — all analysts required" },
];

/* ============================================================
   REAL-MISSION DEEP LINKS
   ------------------------------------------------------------
   These three incident nodes correspond to playable missions in
   the main Ethical CyberHackers game. Clicking "Launch
   Investigation" for them navigates to the real investigation
   terminal instead of the mocked workspace.
   ============================================================ */
const REAL_MISSION_MAP = {
  "emea":    "mission-001",
  "apac":    "mission-002",
  "na-east": "mission-003",
  // Task 13 — the remaining three incident nodes now map to real, playable
  // data-driven missions in the main game (no more mocked workspace).
  "latam":   "mission-004",
  "mena":    "mission-005",
  "sea":     "mission-006",
};

/* ============================================================
   REAL-MISSION PROGRESS (read-only mirror of the main game)
   ------------------------------------------------------------
   The main Ethical CyberHackers game persists progress to the
   browser's localStorage under "ech.progress.v1" (same origin).
   The prototype READS this (never writes) so the three real-
   mission nodes can reflect the player's actual completion state:
     • completed  — mission already finished  → "COMPLETED" glyph,
                    launch button reads "REPLAY INVESTIGATION"
     • active     — available to play
     • locked     — prerequisite mission not yet done → lock glyph,
                    launch button disabled
   Locking mirrors the game's gating: M2 (apac) needs M1 done,
   M3 (na-east) needs M2 done. M1 (emea) is always available.
   ============================================================ */
const PROGRESS_STORAGE_KEY = "ech.progress.v1";

function readGameProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === "object") ? parsed : null;
  } catch {
    return null;
  }
}

// Returns { nodeId: "completed" | "active" | "locked" } for all six
// real-mission nodes. The unlock chain mirrors the main game's gating:
// emea→apac→na-east→latam→mena→sea (each needs the prior completed).
function getMissionStates() {
  const p = readGameProgress() || {};
  const m1 = !!p.mission1Complete;
  const m2 = !!p.mission2Complete;
  const m3 = !!p.mission3Complete;
  const m4 = !!p.mission4Complete;
  const m5 = !!p.mission5Complete;
  const m6 = !!p.mission6Complete;
  return {
    "emea":    m1 ? "completed" : "active",
    "apac":    m2 ? "completed" : (m1 ? "active" : "locked"),
    "na-east": m3 ? "completed" : (m2 ? "active" : "locked"),
    "latam":   m4 ? "completed" : (m3 ? "active" : "locked"),
    "mena":    m5 ? "completed" : (m4 ? "active" : "locked"),
    "sea":     m6 ? "completed" : (m5 ? "active" : "locked"),
  };
}

// Paint each real-mission node with its current progress state. Safe to
// call repeatedly (e.g. on focus after returning from the main game).
function applyMissionProgress() {
  const states = getMissionStates();
  Object.entries(states).forEach(([nodeId, status]) => {
    const node = document.getElementById(`node-${nodeId}`);
    if (!node) return;

    node.classList.remove("node--completed", "node--locked");
    node.removeAttribute("aria-disabled");
    node.querySelector(".node-status-glyph")?.remove();

    const baseLabel = INCIDENTS[nodeId]
      ? `${INCIDENTS[nodeId].region} — ${INCIDENTS[nodeId].severity}`
      : nodeId;

    if (status === "completed") {
      node.classList.add("node--completed");
      const g = document.createElement("span");
      g.className = "node-status-glyph node-status-glyph--completed";
      g.setAttribute("aria-hidden", "true");
      g.textContent = "✓";
      node.appendChild(g);
      node.setAttribute("aria-label", `${baseLabel} — Completed`);
    } else if (status === "locked") {
      node.classList.add("node--locked");
      node.setAttribute("aria-disabled", "true");
      const g = document.createElement("span");
      g.className = "node-status-glyph node-status-glyph--locked";
      g.setAttribute("aria-hidden", "true");
      g.textContent = "🔒";
      node.appendChild(g);
      node.setAttribute("aria-label", `${baseLabel} — Locked`);
    } else {
      node.setAttribute("aria-label", baseLabel);
    }
  });
}

/* ============================================================
   SOUND ENGINE  (Web Audio API — no audio files needed)
   ============================================================ */
const SoundEngine = (() => {
  let ctx = null;

  // Sound is OFF by default. Persisted in sessionStorage so it survives
  // page reloads within the session but resets on new sessions.
  const STORAGE_KEY = 'oc.sound.muted';
  let _muted = sessionStorage.getItem(STORAGE_KEY) !== 'false';

  function _getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function _canPlay() {
    return !_muted && !document.hidden;
  }

  // Short ascending two-tone chime — pitch mapped to severity
  function playAlertChime(severity) {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const pairs = {
      critical: [1047, 1319],
      high:     [784,  988],
      medium:   [659,  784],
      low:      [523,  659],
      info:     [440,  523],
    };
    const [f1, f2] = pairs[severity] ?? pairs.info;
    [f1, f2].forEach((freq, i) => {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = ac.currentTime + i * 0.13;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.1, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      osc.start(t);
      osc.stop(t + 0.42);
    });
  }

  // Sonar-style descending ping — matches the 4 s radar sweep period
  function playRadarPing() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ac.currentTime + 0.55);
    gain.gain.setValueAtTime(0.07, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.55);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.6);
  }

  // Minimal click/blip for the ticker — very quiet
  function playTickerBeep() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = 'square';
    osc.frequency.value = 1400;
    gain.gain.setValueAtTime(0.012, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.055);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.06);
  }

  function isMuted() { return _muted; }

  function toggle() {
    _muted = !_muted;
    sessionStorage.setItem(STORAGE_KEY, String(_muted));
    return _muted;
  }

  return { playAlertChime, playRadarPing, playTickerBeep, isMuted, toggle };
})();

/* ============================================================
   STATE
   ============================================================ */
let activeNodeId = null;
let timerInterval = null;
let timerSeconds = 0;
let alertRollIndex = 0;
let commsRollIndex = 0;
let tickerItemCount = 0; // items per half in the seamless-loop track
const MAX_TICKER_ITEMS = 20;

/* ============================================================
   CLOCK
   ============================================================ */
function updateClock() {
  const now = new Date();
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const el = document.getElementById('headerClock');
  if (el) el.textContent = `${hh}:${mm}:${ss} UTC`;
}

/* ============================================================
   ALERT FEED
   ============================================================ */
function nowTime() {
  const now = new Date();
  return `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}`;
}

function renderAlert(data, prepend = false) {
  const feed = document.getElementById('alertFeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = `alert-item${data.time === null ? ' alert-item--new' : ''}`;
  const time = data.time ?? nowTime();
  el.innerHTML = `
    <div class="alert-top">
      <span class="alert-severity alert-severity--${data.severity}">${data.severity.toUpperCase()}</span>
      <span class="alert-name">${data.name}</span>
    </div>
    <div class="alert-meta">
      <span class="alert-region">${data.region}</span>
      <span class="alert-time">${time}</span>
    </div>
  `;
  if (prepend && feed.firstChild) {
    feed.insertBefore(el, feed.firstChild);
    // Remove oldest if too many
    while (feed.children.length > 10) feed.removeChild(feed.lastChild);
  } else {
    feed.appendChild(el);
  }
  // Update count
  updateAlertCount();
}

function updateAlertCount() {
  const feed = document.getElementById('alertFeed');
  const badge = document.getElementById('alertCount');
  if (!feed || !badge) return;
  badge.textContent = `${feed.children.length} ACTIVE`;
}

function renderIntelItem(data) {
  const feed = document.getElementById('intelFeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = `intel-item intel-item--${data.kind}`;
  el.innerHTML = `<span class="intel-dot" aria-hidden="true"></span><span class="intel-text">${data.text}</span>`;
  feed.appendChild(el);
}

/* ============================================================
   SOC COMMS
   ============================================================ */
function renderCommsMsg(data) {
  const feed = document.getElementById('commsFeed');
  if (!feed) return;
  const el = document.createElement('div');
  el.className = 'comms-msg';
  const time = data.time ?? nowTime();
  el.innerHTML = `
    <div class="comms-avatar comms-avatar--${data.author}">${data.name.split(' ').map(p => p[0]).join('').slice(0,2)}</div>
    <div class="comms-body">
      <div class="comms-meta">
        <span class="comms-name comms-name--${data.author}">${data.name}</span>
        <span class="comms-role">// ${data.role}</span>
        <span class="comms-time">${time}</span>
      </div>
      <div class="comms-text">${data.text}</div>
    </div>
  `;
  feed.appendChild(el);
  feed.scrollTop = feed.scrollHeight;
  // Trim old messages
  while (feed.children.length > 12) feed.removeChild(feed.firstChild);
}

/* ============================================================
   INCIDENT CARD
   ============================================================ */
function showIncidentCard(incidentId) {
  const incident = INCIDENTS[incidentId];
  if (!incident) return;

  activeNodeId = incidentId;

  // Update active node styling
  document.querySelectorAll('.incident-node').forEach(n => n.classList.remove('node--active'));
  const node = document.getElementById(`node-${incidentId}`);
  if (node) node.classList.add('node--active');

  // Populate card
  const card = document.getElementById('incidentCard');
  card.setAttribute('data-severity', incident.severity);
  document.getElementById('incidentSeverity').textContent = incident.severity;
  document.getElementById('incidentRegion').textContent = incident.region;
  document.getElementById('incidentTitle').textContent = incident.title;
  document.getElementById('incidentDesc').textContent = incident.desc;
  document.getElementById('incidentDetected').textContent = incident.detected;
  document.getElementById('incidentSystems').textContent = incident.systems;
  document.getElementById('incidentAssigned').textContent = incident.assigned;

  // Reflect real-mission progress on the launch button (completed → replay,
  // locked → disabled). Mock-only nodes fall through to the default label.
  const launchBtn = document.getElementById('incidentLaunchBtn');
  const status = getMissionStates()[incidentId];
  launchBtn.classList.remove('incident-launch-btn--locked');
  launchBtn.disabled = false;
  if (status === 'locked') {
    launchBtn.disabled = true;
    launchBtn.classList.add('incident-launch-btn--locked');
    launchBtn.innerHTML = '🔒&nbsp; LOCKED — COMPLETE PRIOR MISSION';
  } else if (status === 'completed') {
    launchBtn.innerHTML = '▶&nbsp; REPLAY INVESTIGATION';
  } else {
    launchBtn.innerHTML = '▶&nbsp; LAUNCH INVESTIGATION';
  }

  card.style.display = 'block';

  // Post a contextual comms message
  if (incident.commsOnSelect) {
    setTimeout(() => renderCommsMsg({
      ...incident.commsOnSelect,
      time: null
    }), 600);
  }
}

function hideIncidentCard() {
  document.getElementById('incidentCard').style.display = 'none';
  document.querySelectorAll('.incident-node').forEach(n => n.classList.remove('node--active'));
  activeNodeId = null;
}

/* ============================================================
   MISSION WORKSPACE
   ============================================================ */
function launchWorkspace() {
  if (!activeNodeId) return;
  const incident = INCIDENTS[activeNodeId];
  if (!incident) return;

  // Block locked real missions — their prerequisite isn't complete yet.
  if (getMissionStates()[activeNodeId] === 'locked') return;

  // Task 13 — every incident node now maps to a real, playable mission in the
  // main game. Navigate there with a ?mission= deep-link so the actual
  // investigation terminal opens immediately; the main game owns progress and
  // completion. (The previous mocked in-prototype workspace fallback has been
  // removed now that all six nodes are backed by real missions.)
  const realMissionId = REAL_MISSION_MAP[activeNodeId];
  if (!realMissionId) return;
  window.location.href = '/?mission=' + encodeURIComponent(realMissionId);
}

function returnToOpsCenter() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerSeconds = 0;

  document.getElementById('missionWorkspace').style.display = 'none';
  document.getElementById('opsCenter').style.display = 'flex';

  // Post a brief comms message about returning
  if (activeNodeId && INCIDENTS[activeNodeId]) {
    const inc = INCIDENTS[activeNodeId];
    setTimeout(() => renderCommsMsg({
      author: "lead",
      name: "Sarah Reyes",
      role: "SOC Lead",
      text: `Analyst back from ${inc.opId}. Status update?`,
      time: null
    }), 400);
  }

  hideIncidentCard();
}

/* ============================================================
   THREAT TICKER
   ============================================================ */
function initThreatTicker() {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  function makeItem(ioc) {
    const el = document.createElement('span');
    el.className = 'ticker-item';
    el.innerHTML = `<span class="ticker-sev ticker-sev--${ioc.sev}">${ioc.sev.toUpperCase()}</span>${ioc.text}`;
    return el;
  }

  // Two full copies so the CSS -50% translateX creates a seamless loop
  const allItems = [...TICKER_IOCS, ...TICKER_IOCS];
  allItems.forEach(ioc => track.appendChild(makeItem(ioc)));
  tickerItemCount = TICKER_IOCS.length;
}

// Convert a rolling alert into a ticker IOC object
function alertToIoc(alert) {
  return {
    sev: alert.severity,
    text: `${alert.region} — ${alert.name}`
  };
}

// Prepend a new live IOC item to both halves of the seamless ticker loop.
// Inserts at position 0 of half-1 and position N+1 (start of half-2).
// Trims the tail of each half when the cap is exceeded so the track stays
// bounded and the CSS -50% loop remains accurate.
function appendTickerItem(alert) {
  const track = document.getElementById('tickerTrack');
  if (!track) return;

  const ioc = alertToIoc(alert);
  const N = tickerItemCount;

  function makeFlashItem() {
    const el = document.createElement('span');
    el.className = 'ticker-item ticker-item--new';
    el.innerHTML = `<span class="ticker-sev ticker-sev--${ioc.sev}">${ioc.sev.toUpperCase()}</span>${ioc.text}`;
    // Remove the flash class after animation ends (or via timeout for
    // reduced-motion where animationend may not fire)
    const cleanup = () => el.classList.remove('ticker-item--new');
    el.addEventListener('animationend', cleanup, { once: true });
    setTimeout(cleanup, 2200); // fallback for prefers-reduced-motion
    return el;
  }

  const item1 = makeFlashItem();
  const item2 = makeFlashItem();

  // Insert at start of half-1
  track.insertBefore(item1, track.children[0]);
  // Insert at start of half-2 (now at index N+1 after the first insert)
  track.insertBefore(item2, track.children[N + 1]);

  tickerItemCount++;

  // Trim the oldest item from each half when we exceed the cap
  if (tickerItemCount > MAX_TICKER_ITEMS) {
    const lastHalf1Idx = tickerItemCount - 1;
    if (track.children[lastHalf1Idx]) track.removeChild(track.children[lastHalf1Idx]);
    if (track.lastChild)              track.removeChild(track.lastChild);
    tickerItemCount--;
  }
}

/* ============================================================
   ROLLING UPDATES (periodic live feed simulation)
   ============================================================ */
function scheduleRollingAlerts() {
  // New alert every 18–28 seconds
  const delay = 18000 + Math.random() * 10000;
  setTimeout(() => {
    if (alertRollIndex >= ROLLING_ALERTS.length) alertRollIndex = 0;
    const alert = ROLLING_ALERTS[alertRollIndex++];
    renderAlert(alert, true);
    SoundEngine.playAlertChime(alert.severity);
    appendTickerItem(alert); // mirror to live IOC ticker
    scheduleRollingAlerts();
  }, delay);
}

function scheduleRollingComms() {
  // New comms every 22–38 seconds
  const delay = 22000 + Math.random() * 16000;
  setTimeout(() => {
    if (commsRollIndex < ROLLING_COMMS.length) {
      renderCommsMsg(ROLLING_COMMS[commsRollIndex++]);
    } else {
      commsRollIndex = 0;
      renderCommsMsg(ROLLING_COMMS[commsRollIndex++]);
    }
    scheduleRollingComms();
  }, delay);
}

/* ============================================================
   SOUND TOGGLE UI
   ============================================================ */
function updateSoundToggleUI() {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const muted = SoundEngine.isMuted();
  btn.querySelector('.sound-icon--off').style.display = muted ? '' : 'none';
  btn.querySelector('.sound-icon--on').style.display  = muted ? 'none' : '';
  btn.setAttribute('aria-label', `Toggle sound (currently ${muted ? 'off' : 'on'})`);
  btn.setAttribute('title', muted ? 'Sound off — click to enable' : 'Sound on — click to mute');
  btn.classList.toggle('sound-toggle--on', !muted);
}

/* ============================================================
   RADAR PING SCHEDULER
   The EMEA critical node radar sweep is 4 s per rotation (CSS).
   We fire a sonar ping every 4 s to align with the sweep.
   ============================================================ */
function scheduleRadarPing() {
  const SWEEP_MS = 4000;
  setInterval(() => {
    SoundEngine.playRadarPing();
  }, SWEEP_MS);
}

/* ============================================================
   TICKER BEEP SCHEDULER
   Soft blip every 10–14 s while the IOC ticker scrolls.
   ============================================================ */
function scheduleTickerBeeps() {
  function next() {
    const delay = 10000 + Math.random() * 4000;
    setTimeout(() => {
      SoundEngine.playTickerBeep();
      next();
    }, delay);
  }
  next();
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Render initial alerts
  INITIAL_ALERTS.forEach(a => renderAlert(a, false));

  // Render initial intel
  INTEL_UPDATES.forEach(item => renderIntelItem(item));

  // Render initial comms
  INITIAL_COMMS.forEach(msg => renderCommsMsg(msg));

  // Reflect real game progress on the map (read-only mirror of localStorage).
  applyMissionProgress();
  // Re-sync when the player returns from the main game (e.g. after completing a
  // mission), so completion/lock badges update without a manual reload.
  window.addEventListener('focus', applyMissionProgress);
  window.addEventListener('pageshow', applyMissionProgress);

  // Wire up incident nodes
  document.querySelectorAll('.incident-node').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (activeNodeId === id) {
        hideIncidentCard();
      } else {
        showIncidentCard(id);
      }
    });
    // Keyboard: Enter/Space
    btn.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
  });

  // Close incident card
  document.getElementById('incidentCardClose').addEventListener('click', hideIncidentCard);

  // Launch investigation
  document.getElementById('incidentLaunchBtn').addEventListener('click', launchWorkspace);

  // Return to ops center
  document.getElementById('wsBackBtn').addEventListener('click', returnToOpsCenter);

  // Keyboard: Escape closes card or returns from workspace
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('missionWorkspace').style.display !== 'none') {
        returnToOpsCenter();
      } else if (activeNodeId) {
        hideIncidentCard();
      }
    }
  });

  // Click outside incident card to close
  document.querySelector('.map-container').addEventListener('click', e => {
    const card = document.getElementById('incidentCard');
    if (card.style.display !== 'none' && !card.contains(e.target) && !e.target.closest('.incident-node')) {
      hideIncidentCard();
    }
  });

  // Sound toggle
  updateSoundToggleUI();
  document.getElementById('soundToggle').addEventListener('click', () => {
    SoundEngine.toggle();
    updateSoundToggleUI();
  });

  // Threat ticker
  initThreatTicker();

  // Start rolling live feed
  scheduleRollingAlerts();
  scheduleRollingComms();

  // Start sound schedulers
  scheduleRadarPing();
  scheduleTickerBeeps();
}

document.addEventListener('DOMContentLoaded', init);
