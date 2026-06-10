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
 *   2. ANALYSIS — pin the two things you observed (unlocks the analyst tools)
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
    { t: 'Everything is explained as you reach it. Follow the GUIDED TUTORIAL on the', c: 'dim' },
    { t: 'left — it walks you through one step at a time: the exact command to run, why', c: 'dim' },
    { t: 'you are running it, and what each result means. Investigate first, decide last.', c: 'dim' },
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
  // SOC investigation workflow (orientation only). The guided tutorial renders
  // this as a read-only "where am I in the process" tracker above the step list,
  // so the beginner perceives SOC work as STAGES, not a list of commands. Each
  // tutorial step is tagged with the stage it belongs to (`stage`); stages with
  // no steps (response / debrief) light up once the report is filed. The `note`
  // is a one-line aside shown when that stage is active. Presentation-only.
  socStages: [
    { key: 'triage',      label: 'Triage',             note: 'Inspect and search the exported evidence with Linux-style commands.' },
    { key: 'analysis',    label: 'SOC Tool Analysis',  note: 'Validate the suspicion with SOC analyst tools — ownership, ports, baseline.' },
    { key: 'correlation', label: 'Correlation',        note: 'Connect the separate clues into one analyst conclusion.' },
    { key: 'escalation',  label: 'Escalation Decision', note: 'Decide whether the evidence is strong enough to escalate.' },
    { key: 'response',    label: 'Response',           note: 'See the consequence your escalation set in motion.' },
    { key: 'debrief',     label: 'Debrief',            note: 'Turn the investigation into retained learning.' },
  ],
  // Guided tutorial (orientation only — gated on report.choices). The engine
  // (labRenderTutorial) renders these as an ordered, checkable step list in the
  // left panel: the CURRENT step shows `say` plus a one-click Run button, and
  // each COMPLETED step shows its `result` ("what that told you"). Command
  // strings live in ONE place — `tools[].cmd`, resolved via `toolKey` — so this
  // block only carries plain-language wording. `key` drives per-step completion
  // detection in the engine; `stage` maps the step to a socStages entry. The
  // `correlate` step carries no command — it shows a summary + an acknowledge
  // button (see `correlation`). Presentation-only: nothing here runs or persists.
  tutorial: [
    { key: 'ls', toolKey: 'ls', stage: 'triage', label: 'See what you\u2019re working with',
      say: 'List the files pulled off the flagged workstation so you know what evidence you have to work through.',
      result: 'Four files of telemetry from WS-4471 — the connection snapshot, the access log, the known-good baseline, and your notes.' },
    { key: 'cat', toolKey: 'cat', stage: 'triage', label: 'Read the connection snapshot',
      say: 'Open the live connection snapshot to see every address WS-4471 is currently talking to.',
      result: 'One outside address — 203.0.113.77 — keeps coming back, across four different ports.' },
    { key: 'grep', toolKey: 'grep', stage: 'triage', label: 'Pull the suspect out of the log',
      say: 'Search the access log for that one address to see exactly which services it reached for.',
      result: 'It touched ssh, http, https and mysql — one host poking many doors is probing, not normal use.' },
    { key: 'pin', cmd: 'pin all', stage: 'triage', label: 'Save what you found',
      say: 'Commit both observations to your evidence board so your findings are on the record.',
      result: 'Both observations are pinned — the analyst tools unlock so you can confirm what you found.' },
    { key: 'whois', toolKey: 'whois', stage: 'analysis', label: 'Look up who owns the source',
      say: 'These next tools are SOC analyst tools, not basic Linux commands. Start by checking who the outside address is registered to.',
      result: 'No registered owner and no abuse contact — anonymous infrastructure, not an accountable peer.' },
    { key: 'ports', toolKey: 'ports', stage: 'analysis', label: 'See which ports it hit',
      say: 'Map the ports the source reached against the ones this host actually runs.',
      result: 'It reached for services WS-4471 doesn\u2019t even run — the shape of blind probing.' },
    { key: 'baseline', toolKey: 'baseline', stage: 'analysis', label: 'Compare to known-good peers',
      say: 'Check the source against the reviewed list of peers WS-4471 is approved to talk to.',
      result: 'It\u2019s not on the baseline — so it\u2019s unexpected, while the CDN and DNS beside it are ruled out.' },
    { key: 'correlate', stage: 'correlation', label: 'Connect the clues',
      say: 'No single clue is enough on its own. Read how they fit together, then move to your decision.',
      result: 'Repeated unknown source + unrelated ports + no registered owner + off-baseline — together, a pattern worth escalating.' },
    { key: 'report', toolKey: 'report', stage: 'escalation', label: 'Make your escalation decision',
      say: 'You have enough to decide. Open the escalation decision, then pick the action your evidence best supports.',
      result: 'Decision made — escalated as suspicious reconnaissance.' },
  ],
  // CORRELATION stage content (orientation only). Shown inside the current-step
  // card when the `correlate` step is active and echoed to the terminal on
  // acknowledge. Teaches that confidence is built by STACKING clues, with the
  // benign CDN/DNS as deliberate contrast. Presentation-only.
  correlation: {
    head: 'CORRELATION — connect the clues',
    intro: 'One clue is never enough. An analyst builds confidence by stacking them:',
    clues: [
      'One unknown outside address kept coming back.',
      'It reached several unrelated ports/services at once.',
      'WHOIS shows no registered owner — anonymous infrastructure.',
      'It is not on the host\u2019s known-good baseline.',
    ],
    contrast: 'For contrast: the CDN (198.51.100.20) and internal DNS (10.0.5.1) ARE on the baseline — known-good, and ruled out. Not all external traffic is bad.',
    summary: 'Multiple unrelated ports alone is not enough. Unknown ownership alone is not enough. Off-baseline alone is not enough. Together, they form a pattern worth escalating.',
    ack: 'I see the pattern \u2014 continue',
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
    // Four trust zones, left to right (most trusted to least). Drawn as labelled
    // background bands behind the nodes. Orientation-only (Assignment 000); the
    // six graded assignments carry no `zones` and use the standard topology.
    zones: [
      { id: 'internal-user', label: 'Internal User',           x: 1,  w: 23 },
      { id: 'internal-svc',  label: 'Internal Services',        x: 25, w: 23 },
      { id: 'external',      label: 'External Internet',        x: 52, w: 22 },
      { id: 'suspicious',    label: 'Suspicious / Unverified',  x: 76, w: 23 },
    ],
    // Each node carries a readable identity: a name, what kind of system it is,
    // and its address — so it reads as a device, not a dot.
    nodes: {
      'workstation': { x: 14, y: 50, zone: 'internal-user', glyph: '💻',
        label: 'WS-4471', sysType: 'Employee Workstation', ip: '10.0.5.12', baseTrust: 'internal',
        intel: {
          what: 'The employee workstation that was flagged — your starting point.',
          technique: 'Endpoint triage — review the connection and log data exported from this host.',
          why: 'Everything you analyse is traffic to or from this host.' } },
      'dns': { x: 36, y: 32, zone: 'internal-svc', glyph: '🧭',
        label: 'Internal DNS', sysType: 'Name resolution', ip: '10.0.5.1', baseTrust: 'service',
        intel: {
          what: 'The internal DNS server the workstation uses to look up addresses.',
          technique: 'Baseline comparison.',
          why: 'A normal, expected internal peer — a picture of healthy traffic.' } },
      'fileserver': { x: 36, y: 72, zone: 'internal-svc', glyph: '🗂️',
        label: 'File Server', sysType: 'Internal file share', ip: '10.0.5.30', baseTrust: 'service',
        intel: {
          what: 'An internal file server the workstation talks to over SMB.',
          technique: 'Baseline comparison.',
          why: 'Routine internal file traffic — the kind of contact you expect.' } },
      'cdn': { x: 62, y: 40, zone: 'external', glyph: '🌐',
        label: 'CDN', sysType: 'Content delivery', ip: '198.51.100.20', baseTrust: 'external',
        intel: {
          what: 'A public content-delivery network the workstation fetches assets from.',
          technique: 'Baseline comparison.',
          why: 'External but expected — on the known-good list, so ruled out as benign.' } },
      'source': { x: 86, y: 24, zone: 'suspicious', glyph: '❓',
        label: 'Unknown Host', sysType: 'Unverified external', ip: '203.0.113.77', baseTrust: 'unknown',
        intel: {
          what: 'An unregistered outside address contacting the workstation repeatedly.',
          technique: 'WHOIS, port and baseline checks on the repeated source address.',
          why: 'Unknown, unaccountable infrastructure reaching many ports is a classic red flag.',
          supports: 'An unknown, off-baseline source.' } },
    },
    // Traffic type drives the animated pulses: calm cyan for normal/expected
    // contact, irregular red for the suspicious source.
    links: [
      { a: 'workstation', b: 'dns', traffic: 'normal',
        intel: {
          what: 'Routine name-resolution traffic to the internal DNS.',
          technique: 'Connection snapshot review.',
          why: 'A baseline of what normal internal traffic looks like.' } },
      { a: 'workstation', b: 'fileserver', traffic: 'normal',
        intel: {
          what: 'Normal internal file-share traffic.',
          technique: 'Connection snapshot review.',
          why: 'Another example of expected, healthy internal contact.' } },
      { a: 'workstation', b: 'cdn', traffic: 'benign',
        intel: {
          what: 'Expected external traffic to a content-delivery network.',
          technique: 'Baseline comparison.',
          why: 'External but approved — benign outside traffic, shown for contrast.' } },
      { a: 'workstation', b: 'source', traffic: 'suspicious', danger: true,
        intel: {
          what: 'Repeated contact between the host and an unknown outside address.',
          technique: 'Connection snapshot review, then WHOIS / ports / baseline.',
          why: 'This is the relationship the whole investigation turns on.',
          supports: 'An unknown source contacting the host.' } },
    ],
    // Orientation-only map reactions: each event reveals systems and/or updates
    // trust as the investigation progresses. Consumed by labOrientReact (gated on
    // labIsOrientation). Presentation-only — no scoring, XP, or persistence.
    mapReact: {
      start:     { reveal: ['workstation'], trust: { workstation: 'internal' } },
      cat:       { reveal: ['dns', 'fileserver', 'cdn', 'source'],
                   trust: { dns: 'service', fileserver: 'service', cdn: 'external', source: 'unverified' } },
      grep:      { emphasizeSuspect: true },
      whois:     { trust: { source: 'offbaseline' } },
      ports:     { ports: true },
      baseline:  { trust: { dns: 'knowngood', fileserver: 'knowngood', cdn: 'knowngood', source: 'offbaseline' } },
      correlate: { trust: { source: 'suspicious' } },
      escalate:  { escalated: true, trust: { source: 'watched', workstation: 'monitored' } },
    },
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
      run: { already: 'Already mapped — see the evidence board.', discover: 'targeted-ports', output: [
        { t: 'ports reached by 203.0.113.77:  22, 80, 443, 3306' },
        { t: 'WS-4471 actually listens on:    22 (ssh), 445 (smb)' },
        { t: '[+] 80/443/3306 are services this host does not even run — blind probing.', c: 'warn' },
      ], fb: {
        means: 'The source reached for 80, 443 and 3306 — services WS-4471 does not run.',
        changes: 'Reaching for doors that do not exist is probing, not a real connection.',
        next: 'Is this address on the host\u2019s approved peer list, or is it unexpected?',
      } } },
    { key: 'baseline', cmd: 'compare baseline', unlock: 3, icon: '📊', name: 'Compare baseline', hint: 'compare baseline',
      run: { already: 'Already compared — see the evidence board.', discover: 'off-baseline', output: [
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
      { t: 'You committed your observations. The analyst tools are unlocking — the', c: 'dim' },
      { t: 'network map above will sharpen as you confirm the source. Run `whois`,', c: 'dim' },
      { t: '`ports`, then `compare baseline`, and file your orientation report when ready.', c: 'dim' },
    ],
    containment: [],
  },
  reportDone: [{ t: '[+] Escalation decision recorded. Nice work — that is the core loop of SOC triage: investigate, correlate, then decide.', c: 'ok' }],
  // MULTIPLE-CHOICE escalation decision (engine branch keyed off `report`). The
  // analyst tools must have been run first (requireRan); the engine renders the
  // choices as clickable buttons in the terminal. This is the ESCALATION DECISION
  // stage — the player chooses the action their evidence supports, including a
  // wrong over-reaction (block everything) so they learn proportionate response.
  report: {
    head: 'ANALYST ESCALATION DECISION',
    question: 'You have investigated and correlated the evidence. As the analyst on shift, what should happen next with the traffic to WS-4471?',
    instruction: 'Pick the action your evidence best supports:',
    requireRan: ['whois', 'ports', 'baseline'],
    requireMsg: 'Decide this last. First run your analyst tools — `whois 203.0.113.77`, `ports 203.0.113.77`, and `compare baseline` — so your decision is backed by evidence.',
    choices: [
      { text: 'Escalate it as suspicious reconnaissance — an unknown, unregistered source hit multiple unrelated ports and is not on the known-good baseline.',
        correct: true,
        feedback: '[+] Exactly. Unknown source + multiple unrelated ports + off-baseline = a pattern worth escalating. Escalate and monitor — that is the right analyst call.' },
      { text: 'Close it as normal CDN traffic — nothing unusual here.',
        feedback: 'Re-check your baseline comparison: the repeated source 203.0.113.77 is NOT the CDN, and it is absent from the known-good list.' },
      { text: 'Ignore it — no malware was found on the workstation.',
        feedback: 'Reconnaissance comes before malware. The probing pattern is exactly what you escalate so it is caught early — you do not wait for damage.' },
      { text: 'Block all external traffic to the network immediately.',
        feedback: 'That is an over-reaction. Blocking everything breaks real users and destroys evidence. A single suspicious source is escalated and monitored, not met by shutting down the whole network.' },
    ],
  },
  // RESPONSE / CONSEQUENCE stage (orientation only). Printed to the terminal by
  // the engine right after the CORRECT escalation decision, before the debrief
  // scorecard — so the player sees that escalating set real, proportionate things
  // in motion (and that production was NOT blocked). Presentation-only.
  consequence: [
    { t: '' },
    { t: 'RESPONSE / CONSEQUENCE — what your escalation set in motion', c: 'head' },
    { t: '[+] CyberCorp SOC queue updated — the case is now with a senior analyst.', c: 'ok' },
    { t: '[+] WS-4471 flagged for monitoring.', c: 'ok' },
    { t: '[+] 203.0.113.77 added to the source watchlist.', c: 'ok' },
    { t: '    No production systems were blocked — escalating and monitoring keeps users working while the case is reviewed.', c: 'dim' },
    { t: 'Early analysts escalate and watch — they do not block everything on sight.', c: 'dim' },
  ],
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
      whatNotDone: 'You did NOT block all traffic or pull the workstation offline. With a pattern this early, an analyst escalates and monitors first — over-blocking breaks real users and destroys the evidence you would need. Proportionate response is part of the job.',
      concepts: ['whois', 'baseline', 'port-scan', 'reconnaissance'],
      takeaway: 'Suspicious traffic has a pattern: an unknown source, multiple unrelated ports, and a mismatch with the known-good baseline. Spotting that pattern is the core instinct of network triage.',
    },
  },
};
