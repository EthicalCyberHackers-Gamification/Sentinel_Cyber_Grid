---
name: Reactive home Threat Level chip
description: The OCV2 home-header "THREAT LEVEL" chip is a derived, presentation-only reading — not static flavor.
---

# Reactive home "THREAT LEVEL" chip

The Operations Center home header chip "THREAT LEVEL: …" is a **live derived
reading**, not a hardcoded label. It steps down as the analyst clears work and
keeps strong defense (Critical → Elevated → Guarded → Normal) and rises again if
defensive posture collapses.

- Derivation lives in `careerThreatLevel()` (career-sim.js): a *containment* score
  = roughly half "work cleared" (resolved/total) + half current Threat Defense
  gauge position. Thresholds map containment → {normal/ok, guarded/warn,
  elevated/alert, critical/crit}. Exposed as `window.echCareerThreatLevel`.
- Rendered from the `renderOperationsCenter()` chokepoint (same cadence as the
  3-gauge resource bar), so it updates on every home reveal AND right after a
  mission completes — no reload.
- Tone → CSS class `ocv2-status--{ok|warn|alert|crit}` on `#ocv2ThreatChip`; text
  on `#ocv2ThreatText`. ok=green, warn=yellow, alert=orange, crit=red.

**Why:** the chip used to be a static "ELEVATED" label that never reacted to play.

**How to apply:**
- **Resolved-count source must match the identity panel.** Drive resolved/total
  from `deriveCareerState()` (the same source as the home "X/N resolved" ID card)
  and pass it into `careerThreatLevel({resolved,total})`. Do NOT let it fall back
  to `CAREER.completedMissions.length` on the home path — that count can drift from
  `missionMapStatus()` and make the chip disagree with the displayed progress.
- **Presentation-only.** It writes nothing to progress/career state/persistence —
  keep it that way.
- **Start-state gotcha:** a fresh analyst (0 resolved, defense strong) computes to
  ELEVATED — the *same word* as the old static label. The tone/color (now orange
  `alert`, not yellow) is the only visible differentiator, so don't conclude "it
  didn't change" from the text alone when verifying.
- Only the home-header chip is derived; the per-mission Threat meter inside
  `#careerOps` is separate and untouched. The neighboring Blue Team / Monitoring
  chips remain honest static.
