/* ==================================================================
 * consequence-core.js — CONSEQUENCE EMOTION LOOP CORE (pure, DOM-free)
 * ------------------------------------------------------------------
 * The pure, report-relevant pieces of the Consequence Emotion Loop
 * (Task #120 — Company Health Dials, Consequence Postcards, Scar Notes,
 * Micro-Tradeoffs), extracted out of career-sim.js so they can run under
 * node (mirroring career-dynamic.js). career-sim.js keeps ALL state and
 * DOM rendering and calls into this core; live behavior is unchanged.
 *
 * Everything here is PURE: no DOM, no globals, no storage, no scoring.
 * Functions that were SIM-bound in career-sim.js (consequenceDept,
 * pickPostcards) are parameterized on `missionId` here; career-sim.js
 * keeps thin SIM-bound wrappers so its call sites are untouched.
 * ================================================================== */

// Posture map: decision id -> {of, le} (Operational Friction / Latent Exposure),
// each 0-3. Authored PURELY from the action's operational nature, with zero
// reference to any mission's correct answer:
//   - Containment / disruption (lock, isolate, disconnect, reset, lockdown,
//     revoke, block, disable) raises FRICTION — broad/forced ones raise it more.
//   - Under-reaction (ignore, monitor-only, keep investigating a live threat,
//     downgrade, approve a risky release) raises EXPOSURE.
//   - Process actions (escalate, recommend review/forensics/notify, file report)
//     stay neutral.
// Proportionate calls move a dial by at most 1; only extreme calls peak (->scar).
export const CONSEQUENCE_POSTURE = {
  // Mission 1 — Protect Sensitive Information (data release)
  approve_release:           { of: 0, le: 3 },
  restrict_access:           { of: 1, le: 0 },
  archive:                   { of: 0, le: 1 },
  recommend_legal:           { of: 0, le: 0 },
  escalate:                  { of: 0, le: 0 },
  rec_policy_review:         { of: 0, le: 0 },
  rec_escalate:              { of: 0, le: 0 },
  // Mission 2 — Investigate Network Assets (rogue device)
  recommend_disconnect:      { of: 1, le: 0 },
  monitor:                   { of: 0, le: 1 },
  continue_investigation:    { of: 0, le: 2 },
  ignore:                    { of: 0, le: 3 },
  rec_network_isolation:     { of: 1, le: 0 },
  rec_device_review:         { of: 0, le: 0 },
  // Mission 3 — Suspicious Authentication Activity (account compromise)
  lock_account:              { of: 1, le: 0 },
  recommend_reset:           { of: 1, le: 0 },
  enforce_mfa:               { of: 0, le: 0 },
  rec_orgwide_reset:         { of: 2, le: 0 },
  rec_contractor_revoke:     { of: 1, le: 0 },
  // Mission 4 — Data Exfiltration Investigation (capstone)
  recommend_disable_account: { of: 1, le: 0 },
  recommend_block_device:    { of: 1, le: 0 },
  recommend_forensics:       { of: 0, le: 0 },
  recommend_customer_notify: { of: 0, le: 0 },
  submit_incident_report:    { of: 0, le: 0 },
  downgrade:                 { of: 0, le: 3 },
  rec_companywide_lockdown:  { of: 3, le: 0 },
  rec_terminate_contractor:  { of: 1, le: 0 },
};

// Per-mission department flavor (presentation only). Drives which teams the
// toasts / postcards / scars name, so ripples feel local to the case.
export const CONSEQUENCE_DEPTS = {
  'mission-001': { of: 'Compliance', le: 'Legal' },
  'mission-002': { of: 'IT / NetOps', le: 'Network Ops' },
  'mission-003': { of: 'Identity & Access', le: 'Finance' },
  'mission-004': { of: 'Forensics', le: 'Customer Trust' },
};

/* Pure department lookup (career-sim.js wraps this with SIM.missionId). */
export function deptFor(missionId, kind) {
  const d = CONSEQUENCE_DEPTS[missionId] || { of: 'Operations', le: 'Risk' };
  return (kind === 'of' ? d.of : d.le) || 'Operations';
}

// Heuristic fallback for any decision id not in the posture map: keyword scan of
// the id keeps an un-mapped future action diegetically sane (never correctness).
export function posturefallback(actionId) {
  const id = String(actionId || '').toLowerCase();
  if (/lockdown|orgwide|companywide|terminate/.test(id)) return { of: 2, le: 0 };
  if (/lock|isolat|disconnect|reset|revoke|block|disable|quarantine/.test(id)) return { of: 1, le: 0 };
  if (/ignore|downgrade|dismiss|approve_release/.test(id)) return { of: 0, le: 3 };
  if (/monitor|continue|defer|wait|archive/.test(id)) return { of: 0, le: 1 };
  return { of: 0, le: 0 };
}

export function routePosture(actionId) {
  const m = CONSEQUENCE_POSTURE[actionId];
  const p = m || posturefallback(actionId);
  return { of: Math.max(0, Math.min(3, p.of | 0)), le: Math.max(0, Math.min(3, p.le | 0)) };
}

/* ---- (A) Company Health Dials --------------------------------------------- */
// Two mission-scoped meters. SIM.consequence is transient (reset every open),
// so dials never carry across missions.
export const CONSEQUENCE_DIALS = [
  { key: 'of', label: 'Operational Friction', short: 'FRICTION', toast: 'IT & operations absorbed disruption from this call.' },
  { key: 'le', label: 'Latent Exposure',      short: 'EXPOSURE', toast: 'Risk was left open for someone else to chase down.' },
];

export function freshConsequenceState() { return { of: 0, le: 0, tradeoffShown: false }; }

/* Pure dial-accumulation step: route the decision, clamp-add onto `before`,
 * and return the per-dial posture delta + the new {of, le}. This is exactly
 * how applyDecisionConsequence mutates SIM.consequence. */
export function accrueDecision(before, actionId) {
  const b = { of: (before && before.of) | 0, le: (before && before.le) | 0 };
  const delta = routePosture(actionId);
  const after = {
    of: Math.max(0, Math.min(3, b.of + delta.of)),
    le: Math.max(0, Math.min(3, b.le + delta.le)),
  };
  return { delta, after };
}

/* ---- (B) Consequence Postcards -------------------------------------------- */
// Template bank (8-12). `pick` chooses by posture band; text is in-world and
// describes organizational ripples — never the correctness of the answer.
export const POSTCARD_BANK = [
  // Friction-leaning (the org felt the disruption of a forceful call)
  { id: 'pc-of-helpdesk', band: 'of', min: 1, text: d => `${d} logged extra help-desk tickets this week — a few users were locked out after your call and needed re-verification.` },
  { id: 'pc-of-approval', band: 'of', min: 1, text: d => `${d} has added a sign-off checkpoint to similar requests after the disruption your response caused.` },
  { id: 'pc-of-scramble', band: 'of', min: 2, text: d => `${d} pulled an on-call engineer in overnight to restore access your action interrupted. They got it back online.` },
  { id: 'pc-of-memo',     band: 'of', min: 2, text: d => `A short ${d} memo circulated: "decisive containment, but loop us in earlier next time so we can stage the rollback."` },
  // Exposure-leaning (something was left open for others to chase)
  { id: 'pc-le-followup', band: 'le', min: 1, text: d => `${d} opened a follow-up ticket on the thread you left active — they're keeping an eye on it for now.` },
  { id: 'pc-le-watch',    band: 'le', min: 1, text: d => `${d} added the unresolved item to their watch-list. Nothing has escalated yet.` },
  { id: 'pc-le-review',   band: 'le', min: 2, text: d => `${d} flagged an open exposure from the case for review — they'd like a second look before it ages.` },
  { id: 'pc-le-handoff',  band: 'le', min: 2, text: d => `${d} inherited the loose end from your case and asked for your notes so they can close it out.` },
  // Calm / balanced (a measured call — quiet acknowledgement)
  { id: 'pc-calm-ack',    band: 'calm', min: 0, text: d => `${d} noted a clean, measured handling of the case. No follow-ups required on their side.` },
  { id: 'pc-calm-thanks', band: 'calm', min: 0, text: d => `A quick note from ${d}: "balanced call — minimal disruption, nothing left hanging. Nice work."` },
  { id: 'pc-calm-quiet',  band: 'calm', min: 0, text: d => `${d} reports a quiet shift after your decision. The queue stayed steady.` },
];

/* Pick up to two postcards by dominant posture band (career-sim.js wraps this
 * with SIM.missionId). `now` is injectable so callers/tests can be deterministic;
 * it defaults to Date.now() so live behavior is unchanged.
 * NOTE: the pre-extraction code called Date.now() twice per card (once for the
 * id, once for `ts`); this captures one `ts` and reuses it for both. Card ids
 * stay unique via the `:${i}` suffix and `ts` is display/ordering metadata only
 * (the home inbox surfaces in queue/FIFO order, not by ts), so this is a
 * harmless normalization — and it is what makes the deterministic report
 * possible. */
export function pickPostcards(missionId, of, le, now) {
  const ts = (typeof now === 'number') ? now : Date.now();
  // Choose the dominant posture; ties / all-zero read "calm".
  let band = 'calm';
  if (of > le && of >= 1) band = 'of';
  else if (le > of && le >= 1) band = 'le';
  const level = band === 'of' ? of : band === 'le' ? le : 0;
  const dept = deptFor(missionId, band === 'le' ? 'le' : 'of');
  const pool = POSTCARD_BANK.filter(p => p.band === band && level >= p.min);
  // Up to two, highest-min first (so a peak call gets its stronger note).
  const sorted = pool.sort((a, b) => b.min - a.min);
  const take = sorted.slice(0, Math.min(2, sorted.length));
  return take.map((p, i) => ({
    id: `${missionId}:${p.id}:${ts}:${i}`,
    kind: band, dept, missionId, of, le,
    text: p.text(dept), ts, shown: false,
  }));
}

/* ---- (C) Scar Notes ------------------------------------------------------- */
// Per-dial copy for a scar (a dial peaked at 3/3). career-sim.js owns the
// idempotent append into CAREER.scarNotes (keyed `${missionId}:${dial}`).
export const SCAR_TEXT = {
  of: d => `Heavy-handed response on this case stretched ${d}. The team still references it when scoping containment.`,
  le: d => `A loose end on this case sat open long enough that ${d} remembers having to chase it.`,
};

/* ---- (D) Micro-Tradeoff band ---------------------------------------------- */
// Select the debrief tradeoff band from the dominant dial. PURE — career-sim.js
// renders the band-specific HTML (OF sign-off banner / LE deferral / calm chip).
//   OF-dominant (of>=2 && of>=le) -> 'of'; else LE (le>=2) -> 'le'; else 'calm'.
export function tradeoffBand(of, le) {
  const o = of | 0, l = le | 0;
  if (o >= 2 && o >= l) return 'of';
  if (l >= 2) return 'le';
  return 'calm';
}
