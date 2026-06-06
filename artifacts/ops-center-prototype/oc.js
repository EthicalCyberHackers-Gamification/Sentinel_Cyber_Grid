/**
 * oc.js — Operations Center Prototype
 * CyberCorp SOC — Interactive Logic
 * Mock data only. No backend, no localStorage writes.
 */

/* ============================================================
   MOCK DATA
   ============================================================ */

/* ============================================================
   CYBERCORP ORGANIZATIONAL IDENTITY  (Phase 1 — immersion only)
   ------------------------------------------------------------
   Single source of truth for who the player is and where they
   work. Presentation/data only — never persisted (in-memory
   prototype). Surfaces: Ops Center identity panel, pre-mission
   operational briefing (incident card), and mission headers.
   ============================================================ */
const CYBERCORP_IDENTITY = {
  employer: "CyberCorp",
  division: "Security Operations Division",
  role: "Cybersecurity Intern",
  supervisor: "Sarah Reyes",
  supervisorRole: "SOC Lead",
  clearance: "Tier 1 Operations Access",
  analyst: "GHOST_ZERO",
};

// Per-incident organizational context, keyed by operation ID. Additive and
// presentation-only — establishes department ownership, the support ticket, and
// the recurring employee tied to the incident (continuity across missions).
// J. Okafor (Finance) recurs: reports the OPS-001 phishing wave, then becomes the
// most-targeted account in the OPS-005 takeover attempt.
const OP_CONTEXT = {
  "OPS-2026-001": { dept: "Finance Operations",  ticket: "INC-4471", reportedBy: "J. Okafor · Finance Mgr" },
  "OPS-2026-002": { dept: "APAC Infrastructure", ticket: "INC-4460", reportedBy: "Network Operations" },
  "OPS-2026-003": { dept: "NA-East Endpoints",   ticket: "INC-4452", reportedBy: "EDR Auto-Alert" },
  "OPS-2026-004": { dept: "Perimeter Security",  ticket: "INC-4438", reportedBy: "IDS Auto-Alert" },
  "OPS-2026-005": { dept: "Identity & Access",   ticket: "INC-4429", reportedBy: "J. Okafor · Finance Mgr" },
  "OPS-2026-006": { dept: "DMZ Monitoring",      ticket: "INC-4410", reportedBy: "WAF Auto-Alert" },
};
function opContext(opId) {
  return OP_CONTEXT[opId] || { dept: "Security Operations", ticket: "—", reportedBy: "SOC" };
}

/* ============================================================
   PHASE 2 — CAREER PROGRESSION (presentation-only)
   The analyst advances through a 7-tier cybersecurity career as
   real missions are completed. Everything here is DERIVED on each
   render from the existing read-only progress mirror — nothing is
   ever written to localStorage or otherwise persisted.
   ============================================================ */

// The six real-mission nodes in unlock order. The player's tier is the number
// of these that are completed, so each cleared assignment is one promotion.
const NODE_CHAIN = ["emea", "apac", "na-east", "latam", "mena", "sea"];

// The role ladder. `threshold` = missions completed required to hold the role;
// `scope` frames the kind of assignment handled at that tier (framing only — it
// does NOT change mission mechanics); `unlocked` is announced on promotion.
const ROLE_LADDER = [
  { name: "Cybersecurity Intern",        threshold: 0, clearance: "Tier 1 Operations Access", scope: "guided single-incident triage",        unlocked: "supervised incident triage" },
  { name: "Junior SOC Analyst",          threshold: 1, clearance: "Tier 1 Operations Access", scope: "multi-host alert validation",          unlocked: "alert validation & containment drafting" },
  { name: "SOC Analyst",                 threshold: 2, clearance: "Tier 2 Operations Access", scope: "multi-system correlation",             unlocked: "independent incident triage" },
  { name: "Incident Response Analyst",   threshold: 3, clearance: "Tier 3 Response Access",   scope: "active containment & response",        unlocked: "live containment authority" },
  { name: "Threat Hunter",               threshold: 4, clearance: "Tier 3 Response Access",   scope: "proactive threat hunting",            unlocked: "proactive hunt operations" },
  { name: "Cloud Security Analyst",      threshold: 5, clearance: "Tier 4 Cloud Access",      scope: "cloud exposure & identity review",    unlocked: "cloud security operations" },
  { name: "Senior Operations Analyst",   threshold: 6, clearance: "Tier 5 Command Access",    scope: "cross-region operations oversight",   unlocked: "operations oversight & mentoring" },
];

// Returns the assignment-framing role for a given incident node — the role the
// analyst holds when that incident is their next step in the career arc.
function roleForNode(nodeId) {
  const i = NODE_CHAIN.indexOf(nodeId);
  if (i < 0) return ROLE_LADDER[0];
  return ROLE_LADDER[Math.min(i, ROLE_LADDER.length - 1)];
}

// Derive the player's current career standing from the read-only progress
// mirror. Pure computation — no writes. Returns current role, next role (or
// null at the top), completed count, the active assignment, and the in-progress
// confidence of that assignment (used as smooth progress toward promotion).
function getCareerState() {
  const states = getMissionStates();
  const progress = getMissionProgress();
  const completed = NODE_CHAIN.reduce(
    (n, id) => n + (states[id] === "completed" ? 1 : 0), 0);

  let tierIdx = 0;
  for (let i = 0; i < ROLE_LADDER.length; i++) {
    if (completed >= ROLE_LADDER[i].threshold) tierIdx = i;
  }
  const role = ROLE_LADDER[tierIdx];
  const next = ROLE_LADDER[tierIdx + 1] || null;
  const activeId = NODE_CHAIN.find(id => states[id] === "active") || null;
  const activePct = (activeId && progress[activeId]) ? progress[activeId].pct : 0;

  return { tierIdx, role, next, completed, activeId, activePct };
}

const INCIDENTS = {
  "emea": {
    id: "emea",
    severity: "CRITICAL",
    region: "EMEA REGION",
    title: "Credential Phishing Campaign",
    desc: "Active credential harvesting operation across EMEA corporate accounts. Multi-vector phishing with spoofed executive domains targeting 400+ employees. Finance manager J. Okafor reported the first spoofed email.",
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
    desc: "Anomalous authentication events detected — multiple failed MFA challenges from unfamiliar geolocations targeting privileged accounts. The most-targeted account belongs to J. Okafor (Finance) — the same employee who flagged the OPS-001 phishing wave.",
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
   PHASE 3 — PERSISTENT OPERATIONAL WORLD  (presentation-only)
   ------------------------------------------------------------
   CyberCorp is a living, persistent organization: the same
   employees, departments and adversary infrastructure recur,
   and earlier incidents are referenced later. All of this is
   AUTHORED data surfaced READ-ONLY and keyed on the existing
   completed-mission mirror (getMissionStates()). Nothing here
   ever writes localStorage or introduces a new persisted store.
   ============================================================ */

// Canonical department set — the single source of truth referenced across
// incidents, comms, bulletins and reactive callbacks.
const DEPARTMENTS = {
  finance:     "Finance",
  hr:          "Human Resources",
  engineering: "Engineering",
  exec:        "Executive Operations",
  itinfra:     "IT Infrastructure",
  legal:       "Legal",
  secops:      "Security Operations",
};
function deptName(key) { return DEPARTMENTS[key] || "Security Operations"; }

// Recurring CyberCorp employees — organizational memory. The same people show
// up across incidents, bulletins and reactive notes so the world feels staffed.
const EMPLOYEES = {
  okafor:    { name: "J. Okafor",    title: "Finance Manager",          dept: "finance" },
  whitfield: { name: "D. Whitfield", title: "VP, Executive Operations", dept: "exec" },
  nwosu:     { name: "P. Nwosu",     title: "Infrastructure Engineer",  dept: "itinfra" },
  park:      { name: "L. Park",      title: "HR Business Partner",      dept: "hr" },
};

// Recurring adversary infrastructure / TTP clusters — NOT named villains.
// Missions reuse the same domains, ASNs and tradecraft so attribution carries
// across assignments.
const THREAT_ACTORS = {
  fin12: {
    label: "FIN-12",
    summary: "Financially-motivated phishing crew — spoofed executive domains, credential harvesting.",
    infra: ["cybercorp-support[.]net", "AS8003 (bulletproof hosting)"],
    ttps:  ["spoofed executive domains", "MFA-failure bursts", "credential theft"],
  },
  redbeacon: {
    label: "Cobalt Strike cluster",
    summary: "Hands-on-keyboard intrusion set — Cobalt Strike beacons, ransomware precursors.",
    infra: ["185.220.101.47", "AS47337 (RU)", "203.0.113.0/24"],
    ttps:  ["Cobalt Strike C2", "pass-the-hash lateral movement", "Black Basta precursors"],
  },
};
function actorLabel(key) { return THREAT_ACTORS[key]?.label || "unattributed activity"; }

// Per-node continuity. `dept`/`employee`/`actor` tie an incident to the world
// model; `resolved` is a short trace shown ONCE that mission is complete
// (reactive world state); `connects` links to a PRIOR node and only surfaces
// when that prior mission is complete (mission connections that reward memory).
const WORLD_CONTINUITY = {
  "emea":    { dept: "finance",     employee: "okafor",    actor: "fin12",
               resolved: "FIN-12 phishing domain cybercorp-support[.]net blocked at the perimeter." },
  "apac":    { dept: "itinfra",     employee: "nwosu",     actor: "redbeacon",
               resolved: "APAC source host 10.44.2.19 isolated; pass-the-hash playbook updated." },
  "na-east": { dept: "engineering", actor: "redbeacon",    connects: "apac",
               resolved: "Cobalt Strike C2 185.220.101.47 sinkholed; AS47337 range geo-blocked." },
  "latam":   { dept: "itinfra",     actor: "redbeacon",    connects: "na-east",
               resolved: "Recon range 203.0.113.0/24 added to the perimeter blocklist." },
  "mena":    { dept: "exec",        employee: "whitfield", actor: "fin12",     connects: "emea",
               resolved: "Privileged-account MFA hardened after the 47-failure burst." },
  "sea":     { dept: "secops",      actor: "redbeacon",    connects: "latam",
               resolved: "DMZ exposure closed; CDN probe baseline re-tuned." },
};

// Security bulletins — short, atmospheric Operations Center notices. A bulletin
// with `after` (a node id) is REACTIVE: it only enters rotation once that real
// mission is complete. Bulletins without `after` are always in rotation.
const SECURITY_BULLETINS = [
  { tag: "PHISHING", text: "Reminder: CyberCorp will never request VPN credentials by email. Forward suspicious mail to Security Operations." },
  { tag: "ADVISORY", text: "Patch advisory — apply the CVE-2026-1033 VPN appliance fix. Active exploitation observed in the wild." },
  { tag: "FINANCE",  text: "Finance reports increased invoice-fraud attempts. Verify any payment-detail change out-of-band." },
  { tag: "IT INFRA", text: "Scheduled maintenance: IT Infrastructure rotates resolver-02 at 13:00 UTC." },
  { tag: "HR",       text: "Mandatory security-awareness refresher is due this quarter — see the HR portal." },
  { tag: "EXEC OPS", text: "Executive Operations: heightened spear-phishing risk targeting finance approvers." },
  { tag: "RESOLVED", text: "FIN-12 phishing infrastructure blocked. Stay alert for re-registered look-alike domains.", after: "emea" },
  { tag: "RESOLVED", text: "Cobalt Strike C2 sinkholed on NA-East. AS47337 reuse is being monitored across regions.", after: "na-east" },
];

// Dev guard: a `connects` edge must reference a PRIOR mission in NODE_CHAIN,
// otherwise the "resembles infrastructure from …" link could only appear after a
// LATER mission completes. Warns on violation; silent (clean console) when valid.
Object.entries(WORLD_CONTINUITY).forEach(([id, cont]) => {
  if (cont.connects && NODE_CHAIN.indexOf(cont.connects) >= NODE_CHAIN.indexOf(id)) {
    console.warn(`[continuity] ${id}.connects "${cont.connects}" is not a prior mission in NODE_CHAIN.`);
  }
});

// Read-only snapshot of the persistent world derived from completed missions.
function getWorldState() {
  const states = getMissionStates();
  const completed = new Set(NODE_CHAIN.filter(id => states[id] === "completed"));
  return { states, completed };
}

// Reactive intel: the "resolved" traces for completed missions, surfaced in the
// Intel feed as organizational memory. Derived read-only each render.
function getWorldMemoryIntel() {
  const { completed } = getWorldState();
  const items = [];
  NODE_CHAIN.forEach(id => {
    const cont = WORLD_CONTINUITY[id];
    if (completed.has(id) && cont?.resolved) {
      const opId = INCIDENTS[id]?.opId || id.toUpperCase();
      items.push({ kind: "memory", text: `Case file ${opId}: ${cont.resolved}` });
    }
  });
  return items;
}

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
   EVIDENCE HOLOTABLE — mission interiors (experimental)
   ------------------------------------------------------------
   A re-skinnable mission interior. Opening a holotable mission
   from the Operations Center map transitions into a top-down
   holographic "evidence table" where the mission's artifacts
   materialize as inspectable tokens. The analyst inspects each
   token, classifies it (malicious / benign), pins the malicious
   ones to the evidence board, then chooses a containment action.

   PROTOTYPE INVARIANT: mock data only. The holotable NEVER writes
   to localStorage / the real game's progress (the map remains a
   read-only mirror). State here is in-memory and resets each open.

   All six prototype missions (001–006) have a holotable interior;
   each is fully data-driven from the entries below (see
   launchWorkspace for routing).
   ============================================================ */
const HOLOTABLE_MISSIONS = {
  "mission-001": {
    severity: "CRITICAL",
    region:   "EMEA REGION",
    opId:     "OPS-2026-001",
    title:    "Credential Phishing Campaign",
    briefing:
      "SOC LEAD — Sarah Reyes:\n\n" +
      "A user reported a \"re-verify your VPN\" email. Several look-alike\n" +
      "artifacts surfaced around this incident. Inspect each one on the\n" +
      "holotable, flag the malicious items, then choose how to contain\n" +
      "the threat. Take your time — re-inspect anything you're unsure of.",
    // Artifacts arranged in a ring around the incident core. `verdict` is the
    // ground truth used to grade classification. `notes` are neutral analyst
    // observations (clues), never a verdict giveaway.
    artifacts: [
      {
        id: "lure-email",
        kind: "EMAIL",
        icon: "✉",
        label: "VPN Re-Verification Notice",
        verdict: "malicious",
        detail:
          "From:    IT Helpdesk <it-helpdesk@cybercorp.com>\n" +
          "To:      r.okafor@cybercorp.com\n" +
          "Subject: ACTION REQUIRED — Re-verify your VPN access (24h)\n\n" +
          "Our records show your VPN credentials expire today. To avoid\n" +
          "losing remote access, confirm your username and password using\n" +
          "the secure portal below within 24 hours:\n\n" +
          "    >> https://sso.cybercorp-support.net/verify\n\n" +
          "Failure to act will suspend your account.\n" +
          "— CyberCorp IT Helpdesk",
        notes: [
          "Manufactured urgency and a 24-hour deadline.",
          "Asks the user to confirm a username AND password via a link.",
          "Link host is not the corporate domain you'd expect.",
        ],
      },
      {
        id: "spoofed-headers",
        kind: "HEADERS",
        icon: "⚙",
        label: "Message Headers",
        verdict: "malicious",
        detail:
          "From:        IT Helpdesk <it-helpdesk@cybercorp.com>\n" +
          "Return-Path: <bounce@cybercorp-support.net>\n" +
          "Reply-To:    support@cybercorp-support.net\n" +
          "Received:    from mail.unknown-relay-83.ru (45.139.x.x)\n" +
          "SPF:         FAIL (cybercorp.com does not authorize this sender)\n" +
          "DKIM:        none",
        notes: [
          "Display From says cybercorp.com, but Return-Path/Reply-To don't.",
          "SPF fails — the real domain did not authorize this sender.",
          "Mail was relayed through an unfamiliar foreign host.",
        ],
      },
      {
        id: "lookalike-domain",
        kind: "DOMAIN",
        icon: "🌐",
        label: "cybercorp-support.net",
        verdict: "malicious",
        detail:
          "Domain:     cybercorp-support.net\n" +
          "Registered: 2 days ago\n" +
          "Registrar:  privacy-shielded (WHOIS redacted)\n" +
          "Hosting:    AS8003 — flagged bulletproof host\n" +
          "Owner:      NOT CyberCorp Inc. (asset registry: no match)",
        notes: [
          "A look-alike of the real cybercorp.com domain.",
          "Registered only 2 days ago — typical of phishing infrastructure.",
          "Not present in the corporate asset registry.",
        ],
      },
      {
        id: "harvest-url",
        kind: "URL",
        icon: "🔗",
        label: "sso.cybercorp-support.net/verify",
        verdict: "malicious",
        detail:
          "URL:      https://sso.cybercorp-support.net/verify\n" +
          "Resolves: 45.139.x.x (same host as the mail relay)\n" +
          "Page:     clone of the CyberCorp SSO login screen\n" +
          "Form:     POSTs username + password to /collect.php\n" +
          "TLS:      free cert issued 2 days ago",
        notes: [
          "A pixel-clone of the real SSO login page.",
          "The form sends typed credentials to an external collector.",
          "Hosted on the same suspicious infrastructure as the sender.",
        ],
      },
      {
        id: "it-newsletter",
        kind: "EMAIL",
        icon: "📰",
        label: "Monthly Security Newsletter",
        verdict: "benign",
        detail:
          "From:    Security Team <security@cybercorp.com>\n" +
          "Subject: This Month in Security — Tips & Reminders\n\n" +
          "Hi team — a quick reminder to keep your devices patched and\n" +
          "report anything suspicious to the SOC. No action needed on\n" +
          "this message. Read more on the internal wiki (intranet only).\n" +
          "SPF: PASS   DKIM: PASS",
        notes: [
          "Sent from the genuine corporate domain (SPF & DKIM pass).",
          "Does not ask for credentials or set a deadline.",
          "Only points to internal, intranet-only resources.",
        ],
      },
      {
        id: "vpn-portal",
        kind: "SYSTEM",
        icon: "🛡",
        label: "Official VPN Portal",
        verdict: "benign",
        detail:
          "Asset:    vpn.cybercorp.com\n" +
          "Owner:    CyberCorp IT Infrastructure (asset registry: verified)\n" +
          "Cert:     EV cert, issued to CyberCorp Inc., valid 11 months\n" +
          "Status:   reachable, normal traffic baseline\n" +
          "Note:     the legitimate destination for VPN management",
        notes: [
          "The real, registry-verified corporate VPN portal.",
          "Long-lived EV certificate issued to CyberCorp Inc.",
          "This is where legitimate VPN actions actually happen.",
        ],
      },
    ],
    // Final containment options. `quality` grades the choice.
    decisions: [
      {
        id: "contain-full",
        quality: "excellent",
        label: "Reset affected credentials & block the sender domain",
        sub: "Force a password reset for the targeted user, block cybercorp-support.net at the mail gateway, and pull the phishing mail from all inboxes.",
        outcome: "Credentials rotated before the attacker could use them. The look-alike domain is blocked and the campaign mail is purged org-wide.",
      },
      {
        id: "contain-warn",
        quality: "weak",
        label: "Email staff a warning, take no system action",
        sub: "Send an awareness notice but leave accounts and the malicious domain untouched for now.",
        outcome: "Awareness helps, but exposed credentials and the live phishing domain remain a standing risk. Partial containment only.",
      },
      {
        id: "contain-ignore",
        quality: "poor",
        label: "Close the ticket — likely a false alarm",
        sub: "Treat the report as low priority and take no action.",
        outcome: "The campaign stays live and credentials remain exposed. This is how account takeover incidents begin.",
      },
    ],
    takeaway:
      "Credential phishing relies on look-alike domains, spoofed sender names, and urgency to trick users into typing real passwords into fake login pages. Cross-check the sending domain, the message headers (SPF/Return-Path), and where links actually resolve before trusting any 're-verify your account' request.",
    console: {
      stage: "mail",
      host: "r.okafor@cybercorp.com",
      termLabel: "mail-sec console",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-001  (Phishing Report)", c: "head" },
        { t: "Analyze the reported email using the tools on the left, or type a command." },
        { t: "Start with `triage`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "Message already open.",
      notReadyMsg:  "No message open yet — run `triage` first.",
      containLine:  "[+] Credentials reset and sender domain blocked. Campaign purged org-wide.",
      objectives: {
        start:       "Run `triage` to open the user-reported message.",
        investigate: "Analyze it: run `headers` and `links` to expose the spoofing.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "All malicious evidence flagged. Run `contain` to shut down the campaign.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "triage", kind: "scan", key: "triage", icon: "📂", name: "Open Report", hint: "triage",
          desc: "open the user-reported message      (start here)" },
        { cmd: "headers", kind: "reveal", key: "headers", icon: "⚙", name: "Header Analysis", hint: "headers",
          desc: "inspect SPF/DKIM & routing          (needs triage)" },
        { cmd: "links", kind: "reveal", key: "links", icon: "🔗", name: "Link Analysis", hint: "links",
          desc: "expand where links really resolve   (needs triage)" },
        { cmd: "intel cybercorp-support.net", kind: "intel", needs: "headers", icon: "⚲", name: "Threat Intel", hint: "intel <domain>",
          helpCmd: "intel <domain>", desc: "look up a domain against threat feeds" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      mail: {
        mailbox: "r.okafor@cybercorp.com — Reported Items",
        from:    "IT Helpdesk <it-helpdesk@cybercorp.com>",
        fromNote:"display name only — verify in headers",
        to:      "r.okafor@cybercorp.com",
        subject: "ACTION REQUIRED — Re-verify your VPN access (24h)",
        received:"Today 06:14 UTC · relayed via mail.unknown-relay-83.ru",
        body: [
          "Our records show your VPN credentials expire today. To avoid losing remote access, confirm your username and password using the secure portal below within 24 hours:",
          "{link}",
          "Failure to act will suspend your account.",
          "— CyberCorp IT Helpdesk",
        ],
        link: {
          text: "https://sso.cybercorp-support.net/verify",
          real: "45.139.x.x · clone of CyberCorp SSO, POSTs to /collect.php",
        },
        headers: [
          { k: "Display-From", v: "it-helpdesk@cybercorp.com", bad: false },
          { k: "Return-Path",  v: "bounce@cybercorp-support.net", bad: true },
          { k: "Reply-To",     v: "support@cybercorp-support.net", bad: true },
          { k: "Received",     v: "mail.unknown-relay-83.ru (45.139.x.x)", bad: true },
          { k: "SPF",          v: "FAIL — cybercorp.com did not authorize sender", bad: true },
          { k: "DKIM",         v: "none", bad: true },
        ],
      },
      reveal: {
        triage:  ["lure-email", "it-newsletter"],
        headers: ["spoofed-headers"],
        links:   ["harvest-url", "lookalike-domain", "vpn-portal"],
      },
      out: {
        triage: [
          { t: "triage --report user-report-8842", c: "cmd" },
          { t: "[*] Pulling the reported message into the analyzer…", c: "dim" },
          { t: "  subject: ACTION REQUIRED — Re-verify your VPN access (24h)", c: "warn" },
          { t: "  also in mailbox: Monthly Security Newsletter (security@cybercorp.com)" },
          { t: "[+] Message loaded. 2 items queued — run `headers` and `links` to dig in.", c: "ok" },
        ],
        headers: [
          { t: "headers", c: "cmd" },
          { t: "Display-From: it-helpdesk@cybercorp.com", c: "" },
          { t: "Return-Path: bounce@cybercorp-support.net", c: "warn" },
          { t: "Received:    mail.unknown-relay-83.ru (45.139.x.x)", c: "warn" },
          { t: "SPF: FAIL    DKIM: none", c: "warn" },
          { t: "[+] Sender is spoofed — the real domain did not authorize it.", c: "ok" },
          { t: "[+] 1 artifact added to the evidence queue. Inspect & classify it.", c: "ok" },
        ],
        links: [
          { t: "links --expand", c: "cmd" },
          { t: "shown:    https://sso.cybercorp-support.net/verify", c: "" },
          { t: "resolves: 45.139.x.x → clone of CyberCorp SSO (/collect.php)", c: "warn" },
          { t: "domain:   cybercorp-support.net registered 2 days ago", c: "warn" },
          { t: "compare:  vpn.cybercorp.com (real, EV cert) — legitimate", c: "" },
          { t: "[+] Link harvests credentials to external infrastructure.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "cybercorp-support.net": [
            { t: "intel cybercorp-support.net", c: "cmd" },
            { t: "cybercorp-support.net → 45.139.x.x", c: "" },
            { t: "  registered 2 days ago · privacy-shielded WHOIS", c: "" },
            { t: "  AS8003 — flagged bulletproof host", c: "warn" },
            { t: "verdict: KNOWN-MALICIOUS (phishing)", c: "warn" },
          ],
          "vpn.cybercorp.com": [
            { t: "intel vpn.cybercorp.com", c: "cmd" },
            { t: "vpn.cybercorp.com  ·  CyberCorp IT Infrastructure", c: "" },
            { t: "  registry-verified asset, EV cert issued to CyberCorp Inc.", c: "" },
            { t: "verdict: KNOWN-GOOD", c: "ok" },
          ],
        },
      },
    },
  },

  "mission-002": {
    severity: "HIGH",
    region:   "APAC REGION",
    opId:     "OPS-2026-002",
    title:    "Lateral Movement Detected",
    briefing:
      "THREAT INTEL — Marcus Chen:\n\n" +
      "We're seeing east-west traffic between APAC segments that should\n" +
      "not be talking to each other. Looks like an attacker reusing stolen\n" +
      "credentials to hop host-to-host. Inspect the evidence, flag the\n" +
      "malicious activity, and separate it from normal admin work before\n" +
      "you decide how to contain.",
    artifacts: [
      {
        id: "pth-auth",
        kind: "AUTH LOG",
        icon: "🔑",
        label: "Pass-the-Hash Logon",
        verdict: "malicious",
        detail:
          "Host:    APAC-SEG-7 (10.44.7.55)\n" +
          "Account: svc_backup\n" +
          "Logon:   Type 3 (network) — NTLM\n" +
          "Source:  APAC-SEG-3 host 10.44.2.19\n" +
          "Flag:    NTLM hash reused, no interactive logon, 02:11 UTC",
        notes: [
          "A service account logging in over the network from a workstation segment.",
          "NTLM hash reuse with no matching interactive logon — classic pass-the-hash.",
          "Source host is the one already flagged as patient zero.",
        ],
      },
      {
        id: "east-west",
        kind: "NETFLOW",
        icon: "↔",
        label: "East-West Traffic Burst",
        verdict: "malicious",
        detail:
          "Flow:    10.44.2.19 → 10.44.7.55 → 10.44.7.61\n" +
          "Ports:   445 (SMB), 135 (RPC)\n" +
          "Volume:  short bursts, off-hours (02:00–02:30 UTC)\n" +
          "Baseline: these segments do not normally communicate",
        notes: [
          "SMB/RPC connections chaining across segments that are normally isolated.",
          "Activity is off-hours and bursty — consistent with hands-on-keyboard movement.",
          "The chain matches the credential-reuse pattern.",
        ],
      },
      {
        id: "remote-svc",
        kind: "PROCESS",
        icon: "⚙",
        label: "Remote Service Creation",
        verdict: "malicious",
        detail:
          "Host:   APAC-SEG-7 (10.44.7.55)\n" +
          "Event:  7045 — new service installed\n" +
          "Name:   \"WinHelpSvc\"  Path: C:\\Windows\\Temp\\wh.exe\n" +
          "By:     svc_backup over SMB\n" +
          "Sig:    unsigned binary, created 02:13 UTC",
        notes: [
          "A new service installed remotely, named to look like a Windows component.",
          "Binary runs from a Temp folder and is unsigned.",
          "Created by the same reused service account, seconds after the logon.",
        ],
      },
      {
        id: "scheduled-backup",
        kind: "TASK",
        icon: "🗓",
        label: "Nightly Backup Job",
        verdict: "benign",
        detail:
          "Host:   APAC-FILE-02\n" +
          "Task:   \"CorpBackup-Nightly\"\n" +
          "Runs:   01:00 UTC daily, signed by Veeam\n" +
          "Account: svc_backup (expected here)\n" +
          "Status: completed normally, registered in CMDB",
        notes: [
          "A signed, scheduled backup that runs on its normal nightly cadence.",
          "Uses the backup account on the file server where it's expected.",
          "Registered in the asset/config database as a known job.",
        ],
      },
      {
        id: "admin-rdp",
        kind: "AUTH LOG",
        icon: "🖥",
        label: "Admin RDP Session",
        verdict: "benign",
        detail:
          "Host:    APAC-SEG-2 (10.44.2.8)\n" +
          "Account: m.chen-adm\n" +
          "Logon:   Type 10 (RemoteInteractive) — Kerberos\n" +
          "Source:  jump-host 10.44.0.5 (approved bastion)\n" +
          "Time:    09:40 UTC, MFA satisfied",
        notes: [
          "Interactive RDP from the approved jump host during business hours.",
          "Kerberos (not NTLM hash reuse) and MFA was satisfied.",
          "Matches a named admin's normal working pattern.",
        ],
      },
    ],
    decisions: [
      {
        id: "isolate-rotate",
        quality: "excellent",
        label: "Isolate the host chain & rotate the service account",
        sub: "Network-isolate the three implicated hosts, disable and rotate svc_backup, kill the rogue service, and escalate to the Incident Commander.",
        outcome: "The movement chain is severed before it reaches the domain core. The abused account is rotated and the rogue service removed — attacker access is cut.",
      },
      {
        id: "monitor-only",
        quality: "weak",
        label: "Increase monitoring, take no isolation action",
        sub: "Add alerting on the affected segments but leave hosts and the service account online.",
        outcome: "You'll see more of the attack, but the attacker keeps moving in real time. Visibility without containment lets the breach widen.",
      },
      {
        id: "reboot-host",
        quality: "poor",
        label: "Reboot the source host and close the ticket",
        sub: "Restart 10.44.2.19 and assume that clears it.",
        outcome: "A reboot doesn't remove reused credentials or the remote service. The attacker simply reconnects — the incident continues unseen.",
      },
    ],
    takeaway:
      "Lateral movement shows up as credential reuse (pass-the-hash), unexpected east-west SMB/RPC traffic, and remotely-created services. Separate it from legitimate admin work by checking logon type, auth protocol, source host, and whether the activity matches a known, signed, scheduled job.",
    console: {
      stage: "network",
      host: "APAC-SEG-3",
      termLabel: "siem console",
      flowCmd: "netflow",
      focusCmd: "sessions",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-002  (APAC-EAST)", c: "head" },
        { t: "Trace the lateral movement using the tools on the left, or type a command." },
        { t: "Start with `scan`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "Segment already mapped.",
      notReadyMsg:  "Segment not mapped yet — run `scan` first.",
      containLine:  "[+] Host chain isolated and svc_backup rotated on the map. Movement stopped.",
      objectives: {
        start:       "Run `scan` to map the APAC-EAST segment.",
        investigate: "Trace the movement: run `netflow` and `sessions` to surface evidence.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "All malicious evidence flagged. Run `contain` to sever the chain.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "scan", kind: "scan", key: "scan", icon: "◎", name: "Segment Scan", hint: "scan",
          desc: "map live hosts on the segment" },
        { cmd: "netflow APAC-SEG-3", kind: "reveal", key: "netflow", icon: "↔", name: "Netflow", hint: "netflow APAC-SEG-3",
          desc: "trace east-west connections          (needs scan)" },
        { cmd: "sessions APAC-SEG-7", kind: "reveal", key: "sessions", icon: "🔑", name: "Logon Audit", hint: "sessions APAC-SEG-7",
          desc: "audit logons & new services          (needs scan)" },
        { cmd: "intel 10.44.2.19", kind: "intel", needs: "netflow", icon: "⚲", name: "Threat Intel", hint: "intel <host>",
          helpCmd: "intel <host>", desc: "look up a host or account against intel" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      nodes: [
        { id: "dc",   label: "DC / KDC",      type: "gateway", x: 50, y: 16 },
        { id: "soc",  label: "SOC / SIEM",    type: "sensor",  x: 16, y: 47 },
        { id: "seg3", label: "APAC-SEG-3",    type: "host",    x: 50, y: 56, focus: true },
        { id: "jump", label: "JUMP-HOST",     type: "host",    x: 16, y: 14 },
        { id: "file", label: "APAC-FILE-02",  type: "host",    x: 30, y: 84 },
        { id: "seg7", label: "APAC-SEG-7",    type: "host",    x: 80, y: 80, external: true },
      ],
      infraLinks: [["dc", "soc"], ["dc", "seg3"], ["dc", "jump"], ["dc", "file"]],
      threatLink: { from: "seg3", to: "seg7", label: "LATERAL · SMB/RPC" },
      benignLink: { from: "jump", to: "file", label: "ADMIN RDP" },
      reveal: {
        netflow:  ["east-west", "pth-auth", "admin-rdp"],
        sessions: ["remote-svc", "scheduled-backup"],
      },
      out: {
        scan: [
          { t: "scan --segment APAC-EAST", c: "cmd" },
          { t: "[*] Sweeping APAC-EAST for live hosts…", c: "dim" },
          { t: "  APAC-FILE-02   up    nightly backup window" },
          { t: "  JUMP-HOST      up    bastion, healthy" },
          { t: "  APAC-SEG-3     up    off-hours SMB/RPC to other segments", c: "warn" },
          { t: "[+] 3 hosts online. APAC-SEG-3 is reaching segments it normally can't.", c: "ok" },
          { t: "    Next: run `netflow` and `sessions` to investigate it.", c: "dim" },
        ],
        netflow: [
          { t: "netflow APAC-SEG-3", c: "cmd" },
          { t: "TIME      FLOW                          PORT  NOTE", c: "head" },
          { t: "02:11  10.44.2.19 → 10.44.7.55          445   NTLM, off-hours", c: "warn" },
          { t: "02:14  10.44.7.55 → 10.44.7.61          135   RPC chain", c: "warn" },
          { t: "09:40  10.44.0.5  → 10.44.2.8           3389  approved bastion RDP" },
          { t: "[+] East-west SMB/RPC chain off-hours — textbook lateral movement.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        sessions: [
          { t: "sessions --host APAC-SEG-7", c: "cmd" },
          { t: "EVENT  DETAIL                              SIGNED", c: "head" },
          { t: "4624   svc_backup  Type 3 (NTLM)  src 10.44.2.19   —", c: "warn" },
          { t: "7045   new service WinHelpSvc  C:\\Windows\\Temp\\wh.exe  NO", c: "warn" },
          { t: "T-Sched CorpBackup-Nightly  01:00 daily  signed by Veeam  YES" },
          { t: "[+] Remote service created seconds after a pass-the-hash logon.", c: "ok" },
          { t: "[+] 2 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "10.44.2.19": [
            { t: "intel 10.44.2.19", c: "cmd" },
            { t: "10.44.2.19  ·  APAC-SEG-3 workstation", c: "" },
            { t: "  flagged patient-zero in this incident", c: "warn" },
            { t: "  host fingerprint matches threat actor group FIN-12", c: "warn" },
            { t: "verdict: COMPROMISED", c: "warn" },
          ],
          "svc_backup": [
            { t: "intel svc_backup", c: "cmd" },
            { t: "svc_backup  ·  service account (backup tier)", c: "" },
            { t: "  expected on APAC-FILE-02 only — seen authenticating to SEG-7", c: "warn" },
            { t: "verdict: CREDENTIAL ABUSE", c: "warn" },
          ],
        },
      },
    },
  },

  "mission-003": {
    severity: "HIGH",
    region:   "NA-EAST REGION",
    opId:     "OPS-2026-003",
    title:    "Malware Outbreak — C2 Beacon",
    briefing:
      "INCIDENT COMMANDER — Cmdr. Brooks:\n\n" +
      "EDR lit up with Cobalt Strike beacon activity on NA-East endpoints —\n" +
      "this is likely a ransomware precursor and our window is narrow.\n" +
      "Inspect the artifacts, flag the malicious C2 indicators, and keep the\n" +
      "legitimate software out of your evidence pile, then choose containment.",
    artifacts: [
      {
        id: "beacon-proc",
        kind: "PROCESS",
        icon: "📡",
        label: "Beaconing Process",
        verdict: "malicious",
        detail:
          "Host:   NA-WS-1092\n" +
          "Proc:   rundll32.exe → C:\\Users\\Public\\msupd.dll\n" +
          "Parent: winword.exe (macro-spawned)\n" +
          "Net:    HTTPS to 185.220.101.47 every 60s (± jitter)\n" +
          "Sig:    unsigned DLL, created today 03:50 UTC",
        notes: [
          "rundll32 loading an unsigned DLL from a public folder, spawned by Word.",
          "Regular 60-second callbacks with jitter — textbook beacon behavior.",
          "Process tree starts from a macro-enabled document.",
        ],
      },
      {
        id: "c2-domain",
        kind: "DOMAIN",
        icon: "🌐",
        label: "update-svc-cdn.net",
        verdict: "malicious",
        detail:
          "Domain:     update-svc-cdn.net\n" +
          "Resolves:   185.220.101.47\n" +
          "Registered: 6 days ago, privacy-shielded\n" +
          "Intel:      listed on 3 feeds as Cobalt Strike C2\n" +
          "ASN:        AS47337 — flagged bulletproof host",
        notes: [
          "A newly-registered domain masquerading as a software-update CDN.",
          "Resolves to the same IP the beacon is calling.",
          "Already on multiple threat feeds as known C2 infrastructure.",
        ],
      },
      {
        id: "persist-task",
        kind: "TASK",
        icon: "🗓",
        label: "Persistence Scheduled Task",
        verdict: "malicious",
        detail:
          "Host:  NA-WS-1092\n" +
          "Task:  \"GoogleUpdaterTaskCore\"\n" +
          "Runs:  at logon → powershell -enc <base64>\n" +
          "Sig:   not signed by Google; created 03:51 UTC\n" +
          "Decoded: downloads stage-2 from update-svc-cdn.net",
        notes: [
          "A task impersonating a Google updater but not signed by Google.",
          "Runs an encoded PowerShell command at every logon (persistence).",
          "Decoded payload pulls a second stage from the C2 domain.",
        ],
      },
      {
        id: "edr-agent",
        kind: "SYSTEM",
        icon: "🛡",
        label: "EDR Agent Service",
        verdict: "benign",
        detail:
          "Host:   NA-WS-1092\n" +
          "Proc:   CrowdStrike Falcon Sensor (CSFalconService)\n" +
          "Sig:    valid, signed by CrowdStrike Inc.\n" +
          "Path:   C:\\Program Files\\CrowdStrike\\\n" +
          "Status: healthy — this is what raised the alert",
        notes: [
          "The endpoint protection agent itself, signed and in its normal path.",
          "This is the sensor that detected the beacon.",
          "Quarantining or killing it would blind you to the attack.",
        ],
      },
      {
        id: "win-update",
        kind: "PROCESS",
        icon: "⬇",
        label: "Windows Update Service",
        verdict: "benign",
        detail:
          "Host:   NA-WS-1092\n" +
          "Proc:   svchost.exe -k netsvcs (wuauserv)\n" +
          "Net:    HTTPS to *.windowsupdate.microsoft.com\n" +
          "Sig:    signed Microsoft binary, normal path\n" +
          "Pattern: bursty downloads, not periodic beaconing",
        notes: [
          "Genuine Windows Update traffic to Microsoft's own domains.",
          "Signed system binary running from its expected location.",
          "Download pattern is bursty, not the steady beacon cadence.",
        ],
      },
    ],
    decisions: [
      {
        id: "quarantine-block",
        quality: "excellent",
        label: "Quarantine the host & block the C2 at the firewall",
        sub: "Network-quarantine NA-WS-1092 via EDR, block update-svc-cdn.net / 185.220.101.47 at the perimeter, and remove the persistence task before ransomware stage-2 lands.",
        outcome: "The beacon is severed and the host is contained inside the response window. Persistence is removed and stage-2 can't download — the ransomware drop is prevented.",
      },
      {
        id: "av-scan",
        quality: "weak",
        label: "Run a full AV scan, leave the host online",
        sub: "Kick off an on-demand scan but keep the workstation connected to the network.",
        outcome: "A scan may flag files, but the beacon keeps calling out and can fetch stage-2 mid-scan. Leaving it online keeps the C2 channel open.",
      },
      {
        id: "ignore-edr",
        quality: "poor",
        label: "Disable the EDR alert as a false positive",
        sub: "Assume the 'updater' traffic is benign and silence the detection.",
        outcome: "Silencing your own sensor blinds the SOC while the attacker stages ransomware. This is exactly how outbreaks spread.",
      },
    ],
    takeaway:
      "C2 beacons reveal themselves through regular jittered callbacks, unsigned DLLs loaded by office apps, and persistence tasks impersonating trusted updaters. Confirm the destination against threat intel and never silence or quarantine your own EDR — it's the sensor that sees the attack.",
    // ---- Live SOC Console config (vertical slice). Drives the reactive network
    // map + terminal interior. Holotable ignores this block entirely. ----
    console: {
      stage: "network",
      host: "NA-WS-1092",
      termLabel: "analyst console",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-003  (NA-WS-1092)", c: "head" },
        { t: "Investigate the alert using the tools on the left, or type a command." },
        { t: "Start with `scan`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "Segment already mapped.",
      notReadyMsg:  "Network not mapped yet — run `scan` first.",
      containLine:  "[+] C2 channel severed on the network map. Incident closed.",
      objectives: {
        start:       "Run `scan` to discover live hosts on the segment.",
        investigate: "Investigate NA-WS-1092: run `netflow` and `procscan` to surface evidence.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "All malicious evidence flagged. Run `contain` to neutralize the threat.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "scan", kind: "scan", key: "scan", icon: "◎", name: "Network Scan", hint: "scan",
          desc: "discover live hosts on the segment" },
        { cmd: "netflow NA-WS-1092", kind: "reveal", key: "netflow", icon: "⇄", name: "Netflow", hint: "netflow NA-WS-1092",
          desc: "inspect NA-WS-1092 outbound connections  (needs scan)" },
        { cmd: "procscan NA-WS-1092", kind: "reveal", key: "procscan", icon: "▤", name: "Process Audit", hint: "procscan NA-WS-1092",
          desc: "audit processes & persistence            (needs scan)" },
        { cmd: "intel update-svc-cdn.net", kind: "intel", needs: "netflow", icon: "⚲", name: "Threat Intel", hint: "intel <ioc>",
          helpCmd: "intel <ioc>", desc: "look up a domain or IP against threat feeds" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      // Map nodes (x/y are % of the map area). type drives styling.
      nodes: [
        { id: "fw",     label: "PERIMETER FW",   type: "gateway", x: 50, y: 16 },
        { id: "soc",    label: "SOC / EDR",      type: "sensor",  x: 16, y: 47 },
        { id: "ws1092", label: "NA-WS-1092",     type: "host",    x: 50, y: 56, focus: true },
        { id: "ws1090", label: "NA-WS-1090",     type: "host",    x: 30, y: 84 },
        { id: "srv04",  label: "NA-SRV-04",      type: "host",    x: 70, y: 84 },
        { id: "msupd",  label: "MS UPDATE",      type: "cloud",   x: 16, y: 14, external: true },
        { id: "c2",     label: "185.220.101.47", type: "threat",  x: 86, y: 14, external: true },
      ],
      // Internal segment links — appear after `scan`.
      infraLinks: [["fw", "soc"], ["fw", "ws1092"], ["fw", "ws1090"], ["fw", "srv04"]],
      // External flows — appear after `netflow`.
      threatLink: { from: "ws1092", to: "c2",    label: "BEACON · 60s" },
      benignLink: { from: "ws1092", to: "msupd", label: "WIN UPDATE" },
      // Which command surfaces which artifacts, and which map node each lights up.
      reveal: {
        netflow:  ["beacon-proc", "c2-domain", "win-update"],
        procscan: ["persist-task", "edr-agent"],
      },
      nodeOf: {
        "beacon-proc": "ws1092",
        "c2-domain":   "c2",
        "win-update":  "msupd",
        "persist-task": "ws1092",
        "edr-agent":    "soc",
      },
      // Terminal output scripts. Each line: { t: text, c?: ok|warn|dim|head }.
      out: {
        scan: [
          { t: "scan --subnet NA-EAST/24", c: "cmd" },
          { t: "[*] Sweeping NA-EAST segment for live hosts…", c: "dim" },
          { t: "  NA-WS-1090    up    baseline traffic" },
          { t: "  NA-SRV-04     up    baseline traffic" },
          { t: "  SOC / EDR     up    sensor healthy" },
          { t: "  NA-WS-1092    up    anomalous periodic outbound (HTTPS)", c: "warn" },
          { t: "[+] 4 hosts online. NA-WS-1092 is calling out on a timer.", c: "ok" },
          { t: "    Next: run `netflow` and `procscan` to investigate it.", c: "dim" },
        ],
        netflow: [
          { t: "netflow NA-WS-1092", c: "cmd" },
          { t: "TIME      DST                      PORT  BYTES  PATTERN", c: "head" },
          { t: "03:50:12  185.220.101.47           443   2.1K   every 60s ±jitter", c: "warn" },
          { t: "03:51:40  *.windowsupdate.ms.com   443   48M    bursty download" },
          { t: "03:52:13  185.220.101.47           443   2.0K   every 60s ±jitter", c: "warn" },
          { t: "[+] Steady 60-second callbacks to 185.220.101.47 — textbook C2 beacon.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        procscan: [
          { t: "procscan NA-WS-1092", c: "cmd" },
          { t: "PID   PROCESS                     SIGNED  NOTES", c: "head" },
          { t: "6612  rundll32.exe (msupd.dll)    NO      parent: winword.exe", c: "warn" },
          { t: " 980  CSFalconService             YES     CrowdStrike sensor" },
          { t: "1224  svchost.exe -k netsvcs      YES     wuauserv" },
          { t: "TASKS:", c: "head" },
          { t: "  GoogleUpdaterTaskCore  logon  powershell -enc <b64>  NOT signed by Google", c: "warn" },
          { t: "[+] 2 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "update-svc-cdn.net": [
            { t: "intel update-svc-cdn.net", c: "cmd" },
            { t: "update-svc-cdn.net → 185.220.101.47", c: "" },
            { t: "  registered 6 days ago · privacy-shielded WHOIS" },
            { t: "  listed on 3 feeds: Cobalt Strike C2 (HIGH confidence)", c: "warn" },
            { t: "verdict: KNOWN-MALICIOUS", c: "warn" },
          ],
          "185.220.101.47": [
            { t: "intel 185.220.101.47", c: "cmd" },
            { t: "185.220.101.47  ·  AS47337 (flagged bulletproof host)" },
            { t: "  reverse: update-svc-cdn.net" },
            { t: "  threat feeds: Cobalt Strike C2 — active", c: "warn" },
            { t: "verdict: KNOWN-MALICIOUS", c: "warn" },
          ],
        },
      },
    },
  },

  "mission-004": {
    severity: "MEDIUM",
    region:   "LATAM REGION",
    opId:     "OPS-2026-004",
    title:    "Reconnaissance Sweep",
    briefing:
      "JUNIOR ANALYST SUPPORT — Sarah Reyes:\n\n" +
      "Good learning op. Someone is mapping our LATAM perimeter from an\n" +
      "unfamiliar IP range — port scans and service fingerprinting, the\n" +
      "kind of activity that comes before an attack. Inspect the evidence,\n" +
      "flag the recon, and tell it apart from our own scheduled scans.",
    artifacts: [
      {
        id: "port-sweep",
        kind: "IDS ALERT",
        icon: "🔎",
        label: "Sequential Port Scan",
        verdict: "malicious",
        detail:
          "Source: 203.0.113.42\n" +
          "Target: LATAM perimeter /24\n" +
          "Ports:  22, 80, 443, 8080, 3389 (in order, per host)\n" +
          "Rate:   ~40 hosts/min, 02:00–02:40 UTC\n" +
          "Intel:  203.0.113.0/24 flagged on 3 feeds",
        notes: [
          "A tight, ordered sweep of common service ports across the whole subnet.",
          "Methodical host-by-host pattern — automated reconnaissance, not browsing.",
          "Source range is already flagged across multiple threat feeds.",
        ],
      },
      {
        id: "banner-grab",
        kind: "PROXY LOG",
        icon: "🏷",
        label: "Service Banner Grabbing",
        verdict: "malicious",
        detail:
          "Source: 203.0.113.42\n" +
          "Action: HTTP HEAD / + odd User-Agent (Shodan-like)\n" +
          "Goal:   collect server version banners\n" +
          "Hosts:  every responsive web service on the perimeter\n" +
          "Note:   no real content fetched, only headers",
        notes: [
          "Requests only grab version banners, never real page content.",
          "User-Agent matches mass-scanning / fingerprinting tools.",
          "Aimed at every responsive service — building a target inventory.",
        ],
      },
      {
        id: "exposed-rdp",
        kind: "FIREWALL",
        icon: "🚪",
        label: "Exposed RDP Service",
        verdict: "malicious",
        detail:
          "Asset:  latam-edge-03 : 3389 OPEN to 0.0.0.0/0\n" +
          "Note:   RDP should never be internet-facing\n" +
          "Hits:   answered the scanner's 3389 probe\n" +
          "Owner:  misconfig — not in approved exposure list",
        notes: [
          "Remote Desktop is exposed directly to the entire internet.",
          "It answered the scanner — now a known, attackable target.",
          "Not on the approved external-exposure list; a real misconfiguration.",
        ],
      },
      {
        id: "uptime-monitor",
        kind: "SYSTEM",
        icon: "💚",
        label: "External Uptime Monitor",
        verdict: "benign",
        detail:
          "Source: 198.51.100.10 (Pingdom, approved)\n" +
          "Action: HTTPS GET /health every 60s\n" +
          "Scope:  only the public status endpoint\n" +
          "Listed: in the perimeter allow-list / vendor registry",
        notes: [
          "A contracted uptime service hitting only the health endpoint.",
          "Predictable 60-second checks, not a port sweep.",
          "Source is on the approved vendor allow-list.",
        ],
      },
      {
        id: "internal-vulnscan",
        kind: "SCAN",
        icon: "🗓",
        label: "Scheduled Vulnerability Scan",
        verdict: "benign",
        detail:
          "Source: 10.60.0.30 (internal Nessus, IT Security)\n" +
          "Window: Sundays 03:00–05:00 UTC (change-approved)\n" +
          "Scope:  internal LATAM subnets, authenticated\n" +
          "Ticket: CHG-2026-0412 on file",
        notes: [
          "Our own authenticated vulnerability scanner on its approved schedule.",
          "Runs from an internal IP within a change-approved window.",
          "Backed by a change ticket — expected, sanctioned activity.",
        ],
      },
    ],
    decisions: [
      {
        id: "block-harden",
        quality: "excellent",
        label: "Block the source range & close the exposed RDP",
        sub: "Add 203.0.113.0/24 to the perimeter block list, remove latam-edge-03's internet-facing 3389, and document the recon for trending.",
        outcome: "The scanning source is blocked and the exposed RDP — the one real foothold — is closed before recon turns into exploitation. Clean, proportionate response.",
      },
      {
        id: "watchlist",
        quality: "weak",
        label: "Add the IP to a watchlist, leave RDP as-is",
        sub: "Monitor 203.0.113.42 but don't change the firewall yet.",
        outcome: "You'll notice if it comes back, but the exposed RDP stays open and the scanner already has the map. Partial response leaves the door ajar.",
      },
      {
        id: "no-action-recon",
        quality: "poor",
        label: "Close the ticket — just a scan, no breach",
        sub: "Treat recon as harmless noise and take no action.",
        outcome: "Recon is the rehearsal for the attack. Ignoring it — especially with RDP exposed — hands the attacker a tested target list.",
      },
    ],
    takeaway:
      "Reconnaissance looks like ordered port sweeps, banner grabbing, and probing from flagged IP ranges. The dangerous part is what it finds — like internet-facing RDP. Separate hostile scanning from your own approved monitors and vuln scans by checking source, schedule, and change tickets, then close real exposures fast.",
    console: {
      stage: "network",
      host: "latam-edge-03",
      termLabel: "perimeter console",
      flowCmd: "idslog",
      focusCmd: "fwaudit",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-004  (LATAM PERIMETER)", c: "head" },
        { t: "Triage the scanning using the tools on the left, or type a command." },
        { t: "Start with `scan`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "Perimeter already mapped.",
      notReadyMsg:  "Perimeter not mapped yet — run `scan` first.",
      containLine:  "[+] Source range blocked and exposed RDP closed on the map. Recon shut down.",
      objectives: {
        start:       "Run `scan` to sweep the LATAM perimeter.",
        investigate: "Triage the scanning: run `idslog` and `fwaudit` to surface evidence.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "All malicious evidence flagged. Run `contain` to block the source & close exposures.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "scan", kind: "scan", key: "scan", icon: "◎", name: "Perimeter Scan", hint: "scan",
          desc: "sweep the perimeter for live edge hosts" },
        { cmd: "idslog", kind: "reveal", key: "idslog", icon: "🔎", name: "IDS / Proxy Log", hint: "idslog",
          desc: "review scan & banner-grab alerts     (needs scan)" },
        { cmd: "fwaudit", kind: "reveal", key: "fwaudit", icon: "🚪", name: "Firewall Audit", hint: "fwaudit",
          desc: "audit exposure & internal scans      (needs scan)" },
        { cmd: "intel 203.0.113.42", kind: "intel", needs: "idslog", icon: "⚲", name: "Threat Intel", hint: "intel <ip>",
          helpCmd: "intel <ip>", desc: "look up a source IP against threat feeds" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      nodes: [
        { id: "edge",   label: "LATAM EDGE",     type: "gateway", x: 50, y: 16 },
        { id: "soc",    label: "SOC / IDS",      type: "sensor",  x: 16, y: 47 },
        { id: "edge03", label: "latam-edge-03",  type: "host",    x: 50, y: 56, focus: true },
        { id: "web",    label: "latam-web-01",   type: "host",    x: 30, y: 84 },
        { id: "nessus", label: "NESSUS (int)",   type: "host",    x: 70, y: 84 },
        { id: "pingdom",label: "PINGDOM",        type: "cloud",   x: 16, y: 14, external: true },
        { id: "scanner",label: "203.0.113.42",   type: "threat",  x: 86, y: 14, external: true },
      ],
      infraLinks: [["edge", "soc"], ["edge", "edge03"], ["edge", "web"], ["edge", "nessus"]],
      threatLink: { from: "scanner", to: "edge03", label: "PORT SWEEP" },
      benignLink: { from: "pingdom", to: "web",    label: "UPTIME /health" },
      reveal: {
        idslog:  ["port-sweep", "banner-grab", "uptime-monitor"],
        fwaudit: ["exposed-rdp", "internal-vulnscan"],
      },
      out: {
        scan: [
          { t: "scan --perimeter LATAM/24", c: "cmd" },
          { t: "[*] Sweeping LATAM perimeter for live edge hosts…", c: "dim" },
          { t: "  latam-web-01    up    normal web traffic" },
          { t: "  NESSUS (int)    up    internal scanner, idle" },
          { t: "  latam-edge-03   up    answered an inbound 3389 probe", c: "warn" },
          { t: "[+] Inbound probing from 203.0.113.42 across the perimeter.", c: "ok" },
          { t: "    Next: run `idslog` and `fwaudit` to investigate it.", c: "dim" },
        ],
        idslog: [
          { t: "idslog --since 02:00", c: "cmd" },
          { t: "TIME      SRC             ACTIVITY", c: "head" },
          { t: "02:00  203.0.113.42     sequential ports 22/80/443/8080/3389", c: "warn" },
          { t: "02:10  203.0.113.42     HTTP HEAD banner-grab, Shodan-like UA", c: "warn" },
          { t: "—:—    198.51.100.10    HTTPS GET /health every 60s (Pingdom)" },
          { t: "[+] Ordered port sweep + banner grabbing from a flagged range.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        fwaudit: [
          { t: "fwaudit latam-edge-03", c: "cmd" },
          { t: "RULE                          STATE", c: "head" },
          { t: "3389/tcp → 0.0.0.0/0          OPEN  (not in approved list)", c: "warn" },
          { t: "Nessus 10.60.0.30  Sun 03:00  CHG-2026-0412, authenticated" },
          { t: "[+] Internet-facing RDP found — the real exposure recon would exploit.", c: "ok" },
          { t: "[+] 2 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "203.0.113.42": [
            { t: "intel 203.0.113.42", c: "cmd" },
            { t: "203.0.113.42  ·  203.0.113.0/24", c: "" },
            { t: "  listed on 3 feeds: mass-scanning / recon infrastructure", c: "warn" },
            { t: "  no business relationship — not an approved vendor", c: "warn" },
            { t: "verdict: HOSTILE-SCANNER", c: "warn" },
          ],
          "198.51.100.10": [
            { t: "intel 198.51.100.10", c: "cmd" },
            { t: "198.51.100.10  ·  Pingdom uptime monitor", c: "" },
            { t: "  on the perimeter allow-list / vendor registry", c: "" },
            { t: "verdict: KNOWN-GOOD", c: "ok" },
          ],
        },
      },
    },
  },

  "mission-005": {
    severity: "MEDIUM",
    region:   "MENA REGION",
    opId:     "OPS-2026-005",
    title:    "Account Takeover Attempt",
    briefing:
      "SOC LEAD — Sarah Reyes:\n\n" +
      "MENA is seeing a wave of failed MFA challenges against privileged\n" +
      "accounts from places we don't operate. Looks like an account-takeover\n" +
      "push. Inspect the auth evidence, flag the malicious attempts, and\n" +
      "don't confuse them with legitimate traveling users, then contain.",
    artifacts: [
      {
        id: "mfa-fatigue",
        kind: "AUTH LOG",
        icon: "📲",
        label: "MFA Fatigue Bursts",
        verdict: "malicious",
        detail:
          "Accounts: 9 privileged (admin/finance)\n" +
          "Events:   47 push challenges in 20 min, all denied\n" +
          "Source:   AS12345 — not in approved geo-list\n" +
          "Pattern:  repeated pushes hoping a user taps 'approve'",
        notes: [
          "Dozens of MFA prompts hammered at admins in minutes — push fatigue.",
          "All from an ASN outside any region you operate in.",
          "Goal is to get one tired user to approve by accident.",
        ],
      },
      {
        id: "pw-spray",
        kind: "AUTH LOG",
        icon: "💦",
        label: "Password Spray",
        verdict: "malicious",
        detail:
          "Source:  AS12345 (same as MFA bursts)\n" +
          "Method:  one common password vs many usernames\n" +
          "Window:  low-and-slow, ~1 attempt/account/15min\n" +
          "Result:  2 valid passwords found (MFA then blocked)",
        notes: [
          "One password tried against many accounts — spray, not brute force.",
          "Deliberately slow to dodge lockout thresholds.",
          "Same hostile source already correlated with the MFA bursts.",
        ],
      },
      {
        id: "impossible-travel",
        kind: "IAM",
        icon: "✈",
        label: "Impossible Travel Sign-In",
        verdict: "malicious",
        detail:
          "Account: f.haddad-adm\n" +
          "Sign-in: Dubai 08:02 UTC, then AS12345 08:19 UTC\n" +
          "Gap:     17 min apart, ~5,000 km\n" +
          "Token:   legacy IMAP (no MFA path) attempted",
        notes: [
          "Two sign-ins too far apart in time to be the same person.",
          "The second hop comes from the hostile ASN.",
          "It reaches for a legacy protocol that bypasses MFA.",
        ],
      },
      {
        id: "traveling-vp",
        kind: "IAM",
        icon: "🧳",
        label: "Traveling Exec Sign-In",
        verdict: "benign",
        detail:
          "Account: n.said\n" +
          "Sign-in: Cairo → Riyadh (flight itinerary on file)\n" +
          "MFA:     satisfied on registered device\n" +
          "Travel:  approved trip in HR calendar, ~1,300 km/4h",
        notes: [
          "A geo change that's consistent with a real, scheduled flight.",
          "MFA satisfied on the user's own registered device.",
          "Backed by an approved travel record — plausible, not impossible.",
        ],
      },
      {
        id: "vpn-reconnect",
        kind: "AUTH LOG",
        icon: "🔌",
        label: "VPN Reconnect Failures",
        verdict: "benign",
        detail:
          "Account: corp users (broad)\n" +
          "Events:  brief cluster of failed logons 07:55 UTC\n" +
          "Cause:   VPN concentrator failover (known maint.)\n" +
          "Recovery: auto-success on retry, all from corp ranges",
        notes: [
          "A short burst of failures that all recovered on retry.",
          "Traced to a known VPN failover, not an attacker.",
          "All from corporate IP ranges, no geo anomaly.",
        ],
      },
    ],
    decisions: [
      {
        id: "lock-reenroll",
        quality: "excellent",
        label: "Lock targeted accounts & force MFA re-enrollment",
        sub: "Disable the two sprayed accounts, force password reset + MFA re-enrollment for all targeted admins, block AS12345, and disable legacy auth protocols.",
        outcome: "The compromised credentials are reset before use, legacy MFA-bypass paths are closed, and the hostile source is blocked. The takeover attempt is stopped cold.",
      },
      {
        id: "notify-users",
        quality: "weak",
        label: "Notify users to ignore unexpected MFA prompts",
        sub: "Send guidance but leave accounts and legacy auth enabled for now.",
        outcome: "Awareness helps against MFA fatigue, but the sprayed passwords and legacy bypass remain usable. The attacker still has a path in.",
      },
      {
        id: "raise-threshold",
        quality: "poor",
        label: "Raise the lockout threshold to stop the noise",
        sub: "Reduce alerting by loosening lockout so the failed-logon alarms quiet down.",
        outcome: "Loosening lockout makes spraying easier and hides the attack. You've removed the alarm, not the threat.",
      },
    ],
    takeaway:
      "Account takeover shows up as MFA-fatigue bursts, low-and-slow password spraying, and impossible-travel sign-ins reaching for legacy (no-MFA) protocols. Tell it apart from real travelers and maintenance blips by checking device, MFA status, source ASN, and corroborating travel/change records — then reset credentials and kill legacy auth.",
    console: {
      stage: "auth",
      host: "MENA / privileged",
      termLabel: "identity console",
      flowCmd: "geoip",
      focusCmd: "mfa",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-005  (Identity / MENA)", c: "head" },
        { t: "Analyze the sign-in evidence using the tools on the left, or type a command." },
        { t: "Start with `signins`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "Sign-in log already loaded.",
      notReadyMsg:  "Sign-in log not loaded — run `signins` first.",
      containLine:  "[+] Targeted accounts locked, MFA re-enrolled, AS12345 blocked. Takeover stopped.",
      objectives: {
        start:       "Run `signins` to pull recent privileged sign-ins.",
        investigate: "Analyze them: run `geoip` and `mfa` to resolve the anomalies.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "All malicious attempts flagged. Run `contain` to lock the accounts.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "signins", kind: "scan", key: "signins", icon: "📋", name: "Pull Sign-Ins", hint: "signins",
          desc: "load recent privileged sign-ins    (start here)" },
        { cmd: "geoip", kind: "reveal", key: "geoip", icon: "🌍", name: "Geo Analysis", hint: "geoip",
          desc: "resolve locations & travel         (needs signins)" },
        { cmd: "mfa", kind: "reveal", key: "mfa", icon: "📲", name: "MFA Audit", hint: "mfa",
          desc: "audit MFA challenges & spraying     (needs signins)" },
        { cmd: "intel AS12345", kind: "intel", needs: "geoip", icon: "⚲", name: "Threat Intel", hint: "intel <asn>",
          helpCmd: "intel <asn>", desc: "look up a source ASN against threat feeds" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      auth: {
        title: "Privileged Sign-In Monitor — MENA",
        events: [
          { time: "02:00–03:30", account: "many users",  src: "AS12345 (off-geo)",       flagBy: "mfa",   sev: "bad", result: "password spray — 2 valid, MFA blocked" },
          { time: "02:40",       account: "9 admin accts", src: "AS12345 (off-geo)",      flagBy: "mfa",   sev: "bad", result: "47 MFA pushes / 20min — all denied" },
          { time: "07:55",       account: "corp users",   src: "corp VPN range",          flagBy: "mfa",   sev: "ok",  result: "VPN failover — auto-recovered" },
          { time: "08:19",       account: "f.haddad-adm", src: "AS12345 (off-geo)",       flagBy: "geoip", sev: "bad", result: "impossible travel — 5,000km / 17min, legacy IMAP" },
          { time: "11:30",       account: "n.said",       src: "Riyadh (registered dev)", flagBy: "geoip", sev: "ok",  result: "matches approved travel itinerary, MFA ok" },
        ],
      },
      reveal: {
        geoip: ["impossible-travel", "traveling-vp"],
        mfa:   ["mfa-fatigue", "pw-spray", "vpn-reconnect"],
      },
      out: {
        signins: [
          { t: "signins --priv --region MENA --since 02:00", c: "cmd" },
          { t: "[*] Pulling privileged sign-in events…", c: "dim" },
          { t: "  9 admin/finance accounts with denied MFA challenges", c: "warn" },
          { t: "  multiple sign-ins from AS12345 (outside operating geos)", c: "warn" },
          { t: "[+] Log loaded. Run `geoip` and `mfa` to resolve each anomaly.", c: "ok" },
        ],
        geoip: [
          { t: "geoip --resolve", c: "cmd" },
          { t: "ACCOUNT        TRAVEL", c: "head" },
          { t: "f.haddad-adm   Dubai 08:02 → AS12345 08:19  (5,000km / 17min)", c: "warn" },
          { t: "n.said         Cairo → Riyadh  (itinerary on file, MFA ok)" },
          { t: "[+] One impossible-travel sign-in; one legitimate traveler.", c: "ok" },
          { t: "[+] 2 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        mfa: [
          { t: "mfa --audit", c: "cmd" },
          { t: "PATTERN                                   SOURCE", c: "head" },
          { t: "47 push challenges / 20min vs 9 admins     AS12345  (all denied)", c: "warn" },
          { t: "1 password × many users, 2 valid           AS12345  (MFA blocked)", c: "warn" },
          { t: "07:55 cluster — VPN failover, recovered     corp ranges" },
          { t: "[+] MFA fatigue + spray from AS12345; the VPN blip is benign.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "AS12345": [
            { t: "intel AS12345", c: "cmd" },
            { t: "AS12345  ·  hosting/VPS, not in any approved geo", c: "" },
            { t: "  source of the MFA bursts and password spray this window", c: "warn" },
            { t: "  listed on 2 feeds: credential-attack infrastructure", c: "warn" },
            { t: "verdict: KNOWN-MALICIOUS", c: "warn" },
          ],
        },
      },
    },
  },

  "mission-006": {
    severity: "LOW",
    region:   "SE ASIA REGION",
    opId:     "OPS-2026-006",
    title:    "Anomalous Scan Triage",
    briefing:
      "THREAT INTEL — Marcus Chen:\n\n" +
      "Low-priority one, but good triage practice. There's scanning against\n" +
      "the SEA DMZ — most of it is harmless background noise, but make sure\n" +
      "nothing hostile is hiding in it. Inspect the evidence, flag anything\n" +
      "genuinely malicious, and log the rest.",
    artifacts: [
      {
        id: "exploit-probe",
        kind: "WAF ALERT",
        icon: "🧨",
        label: "Exploit Probe in Scan",
        verdict: "malicious",
        detail:
          "Source: 198.51.100.77\n" +
          "Request: GET /../../etc/passwd & ?cmd=whoami\n" +
          "Target:  SEA DMZ web app (sea-dmz-01)\n" +
          "Note:    path traversal + command injection attempts\n" +
          "Mixed in with otherwise low-rate scanning",
        notes: [
          "Not just scanning — actual exploit payloads (traversal, command injection).",
          "Aimed at a specific DMZ app, probing for a real weakness.",
          "Hidden inside low-rate noise to avoid standing out.",
        ],
      },
      {
        id: "credential-stuff",
        kind: "AUTH LOG",
        icon: "🗝",
        label: "Login Endpoint Hits",
        verdict: "malicious",
        detail:
          "Source:  198.51.100.77 (same as exploit probe)\n" +
          "Action:  POST /login with leaked cred pairs\n" +
          "Rate:    bursts against the DMZ portal\n" +
          "Result:  all failed, but targeted real accounts",
        notes: [
          "Reused breach credentials thrown at the login page.",
          "Same source as the exploit probe — coordinated, not random.",
          "Targets real account names, not gibberish.",
        ],
      },
      {
        id: "cdn-crawl",
        kind: "WAF LOG",
        icon: "🕸",
        label: "CDN Crawler Scan",
        verdict: "benign",
        detail:
          "Source: 198.51.100.20 (known CDN exit node)\n" +
          "Action: GET / on ports 80,443, 0.3 req/s\n" +
          "Attrib: Shodan-adjacent crawl, attribution confirmed\n" +
          "Note:   no payloads, just reachability checks",
        notes: [
          "A known internet-wide crawler doing reachability checks.",
          "Very low rate and no exploit payloads — just GET /.",
          "Attribution to a benign CDN/scanner is confirmed.",
        ],
      },
      {
        id: "search-bot",
        kind: "WAF LOG",
        icon: "🔍",
        label: "Search Engine Bot",
        verdict: "benign",
        detail:
          "Source: Googlebot (verified via reverse DNS)\n" +
          "Action: crawl of public marketing pages\n" +
          "Rate:   polite, respects robots.txt\n" +
          "Note:   indexes public content only",
        notes: [
          "A verified search-engine crawler indexing public pages.",
          "Reverse DNS confirms it's genuinely Googlebot.",
          "Polite crawl that honors robots.txt — expected traffic.",
        ],
      },
      {
        id: "health-probe",
        kind: "SYSTEM",
        icon: "💚",
        label: "Load Balancer Health Check",
        verdict: "benign",
        detail:
          "Source: 10.70.0.4 (internal LB)\n" +
          "Action: GET /healthz every 10s\n" +
          "Scope:  DMZ app health endpoint only\n" +
          "Status: internal, expected, always 200",
        notes: [
          "The internal load balancer checking app health.",
          "Hits only the health endpoint on a fixed cadence.",
          "Internal source — normal infrastructure traffic.",
        ],
      },
    ],
    decisions: [
      {
        id: "block-investigate",
        quality: "excellent",
        label: "Block the hostile IP & open an investigation",
        sub: "Block 198.51.100.77 at the WAF, confirm no exploit succeeded, alert on the targeted accounts, and log the benign scanners for trending.",
        outcome: "The real threat hiding in the noise is blocked and verified as unsuccessful, while harmless crawlers are correctly logged. Sharp triage on a low-priority queue.",
      },
      {
        id: "log-all",
        quality: "weak",
        label: "Log everything for the trending report",
        sub: "Record all the scanning activity but take no blocking action.",
        outcome: "Logging is fine for the benign crawlers, but the exploit-and-credential source needed action now. You documented an attack instead of stopping it.",
      },
      {
        id: "auto-close",
        quality: "poor",
        label: "Auto-close — it's a known CDN scanner",
        sub: "Assume all the traffic is the benign CDN crawl and close the ticket.",
        outcome: "Lumping the exploit probes in with benign scanning misses a live attack. Triage means separating the signal from the noise, not closing both.",
      },
    ],
    takeaway:
      "Low-priority scan queues still hide real attacks. Triage means separating benign crawlers, search bots, and health checks (verifiable by source, rate, and attribution) from hostile probes carrying exploit payloads or credential-stuffing — and acting on the latter even when the overall alert is 'low'.",
    console: {
      stage: "network",
      host: "sea-dmz-01",
      termLabel: "waf console",
      flowCmd: "waflog",
      focusCmd: "authlog",
      intro: [
        { t: "CyberCorp SOC Console — OPS-2026-006  (SEA DMZ)", c: "head" },
        { t: "Triage the scan noise using the tools on the left, or type a command." },
        { t: "Start with `scan`. Type `help` for the full list.", c: "dim" },
      ],
      scanAgainMsg: "DMZ already mapped.",
      notReadyMsg:  "DMZ not mapped yet — run `scan` first.",
      containLine:  "[+] Hostile source blocked at the WAF on the map. Benign scanners logged.",
      objectives: {
        start:       "Run `scan` to list DMZ services under scan.",
        investigate: "Triage the noise: run `waflog` and `authlog` to surface evidence.",
        classify:    "Inspect each item in the evidence queue and classify it.",
        ready:       "Real threats flagged. Run `contain` to block the hostile source.",
        done:        "Incident closed. Review the outcome or return to the Operations Center.",
      },
      tools: [
        { cmd: "scan", kind: "scan", key: "scan", icon: "◎", name: "DMZ Scan", hint: "scan",
          desc: "list DMZ services receiving scan traffic" },
        { cmd: "waflog", kind: "reveal", key: "waflog", icon: "🛡", name: "WAF Log", hint: "waflog",
          desc: "review probes & crawler traffic      (needs scan)" },
        { cmd: "authlog", kind: "reveal", key: "authlog", icon: "🗝", name: "Auth Log", hint: "authlog",
          desc: "review login-endpoint hits           (needs scan)" },
        { cmd: "intel 198.51.100.77", kind: "intel", needs: "waflog", icon: "⚲", name: "Threat Intel", hint: "intel <ip>",
          helpCmd: "intel <ip>", desc: "look up a source IP against threat feeds" },
        { cmd: "contain", kind: "contain", icon: "⊘", name: "Containment", hint: "contain",
          desc: "neutralize the threat (after flagging the evidence)" },
      ],
      nodes: [
        { id: "edge",   label: "SEA DMZ EDGE",   type: "gateway", x: 50, y: 16 },
        { id: "waf",    label: "WAF / SOC",      type: "sensor",  x: 16, y: 47 },
        { id: "dmz01",  label: "sea-dmz-01",     type: "host",    x: 50, y: 56, focus: true },
        { id: "lb",     label: "INTERNAL LB",    type: "host",    x: 30, y: 84 },
        { id: "portal", label: "DMZ PORTAL",     type: "host",    x: 70, y: 84 },
        { id: "cdn",    label: "CDN / BOTS",     type: "cloud",   x: 16, y: 14, external: true },
        { id: "atk",    label: "198.51.100.77",  type: "threat",  x: 86, y: 14, external: true },
      ],
      infraLinks: [["edge", "waf"], ["edge", "dmz01"], ["edge", "lb"], ["edge", "portal"]],
      threatLink: { from: "atk", to: "dmz01",  label: "EXPLOIT PROBE" },
      benignLink: { from: "cdn", to: "dmz01",  label: "CRAWL / BOTS" },
      reveal: {
        waflog:  ["exploit-probe", "cdn-crawl", "search-bot"],
        authlog: ["credential-stuff", "health-probe"],
      },
      out: {
        scan: [
          { t: "scan --dmz SEA", c: "cmd" },
          { t: "[*] Listing DMZ services receiving scan traffic…", c: "dim" },
          { t: "  DMZ PORTAL     up    public login portal" },
          { t: "  INTERNAL LB    up    health checks only" },
          { t: "  sea-dmz-01     up    mixed scan traffic, mostly low-rate", c: "warn" },
          { t: "[+] Low-rate scanning across the DMZ — mostly background noise.", c: "ok" },
          { t: "    Next: run `waflog` and `authlog` to check for real threats.", c: "dim" },
        ],
        waflog: [
          { t: "waflog --dmz sea-dmz-01", c: "cmd" },
          { t: "SRC              REQUEST", c: "head" },
          { t: "198.51.100.77    GET /../../etc/passwd  &  ?cmd=whoami", c: "warn" },
          { t: "198.51.100.20    GET /  (0.3 req/s, known CDN exit node)" },
          { t: "Googlebot        crawl /marketing  (verified rDNS)" },
          { t: "[+] Exploit payloads hiding in otherwise benign scan noise.", c: "ok" },
          { t: "[+] 3 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        authlog: [
          { t: "authlog --dmz-portal", c: "cmd" },
          { t: "SRC              ACTIVITY", c: "head" },
          { t: "198.51.100.77    POST /login  leaked cred pairs, real accounts", c: "warn" },
          { t: "10.70.0.4        GET /healthz every 10s  (internal LB)" },
          { t: "[+] Credential stuffing from the same hostile source.", c: "ok" },
          { t: "[+] 2 artifacts added to the evidence queue. Inspect & classify them.", c: "ok" },
        ],
        intel: {
          "198.51.100.77": [
            { t: "intel 198.51.100.77", c: "cmd" },
            { t: "198.51.100.77  ·  source of exploit probe + credential stuffing", c: "" },
            { t: "  path-traversal & command-injection payloads this window", c: "warn" },
            { t: "  listed on threat feeds: active web-attack source", c: "warn" },
            { t: "verdict: KNOWN-MALICIOUS", c: "warn" },
          ],
          "198.51.100.20": [
            { t: "intel 198.51.100.20", c: "cmd" },
            { t: "198.51.100.20  ·  known CDN exit node", c: "" },
            { t: "  attribution confirmed, reachability checks only", c: "" },
            { t: "verdict: KNOWN-GOOD", c: "ok" },
          ],
        },
      },
    },
  },
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

// Read-only "in progress" signal for the three hardcoded missions (1–3). A
// mission counts as in progress when the player has launched it (the durable
// `missionLaunched` flag) or accrued any Evidence Confidence — both derived
// purely from ech.progress.v1, never written. Generic missions (4–6) persist
// no mid-mission state, so they have no in-progress signal and stay plain
// "active" until completed. Returns { nodeId: { started, pct } }.
function getMissionProgress() {
  const p = readGameProgress() || {};
  const launched = (p.missionLaunched && typeof p.missionLaunched === "object")
    ? p.missionLaunched : {};
  const conf = {
    "mission-001": Number(p.m1Confidence) || 0,
    "mission-002": Number(p.m2Confidence) || 0,
    "mission-003": Number(p.m3Confidence) || 0,
  };
  const out = {};
  Object.entries(REAL_MISSION_MAP).forEach(([nodeId, mid]) => {
    const pct = Math.max(0, Math.min(100, Math.round(conf[mid] || 0)));
    out[nodeId] = { started: !!launched[mid] || pct > 0, pct };
  });
  return out;
}

// Paint each real-mission node with its current progress state. Safe to
// call repeatedly (e.g. on focus after returning from the main game).
function applyMissionProgress() {
  const states = getMissionStates();
  const progress = getMissionProgress();
  Object.entries(states).forEach(([nodeId, status]) => {
    const node = document.getElementById(`node-${nodeId}`);
    if (!node) return;

    node.classList.remove("node--completed", "node--locked", "node--in-progress");
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
    } else if (progress[nodeId] && progress[nodeId].started) {
      // Active mission the player has already started but not finished — set it
      // apart from untouched-but-available nodes with an "in progress" badge.
      const pct = progress[nodeId].pct;
      node.classList.add("node--in-progress");
      const g = document.createElement("span");
      g.className = "node-status-glyph node-status-glyph--progress";
      g.setAttribute("aria-hidden", "true");
      g.textContent = pct > 0 ? `${pct}%` : "•••";
      node.appendChild(g);
      node.setAttribute("aria-label", pct > 0
        ? `${baseLabel} — In progress (${pct}% confidence)`
        : `${baseLabel} — In progress`);
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

  // Sound is OFF by default. The mute preference is shared with the main
  // Ethical CyberHackers game via localStorage under a single key, so muting
  // in either app carries over to the other. Absent key keeps each app's own
  // default (here: muted/OFF). Only an explicit 'false' un-mutes.
  const STORAGE_KEY = 'ech.sound.muted';
  let _muted = localStorage.getItem(STORAGE_KEY) !== 'false';

  // Master volume (0–1). Unlike the shared mute flag this is a per-tab
  // preference, persisted in sessionStorage so it survives reloads but does
  // not bleed across to the main game. Absent/invalid key falls back to 0.7.
  const VOLUME_KEY = 'ech.sound.volume';
  let _volume = (() => {
    const v = parseFloat(sessionStorage.getItem(VOLUME_KEY));
    return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7;
  })();
  let masterGain = null;

  function _getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Single master GainNode every voice routes through, so the slider can
      // scale the whole soundscape at once.
      masterGain = ctx.createGain();
      masterGain.gain.value = _volume;
      masterGain.connect(ctx.destination);
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
      gain.connect(masterGain);
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
    gain.connect(masterGain);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(260, ac.currentTime + 0.55);
    gain.gain.setValueAtTime(0.07, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.55);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.6);
  }

  // Sharp confirmatory click/select when an incident node is opened —
  // a quick two-stage blip whose pitch is mapped to severity.
  function playNodeSelect(severity) {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const pitches = {
      critical: 1175,
      high:     988,
      medium:   784,
      low:      659,
      info:     587,
    };
    const base = pitches[severity] ?? pitches.info;
    const t = ac.currentTime;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'triangle';
    // Crisp upward snap then a fast decay for a "select" feel.
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 1.5, t + 0.04);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.09, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  // Soft descending "close" blip when an incident card is dismissed — a
  // gentle two-step downward glide so dismissing feels distinct from the
  // sharper upward select snap.
  function playCloseSound() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const t = ac.currentTime;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sine';
    // Downward glide for a soft "dismiss" feel.
    osc.frequency.setValueAtTime(660, t);
    osc.frequency.exponentialRampToValueAtTime(330, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  // Minimal click/blip for the ticker — very quiet
  function playTickerBeep() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'square';
    osc.frequency.value = 1400;
    gain.gain.setValueAtTime(0.012, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.055);
    osc.start(ac.currentTime);
    osc.stop(ac.currentTime + 0.06);
  }

  // Bright ascending arpeggio — a "correct / pinned" confirmation used by the
  // Evidence Holotable when an artifact is classified correctly or a mission
  // is contained successfully.
  function playSuccess() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      const t = ac.currentTime + i * 0.07;
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(masterGain);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  // Soft low "reconsider" buzz — a gentle two-tone descend used when a
  // holotable classification is incorrect (never harsh; no hard fail).
  function playError() {
    if (!_canPlay()) return;
    const ac = _getCtx();
    const t = ac.currentTime;
    const osc  = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(masterGain);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.18);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  function isMuted() { return _muted; }

  function toggle() {
    _muted = !_muted;
    localStorage.setItem(STORAGE_KEY, String(_muted));
    return _muted;
  }

  // Re-read the shared preference (e.g. after another tab/app changed it).
  function refresh() {
    _muted = localStorage.getItem(STORAGE_KEY) !== 'false';
    return _muted;
  }

  function getVolume() { return _volume; }

  // Set master volume (clamped 0–1), persist it, and apply live to the gain
  // node if the audio graph is already running.
  function setVolume(v) {
    _volume = Math.min(1, Math.max(0, Number(v) || 0));
    sessionStorage.setItem(VOLUME_KEY, String(_volume));
    if (masterGain) masterGain.gain.value = _volume;
    return _volume;
  }

  return { playAlertChime, playRadarPing, playNodeSelect, playCloseSound, playTickerBeep, playSuccess, playError, isMuted, toggle, refresh, getVolume, setVolume, STORAGE_KEY, VOLUME_KEY };
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

// Rebuild the Intel feed = authored updates + reactive "world memory" entries
// for completed missions. Idempotent (clears first), so it is safe to re-run on
// resync when the player returns from completing a mission.
function renderIntelFeed() {
  const feed = document.getElementById('intelFeed');
  if (!feed) return;
  feed.innerHTML = '';
  [...INTEL_UPDATES, ...getWorldMemoryIntel()].forEach(renderIntelItem);
}

/* ============================================================
   SECURITY BULLETINS — atmospheric Operations Center notices
   ============================================================ */
let _bulletinTimer = null;
let _bulletinIdx = 0;

// Bulletins currently eligible to show — reactive ones appear only after their
// gating mission is complete (read-only).
function activeBulletins() {
  const { completed } = getWorldState();
  return SECURITY_BULLETINS.filter(b => !b.after || completed.has(b.after));
}

function renderBulletin() {
  const el = document.getElementById('ocBulletin');
  if (!el) return;
  const list = activeBulletins();
  if (!list.length) { el.hidden = true; return; }
  el.hidden = false;
  const b = list[_bulletinIdx % list.length];
  const tagEl = el.querySelector('.oc-bulletin-tag');
  const textEl = el.querySelector('.oc-bulletin-text');
  if (!tagEl || !textEl) return;
  // Fade out, swap content, fade back in (reflow forces the transition).
  el.classList.remove('oc-bulletin--in');
  void el.offsetWidth;
  tagEl.textContent = b.tag;
  textEl.textContent = b.text;
  requestAnimationFrame(() => el.classList.add('oc-bulletin--in'));
}

function initBulletins() {
  const el = document.getElementById('ocBulletin');
  if (!el) return;
  _bulletinIdx = 0;
  renderBulletin();
  if (_bulletinTimer) clearInterval(_bulletinTimer);
  _bulletinTimer = setInterval(() => {
    const list = activeBulletins();
    if (!list.length) return;
    _bulletinIdx = (_bulletinIdx + 1) % list.length;
    renderBulletin();
  }, 13000);
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

  // Sharp confirmatory click when the node is opened (respects mute + Page
  // Visibility guard internally).
  SoundEngine.playNodeSelect(incident.severity);

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

  // Phase 1 — organizational context + a concise operational briefing that
  // frames employer, role, and responsibility before launch (presentation-only).
  const ctx = opContext(incident.opId);
  const deptEl = document.getElementById('incidentDept');
  if (deptEl) deptEl.textContent = ctx.dept;
  const ticketEl = document.getElementById('incidentTicket');
  if (ticketEl) ticketEl.textContent = ctx.ticket;
  // Phase 2 — frame the assignment by its career tier and scope (presentation
  // only; this does NOT change mission mechanics). The tier role is the one the
  // analyst holds when this incident is their step in the career arc.
  const band = roleForNode(incidentId);
  const briefEl = document.getElementById('incidentBriefing');
  if (briefEl) {
    briefEl.textContent =
      `${CYBERCORP_IDENTITY.employer} ${CYBERCORP_IDENTITY.division} · ${incident.opId}. ` +
      `${band.name} assignment — ${band.scope}. Confirm the indicators and ` +
      `escalate verified evidence to ${CYBERCORP_IDENTITY.supervisor}.`;
  }
  const tierEl = document.getElementById('incidentTier');
  if (tierEl) tierEl.textContent = `${band.name} · ${band.scope}`;

  // Phase 3 — persistent-world continuity. Surface attribution to recurring
  // adversary infrastructure, recurring employees, and (reactively) a link to a
  // prior assignment once that mission is complete — rewarding player memory.
  // All read-only from getMissionStates(); never persisted.
  const linkEl = document.getElementById('incidentLinks');
  if (linkEl) {
    const cont = WORLD_CONTINUITY[incidentId];
    const { completed } = getWorldState();
    const rows = [];
    if (cont?.actor) {
      rows.push(`<span class="il-key">Attribution</span> ${actorLabel(cont.actor)} — recurring infrastructure.`);
    }
    if (cont?.connects && completed.has(cont.connects)) {
      const prior = INCIDENTS[cont.connects];
      if (prior) {
        rows.push(`<span class="il-key">Linked</span> resembles infrastructure from ${prior.opId} (${prior.region}) — shared ${actorLabel(cont.actor)} tradecraft.`);
      }
    }
    if (cont?.employee && EMPLOYEES[cont.employee]) {
      const e = EMPLOYEES[cont.employee];
      rows.push(`<span class="il-key">Reported by</span> ${e.name}, ${e.title} · ${deptName(e.dept)}.`);
    }
    if (rows.length) {
      linkEl.hidden = false;
      linkEl.innerHTML = rows.map(r => `<div class="incident-link-row">${r}</div>`).join('');
    } else {
      linkEl.hidden = true;
      linkEl.innerHTML = '';
    }
  }

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
  } else if (getMissionProgress()[incidentId]?.started) {
    launchBtn.innerHTML = '▶&nbsp; RESUME INVESTIGATION';
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
  const card = document.getElementById('incidentCard');
  // Soft "close" blip only when a card was actually open (respects mute +
  // Page Visibility guard internally). Avoids a stray sound on no-op calls.
  if (card.style.display !== 'none') SoundEngine.playCloseSound();
  card.style.display = 'none';
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

  // Missions with a progressive, terminal-first Linux→SOC lab dataset open that
  // isolated lab module (lab.js). It exposes window.openMissionLab(id) and the
  // set window.LAB_MISSION_IDS of missions that have a lab. We check this BEFORE
  // the console/holotable routing so a lab-backed mission (e.g. mission-002,
  // which also has a HOLOTABLE console block) routes to the lab, not the old
  // console. The old interiors stay reachable for reference via ?console=/?lab=.
  if (Array.isArray(window.LAB_MISSION_IDS) && window.LAB_MISSION_IDS.includes(realMissionId)) {
    if (typeof window.openMissionLab === 'function') {
      window.openMissionLab(realMissionId);
    } else {
      // Hook not loaded yet (partial script-load) — fall back to the deep-link so
      // the lab still opens rather than silently dropping to the old console.
      window.location.href = '/ops-center/?lab=' + encodeURIComponent(realMissionId);
    }
    return;
  }

  // Experimental Live SOC Console interior (vertical slice). Missions carrying a
  // `console` config open the terminal + reactive-map interior instead of the
  // holotable. (Currently mission-003 — the C2 Beacon showcase.)
  if (HOLOTABLE_MISSIONS[realMissionId] && HOLOTABLE_MISSIONS[realMissionId].console) {
    openSocConsole(realMissionId);
    return;
  }

  // Experimental Evidence Holotable interior. Missions backed by a holotable
  // open the in-prototype interior instead of deep-linking into the main game.
  if (HOLOTABLE_MISSIONS[realMissionId]) {
    openHolotable(realMissionId);
    return;
  }

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
   EVIDENCE HOLOTABLE — engine (experimental mission interior)
   ------------------------------------------------------------
   In-memory only. Never writes to localStorage / game progress.
   Flow: open → forensic scan (tokens materialize) → inspect &
   classify each token → pin malicious to the evidence board →
   choose a containment action → outcome scorecard → return.
   ============================================================ */
let htMissionId  = null;   // active holotable mission id
let htScanned    = false;  // forensic scan run?
let htContained  = false;  // containment decision made?
const htClassified = {};   // artifactId -> "malicious" | "benign" (current)
// Run token — bumped on every open/return so stray timers (scan materialize,
// inspector auto-close) from a previous session become no-ops.
let htRunToken   = 0;
let htInspectorTimer = null;  // pending inspector auto-close timeout id

function htMission() { return htMissionId ? HOLOTABLE_MISSIONS[htMissionId] : null; }
function htArtifacts() { const m = htMission(); return m ? m.artifacts : []; }
function htMaliciousArtifacts() { return htArtifacts().filter(a => a.verdict === "malicious"); }
function htArtifactById(id) { return htArtifacts().find(a => a.id === id) || null; }

// All truly-malicious artifacts are currently flagged malicious → decision unlocks.
function htAllMaliciousPinned() {
  const mal = htMaliciousArtifacts();
  return mal.length > 0 && mal.every(a => htClassified[a.id] === "malicious");
}

function openHolotable(missionId) {
  const mission = HOLOTABLE_MISSIONS[missionId];
  if (!mission) return;

  // Reset in-memory state for a fresh run. Bumping the run token invalidates
  // any in-flight timers (scan materialize / inspector auto-close) from a
  // previous session so they become no-ops.
  htRunToken++;
  if (htInspectorTimer) { clearTimeout(htInspectorTimer); htInspectorTimer = null; }
  htMissionId = missionId;
  htScanned   = false;
  htContained = false;
  Object.keys(htClassified).forEach(k => delete htClassified[k]);

  // Header strip.
  document.getElementById('htSeverity').textContent = mission.severity;
  document.getElementById('htRegion').textContent   = mission.region;
  document.getElementById('htOpId').textContent     = mission.opId;
  document.getElementById('htTitle').textContent    = mission.title;
  document.getElementById('htStatusText').textContent = 'ANALYSIS ACTIVE';
  const htCtxEl = document.getElementById('htContext');
  if (htCtxEl) {
    const c = opContext(mission.opId);
    htCtxEl.textContent = `${c.dept} · Sup: ${CYBERCORP_IDENTITY.supervisor}`;
  }

  // Close any stale overlays.
  ['htInspector', 'htDecision', 'htOutcome'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.hidden = true; el.innerHTML = ''; }
  });

  renderHtTokens();
  renderHtRail();
  renderHtDock();
  setHtObjective('Run a forensic scan to surface the incident artifacts.', '');

  const hint = document.getElementById('htStageHint');
  if (hint) hint.classList.remove('is-hidden');

  // Show the screen.
  document.getElementById('opsCenter').style.display = 'none';
  document.getElementById('holotable').style.display = 'flex';

  // Soft confirmatory cue on entry (respects mute + visibility internally).
  SoundEngine.playNodeSelect('high');
}

function returnFromHolotable() {
  // Invalidate any in-flight session timers before leaving.
  htRunToken++;
  if (htInspectorTimer) { clearTimeout(htInspectorTimer); htInspectorTimer = null; }
  document.getElementById('holotable').style.display = 'none';
  document.getElementById('opsCenter').style.display = 'flex';
  // Re-sync the map badges (read-only) on the way back.
  applyMissionProgress();
  htMissionId = null;
  SoundEngine.playCloseSound();
}

// Place artifact tokens evenly in a ring around the incident core. Each token
// is positioned with left/top percentages; the materialize animation is gated
// on the `is-live` class added during the scan.
function renderHtTokens() {
  const host = document.getElementById('htTokens');
  if (!host) return;
  host.innerHTML = '';
  const arts = htArtifacts();
  const n = arts.length;
  const radius = 38; // % of the table radius
  arts.forEach((a, i) => {
    const angle = (-90 + (360 / n) * i) * (Math.PI / 180);
    const x = 50 + radius * Math.cos(angle);
    const y = 50 + radius * Math.sin(angle);
    const tok = document.createElement('button');
    tok.type = 'button';
    tok.className = 'ht-token';
    tok.id = `htToken-${a.id}`;
    tok.style.left = `${x}%`;
    tok.style.top  = `${y}%`;
    tok.setAttribute('aria-label', `Inspect ${a.label}`);
    tok.innerHTML = `
      <span class="ht-token-flag" aria-hidden="true"></span>
      <span class="ht-token-icon" aria-hidden="true">${a.icon}</span>
      <span class="ht-token-kind">${a.kind}</span>
      <span class="ht-token-label">${a.label}</span>
    `;
    tok.addEventListener('click', () => { if (htScanned) openHtInspector(a.id); });
    host.appendChild(tok);
  });
}

// Forensic scan — materialize the tokens one by one with a sweep + soft cue.
function htRunScan() {
  if (htScanned) return;
  htScanned = true;

  const hint = document.getElementById('htStageHint');
  if (hint) hint.classList.add('is-hidden');

  SoundEngine.playRadarPing();

  const arts = htArtifacts();
  const token = htRunToken;  // snapshot — stale callbacks no-op after open/return
  arts.forEach((a, i) => {
    setTimeout(() => {
      if (token !== htRunToken) return;
      const tok = document.getElementById(`htToken-${a.id}`);
      if (tok) tok.classList.add('is-live');
      SoundEngine.playTickerBeep();
    }, 180 + i * 200);
  });

  setHtObjective('Inspect each artifact and classify it as malicious or benign.', htClassifyProgressText());
  renderHtDock();
}

function htClassifyProgressText() {
  const total = htArtifacts().length;
  const done = Object.keys(htClassified).length;
  return `${done} / ${total} classified`;
}

function setHtObjective(text, progress) {
  const t = document.getElementById('htObjectiveText');
  const p = document.getElementById('htObjectiveProgress');
  if (t) t.textContent = text;
  if (p) p.textContent = progress || '';
}

/* ---- Inspector ---- */
function openHtInspector(artifactId) {
  const a = htArtifactById(artifactId);
  if (!a) return;
  SoundEngine.playNodeSelect('medium');

  const current = htClassified[a.id] || null;
  const notesHtml = (a.notes || []).map(nt => `<li>${nt}</li>`).join('');
  const panel = document.getElementById('htInspector');
  panel.innerHTML = `
    <div class="ht-panel">
      <div class="ht-panel-head">
        <span class="ht-token-kind">${a.kind}</span>
        <span class="ht-panel-title">${a.label}</span>
        <button class="ht-panel-close" type="button" data-ht-close aria-label="Close inspector">✕</button>
      </div>
      <div class="ht-panel-body">
        <pre class="ht-artifact-detail">${a.detail}</pre>
        <div class="ht-notes">
          <div class="ht-notes-head">ANALYST OBSERVATIONS</div>
          <ul>${notesHtml}</ul>
        </div>
      </div>
      <div class="ht-verdict-banner" id="htInspectorVerdict" hidden></div>
      <div class="ht-panel-actions">
        <button class="ht-btn ht-btn--mal" type="button" data-ht-verdict="malicious">⚑ FLAG AS MALICIOUS</button>
        <button class="ht-btn ht-btn--ben" type="button" data-ht-verdict="benign">✓ MARK BENIGN</button>
      </div>
    </div>
  `;
  panel.hidden = false;

  panel.querySelector('[data-ht-close]').addEventListener('click', closeHtInspector);
  panel.querySelectorAll('[data-ht-verdict]').forEach(btn => {
    btn.addEventListener('click', () => htClassify(a.id, btn.dataset.htVerdict));
  });

  // If already classified, reflect the prior verdict so re-opening shows it.
  if (current) showInspectorVerdict(a, current, false);
}

function closeHtInspector() {
  if (htInspectorTimer) { clearTimeout(htInspectorTimer); htInspectorTimer = null; }
  const panel = document.getElementById('htInspector');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panel.innerHTML = '';
}

function showInspectorVerdict(a, verdict, animateClose) {
  const banner = document.getElementById('htInspectorVerdict');
  if (!banner) return;
  const correct = verdict === a.verdict;
  banner.hidden = false;
  banner.className = `ht-verdict-banner ${correct ? 'ht-verdict-banner--ok' : 'ht-verdict-banner--no'}`;
  if (correct) {
    banner.textContent = verdict === 'malicious'
      ? '✓ Correct — flagged and pinned to the evidence board.'
      : '✓ Correct — this artifact is legitimate.';
  } else {
    banner.textContent = verdict === 'malicious'
      ? '✗ Reconsider — this one is actually legitimate. You can re-inspect and change your call.'
      : '✗ Reconsider — there are warning signs here. You can re-inspect and change your call.';
  }
  if (animateClose && correct) {
    if (htInspectorTimer) clearTimeout(htInspectorTimer);
    const token = htRunToken;
    htInspectorTimer = setTimeout(() => {
      htInspectorTimer = null;
      if (token !== htRunToken) return;
      closeHtInspector();
    }, 950);
  }
}

function htClassify(artifactId, verdict) {
  const a = htArtifactById(artifactId);
  if (!a) return;

  htClassified[a.id] = verdict;
  const correct = verdict === a.verdict;
  if (correct) SoundEngine.playSuccess();
  else SoundEngine.playError();

  // Reflect on the token.
  const tok = document.getElementById(`htToken-${a.id}`);
  if (tok) {
    tok.classList.add('is-classified');
    tok.classList.toggle('is-correct', correct);
    tok.classList.toggle('is-wrong', !correct);
    const flag = tok.querySelector('.ht-token-flag');
    if (flag) flag.textContent = verdict === 'malicious' ? '⚑' : '✓';
  }

  showInspectorVerdict(a, verdict, true);
  renderHtRail();

  // Objective + dock update.
  if (htAllMaliciousPinned()) {
    setHtObjective('All malicious evidence pinned. Choose a containment action.', htClassifyProgressText());
  } else {
    setHtObjective('Inspect each artifact and classify it as malicious or benign.', htClassifyProgressText());
  }
  renderHtDock();
}

/* ---- Evidence rail ---- */
function renderHtRail() {
  const list  = document.getElementById('htRailList');
  const count = document.getElementById('htRailCount');
  if (!list) return;

  // Pinned = anything currently flagged malicious (true positives + false positives).
  const pinned = htArtifacts().filter(a => htClassified[a.id] === 'malicious');
  if (count) count.textContent = String(pinned.length);

  if (pinned.length === 0) {
    list.innerHTML = `<div class="ht-rail-empty" id="htRailEmpty">Nothing pinned yet. Inspect artifacts on the table and flag the malicious ones.</div>`;
    return;
  }

  list.innerHTML = pinned.map(a => {
    const truePositive = a.verdict === 'malicious';
    return `
      <div class="ht-rail-item ${truePositive ? '' : 'ht-rail-item--fp'}">
        <div class="ht-rail-item-kind">${a.kind}</div>
        <div class="ht-rail-item-label">${a.label}</div>
        <span class="ht-rail-item-tag">${truePositive ? '⚑ MALICIOUS — CONFIRMED' : '⚠ FALSE POSITIVE?'}</span>
      </div>
    `;
  }).join('');
}

/* ---- Command dock ---- */
function renderHtDock() {
  const dock = document.getElementById('htDock');
  if (!dock) return;
  const canContain = htAllMaliciousPinned() && !htContained;

  dock.innerHTML = `
    <button class="ht-tool ${htScanned ? 'is-done' : 'ht-tool--primary'}" type="button" data-ht-tool="scan" ${htScanned ? 'disabled' : ''}>
      <span class="ht-tool-icon" aria-hidden="true">◎</span>
      <span>${htScanned ? 'SCANNED' : 'FORENSIC SCAN'}</span>
    </button>
    <button class="ht-tool" type="button" data-ht-tool="brief">
      <span class="ht-tool-icon" aria-hidden="true">❒</span>
      <span>BRIEFING</span>
    </button>
    <button class="ht-tool ${canContain ? 'ht-tool--ready' : ''}" type="button" data-ht-tool="contain" ${canContain ? '' : 'disabled'}>
      <span class="ht-tool-icon" aria-hidden="true">⊘</span>
      <span>CONTAINMENT</span>
    </button>
  `;

  dock.querySelector('[data-ht-tool="scan"]').addEventListener('click', htRunScan);
  dock.querySelector('[data-ht-tool="brief"]').addEventListener('click', openHtBriefing);
  const containBtn = dock.querySelector('[data-ht-tool="contain"]');
  if (containBtn) containBtn.addEventListener('click', openHtDecision);
}

/* ---- Briefing recap (presentation-only) ---- */
function htDefaultBriefing() {
  return "SOC LEAD — Sarah Reyes:\n\n" +
    "Several artifacts surfaced around this incident. Inspect each one\n" +
    "on the holotable, flag the malicious items, then choose how to\n" +
    "contain the threat. Take your time — re-inspect anything you're\n" +
    "unsure of.";
}

function openHtBriefing() {
  const m = htMission();
  if (!m) return;
  SoundEngine.playNodeSelect('low');
  const panel = document.getElementById('htInspector');
  panel.innerHTML = `
    <div class="ht-panel">
      <div class="ht-panel-head">
        <span class="ht-token-kind">BRIEF</span>
        <span class="ht-panel-title">${m.title}</span>
        <button class="ht-panel-close" type="button" data-ht-close aria-label="Close briefing">✕</button>
      </div>
      <div class="ht-panel-body">
        <pre class="ht-artifact-detail">${m.briefing || htDefaultBriefing()}</pre>
        <div class="ht-notes">
          <div class="ht-notes-head">OBJECTIVE</div>
          <ul>
            <li>Run a forensic scan to surface the artifacts.</li>
            <li>Inspect &amp; classify each artifact (malicious / benign).</li>
            <li>Pin the malicious evidence, then choose a containment action.</li>
          </ul>
        </div>
      </div>
      <div class="ht-panel-actions">
        <button class="ht-btn ht-btn--primary" type="button" data-ht-close>UNDERSTOOD</button>
      </div>
    </div>
  `;
  panel.hidden = false;
  panel.querySelectorAll('[data-ht-close]').forEach(b => b.addEventListener('click', closeHtInspector));
}

/* ---- Containment decision ---- */
function openHtDecision() {
  const m = htMission();
  if (!m || !htAllMaliciousPinned() || htContained) return;
  SoundEngine.playNodeSelect('high');

  const choices = m.decisions.map(d => `
    <button class="ht-choice" type="button" data-ht-decision="${d.id}">
      <span class="ht-choice-label">${d.label}</span>
      <span class="ht-choice-sub">${d.sub}</span>
    </button>
  `).join('');

  const panel = document.getElementById('htDecision');
  panel.innerHTML = `
    <div class="ht-panel">
      <div class="ht-panel-head">
        <span class="ht-token-kind">DECISION</span>
        <span class="ht-panel-title">Choose a containment action</span>
        <button class="ht-panel-close" type="button" data-ht-close aria-label="Close decision">✕</button>
      </div>
      <div class="ht-panel-body">
        ${choices}
      </div>
    </div>
  `;
  panel.hidden = false;
  panel.querySelector('[data-ht-close]').addEventListener('click', () => { panel.hidden = true; panel.innerHTML = ''; });
  panel.querySelectorAll('[data-ht-decision]').forEach(btn => {
    btn.addEventListener('click', () => htChooseDecision(btn.dataset.htDecision));
  });
}

function htChooseDecision(decisionId) {
  const m = htMission();
  if (!m) return;
  const decision = m.decisions.find(d => d.id === decisionId);
  if (!decision) return;

  htContained = true;
  const decisionPanel = document.getElementById('htDecision');
  if (decisionPanel) { decisionPanel.hidden = true; decisionPanel.innerHTML = ''; }

  showHtOutcome(decision);
}

/* ---- Outcome scorecard ---- */
function showHtOutcome(decision) {
  const m = htMission();
  if (!m) return;

  const arts = htArtifacts();
  const total = arts.length;
  const correct = arts.filter(a => htClassified[a.id] === a.verdict).length;
  const accuracy = correct / total;

  // Tier: combine classification accuracy with decision quality. Never a hard fail.
  let tierClass, tierLabel;
  if (accuracy === 1 && decision.quality === 'excellent') {
    tierClass = 'excellent'; tierLabel = 'EXCELLENT CONTAINMENT';
  } else if (accuracy >= 0.66 && decision.quality !== 'poor') {
    tierClass = 'solid'; tierLabel = 'THREAT CONTAINED';
  } else {
    tierClass = 'delayed'; tierLabel = 'DELAYED CONTAINMENT';
  }

  if (tierClass === 'delayed') SoundEngine.playError();
  else SoundEngine.playSuccess();

  document.getElementById('htStatusText').textContent = 'INCIDENT CLOSED';

  const panel = document.getElementById('htOutcome');
  panel.innerHTML = `
    <div class="ht-panel">
      <div class="ht-panel-head">
        <span class="ht-token-kind">CLOSEOUT</span>
        <span class="ht-panel-title">${m.title} — Outcome</span>
      </div>
      <div class="ht-panel-body">
        <div class="ht-outcome-tier ht-outcome-tier--${tierClass}">${tierLabel}</div>
        <div class="ht-outcome-sub">${decision.outcome}</div>
        <div class="ht-outcome-stats">
          <div class="ht-stat">
            <div class="ht-stat-num">${correct}/${total}</div>
            <div class="ht-stat-label">ARTIFACTS<br>CORRECT</div>
          </div>
          <div class="ht-stat">
            <div class="ht-stat-num">${Math.round(accuracy * 100)}%</div>
            <div class="ht-stat-label">ANALYSIS<br>ACCURACY</div>
          </div>
          <div class="ht-stat">
            <div class="ht-stat-num">${htMaliciousArtifacts().length}</div>
            <div class="ht-stat-label">THREATS<br>PINNED</div>
          </div>
        </div>
        <div class="ht-outcome-takeaway">${m.takeaway}</div>
      </div>
      <div class="ht-panel-actions">
        <button class="ht-btn" type="button" data-ht-replay>↻ REPLAY</button>
        <button class="ht-btn ht-btn--primary" type="button" data-ht-return>RETURN TO OPERATIONS CENTER</button>
      </div>
    </div>
  `;
  panel.hidden = false;
  setHtObjective('Incident closed. Review your outcome or return to the Operations Center.', '');
  renderHtDock();

  panel.querySelector('[data-ht-replay]').addEventListener('click', () => {
    panel.hidden = true; panel.innerHTML = '';
    openHolotable(htMissionId);
  });
  panel.querySelector('[data-ht-return]').addEventListener('click', () => {
    panel.hidden = true; panel.innerHTML = '';
    returnFromHolotable();
  });
}

// True when any holotable overlay is currently open (for Escape handling).
function htOverlayOpen() {
  return ['htInspector', 'htDecision', 'htOutcome'].some(id => {
    const el = document.getElementById(id);
    return el && !el.hidden;
  });
}

function htCloseTopOverlay() {
  // Outcome is terminal — don't dismiss it via Escape.
  const inspector = document.getElementById('htInspector');
  const decision  = document.getElementById('htDecision');
  if (inspector && !inspector.hidden) { inspector.hidden = true; inspector.innerHTML = ''; return true; }
  if (decision && !decision.hidden)   { decision.hidden = true; decision.innerHTML = ''; return true; }
  return false;
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

  // Volume slider is only meaningful when sound is on, so hide it while muted.
  const slider = document.getElementById('soundVolume');
  if (slider) {
    slider.classList.toggle('sound-volume--hidden', muted);
    slider.value = String(Math.round(SoundEngine.getVolume() * 100));
    slider.setAttribute('aria-hidden', muted ? 'true' : 'false');
    if (muted) slider.setAttribute('tabindex', '-1');
    else slider.removeAttribute('tabindex');
  }
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
// Renders the persistent CyberCorp identity panel in the Operations Center. The
// org identity comes from CYBERCORP_IDENTITY; the role, clearance, advancement,
// and assignment readouts are DERIVED from progress (presentation-only).
// Session-only memory of the last role tier the panel rendered. Lives in memory
// for the page session only (never persisted) and exists solely to detect a
// promotion crossing so the operational notice fires once per crossing.
let _lastSeenRoleTier = null;

function renderIdentityPanel() {
  const el = document.getElementById('ocIdentity');
  if (!el) return;
  const id = CYBERCORP_IDENTITY;
  const c = getCareerState();
  const role = c.role;

  // Keep the player's Analyst Roster entry in sync with their live career role.
  const rosterRoleEl = document.getElementById('rosterPlayerRole');
  if (rosterRoleEl) rosterRoleEl.textContent = role.name;

  const activeIncident = c.activeId ? INCIDENTS[c.activeId] : null;
  const activeRegion = activeIncident
    ? `${activeIncident.region.replace(' REGION', '')} — ${activeIncident.title}`
    : 'Standby — awaiting tasking';

  // Advancement readout. The bar fills with the active assignment's confidence
  // so it moves as the player works (each cleared assignment is one promotion).
  const barPct = !c.next ? 100 : (c.activeId ? c.activePct : 0);
  let advanceCap;
  if (!c.next) {
    advanceCap = 'Top role — division command';
  } else if (c.activeId && c.activePct > 0) {
    advanceCap = `${c.activePct}% toward ${c.next.name}`;
  } else if (c.activeId) {
    advanceCap = `Clear ${activeIncident.region.replace(' REGION', '')} to advance`;
  } else {
    advanceCap = `Awaiting next assignment`;
  }
  const nextLabel = c.next ? c.next.name : 'Highest tier attained';

  el.innerHTML = `
    <div class="oc-id-head">
      <span class="oc-id-badge" aria-hidden="true">ID</span>
      <div class="oc-id-org">
        <span class="oc-id-employer">${id.employer}</span>
        <span class="oc-id-division">${id.division}</span>
      </div>
    </div>
    <div class="oc-id-rows">
      <div class="oc-id-row"><span class="oc-id-label">Role</span><span class="oc-id-val">${role.name}</span></div>
      <div class="oc-id-row"><span class="oc-id-label">Supervisor</span><span class="oc-id-val">${id.supervisor} · ${id.supervisorRole}</span></div>
      <div class="oc-id-row"><span class="oc-id-label">Clearance</span><span class="oc-id-val oc-id-val--clear">${role.clearance}</span></div>
    </div>
    <div class="oc-id-advance">
      <div class="oc-id-advance-row">
        <span class="oc-id-label">Advancement</span>
        <span class="oc-id-advance-next">${nextLabel}</span>
      </div>
      <div class="oc-id-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${barPct}" aria-label="Promotion progress">
        <span class="oc-id-bar-fill" style="width:${barPct}%"></span>
      </div>
      <div class="oc-id-advance-cap">${advanceCap}</div>
    </div>
    <div class="oc-id-rows oc-id-rows--status">
      <div class="oc-id-row"><span class="oc-id-label">Queue</span><span class="oc-id-val">${activeRegion}</span></div>
      <div class="oc-id-row"><span class="oc-id-label">Division</span><span class="oc-id-val">Active Ops · ${c.completed}/${NODE_CHAIN.length} resolved</span></div>
    </div>`;

  maybeShowPromotion(c);
}

// Fire a one-time promotion notice when the derived role tier rises above the
// last tier this session rendered. The first render only seeds the baseline
// (no notice on load). A downward move (e.g. cleared storage) just re-seeds.
function maybeShowPromotion(career) {
  if (_lastSeenRoleTier === null) { _lastSeenRoleTier = career.tierIdx; return; }
  if (career.tierIdx > _lastSeenRoleTier) {
    _lastSeenRoleTier = career.tierIdx;
    showPromotionNotice(career.role);
  } else if (career.tierIdx < _lastSeenRoleTier) {
    _lastSeenRoleTier = career.tierIdx;
  }
}

// Professional, presentation-only promotion notice. A calm, dismissible card —
// no cinematic. Auto-dismisses after a short window. Writes nothing.
function showPromotionNotice(role) {
  document.getElementById('ocPromoNotice')?.remove();
  const el = document.createElement('div');
  el.id = 'ocPromoNotice';
  el.className = 'oc-promo-notice';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="oc-promo-head">
      <span class="oc-promo-org">CyberCorp · Operations Notice</span>
      <button class="oc-promo-close" type="button" aria-label="Dismiss">✕</button>
    </div>
    <div class="oc-promo-title">Promotion Confirmed</div>
    <div class="oc-promo-body">
      You have been promoted to <strong>${role.name}</strong>.<br>
      Clearance updated to <strong>${role.clearance}</strong>.<br>
      New responsibilities: ${role.unlocked}.
    </div>
    <div class="oc-promo-foot">— ${CYBERCORP_IDENTITY.division}</div>
    <button class="oc-promo-ack" type="button">Acknowledge</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('oc-promo-notice--in'));

  let timer = null;
  const dismiss = () => {
    if (timer) clearTimeout(timer);
    el.classList.remove('oc-promo-notice--in');
    setTimeout(() => el.remove(), 320);
  };
  el.querySelector('.oc-promo-ack').addEventListener('click', dismiss);
  el.querySelector('.oc-promo-close').addEventListener('click', dismiss);
  timer = setTimeout(dismiss, 14000);
}

function init() {
  // Clock
  updateClock();
  setInterval(updateClock, 1000);

  // Persistent CyberCorp identity panel (Phase 1 — immersion).
  renderIdentityPanel();

  // Render initial alerts
  INITIAL_ALERTS.forEach(a => renderAlert(a, false));

  // Render intel = authored updates + reactive world-memory entries (Phase 3).
  renderIntelFeed();

  // Render initial comms
  INITIAL_COMMS.forEach(msg => renderCommsMsg(msg));

  // Reflect real game progress on the map (read-only mirror of localStorage).
  applyMissionProgress();
  // Re-sync when the player returns from the main game (e.g. after completing a
  // mission), so completion/lock badges AND the career panel (role, clearance,
  // advancement, promotion notice) update without a manual reload.
  const resyncOpsState = () => { applyMissionProgress(); renderIdentityPanel(); renderIntelFeed(); renderBulletin(); };
  window.addEventListener('focus', resyncOpsState);
  window.addEventListener('pageshow', resyncOpsState);

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

  // Evidence Holotable — return to ops center
  document.getElementById('htBackBtn').addEventListener('click', returnFromHolotable);

  // Evidence Holotable — the prominent center hint is also a scan trigger
  // (so the path forward isn't only the side-dock button).
  document.getElementById('htStageHint').addEventListener('click', htRunScan);

  // Live SOC Console — return + terminal input.
  document.getElementById('scBackBtn').addEventListener('click', returnFromSocConsole);
  document.getElementById('scTermForm').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('scTermInput');
    const raw = input.value;
    input.value = '';
    scRunCommand(raw);
  });

  // Keyboard: Escape closes card or returns from workspace / holotable / console
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('socConsole').style.display !== 'none') {
        if (scCloseTopOverlay()) return;
        returnFromSocConsole();
      } else if (document.getElementById('holotable').style.display !== 'none') {
        // Close the top open overlay first; otherwise leave the holotable.
        if (htCloseTopOverlay()) return;
        returnFromHolotable();
      } else if (document.getElementById('missionWorkspace').style.display !== 'none') {
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
  // Volume slider — live-tracks the master gain (0–1) and persists per tab.
  const volSlider = document.getElementById('soundVolume');
  if (volSlider) {
    volSlider.addEventListener('input', () => {
      SoundEngine.setVolume(Number(volSlider.value) / 100);
    });
  }
  // Live-sync the shared mute preference if the main game (or another tab)
  // changes it while the Ops Center is open.
  window.addEventListener('storage', (e) => {
    if (e.key === SoundEngine.STORAGE_KEY) {
      SoundEngine.refresh();
      updateSoundToggleUI();
    }
  });

  // Threat ticker
  initThreatTicker();

  // Persistent-world security bulletins (Phase 3 — atmospheric, read-only).
  initBulletins();

  // Start rolling live feed
  scheduleRollingAlerts();
  scheduleRollingComms();

  // Start sound schedulers
  scheduleRadarPing();
  scheduleTickerBeeps();

  // Experimental: deep-link straight into a holotable interior for demoing /
  // testing the prototype (e.g. /ops-center/?holo=mission-001). Read-only — no
  // progress is written either way.
  try {
    const params = new URLSearchParams(window.location.search);
    const consoleId = params.get('console');
    const holoId = params.get('holo');
    // `console` takes precedence so the two deep-links can't open two screens.
    if (consoleId && HOLOTABLE_MISSIONS[consoleId] && HOLOTABLE_MISSIONS[consoleId].console) {
      openSocConsole(consoleId);
    } else if (holoId && HOLOTABLE_MISSIONS[holoId]) {
      openHolotable(holoId);
    }
  } catch (_) { /* ignore malformed query strings */ }
}

/* ============================================================
   LIVE SOC CONSOLE  (vertical slice — mission-003 C2 Beacon)
   A terminal-driven investigation over a reactive network map.
   Commands surface artifacts AND animate the map; the analyst
   inspects/classifies each, then contains the threat.
   Prototype-only, in-memory. NEVER writes localStorage/progress.
   ============================================================ */
let scMissionId   = null;   // active console mission id
let scScanned     = false;  // network scan run?
let scContained   = false;  // containment decision made?
const scClassified = {};    // artifactId -> "malicious" | "benign"
const scRevealed   = new Set();   // artifactIds surfaced into the queue
const scRanCmds    = new Set();   // reveal commands already run (netflow/procscan)
let scRunToken     = 0;     // bumped on open/return → stray timers no-op
let scInspectorTimer = null;

function scMission()   { return scMissionId ? HOLOTABLE_MISSIONS[scMissionId] : null; }
function scConfig()    { const m = scMission(); return m ? m.console : null; }
function scArtifacts() { const m = scMission(); return m ? m.artifacts : []; }
function scMaliciousArtifacts() { return scArtifacts().filter(a => a.verdict === 'malicious'); }
function scArtifactById(id) { return scArtifacts().find(a => a.id === id) || null; }
function scNodeById(id) { const c = scConfig(); return c ? c.nodes.find(n => n.id === id) : null; }

// All truly-malicious artifacts that have been revealed are flagged malicious.
function scAllMaliciousPinned() {
  const mal = scMaliciousArtifacts();
  return mal.length > 0
    && mal.every(a => scRevealed.has(a.id))
    && mal.every(a => scClassified[a.id] === 'malicious');
}
function scAllRevealed() {
  return scArtifacts().length > 0 && scArtifacts().every(a => scRevealed.has(a.id));
}

function openSocConsole(missionId) {
  const mission = HOLOTABLE_MISSIONS[missionId];
  if (!mission || !mission.console) return;

  scRunToken++;
  if (scInspectorTimer) { clearTimeout(scInspectorTimer); scInspectorTimer = null; }
  scMissionId = missionId;
  scScanned   = false;
  scContained = false;
  Object.keys(scClassified).forEach(k => delete scClassified[k]);
  scRevealed.clear();
  scRanCmds.clear();

  // Header strip.
  document.getElementById('scSeverity').textContent = mission.severity;
  document.getElementById('scRegion').textContent   = mission.region;
  document.getElementById('scOpId').textContent     = mission.opId;
  document.getElementById('scTitle').textContent    = mission.title;
  document.getElementById('scStatusText').textContent = 'ANALYSIS ACTIVE';
  const scCtxEl = document.getElementById('scContext');
  if (scCtxEl) {
    const c = opContext(mission.opId);
    scCtxEl.textContent = `${c.dept} · Sup: ${CYBERCORP_IDENTITY.supervisor}`;
  }

  // Reset overlays.
  ['scInspector', 'scDecision', 'scOutcome'].forEach(id => {
    const el = document.getElementById(id); if (el) { el.hidden = true; el.innerHTML = ''; }
  });

  // Terminal bar label (data-driven per incident type).
  const cfg = mission.console;
  const barLabel = document.getElementById('scTermBarLabel');
  if (barLabel) barLabel.textContent = cfg.termLabel || `analyst console — ${mission.opId}`;

  // Reset terminal + stage + rail.
  const out = document.getElementById('scTermOut');
  if (out) out.innerHTML = '';
  scTermPrint(cfg.intro || [
    { t: `CyberCorp SOC Console — ${mission.opId}`, c: 'head' },
    { t: 'Investigate the alert using the tools on the left, or type a command.' },
    { t: 'Type `help` for the full list of commands.', c: 'dim' },
  ]);
  scRenderStage();
  scApplyStageState();
  scRenderDock();
  scRenderRail();
  scRefreshObjective();

  const hint = document.getElementById('scMapHint');
  if (hint) hint.classList.remove('is-hidden');

  document.getElementById('opsCenter').style.display = 'none';
  document.getElementById('socConsole').style.display = 'flex';

  const input = document.getElementById('scTermInput');
  if (input) {
    const token = scRunToken;
    setTimeout(() => { if (token === scRunToken) input.focus(); }, 60);
  }

  SoundEngine.playNodeSelect('high');
}

function returnFromSocConsole() {
  scRunToken++;
  if (scInspectorTimer) { clearTimeout(scInspectorTimer); scInspectorTimer = null; }
  document.getElementById('socConsole').style.display = 'none';
  document.getElementById('opsCenter').style.display = 'flex';
  applyMissionProgress();   // re-sync read-only map badges
  scMissionId = null;
  SoundEngine.playCloseSound();
}

/* ---- Stage dispatch ----
   The investigation loop (dock / terminal / evidence rail / inspector /
   decision / outcome) is identical across incident types. Only the CENTER
   "stage" and the analysis commands differ. cfg.stage selects the renderer:
   'network' (reactive map), 'mail' (phishing analyzer), 'auth' (sign-in log). */
function scStageKind() { const c = scConfig(); return (c && c.stage) || 'network'; }

function scRenderStage() {
  const k = scStageKind();
  const map  = document.getElementById('scMap');
  const mail = document.getElementById('scMail');
  const auth = document.getElementById('scAuth');
  if (map)  map.hidden  = k !== 'network';
  if (mail) mail.hidden = k !== 'mail';
  if (auth) auth.hidden = k !== 'auth';
  if (k === 'network')   scRenderMap();
  else if (k === 'mail') scRenderMail();
  else if (k === 'auth') scRenderAuth();
}

function scApplyStageState() {
  const k = scStageKind();
  if (k === 'network')   scApplyMapState();
  else if (k === 'mail') scApplyMailState();
  else if (k === 'auth') scApplyAuthState();
}

/* ---- Stage: phishing email analyzer (mission-001) ---- */
function scRenderMail() {
  const cfg  = scConfig();
  const host = document.getElementById('scMail');
  if (!host) return;
  const mail = (cfg && cfg.mail) || null;
  if (!mail) { host.innerHTML = ''; return; }

  if (!scScanned) {
    host.innerHTML = `<div class="sc-mail-empty">Reported message not loaded — run <code>triage</code> to open it</div>`;
    return;
  }

  const headersRan = scRanCmds.has('headers');
  const linksRan   = scRanCmds.has('links');

  const bodyHtml = (mail.body || [])
    .map(p => p.replace('{link}', `<span class="sc-mail-link">${mail.link ? mail.link.text : ''}</span>`))
    .join('\n\n');

  let analysis = '';
  if (headersRan && mail.headers) {
    analysis += `<div class="sc-mail-analysis is-bad">
      <div class="sc-mail-analysis-head">⚙ HEADER ANALYSIS</div>
      ${mail.headers.map(h =>
        `<div class="sc-mail-kv ${h.bad ? 'is-bad' : 'is-ok'}"><span class="k">${h.k}</span><span class="v">${h.v}</span></div>`
      ).join('')}
    </div>`;
  }
  if (linksRan && mail.link) {
    analysis += `<div class="sc-mail-analysis is-bad">
      <div class="sc-mail-analysis-head">🔗 LINK DESTINATION</div>
      <div class="sc-mail-kv"><span class="k">Shown link</span><span class="v">${mail.link.text}</span></div>
      <div class="sc-mail-kv is-bad"><span class="k">Resolves to</span><span class="v">${mail.link.real}</span></div>
    </div>`;
  }
  if (!headersRan && !linksRan) {
    analysis = `<div class="sc-mail-empty" style="position:static;transform:none;margin-top:6px;">Run <code>headers</code> and <code>links</code> to analyze this message.</div>`;
  }

  host.innerHTML = `
    <div class="sc-mail-app">
      <div class="sc-mail-toolbar">📥 ${mail.mailbox || 'Inbox'}<span class="sc-mail-tag">REPORTED</span></div>
      <div class="sc-mail-msg">
        <div class="sc-mail-row"><span class="k">From</span><span class="v">${mail.from}${mail.fromNote ? `<em>${mail.fromNote}</em>` : ''}</span></div>
        <div class="sc-mail-row"><span class="k">To</span><span class="v">${mail.to}</span></div>
        <div class="sc-mail-row"><span class="k">Subject</span><span class="v subj">${mail.subject}</span></div>
        ${mail.received ? `<div class="sc-mail-row"><span class="k">Received</span><span class="v">${mail.received}</span></div>` : ''}
        <div class="sc-mail-body">${bodyHtml}</div>
      </div>
      ${analysis}
    </div>`;
}
function scApplyMailState() { scRenderMail(); }

/* ---- Stage: sign-in / auth-log timeline (mission-005) ---- */
function scRenderAuth() {
  const cfg  = scConfig();
  const host = document.getElementById('scAuth');
  if (!host) return;
  const auth = (cfg && cfg.auth) || null;
  if (!auth) { host.innerHTML = ''; return; }

  if (!scScanned) {
    host.innerHTML = `<div class="sc-auth-empty">Sign-in log not loaded — run <code>signins</code> to pull it</div>`;
    return;
  }

  const rows = (auth.events || []).map(ev => {
    const ran = scRanCmds.has(ev.flagBy);
    let cls = 'is-pending', result = 'analyzing…';
    if (ran) {
      cls = ev.sev === 'bad' ? 'is-bad' : (ev.sev === 'ok' ? 'is-ok' : '');
      result = ev.result;
      if (scContained && ev.sev === 'bad') { cls = 'is-bad is-contained'; result = 'BLOCKED — ' + ev.result; }
    }
    return `<tr class="sc-auth-row ${cls}">
      <td>${ev.time}</td>
      <td class="sc-auth-acct">${ev.account}</td>
      <td>${ev.src}</td>
      <td class="sc-auth-result">${result}</td>
    </tr>`;
  }).join('');

  host.innerHTML = `
    <div class="sc-auth-app">
      <div class="sc-auth-title">📋 ${auth.title || 'Sign-In Monitor'}</div>
      <table class="sc-auth-table">
        <thead><tr><th>TIME (UTC)</th><th>ACCOUNT</th><th>LOCATION / SOURCE</th><th>RESULT</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}
function scApplyAuthState() { scRenderAuth(); }

/* ---- Network map ---- */
const SC_NODE_GLYPH = { gateway: '⊟', sensor: '◎', host: '▢', cloud: '◇', threat: '⊗' };

function scRenderMap() {
  const cfg = scConfig();
  const svg = document.getElementById('scMapSvg');
  const host = document.getElementById('scMapNodes');
  if (!cfg || !svg || !host) return;
  svg.innerHTML = '';
  host.innerHTML = '';

  const SVGNS = 'http://www.w3.org/2000/svg';
  const line = (id, a, b, cls) => {
    const na = scNodeById(a), nb = scNodeById(b);
    if (!na || !nb) return;
    const el = document.createElementNS(SVGNS, 'line');
    el.setAttribute('x1', na.x); el.setAttribute('y1', na.y);
    el.setAttribute('x2', nb.x); el.setAttribute('y2', nb.y);
    el.setAttribute('vector-effect', 'non-scaling-stroke');
    el.setAttribute('class', cls);
    if (id) el.id = id;
    svg.appendChild(el);
  };
  (cfg.infraLinks || []).forEach(([a, b]) => line(`scLink-${a}-${b}`, a, b, 'sc-link sc-link--infra'));
  if (cfg.threatLink) line('scLinkThreat', cfg.threatLink.from, cfg.threatLink.to, 'sc-link');
  if (cfg.benignLink) line('scLinkBenign', cfg.benignLink.from, cfg.benignLink.to, 'sc-link');

  cfg.nodes.forEach(n => {
    const el = document.createElement('div');
    el.className = `sc-node sc-node--${n.type}`;
    el.id = `scNode-${n.id}`;
    el.style.left = `${n.x}%`;
    el.style.top  = `${n.y}%`;
    el.innerHTML = `
      <span class="sc-node-dot" aria-hidden="true">${SC_NODE_GLYPH[n.type] || '▢'}</span>
      <span class="sc-node-label">${n.label}</span>
    `;
    host.appendChild(el);
  });
}

// Toggle map node/link classes to reflect the current investigation state.
function scApplyMapState() {
  const cfg = scConfig();
  if (!cfg) return;
  // Which reveal command lights external flows (threat/benign links + external
  // nodes) and which one flags the focus host. Defaults preserve mission-003.
  const flowCmd  = cfg.flowCmd  || 'netflow';
  const focusCmd = cfg.focusCmd || 'procscan';
  const flowRan  = scRanCmds.has(flowCmd);
  const focusRan = scRanCmds.has(focusCmd);

  cfg.nodes.forEach(n => {
    const el = document.getElementById(`scNode-${n.id}`);
    if (!el) return;
    const live = scScanned && (!n.external || (n.external && flowRan));
    el.classList.toggle('is-live', live);
    if (n.focus) {
      el.classList.toggle('is-flagged', focusRan && !scContained);
      el.classList.toggle('is-contained', scContained);
    }
  });

  // Infra links live once scanned.
  (cfg.infraLinks || []).forEach(([a, b]) => {
    const el = document.getElementById(`scLink-${a}-${b}`);
    if (el) el.classList.toggle('is-live', scScanned);
  });
  const benign = document.getElementById('scLinkBenign');
  if (benign) benign.setAttribute('class', 'sc-link' + (flowRan ? ' is-benign' : ''));
  const threat = document.getElementById('scLinkThreat');
  if (threat) {
    threat.setAttribute('class', 'sc-link'
      + (flowRan ? (scContained ? ' is-severed' : ' is-threat') : ''));
  }
}

/* ---- Terminal ---- */
function scTermPrint(lines) {
  const out = document.getElementById('scTermOut');
  if (!out) return;
  (Array.isArray(lines) ? lines : [lines]).forEach(ln => {
    const div = document.createElement('div');
    div.className = 'sc-term-line' + (ln.c ? ` ${ln.c}` : '');
    div.textContent = ln.t;
    out.appendChild(div);
  });
  out.scrollTop = out.scrollHeight;
}

function setScObjective(text, progress) {
  const t = document.getElementById('scObjectiveText');
  const p = document.getElementById('scObjectiveProgress');
  if (t) t.textContent = text;
  if (p) p.textContent = progress || '';
}

function scClassifyProgressText() {
  const revealed = scArtifacts().filter(a => scRevealed.has(a.id)).length;
  const done = Object.keys(scClassified).length;
  return revealed ? `${done} / ${revealed} classified` : '';
}

function scRefreshObjective() {
  const cfg = scConfig();
  const obj = (cfg && cfg.objectives) || {};
  if (scContained) { setScObjective(obj.done || 'Incident closed. Review the outcome or return to the Operations Center.', ''); return; }
  if (!scScanned) { setScObjective(obj.start || 'Run the discovery command to begin.', ''); return; }
  if (!scAllRevealed()) {
    setScObjective(obj.investigate || 'Run your analysis tools to surface the remaining evidence.', scClassifyProgressText());
    return;
  }
  if (scAllMaliciousPinned()) {
    setScObjective(obj.ready || 'All malicious evidence flagged. Run `contain` to neutralize the threat.', scClassifyProgressText());
  } else {
    setScObjective(obj.classify || 'Inspect each item in the evidence queue and classify it.', scClassifyProgressText());
  }
}

/* ---- Command runner (data-driven from cfg.tools) ---- */
function scToolFor(word) {
  const cfg = scConfig();
  return ((cfg && cfg.tools) || []).find(t => t.cmd.split(/\s+/)[0].toLowerCase() === word) || null;
}

function scRunCommand(raw) {
  const text = (raw || '').trim();
  if (!text) return;
  const parts = text.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(' ').toLowerCase();

  if (cmd === 'help')  { scCmdHelp(); return; }
  if (cmd === 'clear') { const o = document.getElementById('scTermOut'); if (o) o.innerHTML = ''; return; }

  const tool = scToolFor(cmd);
  if (!tool) {
    scTermPrint([
      { t: text, c: 'cmd' },
      { t: `command not found: ${cmd}. Type \`help\` for available commands.`, c: 'err' },
    ]);
    return;
  }
  switch (tool.kind) {
    case 'scan':    scCmdScan(tool); break;
    case 'reveal':  scCmdReveal(tool.key, tool); break;
    case 'intel':   scCmdIntel(arg, tool); break;
    case 'contain': scCmdContain(); break;
    default: /* no-op */ break;
  }
}

function scCmdHelp() {
  const cfg = scConfig();
  const lines = [
    { t: 'help', c: 'cmd' },
    { t: '[ available commands ]', c: 'head' },
  ];
  ((cfg && cfg.tools) || []).forEach(t => {
    const label = (t.helpCmd || t.cmd.split(/\s+/)[0]);
    lines.push({ t: '  ' + label.padEnd(14) + (t.desc || '') });
  });
  lines.push({ t: '  ' + 'clear'.padEnd(14) + 'clear the screen' });
  lines.push({ t: 'Tip: click an item in the EVIDENCE panel to inspect & classify it.', c: 'dim' });
  scTermPrint(lines);
}

function scCmdScan(tool) {
  const cfg = scConfig();
  if (!cfg) return;
  const key = tool.key || 'scan';
  if (scScanned) { scTermPrint([{ t: tool.cmd, c: 'cmd' }, { t: cfg.scanAgainMsg || 'Already loaded.', c: 'dim' }]); return; }
  scScanned = true;
  SoundEngine.playRadarPing();
  const hint = document.getElementById('scMapHint');
  if (hint) hint.classList.add('is-hidden');
  scTermPrint(cfg.out[key] || []);
  // A discovery command may itself surface evidence (e.g. mail `triage`).
  const ids = (cfg.reveal && cfg.reveal[key]) || [];
  ids.forEach(id => scRevealed.add(id));
  scApplyStageState();
  scRenderRail(ids.length ? ids : undefined);
  scRenderDock();
  scRefreshObjective();
}

function scCmdReveal(key, tool) {
  const cfg = scConfig();
  if (!cfg) return;
  const label = (tool && tool.cmd) || key;
  if (!scScanned) {
    scTermPrint([{ t: label, c: 'cmd' }, { t: cfg.notReadyMsg || 'Run the discovery command first.', c: 'err' }]);
    return;
  }
  if (scRanCmds.has(key)) {
    scTermPrint([{ t: label, c: 'cmd' }, { t: 'Already run — evidence is in the queue.', c: 'dim' }]);
    return;
  }
  scRanCmds.add(key);
  scTermPrint(cfg.out[key] || []);
  SoundEngine.playTickerBeep();

  const ids = (cfg.reveal && cfg.reveal[key]) || [];
  ids.forEach(id => scRevealed.add(id));

  scApplyStageState();
  scRenderRail(ids);   // animate the just-revealed items
  scRenderDock();
  scRefreshObjective();
}

function scCmdIntel(arg, tool) {
  const cfg = scConfig();
  if (!cfg) return;
  // Gate typed intel the same way the dock button is disabled: a prerequisite
  // reveal command must have run first (so there is an IOC to look up).
  if (tool && tool.needs && !scRanCmds.has(tool.needs)) {
    scTermPrint([
      { t: (tool && tool.cmd) || 'intel', c: 'cmd' },
      { t: `Run \`${tool.needs}\` first — no indicator to look up yet.`, c: 'err' },
    ]);
    return;
  }
  if (!arg) {
    const usage = (tool && tool.cmd) || 'intel update-svc-cdn.net';
    scTermPrint([{ t: 'intel', c: 'cmd' }, { t: `usage: intel <ioc>   e.g. ${usage}`, c: 'dim' }]);
    return;
  }
  const table = (cfg.out.intel) || {};
  const key = Object.keys(table).find(k => k.toLowerCase() === arg);
  if (key) { scTermPrint(table[key]); SoundEngine.playNodeSelect('low'); }
  else scTermPrint([{ t: `intel ${arg}`, c: 'cmd' }, { t: `no threat-intel records for "${arg}".`, c: 'dim' }]);
}

function scCmdContain() {
  if (scContained) { scTermPrint([{ t: 'contain', c: 'cmd' }, { t: 'Threat already contained.', c: 'dim' }]); return; }
  if (!scAllMaliciousPinned()) {
    scTermPrint([
      { t: 'contain', c: 'cmd' },
      { t: 'Flag every malicious artifact in the evidence queue first.', c: 'err' },
    ]);
    return;
  }
  openScDecision();
}

/* ---- Evidence queue / rail ---- */
function scRenderRail(justRevealed) {
  const list  = document.getElementById('scRailList');
  const count = document.getElementById('scRailCount');
  if (!list) return;
  const revealed = scArtifacts().filter(a => scRevealed.has(a.id));
  if (count) count.textContent = String(revealed.length);

  if (revealed.length === 0) {
    list.innerHTML = `<div class="sc-rail-empty" id="scRailEmpty">No evidence yet. Run commands to surface artifacts, then inspect &amp; classify each one here.</div>`;
    return;
  }

  const fresh = new Set(justRevealed || []);
  list.innerHTML = revealed.map(a => {
    const verdict = scClassified[a.id] || null;
    let cls = '', tag = 'UNCLASSIFIED — click to inspect';
    if (verdict === 'malicious') {
      const tp = a.verdict === 'malicious';
      cls = tp ? 'is-malicious' : 'is-fp';
      tag = tp ? '⚑ MALICIOUS — CONFIRMED' : '⚠ FALSE POSITIVE?';
    } else if (verdict === 'benign') {
      cls = 'is-benign';
      tag = '✓ MARKED BENIGN';
    }
    const isNew = fresh.has(a.id) ? ' is-new' : '';
    return `
      <button type="button" class="sc-ev ${cls}${isNew}" data-sc-ev="${a.id}">
        <span class="sc-ev-kind">${a.kind}</span>
        <span class="sc-ev-label">${a.label}</span>
        <span class="sc-ev-tag">${tag}</span>
      </button>
    `;
  }).join('');

  list.querySelectorAll('[data-sc-ev]').forEach(btn => {
    btn.addEventListener('click', () => openScInspector(btn.dataset.scEv));
  });
}

/* ---- Tool dock (data-driven from cfg.tools) ---- */
function scRenderDock() {
  const dock = document.getElementById('scDock');
  const cfg  = scConfig();
  if (!dock || !cfg) return;
  const tools = cfg.tools || [];
  const canContain = scAllMaliciousPinned() && !scContained;

  const render = (t) => {
    let disabled = false, cls = '';
    if (t.kind === 'scan') {
      disabled = scScanned; cls = scScanned ? 'is-done' : 'sc-tool--primary';
    } else if (t.kind === 'reveal') {
      disabled = !scScanned; cls = scRanCmds.has(t.key) ? 'is-done' : '';
    } else if (t.kind === 'intel') {
      disabled = t.needs ? !scRanCmds.has(t.needs) : !scScanned;
    } else if (t.kind === 'contain') {
      disabled = !canContain; cls = canContain ? 'sc-tool--ready' : '';
    }
    const dis = disabled ? 'disabled' : '';
    const c = ['sc-tool', cls].filter(Boolean).join(' ');
    return `
      <button class="${c}" type="button" data-sc-cmd="${t.cmd}" ${dis}>
        <span class="sc-tool-icon" aria-hidden="true">${t.icon}</span>
        <span class="sc-tool-body">
          <span class="sc-tool-name">${t.name}</span>
          <span class="sc-tool-cmd">${t.hint}</span>
        </span>
      </button>`;
  };

  dock.innerHTML = `<div class="sc-dock-head">ANALYST TOOLS</div>` + tools.map(render).join('');

  dock.querySelectorAll('[data-sc-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.dataset.scCmd;
      const input = document.getElementById('scTermInput');
      if (input) input.value = cmd;
      scRunCommand(cmd);
      if (input) { input.value = ''; input.focus(); }
    });
  });
}

/* ---- Inspector ---- */
function openScInspector(artifactId) {
  const a = scArtifactById(artifactId);
  if (!a || !scRevealed.has(a.id)) return;
  SoundEngine.playNodeSelect('medium');

  const current = scClassified[a.id] || null;
  const notesHtml = (a.notes || []).map(nt => `<li>${nt}</li>`).join('');
  const panel = document.getElementById('scInspector');
  panel.innerHTML = `
    <div class="sc-panel">
      <div class="sc-panel-head">
        <span class="sc-panel-kind">${a.kind}</span>
        <span class="sc-panel-title">${a.label}</span>
        <button class="sc-panel-close" type="button" data-sc-close aria-label="Close inspector">✕</button>
      </div>
      <div class="sc-panel-body">
        <pre class="sc-detail">${a.detail}</pre>
        <div class="sc-notes">
          <div class="sc-notes-head">ANALYST OBSERVATIONS</div>
          <ul>${notesHtml}</ul>
        </div>
      </div>
      <div class="sc-verdict-banner" id="scInspectorVerdict" hidden></div>
      <div class="sc-panel-actions">
        <button class="sc-btn sc-btn--mal" type="button" data-sc-verdict="malicious">⚑ FLAG AS MALICIOUS</button>
        <button class="sc-btn sc-btn--ben" type="button" data-sc-verdict="benign">✓ MARK BENIGN</button>
      </div>
    </div>
  `;
  panel.hidden = false;
  panel.querySelector('[data-sc-close]').addEventListener('click', closeScInspector);
  panel.querySelectorAll('[data-sc-verdict]').forEach(btn => {
    btn.addEventListener('click', () => scClassify(a.id, btn.dataset.scVerdict));
  });
  if (current) showScInspectorVerdict(a, current, false);
}

function closeScInspector() {
  if (scInspectorTimer) { clearTimeout(scInspectorTimer); scInspectorTimer = null; }
  const panel = document.getElementById('scInspector');
  if (!panel || panel.hidden) return;
  panel.hidden = true;
  panel.innerHTML = '';
}

function showScInspectorVerdict(a, verdict, animateClose) {
  const banner = document.getElementById('scInspectorVerdict');
  if (!banner) return;
  const correct = verdict === a.verdict;
  banner.hidden = false;
  banner.className = `sc-verdict-banner ${correct ? 'sc-verdict-banner--ok' : 'sc-verdict-banner--no'}`;
  if (correct) {
    banner.textContent = verdict === 'malicious'
      ? '✓ Correct — flagged and pinned to the evidence board.'
      : '✓ Correct — this artifact is legitimate.';
  } else {
    banner.textContent = verdict === 'malicious'
      ? '✗ Reconsider — this one is actually legitimate. Re-inspect and change your call.'
      : '✗ Reconsider — there are warning signs here. Re-inspect and change your call.';
  }
  if (animateClose && correct) {
    if (scInspectorTimer) clearTimeout(scInspectorTimer);
    const token = scRunToken;
    scInspectorTimer = setTimeout(() => {
      scInspectorTimer = null;
      if (token !== scRunToken) return;
      closeScInspector();
    }, 950);
  }
}

function scClassify(artifactId, verdict) {
  const a = scArtifactById(artifactId);
  if (!a) return;
  scClassified[a.id] = verdict;
  const correct = verdict === a.verdict;
  if (correct) SoundEngine.playSuccess(); else SoundEngine.playError();

  showScInspectorVerdict(a, verdict, true);
  scRenderRail();
  scRenderDock();
  scRefreshObjective();
}

/* ---- Containment decision ---- */
function openScDecision() {
  const m = scMission();
  if (!m || !scAllMaliciousPinned() || scContained) return;
  SoundEngine.playNodeSelect('high');

  const choices = m.decisions.map(d => `
    <button class="sc-choice" type="button" data-sc-decision="${d.id}">
      <span class="sc-choice-label">${d.label}</span>
      <span class="sc-choice-sub">${d.sub}</span>
    </button>
  `).join('');

  const panel = document.getElementById('scDecision');
  panel.innerHTML = `
    <div class="sc-panel">
      <div class="sc-panel-head">
        <span class="sc-panel-kind">DECISION</span>
        <span class="sc-panel-title">Choose a containment action</span>
        <button class="sc-panel-close" type="button" data-sc-close aria-label="Close decision">✕</button>
      </div>
      <div class="sc-panel-body">${choices}</div>
    </div>
  `;
  panel.hidden = false;
  panel.querySelector('[data-sc-close]').addEventListener('click', () => { panel.hidden = true; panel.innerHTML = ''; });
  panel.querySelectorAll('[data-sc-decision]').forEach(btn => {
    btn.addEventListener('click', () => scChooseDecision(btn.dataset.scDecision));
  });
}

function scChooseDecision(decisionId) {
  const m = scMission();
  if (!m) return;
  const decision = m.decisions.find(d => d.id === decisionId);
  if (!decision) return;

  scContained = true;
  const panel = document.getElementById('scDecision');
  if (panel) { panel.hidden = true; panel.innerHTML = ''; }

  // Reflect containment on the active stage (sever links / quarantine / block).
  const cfg = scConfig();
  scApplyStageState();
  scRenderDock();
  scTermPrint([
    { t: 'contain', c: 'cmd' },
    { t: `[+] ${decision.label}.`, c: 'ok' },
    { t: (cfg && cfg.containLine) || '[+] Threat neutralized. Incident closed.', c: 'ok' },
  ]);

  showScOutcome(decision);
}

/* ---- Outcome scorecard ---- */
function showScOutcome(decision) {
  const m = scMission();
  if (!m) return;
  const arts = scArtifacts();
  const total = arts.length;
  const correct = arts.filter(a => scClassified[a.id] === a.verdict).length;
  const accuracy = correct / total;

  let tierClass, tierLabel;
  if (accuracy === 1 && decision.quality === 'excellent') {
    tierClass = 'excellent'; tierLabel = 'EXCELLENT CONTAINMENT';
  } else if (accuracy >= 0.66 && decision.quality !== 'poor') {
    tierClass = 'solid'; tierLabel = 'THREAT CONTAINED';
  } else {
    tierClass = 'delayed'; tierLabel = 'DELAYED CONTAINMENT';
  }
  if (tierClass === 'delayed') SoundEngine.playError(); else SoundEngine.playSuccess();

  document.getElementById('scStatusText').textContent = 'INCIDENT CLOSED';

  const panel = document.getElementById('scOutcome');
  panel.innerHTML = `
    <div class="sc-panel">
      <div class="sc-panel-head">
        <span class="sc-panel-kind">CLOSEOUT</span>
        <span class="sc-panel-title">${m.title} — Outcome</span>
      </div>
      <div class="sc-panel-body">
        <div class="sc-outcome-tier sc-outcome-tier--${tierClass}">${tierLabel}</div>
        <div class="sc-outcome-sub">${decision.outcome}</div>
        <div class="sc-outcome-stats">
          <div class="sc-stat"><div class="sc-stat-num">${correct}/${total}</div><div class="sc-stat-label">ARTIFACTS<br>CORRECT</div></div>
          <div class="sc-stat"><div class="sc-stat-num">${Math.round(accuracy * 100)}%</div><div class="sc-stat-label">ANALYSIS<br>ACCURACY</div></div>
          <div class="sc-stat"><div class="sc-stat-num">${scMaliciousArtifacts().length}</div><div class="sc-stat-label">THREATS<br>PINNED</div></div>
        </div>
        <div class="sc-outcome-takeaway">${m.takeaway}</div>
      </div>
      <div class="sc-panel-actions">
        <button class="sc-btn" type="button" data-sc-replay>↻ REPLAY</button>
        <button class="sc-btn sc-btn--primary" type="button" data-sc-return>RETURN TO OPERATIONS CENTER</button>
      </div>
    </div>
  `;
  panel.hidden = false;
  scRefreshObjective();

  panel.querySelector('[data-sc-replay]').addEventListener('click', () => {
    panel.hidden = true; panel.innerHTML = '';
    openSocConsole(scMissionId);
  });
  panel.querySelector('[data-sc-return]').addEventListener('click', () => {
    panel.hidden = true; panel.innerHTML = '';
    returnFromSocConsole();
  });
}

/* ---- Escape handling ---- */
function scOverlayOpen() {
  return ['scInspector', 'scDecision', 'scOutcome'].some(id => {
    const el = document.getElementById(id); return el && !el.hidden;
  });
}
function scCloseTopOverlay() {
  const inspector = document.getElementById('scInspector');
  const decision  = document.getElementById('scDecision');
  if (inspector && !inspector.hidden) { closeScInspector(); return true; }
  if (decision && !decision.hidden)   { decision.hidden = true; decision.innerHTML = ''; return true; }
  return false;  // outcome is terminal — Escape won't dismiss it
}

document.addEventListener('DOMContentLoaded', init);
