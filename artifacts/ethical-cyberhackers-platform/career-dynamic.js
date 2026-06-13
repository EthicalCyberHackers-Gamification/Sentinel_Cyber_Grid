/* ==================================================================
 * career-dynamic.js — DYNAMIC MISSION CONDITIONS (pure, DOM-free)
 * ------------------------------------------------------------------
 * The career-sim engine sets carry-flags as the analyst makes choices
 * (e.g. leaving a rogue device active in Assignment 002, enforcing MFA
 * in Assignment 003). Until now those flags were recorded but never
 * consumed. This module lets a later mission READ those flags and
 * additively reshape itself — adding evidence, commands, risks, brief
 * "case continuity" lines, debrief outcome notes, and post-hoc resource
 * deltas — so earlier decisions visibly change a later case.
 *
 * Everything here is PURE: no DOM, no globals, no mutation of inputs.
 * `buildEffectiveDef` returns a NEW definition object and never touches
 * the canonical mission def. career-sim.js owns all state and rendering.
 * ================================================================== */

/* Evaluate a flag expression against the current carry-flags.
 * Expression shape (all optional, ANDed together):
 *   { allOf:[...], anyOf:[...], noneOf:[...] }
 *   - allOf : every listed flag must be set
 *   - anyOf : at least one listed flag must be set
 *   - noneOf: none of the listed flags may be set
 * An empty/absent expression is always true. */
export function evalFlagExpr(expr, flags) {
  if (!expr) return true;
  const f = flags || {};
  const has = k => !!f[k];
  if (Array.isArray(expr.allOf) && !expr.allOf.every(has)) return false;
  if (Array.isArray(expr.noneOf) && expr.noneOf.some(has)) return false;
  if (Array.isArray(expr.anyOf) && expr.anyOf.length && !expr.anyOf.some(has)) return false;
  return true;
}

/* Return the subset of a mission's dynamicConditions whose `when` matches the
 * current flags. Order is preserved so downstream output is deterministic. */
export function activeConditions(conditions, flags) {
  return (Array.isArray(conditions) ? conditions : [])
    .filter(c => c && evalFlagExpr(c.when, flags));
}

/* Build the EFFECTIVE mission definition by layering each active condition's
 * additive content onto the base def. Returns a NEW object; `base` is never
 * mutated. Additions are merged by `id` so an active condition can never
 * duplicate or overwrite a base evidence/command/risk. */
export function buildEffectiveDef(base, active) {
  if (!base) return base;
  if (!active || !active.length) return base;
  const evidence = Array.isArray(base.evidence) ? base.evidence.slice() : [];
  const risks = Array.isArray(base.risks) ? base.risks.slice() : [];
  const commands = Array.isArray(base.commands) ? base.commands.slice() : [];
  const addById = (arr, item) => { if (item && item.id && !arr.some(x => x.id === item.id)) arr.push(item); };
  active.forEach(c => {
    (c.addEvidence || []).forEach(e => addById(evidence, e));
    (c.addRisks || []).forEach(r => addById(risks, r));
    (c.addCommands || []).forEach(cmd => addById(commands, cmd));
  });
  return Object.assign({}, base, { evidence, risks, commands });
}

/* Sum the post-hoc resource deltas contributed by active conditions into one
 * delta object. These are applied AFTER the recommendation outcome is scored,
 * so prior-mission consequences move resources without distorting the verdict. */
export function dynamicDeltaMods(active) {
  const out = {};
  (active || []).forEach(c => {
    const d = c.deltaMods || {};
    Object.keys(d).forEach(k => { out[k] = (out[k] || 0) + Number(d[k] || 0); });
  });
  return out;
}

/* Sum two resource-delta objects into a new one (used to fold the dynamic
 * deltaMods into a decision's base deltas for a single, clean apply). */
export function mergeDeltas(a, b) {
  const out = Object.assign({}, a || {});
  Object.keys(b || {}).forEach(k => { out[k] = (out[k] || 0) + Number(b[k] || 0); });
  return out;
}

/* Brief-panel "CASE CONTINUITY" lines: where the thread came from, the prior
 * decision that set it, and how it shapes this case. `tone` styles the line
 * (good | bad | neutral). */
export function continuityLines(active) {
  return (active || [])
    .filter(c => c && c.continuity)
    .map(c => ({
      from: c.continuity.from || '',
      decision: c.continuity.decision || '',
      consequence: c.continuity.consequence || '',
      tone: c.continuity.tone || 'neutral',
    }));
}

/* Debrief "carried forward" outcome notes — a plain-language explanation of how
 * each active condition changed the outcome of this mission. */
export function outcomeNotes(active) {
  return (active || [])
    .filter(c => c && c.outcomeNote)
    .map(c => ({ tone: c.tone || 'neutral', text: c.outcomeNote }));
}

/* ------------------------------------------------------------------ *
 * CAMPAIGN CONTINUITY — "the company remembers" (M1–M4 arc)
 * ------------------------------------------------------------------ *
 * The pieces below let earlier missions visibly shape later ones at the
 * NARRATIVE level (supervisor memory, a growing company timeline), parallel
 * to the mechanical dynamicConditions above. All pure / DOM-free; career-sim.js
 * owns the carry-flags, the persisted history, and the rendering.
 * ------------------------------------------------------------------ */

/* Adaptive Supervisor (Sarah Reyes) lines, keyed on carry-flags. A mission opts
 * in by defining `supervisorMemory:[{when,tone,text}]`; absent that, nothing is
 * emitted (so Mission 1, which has no prior context, is untouched). `when` reuses
 * the evalFlagExpr shape ({allOf,anyOf,noneOf}); order is preserved. */
export function supervisorMemoryLines(rules, flags) {
  return (Array.isArray(rules) ? rules : [])
    .filter(r => r && r.text && evalFlagExpr(r.when, flags))
    .map(r => ({ tone: r.tone || 'neutral', text: r.text }));
}

/* Idempotent upsert of one mission-outcome record into the company history,
 * keyed by missionId. Returns a NEW history object; re-completing a mission
 * REPLACES its entry (never appends a duplicate). `history` may be absent. */
export function upsertCompanyHistory(history, entry) {
  const h = (history && typeof history === 'object') ? Object.assign({}, history) : {};
  if (entry && entry.missionId) h[entry.missionId] = entry;
  return h;
}

/* The company timeline to show on a mission brief: every prior-mission record
 * EXCEPT the one being played, in canonical mission order. `order` is the list
 * of mission ids in play order; when absent, falls back to sorted keys. */
export function companyTimeline(history, currentMissionId, order) {
  const h = (history && typeof history === 'object') ? history : {};
  const ids = (Array.isArray(order) && order.length) ? order : Object.keys(h).sort();
  return ids
    .filter(id => h[id] && id !== currentMissionId)
    .map(id => h[id]);
}
