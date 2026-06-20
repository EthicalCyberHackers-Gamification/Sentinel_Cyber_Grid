---
name: Reactive home Active Threats chip
description: The OCV2 home-header "ACTIVE THREATS" chip (formerly "THREAT LEVEL") is a derived, presentation-only reading — not static flavor.
---

# Reactive home "ACTIVE THREATS" chip

The Operations Center home header chip "ACTIVE THREATS: …" is a **live derived
reading**, not a hardcoded label. It steps down as the analyst clears work and
keeps strong defense (Critical → Elevated → Guarded → Normal) and rises again if
defensive posture collapses.

**Label rationale:** it was renamed from "THREAT LEVEL" to "ACTIVE THREATS"
because, sitting next to the Threat Defense gauge, "THREAT LEVEL: ELEVATED" beside
"Threat Defense: Strong" read as a self-contradiction. They are different axes:
Threat Defense = your defensive *capability*; this chip = the live *situational
danger* (half of which is unresolved assignments), so strong defenses can
legitimately coexist with elevated active threats. A `title` tooltip on
`#ocv2ThreatChip` (set in both index.html and the render path) spells this out.

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
  ELEVATED — this is correct, not a bug: only HALF the containment comes from
  defense; the other half is assignments resolved, which is ~0 at the start.
- **Label sync:** the chip text lives in TWO places — the static fallback in
  `index.html` (`#ocv2ThreatText`) and the dynamic write in `renderOperationsCenter`.
  Change both together, plus the `title` tooltip, or they drift.
- Only the home-header chip is derived; the per-mission Threat meter inside
  `#careerOps` is separate and untouched. The neighboring Blue Team / Monitoring
  chips remain honest static.
