/*
 * sarah-sparring-core.js — pure, DOM-free core for the "Sarah Reyes as Sparring
 * Partner" career-sim layer (Task #124).
 *
 * Mirrors the consequence-core.js pattern: every piece of LOGIC that can be
 * reasoned about without a DOM lives here so it can run under node and be driven
 * deterministically by tests/sarah-sparring.*. career-sim.js keeps all DOM/state
 * wrappers and calls into this module.
 *
 * STRICT PURITY: no document / window / localStorage / setDiscoveryJudgment /
 * saveCareerState references. Everything is a pure function of its inputs. This
 * layer is PRESENTATION-ONLY by construction — it never grades, never reveals a
 * keyed answer, and reacts to POSTURE (how the player engaged), not correctness.
 *
 * The per-mission CONTENT (SARAH_CONTENT) is authored here too, so the tests can
 * audit the REAL strings the game ships for grade chrome / answer leaks.
 */

/* ================================================================== *
 * (1) ANALYST'S BET 2.0 — disconfirming-evidence sparring
 * ------------------------------------------------------------------ *
 * Sarah asks what the player would expect to see if their read were WRONG.
 * Each hypothesis is tagged `strength`: a 'strong' pick is a genuine
 * falsification test (names a criterion that WOULD challenge the read) and
 * unlocks a read-only Spotlight on evidence ALREADY surfaced; a 'weak' pick is a
 * non-test (appeal to authority / wishful thinking) and only earns coaching.
 * The label NEVER states the verdict — naming a disconfirming criterion is not
 * the answer.
 * ================================================================== */

/* Resolve a hypothesis pick against a bet bank. Pure. */
export function evaluateHypothesis(bank, id) {
  const list = (bank && bank.hypotheses) || [];
  const h = list.find((x) => x && x.id === id) || null;
  if (!h) return { found: false, strong: false, spotlightId: null, coach: '' };
  return {
    found: true,
    strong: h.strength === 'strong',
    spotlightId: h.spotlightId || null,
    coach: h.coach || '',
  };
}

/* ================================================================== *
 * (2) CONFIDENCE CALIBRATION CHECK + later callback
 * ================================================================== */
export const CALIB_LEVELS = ['low', 'med', 'high'];
export const CALIB_MAX_RATIONALE = 140;

export function calibrationValid(level, rationale) {
  const okLevel = CALIB_LEVELS.includes(String(level));
  const r = String(rationale == null ? '' : rationale).trim();
  return okLevel && r.length > 0 && r.length <= CALIB_MAX_RATIONALE;
}

export function calibrationLabel(level) {
  return level === 'low' ? 'Low'
    : level === 'med' ? 'Medium'
    : level === 'high' ? 'High' : '';
}

/* The later, same-mission callback line. Pure string composition — it QUOTES the
 * player's own earlier rationale back to them and asks (never tells) whether a
 * new finding changes it. No grade, no verdict. '' until a calibration is
 * committed, so it cannot fire early. */
export function calibrationCallback(stored, newFindingShort) {
  if (!stored || !stored.committed) return '';
  const lvl = calibrationLabel(stored.level);
  const why = String(stored.rationale || '').trim();
  if (!lvl || !why) return '';
  const nf = String(newFindingShort || '').trim();
  const tail = nf
    ? `Now that ${nf} is on the table, does that still hold?`
    : `Does the latest finding change that?`;
  return `Earlier you put your confidence at ${lvl} \u2014 \u201c${why}\u201d. ${tail}`;
}

/* ================================================================== *
 * (3) TWO-VOICE STAKEHOLDER MOMENT
 * ------------------------------------------------------------------ *
 * Two stakeholders voice conflicting PRIORITIES. The player picks whose framing
 * fits the evidence. Sarah's reconciliation is the SAME regardless of choice —
 * there is no right voice, so the line cannot encode a grade.
 * ================================================================== */
export function twoVoiceValidChoice(pair, choiceId) {
  if (!pair) return false;
  return [pair.a && pair.a.id, pair.b && pair.b.id].includes(choiceId);
}

/* Reconciliation does NOT depend on choiceId — both framings are legitimate
 * pressures; the analyst's job is to put evidence in front of them, not to pick a
 * winner. Returning a choice-independent line is what guarantees "no grade". */
export function twoVoiceReconcile(pair /* , choiceId */) {
  return (pair && pair.reconcile) || '';
}

/* ================================================================== *
 * (4) MENTOR TRAILS — "what I'd check next", surfaced on a later pattern
 * ------------------------------------------------------------------ *
 * A trail ARMS when its `emitOn` thread is committed, and SURFACES only when its
 * `matchOn` pattern is later visible AND its `target` is an already-accessible
 * surface (an evidence id already in the player's evidence set). It can never
 * point at something the player has not already unlocked, and never adds a new
 * command.
 * ================================================================== */
export function trailEmit(trailDefs, committedKey) {
  return (trailDefs || []).filter((t) => t && t.emitOn === committedKey);
}

/* `ctx`: { visiblePatternKeys:Set, accessibleTargets:Set }. A trail surfaces only
 * when its later pattern is visible AND its target surface is already accessible. */
export function trailMatches(trail, ctx) {
  if (!trail || !ctx) return false;
  const vis = ctx.visiblePatternKeys;
  const acc = ctx.accessibleTargets;
  const matchVisible = vis && typeof vis.has === 'function' && vis.has(trail.matchOn);
  const targetAccessible = !trail.target || (acc && typeof acc.has === 'function' && acc.has(trail.target));
  return !!(matchVisible && targetAccessible);
}

export const TRAIL_ACTIONS = ['focusEvidence', 'openScopedRecap'];
export function trailActionValid(action) {
  return TRAIL_ACTIONS.includes(action);
}

/* ================================================================== *
 * (5) PERFORMANCE MIRROR — end recap (one strength + one nudge + perk)
 * ------------------------------------------------------------------ *
 * Derived from POSTURE signals the player generated (breadth of evidence, sound
 * judgment steps, explicit Unknowns, whether they calibrated, whether they
 * staked a falsifiable read). Never from a score. selectRecap always returns
 * exactly one reinforced strength and one improvement nudge.
 * ================================================================== */
export const RECAP_STRENGTHS = [
  {
    id: 'calibrated',
    when: (s) => !!s.calibrationUsed,
    line: 'You put a number on your confidence and said why. Calibrating out loud is a senior habit \u2014 keep doing it.',
  },
  {
    id: 'consistent',
    when: (s) => (s.soundJudgments | 0) >= 3,
    line: 'Your reasoning held up call after call. That consistency is exactly what I lean on in a partner.',
  },
  {
    id: 'breadth',
    when: (s) => (s.breadth | 0) >= 3,
    line: 'You pulled signal from every tier of the evidence, not just the loud parts. That breadth is how a lead reads a case.',
  },
  {
    id: 'falsifiable',
    when: (s) => !!s.betStrong,
    line: 'You committed to a read and named what would prove you wrong. Stating a falsifiable position takes real analyst nerve.',
  },
  {
    id: 'evidence-first',
    when: () => true,
    line: 'You worked the evidence before you called it. Leading with what you can see is the whole job \u2014 nicely done.',
  },
];

export const RECAP_NUDGES = [
  {
    id: 'calibrate-next',
    when: (s) => !s.calibrationUsed,
    line: 'Next case, put a number on your confidence and say why. Calibrating early catches over-reach before it costs you.',
    perk: {
      id: 'perk-calibrate',
      label: 'Calibration carry-over',
      note: 'Sarah will prompt you to calibrate the moment your read firms up next case.',
    },
  },
  {
    id: 'name-unknowns',
    when: (s) => (s.unknownsDeclared | 0) === 0,
    line: "Try naming what you DON'T know out loud \u2014 flag an Unknown. An explicit gap sharpens the whole team's focus.",
    perk: {
      id: 'perk-unknowns',
      label: 'Open-question carry-over',
      note: 'Next case, the first Unknown you flag earns a quick Scope Snapshot recap.',
    },
  },
  {
    id: 'widen-net',
    when: (s) => (s.breadth | 0) < 2,
    line: 'Cast a wider net next time \u2014 pull from more than one tier of evidence before you commit your read.',
    perk: {
      id: 'perk-widen',
      label: 'Wide-net carry-over',
      note: 'Next case, Sarah will nudge you to corroborate across tiers before the call.',
    },
  },
  {
    id: 'push-further',
    when: () => true,
    line: 'Push one finding past the point it feels necessary \u2014 the extra step is where the real story usually hides.',
    perk: null,
  },
];

export function selectPerk(nudge) {
  return (nudge && nudge.perk) || null;
}

export function selectRecap(signals) {
  const s = signals || {};
  const strength = RECAP_STRENGTHS.find((r) => r.when(s)) || RECAP_STRENGTHS[RECAP_STRENGTHS.length - 1];
  const nudge = RECAP_NUDGES.find((r) => r.when(s)) || RECAP_NUDGES[RECAP_NUDGES.length - 1];
  const perk = selectPerk(nudge);
  return {
    strengthId: strength.id,
    strength: strength.line,
    nudgeId: nudge.id,
    nudge: nudge.line,
    perk: perk ? { id: perk.id, label: perk.label, note: perk.note, from: null } : null,
  };
}

/* ================================================================== *
 * PER-MISSION CONTENT — authored here so the tests audit the REAL strings.
 * Keyed by mission id. career-sim.js reads `SIM.def.sarah` first (dynamic
 * override hook), then falls back to this bank. A mission with no entry shows
 * none of the five surfaces (data-gated, never mission-id-branched).
 * ================================================================== */
export const SARAH_CONTENT = {
  'mission-001': {
    bet: {
      prompt: 'Before this release decision goes up the chain \u2014 suppose your read is wrong. What would you expect to find if it were?',
      hypotheses: [
        {
          id: 'm1-h-strong', strength: 'strong', spotlightId: 'ev_customer_pii',
          label: 'If my read is wrong, the flagged records would turn out to be synthetic test data \u2014 not real personal or payment fields.',
          coach: "That's a real falsification test \u2014 it names exactly what evidence would change your mind. Re-read the flagged record against it.",
        },
        {
          id: 'm1-h-weak1', strength: 'weak',
          label: 'If my read is wrong, someone upstream would have caught it before it reached me.',
          coach: 'Careful \u2014 that leans on other people, not on evidence. A disconfirming test has to be something YOU can check in the files.',
        },
        {
          id: 'm1-h-weak2', strength: 'weak',
          label: 'If my read is wrong, the contractor would have flagged anything sensitive themselves.',
          coach: 'That assumes good faith from the very account in question. Anchor your test to what the release set actually contains.',
        },
      ],
    },
    calibration: {
      prompt: 'Before you commit \u2014 how sure are you about this release call, and why?',
      callbackPrompt: '',
    },
    twoVoice: {
      a: { id: 'm1-v-ship', who: 'Release Manager', stance: "We are past the ship window. Every hour we hold this, the launch slips and the cost lands on my team." },
      b: { id: 'm1-v-legal', who: 'Compliance Lead', stance: 'If regulated data leaves the building, the penalty dwarfs any launch delay. Hold until we know what is in the set.' },
      reconcile: 'Both pressures are real, and neither is yours to settle. Your job is to put what the evidence shows in front of them so they can weigh it \u2014 name what you see, and let them own the call.',
    },
    trails: [
      {
        id: 'm1-t-scope', emitOn: 'ch_pii_salary', matchOn: 'ch_customer_pii', target: 'ev_customer_pii',
        action: 'focusEvidence',
        label: "When you logged the personnel data, I'd check the payment records the same way \u2014 are they in regulatory scope too?",
      },
    ],
  },

  'mission-002': {
    bet: {
      prompt: 'Before you write up the unknown device \u2014 suppose your read is wrong. What would you expect to see if it were?',
      hypotheses: [
        {
          id: 'm2-h-strong', strength: 'strong', spotlightId: 'ev_not_in_inventory',
          label: 'If my read is wrong, the host would show up in the approved asset inventory with an owner on record.',
          coach: 'Good test \u2014 inventory membership is something you can verify directly. Hold your read against what the inventory actually says.',
        },
        {
          id: 'm2-h-weak1', strength: 'weak',
          label: 'If my read is wrong, IT would already have an alert open on it.',
          coach: 'That waits on someone else to have noticed. A disconfirming test should be a check you can run on the device yourself.',
        },
        {
          id: 'm2-h-weak2', strength: 'weak',
          label: 'If my read is wrong, the device would probably just go quiet on its own.',
          coach: 'Waiting it out is not a test \u2014 it tells you nothing now. Anchor to evidence the host is giving you.',
        },
      ],
    },
    calibration: {
      prompt: 'Before you commit \u2014 how confident is your read on this device, and why?',
      callbackPrompt: '',
    },
    twoVoice: {
      a: { id: 'm2-v-ops', who: 'Network Ops', stance: 'Pulling a live host mid-day risks knocking a real user offline. Let us monitor it before we disconnect anything.' },
      b: { id: 'm2-v-sec', who: 'Security Lead', stance: 'An unrecognized device beside Finance is not something we watch \u2014 policy says isolate first, ask questions after.' },
      reconcile: 'Each is protecting something worth protecting \u2014 uptime and containment. You do not have to choose for them; lay out what the device is doing and let the evidence frame the trade-off.',
    },
    trails: [
      {
        id: 'm2-t-behaviour', emitOn: 'ch_m2_segment', matchOn: 'ch_m2_probe', target: 'ev_probe',
        action: 'focusEvidence',
        label: 'Now that you have placed it on the internal segment, I would look at what it is actually reaching for next.',
      },
    ],
  },

  'mission-003': {
    bet: {
      prompt: 'Before you escalate this account activity \u2014 suppose your read is wrong. What would you expect to see if it were?',
      hypotheses: [
        {
          id: 'm3-h-strong', strength: 'strong', spotlightId: 'ev_impossible',
          label: 'If my read is wrong, the two sessions would be explainable by one person travelling \u2014 not separated by an impossible distance in minutes.',
          coach: 'Strong \u2014 that is a falsifiable check on the geography. Weigh the session timeline against it.',
        },
        {
          id: 'm3-h-weak1', strength: 'weak',
          label: 'If my read is wrong, the user would have called the help desk already.',
          coach: 'That depends on the user noticing and reporting. A disconfirming test should live in the evidence you already pulled.',
        },
        {
          id: 'm3-h-weak2', strength: 'weak',
          label: 'If my read is wrong, the system would not have raised anything at all.',
          coach: 'Absence of an alert is not proof of safety. Tie your test to the session data in front of you.',
        },
      ],
    },
    calibration: {
      prompt: 'Before you escalate \u2014 how sure are you about this compromise read, and why?',
      callbackPrompt: '',
    },
    twoVoice: {
      a: { id: 'm3-v-user', who: 'Account Owner', stance: 'I think I just fumbled my password a few times this morning. Please do not lock me out before my client call.' },
      b: { id: 'm3-v-ir', who: 'Incident Response', stance: 'A login burst plus a new location plus an MFA change is our textbook compromise pattern. We act now, not after the call.' },
      reconcile: 'One voice fears disruption, the other fears a breach \u2014 both are reasonable from where they stand. Your role is to surface what the sessions actually show so the call is made on evidence, not on whoever is loudest.',
    },
    trails: [
      {
        id: 'm3-t-actions', emitOn: 'ch_m3_impossible', matchOn: 'ch_m3_changes', target: 'ev_changes',
        action: 'focusEvidence',
        label: 'Once the geography looked impossible, I would check what the account DID right after it got in.',
      },
    ],
  },

  'mission-004': {
    bet: {
      prompt: 'This one goes to incident response \u2014 suppose your read is wrong. What would you expect to see if it were?',
      hypotheses: [
        {
          id: 'm4-h-strong', strength: 'strong', spotlightId: 'ev_external_dest',
          label: 'If my read is wrong, the upload destination would resolve to a known, sanctioned company endpoint \u2014 not an unrecognized external host.',
          coach: 'That is the right falsification test \u2014 the destination is checkable. Hold your read against where the archive actually went.',
        },
        {
          id: 'm4-h-weak1', strength: 'weak',
          label: 'If my read is wrong, Finance would have approved the transfer through a ticket somewhere.',
          coach: 'That hopes a paper trail exists elsewhere. A disconfirming test should be something in the evidence you have already gathered.',
        },
        {
          id: 'm4-h-weak2', strength: 'weak',
          label: 'If my read is wrong, a transfer this large would have been blocked automatically.',
          coach: 'Assuming a control fired is not the same as checking. Anchor your test to the transfer record itself.',
        },
      ],
    },
    calibration: {
      prompt: 'Before IR takes it \u2014 how confident is your exfiltration read, and why?',
      callbackPrompt: '',
    },
    twoVoice: {
      a: { id: 'm4-v-fin', who: 'Finance Director', stance: 'Cutting that account off mid-quarter freezes work my whole team depends on. Be certain before you pull the plug.' },
      b: { id: 'm4-v-ciso', who: 'CISO', stance: 'If 240,000 records are leaving the building, containment is not negotiable. We stop the bleed first and reconcile the cost later.' },
      reconcile: 'Continuity and containment are both real stakes, and the call above your pay grade. Give them the evidence trail you built \u2014 what moved, where it went, from which endpoint \u2014 and let them weigh it with eyes open.',
    },
    trails: [
      {
        id: 'm4-t-dest', emitOn: 'ch_m4_transfer', matchOn: 'ch_m4_dest', target: 'ev_external_dest',
        action: 'focusEvidence',
        label: 'Once you saw the archive move, the very next thing I would pin down is WHERE it went.',
      },
    ],
  },
};

/* Thin content accessors (pure). career-sim.js layers SIM.def overrides on top. */
export function sarahBet(missionId) {
  const c = SARAH_CONTENT[missionId];
  return (c && c.bet) || null;
}
export function sarahCalibration(missionId) {
  const c = SARAH_CONTENT[missionId];
  return (c && c.calibration) || null;
}
export function sarahTwoVoice(missionId) {
  const c = SARAH_CONTENT[missionId];
  return (c && c.twoVoice) || null;
}
export function sarahTrails(missionId) {
  const c = SARAH_CONTENT[missionId];
  return (c && c.trails) || [];
}
