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

/* ============================================================
   STATE
   ============================================================ */
let activeNodeId = null;
let timerInterval = null;
let timerSeconds = 0;
let alertRollIndex = 0;
let commsRollIndex = 0;

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

  // Populate workspace header
  const sevEl = document.getElementById('wsSeverity');
  sevEl.textContent = incident.severity;
  sevEl.setAttribute('data-sev', incident.severity);
  document.getElementById('wsRegion').textContent = incident.region;
  document.getElementById('wsTitle').textContent = incident.title;

  // Populate sidebar
  document.getElementById('wsOpId').textContent = incident.opId;
  document.getElementById('wsThreatClass').textContent = incident.threatClass;
  document.getElementById('wsPriority').textContent = incident.priority;
  document.getElementById('wsManagerNote').textContent = incident.managerNote;

  const sevClass = incident.severity.toLowerCase();
  const prioEl = document.getElementById('wsPriority');
  prioEl.className = `ws-brief-val ws-brief-val--${sevClass === 'critical' ? 'critical' : sevClass === 'high' ? 'high' : ''}`;

  // Objectives
  const objs = incident.objectives;
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`wsObj${i + 1}`);
    if (el && objs[i]) el.textContent = objs[i];
  }

  // Terminal welcome line
  document.getElementById('termWelcome').textContent = `[${incident.opId}] ${incident.terminalBrief}`;

  // Show workspace, hide ops center
  document.getElementById('opsCenter').style.display = 'none';
  document.getElementById('missionWorkspace').style.display = 'flex';

  // Start timer
  timerSeconds = 0;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timerSeconds++;
    const m = String(Math.floor(timerSeconds / 60)).padStart(2, '0');
    const s = String(timerSeconds % 60).padStart(2, '0');
    const el = document.getElementById('wsTimer');
    if (el) el.textContent = `${m}:${s}`;
  }, 1000);
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
   ROLLING UPDATES (periodic live feed simulation)
   ============================================================ */
function scheduleRollingAlerts() {
  // New alert every 18–28 seconds
  const delay = 18000 + Math.random() * 10000;
  setTimeout(() => {
    if (alertRollIndex < ROLLING_ALERTS.length) {
      renderAlert(ROLLING_ALERTS[alertRollIndex++], true);
    } else {
      // Cycle
      alertRollIndex = 0;
      renderAlert(ROLLING_ALERTS[alertRollIndex++], true);
    }
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

  // Start rolling live feed
  scheduleRollingAlerts();
  scheduleRollingComms();
}

document.addEventListener('DOMContentLoaded', init);
