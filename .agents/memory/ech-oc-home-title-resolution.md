---
name: Ops Center home title resolution (shipping)
description: How the shipping OC home resolves mission titles per surface, and why generic missions (004-006) need a dedicated home-only override instead of MISSION_MAP or missions.js.
---

# Shipping Ops Center home: title resolution differs by surface

The shipping app's home resolves a mission's displayed title through DIFFERENT
precedence chains per surface, and the generic/data-driven assignments
(004-006) do NOT read `MISSION_MAP`:

- **Incident card** (`showOcv2IncidentCard`): for generic missions it builds its
  text from the ENGINE (`getGenericMission()` → `gen.title/briefing/severity`),
  and only reads `MISSION_MAP` for the live missions 001-003.
- **Identity-card queue** (`renderIdentityPanel`): `MISSION_MAP → gen.title → id`.
- **Alert queue** (`ALERT_NAME` map): already sourced from the prototype's
  `INITIAL_ALERTS` names, independent of the card/queue title.

**Why this matters:** to make 004-006 HOME titles/briefings match the prototype,
do NOT (a) add 004-006 to `MISSION_MAP` — two `Object.keys(MISSION_MAP)` loops
drive the legacy mini-map and expect fields like `nodeId`, so partial entries
ripple into that hidden map; and do NOT (b) edit the `missions.js` generic
titles — those belong to the engine/interior and risk interior drift. Instead
use a dedicated home-only override map (`OCV2_GENERIC_DISPLAY`, keyed by mission
id with title/briefing/threat/transmission) that ONLY the card builder + queue
read, with fallback to the engine title.

**How to apply:** when aligning home titles for the data-driven assignments,
edit/extend `OCV2_GENERIC_DISPLAY` and the two consuming fallback chains — not
`MISSION_MAP`, not `missions.js`. Keep prototype opId jargon (`OPS-001`,
`MENA-005`, `SEA-006`) OUT of shipping copy; the shipping app uses region /
"Assignment NNN" nomenclature, so reword cross-references (e.g. "the EMEA
contractor data-handling case", not "OPS-001").
