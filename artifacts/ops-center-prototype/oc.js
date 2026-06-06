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

   First vertical slice: mission-001 (Credential Phishing). Other
   nodes still deep-link into the main game (see launchWorkspace).
   ============================================================ */
const HOLOTABLE_MISSIONS = {
  "mission-001": {
    severity: "CRITICAL",
    region:   "EMEA REGION",
    opId:     "OPS-2026-001",
    title:    "Credential Phishing Campaign",
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

  // Experimental Evidence Holotable interior — currently mission-001 only.
  // Missions backed by a holotable open the in-prototype interior instead of
  // deep-linking into the main game.
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
        <pre class="ht-artifact-detail">SOC LEAD — Sarah Reyes:

A user reported a "re-verify your VPN" email. Several look-alike
artifacts surfaced around this incident. Inspect each one on the
holotable, flag the malicious items, then choose how to contain
the threat. Take your time — re-inspect anything you're unsure of.</pre>
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

  // Evidence Holotable — return to ops center
  document.getElementById('htBackBtn').addEventListener('click', returnFromHolotable);

  // Keyboard: Escape closes card or returns from workspace / holotable
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (document.getElementById('holotable').style.display !== 'none') {
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
    const holoId = new URLSearchParams(window.location.search).get('holo');
    if (holoId && HOLOTABLE_MISSIONS[holoId]) openHolotable(holoId);
  } catch (_) { /* ignore malformed query strings */ }
}

document.addEventListener('DOMContentLoaded', init);
