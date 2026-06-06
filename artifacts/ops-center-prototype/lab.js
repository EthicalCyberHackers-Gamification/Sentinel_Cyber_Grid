/*
 * lab.js — Progressive Training Lab (data-driven, mission-keyed)
 *
 * An ISOLATED, terminal-first learning slice that lives ALONGSIDE the existing
 * data-driven `sc*` console (it does NOT replace it). Reachable via its own
 * deep-link: /ops-center/?lab=mission-001  (or ?lab=mission-002), and from the
 * Operations Center launch button for missions that have a lab dataset.
 *
 * Prototype rules: in-memory only. This module NEVER writes localStorage and
 * never touches the shipping app. It mirrors the `sc*` chrome (.sc-* classes)
 * for visual consistency but runs a wholly separate 5-stage state machine under
 * the `lab*` prefix.
 *
 * The engine is GENERIC: all mission content (files, indicators, tools, hints,
 * topology, containment, copy) lives in LAB_MISSIONS[missionId] and is selected
 * into LAB.def on open. Adding a mission = adding a dataset, not new code.
 *
 * The five stages (graphics ARE the lesson — every command produces a reaction
 * tied to a real concept):
 *   1. Linux file investigation  (ls / cat / less / grep over raw artifacts)
 *   2. Evidence analysis         (analysis tools -> indicators -> pin 3)
 *   3. Scope expansion           (a reactive topology fades in)
 *   4. SOC correlation           (correlation tools -> indicators -> pin 3)
 *   5. Containment + scorecard   (response actions -> report)
 */

/* ------------------------------------------------------------------ *
 * STATE (engine — mission content lives in LAB.def)
 * ------------------------------------------------------------------ */
const LAB = {
  missionId: 'mission-001',
  def: null,              // active mission dataset (set in openLab)
  stage: 1,
  ran: new Set(),         // command keys already executed
  read: new Set(),        // files cat/less'd
  discovered: [],         // indicator ids surfaced to the rail (ordered)
  pinned: new Set(),      // indicator ids the analyst has pinned
  topoNodes: new Set(),   // topology node ids currently visible
  topoState: {},          // nodeId -> 'blocked' | 'cleared' | 'secured'
  contained: new Set(),   // containment action keys performed
  done: false,
  hintStep: null,         // id of the sub-goal the last hint was about
  hintLevel: 0,           // 0-based tier of the next hint for hintStep (escalates)
  runToken: 0,            // invalidates pending timers across re-opens
};

/* ================================================================== *
 * MISSION DATASETS
 * ================================================================== */
const LAB_MISSIONS = {

  /* ============================================================ *
   * MISSION 001 — Credential Phishing
   * ============================================================ */
  'mission-001': {
    id: 'mission-001',
    opId: 'OPS-2026-001',
    severity: 'HIGH',
    headerTitle: 'Credential Phishing — Guided Investigation',
    context: 'Finance Operations · Sup: Sarah Reyes',
    consoleAriaLabel: 'Guided Phishing Investigation',
    mapCap: 'CAMPAIGN MAP — grows as you uncover evidence',
    nodeTags: { blocked: 'BLOCKED', cleared: 'QUARANTINED', secured: 'SECURED' },
    reportKey: 'report',
    seedNodes: ['inbox', 'phish'],
    groups: {
      dock: { 1: 'LINUX', 2: 'EMAIL ANALYSIS', 3: 'SOC CORRELATION', 5: 'CONTAINMENT' },
      kit:  { 1: 'LINUX BASICS', 2: 'EMAIL ANALYSIS', 3: 'SOC CORRELATION', 5: 'CONTAINMENT' },
    },
    prompts: {
      threshold: 3,
      fileLabel: 'intern@cybercorp: ~/mailbox',
      filePrompt: 'intern@cybercorp:~/mailbox$',
      filePwd: '/home/intern/mailbox',
      socLabel: 'analyst@soc — incident OPS-2026-001',
      socPrompt: 'analyst@soc:~$',
      socPwd: '/home/analyst',
    },
    intro: [
      { t: 'CyberCorp Security Training — Lab 001 · Credential Phishing', c: 'head' },
      { t: 'A user reported a suspicious email. As the SOC analyst on duty, it lands with you.' },
      { t: 'Your mission: decide whether this is a genuine phishing attack — and if it is,', c: 'dim' },
      { t: 'uncover how far it reached and shut it down. Work like an investigator, not a', c: 'dim' },
      { t: 'guesser: a message\'s wording can lie, but its technical fingerprints cannot.', c: 'dim' },
      { t: 'New here? Click any command on the left to learn what it does (it will not run', c: 'dim' },
      { t: 'until you type it), or open the SOC TOOL KIT for the full list of what you have.', c: 'dim' },
      { t: 'Not sure where to begin? Click HINT (or type `hint`) — the first nudge frames', c: 'dim' },
      { t: 'your approach, and each one after gets more specific, ending with the command.', c: 'dim' },
    ],
    objective: {
      1: 'Triage the report: open the flagged message and find out where it really wants the user to go.',
      2: 'Prove it is phishing — surface the tells hidden in the email, then pin the indicators that matter (3 to continue).',
      3: 'This was not a lone email. Begin SOC correlation and confirm the attacker\'s infrastructure.',
      4: 'Map the campaign\'s full scope, then pin your key SOC findings to unlock containment (3 to continue).',
      5: 'Shut it down: cut off the attacker, clean up the mail, secure the user — then file your incident report.',
    },
    files: [
      { name: 'README.txt', icon: '📘', desc: 'investigation notes' },
      { name: 'inbox_summary.txt', icon: '🗂', desc: 'recent mailbox items' },
      { name: 'suspicious_email.txt', icon: '✉', desc: 'user-reported message', suspect: true },
      { name: 'newsletter.txt', icon: '📰', desc: 'monthly security newsletter' },
      { name: 'welcome.txt', icon: '📄', desc: 'onboarding note' },
    ],
    fs: {
      'README.txt': [
        'Investigation notes — phishing triage',
        '',
        'A user reported a suspicious email. Your job: confirm whether it is',
        'phishing and find out why.',
        '',
        '  1. list the files in this mailbox',
        '  2. read the reported message',
        '  3. pull every link out of it and see where it really points',
        '',
        'A real link should match the sender. Watch for one that does not.',
        '',
        'Not sure how? Press HINT, or open the SOC TOOL KIT for the commands.',
      ],
      'inbox_summary.txt': [
        'Mailbox: r.okafor@cybercorp.com',
        '',
        '[REPORTED] ACTION REQUIRED — Re-verify your VPN access (24h)  -> suspicious_email.txt',
        '           Monthly Security Newsletter                        -> newsletter.txt',
        '           Welcome to CyberCorp                               -> welcome.txt',
      ],
      'suspicious_email.txt': [
        'From: IT Helpdesk <it-helpdesk@cybercorp.com>',
        'To: r.okafor@cybercorp.com',
        'Subject: ACTION REQUIRED — Re-verify your VPN access (24h)',
        'Date: Today 06:14 UTC',
        '',
        'Our records show your VPN credentials expire TODAY.',
        'To avoid losing remote access, you must confirm your username and',
        'password using the secure portal below within 24 hours:',
        '',
        'https://sso.cybercorp-support.net/verify',
        '',
        'Failure to act immediately will permanently suspend your account.',
        '— CyberCorp IT Helpdesk',
      ],
      'newsletter.txt': [
        'CyberCorp Monthly Security Newsletter',
        'From: security@cybercorp.com',
        '',
        'This month: how to spot phishing, and why we never ask for your',
        'password by email. Stay sharp out there.',
      ],
      'welcome.txt': [
        'Welcome to CyberCorp!',
        'From: people@cybercorp.com',
        '',
        'Glad to have you on the security team. Reach out to your buddy if',
        'you have any questions.',
      ],
    },
    fileInvestigation: {
      helpHead: 'Linux basics — investigate the mailbox folder:',
      filesHead: '📂 ~/mailbox &nbsp; <span>—</span> &nbsp; click a file to <code>cat</code> it',
      railEmpty: 'No evidence yet. Investigate the files, then pin the indicators you find.',
      onCat: {
        'suspicious_email.txt': {
          note: [{ t: '[!] Note the pressure to act "within 24 hours" — that urgency is a red flag.', c: 'warn' }],
          discover: 'urgency',
          next: [{ t: 'Next, pull every link out of this message and check where they really lead.', c: 'dim' }],
        },
      },
      grepAha: {
        file: 'suspicious_email.txt',
        requireUrl: true,
        found: [
          { t: '[+] The link claims to be CyberCorp SSO, but the domain is', c: 'ok' },
          { t: '    cybercorp-support.net — NOT cybercorp.com. The sender and the', c: 'ok' },
          { t: '    real destination do not match. That mismatch confirms phishing.', c: 'ok' },
        ],
        discover: 'link-mismatch',
        advanceTo: 2,
        unlock: [
          { t: '' },
          { t: '── ANALYST TOOLS UNLOCKED ────────────────────────', c: 'head' },
          { t: 'You found the core tell. Email-analysis tools are now available:', c: 'dim' },
          { t: 'headers · links · sender · domain. Run them, then PIN each indicator.', c: 'dim' },
        ],
      },
    },
    ind: {
      // Stage 1–2 phishing indicators
      'urgency':         { group: 'phish', kind: 'INDICATOR', label: 'Urgency / pressure language',
                           teach: 'Phishing manufactures urgency ("expires TODAY", "within 24 hours") to rush you past your judgment.',
                           intel: {
                             what: 'Pressure language ("expires TODAY", "within 24 hours") engineered to make the reader act before thinking.',
                             technique: 'Content analysis — flag time pressure, threats, and false authority cues in the message body.',
                             why: 'Urgency is a social-engineering lever. Spotting it early primes you to distrust the rest of the message.' } },
      'link-mismatch':   { group: 'phish', kind: 'LINK', label: 'Link points to a non-CyberCorp domain',
                           teach: 'The portal link goes to cybercorp-support.net — a lookalike, not cybercorp.com. The destination, not the wording, is what matters.',
                           intel: {
                             what: 'The "login" link actually points to cybercorp-support.net, not the real cybercorp.com.',
                             technique: 'Link extraction — pull the true href out of the raw message and compare its domain to the claimed brand.',
                             why: 'Attackers disguise destinations. The real URL, not the label, tells you where a victim would land.' } },
      'spoofed-headers': { group: 'phish', kind: 'HEADERS', label: 'SPF FAIL · DKIM none · relay mismatch',
                           teach: 'SPF/DKIM are how a domain authorizes its mail. FAIL/none means cybercorp.com did NOT send this — the From line is forged.',
                           intel: {
                             what: 'The authentication results read SPF FAIL, DKIM none, and a relay that does not belong to cybercorp.com.',
                             technique: 'Header analysis — read the Received, SPF, DKIM, and DMARC results in the raw source.',
                             why: 'These checks prove the From domain did not actually send the mail. The sender is forged.' } },
      'spoofed-sender':  { group: 'phish', kind: 'SENDER', label: 'Display name ≠ real return address',
                           teach: 'The friendly "IT Helpdesk" display name hides a Return-Path on a different domain. Always read the real address.',
                           intel: {
                             what: 'A friendly "IT Helpdesk" display name hiding a Return-Path on a completely different domain.',
                             technique: 'Inspect the real Return-Path / envelope sender — never trust the display name alone.',
                             why: 'Display names are free text. The underlying address is what reveals the impersonation.' } },
      'lookalike-domain':{ group: 'phish', kind: 'DOMAIN', label: 'Lookalike domain registered 2 days ago',
                           teach: 'cybercorp-support.net was registered 2 days ago. Brand-new lookalike domains are a classic phishing tell.',
                           intel: {
                             what: 'cybercorp-support.net — a domain mimicking CyberCorp, registered only 2 days ago.',
                             technique: 'WHOIS / registration-age check on the link domain.',
                             why: 'Newly registered lookalikes are a strong, hard-to-fake signal of a phishing operation.' } },
      // Stage 4 SOC indicators
      'domain-rep':      { group: 'soc', kind: 'INTEL', label: 'Domain flagged KNOWN-MALICIOUS',
                           teach: 'Threat-intel feeds already list this domain + host as phishing infrastructure — independent confirmation.',
                           intel: {
                             what: 'Threat-intel feeds already list this domain and host as known phishing infrastructure.',
                             technique: 'Reputation lookup — check the domain/IP against intel feeds and blocklists.',
                             why: 'Independent confirmation that you are not chasing a false positive.' } },
      'campaign-scope':  { group: 'soc', kind: 'SCOPE', label: '12 employees received the same lure',
                           teach: 'One report is the tip of a campaign. Checking recipients shows the real blast radius.',
                           intel: {
                             what: 'Twelve employees received the exact same lure, not just the one who reported it.',
                             technique: 'Recipient enumeration — query the mail gateway/SIEM for every message matching the subject, sender, or URL.',
                             why: 'Defines the real blast radius you must notify, reset, and protect.' } },
      'cred-endpoint':   { group: 'soc', kind: 'URL', label: 'Link POSTs creds to /collect.php',
                           teach: 'Tracing the URL shows the fake portal harvests credentials to attacker infrastructure.',
                           intel: {
                             what: 'The fake portal POSTs whatever credentials are entered to /collect.php on attacker infrastructure.',
                             technique: 'Safe URL analysis — inspect the form action in a sandbox; never enter real credentials.',
                             why: 'Confirms the attacker\u2019s objective is credential theft, not just a suspicious-looking page.' } },
      'account-comp':    { group: 'soc', kind: 'ACCOUNT', label: 'j.martin clicked, submitted creds, foreign login followed',
                           teach: 'One target was compromised: they entered credentials and a sign-in from the attacker IP followed minutes later.',
                           intel: {
                             what: 'j.martin clicked the lure, submitted credentials, and a sign-in from the attacker IP followed minutes later.',
                             technique: 'Sign-in log correlation — line up the victim against the attacker IP and timeline.',
                             why: 'Marks a real account takeover requiring immediate password reset and session revocation.' } },
      'alert-corr':      { group: 'soc', kind: 'SIEM', label: 'SIEM alerts line up with the timeline',
                           teach: 'Correlating SIEM alerts confirms the sequence: lure -> click -> credential POST -> anomalous login.',
                           intel: {
                             what: 'SIEM alerts across email, proxy, and identity line up with the attack timeline.',
                             technique: 'Alert correlation — stitch isolated alerts into one ordered sequence.',
                             why: 'Turns scattered alerts into one coherent incident narrative: lure → click → credential POST → anomalous login.' } },
    },
    topo: {
      nodes: {
        'inbox':   { x: 18, y: 54, glyph: '📥', label: 'Reported inbox', sub: 'r.okafor', type: '',
                     intel: {
                       what: 'The mailbox of the employee who reported the suspicious email — your starting point.',
                       technique: 'User-report triage — treat the report as a lead and verify it from the raw message, not the user\u2019s summary.',
                       why: 'Every investigation needs a confirmed entry point. From here you pivot outward to see how far the attack spread.' } },
        'phish':   { x: 50, y: 46, glyph: '🌐', label: 'cybercorp-support.net', sub: 'lookalike domain', type: 'threat',
                     intel: {
                       what: 'A lookalike domain registered to impersonate CyberCorp\u2019s real login page.',
                       technique: 'Domain analysis & WHOIS — compare the link\u2019s domain to the real one, then check its age and reputation.',
                       why: 'An email\u2019s wording can lie, but the destination domain cannot. This lookalike is the technical core of the attack.' } },
        'targets': { x: 17, y: 22, glyph: '👥', label: '12 targeted inboxes', sub: 'same lure', type: '',
                     intel: {
                       what: 'Eleven other employees who received the exact same lure.',
                       technique: 'Recipient enumeration — query the mail gateway/SIEM for all messages sharing the lure\u2019s subject, sender, or URL.',
                       why: 'One report is the tip of the iceberg. Mapping the full recipient list reveals the blast radius you must contain.' } },
        'attacker':{ x: 84, y: 22, glyph: '💀', label: '45.139.x.x', sub: 'bulletproof host', type: 'threat',
                     intel: {
                       what: 'The attacker-controlled server hosting the fake portal, on an abuse-resistant "bulletproof" host.',
                       technique: 'Infrastructure pivoting — resolve the domain to its IP/ASN and check the hosting reputation.',
                       why: 'Identifying the attacker infrastructure lets you block it network-wide and spot other campaigns using the same host.' } },
        'cred':    { x: 84, y: 70, glyph: '🪝', label: '/collect.php', sub: 'credential harvest', type: 'threat',
                     intel: {
                       what: 'The endpoint the fake login form POSTs stolen usernames and passwords to.',
                       technique: 'Safe URL analysis — inspect the form action in a sandbox; never submit real credentials.',
                       why: 'This is the attacker\u2019s goal. Confirming credential capture proves intent and flags which accounts may be compromised.' } },
        'victim':  { x: 50, y: 85, glyph: '⚠', label: 'j.martin', sub: 'clicked + submitted', type: 'victim',
                     intel: {
                       what: 'An employee who clicked the lure and submitted their credentials.',
                       technique: 'Timeline correlation — line up the click, the credential POST, and any follow-on logins from the attacker IP.',
                       why: 'A confirmed compromise raises severity from "attempted" to "successful" and triggers account containment.' } },
      },
      links: [
        { a: 'inbox',   b: 'phish',
          intel: {
            what: 'The reported email links to the lookalike domain.',
            technique: 'Link extraction — pull every URL out of the raw message and compare its domain to the sender\u2019s.',
            why: 'This connection turns a "suspicious-looking" email into confirmed phishing — it points at attacker infrastructure.' } },
        { a: 'targets', b: 'phish',
          intel: {
            what: 'All twelve recipients were sent the same link to the same lookalike domain.',
            technique: 'Clustering by indicator — group messages that share a URL or sender to size the campaign.',
            why: 'Shared infrastructure across many inboxes is what makes this a campaign, not an isolated email.' } },
        { a: 'phish',   b: 'attacker',
          intel: {
            what: 'The lookalike domain resolves to the attacker\u2019s bulletproof host.',
            technique: 'DNS resolution & ASN lookup — map the domain to its IP and hosting provider.',
            why: 'Tying the domain to its host lets you block the whole infrastructure, not just one URL.' } },
        { a: 'phish',   b: 'cred',
          intel: {
            what: 'The fake portal on the domain submits credentials to /collect.php.',
            technique: 'Form-action inspection — read where the login form sends its data.',
            why: 'This link proves the site\u2019s purpose is credential theft, confirming the attacker\u2019s objective.' } },
        { a: 'victim',  b: 'cred', danger: true,
          intel: {
            what: 'The compromised user\u2019s credentials were POSTed to the harvest endpoint.',
            technique: 'Correlate the victim\u2019s click with the credential POST and the subsequent attacker login.',
            why: 'lure → click → credential POST → account takeover: the completed kill-chain that demands immediate containment.' } },
      ],
    },
    tools: [
      { key: 'ls',     cmd: 'ls',                    unlock: 1, icon: '📁', name: 'List files',     hint: 'ls' },
      { key: 'cat',    cmd: 'cat suspicious_email.txt', unlock: 1, icon: '📄', name: 'Read email',  hint: 'cat <file>' },
      { key: 'grep',   cmd: 'grep http suspicious_email.txt', unlock: 1, icon: '🔍', name: 'Find links', hint: 'grep <pat> <file>' },

      { key: 'headers',cmd: 'headers',  unlock: 2, icon: '⚙', name: 'Headers',  hint: 'headers',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'spoofed-headers', output: [
          { t: 'Display-From: it-helpdesk@cybercorp.com' },
          { t: 'Return-Path: bounce@cybercorp-support.net', c: 'warn' },
          { t: 'Received:    mail.unknown-relay-83.ru (45.139.x.x)', c: 'warn' },
          { t: 'SPF: FAIL    DKIM: none', c: 'warn' },
          { t: '[+] cybercorp.com did NOT authorize this message — the sender is forged.', c: 'ok' },
        ] } },
      { key: 'links',  cmd: 'links',    unlock: 2, icon: '🔗', name: 'Links',    hint: 'links',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'link-mismatch', output: [
          { t: 'shown:    https://sso.cybercorp-support.net/verify' },
          { t: 'resolves: 45.139.x.x  ->  clone of the CyberCorp SSO page', c: 'warn' },
          { t: 'compare:  vpn.cybercorp.com (real, EV cert) — legitimate' },
          { t: '[+] The link impersonates SSO and points at external infrastructure.', c: 'ok' },
        ] } },
      { key: 'sender', cmd: 'sender',   unlock: 2, icon: '✉', name: 'Sender',   hint: 'sender',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'spoofed-sender', output: [
          { t: 'display name: "IT Helpdesk"' },
          { t: 'real address: bounce@cybercorp-support.net', c: 'warn' },
          { t: '[+] The friendly name hides a return address on the attacker domain.', c: 'ok' },
        ] } },
      { key: 'domain', cmd: 'domain',   unlock: 2, icon: '🌐', name: 'Domain',   hint: 'domain',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'lookalike-domain', output: [
          { t: 'domain:     cybercorp-support.net' },
          { t: 'registered: 2 days ago · privacy-shielded WHOIS', c: 'warn' },
          { t: 'legit ref:  cybercorp.com registered 2014', c: '' },
          { t: '[+] A brand-new lookalike domain built to impersonate CyberCorp.', c: 'ok' },
        ] } },

      { key: 'lookup', cmd: 'lookup domain',    unlock: 3, icon: '⚲', name: 'Lookup domain',  hint: 'lookup domain',
        run: { already: 'Already looked up — see the evidence board.', advanceTo: 4, addNode: 'attacker', discover: 'domain-rep', output: [
          { t: 'cybercorp-support.net  ->  45.139.x.x', c: '' },
          { t: '  AS8003 — flagged bulletproof host', c: 'warn' },
          { t: '  threat-intel verdict: KNOWN-MALICIOUS (phishing)', c: 'warn' },
        ] } },
      { key: 'recips', cmd: 'check recipients', unlock: 3, icon: '👥', name: 'Recipients',     hint: 'check recipients',
        run: { already: 'Already checked — see the evidence board.', advanceTo: 4, addNode: 'targets', discover: 'campaign-scope', output: [
          { t: 'searching mail logs for cybercorp-support.net …', c: 'dim' },
          { t: '12 employees received the same lure in the last 3 hours.', c: 'warn' },
          { t: '  1 reported · 3 opened · 1 submitted credentials', c: 'warn' },
        ] } },
      { key: 'trace',  cmd: 'trace url',        unlock: 3, icon: '➤', name: 'Trace URL',      hint: 'trace url',
        run: { already: 'Already traced — see the evidence board.', advanceTo: 4, addNode: 'cred', discover: 'cred-endpoint', output: [
          { t: 'GET  /verify   ->  302 redirect', c: '' },
          { t: 'POST /collect.php   (username, password)', c: 'warn' },
          { t: '[+] The fake portal harvests credentials to attacker infrastructure.', c: 'ok' },
        ] } },
      { key: 'login',  cmd: 'inspect login',    unlock: 3, icon: '🔑', name: 'Inspect login',  hint: 'inspect login',
        run: { already: 'Already inspected — see the evidence board.', advanceTo: 4, addNode: 'victim', discover: 'account-comp', output: [
          { t: '06:31 j.martin  submitted credentials on the fake portal', c: 'warn' },
          { t: '06:38 j.martin  SUCCESSFUL login from 45.139.x.x (attacker IP)', c: 'warn' },
          { t: '[+] j.martin is compromised — credentials captured and reused.', c: 'ok' },
        ] } },
      { key: 'alerts', cmd: 'review alerts',    unlock: 3, icon: '🚨', name: 'Review alerts',  hint: 'review alerts',
        run: { already: 'Already reviewed — see the evidence board.', advanceTo: 4, discover: 'alert-corr', output: [
          { t: 'SIEM correlation:', c: 'head' },
          { t: '  06:14 phishing lure delivered (x12)' },
          { t: '  06:30 credential POST to 45.139.x.x', c: 'warn' },
          { t: '  06:38 impossible-travel login — j.martin', c: 'warn' },
          { t: '[+] Alerts confirm the kill chain end to end.', c: 'ok' },
        ] } },

      { key: 'block',  cmd: 'block domain',     unlock: 5, icon: '⊘', name: 'Block domain',   hint: 'block domain' },
      { key: 'quar',   cmd: 'quarantine email', unlock: 5, icon: '🧹', name: 'Quarantine',     hint: 'quarantine email' },
      { key: 'reset',  cmd: 'reset account',    unlock: 5, icon: '♻', name: 'Reset account',  hint: 'reset account' },
      { key: 'host',   cmd: 'contain host',     unlock: 5, icon: '🛡', name: 'Contain host',   hint: 'contain host' },
      { key: 'report', cmd: 'submit report',    unlock: 5, icon: '📨', name: 'Submit report',  hint: 'submit report' },
    ],
    verb: {
      headers: 'headers', links: 'links', sender: 'sender', domain: 'domain',
      lookup: 'lookup', check: 'recips', trace: 'trace', inspect: 'login', review: 'alerts',
      block: 'block', quarantine: 'quar', reset: 'reset', contain: 'host', submit: 'report',
    },
    doc: {
      ls:     { purpose: 'Lists every file in the folder you are currently in.',
                learn: 'Before you can investigate anything, you have to know what is in front of you. `ls` ("list") prints the contents of the current folder so you can spot the reported message among the other files.' },
      cat:    { purpose: 'Prints the full contents of a file to the screen.',
                learn: '`cat` reads a file out to the terminal. Point it at the reported email to see exactly what the user received — who it claims to be from, the wording, and the link they were urged to click.' },
      grep:   { purpose: 'Searches inside a file and shows only the matching lines.',
                learn: 'A phishing email buries its real destination inside a link. `grep` pulls out just the lines containing a pattern (like `http`) so you can read the true web address without scrolling the whole message.' },
      headers:{ purpose: 'Reveals the hidden routing metadata of the email.',
                learn: 'Every email carries headers — a behind-the-scenes record of where it really travelled from. Attackers fake the friendly "From" name but struggle to fake this trail. Read it to find the true origin.' },
      links:  { purpose: 'Extracts and shows the real target of every link.',
                learn: 'The text you click and the address it actually points to can be completely different. This exposes the real destination so you can judge whether it is the genuine company or an attacker-controlled site.' },
      sender: { purpose: 'Shows the real sender address behind the display name.',
                learn: 'A message can say "IT Helpdesk" while coming from a stranger\'s mailbox. This isolates the actual email address so you can check whether it truly belongs to your organisation.' },
      domain: { purpose: 'Inspects the web domain the email and its links use.',
                learn: 'The domain is the part after the @ or inside a link (e.g. cybercorp.com). Look-alike domains like cybercorp-support.net are a classic phishing tell — this helps you catch one.' },
      lookup: { purpose: 'Checks the reputation and age of the suspect domain.',
                learn: 'A domain registered only days ago and flagged by threat feeds is a strong sign of attack. Looking it up confirms the infrastructure is malicious before you start hunting for victims.' },
      recips: { purpose: 'Lists everyone else who received the same email.',
                learn: 'One report rarely means one target. Checking recipients reveals the real scope of the campaign — how many colleagues were hit by the same lure.' },
      trace:  { purpose: 'Follows the link to see where it ultimately leads.',
                learn: 'Attackers chain redirects to hide the final page. Tracing the URL walks that trail and reveals the fake login site waiting at the end.' },
      login:  { purpose: 'Inspects sign-in activity tied to the attack.',
                learn: 'The whole point of phishing is stolen credentials being used. Inspecting logins shows whether anyone actually entered their password and let the attacker in.' },
      alerts: { purpose: 'Reviews related alerts the security tools raised.',
                learn: 'Your SIEM (the system watching everything) may have already flagged pieces of this attack. Reviewing alerts ties the campaign together and corroborates your findings.' },
      block:  { purpose: 'Blocks the malicious domain across the company.',
                learn: 'Cutting off the attacker\'s domain stops new victims from reaching the fake site. Removing the attacker\'s reach is the first move in containment.' },
      quar:   { purpose: 'Quarantines the phishing email from all inboxes.',
                learn: 'Pulling the message out of every mailbox removes the lure so no one else can click it — even people who have not opened it yet.' },
      reset:  { purpose: 'Forces a password reset on the compromised account.',
                learn: 'If credentials were stolen, resetting the password locks the attacker out and hands control of the account back to its owner.' },
      host:   { purpose: 'Isolates the affected machine from the network.',
                learn: 'Containing the host stops any malware or attacker session on that device from spreading while it is investigated and cleaned.' },
      report: { purpose: 'Writes up and closes the incident.',
                learn: 'Every investigation ends with a record: what happened, what you found, and what you did. The report lets the whole team learn and proves the threat was handled.' },
    },
    hintFlow: {
      stage1: [
        { type: 'ran', key: 'ls', hint: 'ls' },
        { type: 'read', file: 'suspicious_email.txt', hint: 'cat' },
        { hint: 'grep' },
      ],
      stage2: { group: 'phish', need: 3, toolsHint: 'emailTools', pinHint: 'pinPhish' },
      stage3: { hint: 'socStart' },
      stage4: { group: 'soc', need: 3, toolsHint: 'socTools', pinHint: 'pinSoc' },
      stage5: { required: ['block', 'quar', 'reset'], actHint: 'contain', reportHint: 'report' },
    },
    hints: {
      ls: { id: 'ls', tiers: [
        'Every investigation starts with orientation — get your bearings before you touch anything. You are standing in the user\'s mailbox folder.',
        'A mailbox folder holds files, and you cannot reason about what you cannot see. Your first job is to find out which files are actually here.',
        'In Linux, one short two-letter command lists the files in the current folder.',
        'Type `ls` and press Enter to list the files.',
      ] },
      cat: { id: 'cat', tiers: [
        'A good analyst reads the evidence first-hand and never trusts a summary. One file here is flagged REPORTED — that is your subject.',
        'You cannot tell whether the reported message is malicious without seeing exactly what it says and what it asks the reader to do.',
        "Use the command that prints a file's contents to the screen, followed by the reported file's name.",
        'Type `cat suspicious_email.txt` to read the reported email.',
      ] },
      grep: { id: 'grep', tiers: [
        'Phishing works by getting someone to click. The email\'s wording can lie, but where a link actually points cannot — that contrast is the heart of this case.',
        'Separate the claim from the link: pull the web link out of the email so you can examine its real destination instead of trusting the surrounding text.',
        'There is a Linux tool that prints only the lines of a file matching a pattern. Use it on the reported email to surface the link hiding in the text.',
        'Type `grep http suspicious_email.txt` to extract the link.',
      ] },
      emailTools: { id: 'emailTools', tiers: [
        'Your job now shifts from reading to proving. The proof is technical evidence the attacker tried to hide inside the email itself.',
        'Establish two things the attacker disguised: who really sent this, and where its link really goes.',
        'The dock now has an EMAIL ANALYSIS group. Each tool there exposes a different tell — the routing metadata, the real sender address, the domain, and the true link target. Work through them one at a time.',
        'Type `headers` first, then try `sender`, `domain`, and `links`.',
      ] },
      pinPhish: { id: 'pinPhish', tiers: [
        'Investigating surfaces evidence, but findings only count once they are recorded. An analyst builds a case from committed indicators, not loose observations.',
        'Indicators are appearing on the EVIDENCE board to the right — commit the ones that matter to build your case.',
        'Pin at least 3 indicators. You can click an evidence card, or use the pin command in the terminal.',
        'Type `pin all` to pin every indicator you have surfaced.',
      ] },
      socStart: { id: 'socStart', tiers: [
        'Zoom out. A single reported email is rarely the whole story — find out whether this is part of a larger campaign and where the attacker\'s infrastructure lives.',
        'Start with the attacker\'s infrastructure: confirm whether the malicious domain is known-bad before you map anything else.',
        'Use the SOC tools that just unlocked. Start by checking the malicious domain\'s reputation.',
        'Type `lookup domain` to begin the correlation.',
      ] },
      socTools: { id: 'socTools', tiers: [
        'Correlation is about scope: an incident you only half-understand is one you cannot fully contain. Widen the lens from one inbox to the whole campaign.',
        'Map who else was targeted, where the link really leads, and whether anyone actually fell for it.',
        'The SOC CORRELATION group in the dock widens the lens — who else got the lure, where the link really leads, whether anyone signed in for the attacker, and what the SIEM recorded. Run each one.',
        'Try `check recipients`, then `trace url`, `inspect login`, and `review alerts`.',
      ] },
      pinSoc: { id: 'pinSoc', tiers: [
        'Before you are allowed to act, you have to justify it. Containment without recorded findings is a guess; recorded findings make it an authorized response.',
        'Record the campaign findings you just uncovered so your response is backed by evidence.',
        'Pin at least 3 of your SOC findings on the evidence board.',
        'Type `pin all` to pin your SOC findings.',
      ] },
      contain: { id: 'contain', tiers: [
        'Now you act — but order matters. Containment follows a logic: cut the attacker off, clean up what they sent, then secure whoever was compromised.',
        'Work through the response in that order: attacker infrastructure first, then the malicious mail, then the affected user.',
        'The CONTAINMENT group in the dock holds your response actions — one cuts off the attacker\'s infrastructure, one pulls the lure from every inbox, and two secure the compromised user. Take them all.',
        'Type `block domain`, `quarantine email`, `reset account`, then `contain host`.',
      ] },
      report: { id: 'report', tiers: [
        'An incident is not closed until it is documented. The written record is how the next analyst learns from what you did.',
        'Close out the investigation with a written incident report.',
        'Submit your incident report to finish the investigation.',
        'Type `submit report` to close the incident.',
      ] },
    },
    contain: {
      block: { need: 'domain-rep', label: 'block domain',
               ok: '[+] cybercorp-support.net + 45.139.x.x blocked at the proxy and firewall.',
               nodes: { phish: 'blocked', attacker: 'blocked', cred: 'blocked' } },
      quar:  { need: 'campaign-scope', label: 'quarantine email',
               ok: '[+] The lure pulled from all 12 inboxes org-wide.',
               nodes: { inbox: 'cleared', targets: 'cleared' } },
      reset: { need: 'account-comp', label: 'reset account',
               ok: '[+] j.martin password reset and active sessions revoked.',
               nodes: { victim: 'secured' } },
      host:  { need: 'account-comp', label: 'contain host',
               ok: '[+] j.martin endpoint isolated from the network pending review.',
               nodes: { victim: 'secured' } },
    },
    containRequired: ['block', 'quar', 'reset'],
    reveal: {
      campaign: [
        { t: '' },
        { t: '── PATTERN DETECTED ──────────────────────────────', c: 'head' },
        { t: 'This is not a single email. The same lure domain is being used in a', c: 'warn' },
        { t: 'wider credential-phishing CAMPAIGN against CyberCorp.', c: 'warn' },
        { t: 'A campaign map is opening above the terminal — it will grow as you', c: 'dim' },
        { t: 'uncover more. Investigate the lure domain to expose the attacker\'s infrastructure.', c: 'dim' },
      ],
      containment: [
        { t: '' },
        { t: '── CONTAINMENT AUTHORIZED ────────────────────────', c: 'head' },
        { t: 'Enough evidence is pinned to act. Containment tools are now unlocked.', c: 'ok' },
        { t: 'Each action changes the campaign map. When it\'s contained, file your incident report to close out.', c: 'dim' },
      ],
    },
    reportDone: [{ t: '[+] Incident report submitted. Campaign contained.', c: 'ok' }],
    scorecard: {
      title: 'Campaign contained',
      subLead: 'You started at a Linux terminal with one reported file and worked all the way to org-wide containment — pinning ',
      subMid: ' indicators and taking ',
      subTail: ' response actions.',
      evHead: 'Phishing indicators you identified',
      socHead: 'SOC correlation you performed',
      learned: [
        'Emails are artifacts you can inspect from a terminal — <code>ls</code>, <code>cat</code> and <code>grep</code> surface the evidence.',
        'Phishing is proven by the <em>destination</em> and the <em>headers</em>, not the friendly display name.',
        'One report is usually a campaign — correlation reveals the real blast radius and who was compromised.',
        'Containment is a sequence: block the infra, pull the mail, secure the account, isolate the host, report.',
      ],
    },
  },

  /* ============================================================ *
   * MISSION 002 — Lateral Movement (pass-the-hash)
   * ============================================================ */
  'mission-002': {
    id: 'mission-002',
    opId: 'OPS-2026-002',
    severity: 'HIGH',
    headerTitle: 'Lateral Movement — Guided Investigation',
    context: 'APAC Segmentation · Lead: Marcus Chen',
    consoleAriaLabel: 'Guided Lateral Movement Investigation',
    mapCap: 'MOVEMENT MAP — grows as you trace the attacker',
    nodeTags: { blocked: 'ISOLATED', cleared: 'REMOVED', secured: 'SECURED' },
    reportKey: 'report',
    seedNodes: ['soc', 'source'],
    groups: {
      dock: { 1: 'LINUX', 2: 'LOGON ANALYSIS', 3: 'SOC CORRELATION', 5: 'CONTAINMENT' },
      kit:  { 1: 'LINUX BASICS', 2: 'LOGON ANALYSIS', 3: 'SOC CORRELATION', 5: 'CONTAINMENT' },
    },
    prompts: {
      threshold: 3,
      fileLabel: 'analyst@apac-seg-3: ~/triage',
      filePrompt: 'analyst@apac-seg-3:~/triage$',
      filePwd: '/home/analyst/triage',
      socLabel: 'analyst@soc — incident OPS-2026-002',
      socPrompt: 'analyst@soc:~$',
      socPwd: '/home/analyst',
    },
    intro: [
      { t: 'CyberCorp Security Training — Lab 002 · Lateral Movement', c: 'head' },
      { t: 'The SIEM flagged east-west traffic between APAC segments that should never talk. As the SOC analyst on duty, it lands with you.' },
      { t: 'Your mission: decide whether an attacker is moving host-to-host with stolen', c: 'dim' },
      { t: 'credentials — and if they are, trace how far they have spread and cut them off.', c: 'dim' },
      { t: 'Work like an investigator: a logon can look routine, but its type, protocol and', c: 'dim' },
      { t: 'source host reveal whether a real person or a reused hash is behind it.', c: 'dim' },
      { t: 'New here? Click any command on the left to learn what it does (it will not run', c: 'dim' },
      { t: 'until you type it), or open the SOC TOOL KIT for the full list of what you have.', c: 'dim' },
      { t: 'Not sure where to begin? Click HINT (or type `hint`) — the first nudge frames', c: 'dim' },
      { t: 'your approach, and each one after gets more specific, ending with the command.', c: 'dim' },
    ],
    objective: {
      1: 'Triage the source host: open the flagged authentication log and find out what really signed in.',
      2: 'Prove it is pass-the-hash — surface the tells hidden in the logon, then pin the indicators that matter (3 to continue).',
      3: 'This was not one bad logon. Begin SOC correlation and confirm the attacker\'s foothold.',
      4: 'Map the movement\'s full reach, then pin your key SOC findings to unlock containment (3 to continue).',
      5: 'Shut it down: isolate the host chain, rotate the abused account, kill the rogue service, escalate — then file your report.',
    },
    files: [
      { name: 'README.txt', icon: '📘', desc: 'investigation notes' },
      { name: 'host_summary.txt', icon: '🗂', desc: 'what this host is' },
      { name: 'auth_events.log', icon: '🔑', desc: 'flagged authentication events', suspect: true },
      { name: 'backup_job.log', icon: '🗓', desc: 'nightly backup job log' },
      { name: 'patch_report.txt', icon: '📄', desc: 'routine patch status' },
    ],
    fs: {
      'README.txt': [
        'Investigation notes — lateral movement triage',
        '',
        'The SIEM flagged unusual east-west logons. Your job: confirm whether an',
        'attacker is reusing credentials to move between hosts, and find out how.',
        '',
        '  1. list the files exported from the source host',
        '  2. read the flagged authentication log',
        '  3. pull the network logons out of it and see what really authenticated',
        '',
        'A real person logs in interactively. Watch for a service account arriving',
        'over the network with a reused hash.',
        '',
        'Not sure how? Press HINT, or open the SOC TOOL KIT for the commands.',
      ],
      'host_summary.txt': [
        'Host:    APAC-SEG-3  (10.44.2.19)',
        'Role:    workstation segment — general staff endpoints',
        'Normally talks to: file shares, proxy, AD (auth only)',
        'Should NOT initiate: SMB/RPC into the APAC-SEG-7 server segment',
        '',
        'This host was flagged as patient zero in a prior breach review.',
      ],
      'auth_events.log': [
        '02:11:04Z  APAC-SEG-7 (10.44.7.55)  account=svc_backup',
        '           LogonType=3 (Network)   AuthPkg=NTLM',
        '           Source=10.44.2.19 (APAC-SEG-3)   InteractiveParent=none',
        '02:13:22Z  APAC-SEG-7  Event=7045  service "WinHelpSvc" installed',
        '09:40:10Z  APAC-SEG-2  account=m.chen-adm  LogonType=10  AuthPkg=Kerberos  MFA=ok',
      ],
      'backup_job.log': [
        'CorpBackup-Nightly   host=APAC-FILE-02   account=svc_backup',
        'started 01:00Z · signed by Veeam · completed 01:48Z · registered in CMDB',
        '(this is the account\'s normal, expected home)',
      ],
      'patch_report.txt': [
        'Monthly patch compliance: APAC-SEG-3 — 100% current.',
        'No outstanding reboots. Nothing notable here.',
      ],
    },
    fileInvestigation: {
      helpHead: 'Linux basics — investigate the exported logs:',
      filesHead: '📂 ~/triage &nbsp; <span>—</span> &nbsp; click a file to <code>cat</code> it',
      railEmpty: 'No evidence yet. Investigate the logs, then pin the indicators you find.',
      onCat: {
        'auth_events.log': {
          note: [{ t: '[!] A service account (svc_backup) signing in over the NETWORK at 02:11 — with no one at a keyboard. That is unusual.', c: 'warn' }],
          discover: 'odd-logon',
          next: [{ t: 'Next, pull the network logons out of this log and see where they came from.', c: 'dim' }],
        },
      },
      grepAha: {
        file: 'auth_events.log',
        requireUrl: false,
        found: [
          { t: '[+] The svc_backup logon used NTLM with LogonType=3 and NO interactive', c: 'ok' },
          { t: '    parent — and it came FROM 10.44.2.19, a workstation that should never', c: 'ok' },
          { t: '    initiate logons into the server segment. That is pass-the-hash.', c: 'ok' },
        ],
        discover: 'pth-source',
        advanceTo: 2,
        unlock: [
          { t: '' },
          { t: '── ANALYST TOOLS UNLOCKED ────────────────────────', c: 'head' },
          { t: 'You found the core tell. Logon-analysis tools are now available:', c: 'dim' },
          { t: 'logon · hash · account · timeline. Run them, then PIN each indicator.', c: 'dim' },
        ],
      },
    },
    ind: {
      // Stage 1–2 pass-the-hash indicators
      'odd-logon':      { group: 'auth', kind: 'INDICATOR', label: 'Service account logged on over the network',
                          teach: 'svc_backup signed in with a Type 3 (network) logon and no one at a console — service accounts do not normally do this.',
                          intel: {
                            what: 'A service account (svc_backup) authenticating over the network at 02:11 with no interactive session behind it.',
                            technique: 'Logon triage — read the raw auth log and check who logged in, how, and whether a person was actually present.',
                            why: 'A service account arriving over the network off-hours is the first sign a stolen credential is being driven by an attacker.' } },
      'pth-source':     { group: 'auth', kind: 'SOURCE', label: 'NTLM logon from a workstation that should never initiate it',
                          teach: 'The logon came from 10.44.2.19 — a workstation segment that should never open logons into the server segment. Wrong-direction traffic is a movement tell.',
                          intel: {
                            what: 'The network logon originated from 10.44.2.19 (APAC-SEG-3), a workstation host already flagged as patient zero.',
                            technique: 'Source-host analysis — pull the source field out of the logon and compare it to the host\u2019s expected traffic baseline.',
                            why: 'A server-segment logon initiated by a workstation is the wrong direction for legitimate traffic — it points straight at the attacker\u2019s foothold.' } },
      'logon-type':     { group: 'auth', kind: 'LOGON', label: 'Type 3 (network) · NTLM · no interactive parent',
                          teach: 'A network logon authenticated with NTLM and no interactive parent session is exactly how a stolen hash is replayed.',
                          intel: {
                            what: 'LogonType 3 (network) authenticated with NTLM, with no matching interactive logon on the source.',
                            technique: 'Logon-type analysis — read the type, auth package and parent session from the event.',
                            why: 'Interactive users produce Type 2/10 logons; a lone network NTLM logon with no console session is the signature of pass-the-hash.' } },
      'hash-reuse':     { group: 'auth', kind: 'CREDENTIAL', label: 'Same NTLM hash reused across two hosts',
                          teach: 'The identical NTLM hash authenticated on two hosts minutes apart with no fresh login or Kerberos ticket — credential reuse, not a real sign-in.',
                          intel: {
                            what: 'One NTLM hash authenticating on both 10.44.2.19 and 10.44.7.55 within minutes, with no Kerberos TGT requested.',
                            technique: 'Credential-material correlation — match the hash across hosts and check whether a fresh logon ever occurred.',
                            why: 'Reusing the same hash across hosts without re-authenticating is the defining behaviour of pass-the-hash.' } },
      'account-misuse': { group: 'auth', kind: 'ACCOUNT', label: 'svc_backup used far outside its known job',
                          teach: 'svc_backup\'s only legitimate home is the nightly Veeam backup on APAC-FILE-02 — not interactive movement into the server segment.',
                          intel: {
                            what: 'The backup service account being used on APAC-SEG-7 over the network, away from its known, signed nightly job.',
                            technique: 'Account-baseline check — compare where the account is being used against its documented, expected behaviour.',
                            why: 'Attackers favour service accounts because they are powerful and rarely watched. Use outside its baseline marks the account as abused.' } },
      'offhours':       { group: 'auth', kind: 'TIMING', label: 'Off-hours burst, no change ticket',
                          teach: 'Logon at 02:11 then a remote service at 02:13 — a tight off-hours sequence with no change ticket reads as hands-on-keyboard.',
                          intel: {
                            what: 'A 02:00–02:30 UTC burst of activity with no corresponding change or maintenance ticket.',
                            technique: 'Timeline analysis — order the events and check them against approved change windows.',
                            why: 'A tight, unticketed off-hours sequence is consistent with an attacker working live, not scheduled automation.' } },
      // Stage 4 SOC correlation indicators
      'patient-zero':   { group: 'soc', kind: 'INTEL', label: 'Source host flagged PATIENT ZERO',
                          teach: 'Threat intel already lists 10.44.2.19 as patient zero from a prior breach — independent confirmation of the foothold.',
                          intel: {
                            what: 'Threat-intel records mark 10.44.2.19 as patient zero, flagged for credential theft in a prior breach.',
                            technique: 'Reputation / case lookup — check the source host against intel feeds and earlier incident records.',
                            why: 'Confirms the foothold is real and tells you the attacker already had a base from which to harvest credentials.' } },
      'east-west':      { group: 'soc', kind: 'NETFLOW', label: 'SMB/RPC chain across isolated segments',
                          teach: 'Netflow shows 10.44.2.19 → 10.44.7.55 → 10.44.7.61 over SMB/RPC — segments that should never talk are now chaining.',
                          intel: {
                            what: 'East-west SMB (445) and RPC (135) connections chaining 10.44.2.19 → 10.44.7.55 → 10.44.7.61.',
                            technique: 'Netflow analysis — trace connections between hosts and compare them to the segmentation baseline.',
                            why: 'Segments that are normally isolated talking to each other is the network signature of lateral movement.' } },
      'remote-svc':     { group: 'soc', kind: 'PROCESS', label: 'Unsigned WinHelpSvc created remotely',
                          teach: 'Event 7045: an unsigned "WinHelpSvc" was installed from a Temp folder by svc_backup over SMB — remote persistence.',
                          intel: {
                            what: 'A new unsigned service "WinHelpSvc" installed remotely (Event 7045) from C:\\Windows\\Temp by svc_backup over SMB.',
                            technique: 'Service-creation analysis — read 7045 events and check the binary\u2019s path, signature and creating account.',
                            why: 'Remotely-created unsigned services are how attackers run code and keep a foothold on each host they reach.' } },
      'blast-radius':   { group: 'soc', kind: 'SCOPE', label: '3 hosts implicated, heading for the domain core',
                          teach: 'Three hosts are implicated and the next hop is probing the domain core — defining the blast radius you must contain.',
                          intel: {
                            what: 'Three hosts (10.44.2.19, 10.44.7.55, 10.44.7.61) implicated, with the next hop probing the DC/KDC.',
                            technique: 'Spread analysis — follow the credential across the estate and project where the attacker is heading.',
                            why: 'Sizing the blast radius — and seeing the move toward the domain core — sets the urgency and scope of containment.' } },
      'alert-corr':     { group: 'soc', kind: 'SIEM', label: 'SIEM alerts line up with the movement timeline',
                          teach: 'SIEM stitches the alerts into one sequence: NTLM logon → remote service → east-west SMB to the next host.',
                          intel: {
                            what: 'SIEM alerts across identity, endpoint and network line up with the movement timeline.',
                            technique: 'Alert correlation — order isolated alerts into one coherent sequence.',
                            why: 'Turns scattered alerts into a single narrative: logon → remote service → east-west hop, confirming the chain end to end.' } },
    },
    topo: {
      nodes: {
        'soc':    { x: 18, y: 54, glyph: '🛰', label: 'SOC / SIEM', sub: 'detection', type: '',
                    intel: {
                      what: 'The SOC sensor that flagged the unusual east-west logons — your detection point.',
                      technique: 'Alert triage — start from the SIEM detection and verify it against the raw host evidence.',
                      why: 'Every investigation needs a confirmed entry point. From the detection you pivot outward to map how far the attacker moved.' } },
        'source': { x: 50, y: 46, glyph: '💀', label: '10.44.2.19', sub: 'patient zero', type: 'threat',
                    intel: {
                      what: 'APAC-SEG-3 — the workstation flagged as patient zero, the attacker\u2019s foothold for credential reuse.',
                      technique: 'Source-host analysis & intel lookup — confirm the host\u2019s reputation and prior-breach history.',
                      why: 'A logon can look routine, but a server-segment login initiated by this workstation cannot. It is the technical core of the movement.' } },
        'host7':  { x: 50, y: 85, glyph: '⚠', label: '10.44.7.55', sub: 'svc_backup logon', type: 'victim',
                    intel: {
                      what: 'APAC-SEG-7 — the first server reached, where the reused hash authenticated and a rogue service appeared.',
                      technique: 'Logon + service correlation — line up the network logon with the service-creation event on the host.',
                      why: 'This is the first confirmed hop. It raises severity from "attempted" to "successful movement" and triggers host containment.' } },
        'host61': { x: 84, y: 70, glyph: '⚠', label: '10.44.7.61', sub: 'next hop', type: 'victim',
                    intel: {
                      what: 'The next host the attacker reached, continuing the east-west chain across the server segment.',
                      technique: 'Netflow tracing — follow the SMB/RPC connections from one host to the next.',
                      why: 'Each additional hop widens the blast radius and shows the attacker is actively spreading, not sitting still.' } },
        'svc':    { x: 84, y: 22, glyph: '⚙', label: 'WinHelpSvc', sub: 'rogue service', type: 'threat',
                    intel: {
                      what: 'An unsigned service installed remotely from a Temp folder — the attacker\u2019s persistence on the compromised host.',
                      technique: 'Service-creation analysis — inspect the 7045 event, the binary path, signature and creating account.',
                      why: 'Removing this rogue service is part of fully evicting the attacker, not just cutting their network path.' } },
        'core':   { x: 17, y: 22, glyph: '🏛', label: 'Domain core', sub: 'next target', type: '',
                    intel: {
                      what: 'The DC/KDC at the heart of the domain — what the attacker is probing toward next.',
                      technique: 'Spread projection — follow the movement chain and identify the highest-value target in its path.',
                      why: 'Reaching the domain core would mean full control. Protecting it is why containment is urgent.' } },
      },
      links: [
        { a: 'soc',    b: 'source',
          intel: {
            what: 'The SOC detection that surfaced the suspicious logon from the source host.',
            technique: 'Alert-to-host correlation — tie the SIEM alert back to the raw evidence on the host.',
            why: 'This connection turns a SIEM alert into a confirmed lead pointing at the attacker\u2019s foothold.' } },
        { a: 'source', b: 'host7', danger: true,
          intel: {
            what: 'The pass-the-hash logon from patient zero into the first server.',
            technique: 'Logon analysis — match the NTLM network logon on host7 to its source host.',
            why: 'This is the first confirmed hop of the movement — a workstation reaching into the server segment with a reused hash.' } },
        { a: 'host7',  b: 'host61',
          intel: {
            what: 'The attacker continuing east-west from the first server to the next host.',
            technique: 'Netflow tracing — follow the SMB/RPC chain between hosts.',
            why: 'Each hop the attacker makes widens the blast radius you must contain.' } },
        { a: 'host7',  b: 'svc',
          intel: {
            what: 'The rogue WinHelpSvc service created remotely on the compromised host.',
            technique: 'Service-creation analysis — read the 7045 event and the unsigned binary it installed.',
            why: 'A remote service is how the attacker keeps a foothold on each host they reach.' } },
        { a: 'host61', b: 'core', danger: true,
          intel: {
            what: 'The attacker pivoting from the latest host toward the domain core.',
            technique: 'Spread projection — extend the observed chain to its highest-value next target.',
            why: 'logon → service → host-to-host hop → domain core: the path that demands immediate containment before the attacker reaches it.' } },
      ],
    },
    tools: [
      { key: 'ls',     cmd: 'ls',                  unlock: 1, icon: '📁', name: 'List files',  hint: 'ls' },
      { key: 'cat',    cmd: 'cat auth_events.log', unlock: 1, icon: '📄', name: 'Read log',    hint: 'cat <file>' },
      { key: 'grep',   cmd: 'grep NTLM auth_events.log', unlock: 1, icon: '🔍', name: 'Find logons', hint: 'grep <pat> <file>' },

      { key: 'logon',   cmd: 'logon',   unlock: 2, icon: '🔑', name: 'Logon type', hint: 'logon',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'logon-type', output: [
          { t: 'account:    svc_backup' },
          { t: 'logon type: 3 (Network) — not interactive', c: 'warn' },
          { t: 'auth pkg:   NTLM (no Kerberos ticket requested)', c: 'warn' },
          { t: 'parent:     none — no console session behind it', c: 'warn' },
          { t: '[+] A network NTLM logon with no interactive session is how a stolen hash is replayed.', c: 'ok' },
        ] } },
      { key: 'hash',    cmd: 'hash',    unlock: 2, icon: '🧬', name: 'Credential', hint: 'hash',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'hash-reuse', output: [
          { t: 'credential: NTLM hash (no plaintext, no Kerberos TGT)', c: '' },
          { t: 'seen on:    10.44.2.19 (APAC-SEG-3) AND 10.44.7.55 (APAC-SEG-7)', c: 'warn' },
          { t: 'pattern:    same hash, two hosts, minutes apart, no fresh login', c: 'warn' },
          { t: '[+] One credential reused across hosts without re-authenticating = pass-the-hash.', c: 'ok' },
        ] } },
      { key: 'account', cmd: 'account', unlock: 2, icon: '👤', name: 'Account',    hint: 'account',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'account-misuse', output: [
          { t: 'account: svc_backup (service account)' },
          { t: 'home:    APAC-FILE-02 — nightly Veeam backup (expected)' },
          { t: 'here:    APAC-SEG-7, over the network, from a workstation', c: 'warn' },
          { t: '[+] The account is being used far outside its known, signed job.', c: 'ok' },
        ] } },
      { key: 'timeline',cmd: 'timeline',unlock: 2, icon: '⏱', name: 'Timeline',   hint: 'timeline',
        run: { already: 'Already analyzed — see the evidence board.', discover: 'offhours', output: [
          { t: '02:11  network logon to APAC-SEG-7', c: 'warn' },
          { t: '02:13  remote service created (2 min later)', c: 'warn' },
          { t: 'window: 02:00–02:30 UTC · off-hours · no change ticket', c: 'warn' },
          { t: '[+] A tight off-hours sequence with no ticket reads as hands-on-keyboard, not automation.', c: 'ok' },
        ] } },

      { key: 'intel',   cmd: 'intel host',  unlock: 3, icon: '⚲', name: 'Threat intel',   hint: 'intel host',
        run: { already: 'Already looked up — see the evidence board.', advanceTo: 4, discover: 'patient-zero', output: [
          { t: '10.44.2.19 (APAC-SEG-3)', c: '' },
          { t: '  threat-intel verdict: PATIENT ZERO (prior breach)', c: 'warn' },
          { t: '  flagged for credential theft 6 days ago', c: 'warn' },
        ] } },
      { key: 'flows',   cmd: 'netflow',     unlock: 3, icon: '↔', name: 'East-west flows', hint: 'netflow',
        run: { already: 'Already traced — see the evidence board.', advanceTo: 4, addNode: ['host7', 'host61'], discover: 'east-west', output: [
          { t: 'tracing east-west flows from 10.44.2.19 …', c: 'dim' },
          { t: '10.44.2.19 → 10.44.7.55 → 10.44.7.61', c: 'warn' },
          { t: 'ports: 445 (SMB), 135 (RPC) · short off-hours bursts', c: 'warn' },
          { t: '[+] Segments that never normally talk are now chaining host-to-host.', c: 'ok' },
        ] } },
      { key: 'services',cmd: 'services',    unlock: 3, icon: '⚙', name: 'Services',        hint: 'services',
        run: { already: 'Already checked — see the evidence board.', advanceTo: 4, addNode: 'svc', discover: 'remote-svc', output: [
          { t: 'APAC-SEG-7  Event 7045 — new service installed', c: '' },
          { t: '  name: "WinHelpSvc"   path: C:\\Windows\\Temp\\wh.exe', c: 'warn' },
          { t: '  unsigned · created by svc_backup over SMB · 02:13', c: 'warn' },
          { t: '[+] A rogue remote service gives the attacker persistence on the host.', c: 'ok' },
        ] } },
      { key: 'spread',  cmd: 'spread',      unlock: 3, icon: '👥', name: 'Spread',          hint: 'spread',
        run: { already: 'Already checked — see the evidence board.', advanceTo: 4, addNode: 'core', discover: 'blast-radius', output: [
          { t: 'searching for the credential across the estate …', c: 'dim' },
          { t: '3 hosts implicated: 10.44.2.19, 10.44.7.55, 10.44.7.61', c: 'warn' },
          { t: 'next hop observed: probing the domain core (DC/KDC)', c: 'warn' },
        ] } },
      { key: 'siem',    cmd: 'review alerts', unlock: 3, icon: '🚨', name: 'Review alerts',  hint: 'review alerts',
        run: { already: 'Already reviewed — see the evidence board.', advanceTo: 4, discover: 'alert-corr', output: [
          { t: 'SIEM correlation:', c: 'head' },
          { t: '  02:11 NTLM network logon — svc_backup' },
          { t: '  02:13 remote service created (7045)', c: 'warn' },
          { t: '  02:18 east-west SMB to the next host', c: 'warn' },
          { t: '[+] Alerts confirm the movement chain end to end.', c: 'ok' },
        ] } },

      { key: 'isolate',  cmd: 'isolate hosts', unlock: 5, icon: '⊘', name: 'Isolate hosts',  hint: 'isolate hosts' },
      { key: 'rotate',   cmd: 'rotate account',unlock: 5, icon: '♻', name: 'Rotate account', hint: 'rotate account' },
      { key: 'killsvc',  cmd: 'kill service',  unlock: 5, icon: '🧹', name: 'Kill service',   hint: 'kill service' },
      { key: 'escalate', cmd: 'escalate ic',   unlock: 5, icon: '🛡', name: 'Escalate to IC', hint: 'escalate ic' },
      { key: 'report',   cmd: 'submit report', unlock: 5, icon: '📨', name: 'Submit report',  hint: 'submit report' },
    ],
    verb: {
      logon: 'logon', hash: 'hash', account: 'account', timeline: 'timeline',
      intel: 'intel', netflow: 'flows', services: 'services', spread: 'spread', review: 'siem',
      isolate: 'isolate', rotate: 'rotate', kill: 'killsvc', escalate: 'escalate', submit: 'report',
    },
    doc: {
      ls:      { purpose: 'Lists every file in the folder you are currently in.',
                 learn: 'Before you can investigate anything, you have to know what is in front of you. `ls` ("list") prints the contents of the export folder so you can spot the flagged log among the routine files.' },
      cat:     { purpose: 'Prints the full contents of a file to the screen.',
                 learn: '`cat` reads a file out to the terminal. Point it at the flagged authentication log to see exactly what signed in — the account, the logon type, and where it came from.' },
      grep:    { purpose: 'Searches inside a file and shows only the matching lines.',
                 learn: 'An auth log is noisy. `grep` pulls out just the lines matching a pattern (like `NTLM` or `Network`) so you can isolate the suspicious network logon without reading every line.' },
      logon:   { purpose: 'Breaks down the type and protocol of the suspicious logon.',
                 learn: 'Not all logons are equal. An interactive person produces one kind of logon; a replayed hash produces a network (Type 3) NTLM logon with no console session. This tells the two apart.' },
      hash:    { purpose: 'Examines the credential material behind the logon.',
                 learn: 'Pass-the-hash means reusing a stolen password hash without ever typing the password. This checks whether the same hash authenticated on more than one host with no fresh login — the core tell.' },
      account: { purpose: 'Checks the account against its expected behaviour.',
                 learn: 'Every account has a normal home and job. svc_backup belongs to a nightly backup, not to interactive movement. Comparing where it is being used against its baseline exposes the abuse.' },
      timeline:{ purpose: 'Orders the events and checks them against change windows.',
                 learn: 'Timing is evidence. A logon immediately followed by a remote service, off-hours, with no change ticket, reads as a live attacker rather than scheduled automation.' },
      intel:   { purpose: 'Looks up the source host against threat intel.',
                 learn: 'A host already flagged in a prior breach is a strong sign of where the attacker started. Looking it up confirms the foothold before you map how far they moved.' },
      flows:   { purpose: 'Traces east-west connections between hosts.',
                 learn: 'Segments that are normally isolated should not talk to each other. Netflow reveals the SMB/RPC chain hopping host-to-host — the network signature of lateral movement.' },
      services:{ purpose: 'Inspects services created on the affected hosts.',
                 learn: 'Attackers install remote services to run code and persist. A new unsigned service from a Temp folder, created over the network, is how they hold a foothold on each host.' },
      spread:  { purpose: 'Measures how many hosts are involved and where it is heading.',
                 learn: 'One hop is rarely the whole story. Checking the spread reveals the real blast radius and whether the attacker is heading toward high-value targets like the domain core.' },
      siem:    { purpose: 'Reviews the related alerts the security tools raised.',
                 learn: 'Your SIEM may already have flagged pieces of this. Reviewing alerts stitches the logon, the service, and the network hops into one ordered incident narrative.' },
      isolate: { purpose: 'Network-isolates the implicated host chain.',
                 learn: 'Cutting the affected hosts off the network severs the attacker\'s movement path so they cannot reach the next host. This is the first move in containment.' },
      rotate:  { purpose: 'Disables and rotates the abused service account.',
                 learn: 'A stolen hash stays useful until the credential changes. Disabling and rotating svc_backup invalidates the reused hash and locks the attacker out of the account.' },
      killsvc: { purpose: 'Stops and removes the rogue remote service.',
                 learn: 'Severing the network is not enough if the attacker left persistence behind. Removing the unsigned WinHelpSvc evicts their foothold on the compromised host.' },
      escalate:{ purpose: 'Escalates the incident to the Incident Commander.',
                 learn: 'Movement toward the domain core is a major incident. Escalating brings in the authority and coordination needed to protect the core and run the wider response.' },
      report:  { purpose: 'Writes up and closes the incident.',
                 learn: 'Every investigation ends with a record: what happened, what you found, and what you did. The report lets the whole team learn and proves the threat was handled.' },
    },
    hintFlow: {
      stage1: [
        { type: 'ran', key: 'ls', hint: 'ls' },
        { type: 'read', file: 'auth_events.log', hint: 'cat' },
        { hint: 'grep' },
      ],
      stage2: { group: 'auth', need: 3, toolsHint: 'authTools', pinHint: 'pinAuth' },
      stage3: { hint: 'socStart' },
      stage4: { group: 'soc', need: 3, toolsHint: 'socTools', pinHint: 'pinSoc' },
      stage5: { required: ['isolate', 'rotate', 'killsvc'], actHint: 'contain', reportHint: 'report' },
    },
    hints: {
      ls: { id: 'ls', tiers: [
        'Every investigation starts with orientation — get your bearings before you touch anything. You are in the forensics export from the source host.',
        'The folder holds the logs pulled off the flagged host, and you cannot reason about what you cannot see. Your first job is to find out which files are here.',
        'In Linux, one short two-letter command lists the files in the current folder.',
        'Type `ls` and press Enter to list the files.',
      ] },
      cat: { id: 'cat', tiers: [
        'A good analyst reads the evidence first-hand and never trusts a summary. One file here holds the flagged authentication events — that is your subject.',
        'You cannot tell whether the logon is malicious without seeing exactly what authenticated, how, and from where.',
        "Use the command that prints a file's contents to the screen, followed by the authentication log's name.",
        'Type `cat auth_events.log` to read the flagged log.',
      ] },
      grep: { id: 'grep', tiers: [
        'Lateral movement hides inside ordinary-looking logons. The account name can look routine, but the logon type, protocol and source cannot — that contrast is the heart of this case.',
        'Separate the noise from the signal: pull the network logons out of the log so you can examine how they authenticated instead of reading every line.',
        'There is a Linux tool that prints only the lines of a file matching a pattern. Use it on the auth log to surface the NTLM network logon.',
        'Type `grep NTLM auth_events.log` to isolate the suspicious logon.',
      ] },
      authTools: { id: 'authTools', tiers: [
        'Your job now shifts from reading to proving. The proof is in the technical details of how that credential was used.',
        'Establish what the attacker disguised: how the account logged in, whether the credential was reused, and whether the activity fits the account\'s normal job.',
        'The dock now has a LOGON ANALYSIS group. Each tool exposes a different tell — the logon type, the reused hash, the account\'s baseline, and the timing. Work through them one at a time.',
        'Type `logon` first, then try `hash`, `account`, and `timeline`.',
      ] },
      pinAuth: { id: 'pinAuth', tiers: [
        'Investigating surfaces evidence, but findings only count once they are recorded. An analyst builds a case from committed indicators, not loose observations.',
        'Indicators are appearing on the EVIDENCE board to the right — commit the ones that matter to build your case.',
        'Pin at least 3 indicators. You can click an evidence card, or use the pin command in the terminal.',
        'Type `pin all` to pin every indicator you have surfaced.',
      ] },
      socStart: { id: 'socStart', tiers: [
        'Zoom out. A single bad logon is rarely the whole story — find out where the attacker started and how far the movement reached.',
        'Start with the foothold: confirm whether the source host is already known-bad before you map anything else.',
        'Use the SOC tools that just unlocked. Start by looking up the source host against threat intel.',
        'Type `intel host` to begin the correlation.',
      ] },
      socTools: { id: 'socTools', tiers: [
        'Correlation is about scope: an incident you only half-understand is one you cannot fully contain. Widen the lens from one logon to the whole movement.',
        'Map where the traffic went, what the attacker left behind, how many hosts are involved, and what the SIEM recorded.',
        'The SOC CORRELATION group in the dock widens the lens — the east-west flows, the rogue services, the spread across hosts, and the SIEM alerts. Run each one.',
        'Try `netflow`, then `services`, `spread`, and `review alerts`.',
      ] },
      pinSoc: { id: 'pinSoc', tiers: [
        'Before you are allowed to act, you have to justify it. Containment without recorded findings is a guess; recorded findings make it an authorized response.',
        'Record the movement findings you just uncovered so your response is backed by evidence.',
        'Pin at least 3 of your SOC findings on the evidence board.',
        'Type `pin all` to pin your SOC findings.',
      ] },
      contain: { id: 'contain', tiers: [
        'Now you act — but order matters. Containment follows a logic: sever the movement path, invalidate the stolen credential, remove the persistence, then escalate.',
        'Work through the response in that order: isolate the hosts, rotate the abused account, kill the rogue service, then escalate.',
        'The CONTAINMENT group in the dock holds your response actions — one isolates the host chain, one rotates the abused account, one removes the rogue service, and one escalates to the Incident Commander. Take them all.',
        'Type `isolate hosts`, `rotate account`, `kill service`, then `escalate ic`.',
      ] },
      report: { id: 'report', tiers: [
        'An incident is not closed until it is documented. The written record is how the next analyst learns from what you did.',
        'Close out the investigation with a written incident report.',
        'Submit your incident report to finish the investigation.',
        'Type `submit report` to close the incident.',
      ] },
    },
    contain: {
      isolate:  { need: 'east-west', label: 'isolate hosts',
                  ok: '[+] APAC-SEG-3, 10.44.7.55 and 10.44.7.61 network-isolated. The movement chain is severed.',
                  nodes: { source: 'blocked', host7: 'blocked', host61: 'blocked' } },
      rotate:   { need: 'hash-reuse', label: 'rotate account',
                  ok: '[+] svc_backup disabled and its credentials rotated org-wide — the reused hash is dead.',
                  nodes: { host7: 'secured' } },
      killsvc:  { need: 'remote-svc', label: 'kill service',
                  ok: '[+] WinHelpSvc stopped and removed from APAC-SEG-7 — the persistence is gone.',
                  nodes: { svc: 'cleared' } },
      escalate: { need: 'blast-radius', label: 'escalate to IC',
                  ok: '[+] Incident Commander engaged — the domain core is watched for the next hop.',
                  nodes: { core: 'secured' } },
    },
    containRequired: ['isolate', 'rotate', 'killsvc'],
    reveal: {
      campaign: [
        { t: '' },
        { t: '── PATTERN DETECTED ──────────────────────────────', c: 'head' },
        { t: 'This is not one bad logon. The same stolen credential is being reused to', c: 'warn' },
        { t: 'move host-to-host across APAC in a LATERAL MOVEMENT campaign.', c: 'warn' },
        { t: 'A movement map is opening above the terminal — it will grow as you', c: 'dim' },
        { t: 'trace the attacker. Look up the source host to confirm the foothold.', c: 'dim' },
      ],
      containment: [
        { t: '' },
        { t: '── CONTAINMENT AUTHORIZED ────────────────────────', c: 'head' },
        { t: 'Enough evidence is pinned to act. Containment tools are now unlocked.', c: 'ok' },
        { t: 'Each action changes the movement map. When the chain is severed, file your incident report to close out.', c: 'dim' },
      ],
    },
    reportDone: [{ t: '[+] Incident report submitted. Lateral movement contained.', c: 'ok' }],
    scorecard: {
      title: 'Lateral movement contained',
      subLead: 'You started at a terminal on the source host with one flagged log and worked all the way to severing the movement chain — pinning ',
      subMid: ' indicators and taking ',
      subTail: ' response actions.',
      evHead: 'Pass-the-hash indicators you identified',
      socHead: 'SOC correlation you performed',
      learned: [
        'Logons are artifacts you can inspect from a terminal — <code>ls</code>, <code>cat</code> and <code>grep</code> surface the evidence.',
        'Pass-the-hash is proven by the <em>logon type, protocol and source host</em>, not by the account name alone.',
        'One bad logon is usually movement — correlation reveals the host chain and where the attacker is heading.',
        'Containment is a sequence: isolate the hosts, rotate the account, kill the rogue service, escalate, report.',
      ],
    },
  },

};

/* ------------------------------------------------------------------ *
 * DOM helpers
 * ------------------------------------------------------------------ */
const $lab = (id) => document.getElementById(id);

function labPrint(lines) {
  const out = $lab('labTermOut');
  if (!out) return;
  (lines || []).forEach((ln) => {
    const div = document.createElement('div');
    div.className = 'sc-term-line' + (ln.c ? ' ' + ln.c : '');
    // allow pre-escaped html only for our own highlight spans
    if (ln.html) div.innerHTML = ln.t; else div.textContent = ln.t;
    out.appendChild(div);
  });
  out.scrollTop = out.scrollHeight;
}

function labEcho(text) { labPrint([{ t: text, c: 'cmd' }]); }

/* ------------------------------------------------------------------ *
 * OPEN / RESET / RETURN
 * ------------------------------------------------------------------ */
function openLab(missionId) {
  // Select the active mission dataset (fall back to mission-001).
  const id = (missionId && LAB_MISSIONS[missionId]) ? missionId : 'mission-001';
  LAB.missionId = id;
  LAB.def = LAB_MISSIONS[id];
  const def = LAB.def;

  LAB.runToken++;
  labIntelHide();
  LAB.stage = 1;
  LAB.ran.clear();
  LAB.read.clear();
  LAB.discovered = [];
  LAB.pinned.clear();
  LAB.topoNodes.clear();
  LAB.topoState = {};
  LAB.contained.clear();
  LAB.done = false;
  LAB.hintStep = null;
  LAB.hintLevel = 0;

  // Mission-specific header chrome.
  const setText = (elId, txt) => { const el = $lab(elId); if (el) el.textContent = txt; };
  setText('labSeverity', def.severity);
  setText('labOpId', def.opId);
  setText('labTitle', def.headerTitle);
  setText('labContext', def.context);
  setText('labTopoCap', def.mapCap);
  const consoleEl = $lab('labConsole');
  if (consoleEl) consoleEl.setAttribute('aria-label', def.consoleAriaLabel);

  const out = $lab('labTermOut');
  if (out) out.innerHTML = '';
  const oc = $lab('labOutcome');
  if (oc) { oc.hidden = true; oc.innerHTML = ''; }

  labPrint(def.intro);

  labRenderStageSurface();
  labRenderDock();
  labRenderRail();
  labRefreshObjective();
  labUpdatePrompt();

  $lab('opsCenter').style.display = 'none';
  const soc = $lab('socConsole'); if (soc) soc.style.display = 'none';
  $lab('labConsole').style.display = 'flex';

  const input = $lab('labTermInput');
  if (input) { const tok = LAB.runToken; setTimeout(() => { if (tok === LAB.runToken) input.focus(); }, 60); }
}

function returnFromLab() {
  LAB.runToken++;
  labIntelHide();
  $lab('labConsole').style.display = 'none';
  $lab('opsCenter').style.display = 'flex';
}

/* ------------------------------------------------------------------ *
 * STAGE TRANSITIONS
 * ------------------------------------------------------------------ */
function labSetStage(n) {
  if (n <= LAB.stage) return;
  LAB.stage = n;
  labRenderDock();
  labRefreshObjective();
  labUpdatePrompt();
}

function labUpdatePrompt() {
  const def = LAB.def;
  const badge = $lab('labStageBadge');
  if (badge) badge.textContent = `STAGE ${LAB.stage} / 5`;
  const soc = LAB.stage >= def.prompts.threshold;
  const prompt = $lab('labPrompt');
  const label = $lab('labTermLabel');
  if (prompt) prompt.textContent = soc ? def.prompts.socPrompt : def.prompts.filePrompt;
  if (label) label.textContent = soc ? def.prompts.socLabel : def.prompts.fileLabel;
}

function labRefreshObjective() {
  const def = LAB.def;
  const txt = $lab('labObjectiveText');
  if (txt) txt.innerHTML = def.objective[LAB.stage] || '';
  const prog = $lab('labObjectiveProgress');
  if (!prog) return;
  if (LAB.stage === 2) {
    prog.textContent = `${labPinnedCount(def.hintFlow.stage2.group)} / ${def.hintFlow.stage2.need} pinned`;
  } else if (LAB.stage === 4) {
    prog.textContent = `${labPinnedCount(def.hintFlow.stage4.group)} / ${def.hintFlow.stage4.need} pinned`;
  } else if (LAB.stage === 5) {
    prog.textContent = `${LAB.contained.size} actions taken`;
  } else {
    prog.textContent = '';
  }
}

function labPinnedCount(group) {
  const ind = LAB.def.ind;
  let n = 0;
  LAB.pinned.forEach((id) => { if (ind[id] && ind[id].group === group) n++; });
  return n;
}

function labDiscoveredCount(group) {
  const ind = LAB.def.ind;
  return LAB.discovered.filter((id) => ind[id] && ind[id].group === group).length;
}

/* Check whether the current evidence unlocks the next stage. */
function labCheckAdvance() {
  const f = LAB.def.hintFlow;
  if (LAB.stage === 2 && labPinnedCount(f.stage2.group) >= f.stage2.need) {
    labRevealCampaign();
  } else if (LAB.stage === 4 && labPinnedCount(f.stage4.group) >= f.stage4.need) {
    labUnlockContainment();
  }
}

function labRevealCampaign() {
  const def = LAB.def;
  labSetStage(3);
  // Seed the topology with what we already know.
  def.seedNodes.forEach((id) => LAB.topoNodes.add(id));
  const topo = $lab('labTopo');
  const files = $lab('labFiles');
  if (files) files.hidden = true;
  if (topo) {
    topo.hidden = false;
    // next frame so the opacity transition runs
    requestAnimationFrame(() => requestAnimationFrame(() => topo.classList.add('is-live')));
  }
  labRenderTopo();
  labPrint(def.reveal.campaign);
}

function labUnlockContainment() {
  labSetStage(5);
  labPrint(LAB.def.reveal.containment);
}

/* ------------------------------------------------------------------ *
 * COMMAND ROUTER
 * ------------------------------------------------------------------ */
function labRun(raw) {
  const def = LAB.def;
  const text = (raw || '').trim();
  if (!text) return;
  const parts = text.split(/\s+/);
  const word = parts[0].toLowerCase();

  if (word === 'help')  { labEcho(text); labHelp(); return; }
  if (word === 'hint')  { labEcho(text); labHint(); return; }
  if (word === 'clear') { const o = $lab('labTermOut'); if (o) o.innerHTML = ''; return; }
  if (word === 'pwd')   { labEcho(text); labPrint([{ t: LAB.stage >= def.prompts.threshold ? def.prompts.socPwd : def.prompts.filePwd }]); return; }
  if (word === 'pin')   { labEcho(text); labPinCmd(parts.slice(1).join(' ')); return; }

  if (word === 'ls' || word === 'cat' || word === 'less' || word === 'grep') {
    labEcho(text); labFileCmd(word, parts.slice(1)); return;
  }

  const key = def.verb[word];
  const tool = key ? def.tools.find((t) => t.key === key) : null;
  if (!tool) {
    labEcho(text);
    labPrint([{ t: `command not found: ${word}. Type \`help\` for what you can run now.`, c: 'err' }]);
    return;
  }
  if (tool.unlock > LAB.stage) {
    labEcho(text);
    labPrint([{ t: `\`${tool.cmd}\` is not available yet — keep investigating to unlock it.`, c: 'err' }]);
    return;
  }
  labEcho(text);
  labDispatch(tool.key);
}

/* ------------------------------------------------------------------ *
 * HINTS — gradual, never the answer first. Each sub-goal carries four
 * tiers: (1) an orientation that frames the phase's goal/approach with no
 * specifics, (2) a conceptual nudge, (3) a directional push that names the
 * tool/approach but not the syntax, and (4) the exact command. Asking `hint`
 * again escalates one tier; making progress (the sub-goal changes) resets back
 * to tier 1. Only the LAST tier may contain a literal runnable command.
 * ------------------------------------------------------------------ */

/* Pick the hint sub-goal for the player's CURRENT position in the lab. */
function labCurrentHintGoal() {
  const def = LAB.def;
  const f = def.hintFlow;
  const H = def.hints;
  const s = LAB.stage;
  if (s === 1) {
    for (const step of f.stage1) {
      if (step.type === 'ran' && !LAB.ran.has(step.key)) return H[step.hint];
      if (step.type === 'read' && !LAB.read.has(step.file)) return H[step.hint];
      if (!step.type) return H[step.hint];
    }
    return H[f.stage1[f.stage1.length - 1].hint];
  }
  if (s === 2) {
    return labDiscoveredCount(f.stage2.group) < f.stage2.need ? H[f.stage2.toolsHint] : H[f.stage2.pinHint];
  }
  if (s === 3) return H[f.stage3.hint];
  if (s === 4) {
    return labDiscoveredCount(f.stage4.group) < f.stage4.need ? H[f.stage4.toolsHint] : H[f.stage4.pinHint];
  }
  // Stage 5 — report needs the required actions; the rest round out the grade.
  return f.stage5.required.some((k) => !LAB.contained.has(k)) ? H[f.stage5.actHint] : H[f.stage5.reportHint];
}

function labHint() {
  if (LAB.done) {
    labPrint([{ t: 'The lab is complete — nothing left to hint at. Replay it to practice again.', c: 'dim' }]);
    return;
  }
  const goal = labCurrentHintGoal();
  if (!goal) return;
  // Reset escalation whenever the player has moved on to a new sub-goal.
  if (goal.id !== LAB.hintStep) { LAB.hintStep = goal.id; LAB.hintLevel = 0; }
  const level = Math.min(LAB.hintLevel, goal.tiers.length - 1);
  const isAnswer = level >= goal.tiers.length - 1;
  labPrint([
    { t: `HINT ${level + 1} of ${goal.tiers.length}${isAnswer ? '  (this one is the answer)' : ''}`, c: 'head' },
    { t: '  ' + goal.tiers[level], c: isAnswer ? 'ok' : 'warn' },
    ...(isAnswer ? [] : [{ t: '  Still stuck? Type `hint` again for a stronger nudge.', c: 'dim' }]),
  ]);
  if (LAB.hintLevel < goal.tiers.length - 1) LAB.hintLevel++;
}

function labHelp() {
  const def = LAB.def;
  const lines = [{ t: '[ commands available right now ]', c: 'head' }];
  if (LAB.stage === 1) lines.push({ t: def.fileInvestigation.helpHead, c: 'dim' });
  def.tools.filter((t) => t.unlock <= LAB.stage).forEach((t) => {
    lines.push({ t: '  ' + t.hint.padEnd(26) + t.name });
  });
  if (LAB.stage >= 1) lines.push({ t: '  ' + 'pin <indicator|all>'.padEnd(26) + 'pin discovered evidence' });
  lines.push({ t: '  ' + 'hint'.padEnd(26) + 'gradual hint — ask again for more' });
  lines.push({ t: '  ' + 'clear'.padEnd(26) + 'clear the screen' });
  lines.push({ t: 'Tip: click a file above to read it, or click an evidence card to pin it.', c: 'dim' });
  labPrint(lines);
}

/* ------------------------------------------------------------------ *
 * STAGE 1 — file commands
 * ------------------------------------------------------------------ */
function labFileCmd(cmd, args) {
  const def = LAB.def;
  if (cmd === 'ls') {
    LAB.ran.add('ls');
    labPrint([{ t: def.files.map((f) => f.name).join('   ') }]);
    labRenderDock();
    return;
  }

  if (cmd === 'cat' || cmd === 'less') {
    const name = args[0];
    if (!name) { labPrint([{ t: `usage: ${cmd} <file>`, c: 'dim' }]); return; }
    const file = def.fs[name];
    if (!file) { labPrint([{ t: `${cmd}: ${name}: No such file or directory`, c: 'err' }]); return; }
    LAB.ran.add(cmd);
    LAB.read.add(name);
    labPrint(file.map((t) => ({ t })));
    const hook = def.fileInvestigation.onCat[name];
    if (hook) {
      if (hook.note) labPrint(hook.note);
      if (hook.discover) labDiscover(hook.discover);
      if (hook.next) labPrint(hook.next);
    }
    labRenderFiles();
    labRenderDock();
    return;
  }

  if (cmd === 'grep') {
    const pat = args[0];
    const name = args[1];
    if (!pat || !name) { labPrint([{ t: 'usage: grep <pattern> <file>', c: 'dim' }]); return; }
    const file = def.fs[name];
    if (!file) { labPrint([{ t: `grep: ${name}: No such file or directory`, c: 'err' }]); return; }
    LAB.ran.add('grep');
    const re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const hits = file.filter((line) => re.test(line));
    if (hits.length === 0) {
      labPrint([{ t: `(no lines in ${name} match "${pat}")`, c: 'dim' }]);
      return;
    }
    hits.forEach((line) => {
      const html = line.replace(re, (m) => `<span class="lab-hit">${m}</span>`);
      labPrint([{ t: html, html: true }]);
    });
    // The teachable "aha" for this mission's stage-1 grep.
    const aha = def.fileInvestigation.grepAha;
    const foundUrl = hits.some((l) => /https?:\/\//i.test(l));
    if (aha && name === aha.file && (!aha.requireUrl || foundUrl)) {
      labPrint(aha.found);
      if (aha.discover) labDiscover(aha.discover);
      if (LAB.stage === 1 && aha.advanceTo) {
        labSetStage(aha.advanceTo);
        if (aha.unlock) labPrint(aha.unlock);
      }
    }
    return;
  }
}

/* ------------------------------------------------------------------ *
 * STAGE 2/4 — analysis & correlation tools -> indicators
 * Each tool's behavior is described by its `run` block in the dataset.
 * Containment + report tools route to their own handlers.
 * ------------------------------------------------------------------ */
function labDispatch(key) {
  const def = LAB.def;
  if (key === 'ls' || key === 'cat' || key === 'grep') return; // handled elsewhere

  if (def.contain[key]) {
    labContain(key);
  } else if (key === def.reportKey) {
    labSubmitReport();
  } else {
    const tool = def.tools.find((t) => t.key === key);
    const run = tool && tool.run;
    if (run) {
      if (LAB.ran.has(key)) {
        labPrint([{ t: run.already || 'Already done — see the evidence board.', c: 'dim' }]);
        return;
      }
      LAB.ran.add(key);
      if (run.advanceTo && LAB.stage < run.advanceTo) labSetStage(run.advanceTo);
      if (run.output) labPrint(run.output);
      if (run.addNode) {
        const nodes = Array.isArray(run.addNode) ? run.addNode : [run.addNode];
        nodes.forEach((n) => labAddNode(n));
      }
      if (run.discover) labDiscover(run.discover);
    }
  }
  labRenderRail();
  labRenderDock();
  labRefreshObjective();
}

/* ------------------------------------------------------------------ *
 * EVIDENCE — discover + pin
 * ------------------------------------------------------------------ */
function labDiscover(id) {
  if (!LAB.def.ind[id]) return;
  if (!LAB.discovered.includes(id)) {
    LAB.discovered.push(id);
    labRenderRail([id]);
  }
}

function labPin(id) {
  if (!LAB.discovered.includes(id) || LAB.pinned.has(id)) return;
  LAB.pinned.add(id);
  labRenderRail();
  labRefreshObjective();
  labCheckAdvance();
}

function labPinCmd(arg) {
  const ind = LAB.def.ind;
  const unpinned = LAB.discovered.filter((id) => !LAB.pinned.has(id));
  if (unpinned.length === 0) { labPrint([{ t: 'Nothing new to pin — surface indicators first.', c: 'dim' }]); return; }
  if (!arg || arg.toLowerCase() === 'all' || arg.toLowerCase() === 'evidence') {
    unpinned.forEach((id) => LAB.pinned.add(id));
    labPrint([{ t: `[+] Pinned ${unpinned.length} indicator(s) to the evidence board.`, c: 'ok' }]);
    labRenderRail(); labRefreshObjective(); labCheckAdvance();
    return;
  }
  // pin by partial label/id match
  const match = unpinned.find((id) => id.includes(arg.toLowerCase()) || ind[id].label.toLowerCase().includes(arg.toLowerCase()));
  if (match) {
    LAB.pinned.add(match);
    labPrint([{ t: `[+] Pinned: ${ind[match].label}`, c: 'ok' }]);
    labRenderRail(); labRefreshObjective(); labCheckAdvance();
  } else {
    labPrint([{ t: `No discovered indicator matches "${arg}". Try \`pin all\`.`, c: 'dim' }]);
  }
}

/* ------------------------------------------------------------------ *
 * CONTAINMENT (Stage 5)
 * ------------------------------------------------------------------ */
function labContain(key) {
  const def = LAB.def;
  const c = def.contain[key];
  if (!c) return;
  if (LAB.contained.has(key)) { labPrint([{ t: `${c.label}: already done.`, c: 'dim' }]); return; }
  if (!LAB.pinned.has(c.need)) {
    labPrint([{ t: `Pin the supporting evidence first (need: ${def.ind[c.need].label}).`, c: 'err' }]);
    return;
  }
  LAB.contained.add(key);
  Object.entries(c.nodes).forEach(([nodeId, state]) => {
    if (LAB.topoNodes.has(nodeId)) LAB.topoState[nodeId] = state;
  });
  labPrint([{ t: c.ok, c: 'ok' }]);
  labRenderTopo();
}

function labSubmitReport() {
  const def = LAB.def;
  if (LAB.done) { labPrint([{ t: 'Report already submitted.', c: 'dim' }]); return; }
  const required = def.containRequired;
  const missing = required.filter((k) => !LAB.contained.has(k));
  if (missing.length) {
    labPrint([{ t: `Complete containment first — still to do: ${missing.map((k) => def.contain[k].label).join(', ')}.`, c: 'err' }]);
    return;
  }
  LAB.done = true;
  labPrint(def.reportDone);
  labShowScorecard();
}

/* ------------------------------------------------------------------ *
 * RENDER — dock
 * ------------------------------------------------------------------ */
function labRenderDock() {
  const def = LAB.def;
  const dock = $lab('labDock');
  if (!dock) return;
  const groupLabel = (u) => def.groups.dock[u] || '';
  const visible = def.tools.filter((t) => t.unlock <= LAB.stage);

  let html = '';
  let lastGroup = null;
  visible.forEach((t) => {
    if (t.unlock !== lastGroup) {
      html += `<div class="sc-dock-head">${groupLabel(t.unlock)}</div>`;
      lastGroup = t.unlock;
    }
    const done = labToolDone(t.key);
    const cls = ['sc-tool', done ? 'is-done' : ''].filter(Boolean).join(' ');
    html += `
      <button class="${cls}" type="button" data-lab-key="${t.key}" title="Click to learn what this command does">
        <span class="sc-tool-icon" aria-hidden="true">${t.icon}</span>
        <span class="sc-tool-body">
          <span class="sc-tool-name">${t.name}</span>
          <span class="sc-tool-cmd">${t.hint}</span>
        </span>
        <span class="sc-tool-info" aria-hidden="true">ⓘ</span>
      </button>`;
  });
  dock.innerHTML = html;

  // Teaching-first: a dock click EXPLAINS the command instead of running it.
  // The student still runs it by typing in the terminal (or via the popup's
  // "Load into terminal" button), so they learn the purpose before acting.
  dock.querySelectorAll('[data-lab-key]').forEach((btn) => {
    btn.addEventListener('click', () => labOpenExplain(btn.dataset.labKey));
  });
}

/* ------------------------------------------------------------------ *
 * TEACHING POPUPS — command explainer + SOC Tool Kit reference.
 * Both are presentation-only: they never run a command or mutate lab
 * state; the student must type (or "load") the command to actually run.
 * ------------------------------------------------------------------ */
function labCloseModals() {
  ['labExplain', 'labKit'].forEach((id) => {
    const el = $lab(id);
    if (el) { el.hidden = true; el.innerHTML = ''; }
  });
  const input = $lab('labTermInput');
  if (input) input.focus();
}

function labOpenExplain(key) {
  const def = LAB.def;
  const tool = def.tools.find((t) => t.key === key);
  const doc = def.doc[key];
  const host = $lab('labExplain');
  if (!tool || !doc || !host) return;
  const locked = tool.unlock > LAB.stage;
  host.innerHTML = `
    <div class="lab-modal-card" role="document">
      <div class="lab-modal-head">
        <span class="lab-modal-ico" aria-hidden="true">${tool.icon}</span>
        <div class="lab-modal-titles">
          <div class="lab-modal-title">${labEsc(tool.name)}</div>
          <div class="lab-modal-sub">${labEsc(tool.cmd)}</div>
        </div>
        <button class="lab-modal-close" type="button" data-lab-close aria-label="Close">×</button>
      </div>
      <div class="lab-modal-body">
        <div class="lab-modal-section-head">WHAT IT DOES</div>
        <div class="lab-modal-purpose">${labEsc(doc.purpose)}</div>
        <div class="lab-modal-learn">${labDocText(doc.learn)}</div>
        <div class="lab-modal-usage"><b>How to use it:</b>  ${labEsc(tool.cmd)}</div>
        ${locked ? '<div class="lab-kit-locked-note">This command is not unlocked yet — keep investigating and it will become available.</div>' : ''}
      </div>
      <div class="lab-modal-foot">
        ${locked ? '' : '<button class="lab-modal-btn lab-modal-btn--primary" type="button" data-lab-load="' + labEsc(tool.cmd) + '">Load into terminal</button>'}
        <button class="lab-modal-btn" type="button" data-lab-close>Got it</button>
      </div>
    </div>`;
  host.hidden = false;
  labBindModal(host);
}

function labOpenKit() {
  const def = LAB.def;
  const host = $lab('labKit');
  if (!host) return;
  const groupLabel = (u) => def.groups.kit[u] || '';
  const visible = def.tools.filter((t) => t.unlock <= LAB.stage);
  const locked = def.tools.filter((t) => t.unlock > LAB.stage);

  let body = '';
  let lastGroup = null;
  visible.forEach((t) => {
    if (t.unlock !== lastGroup) { body += `<div class="lab-kit-group">${groupLabel(t.unlock)}</div>`; lastGroup = t.unlock; }
    const doc = def.doc[t.key] || {};
    body += `
      <div class="lab-kit-item">
        <span class="lab-kit-ico" aria-hidden="true">${t.icon}</span>
        <div class="lab-kit-body">
          <div><span class="lab-kit-name">${labEsc(t.name)}</span><span class="lab-kit-cmd">${labEsc(t.cmd)}</span></div>
          <div class="lab-kit-desc">${labEsc(doc.purpose || '')}</div>
        </div>
      </div>`;
  });
  const lockedNote = locked.length
    ? `<div class="lab-kit-locked-note">+ ${locked.length} more command${locked.length === 1 ? '' : 's'} unlock as the investigation progresses.</div>`
    : '';

  host.innerHTML = `
    <div class="lab-modal-card lab-modal-card--kit" role="document">
      <div class="lab-modal-head">
        <span class="lab-modal-ico" aria-hidden="true">🧰</span>
        <div class="lab-modal-titles">
          <div class="lab-modal-title">SOC Tool Kit</div>
          <div class="lab-modal-sub">Every command available to you right now — click a tool on the left for the full story.</div>
        </div>
        <button class="lab-modal-close" type="button" data-lab-close aria-label="Close">×</button>
      </div>
      <div class="lab-modal-body">
        ${body}
        ${lockedNote}
        <div class="lab-kit-group">UTILITIES</div>
        <div class="lab-kit-item"><span class="lab-kit-ico" aria-hidden="true">📌</span><div class="lab-kit-body"><div><span class="lab-kit-name">Pin evidence</span><span class="lab-kit-cmd">pin &lt;indicator|all&gt;</span></div><div class="lab-kit-desc">Commit a discovered indicator to the evidence board (or click a card on the right).</div></div></div>
        <div class="lab-kit-item"><span class="lab-kit-ico" aria-hidden="true">💡</span><div class="lab-kit-body"><div><span class="lab-kit-name">Hint</span><span class="lab-kit-cmd">hint</span></div><div class="lab-kit-desc">A gradual nudge toward your next step — ask again for a stronger one.</div></div></div>
        <div class="lab-kit-item"><span class="lab-kit-ico" aria-hidden="true">🧽</span><div class="lab-kit-body"><div><span class="lab-kit-name">Clear</span><span class="lab-kit-cmd">clear</span></div><div class="lab-kit-desc">Wipe the terminal screen.</div></div></div>
      </div>
      <div class="lab-modal-foot">
        <button class="lab-modal-btn lab-modal-btn--primary" type="button" data-lab-close>Close</button>
      </div>
    </div>`;
  host.hidden = false;
  labBindModal(host);
}

// Wire close buttons and "Load into terminal" for a modal. These live on the
// freshly-rendered innerHTML (replaced each open), so they do not accumulate.
// The backdrop (host) click is bound ONCE in labInit — the host node persists
// across opens, so re-binding here would leak listeners.
function labBindModal(host) {
  host.querySelectorAll('[data-lab-close]').forEach((b) => b.addEventListener('click', labCloseModals));
  host.querySelectorAll('[data-lab-load]').forEach((b) => b.addEventListener('click', () => {
    const input = $lab('labTermInput');
    labCloseModals();
    if (input) { input.value = b.dataset.labLoad; input.focus(); }
  }));
}

// Escape HTML for safe interpolation of command strings into innerHTML.
function labEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Render the teaching text with `code` spans, escaping everything else.
function labDocText(s) {
  return labEsc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function labToolDone(key) {
  const def = LAB.def;
  if (key === def.reportKey) return LAB.done;
  if (def.contain[key]) return LAB.contained.has(key);
  return LAB.ran.has(key);
}

/* ------------------------------------------------------------------ *
 * RENDER — stage surface (files vs topology)
 * ------------------------------------------------------------------ */
function labRenderStageSurface() {
  const files = $lab('labFiles');
  const topo = $lab('labTopo');
  if (files) files.hidden = LAB.stage >= 3;
  if (topo) {
    topo.hidden = LAB.stage < 3;
    if (LAB.stage >= 3) topo.classList.add('is-live');
  }
  if (LAB.stage < 3) labRenderFiles(); else labRenderTopo();
}

function labRenderFiles() {
  const def = LAB.def;
  const host = $lab('labFiles');
  if (!host) return;
  const rows = def.files.map((f) => {
    const read = LAB.read.has(f.name);
    const cls = ['lab-file', f.suspect ? 'is-suspect' : '', read ? 'is-read' : ''].filter(Boolean).join(' ');
    return `
      <button class="${cls}" type="button" data-lab-file="${f.name}">
        <span class="lab-file-icon" aria-hidden="true">${f.icon}</span>
        <span class="lab-file-body">
          <span class="lab-file-name">${f.name}</span>
          <span class="lab-file-desc">${f.desc}</span>
        </span>
        ${f.suspect ? '<span class="lab-file-flag">REPORTED</span>' : ''}
      </button>`;
  }).join('');
  host.innerHTML = `
    <div class="lab-files-head">${def.fileInvestigation.filesHead}</div>
    <div class="lab-file-grid">${rows}</div>`;

  host.querySelectorAll('[data-lab-file]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.labFile;
      labRun('cat ' + name);
      const input = $lab('labTermInput'); if (input) input.focus();
    });
  });
}

/* ------------------------------------------------------------------ *
 * RENDER — reactive topology (SVG lines + HTML node chips)
 * ------------------------------------------------------------------ */
function labAddNode(id) {
  if (LAB.def.topo.nodes[id]) LAB.topoNodes.add(id);
  labRenderTopo();
}

/* ------------------------------------------------------------------ *
 * INTEL CARDS — presentation-only training overlay.
 * One shared, viewport-clamped card surface that opens on hover, keyboard
 * focus, or tap for every map node, connection, and evidence item. It is
 * STRICTLY read-only: it never pins, mutates node/mission state, advances
 * the lab, or writes storage. Handlers below must never call labPin / save.
 * ------------------------------------------------------------------ */
let labIntelEl = null;
let labIntelHideTimer = null;

function labIntelEnsure() {
  if (labIntelEl) return labIntelEl;
  const el = document.createElement('div');
  el.className = 'lab-intel';
  el.id = 'labIntel';
  el.setAttribute('role', 'tooltip');
  el.hidden = true;
  // Hovering the card itself keeps it open so the text stays selectable.
  el.addEventListener('mouseenter', () => {
    if (labIntelHideTimer) { clearTimeout(labIntelHideTimer); labIntelHideTimer = null; }
  });
  el.addEventListener('mouseleave', labIntelScheduleHide);
  document.body.appendChild(el);
  labIntelEl = el;
  return el;
}

function labIntelRow(k, v) {
  return v ? `<div class="lab-intel-row"><span class="lab-intel-k">${labEsc(k)}</span><span class="lab-intel-v">${labEsc(v)}</span></div>` : '';
}

function labIntelHtml(intel, title, kind) {
  return `
    <div class="lab-intel-head">
      ${kind ? `<span class="lab-intel-kind">${labEsc(kind)}</span>` : ''}
      <span class="lab-intel-title">${labEsc(title)}</span>
    </div>
    ${labIntelRow('What it is', intel.what)}
    ${labIntelRow('How an analyst surfaces it', intel.technique)}
    ${labIntelRow('Why it matters', intel.why)}`;
}

function labIntelShow(intel, title, kind, anchorEl) {
  if (!intel || !anchorEl) return;
  if (labIntelHideTimer) { clearTimeout(labIntelHideTimer); labIntelHideTimer = null; }
  const el = labIntelEnsure();
  el.innerHTML = labIntelHtml(intel, title, kind);
  el.hidden = false;
  // Measure now that it's laid out, then clamp fully inside the viewport so
  // the card can never clip off the small map edge.
  const a = anchorEl.getBoundingClientRect();
  const cw = el.offsetWidth, ch = el.offsetHeight;
  const m = 10;
  const vw = window.innerWidth, vh = window.innerHeight;
  let top = a.top - ch - m;            // prefer above the anchor
  if (top < m) top = a.bottom + m;     // otherwise below
  let left = a.left + a.width / 2 - cw / 2;
  left = Math.max(m, Math.min(left, vw - cw - m));
  top = Math.max(m, Math.min(top, vh - ch - m));
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function labIntelScheduleHide() {
  if (labIntelHideTimer) clearTimeout(labIntelHideTimer);
  labIntelHideTimer = setTimeout(labIntelHide, 140);
}

function labIntelHide() {
  if (labIntelHideTimer) { clearTimeout(labIntelHideTimer); labIntelHideTimer = null; }
  if (labIntelEl) labIntelEl.hidden = true;
}

// Wire one trigger element to the shared card. `click` enables tap/click
// toggling for non-button targets (touch has no hover). Never mutates state.
function labIntelBind(el, intel, title, kind, opts) {
  if (!intel || !el) return;
  el.addEventListener('mouseenter', () => labIntelShow(intel, title, kind, el));
  el.addEventListener('mouseleave', labIntelScheduleHide);
  el.addEventListener('focus', () => labIntelShow(intel, title, kind, el));
  el.addEventListener('blur', labIntelHide);
  if (opts && opts.click) {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (labIntelEl && !labIntelEl.hidden) labIntelHide();
      else labIntelShow(intel, title, kind, el);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        labIntelShow(intel, title, kind, el);
      }
    });
  }
}

function labRenderTopo() {
  const def = LAB.def;
  const svg = $lab('labTopoSvg');
  const host = $lab('labTopoNodes');
  if (!svg || !host) return;
  svg.innerHTML = '';
  host.innerHTML = '';
  const SVGNS = 'http://www.w3.org/2000/svg';

  // links first (only where both endpoints are present)
  def.topo.links.forEach((lk) => {
    if (!LAB.topoNodes.has(lk.a) || !LAB.topoNodes.has(lk.b)) return;
    const na = def.topo.nodes[lk.a], nb = def.topo.nodes[lk.b];
    const el = document.createElementNS(SVGNS, 'line');
    el.setAttribute('x1', na.x); el.setAttribute('y1', na.y);
    el.setAttribute('x2', nb.x); el.setAttribute('y2', nb.y);
    const blocked = LAB.topoState[lk.a] === 'blocked' || LAB.topoState[lk.b] === 'blocked'
      || LAB.topoState[lk.a] === 'cleared' || LAB.topoState[lk.b] === 'secured';
    let cls = 'lab-link';
    if (blocked) cls += ' is-blocked';
    else if (lk.danger) cls += ' is-danger';
    el.setAttribute('class', cls);  // SVG className is read-only — must use setAttribute
    svg.appendChild(el);

    if (!lk.intel) return;
    const title = `${na.label} → ${nb.label}`;
    // Focusable midpoint marker: the keyboard- and touch-reachable target for
    // the connection (a bare <line> is a thin mouse-only hit area).
    const mx = (na.x + nb.x) / 2, my = (na.y + nb.y) / 2;
    const mk = document.createElement('button');
    mk.type = 'button';
    mk.className = 'lab-link-mid' + (lk.danger ? ' is-danger' : '');
    mk.style.left = mx + '%';
    mk.style.top = my + '%';
    mk.setAttribute('aria-label', `Connection ${na.label} to ${nb.label} — analyst intel`);
    mk.textContent = 'i';
    host.appendChild(mk);
    labIntelBind(mk, lk.intel, title, 'CONNECTION', { click: true });

    // Wide transparent hit-line so hovering anywhere along the line works too;
    // it anchors the card to the visible marker.
    const hit = document.createElementNS(SVGNS, 'line');
    hit.setAttribute('x1', na.x); hit.setAttribute('y1', na.y);
    hit.setAttribute('x2', nb.x); hit.setAttribute('y2', nb.y);
    hit.setAttribute('class', 'lab-link-hit');
    hit.addEventListener('mouseenter', () => labIntelShow(lk.intel, title, 'CONNECTION', mk));
    hit.addEventListener('mouseleave', labIntelScheduleHide);
    svg.appendChild(hit);
  });

  // node chips
  LAB.topoNodes.forEach((id) => {
    const n = def.topo.nodes[id];
    if (!n) return;
    const state = LAB.topoState[id];
    const div = document.createElement('div');
    let cls = 'lab-node';
    if (n.type) cls += ' is-' + n.type;
    if (state) cls += ' is-' + state;
    div.className = cls;
    div.style.left = n.x + '%';
    div.style.top = n.y + '%';
    let tag = '';
    if (state && def.nodeTags[state]) tag = `<span class="lab-node-tag">${def.nodeTags[state]}</span>`;
    div.innerHTML = `
      <span class="lab-node-dot" aria-hidden="true">${n.glyph}</span>
      <span class="lab-node-label">${n.label}</span>
      <span class="lab-node-sub">${n.sub}</span>
      ${tag}`;
    if (n.intel) {
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label', `${n.label}${n.sub ? ', ' + n.sub : ''} — analyst intel`);
      labIntelBind(div, n.intel, n.label, n.sub ? n.sub.toUpperCase() : '', { click: true });
    }
    host.appendChild(div);
  });
}

/* ------------------------------------------------------------------ *
 * RENDER — evidence rail
 * ------------------------------------------------------------------ */
function labRenderRail(justNew) {
  const def = LAB.def;
  const list = $lab('labRailList');
  const count = $lab('labRailCount');
  if (!list) return;
  if (count) count.textContent = String(LAB.pinned.size);

  if (LAB.discovered.length === 0) {
    list.innerHTML = `<div class="sc-rail-empty">${def.fileInvestigation.railEmpty}</div>`;
    return;
  }
  const fresh = new Set(justNew || []);
  list.innerHTML = LAB.discovered.map((id) => {
    const ind = def.ind[id];
    const pinned = LAB.pinned.has(id);
    const cls = ['sc-ev', 'lab-ev', pinned ? 'is-pinned' : '', fresh.has(id) ? 'is-new' : ''].filter(Boolean).join(' ');
    const tag = pinned ? '📌 PINNED' : 'click to pin';
    // A dedicated info hotspot opens intel WITHOUT pinning — the only
    // touch-reliable way to read the card (tapping the card itself pins).
    const info = ind.intel
      ? `<button type="button" class="lab-ev-info" data-lab-info="${labEsc(id)}" aria-label="Analyst intel for ${labEsc(ind.label)}">i</button>`
      : '';
    return `
      <div class="lab-ev-wrap">
        <button type="button" class="${cls}" data-lab-pin="${id}">
          <span class="sc-ev-kind">${ind.kind}</span>
          <span class="sc-ev-label">${ind.label}</span>
          <span class="sc-ev-tag">${tag}</span>
          <span class="sc-ev-teach">${ind.teach}</span>
        </button>
        ${info}
      </div>`;
  }).join('');

  list.querySelectorAll('[data-lab-pin]').forEach((btn) => {
    const id = btn.dataset.labPin;
    btn.addEventListener('click', () => labPin(id));
    // Hover/focus opens the intel card; click still pins (existing behavior).
    const ind = def.ind[id];
    if (ind && ind.intel) labIntelBind(btn, ind.intel, ind.label, ind.kind);
  });
  list.querySelectorAll('[data-lab-info]').forEach((btn) => {
    const ind = def.ind[btn.dataset.labInfo];
    // click:true → presentation-only, stops propagation so it never pins.
    if (ind && ind.intel) labIntelBind(btn, ind.intel, ind.label, ind.kind, { click: true });
  });
}

/* ------------------------------------------------------------------ *
 * SCORECARD
 * ------------------------------------------------------------------ */
function labShowScorecard() {
  const def = LAB.def;
  const panel = $lab('labOutcome');
  if (!panel) return;

  const evGroup = def.hintFlow.stage2.group;
  const socGroup = def.hintFlow.stage4.group;
  const evIds = Object.keys(def.ind).filter((id) => def.ind[id].group === evGroup);
  const socIds = Object.keys(def.ind).filter((id) => def.ind[id].group === socGroup);
  const pinnedEv = evIds.filter((id) => LAB.pinned.has(id));
  const pinnedSoc = socIds.filter((id) => LAB.pinned.has(id));
  const totalPinned = pinnedEv.length + pinnedSoc.length;
  const totalInd = evIds.length + socIds.length;
  const actionKeys = Object.keys(def.contain);
  const actions = actionKeys.filter((k) => LAB.contained.has(k));
  const actionTotal = actionKeys.length;

  const grade = (totalPinned >= totalInd - 1 && actions.length === actionTotal) ? 'A — EXCELLENT'
    : (totalPinned >= Math.ceil(totalInd * 0.6) && actions.length >= 3) ? 'B — SOLID'
    : 'C — INCIDENT CONTAINED';

  const indRow = (id, on) => `
    <div class="lab-card-row ${on ? '' : 'is-miss'}">
      <span class="ic">${on ? '✓' : '○'}</span>
      <span>${def.ind[id].label}</span>
    </div>`;
  const actRow = (k) => `
    <div class="lab-card-row">
      <span class="ic">✓</span><span>${def.contain[k].label}</span>
    </div>`;

  panel.innerHTML = `
    <div class="lab-card">
      <div class="lab-card-grade">RESULT · ${grade}</div>
      <div class="lab-card-title">${labEsc(def.scorecard.title)}</div>
      <div class="lab-card-sub">
        ${labEsc(def.scorecard.subLead)}<strong>${totalPinned}/${totalInd}</strong>${labEsc(def.scorecard.subMid)}<strong>${actions.length}/${actionTotal}</strong>${labEsc(def.scorecard.subTail)}
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">${labEsc(def.scorecard.evHead)}</div>
        <div class="lab-card-list">${evIds.map((id) => indRow(id, LAB.pinned.has(id))).join('')}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">${labEsc(def.scorecard.socHead)}</div>
        <div class="lab-card-list">${socIds.map((id) => indRow(id, LAB.pinned.has(id))).join('')}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">Response actions taken</div>
        <div class="lab-card-list">${actions.length ? actions.map(actRow).join('') : '<div class="lab-card-row is-miss"><span class="ic">○</span><span>None</span></div>'}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">What you learned</div>
        <div class="lab-card-list">
          ${def.scorecard.learned.map((l) => `<div class="lab-card-row"><span class="ic">▸</span><span>${l}</span></div>`).join('')}
        </div>
      </div>

      <div class="lab-card-actions">
        <button class="lab-card-btn lab-card-btn--primary" type="button" data-lab-replay>↻ Replay the lab</button>
        <button class="lab-card-btn" type="button" data-lab-exit>Return to Operations Center</button>
      </div>
    </div>`;
  panel.hidden = false;

  panel.querySelector('[data-lab-replay]').addEventListener('click', () => openLab(LAB.missionId));
  panel.querySelector('[data-lab-exit]').addEventListener('click', returnFromLab);
}

/* ------------------------------------------------------------------ *
 * WIRING
 * ------------------------------------------------------------------ */
function labInit() {
  const form = $lab('labTermForm');
  const input = $lab('labTermInput');
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value;
      input.value = '';
      labRun(v);
    });
  }
  const back = $lab('labBackBtn');
  if (back) back.addEventListener('click', returnFromLab);

  const hintBtn = $lab('labHintBtn');
  if (hintBtn) hintBtn.addEventListener('click', () => {
    labHint();
    const inp = $lab('labTermInput');
    if (inp) inp.focus();
  });

  const kitBtn = $lab('labKitBtn');
  if (kitBtn) kitBtn.addEventListener('click', labOpenKit);

  // Backdrop click closes the popup. Bound ONCE here (the host nodes persist
  // across opens; only their innerHTML is replaced), so listeners never leak.
  ['labExplain', 'labKit'].forEach((id) => {
    const m = $lab(id);
    if (m) m.addEventListener('mousedown', (e) => { if (e.target === m) labCloseModals(); });
  });

  // Esc closes whichever teaching popup is open.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const open = ['labExplain', 'labKit'].some((id) => { const el = $lab(id); return el && !el.hidden; });
    if (open) labCloseModals();
  });

  // Intel card dismissal: Escape, scrolling, or a click outside any trigger.
  // All read-only — these only hide the presentation overlay.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') labIntelHide(); });
  window.addEventListener('scroll', labIntelHide, true);
  document.addEventListener('click', (e) => {
    if (!labIntelEl || labIntelEl.hidden) return;
    if (e.target.closest('.lab-node, .lab-link-mid, .lab-intel, [data-lab-pin], [data-lab-info]')) return;
    labIntelHide();
  });

  // Public entry points so the Operations Center (a separate ES module with no
  // shared scope) can open a lab on a mission launch without a full reload.
  // openMissionLab(id) is the generic entry; openMission001Lab is kept for
  // backward compatibility. LAB_MISSION_IDS lets the launcher know which
  // missions have a lab dataset.
  window.openMissionLab = openLab;
  window.openMission001Lab = () => openLab('mission-001');
  window.LAB_MISSION_IDS = Object.keys(LAB_MISSIONS);

  try {
    const params = new URLSearchParams(window.location.search);
    const labId = params.get('lab');
    if (labId && LAB_MISSIONS[labId]) openLab(labId);
  } catch (_) { /* ignore malformed query strings */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', labInit);
} else {
  labInit();
}
