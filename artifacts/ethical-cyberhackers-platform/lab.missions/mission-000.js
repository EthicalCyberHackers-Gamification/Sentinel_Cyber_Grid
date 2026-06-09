/*
 * lab.missions/mission-000.js — CyberCorp Analyst Orientation (Assignment 000)
 *
 * A beginner network/SOC ORIENTATION lab, NOT a graded assignment. It is
 * reachable ONLY via the deep link `?lab=mission-000` and is intentionally
 * absent from MISSION_PLAY_ORDER / the mission list / the Operations Center map
 * and the unlock chain. It awards NO XP and never persists — the host's
 * notifyLabComplete() no-ops for ids outside MISSION_PLAY_ORDER, and the host's
 * canOpen() has a surgical bypass for this id only.
 *
 * It reuses the generic lab engine (lab.js) with three small, data-gated
 * additions keyed off `report` (a multiple-choice orientation report + an
 * orientation scorecard), so the six real assignments are completely untouched.
 *
 * Flow (a deliberately short, guided arc):
 *   1. TRIAGE   — read the connection snapshot, find the repeated outside address
 *   2. ANALYSIS — pin the two things you observed (reveals a small network map)
 *   3. IDENTIFY — whois / ports / baseline confirm the source, then file a
 *                 MULTIPLE-CHOICE orientation report and read a short debrief.
 *
 * Response actions (block / isolate / escalate) are shown but LOCKED — they are
 * taught later in the career arc and are not needed for orientation.
 *
 * Scenario: one unknown external host (203.0.113.77) contacting WS-4471
 * (10.0.5.12) across several unrelated ports; a benign CDN (198.51.100.20) and
 * internal DNS act as known-good contrast.
 */
export default {
  id: 'mission-000',
  opId: 'OPS-TRN-000',
  severity: 'TRAINING',
  headerTitle: 'Analyst Orientation — Network Investigation Basics',
  context: 'Training Telemetry · Host: WS-4471',
  consoleAriaLabel: 'Analyst Orientation — Network Investigation Basics',
  mapCap: 'NETWORK MAP — builds as you investigate',
  nodeTags: { blocked: 'BLOCKED', cleared: 'WATCHED', secured: 'SECURED' },
  reportKey: 'report',
  seedNodes: ['workstation', 'source'],
  groups: {
    dock: { 1: 'TRIAGE', 3: 'ANALYST TOOLS', 5: 'RESPONSE ACTIONS' },
    kit:  { 1: 'TRIAGE COMMANDS', 3: 'ANALYST TOOLS', 5: 'RESPONSE ACTIONS' },
  },
  prompts: {
    threshold: 3,
    fileLabel: 'trainee@ws-4471: ~/triage',
    filePrompt: 'trainee@ws-4471:~/triage$',
    filePwd: '/home/trainee/triage',
    socLabel: 'trainee@soc — orientation OPS-TRN-000',
    socPrompt: 'trainee@soc:~$',
    socPwd: '/home/trainee',
  },
  intro: [
    { t: 'CyberCorp Security Training — Assignment 000 · Analyst Orientation', c: 'head' },
    { t: 'Welcome to the SOC (Security Operations Center). On the Blue Team your job is to watch network traffic and decide what is normal and what deserves a second look.' },
    { t: 'This is your warm-up — no score, no pressure. You will learn the core loop of', c: 'dim' },
    { t: 'network triage: read a connection snapshot, spot an outside address that keeps', c: 'dim' },
    { t: 'coming back, check who it is, and decide whether it is worth escalating.', c: 'dim' },
    { t: 'Everything is explained as you reach it. The panel on the left frames what to', c: 'dim' },
    { t: 'suspect; the SOC TOOL KIT lists the commands you can run; HINT nudges you one', c: 'dim' },
    { t: 'step at a time. Investigate first, decide last.', c: 'dim' },
  ],
  support: { beginner: true },
  objective: {
    1: 'Open the connection snapshot for WS-4471 and find which outside address keeps coming back.',
    2: 'Commit what you observed — pin the two indicators to your evidence board (2 to continue).',
    3: 'Identify the source: run your analyst tools (who owns it, which ports, is it on the baseline), then file your orientation report.',
  },
  framing: {
    1: { suspicion: 'Sensors flagged repeated traffic to WS-4471 from one outside address.',
         question: 'Which external address keeps coming back to this workstation?',
         why: 'Repeated contact from one unknown source is the very first thing a SOC analyst checks.' },
    2: { suspicion: 'The same outside address shows up again and again, on several ports.',
         question: 'Is this a normal peer, or something worth a closer look?',
         why: 'Committing what you observe turns a hunch into evidence you can act on.' },
    3: { suspicion: 'One unknown external source touched multiple services on the workstation.',
         question: 'Who owns it, which ports did it hit, and is it an approved peer?',
         why: 'Confirming the source and comparing it to the baseline is how you decide if traffic is suspicious.' },
  },
  // Step-by-step tutorial coaching (orientation only — gated on report.choices).
  // The engine appends the exact command from `tools` so the command strings live
  // in ONE place; only the plain-language wording lives here. Beginner-friendly:
  // explain the outcome, then point to the next concrete step by name.
  coach: {
    ls:           'Those are the files exported from the flagged workstation (WS-4471) — your raw evidence to work through.',
    catNext:      'read the connection snapshot to see every address WS-4471 is talking to',
    grepNext:     'pull that one outside address out of the access log to see which ports it touched',
    pinNext:      'commit both findings to your evidence board',
    toolsNext:    'confirm the source with your analyst tools',
    reportChoose: 'pick the determination your evidence best supports from the choices above',
    reportNext:   'you have enough to decide — file your orientation report',
  },
  files: [
    { name: 'README.txt', icon: '📘', desc: 'orientation notes' },
    { name: 'network_snapshot.txt', icon: '🗂', desc: 'live connection snapshot', suspect: true },
    { name: 'access.log', icon: '📄', desc: 'service access log' },
    { name: 'baseline.txt', icon: '📊', desc: 'known-good peers' },
  ],
  fs: {
    'README.txt': [
      'Analyst Orientation — network investigation basics',
      '',
      'Welcome. A quick vocabulary primer before you start:',
      '',
      '  IP address  an address for a device on the network (e.g. 10.0.5.12).',
      '              10.x addresses are usually internal (ours); other ranges',
      '              are outside / the wider internet.',
      '  Port        a numbered "door" for one service: 22=ssh, 80=http,',
      '              443=https, 3306=database. A normal peer uses one or two.',
      '  Baseline    the reviewed list of contacts a host is SUPPOSED to talk to.',
      '',
      'Workstation WS-4471 (10.0.5.12) was flagged. Walk through it:',
      '  1. list the files in this triage folder',
      '  2. read the connection snapshot and find the outside address that repeats',
      '  3. pull that address out of the access log to see which ports it touched',
      '',
      'Investigate first, decide last. Press HINT any time, or open the SOC TOOL',
      'KIT for the exact commands.',
    ],
    'network_snapshot.txt': [
      'WS-4471 active connections (snapshot)',
      '',
      'PROTO  LOCAL            REMOTE              STATE',
      'tcp    10.0.5.12:51120  203.0.113.77:443    ESTABLISHED',
      'tcp    10.0.5.12:51122  203.0.113.77:80     TIME_WAIT',
      'tcp    10.0.5.12:51124  203.0.113.77:22     SYN_SENT',
      'tcp    10.0.5.12:51126  203.0.113.77:3306   SYN_SENT',
      'tcp    10.0.5.12:50980  198.51.100.20:443   ESTABLISHED   (CDN)',
      'tcp    10.0.5.12:50982  10.0.5.1:53         ESTABLISHED   (DNS)',
      '',
      'Reminder: 10.x addresses are internal. 203.0.113.77 is an outside address —',
      'and it appears on four different ports.',
    ],
    'access.log': [
      '# service access log (most recent first)',
      '203.0.113.77 -> port 22 (ssh)     probe',
      '203.0.113.77 -> port 80 (http)    probe',
      '203.0.113.77 -> port 443 (https)  probe',
      '203.0.113.77 -> port 3306 (mysql) probe',
      '198.51.100.20 -> port 443 (https) content fetch (CDN)',
      '10.0.5.30 -> port 445 (smb)       normal file share',
    ],
    'baseline.txt': [
      'WS-4471 known-good peers (reviewed baseline)',
      '',
      '  10.0.5.1        internal DNS resolver',
      '  10.0.5.30       department file server',
      '  198.51.100.20   content delivery network (software updates)',
      '',
      'Anything contacting this host that is NOT on this list is "unexpected"',
      'until proven otherwise. 203.0.113.77 is not here.',
    ],
  },
  fileInvestigation: {
    helpHead: 'Triage commands — investigate the exported telemetry:',
    filesHead: '📂 ~/triage &nbsp; <span>—</span> &nbsp; click a file to <code>cat</code> it',
    railEmpty: 'No evidence yet. Read the files, then pin the indicators you find.',
    onCat: {
      'network_snapshot.txt': {
        note: [{ t: '[!] One outside address — 203.0.113.77 — appears on four different ports. That repetition is worth a closer look.', c: 'warn' }],
        discover: 'repeat-external',
        next: [{ t: 'Next, pull that address out of the access log to see exactly which ports it touched.', c: 'dim' }],
      },
    },
    grepAha: {
      file: 'access.log',
      requireUrl: false,
      found: [
        { t: '[+] 203.0.113.77 reached for ssh, http, https AND mysql — four', c: 'ok' },
        { t: '    different services from one outside address. A real peer talks', c: 'ok' },
        { t: '    to one service; touching many at once is probing behaviour.', c: 'ok' },
      ],
      fb: {
        means: 'One outside address — 203.0.113.77 — touched ssh, http, https and mysql; a normal peer uses a single service.',
        changes: 'This is no longer just "odd traffic" — you have an unknown source reaching for many unrelated services.',
        next: 'Who owns that address, and is it an approved peer for this host?',
      },
      discover: 'multi-port-probe',
      advanceTo: 2,
      unlock: [
        { t: '' },
        { t: '── OBSERVATIONS READY ────────────────────────────', c: 'head' },
        { t: 'You spotted the two key things. Now COMMIT them: pin each indicator', c: 'dim' },
        { t: 'on the EVIDENCE board so your findings are on the record.', c: 'dim' },
      ],
    },
  },
  ind: {
    // Stage 1–2 observations (group: recon) — what you read in the files.
    'repeat-external': { group: 'recon', kind: 'TRAFFIC', label: 'One outside address keeps contacting WS-4471',
      teach: '203.0.113.77 appears again and again in the snapshot. A legitimate peer usually uses one service; one unknown address reappearing is the first thing to check.',
      intel: {
        what: 'A single external address (203.0.113.77) connecting to WS-4471 over and over, across multiple ports.',
        technique: 'Connection review — read the live snapshot and look for one remote address that keeps reappearing.',
        why: 'Repeated contact from one outside source is the cheapest, earliest signal that something is off.',
        supports: 'An unknown source worth investigating.' } },
    'multi-port-probe': { group: 'recon', kind: 'SCAN', label: 'That address touched several different ports',
      teach: 'The same host reached ssh (22), http (80), https (443) and mysql (3306). Touching many unrelated services at once looks like probing, not normal use.',
      intel: {
        what: '203.0.113.77 reached for ssh, http, https and mysql in quick succession.',
        technique: 'Log analysis — grep the access log for the suspect address and list every port it touched.',
        why: 'A real connection uses one service; reaching many different ports is the shape of a scan.',
        supports: 'Probing behaviour, not a normal single-service peer.' } },
    // Stage 3 confirmations (group: soc) — what your analyst tools proved.
    'unknown-source': { group: 'soc', kind: 'WHOIS', label: 'The source is unregistered / unknown infrastructure',
      teach: 'WHOIS on 203.0.113.77 returns no organisation and no abuse contact — anonymous infrastructure, unlike the named CDN it sits next to.',
      intel: {
        what: '203.0.113.77 resolves to no registered organisation and lists no abuse contact.',
        technique: 'WHOIS lookup — query the registry for ownership and abuse contact of the source IP.',
        why: 'Legitimate services are registered and contactable; anonymous infrastructure is a red flag.',
        supports: 'An unknown source, not an accountable peer.' } },
    'targeted-ports': { group: 'soc', kind: 'PORTS', label: 'It probed multiple unrelated services (22/80/443/3306)',
      teach: 'WS-4471 only listens on ssh and smb, yet the source hit http, https and mysql too. It is reaching for doors this host does not even have.',
      intel: {
        what: 'The probed ports (80/443/3306) include services WS-4471 does not run at all.',
        technique: 'Port comparison — line up the probed ports against what the host actually listens on.',
        why: 'Reaching for services that do not exist is blind probing, not a real connection.',
        supports: 'Multiple unrelated ports — blind probing.' } },
    'off-baseline': { group: 'soc', kind: 'BASELINE', label: 'The source is not on the known-good baseline',
      teach: '203.0.113.77 is absent from the reviewed list of approved peers — and the CDN beside it is on the list. The baseline turns "looks odd" into "is unexpected".',
      intel: {
        what: '203.0.113.77 does not appear on WS-4471\u2019s reviewed list of known-good peers.',
        technique: 'Baseline comparison — diff the observed contacts against the approved peer list.',
        why: 'The baseline is what lets you call a source unexpected rather than merely unfamiliar.',
        supports: 'Off-baseline — unexpected, not a known-good peer.' } },
  },
  topo: {
    nodes: {
      'workstation': { x: 18, y: 50, glyph: '💻', label: 'WS-4471', sub: '10.0.5.12 · workstation', type: '',
        intel: {
          what: 'The employee workstation that was flagged — your starting point.',
          technique: 'Endpoint triage — review the host\u2019s own connection and log data.',
          why: 'Everything you analyse is traffic to or from this host.' } },
      'source': { x: 56, y: 26, glyph: '❓', label: '203.0.113.77', sub: 'unknown external', type: 'threat',
        intel: {
          what: 'An unregistered outside address contacting the workstation repeatedly.',
          technique: 'WHOIS lookup on the repeated source address.',
          why: 'Unknown, unaccountable infrastructure is a classic red flag.',
          supports: 'An unknown source.' } },
      'svc': { x: 84, y: 52, glyph: '🚪', label: 'Ports 22 · 80 · 443 · 3306', sub: 'services probed', type: 'threat',
        intel: {
          what: 'The cluster of unrelated services the source reached for.',
          technique: 'Port lookup on the source address.',
          why: 'One peer rarely needs many unrelated services at once — this looks like probing.',
          supports: 'Multiple unrelated ports.' } },
      'known': { x: 50, y: 80, glyph: '✅', label: 'Known-good peers', sub: 'baseline · CDN + DNS', type: '',
        intel: {
          what: 'The host\u2019s approved, expected contacts (CDN and internal DNS).',
          technique: 'Baseline comparison.',
          why: 'The known-good baseline is what makes the unknown source stand out.',
          supports: 'Off-baseline — the source is absent from this list.' } },
    },
    links: [
      { a: 'workstation', b: 'source', danger: true,
        intel: {
          what: 'Repeated contact between the host and an unknown outside address.',
          technique: 'Connection snapshot review.',
          why: 'This is the relationship the whole investigation turns on.',
          supports: 'An unknown source contacting the host.' } },
      { a: 'source', b: 'svc', danger: true,
        intel: {
          what: 'The unknown source reached several unrelated services.',
          technique: 'Port lookup.',
          why: 'Touching many unrelated ports at once looks like probing.',
          supports: 'Multiple unrelated ports.' } },
      { a: 'workstation', b: 'known',
        intel: {
          what: 'Normal, expected traffic to approved peers.',
          technique: 'Baseline comparison.',
          why: 'Shows what legitimate traffic looks like, for contrast.',
          supports: 'Ruling the baseline peers in as benign.' } },
    ],
  },
  tools: [
    { key: 'ls',   cmd: 'ls',                              unlock: 1, icon: '📁', name: 'List files',   hint: 'ls' },
    { key: 'cat',  cmd: 'cat network_snapshot.txt',        unlock: 1, icon: '📄', name: 'Read snapshot', hint: 'cat <file>' },
    { key: 'grep', cmd: 'grep 203.0.113.77 access.log',    unlock: 1, icon: '🔍', name: 'Find the source', hint: 'grep <pat> <file>' },

    { key: 'whois', cmd: 'whois 203.0.113.77', unlock: 3, icon: '🌐', name: 'WHOIS source', hint: 'whois <ip>',
      run: { already: 'Already looked up — see the evidence board.', discover: 'unknown-source', output: [
        { t: 'IP:        203.0.113.77' },
        { t: 'OrgName:   Unknown / Unregistered', c: 'warn' },
        { t: 'Country:   --   ·   abuse contact: none on file', c: 'warn' },
        { t: '[+] Anonymous, unregistered source — not a known, accountable peer.', c: 'ok' },
      ], fb: {
        means: 'The source address resolves to no registered organisation and lists no abuse contact.',
        changes: 'This is unknown infrastructure, not a legitimate peer that merely looked unfamiliar.',
        next: 'Which ports did it actually reach — and does this host even run them?',
      } } },
    { key: 'ports', cmd: 'ports 203.0.113.77', unlock: 3, icon: '🚪', name: 'Probed ports', hint: 'ports <ip>',
      run: { already: 'Already mapped — see the evidence board.', addNode: 'svc', discover: 'targeted-ports', output: [
        { t: 'ports reached by 203.0.113.77:  22, 80, 443, 3306' },
        { t: 'WS-4471 actually listens on:    22 (ssh), 445 (smb)' },
        { t: '[+] 80/443/3306 are services this host does not even run — blind probing.', c: 'warn' },
      ], fb: {
        means: 'The source reached for 80, 443 and 3306 — services WS-4471 does not run.',
        changes: 'Reaching for doors that do not exist is probing, not a real connection.',
        next: 'Is this address on the host\u2019s approved peer list, or is it unexpected?',
      } } },
    { key: 'baseline', cmd: 'compare baseline', unlock: 3, icon: '📊', name: 'Compare baseline', hint: 'compare baseline',
      run: { already: 'Already compared — see the evidence board.', addNode: 'known', discover: 'off-baseline', output: [
        { t: 'checking 203.0.113.77 against known-good peers …', c: 'dim' },
        { t: '198.51.100.20  -> on baseline (CDN — benign)', c: '' },
        { t: '10.0.5.1       -> on baseline (internal DNS — benign)', c: '' },
        { t: '203.0.113.77   -> NOT on baseline', c: 'warn' },
        { t: '[+] The source is unexpected; the CDN and DNS beside it are ruled out.', c: 'ok' },
      ], fb: {
        means: 'The source is absent from the reviewed known-good peer list, while the CDN and DNS are on it.',
        changes: 'You can now call it unexpected, not merely unfamiliar — and rule the benign peers out.',
        next: 'You have enough to decide — file your orientation report.',
      } } },

    { key: 'report', cmd: 'submit orientation report', unlock: 3, icon: '📨', name: 'File orientation report', hint: 'submit orientation report' },

    // Response actions — shown but LOCKED. Taught later in the career arc; an
    // orientation never needs to act, only to investigate and decide.
    { key: 'block',    cmd: 'block source',     unlock: 5, icon: '⊘', name: 'Block source',     hint: 'block source' },
    { key: 'isolate',  cmd: 'isolate host',     unlock: 5, icon: '🔌', name: 'Isolate host',     hint: 'isolate host' },
    { key: 'escalate', cmd: 'escalate alert',   unlock: 5, icon: '⏫', name: 'Escalate to tier 2', hint: 'escalate alert' },
  ],
  verb: {
    whois: 'whois', ports: 'ports', compare: 'baseline', submit: 'report',
    block: 'block', isolate: 'isolate', escalate: 'escalate',
  },
  doc: {
    ls:     { purpose: 'Get your bearings — see what telemetry was exported before you dig in.',
              learn: 'Before you can investigate anything, you have to know what is in front of you. `ls` ("list") prints the files in the current folder so you can see the telemetry exported from the flagged host.' },
    cat:    { purpose: 'Read the connection snapshot to see who the host is really talking to.',
              learn: '`cat` reads a file out to the terminal. Point it at the connection snapshot to see every address WS-4471 is talking to — and which one keeps coming back.' },
    grep:   { purpose: 'Pull one suspect address out of a noisy log to see what it reached for.',
              learn: '`grep` prints only the lines of a file that match a pattern. Point it at the suspect address in the access log to see every port it touched.' },
    whois:  { purpose: 'Find out whether the source is an accountable owner or unknown infrastructure.',
              learn: 'Every legitimate service is registered to an organisation with an abuse contact. `whois` reveals that ownership — or, for an unknown source, the lack of it.' },
    ports:  { purpose: 'Tell blind probing apart from a peer using a service you actually offer.',
              learn: 'A real peer connects to a service you actually run. This compares the ports the source reached against the ports WS-4471 truly listens on — reaching for doors that do not exist is probing.' },
    baseline:{ purpose: 'Decide whether the source is expected or unexpected.',
              learn: 'A baseline is the reviewed list of addresses a host is supposed to talk to. Comparing against it turns "this looks unfamiliar" into "this is unexpected" — and rules out benign peers like the CDN.' },
    report: { purpose: 'Record your determination and close out the orientation.',
              learn: 'Every investigation ends with a determination. Here you pick the conclusion your evidence best supports — the orientation report is multiple-choice.' },
    block:  { purpose: 'Cut off a confirmed-malicious source. (Locked in orientation.)',
              learn: 'Blocking a source at the firewall stops it from reaching you. It is a real response action you learn to use later — orientation is about investigating and deciding, not acting.' },
    isolate:{ purpose: 'Quarantine a compromised host from the network. (Locked in orientation.)',
              learn: 'Isolating a host pulls it off the network so a threat cannot spread. It is a later-stage response action — not needed for an orientation.' },
    escalate:{ purpose: 'Hand a confirmed incident to a senior analyst. (Locked in orientation.)',
              learn: 'Escalation routes a confirmed incident to tier-2 responders. You will practise it in a real assignment — for now, just reach the right determination.' },
  },
  hintFlow: {
    stage1: [
      { type: 'ran', key: 'ls', hint: 'ls' },
      { type: 'read', file: 'network_snapshot.txt', hint: 'cat' },
      { hint: 'grep' },
    ],
    stage2: { group: 'recon', need: 2, toolsHint: 'observe', pinHint: 'pinObs' },
    stage3: { hint: 'analyze' },
    // Never reached (no tool advances to stage 4) but referenced defensively by
    // the shared guide/hint helpers; kept consistent so nothing reads undefined.
    stage4: { group: 'soc', need: 3, toolsHint: 'analyze', pinHint: 'pinFindings' },
    stage5: { required: [], actHint: 'analyze', reportHint: 'reportHint' },
  },
  hints: {
    ls: { id: 'ls', tiers: [
      'Every investigation starts with orientation — get your bearings before you touch anything. You are looking at telemetry exported from the flagged workstation.',
      'A triage folder holds files, and you cannot reason about what you cannot see. Your first job is to find out which files are here.',
      'In Linux, one short two-letter command lists the files in the current folder.',
      'Type `ls` and press Enter to list the files.',
    ] },
    cat: { id: 'cat', tiers: [
      'A good analyst reads the raw evidence first-hand. One file is the live connection snapshot — that is where odd traffic shows itself.',
      'You cannot tell who the host is really talking to without seeing every address it has open. Read the snapshot and look for one that repeats.',
      "Use the command that prints a file's contents to the screen, followed by the snapshot file's name.",
      'Type `cat network_snapshot.txt` to read the connection snapshot.',
    ] },
    grep: { id: 'grep', tiers: [
      'You have a suspect address now. A log can bury a pattern in noise, but the ports an address touched cannot lie — that is what to look at next.',
      'Separate the suspect from the noise: pull every line about that one address out of the access log so you can see what it reached for.',
      'There is a Linux tool that prints only the lines of a file matching a pattern. Use it on the access log with the suspect address.',
      'Type `grep 203.0.113.77 access.log` to surface its activity.',
    ] },
    observe: { id: 'observe', tiers: [
      'You have read the evidence — now make it count. Findings only become a case once they are written down.',
      'Two things stood out: one address keeps coming back, and it touched several ports. Commit both.',
      'Indicators are appearing on the EVIDENCE board to the right — pin the ones you observed.',
      'Type `pin all` to pin every indicator you have surfaced.',
    ] },
    pinObs: { id: 'pinObs', tiers: [
      'Investigating surfaces evidence, but an analyst builds a case from committed indicators, not loose observations.',
      'Pin what you observed so it is on the record before you dig deeper.',
      'Pin both indicators on the evidence board — click a card, or use the pin command.',
      'Type `pin all` to pin every indicator you have surfaced.',
    ] },
    analyze: { id: 'analyze', tiers: [
      'Your job now shifts from observing to confirming. Prove three things about that outside address.',
      'Establish who owns the source, which ports it reached versus what the host runs, and whether it is even an approved peer.',
      'The ANALYST TOOLS group just unlocked — work through them one at a time, then file your orientation report.',
      'Type `whois 203.0.113.77`, then `ports 203.0.113.77` and `compare baseline`; finally `submit orientation report`.',
    ] },
    pinFindings: { id: 'pinFindings', tiers: [
      'Record the confirmations you just uncovered so your determination is backed by evidence.',
      'Pin the findings from your analyst tools on the evidence board.',
      'Pin your findings, then file the orientation report.',
      'Type `pin all`, then `submit orientation report`.',
    ] },
    reportHint: { id: 'reportHint', tiers: [
      'You have investigated who the source is, what it touched, and whether it is expected. Time to decide.',
      'File your orientation report and pick the determination your evidence supports.',
      'Submit the orientation report to finish.',
      'Type `submit orientation report`.',
    ] },
  },
  // Orientation never enters containment; kept as empty/no-op so shared helpers
  // (labContain, scorecard action counts) have valid shapes to read.
  contain: {},
  containRequired: [],
  reveal: {
    campaign: [
      { t: '' },
      { t: '── PICTURE FORMING ───────────────────────────────', c: 'head' },
      { t: 'You committed your observations. A small network map is opening above the', c: 'dim' },
      { t: 'terminal — it shows WS-4471 and the unknown source, and it will grow as you', c: 'dim' },
      { t: 'investigate. Confirm the source: run `whois`, `ports`, then `compare baseline`,', c: 'dim' },
      { t: 'and file your orientation report when you are ready.', c: 'dim' },
    ],
    containment: [],
  },
  reportDone: [{ t: '[+] Orientation report filed. Nice work — that is the core loop of network triage.', c: 'ok' }],
  // MULTIPLE-CHOICE orientation report (engine branch keyed off `report`). The
  // analyst tools must have been run first (requireRan); the engine renders the
  // choices as clickable buttons in the terminal.
  report: {
    head: 'ORIENTATION REPORT — your determination',
    question: 'Based on everything you investigated, what did you determine about the traffic to WS-4471?',
    instruction: 'Pick the determination your evidence best supports:',
    requireRan: ['whois', 'ports', 'baseline'],
    requireMsg: 'File this last. First run your analyst tools — `whois 203.0.113.77`, `ports 203.0.113.77`, and `compare baseline` — so your determination is backed by evidence.',
    choices: [
      { text: 'An unknown, unregistered source contacted the workstation across multiple unrelated ports — and it is not on the known-good baseline. Suspicious; worth escalating.',
        correct: true,
        feedback: '[+] Exactly. Unknown source + multiple unrelated ports + off-baseline = a pattern worth escalating. That instinct is the heart of network triage.' },
      { text: 'It was just the known content-delivery server (the CDN) doing its normal job — nothing unusual.',
        feedback: 'Re-check your baseline comparison: the repeated source 203.0.113.77 is NOT the CDN, and it is absent from the known-good list.' },
      { text: 'The workstation was offline, so there was no real traffic to review.',
        feedback: 'The snapshot and access log show active connections from 203.0.113.77 — the host was online and being probed.' },
      { text: 'A trusted internal server briefly used one odd port — most likely a harmless glitch.',
        feedback: '203.0.113.77 is an external, unregistered address, not a trusted internal server — and it reached several unrelated ports, not one.' },
    ],
  },
  scorecard: {
    title: 'Orientation complete — network triage basics',
    subLead: 'You worked through your first network investigation — reading a connection snapshot, identifying an unknown source, and deciding it was worth escalating.',
    evHead: 'What you confirmed',
    learned: [
      'Network traffic is something you can read from a terminal — <code>ls</code>, <code>cat</code> and <code>grep</code> surface the evidence.',
      'IPs and ports are just addresses and "doors"; one outside address reaching many unrelated doors is the shape of probing.',
      '<code>whois</code> and a <em>baseline</em> turn "unfamiliar" into "unexpected"; a benign CDN is ruled out the same way.',
      'Triage ends in a determination — investigate first, then decide whether something is worth escalating.',
    ],
  },
  learning: {
    enabled: true,
    terms: ['whois', 'baseline', 'port-scan', 'reconnaissance', 'threat-intel'],
    debrief: {
      whatHappened: 'In this orientation you reviewed network traffic to workstation WS-4471 and found one unknown outside address (203.0.113.77) contacting it repeatedly across several unrelated ports.',
      howItWorked: 'A single external source reached ssh, http, https and mysql — services that would not all belong to one legitimate peer — and it was not on the workstation\u2019s known-good baseline. That combination is what makes traffic suspicious.',
      keyEvidence: [
        { label: 'One unknown source, repeated contact', why: 'a legitimate peer usually uses one service; repetition from an unknown address stands out.' },
        { label: 'Multiple unrelated ports touched', why: 'reaching many different services at once looks like probing, not normal use.' },
        { label: 'Not on the known-good baseline', why: 'the baseline is what lets you call a source unexpected rather than just unfamiliar.' },
      ],
      containment: 'In a real incident you would escalate this to a senior analyst and consider blocking the source — those response actions come later in your training. Orientation is about investigating and deciding.',
      concepts: ['whois', 'baseline', 'port-scan', 'reconnaissance'],
      takeaway: 'Suspicious traffic has a pattern: an unknown source, multiple unrelated ports, and a mismatch with the known-good baseline. Spotting that pattern is the core instinct of network triage.',
    },
  },
};
