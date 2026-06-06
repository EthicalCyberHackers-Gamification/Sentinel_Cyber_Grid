---
name: Evidence Holotable mission interior (prototype)
description: The experimental data-driven "holotable" mission interior in ops-center-prototype — pattern, invariants, and the timer gotcha.
---

# Evidence Holotable interior (ops-center-prototype only)

An experimental, re-skinnable mission interior built in the PROTOTYPE app
`ops-center-prototype` (preview `/ops-center/`), NOT the shipping game
`ethical-cyberhackers-platform`. A dark top-down holographic table: phishing
artifacts materialize as ring-placed tokens you inspect → classify
(malicious/benign) → pin malicious to an evidence rail → choose a containment
action → outcome scorecard. All six prototype missions (001–006) now have an
interior; each entry sets its own `briefing` (falls back to `htDefaultBriefing()`).

## Where / how it's wired
- Data-driven from a `HOLOTABLE_MISSIONS` map in `oc.js` (artifacts, decisions,
  takeaway, header strip text). Add a mission there to add an interior.
- `launchWorkspace()` routes a real mission id into `openHolotable()` **only if**
  `HOLOTABLE_MISSIONS[id]` exists; every other mission still deep-links to the
  main game via `/?mission=`. So the holotable is purely additive.
- Markup is a static `#holotable` screen in `index.html`; styles are `.ht-*` in
  `oc.css` reusing the existing OC design tokens. Overlays (`#htInspector`,
  `#htDecision`, `#htOutcome`) are rebuilt via innerHTML each open (listeners
  attach to fresh nodes, so no leak).
- Deep-link `/?holo=<missionId>` opens the interior directly (demo/screenshot aid).

## Invariants (do not break)
- **Prototype-only, in-memory only.** State lives in module vars
  (`htMissionId/htScanned/htContained/htClassified`). NEVER write localStorage or
  game progress; the incident map stays a read-only mirror (`applyMissionProgress`
  re-syncs on return).
- Decision gate = `htAllMaliciousPinned()` (every truly-malicious artifact flagged
  malicious). Reclassify is always allowed; outcome never hard-fails (tier from
  classification accuracy + decision quality).

## Gotcha — stale timers across open/return/replay
`htRunScan` staggers token-materialize `setTimeout`s and the inspector
auto-closes after a correct verdict. Exiting/replaying mid-animation would let
old callbacks fire against the new/hidden session (premature tokens, stray
beeps, closing the wrong inspector).
**Fix pattern:** a module-level `htRunToken` bumped on every `openHolotable` /
`returnFromHolotable`; each timed callback snapshots the token and no-ops if it
changed. The single inspector auto-close timer id (`htInspectorTimer`) is also
tracked and cleared on open/close/return. Any new timed holotable effect must
follow the same snapshot-the-token guard.
