---
name: Career-sim beginner evidence layers
description: How layered/beginner-first evidence presentation works in the ops-center-prototype career sim (sim.js), and why it must stay presentation-only.
---

# Career-sim beginner evidence layers (ops-center-prototype)

Mission evidence in the career sim can be presented at three depths without
touching the engine. Each evidence item may carry `layers: { beginner:{summary,
why, prompt}, analyst, technical, terms:[] }`. `evLayers(e)` normalizes this and
**falls back to the legacy `e.label`** for every field, so un-layered evidence
(and other missions) still render. The terminal log and all scoring keep using
`e.label` / `qualityWeight` — never the layers.

**Why:** the brief (Task #91) was to change ONLY how evidence is *presented* —
no quiz/lesson, no +/- scoring, no change to recommendation/classification
scoring or mission flow. Keeping `label`/`qualityWeight` as the engine's only
inputs guarantees the refactor can't shift any outcome.

**How to apply** (any future beginner-layer / reflection / glossary work here):
- View depth is a persisted preference: `CAREER.evidenceView` ('beginner'
  default | 'analyst') in `ocp.career.v1`, set via `setEvidenceView` →
  `saveCareerState()`, load-validated in `loadCareerState`. That is the ONLY
  thing these features may persist.
- Per-item disclosure state (`SIM.evReveal`) and the ungraded reflection state
  (`SIM.reflection = {concerns:Set, judgment}`) are TRANSIENT — reset them in
  `openCareerMission`; SIM is never persisted.
- The "What concerns you?" reflection (concern checklist + Benign/Suspicious/
  Malicious judgment + feedback) is intentionally **ungraded**: it writes only
  `SIM.reflection` and touches no resources, mission flags, classification, or
  recommendation logic. (The pre-existing `setFlag` on `ev_contractor_access`
  fires from `surfaceEvidence`, unchanged — don't conflate it with reflection.)
- Glossary (`SIM_GLOSSARY`) tooltips show on hover/`:focus-within`/tap-pin; tap
  toggles `.sim-term-wrap--open` (one open at a time). Tooltips live inside the
  scrolling `.sim-evidence-body` and are positioned ABOVE the chip
  (`bottom: calc(100% + …)`) to dodge clipping — verified non-clipping for the
  Key-terms row and the classify legend.
- Professional terminology (PII, PCI scope, material non-public info, the
  `ext-contractor-07` detail) lives in the analyst/technical layers + glossary,
  not the beginner summary.
- This was built in the PROTOTYPE only. Graduating it into the shipping app
  (`artifacts/ethical-cyberhackers-platform`) is a separate, deliberate step.
