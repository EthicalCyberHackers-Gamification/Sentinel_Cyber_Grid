/*
 * lab.js — Progressive Training Lab for Mission 001 (Credential Phishing)
 *
 * An ISOLATED, terminal-first learning slice that lives ALONGSIDE the existing
 * data-driven `sc*` console (it does NOT replace it). Reachable only via its own
 * deep-link: /ops-center/?lab=mission-001
 *
 * Prototype rules: in-memory only. This module NEVER writes localStorage and
 * never touches the shipping app or the other five missions. It mirrors the
 * `sc*` chrome (.sc-* classes) for visual consistency but runs a wholly separate
 * 5-stage state machine under the `lab*` prefix.
 *
 * The five stages (graphics ARE the lesson — every command produces a reaction
 * tied to a real concept):
 *   1. Linux file investigation  (ls / cat / less / grep over a virtual mailbox)
 *   2. Email evidence            (headers / links / sender / domain -> indicators)
 *   3. Campaign expansion        (a reactive topology fades in)
 *   4. SOC correlation           (lookup / check / trace / inspect / review)
 *   5. Containment + scorecard   (block / quarantine / reset / contain / report)
 */

/* ------------------------------------------------------------------ *
 * STATE
 * ------------------------------------------------------------------ */
const LAB = {
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

/* ------------------------------------------------------------------ *
 * DATA — virtual filesystem (Stage 1)
 * ------------------------------------------------------------------ */
const LAB_FILES = [
  { name: 'README.txt', icon: '📘', desc: 'investigation notes' },
  { name: 'inbox_summary.txt', icon: '🗂', desc: 'recent mailbox items' },
  { name: 'suspicious_email.txt', icon: '✉', desc: 'user-reported message', suspect: true },
  { name: 'newsletter.txt', icon: '📰', desc: 'monthly security newsletter' },
  { name: 'welcome.txt', icon: '📄', desc: 'onboarding note' },
];

const LAB_FS = {
  'README.txt': [
    'Investigation notes — phishing triage',
    '',
    'A user reported a suspicious email. Your job: confirm whether it is',
    'phishing and find out why.',
    '',
    '  1. list the files in this mailbox     ->  ls',
    '  2. read the reported message          ->  cat suspicious_email.txt',
    '  3. pull every link out of it          ->  grep http suspicious_email.txt',
    '',
    'A real link should match the sender. Watch for one that does not.',
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
};

/* ------------------------------------------------------------------ *
 * DATA — indicators (evidence the rail collects, then the analyst pins)
 * ------------------------------------------------------------------ */
const LAB_IND = {
  // Stage 1–2 phishing indicators
  'urgency':         { group: 'phish', kind: 'INDICATOR', label: 'Urgency / pressure language',
                       teach: 'Phishing manufactures urgency ("expires TODAY", "within 24 hours") to rush you past your judgment.' },
  'link-mismatch':   { group: 'phish', kind: 'LINK', label: 'Link points to a non-CyberCorp domain',
                       teach: 'The portal link goes to cybercorp-support.net — a lookalike, not cybercorp.com. The destination, not the wording, is what matters.' },
  'spoofed-headers': { group: 'phish', kind: 'HEADERS', label: 'SPF FAIL · DKIM none · relay mismatch',
                       teach: 'SPF/DKIM are how a domain authorizes its mail. FAIL/none means cybercorp.com did NOT send this — the From line is forged.' },
  'spoofed-sender':  { group: 'phish', kind: 'SENDER', label: 'Display name ≠ real return address',
                       teach: 'The friendly "IT Helpdesk" display name hides a Return-Path on a different domain. Always read the real address.' },
  'lookalike-domain':{ group: 'phish', kind: 'DOMAIN', label: 'Lookalike domain registered 2 days ago',
                       teach: 'cybercorp-support.net was registered 2 days ago. Brand-new lookalike domains are a classic phishing tell.' },
  // Stage 4 SOC indicators
  'domain-rep':      { group: 'soc', kind: 'INTEL', label: 'Domain flagged KNOWN-MALICIOUS',
                       teach: 'Threat-intel feeds already list this domain + host as phishing infrastructure — independent confirmation.' },
  'campaign-scope':  { group: 'soc', kind: 'SCOPE', label: '12 employees received the same lure',
                       teach: 'One report is the tip of a campaign. Checking recipients shows the real blast radius.' },
  'cred-endpoint':   { group: 'soc', kind: 'URL', label: 'Link POSTs creds to /collect.php',
                       teach: 'Tracing the URL shows the fake portal harvests credentials to attacker infrastructure.' },
  'account-comp':    { group: 'soc', kind: 'ACCOUNT', label: 'j.martin clicked, submitted creds, foreign login followed',
                       teach: 'One target was compromised: they entered credentials and a sign-in from the attacker IP followed minutes later.' },
  'alert-corr':      { group: 'soc', kind: 'SIEM', label: 'SIEM alerts line up with the timeline',
                       teach: 'Correlating SIEM alerts confirms the sequence: lure -> click -> credential POST -> anomalous login.' },
};

/* ------------------------------------------------------------------ *
 * DATA — topology (Stage 3+). Nodes appear only as evidence is found.
 * ------------------------------------------------------------------ */
const LAB_TOPO = {
  nodes: {
    'inbox':   { x: 18, y: 54, glyph: '📥', label: 'Reported inbox', sub: 'r.okafor', type: '' },
    'phish':   { x: 50, y: 46, glyph: '🌐', label: 'cybercorp-support.net', sub: 'lookalike domain', type: 'threat' },
    'targets': { x: 17, y: 22, glyph: '👥', label: '12 targeted inboxes', sub: 'same lure', type: '' },
    'attacker':{ x: 84, y: 22, glyph: '💀', label: '45.139.x.x', sub: 'bulletproof host', type: 'threat' },
    'cred':    { x: 84, y: 70, glyph: '🪝', label: '/collect.php', sub: 'credential harvest', type: 'threat' },
    'victim':  { x: 50, y: 85, glyph: '⚠', label: 'j.martin', sub: 'clicked + submitted', type: 'victim' },
  },
  links: [
    { a: 'inbox',   b: 'phish' },
    { a: 'targets', b: 'phish' },
    { a: 'phish',   b: 'attacker' },
    { a: 'phish',   b: 'cred' },
    { a: 'victim',  b: 'cred', danger: true },
  ],
};

/* ------------------------------------------------------------------ *
 * DATA — tools (progressive dock). `unlock` = stage at which it appears.
 * ------------------------------------------------------------------ */
const LAB_TOOLS = [
  { key: 'ls',     cmd: 'ls',                    unlock: 1, icon: '📁', name: 'List files',     hint: 'ls' },
  { key: 'cat',    cmd: 'cat suspicious_email.txt', unlock: 1, icon: '📄', name: 'Read email',  hint: 'cat <file>' },
  { key: 'grep',   cmd: 'grep http suspicious_email.txt', unlock: 1, icon: '🔍', name: 'Find links', hint: 'grep <pat> <file>' },

  { key: 'headers',cmd: 'headers',  unlock: 2, icon: '⚙', name: 'Headers',  hint: 'headers' },
  { key: 'links',  cmd: 'links',    unlock: 2, icon: '🔗', name: 'Links',    hint: 'links' },
  { key: 'sender', cmd: 'sender',   unlock: 2, icon: '✉', name: 'Sender',   hint: 'sender' },
  { key: 'domain', cmd: 'domain',   unlock: 2, icon: '🌐', name: 'Domain',   hint: 'domain' },

  { key: 'lookup', cmd: 'lookup domain',    unlock: 3, icon: '⚲', name: 'Lookup domain',  hint: 'lookup domain' },
  { key: 'recips', cmd: 'check recipients', unlock: 3, icon: '👥', name: 'Recipients',     hint: 'check recipients' },
  { key: 'trace',  cmd: 'trace url',        unlock: 3, icon: '➤', name: 'Trace URL',      hint: 'trace url' },
  { key: 'login',  cmd: 'inspect login',    unlock: 3, icon: '🔑', name: 'Inspect login',  hint: 'inspect login' },
  { key: 'alerts', cmd: 'review alerts',    unlock: 3, icon: '🚨', name: 'Review alerts',  hint: 'review alerts' },

  { key: 'block',  cmd: 'block domain',     unlock: 5, icon: '⊘', name: 'Block domain',   hint: 'block domain' },
  { key: 'quar',   cmd: 'quarantine email', unlock: 5, icon: '🧹', name: 'Quarantine',     hint: 'quarantine email' },
  { key: 'reset',  cmd: 'reset account',    unlock: 5, icon: '♻', name: 'Reset account',  hint: 'reset account' },
  { key: 'host',   cmd: 'contain host',     unlock: 5, icon: '🛡', name: 'Contain host',   hint: 'contain host' },
  { key: 'report', cmd: 'submit report',    unlock: 5, icon: '📨', name: 'Submit report',  hint: 'submit report' },
];

// first-word -> tool key (every verb is unique)
const LAB_VERB = {
  headers: 'headers', links: 'links', sender: 'sender', domain: 'domain',
  lookup: 'lookup', check: 'recips', trace: 'trace', inspect: 'login', review: 'alerts',
  block: 'block', quarantine: 'quar', reset: 'reset', contain: 'host', submit: 'report',
};

const LAB_OBJECTIVE = {
  1: 'Investigate the reported file. Read it (<code>cat suspicious_email.txt</code>), then pull its links (<code>grep http suspicious_email.txt</code>).',
  2: 'Analyze the email: run <code>headers</code>, <code>links</code>, <code>sender</code>, <code>domain</code> — then PIN the indicators you find (pin 3 to continue).',
  3: 'This is a campaign. Begin SOC correlation — try <code>lookup domain</code>.',
  4: 'Correlate the campaign: <code>check recipients</code>, <code>trace url</code>, <code>inspect login</code>, <code>review alerts</code>. Pin 3 SOC findings to unlock containment.',
  5: 'Contain it: <code>block domain</code>, <code>quarantine email</code>, <code>reset account</code>, <code>contain host</code>, then <code>submit report</code>.',
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
function openLab() {
  LAB.runToken++;
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

  const out = $lab('labTermOut');
  if (out) out.innerHTML = '';
  const oc = $lab('labOutcome');
  if (oc) { oc.hidden = true; oc.innerHTML = ''; }

  labPrint([
    { t: 'CyberCorp Security Training — Lab 001 · Credential Phishing', c: 'head' },
    { t: 'A user reported a suspicious email. It is sitting in a mailbox folder.' },
    { t: 'You are at a Linux terminal. Start by listing the folder: type `ls`.', c: 'dim' },
    { t: 'Type `help` anytime to see the commands available right now.', c: 'dim' },
    { t: 'Stuck? Type `hint` (or click the HINT button) for a nudge — ask again', c: 'dim' },
    { t: 'and each hint gets more specific, ending with the exact command.', c: 'dim' },
  ]);

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
  const badge = $lab('labStageBadge');
  if (badge) badge.textContent = `STAGE ${LAB.stage} / 5`;
  const soc = LAB.stage >= 3;
  const prompt = $lab('labPrompt');
  const label = $lab('labTermLabel');
  if (prompt) prompt.textContent = soc ? 'analyst@soc:~$' : 'intern@cybercorp:~/mailbox$';
  if (label) label.textContent = soc ? 'analyst@soc — incident OPS-2026-001' : 'intern@cybercorp: ~/mailbox';
}

function labRefreshObjective() {
  const txt = $lab('labObjectiveText');
  if (txt) txt.innerHTML = LAB_OBJECTIVE[LAB.stage] || '';
  const prog = $lab('labObjectiveProgress');
  if (!prog) return;
  if (LAB.stage === 2) {
    prog.textContent = `${labPinnedCount('phish')} / 3 pinned`;
  } else if (LAB.stage === 4) {
    prog.textContent = `${labPinnedCount('soc')} / 3 pinned`;
  } else if (LAB.stage === 5) {
    prog.textContent = `${LAB.contained.size} actions taken`;
  } else {
    prog.textContent = '';
  }
}

function labPinnedCount(group) {
  let n = 0;
  LAB.pinned.forEach((id) => { if (LAB_IND[id] && LAB_IND[id].group === group) n++; });
  return n;
}

/* Check whether the current evidence unlocks the next stage. */
function labCheckAdvance() {
  if (LAB.stage === 2 && labPinnedCount('phish') >= 3) {
    labRevealCampaign();
  } else if (LAB.stage === 4 && labPinnedCount('soc') >= 3) {
    labUnlockContainment();
  }
}

function labRevealCampaign() {
  labSetStage(3);
  // Seed the topology with what we already know: the reported inbox + domain.
  LAB.topoNodes.add('inbox');
  LAB.topoNodes.add('phish');
  const topo = $lab('labTopo');
  const files = $lab('labFiles');
  if (files) files.hidden = true;
  if (topo) {
    topo.hidden = false;
    // next frame so the opacity transition runs
    requestAnimationFrame(() => requestAnimationFrame(() => topo.classList.add('is-live')));
  }
  labRenderTopo();
  labPrint([
    { t: '', },
    { t: '── PATTERN DETECTED ──────────────────────────────', c: 'head' },
    { t: 'This is not a single email. The same lure domain is being used in a', c: 'warn' },
    { t: 'wider credential-phishing CAMPAIGN against CyberCorp.', c: 'warn' },
    { t: 'A campaign map is opening above the terminal — it will grow as you', c: 'dim' },
    { t: 'uncover more. Begin SOC correlation: try `lookup domain`.', c: 'dim' },
  ]);
}

function labUnlockContainment() {
  labSetStage(5);
  labPrint([
    { t: '', },
    { t: '── CONTAINMENT AUTHORIZED ────────────────────────', c: 'head' },
    { t: 'Enough evidence is pinned to act. Containment tools are now unlocked.', c: 'ok' },
    { t: 'Each action changes the campaign map. Finish with `submit report`.', c: 'dim' },
  ]);
}

/* ------------------------------------------------------------------ *
 * COMMAND ROUTER
 * ------------------------------------------------------------------ */
function labRun(raw) {
  const text = (raw || '').trim();
  if (!text) return;
  const parts = text.split(/\s+/);
  const word = parts[0].toLowerCase();

  if (word === 'help')  { labEcho(text); labHelp(); return; }
  if (word === 'hint')  { labEcho(text); labHint(); return; }
  if (word === 'clear') { const o = $lab('labTermOut'); if (o) o.innerHTML = ''; return; }
  if (word === 'pwd')   { labEcho(text); labPrint([{ t: LAB.stage >= 3 ? '/home/analyst' : '/home/intern/mailbox' }]); return; }
  if (word === 'pin')   { labEcho(text); labPinCmd(parts.slice(1).join(' ')); return; }

  if (word === 'ls' || word === 'cat' || word === 'less' || word === 'grep') {
    labEcho(text); labFileCmd(word, parts.slice(1)); return;
  }

  const key = LAB_VERB[word];
  const tool = key ? LAB_TOOLS.find((t) => t.key === key) : null;
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
 * HINTS — gradual, never the answer first. Each sub-goal carries three
 * tiers: (1) a conceptual nudge, (2) a directional push, (3) the exact
 * command. Asking `hint` again escalates one tier; making progress (the
 * sub-goal changes) resets back to tier 1.
 * ------------------------------------------------------------------ */
const LAB_HINTS = {
  ls: { id: 'ls', tiers: [
    'You need to see what you are working with. A mailbox folder holds files — your first job is to find out which files are here.',
    'In Linux, one short two-letter command lists the files in the current folder.',
    'Type `ls` and press Enter to list the files.',
  ] },
  cat: { id: 'cat', tiers: [
    'One file is marked REPORTED — that is the message a user flagged. You cannot judge it without reading what it actually says.',
    "Use the command that prints a file's contents to the screen, followed by the reported file's name.",
    'Type `cat suspicious_email.txt` to read the reported email.',
  ] },
  grep: { id: 'grep', tiers: [
    'The email pressures the reader to click a link. Wording can lie — a link\'s destination cannot. Pull the links out so you can examine them.',
    'There is a Linux tool that prints only the lines of a file matching a pattern. Use it on the reported email to surface the web link hiding in the text.',
    'Type `grep http suspicious_email.txt` to extract the link.',
  ] },
  emailTools: { id: 'emailTools', tiers: [
    'You suspect phishing — now prove it with evidence hiding in the email itself: who really sent it, and where the link really points.',
    'The dock now has an EMAIL ANALYSIS group. Each tool there exposes a different tell — the routing metadata, the real sender address, the domain, and the true link target. Work through them one at a time.',
    'Type `headers` first, then try `sender`, `domain`, and `links`.',
  ] },
  pinPhish: { id: 'pinPhish', tiers: [
    'Good — indicators are appearing on the EVIDENCE board to the right. Investigating finds them; you still have to commit the ones that matter.',
    'Pin at least 3 indicators. You can click an evidence card, or use the pin command in the terminal.',
    'Type `pin all` to pin every indicator you have surfaced.',
  ] },
  socStart: { id: 'socStart', tiers: [
    'This was not a single email — it is a campaign. Switch to a SOC analyst\'s job and confirm the attacker\'s infrastructure first.',
    'Use the SOC tools that just unlocked. Start by checking the malicious domain\'s reputation.',
    'Type `lookup domain` to begin the correlation.',
  ] },
  socTools: { id: 'socTools', tiers: [
    'Map the full scope: who else was targeted, where the link leads, and who actually fell for it.',
    'The SOC CORRELATION group in the dock widens the lens — who else got the lure, where the link really leads, whether anyone signed in for the attacker, and what the SIEM recorded. Run each one.',
    'Try `check recipients`, then `trace url`, `inspect login`, and `review alerts`.',
  ] },
  pinSoc: { id: 'pinSoc', tiers: [
    'You have the campaign picture — now record the findings so you are authorized to act.',
    'Pin at least 3 of your SOC findings on the evidence board.',
    'Type `pin all` to pin your SOC findings.',
  ] },
  contain: { id: 'contain', tiers: [
    'Time to shut it down. Think in order: cut off the attacker\'s infrastructure, clean up the mail, then secure the person who was compromised.',
    'The CONTAINMENT group in the dock holds your response actions — one cuts off the attacker\'s infrastructure, one pulls the lure from every inbox, and two secure the compromised user. Take them all.',
    'Type `block domain`, `quarantine email`, `reset account`, then `contain host`.',
  ] },
  report: { id: 'report', tiers: [
    'The threat is contained. A SOC analyst always closes an incident with a written record so others can learn from it.',
    'Submit your incident report to finish the investigation.',
    'Type `submit report` to close the incident.',
  ] },
};

/* Pick the hint sub-goal for the player's CURRENT position in the lab. */
function labCurrentHintGoal() {
  const s = LAB.stage;
  if (s === 1) {
    if (!LAB.ran.has('ls')) return LAB_HINTS.ls;
    if (!LAB.read.has('suspicious_email.txt')) return LAB_HINTS.cat;
    return LAB_HINTS.grep;
  }
  if (s === 2) {
    const discoveredPhish = LAB.discovered.filter((id) => LAB_IND[id] && LAB_IND[id].group === 'phish').length;
    return discoveredPhish < 3 ? LAB_HINTS.emailTools : LAB_HINTS.pinPhish;
  }
  if (s === 3) return LAB_HINTS.socStart;
  if (s === 4) {
    const discoveredSoc = LAB.discovered.filter((id) => LAB_IND[id] && LAB_IND[id].group === 'soc').length;
    return discoveredSoc < 3 ? LAB_HINTS.socTools : LAB_HINTS.pinSoc;
  }
  // Stage 5 — report needs block + quarantine + reset; host rounds out the grade.
  const required = ['block', 'quar', 'reset'];
  return required.some((k) => !LAB.contained.has(k)) ? LAB_HINTS.contain : LAB_HINTS.report;
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
  const lines = [{ t: '[ commands available right now ]', c: 'head' }];
  if (LAB.stage === 1) lines.push({ t: 'Linux basics — investigate the mailbox folder:', c: 'dim' });
  LAB_TOOLS.filter((t) => t.unlock <= LAB.stage).forEach((t) => {
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
  if (cmd === 'ls') {
    LAB.ran.add('ls');
    labPrint([{ t: LAB_FILES.map((f) => f.name).join('   ') }]);
    labRenderDock();
    return;
  }

  if (cmd === 'cat' || cmd === 'less') {
    const name = args[0];
    if (!name) { labPrint([{ t: `usage: ${cmd} <file>`, c: 'dim' }]); return; }
    const file = LAB_FS[name];
    if (!file) { labPrint([{ t: `${cmd}: ${name}: No such file or directory`, c: 'err' }]); return; }
    LAB.ran.add(cmd);
    LAB.read.add(name);
    labPrint(file.map((t) => ({ t })));
    if (name === 'suspicious_email.txt') {
      labPrint([{ t: '[!] Note the pressure to act "within 24 hours" — that urgency is a red flag.', c: 'warn' }]);
      labDiscover('urgency');
      labPrint([{ t: 'Now extract the links: `grep http suspicious_email.txt`', c: 'dim' }]);
    }
    labRenderFiles();
    labRenderDock();
    return;
  }

  if (cmd === 'grep') {
    const pat = args[0];
    const name = args[1];
    if (!pat || !name) { labPrint([{ t: 'usage: grep <pattern> <file>', c: 'dim' }]); return; }
    const file = LAB_FS[name];
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
    // The teachable "aha": grep http on the reported email finds the lure URL.
    const foundUrl = hits.some((l) => /https?:\/\//i.test(l));
    if (name === 'suspicious_email.txt' && foundUrl) {
      labPrint([
        { t: '[+] The link claims to be CyberCorp SSO, but the domain is', c: 'ok' },
        { t: '    cybercorp-support.net — NOT cybercorp.com. The sender and the', c: 'ok' },
        { t: '    real destination do not match. That mismatch confirms phishing.', c: 'ok' },
      ]);
      labDiscover('link-mismatch');
      if (LAB.stage === 1) {
        labSetStage(2);
        labPrint([
          { t: '', },
          { t: '── ANALYST TOOLS UNLOCKED ────────────────────────', c: 'head' },
          { t: 'You found the core tell. Email-analysis tools are now available:', c: 'dim' },
          { t: 'headers · links · sender · domain. Run them, then PIN each indicator.', c: 'dim' },
        ]);
      }
    }
    return;
  }
}

/* ------------------------------------------------------------------ *
 * STAGE 2 — email analysis -> indicators
 * ------------------------------------------------------------------ */
function labDispatch(key) {
  switch (key) {
    case 'ls': case 'cat': case 'grep': return; // handled elsewhere

    case 'headers':
      if (LAB.ran.has('headers')) { labPrint([{ t: 'Already analyzed — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('headers');
      labPrint([
        { t: 'Display-From: it-helpdesk@cybercorp.com' },
        { t: 'Return-Path: bounce@cybercorp-support.net', c: 'warn' },
        { t: 'Received:    mail.unknown-relay-83.ru (45.139.x.x)', c: 'warn' },
        { t: 'SPF: FAIL    DKIM: none', c: 'warn' },
        { t: '[+] cybercorp.com did NOT authorize this message — the sender is forged.', c: 'ok' },
      ]);
      labDiscover('spoofed-headers');
      break;

    case 'links':
      if (LAB.ran.has('links')) { labPrint([{ t: 'Already analyzed — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('links');
      labPrint([
        { t: 'shown:    https://sso.cybercorp-support.net/verify' },
        { t: 'resolves: 45.139.x.x  ->  clone of the CyberCorp SSO page', c: 'warn' },
        { t: 'compare:  vpn.cybercorp.com (real, EV cert) — legitimate' },
        { t: '[+] The link impersonates SSO and points at external infrastructure.', c: 'ok' },
      ]);
      labDiscover('link-mismatch');
      break;

    case 'sender':
      if (LAB.ran.has('sender')) { labPrint([{ t: 'Already analyzed — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('sender');
      labPrint([
        { t: 'display name: "IT Helpdesk"' },
        { t: 'real address: bounce@cybercorp-support.net', c: 'warn' },
        { t: '[+] The friendly name hides a return address on the attacker domain.', c: 'ok' },
      ]);
      labDiscover('spoofed-sender');
      break;

    case 'domain':
      if (LAB.ran.has('domain')) { labPrint([{ t: 'Already analyzed — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('domain');
      labPrint([
        { t: 'domain:     cybercorp-support.net' },
        { t: 'registered: 2 days ago · privacy-shielded WHOIS', c: 'warn' },
        { t: 'legit ref:  cybercorp.com registered 2014', c: '' },
        { t: '[+] A brand-new lookalike domain built to impersonate CyberCorp.', c: 'ok' },
      ]);
      labDiscover('lookalike-domain');
      break;

    /* ---- Stage 4 SOC correlation ---- */
    case 'lookup':
      if (LAB.ran.has('lookup')) { labPrint([{ t: 'Already looked up — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('lookup');
      if (LAB.stage === 3) labSetStage(4);
      labPrint([
        { t: 'cybercorp-support.net  ->  45.139.x.x', c: '' },
        { t: '  AS8003 — flagged bulletproof host', c: 'warn' },
        { t: '  threat-intel verdict: KNOWN-MALICIOUS (phishing)', c: 'warn' },
      ]);
      labAddNode('attacker');
      labDiscover('domain-rep');
      break;

    case 'recips':
      if (LAB.ran.has('recips')) { labPrint([{ t: 'Already checked — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('recips');
      if (LAB.stage === 3) labSetStage(4);
      labPrint([
        { t: 'searching mail logs for cybercorp-support.net …', c: 'dim' },
        { t: '12 employees received the same lure in the last 3 hours.', c: 'warn' },
        { t: '  1 reported · 3 opened · 1 submitted credentials', c: 'warn' },
      ]);
      labAddNode('targets');
      labDiscover('campaign-scope');
      break;

    case 'trace':
      if (LAB.ran.has('trace')) { labPrint([{ t: 'Already traced — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('trace');
      if (LAB.stage === 3) labSetStage(4);
      labPrint([
        { t: 'GET  /verify   ->  302 redirect', c: '' },
        { t: 'POST /collect.php   (username, password)', c: 'warn' },
        { t: '[+] The fake portal harvests credentials to attacker infrastructure.', c: 'ok' },
      ]);
      labAddNode('cred');
      labDiscover('cred-endpoint');
      break;

    case 'login':
      if (LAB.ran.has('login')) { labPrint([{ t: 'Already inspected — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('login');
      if (LAB.stage === 3) labSetStage(4);
      labPrint([
        { t: '06:31 j.martin  submitted credentials on the fake portal', c: 'warn' },
        { t: '06:38 j.martin  SUCCESSFUL login from 45.139.x.x (attacker IP)', c: 'warn' },
        { t: '[+] j.martin is compromised — credentials captured and reused.', c: 'ok' },
      ]);
      labAddNode('victim');
      labDiscover('account-comp');
      break;

    case 'alerts':
      if (LAB.ran.has('alerts')) { labPrint([{ t: 'Already reviewed — see the evidence board.', c: 'dim' }]); return; }
      LAB.ran.add('alerts');
      if (LAB.stage === 3) labSetStage(4);
      labPrint([
        { t: 'SIEM correlation:', c: 'head' },
        { t: '  06:14 phishing lure delivered (x12)' },
        { t: '  06:30 credential POST to 45.139.x.x', c: 'warn' },
        { t: '  06:38 impossible-travel login — j.martin', c: 'warn' },
        { t: '[+] Alerts confirm the kill chain end to end.', c: 'ok' },
      ]);
      labDiscover('alert-corr');
      break;

    /* ---- Stage 5 containment ---- */
    case 'block':   labContain('block'); break;
    case 'quar':    labContain('quar'); break;
    case 'reset':   labContain('reset'); break;
    case 'host':    labContain('host'); break;
    case 'report':  labSubmitReport(); break;

    default: break;
  }
  labRenderRail();
  labRenderDock();
  labRefreshObjective();
}

/* ------------------------------------------------------------------ *
 * EVIDENCE — discover + pin
 * ------------------------------------------------------------------ */
function labDiscover(id) {
  if (!LAB_IND[id]) return;
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
  const unpinned = LAB.discovered.filter((id) => !LAB.pinned.has(id));
  if (unpinned.length === 0) { labPrint([{ t: 'Nothing new to pin — surface indicators first.', c: 'dim' }]); return; }
  if (!arg || arg.toLowerCase() === 'all' || arg.toLowerCase() === 'evidence') {
    unpinned.forEach((id) => LAB.pinned.add(id));
    labPrint([{ t: `[+] Pinned ${unpinned.length} indicator(s) to the evidence board.`, c: 'ok' }]);
    labRenderRail(); labRefreshObjective(); labCheckAdvance();
    return;
  }
  // pin by partial label/id match
  const match = unpinned.find((id) => id.includes(arg.toLowerCase()) || LAB_IND[id].label.toLowerCase().includes(arg.toLowerCase()));
  if (match) {
    LAB.pinned.add(match);
    labPrint([{ t: `[+] Pinned: ${LAB_IND[match].label}`, c: 'ok' }]);
    labRenderRail(); labRefreshObjective(); labCheckAdvance();
  } else {
    labPrint([{ t: `No discovered indicator matches "${arg}". Try \`pin all\`.`, c: 'dim' }]);
  }
}

/* ------------------------------------------------------------------ *
 * CONTAINMENT (Stage 5)
 * ------------------------------------------------------------------ */
const LAB_CONTAIN = {
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
};

function labContain(key) {
  const c = LAB_CONTAIN[key];
  if (!c) return;
  if (LAB.contained.has(key)) { labPrint([{ t: `${c.label}: already done.`, c: 'dim' }]); return; }
  if (!LAB.pinned.has(c.need)) {
    labPrint([{ t: `Pin the supporting evidence first (need: ${LAB_IND[c.need].label}).`, c: 'err' }]);
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
  if (LAB.done) { labPrint([{ t: 'Report already submitted.', c: 'dim' }]); return; }
  const required = ['block', 'quar', 'reset'];
  const missing = required.filter((k) => !LAB.contained.has(k));
  if (missing.length) {
    labPrint([{ t: `Complete containment first — still to do: ${missing.map((k) => LAB_CONTAIN[k].label).join(', ')}.`, c: 'err' }]);
    return;
  }
  LAB.done = true;
  labPrint([
    { t: '[+] Incident report submitted. Campaign contained.', c: 'ok' },
  ]);
  labShowScorecard();
}

/* ------------------------------------------------------------------ *
 * RENDER — dock
 * ------------------------------------------------------------------ */
function labRenderDock() {
  const dock = $lab('labDock');
  if (!dock) return;
  const groupLabel = (u) => ({ 1: 'LINUX', 2: 'EMAIL ANALYSIS', 3: 'SOC CORRELATION', 5: 'CONTAINMENT' }[u] || '');
  const visible = LAB_TOOLS.filter((t) => t.unlock <= LAB.stage);

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
      <button class="${cls}" type="button" data-lab-cmd="${t.cmd}">
        <span class="sc-tool-icon" aria-hidden="true">${t.icon}</span>
        <span class="sc-tool-body">
          <span class="sc-tool-name">${t.name}</span>
          <span class="sc-tool-cmd">${t.hint}</span>
        </span>
      </button>`;
  });
  dock.innerHTML = html;

  dock.querySelectorAll('[data-lab-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $lab('labTermInput');
      labRun(btn.dataset.labCmd);
      if (input) { input.value = ''; input.focus(); }
    });
  });
}

function labToolDone(key) {
  if (key === 'report') return LAB.done;
  if (LAB_CONTAIN[key]) return LAB.contained.has(key);
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
  const host = $lab('labFiles');
  if (!host) return;
  const rows = LAB_FILES.map((f) => {
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
    <div class="lab-files-head">📂 ~/mailbox &nbsp; <span>—</span> &nbsp; click a file to <code>cat</code> it</div>
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
  if (LAB_TOPO.nodes[id]) LAB.topoNodes.add(id);
  labRenderTopo();
}

function labRenderTopo() {
  const svg = $lab('labTopoSvg');
  const host = $lab('labTopoNodes');
  if (!svg || !host) return;
  svg.innerHTML = '';
  host.innerHTML = '';
  const SVGNS = 'http://www.w3.org/2000/svg';

  // links first (only where both endpoints are present)
  LAB_TOPO.links.forEach((lk) => {
    if (!LAB.topoNodes.has(lk.a) || !LAB.topoNodes.has(lk.b)) return;
    const na = LAB_TOPO.nodes[lk.a], nb = LAB_TOPO.nodes[lk.b];
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
  });

  // node chips
  LAB.topoNodes.forEach((id) => {
    const n = LAB_TOPO.nodes[id];
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
    if (state === 'blocked') tag = '<span class="lab-node-tag">BLOCKED</span>';
    else if (state === 'cleared') tag = '<span class="lab-node-tag">QUARANTINED</span>';
    else if (state === 'secured') tag = '<span class="lab-node-tag">SECURED</span>';
    div.innerHTML = `
      <span class="lab-node-dot" aria-hidden="true">${n.glyph}</span>
      <span class="lab-node-label">${n.label}</span>
      <span class="lab-node-sub">${n.sub}</span>
      ${tag}`;
    host.appendChild(div);
  });
}

/* ------------------------------------------------------------------ *
 * RENDER — evidence rail
 * ------------------------------------------------------------------ */
function labRenderRail(justNew) {
  const list = $lab('labRailList');
  const count = $lab('labRailCount');
  if (!list) return;
  if (count) count.textContent = String(LAB.pinned.size);

  if (LAB.discovered.length === 0) {
    list.innerHTML = `<div class="sc-rail-empty">No evidence yet. Investigate the files, then pin the indicators you find.</div>`;
    return;
  }
  const fresh = new Set(justNew || []);
  list.innerHTML = LAB.discovered.map((id) => {
    const ind = LAB_IND[id];
    const pinned = LAB.pinned.has(id);
    const cls = ['sc-ev', 'lab-ev', pinned ? 'is-pinned' : '', fresh.has(id) ? 'is-new' : ''].filter(Boolean).join(' ');
    const tag = pinned ? '📌 PINNED' : 'click to pin';
    return `
      <button type="button" class="${cls}" data-lab-pin="${id}">
        <span class="sc-ev-kind">${ind.kind}</span>
        <span class="sc-ev-label">${ind.label}</span>
        <span class="sc-ev-tag">${tag}</span>
        <span class="sc-ev-teach">${ind.teach}</span>
      </button>`;
  }).join('');

  list.querySelectorAll('[data-lab-pin]').forEach((btn) => {
    btn.addEventListener('click', () => labPin(btn.dataset.labPin));
  });
}

/* ------------------------------------------------------------------ *
 * SCORECARD
 * ------------------------------------------------------------------ */
function labShowScorecard() {
  const panel = $lab('labOutcome');
  if (!panel) return;

  const phishIds = Object.keys(LAB_IND).filter((id) => LAB_IND[id].group === 'phish');
  const socIds = Object.keys(LAB_IND).filter((id) => LAB_IND[id].group === 'soc');
  const pinnedPhish = phishIds.filter((id) => LAB.pinned.has(id));
  const pinnedSoc = socIds.filter((id) => LAB.pinned.has(id));
  const totalPinned = pinnedPhish.length + pinnedSoc.length;
  const totalInd = phishIds.length + socIds.length;
  const actions = Object.keys(LAB_CONTAIN).filter((k) => LAB.contained.has(k));

  const grade = (totalPinned >= totalInd - 1 && actions.length === 4) ? 'A — EXCELLENT'
    : (totalPinned >= 6 && actions.length >= 3) ? 'B — SOLID'
    : 'C — INCIDENT CONTAINED';

  const indRow = (id, on) => `
    <div class="lab-card-row ${on ? '' : 'is-miss'}">
      <span class="ic">${on ? '✓' : '○'}</span>
      <span>${LAB_IND[id].label}</span>
    </div>`;
  const actRow = (k) => `
    <div class="lab-card-row">
      <span class="ic">✓</span><span>${LAB_CONTAIN[k].label}</span>
    </div>`;

  panel.innerHTML = `
    <div class="lab-card">
      <div class="lab-card-grade">RESULT · ${grade}</div>
      <div class="lab-card-title">Campaign contained</div>
      <div class="lab-card-sub">
        You started at a Linux terminal with one reported file and worked all the
        way to org-wide containment — pinning <strong>${totalPinned}/${totalInd}</strong>
        indicators and taking <strong>${actions.length}/4</strong> response actions.
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">Phishing indicators you identified</div>
        <div class="lab-card-list">${phishIds.map((id) => indRow(id, LAB.pinned.has(id))).join('')}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">SOC correlation you performed</div>
        <div class="lab-card-list">${socIds.map((id) => indRow(id, LAB.pinned.has(id))).join('')}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">Response actions taken</div>
        <div class="lab-card-list">${actions.length ? actions.map(actRow).join('') : '<div class="lab-card-row is-miss"><span class="ic">○</span><span>None</span></div>'}</div>
      </div>

      <div class="lab-card-sec">
        <div class="lab-card-sec-head">What you learned</div>
        <div class="lab-card-list">
          <div class="lab-card-row"><span class="ic">▸</span><span>Emails are artifacts you can inspect from a terminal — <code>ls</code>, <code>cat</code> and <code>grep</code> surface the evidence.</span></div>
          <div class="lab-card-row"><span class="ic">▸</span><span>Phishing is proven by the <em>destination</em> and the <em>headers</em>, not the friendly display name.</span></div>
          <div class="lab-card-row"><span class="ic">▸</span><span>One report is usually a campaign — correlation reveals the real blast radius and who was compromised.</span></div>
          <div class="lab-card-row"><span class="ic">▸</span><span>Containment is a sequence: block the infra, pull the mail, secure the account, isolate the host, report.</span></div>
        </div>
      </div>

      <div class="lab-card-actions">
        <button class="lab-card-btn lab-card-btn--primary" type="button" data-lab-replay>↻ Replay the lab</button>
        <button class="lab-card-btn" type="button" data-lab-exit>Return to Operations Center</button>
      </div>
    </div>`;
  panel.hidden = false;

  panel.querySelector('[data-lab-replay]').addEventListener('click', openLab);
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

  // Public entry point so the Operations Center (a separate ES module with no
  // shared scope) can open the lab on a mission launch without a full reload.
  window.openMission001Lab = openLab;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('lab') === 'mission-001') openLab();
  } catch (_) { /* ignore malformed query strings */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', labInit);
} else {
  labInit();
}
