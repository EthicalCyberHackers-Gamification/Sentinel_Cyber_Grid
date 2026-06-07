/*
 * lab.glossary.js — CyberCorp SOC Knowledge Base
 *
 * A shared, presentation-only glossary of real SOC terms used across all six
 * training labs. The progressive lab's `explain <term>` / `define <term>`
 * command resolves against this base, and each mission's learning layer
 * (lab.js / lab.missions/*) lists which keys are most relevant to surface.
 *
 * Each entry: { term, full?, def, op }
 *   term — short display name (what the player typed / sees on a chip)
 *   full — optional spelled-out expansion for acronyms
 *   def  — concise, authentic definition
 *   op   — operational note: how a SOC analyst actually uses this in practice
 *
 * This module NEVER touches state, XP, progress, persistence, or grading. It is
 * pure teaching data, read on demand. Keys are lowercase, hyphen-separated.
 */
export const LAB_GLOSSARY = {
  /* ---- Phishing & email authentication (mission-001) ---- */
  'phishing': {
    term: 'Phishing',
    def: 'A social-engineering attack that tricks a person into handing over credentials or clicking a malicious link by impersonating someone they trust.',
    op: 'Prove it by the destination and the headers, not the friendly display name — the words can claim anything, the technical fingerprints cannot.',
  },
  'social-engineering': {
    term: 'social engineering',
    def: 'Manipulating people (urgency, fear, false authority) into acting against their own interest, instead of attacking machines directly.',
    op: 'An urgent "act now or lose access" tone is a tell — legitimate IT rarely pressures you to bypass your own judgement.',
  },
  'spf': {
    term: 'SPF',
    full: 'Sender Policy Framework',
    def: 'A DNS record listing which mail servers may send mail for a domain. "SPF FAIL" means this server was NOT authorized to send as that domain.',
    op: 'An SPF FAIL on mail claiming to be internal is strong evidence the sender is forged — escalate, do not trust the From line.',
  },
  'dkim': {
    term: 'DKIM',
    full: 'DomainKeys Identified Mail',
    def: 'A cryptographic signature a domain adds to its outgoing mail so receivers can verify it was really sent (and untampered) by that domain.',
    op: '"DKIM none" means the message carries no valid signature from the domain it claims — treat the claimed sender as unproven.',
  },
  'dmarc': {
    term: 'DMARC',
    full: 'Domain-based Message Authentication, Reporting & Conformance',
    def: 'A policy that ties SPF and DKIM results to the visible From address and tells receivers what to do when they fail.',
    op: 'DMARC alignment is the single check that connects "looks like us" to "is actually authorized as us" — read it before trusting a sender.',
  },
  'return-path': {
    term: 'Return-Path',
    def: 'The real envelope address bounces go back to, set by the sending server — not the friendly "From" a human sees.',
    op: 'Attackers fake the From but the Return-Path often exposes the true origin — always compare the two.',
  },
  'lookalike-domain': {
    term: 'lookalike domain',
    def: 'A domain registered to visually resemble a trusted one (extra words, swapped letters, different TLD) to fool a quick glance.',
    op: 'Cross-check the registration date — a "support" lookalike registered days ago is purpose-built infrastructure, not a typo.',
  },
  'credential-harvesting': {
    term: 'credential harvesting',
    def: 'Collecting usernames and passwords at scale, usually via a fake login page that POSTs whatever is typed to attacker infrastructure.',
    op: 'Find where the fake page sends its data (e.g. a POST to /collect.php) — that endpoint is the attacker objective and an IOC to block.',
  },
  'impossible-travel': {
    term: 'impossible travel',
    def: 'A sign-in from a location the user could not physically have reached in the time since their last login.',
    op: 'It turns "attempted phishing" into a confirmed account takeover — reset the password and revoke sessions immediately.',
  },

  /* ---- Lateral movement & authentication (mission-002) ---- */
  'lateral-movement': {
    term: 'lateral movement',
    def: 'An attacker spreading from an initial foothold to other systems inside the network, hunting for higher-value targets.',
    op: 'Segments that are normally isolated suddenly talking to each other is the network signature — trace the chain, do not just clean one host.',
  },
  'pass-the-hash': {
    term: 'pass-the-hash',
    def: 'Authenticating with a stolen password hash directly, without ever knowing or cracking the plaintext password.',
    op: 'The same hash reused across two hosts proves stolen credentials in motion — rotate the account, do not just reset one machine.',
  },
  'ntlm': {
    term: 'NTLM',
    full: 'NT LAN Manager',
    def: 'A legacy Windows authentication protocol that proves identity using a password hash rather than a modern ticket.',
    op: 'Unexpected NTLM (instead of Kerberos) from a host that should never initiate it is a pass-the-hash red flag.',
  },
  'hash': {
    term: 'password hash',
    def: 'A one-way cryptographic representation of a password, stored so the plaintext is never kept — but it can still be stolen and reused.',
    op: 'If the same hash appears authenticating on multiple hosts, the credential is compromised regardless of password strength.',
  },
  'logon-type': {
    term: 'logon type',
    def: 'A Windows code describing how a session was established — e.g. Type 2 interactive (at the keyboard) vs Type 3 network (remote).',
    op: 'A Type 3 network logon with no interactive parent, from an odd source, is the classic footprint of remote credential abuse.',
  },
  'service-account': {
    term: 'service account',
    def: 'A non-human account used by software/services, often with broad standing access and a rarely-changed password.',
    op: 'A service account used far outside its known job (off-hours, new hosts) is high-signal — they have a predictable baseline to compare against.',
  },
  'smb': {
    term: 'SMB',
    full: 'Server Message Block',
    def: 'The Windows protocol for file and resource sharing across a network.',
    op: 'SMB connections between segments that should never share files are a common lateral-movement channel.',
  },
  'rpc': {
    term: 'RPC',
    full: 'Remote Procedure Call',
    def: 'A protocol letting one machine execute functions or create services on another remotely.',
    op: 'A service created remotely over RPC (especially unsigned) is how attackers run code on the next host in the chain.',
  },
  'east-west': {
    term: 'east-west traffic',
    def: 'Traffic that moves between internal systems, as opposed to north-south traffic crossing the network perimeter.',
    op: 'Most monitoring watches the perimeter; unusual east-west flow is where lateral movement hides — correlate it deliberately.',
  },
  'patient-zero': {
    term: 'patient zero',
    def: 'The first compromised system in an incident — the origin the rest of the activity spreads from.',
    op: 'Identify it before containing: isolate downstream hosts, but patient zero is where the foothold (and root cause) actually lives.',
  },

  /* ---- Reconnaissance (mission-003 / mission-004) ---- */
  'reconnaissance': {
    term: 'reconnaissance',
    def: 'The quiet information-gathering stage before an attack, where an adversary maps which systems and services are reachable.',
    op: 'Repeated or unfamiliar contact is its first fingerprint — a busy log looks noisy, but a scan has a pattern. Investigate first, act last.',
  },
  'port-scan': {
    term: 'port scan',
    def: 'Systematically probing many network ports on a target to discover which services are running and potentially exploitable.',
    op: 'Probes hitting ports a host does not even run reveal blind enumeration — that pattern, not any single packet, is the proof.',
  },
  'attack-surface': {
    term: 'attack surface',
    def: 'The full set of services, ports, and entry points an outsider could reach and attempt to exploit.',
    op: 'A sweep is an attacker mapping your attack surface — your response is to shrink it: harden or close the exposed services they found.',
  },
  'subnet': {
    term: 'subnet / CIDR',
    def: 'A block of IP addresses written as a range, e.g. 203.0.113.0/24 covers 256 addresses sharing one network.',
    op: 'When many denied sources share one /24, treat the range as a single actor — block and watch-list the range, not just one IP.',
  },
  'firewall': {
    term: 'firewall',
    def: 'A control that allows or denies network traffic by rule, and logs what it blocks at a network boundary.',
    op: 'A flood of denied connections in the firewall log is often your earliest, cleanest view of external probing — read it first.',
  },

  /* ---- Account takeover & brute force (mission-005) ---- */
  'account-takeover': {
    term: 'account takeover',
    full: 'ATO',
    def: 'An attacker gaining control of a legitimate user account, then operating with that user\u2019s access and trust.',
    op: 'Confirm it with a successful login after the failures (often from a new geo) — that flips "attempted" into "contain now".',
  },
  'brute-force': {
    term: 'brute force',
    def: 'Repeatedly guessing a single account\u2019s password until one works, producing a burst of failed logins.',
    op: 'Many failures against one (often privileged) account is the tell — disable or lock the target before the guess lands.',
  },
  'credential-stuffing': {
    term: 'credential stuffing',
    def: 'Replaying username/password pairs leaked from other breaches across your logins, betting users reused them.',
    op: 'It looks like brute force spread thin across many accounts — threat-intel flags on the source confirm the campaign.',
  },
  'mfa': {
    term: 'MFA',
    full: 'Multi-Factor Authentication',
    def: 'Requiring a second proof of identity (a code, key, or prompt) beyond the password.',
    op: 'After a takeover, resetting the password is not enough — force MFA re-enrollment so a stolen factor can\u2019t be reused.',
  },
  'privileged-account': {
    term: 'privileged account',
    def: 'An account with elevated rights (admin, service, root) whose compromise has outsized blast radius.',
    op: 'Attacks aimed squarely at admin/service accounts are deliberate, not opportunistic — prioritize and escalate them.',
  },
  'geoip': {
    term: 'GeoIP',
    def: 'Mapping an IP address to an approximate physical location and network owner.',
    op: 'A login from a country a user has never worked from is a strong takeover signal — combine it with the failure burst, don\u2019t rely on it alone.',
  },

  /* ---- Triage & disposition (mission-006) ---- */
  'triage': {
    term: 'triage',
    def: 'Quickly assessing an alert to decide its severity and what (if anything) it warrants — the first step of any SOC workflow.',
    op: 'Good triage ends in a defensible verdict, including "benign" — not every alert is an incident, and proving it is real work.',
  },
  'ids': {
    term: 'IDS',
    full: 'Intrusion Detection System',
    def: 'A sensor that watches traffic and raises alerts on patterns that match known-suspicious behavior.',
    op: 'An IDS flags possibilities, not facts — its alert is the start of triage, never the conclusion.',
  },
  'false-positive': {
    term: 'false positive',
    def: 'An alert that looks malicious but, on investigation, turns out to be benign activity.',
    op: 'Closing one correctly is a win: document why it was benign and feed it back so the same noise is tuned down next time.',
  },
  'proportionate-response': {
    term: 'proportionate response',
    def: 'Matching the size of your reaction to the actual risk — neither ignoring a real threat nor over-blocking benign activity.',
    op: 'Blocking a legitimate research scanner has a cost too; a benign verdict with monitoring can be the correct, mature call.',
  },

  /* ---- Cross-cutting SOC concepts (used across missions) ---- */
  'ioc': {
    term: 'IOC',
    full: 'Indicator of Compromise',
    def: 'A concrete, observable artifact of an attack — a malicious domain, IP, URL, or file hash — that you can pin, share, and block.',
    op: 'Pin IOCs as you find them: they are what you hand to containment and to other teams to block org-wide.',
  },
  'c2': {
    term: 'C2',
    full: 'Command and Control',
    def: 'Attacker-controlled infrastructure that stolen data is sent to, or that issues instructions to compromised machines.',
    op: 'Cutting C2 reach (blocking the domain/host) is usually the first containment move — it stops the bleeding for everyone at once.',
  },
  'siem': {
    term: 'SIEM',
    full: 'Security Information and Event Management',
    def: 'The platform that aggregates logs and alerts across the org so an analyst can correlate scattered events into one timeline.',
    op: 'Use it to confirm scope: a SIEM that lines isolated alerts up on one timeline turns a single report into the whole incident.',
  },
  'whois': {
    term: 'WHOIS',
    def: 'A lookup of a domain or IP range\u2019s registration record — who registered it, when, and which network owns it.',
    op: 'A domain registered days ago, or an unallocated/unregistered source range, is a classic hostile-infrastructure tell.',
  },
  'asn': {
    term: 'ASN',
    full: 'Autonomous System Number',
    def: 'An identifier for the network that owns a block of IP addresses, revealing which provider hosts an address.',
    op: 'The ASN tells you whether an IP sits on a reputable network or an abuse-friendly one — useful for spotting bulletproof hosts.',
  },
  'kill-chain': {
    term: 'kill chain',
    def: 'The ordered stages of an attack — e.g. lure \u2192 click \u2192 credential POST \u2192 account takeover.',
    op: 'Confirming each link proves the attack succeeded (not just attempted) and tells you exactly what to contain.',
  },
  'blast-radius': {
    term: 'blast radius',
    def: 'The full scope of who and what an incident touched.',
    op: 'Size it before you close: one report is rarely alone, and the blast radius is your list of everyone to notify, reset, and protect.',
  },
  'bulletproof': {
    term: 'bulletproof host',
    def: 'A hosting provider that deliberately ignores abuse complaints, so attacker infrastructure stays online.',
    op: 'Seeing one is itself a red flag — it signals intent and infrastructure, not an accidental or one-off source.',
  },
  'baseline': {
    term: 'baseline',
    def: 'A documented picture of normal — the known-good peers, services, hours, and behavior a system usually shows.',
    op: 'Anomaly detection is only as good as the baseline: "absent from the known-good list" is meaningful precisely because the list exists.',
  },
  'threat-intel': {
    term: 'threat intelligence',
    def: 'Curated knowledge of known-bad indicators, actors, and patterns, used to enrich and confirm your local findings.',
    op: 'It corroborates, it doesn\u2019t replace your evidence: a source flagged in an intel feed confirms what your logs already suggested.',
  },
  'containment': {
    term: 'containment',
    def: 'The actions that stop an active incident from spreading or causing further harm, before cleanup and recovery.',
    op: 'Work outside-in: cut the attacker\u2019s reach first, then remove what they planted, then secure the affected accounts and hosts.',
  },
};
