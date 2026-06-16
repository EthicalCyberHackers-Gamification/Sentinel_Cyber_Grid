/**
 * sarah-sparring.harness.js — "Sarah Reyes as Sparring Partner" PLAYTEST harness
 * (pure, DOM-free; Task #124).
 *
 * Interactive browser e2e is unavailable this session and the screenshot tool is
 * static, so this harness drives the REAL extracted sparring logic
 * (sarah-sparring-core.js — the exact pure code the live game calls) across all
 * four career missions and every authored SARAH_CONTENT entry. It exercises each
 * of the five surfaces through their core functions:
 *   (1) Analyst's Bet 2.0  — evaluateHypothesis (strong = falsification test)
 *   (2) Calibration check  — calibrationValid / calibrationLabel / calibrationCallback
 *   (3) Two-voice moment    — twoVoiceValidChoice / twoVoiceReconcile (choice-independent)
 *   (4) Mentor trails        — trailEmit / trailMatches / trailActionValid
 *   (5) Performance mirror   — selectRecap (one strength + one nudge + optional perk)
 * then assembles a deterministic JSON report.
 *
 * Everything is pure: no DOM, no storage, no scoring, no grading. The per-mission
 * content is the REAL bank the game ships, so the grade-chrome / answer-leak audit
 * runs against the actual player-facing strings.
 */

import {
  evaluateHypothesis,
  calibrationValid,
  calibrationLabel,
  calibrationCallback,
  CALIB_LEVELS,
  CALIB_MAX_RATIONALE,
  twoVoiceValidChoice,
  twoVoiceReconcile,
  trailEmit,
  trailMatches,
  trailActionValid,
  TRAIL_ACTIONS,
  selectRecap,
  RECAP_STRENGTHS,
  RECAP_NUDGES,
  SARAH_CONTENT,
  sarahBet,
  sarahCalibration,
  sarahTwoVoice,
  sarahTrails,
} from "../sarah-sparring-core.js";

export const MISSIONS = ["mission-001", "mission-002", "mission-003", "mission-004"];

/* ---- (1) Analyst's Bet 2.0 ------------------------------------------------- *
 * For each mission's bet bank, every authored hypothesis resolves to its tagged
 * strength: exactly one 'strong' falsification test (which unlocks a read-only
 * Spotlight on already-surfaced evidence) and the rest 'weak' non-tests (coaching
 * only). An unknown id resolves to a safe not-found result. The label never
 * states a verdict — that property is audited via the grade-chrome scan. */
function runBets() {
  return MISSIONS.map((missionId) => {
    const bank = sarahBet(missionId);
    const hyps = (bank && bank.hypotheses) || [];
    const rows = hyps.map((h) => {
      const r = evaluateHypothesis(bank, h.id);
      return {
        id: h.id,
        taggedStrong: h.strength === "strong",
        resolvedStrong: r.strong,
        found: r.found,
        spotlightId: r.spotlightId,
        hasCoach: !!r.coach,
      };
    });
    const unknown = evaluateHypothesis(bank, "no-such-id");
    const strongCount = rows.filter((r) => r.resolvedStrong).length;
    return {
      missionId,
      prompt: bank ? bank.prompt : null,
      rows,
      strongCount,
      // exactly one strong, all tags resolve faithfully, strong unlocks a spotlight
      oneStrongTest: strongCount === 1,
      strengthsResolveFaithfully: rows.every((r) => r.taggedStrong === r.resolvedStrong),
      strongHasSpotlight: rows.every((r) => !r.resolvedStrong || !!r.spotlightId),
      everyPickCoaches: rows.every((r) => r.hasCoach),
      unknownIsSafe: unknown.found === false && unknown.strong === false && unknown.spotlightId === null,
    };
  });
}

/* ---- (2) Confidence calibration ------------------------------------------- *
 * A calibration commits only with a valid level AND a non-empty, in-bound
 * rationale. The later callback QUOTES the player's own rationale back and asks
 * (never tells) whether a new finding changes it; it stays '' until committed so
 * it can never fire early, and carries no verdict. */
function runCalibration() {
  const overlong = "x".repeat(CALIB_MAX_RATIONALE + 1);
  return MISSIONS.map((missionId) => {
    const cfg = sarahCalibration(missionId);
    // Valid: every level paired with a short rationale.
    const validRows = CALIB_LEVELS.map((lvl) => ({
      level: lvl,
      label: calibrationLabel(lvl),
      valid: calibrationValid(lvl, "the flagged record looks like real regulated data"),
    }));
    const invalid = {
      noLevel: calibrationValid("", "a reason"),
      badLevel: calibrationValid("certain", "a reason"),
      emptyRationale: calibrationValid("high", ""),
      whitespaceRationale: calibrationValid("high", "   "),
      overlongRationale: calibrationValid("high", overlong),
    };
    // Callback lifecycle: uncommitted -> '' ; committed -> quotes rationale + asks.
    const stored = { committed: true, level: "med", rationale: "two records look like live PII" };
    const beforeCommit = calibrationCallback({ committed: false, level: "med", rationale: "x" }, "the salary field");
    const withFinding = calibrationCallback(stored, "the payment record");
    const withoutFinding = calibrationCallback(stored, "");
    return {
      missionId,
      prompt: cfg ? cfg.prompt : null,
      validRows,
      invalid,
      callback: {
        beforeCommitEmpty: beforeCommit === "",
        quotesRationale: withFinding.includes(stored.rationale),
        quotesLabel: withFinding.includes(calibrationLabel(stored.level)),
        asksNotTells: /\?$/.test(withFinding.trim()) && /\?$/.test(withoutFinding.trim()),
        withFinding,
        withoutFinding,
      },
      allLevelsValid: validRows.every((r) => r.valid && r.label),
      allInvalidRejected: Object.values(invalid).every((v) => v === false),
    };
  });
}

/* ---- (3) Two-voice stakeholder moment ------------------------------------- *
 * Both stakeholder ids are valid picks; junk is rejected. The reconciliation is
 * choice-INDEPENDENT (same line regardless of which voice the player picks) —
 * that is the structural guarantee that the moment encodes no "right" answer. */
function runTwoVoice() {
  return MISSIONS.map((missionId) => {
    const pair = sarahTwoVoice(missionId);
    const aValid = twoVoiceValidChoice(pair, pair && pair.a && pair.a.id);
    const bValid = twoVoiceValidChoice(pair, pair && pair.b && pair.b.id);
    const junkRejected = !twoVoiceValidChoice(pair, "m-v-junk") && !twoVoiceValidChoice(pair, null);
    // Reconciliation is identical no matter the choice (it ignores choiceId).
    const recA = twoVoiceReconcile(pair, pair && pair.a && pair.a.id);
    const recB = twoVoiceReconcile(pair, pair && pair.b && pair.b.id);
    const recNone = twoVoiceReconcile(pair);
    return {
      missionId,
      who: { a: pair && pair.a && pair.a.who, b: pair && pair.b && pair.b.who },
      reconcile: recNone,
      bothValid: aValid && bValid,
      junkRejected,
      choiceIndependent: recA === recB && recB === recNone && recNone === (pair ? pair.reconcile : null),
    };
  });
}

/* ---- (4) Mentor trails ---------------------------------------------------- *
 * A trail ARMS only on its emitOn thread and SURFACES only when its matchOn
 * pattern is visible AND its target finding is already accessible — it can never
 * point at unearned evidence. Its action is one of the read-only navigations. */
function runTrails() {
  return MISSIONS.map((missionId) => {
    const defs = sarahTrails(missionId);
    const rows = defs.map((t) => {
      const armedOnEmit = trailEmit(defs, t.emitOn).some((x) => x.id === t.id);
      const armedOnOther = trailEmit(defs, "ch_not_a_thread").some((x) => x.id === t.id);
      const ctxBoth = {
        visiblePatternKeys: new Set([t.matchOn]),
        accessibleTargets: new Set([t.target]),
      };
      const ctxNoPattern = { visiblePatternKeys: new Set(), accessibleTargets: new Set([t.target]) };
      const ctxNoTarget = { visiblePatternKeys: new Set([t.matchOn]), accessibleTargets: new Set() };
      return {
        id: t.id,
        action: t.action,
        actionValid: trailActionValid(t.action),
        armsOnEmit: armedOnEmit,
        doesNotArmOnOther: !armedOnOther,
        surfacesWhenBoth: trailMatches(t, ctxBoth),
        hiddenWithoutPattern: !trailMatches(t, ctxNoPattern),
        hiddenWithoutTarget: !trailMatches(t, ctxNoTarget),
      };
    });
    return {
      missionId,
      rows,
      allArmFaithfully: rows.every((r) => r.armsOnEmit && r.doesNotArmOnOther),
      allGatedOnVisibleAndAccessible: rows.every(
        (r) => r.surfacesWhenBoth && r.hiddenWithoutPattern && r.hiddenWithoutTarget,
      ),
      allActionsValid: rows.every((r) => r.actionValid),
      bogusActionRejected: trailActionValid("deleteEverything") === false,
    };
  });
}

/* ---- (5) Performance mirror ----------------------------------------------- *
 * selectRecap turns POSTURE signals (breadth, committed calls, explicit Unknowns,
 * whether the player calibrated, whether they staked a falsifiable read) into
 * exactly one reinforced strength + one improvement nudge + an optional carry-over
 * perk. Never a score. The profiles below sweep every strength and every nudge. */
const MIRROR_PROFILES = [
  {
    label: "all-strong",
    signals: { calibrationUsed: true, committedCalls: 3, breadth: 3, unknownsDeclared: 2, betStrong: true },
    expectStrength: "calibrated",
    expectNudge: "push-further",
    expectPerk: false,
  },
  {
    label: "calibrated-but-no-unknowns",
    signals: { calibrationUsed: true, committedCalls: 1, breadth: 3, unknownsDeclared: 0, betStrong: false },
    expectStrength: "calibrated",
    expectNudge: "name-unknowns",
    expectPerk: true,
  },
  {
    label: "calibrated-but-narrow",
    signals: { calibrationUsed: true, committedCalls: 5, breadth: 1, unknownsDeclared: 2, betStrong: false },
    expectStrength: "calibrated",
    expectNudge: "widen-net",
    expectPerk: true,
  },
  {
    label: "consistent-no-calibration",
    signals: { calibrationUsed: false, committedCalls: 4, breadth: 1, unknownsDeclared: 1, betStrong: false },
    expectStrength: "consistent",
    expectNudge: "calibrate-next",
    expectPerk: true,
  },
  {
    label: "broad-no-calibration",
    signals: { calibrationUsed: false, committedCalls: 0, breadth: 4, unknownsDeclared: 2, betStrong: false },
    expectStrength: "breadth",
    expectNudge: "calibrate-next",
    expectPerk: true,
  },
  {
    label: "falsifiable-bet-only",
    signals: { calibrationUsed: false, committedCalls: 0, breadth: 0, unknownsDeclared: 2, betStrong: true },
    expectStrength: "falsifiable",
    expectNudge: "calibrate-next",
    expectPerk: true,
  },
  {
    label: "bare-engagement",
    signals: { calibrationUsed: false, committedCalls: 0, breadth: 0, unknownsDeclared: 0, betStrong: false },
    expectStrength: "evidence-first",
    expectNudge: "calibrate-next",
    expectPerk: true,
  },
];

function runMirror() {
  return MIRROR_PROFILES.map((p) => {
    const recap = selectRecap(p.signals);
    // Determinism: same posture -> same recap.
    const again = selectRecap(p.signals);
    const deterministic = JSON.stringify(recap) === JSON.stringify(again);
    // Posture-only: an injected "score" must not change the result.
    const polluted = selectRecap({ ...p.signals, score: 100, correct: true, grade: "A" });
    const ignoresScore = JSON.stringify(polluted) === JSON.stringify(recap);
    return {
      label: p.label,
      signals: p.signals,
      strengthId: recap.strengthId,
      nudgeId: recap.nudgeId,
      strength: recap.strength,
      nudge: recap.nudge,
      perk: recap.perk,
      oneStrengthOneNudge: !!recap.strength && !!recap.nudge,
      strengthMatches: recap.strengthId === p.expectStrength,
      nudgeMatches: recap.nudgeId === p.expectNudge,
      perkMatches: p.expectPerk ? !!(recap.perk && recap.perk.id && recap.perk.label && recap.perk.note) : recap.perk === null,
      deterministic,
      ignoresScore,
    };
  });
}

/* Collect every player-facing string the sparring CORE produces/ships, for the
 * grade-chrome / answer-leak audit. */
export function collectPlayerStrings(report) {
  const out = [];
  report.bets.forEach((b) => {
    if (b.prompt) out.push(b.prompt);
  });
  // The authored bet labels + coach lines (the most answer-adjacent content).
  MISSIONS.forEach((m) => {
    const bank = sarahBet(m);
    (bank && bank.hypotheses ? bank.hypotheses : []).forEach((h) => {
      out.push(h.label);
      if (h.coach) out.push(h.coach);
    });
    const cfg = sarahCalibration(m);
    if (cfg && cfg.prompt) out.push(cfg.prompt);
    const tv = sarahTwoVoice(m);
    if (tv) {
      if (tv.a) { out.push(tv.a.who); out.push(tv.a.stance); }
      if (tv.b) { out.push(tv.b.who); out.push(tv.b.stance); }
      out.push(tv.reconcile);
    }
    sarahTrails(m).forEach((t) => out.push(t.label));
  });
  // Generated calibration callbacks.
  report.calibration.forEach((c) => {
    out.push(c.callback.withFinding);
    out.push(c.callback.withoutFinding);
  });
  // Recap strength / nudge / perk lines.
  report.mirror.forEach((r) => {
    out.push(r.strength);
    out.push(r.nudge);
    if (r.perk) { out.push(r.perk.label); out.push(r.perk.note); }
  });
  return out.filter((s) => typeof s === "string" && s.length);
}

/* Scoped invariant audit (pure; takes file text + the generated player strings).
 *   (a) no grade chrome / verdict words in any sparring player-facing output
 *   (b) the sparring core is pure, and the sparring LAYER in career-sim.js adds no
 *       graded write, no direct localStorage write, and NO new persistence
 *       (saveCareerState) — the carry-over perk is a session-scoped module var —
 *       and never re-charges confidence (no confSpend stacking). The sole graded
 *       writer (setDiscoveryJudgment) still exists and is where trails arm. */
const GRADE_TOKENS = [
  "\u2713", // ✓
  "\u2717", // ✗
  "correct answer",
  "incorrect",
  "wrong answer",
  "right answer",
  "partly right",
  "partially right",
  "well done",
  "good job",
];

/* Strip block + line comments so the static audit scans CODE only — the forbidden
 * tokens (setDiscoveryJudgment / saveCareerState / confSpend / document / window /
 * localStorage) appear legitimately in the docstrings that DESCRIBE the purity
 * rules, and must not be mistaken for real calls. */
function stripComments(src) {
  return String(src || "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function auditInvariants({ careerSrc, coreSrc, playerStrings }) {
  // (a) grade chrome / verdict language in any sparring-produced player string.
  const dirty = [];
  (playerStrings || []).forEach((s) => {
    const low = String(s).toLowerCase();
    GRADE_TOKENS.forEach((t) => {
      if (low.includes(t.toLowerCase())) dirty.push({ token: t, string: s });
    });
  });
  const noGradeChrome = dirty.length === 0;

  // (b) sarah-sparring-core.js is pure by construction (CODE only, not docstrings).
  // Match real USAGE — a global immediately followed by `.<ident>` or `[` (member
  // access), or a writer call `fn(` — so prose like "past the ship window. Every"
  // (period + space, not member access) in a stakeholder line can't false-trip.
  const coreImpure = /\bdocument\.\w|\bdocument\[|\blocalStorage\.\w|\blocalStorage\[|\bwindow\.\w|\bwindow\[|setDiscoveryJudgment\s*\(|saveCareerState\s*\(/.test(
    stripComments(coreSrc),
  );

  // Slice the sparring LAYER out of career-sim.js (anchored on string markers, not
  // line numbers, so it survives edits): the features (2)-(5) DOM/state wrappers.
  // Anchors are matched in RAW text (the end anchor IS a comment); the scan then
  // runs on the comment-stripped slice so descriptive comments can't false-trip.
  const startAnchor = "function simSarahCalibration()";
  const endAnchor = "/* --- end #124 sarah-sparring layer --- */";
  const startIdx = (careerSrc || "").indexOf(startAnchor);
  const endIdx = (careerSrc || "").indexOf(endAnchor);
  const slice = startIdx >= 0 && endIdx > startIdx ? careerSrc.slice(startIdx, endIdx + endAnchor.length) : "";
  const sliceFound = slice.length > 0;
  const sliceCode = stripComments(slice);

  const sparringCallsGradedWriter = /setDiscoveryJudgment\s*\(/.test(sliceCode);
  const sparringWritesLocalStorageDirectly = /localStorage\.(set|remove)Item/.test(sliceCode);
  const sparringPersistsViaSaveCareerState = /saveCareerState\s*\(/.test(sliceCode);
  const sparringStacksConfidence = /\bconfSpend\b|activateScopeSnapshot\s*\(|\bBET_STAKE\b/.test(sliceCode);
  // Posture-NOT-correctness: the sparring layer (esp. performanceMirrorSignals)
  // must never read keyed-correctness helpers — doing so would turn Sarah's
  // debrief into a hidden grade / answer-leak.
  const sparringReadsCorrectness = /soundJudgmentCount\s*\(|challengeFullyCorrect\b|challengeStepCorrect\s*\(|challengeStatus\s*\(|correctJustificationCount\s*\(|correctObservationCount\s*\(/.test(
    sliceCode,
  );

  // The carry-over perk is a session-scoped module var (declared with `let`,
  // never serialized) — that is what keeps "no new persistence" true. The
  // proximity check is bounded BOTH directions so a far-apart save call elsewhere
  // in the file does not false-trip.
  const careerCode = stripComments(careerSrc);
  const perkIsSessionScopedVar = /let\s+SARAH_SESSION_PERK\b/.test(careerCode);
  const perkNeverPersisted = !new RegExp(
    "saveCareerState[\\s\\S]{0,80}SARAH_SESSION_PERK|SARAH_SESSION_PERK[\\s\\S]{0,80}saveCareerState",
  ).test(careerCode);

  // The sole graded writer must still exist, and is where trails arm (best-effort).
  const gradedWriterExists = /function\s+setDiscoveryJudgment\s*\(/.test(careerSrc || "");
  const gwStart = (careerSrc || "").indexOf("function setDiscoveryJudgment");
  const gwSlice = gwStart >= 0 ? careerSrc.slice(gwStart, gwStart + 2000) : "";
  const trailArmWiredInGradedWriter = /try\s*\{\s*sparringArmTrails\s*\(/.test(gwSlice);

  return {
    noGradeChromeInSparringLayer: {
      pass: noGradeChrome,
      checkedStrings: (playerStrings || []).length,
      offenders: dirty,
      note: "Audited every player-facing string the sparring layer produces or ships across all four missions: bet prompts/labels/coaching, calibration prompts + generated callbacks, two-voice who/stance/reconcile, mentor-trail lines, and recap strength/nudge/perk copy. No ✓/✗, no correct/incorrect/right/wrong verdict language. The bet label never states the verdict; naming a disconfirming criterion is not the answer.",
    },
    presentationOnlyNoNewWrites: {
      pass:
        !coreImpure &&
        sliceFound &&
        !sparringCallsGradedWriter &&
        !sparringWritesLocalStorageDirectly &&
        !sparringPersistsViaSaveCareerState &&
        !sparringStacksConfidence &&
        !sparringReadsCorrectness &&
        perkIsSessionScopedVar &&
        perkNeverPersisted &&
        gradedWriterExists &&
        trailArmWiredInGradedWriter,
      sparringCoreIsPure: !coreImpure,
      sparringLayerSliceFound: sliceFound,
      sparringCallsGradedWriter,
      sparringWritesLocalStorageDirectly,
      sparringPersistsViaSaveCareerState,
      sparringStacksConfidence,
      sparringReadsCorrectness,
      perkIsSessionScopedVar,
      perkNeverPersisted,
      gradedJudgmentWriterStillExists: gradedWriterExists,
      trailArmWiredInGradedWriter,
      note: "sarah-sparring-core.js is pure (no DOM/storage/window/grading). The sparring layer in career-sim.js never calls setDiscoveryJudgment (the SOLE graded writer), never writes localStorage directly, and adds NO new saveCareerState — the carry-over perk lives in a session-scoped module var (SARAH_SESSION_PERK) that is consumed in openCareerMission, never serialized. It also never touches confSpend / activateScopeSnapshot / BET_STAKE, so the trail's scope recap cannot double-charge confidence, and it reads NO keyed-correctness helper (the performance mirror keys on posture: committed calls, breadth, calibration, unknowns, falsifiable bet) so the debrief can never become a hidden grade. Trails arm inside setDiscoveryJudgment behind try/catch (best-effort).",
    },
  };
}

/* Assemble the full deterministic JSON report. `invariants` is computed by the
 * caller (it needs file text) and passed in. */
export function buildPlaytestReport({ invariants } = {}) {
  const bets = runBets();
  const calibration = runCalibration();
  const twoVoice = runTwoVoice();
  const trails = runTrails();
  const mirror = runMirror();

  const betsOk = bets.every(
    (b) => b.oneStrongTest && b.strengthsResolveFaithfully && b.strongHasSpotlight && b.everyPickCoaches && b.unknownIsSafe,
  );
  const calibrationOk = calibration.every(
    (c) =>
      c.allLevelsValid &&
      c.allInvalidRejected &&
      c.callback.beforeCommitEmpty &&
      c.callback.quotesRationale &&
      c.callback.quotesLabel &&
      c.callback.asksNotTells,
  );
  const twoVoiceOk = twoVoice.every((t) => t.bothValid && t.junkRejected && t.choiceIndependent);
  const trailsOk = trails.every(
    (t) => t.allArmFaithfully && t.allGatedOnVisibleAndAccessible && t.allActionsValid && t.bogusActionRejected,
  );
  const mirrorOk = mirror.every(
    (m) => m.oneStrengthOneNudge && m.strengthMatches && m.nudgeMatches && m.perkMatches && m.deterministic && m.ignoresScore,
  );
  const invOk = invariants
    ? invariants.noGradeChromeInSparringLayer.pass && invariants.presentationOnlyNoNewWrites.pass
    : false;

  return {
    report: "Sarah Reyes as Sparring Partner — Playtest (deterministic core-model + static audit)",
    task: "#124",
    system:
      "Sarah comms thread, five presentation-only surfaces: (1) Analyst's Bet 2.0, (2) confidence calibration + later callback, (3) two-voice stakeholder moment, (4) mentor trails, (5) end-of-mission performance mirror + carry-over perk",
    app: "artifacts/ethical-cyberhackers-platform (CyberCorp career simulator)",
    scope:
      "This is a DETERMINISTIC CORE-MODEL playtest plus a static source audit, not a live in-browser click-through. Every surface runs through sarah-sparring-core.js — the same pure logic career-sim.js calls at runtime (extracted behavior-preservingly, mirroring consequence-core.js) — so the bet/calibration/two-voice/trail/recap MECHANICS are exercised exactly, but the production DOM render+delegation flow (renderEvidencePanel / renderDebrief / click handlers) is verified by reading career-sim.js, not by driving the UI. Interactive e2e is unavailable this session and the screenshot tool is static.",
    method:
      "Each surface is driven across ALL FOUR missions with the REAL authored SARAH_CONTENT. The performance mirror sweeps seven posture profiles covering every reinforced strength and every improvement nudge. A scoped static invariant audit of career-sim.js confirms no grade chrome in any generated string and that the sparring layer is presentation-only: no graded write, no direct localStorage write, NO new saveCareerState (perk is a session-scoped module var), and no confidence stacking.",
    bets,
    calibration,
    twoVoice,
    trails,
    mirror,
    invariants: invariants || { note: "computed by the test runner with file text" },
    references: {
      strengths: RECAP_STRENGTHS.map((s) => s.id),
      nudges: RECAP_NUDGES.map((n) => n.id),
      trailActions: TRAIL_ACTIONS,
      calibLevels: CALIB_LEVELS,
      missionsCovered: MISSIONS,
      contentMissions: Object.keys(SARAH_CONTENT),
    },
    screenshots: {
      note: "Per-surface interactive screenshots require a live click-through, which is unavailable this session. An in-mission Analyst Notebook view was captured statically and reviewed for a clean boot; the sparring sections render from the same renderEvidencePanel path exercised here.",
    },
    notes: [
      {
        severity: "info",
        area: "reconciliation / no-grade guarantee",
        observation:
          "The two-voice reconciliation is choice-INDEPENDENT by construction (twoVoiceReconcile ignores choiceId), so neither stakeholder can read as the 'right' pick. The performance mirror reads posture only and ignores an injected score, so it cannot become a hidden grade.",
        impact: "None — this is the intended design and is asserted directly.",
      },
    ],
    verdict: betsOk && calibrationOk && twoVoiceOk && trailsOk && mirrorOk && invOk ? "PASS" : "FAIL",
    verdictBreakdown: {
      analystBet: betsOk ? "PASS" : "FAIL",
      calibration: calibrationOk ? "PASS" : "FAIL",
      twoVoice: twoVoiceOk ? "PASS" : "FAIL",
      mentorTrails: trailsOk ? "PASS" : "FAIL",
      performanceMirror: mirrorOk ? "PASS" : "FAIL",
      invariants: invOk ? "PASS" : "FAIL",
    },
  };
}
