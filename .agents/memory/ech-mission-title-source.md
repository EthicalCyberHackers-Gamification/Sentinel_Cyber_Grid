---
name: Canonical mission title/severity source
description: Which source of truth to trust for missions 001-004 titles/severity when building mission lists (Course Path, maps, etc.)
---

# Canonical mission title / severity source

For missions **001–004**, the **career-sim datasets** (and the derived
`COURSE_MISSION_META` in `script.js`) are the source of truth for the
player-facing title and severity. The **legacy mission registry** mislabels
slot 4 as a "Reconnaissance Sweep" recon case — that is WRONG for the shipping
build.

Canonical (career-sim) titles: 001 Protect Sensitive Information (EMEA/HIGH),
002 Investigate Network Assets (APAC/MEDIUM), 003 Investigate Suspicious
Authentication Activity (NA-EAST/HIGH), 004 Investigate a Data Exfiltration
Incident (LATAM/CRITICAL). 005/006 (generic engine): Account Takeover
Investigation (MENA/MEDIUM), Anomalous Scan Triage (SEA/LOW).

**Why:** career-sim *owns* 001–004 and routes them, so what the player actually
plays in slot 4 is the Data Exfiltration case, not recon. The legacy registry is
stale here; a future agent "fixing" Course Path titles to match the registry
would reintroduce the wrong slot-4 label.

**How to apply:** any new mission-list UI (Course Path, ops map, scorecards) must
pull titles/severity from the career-sim/`COURSE_MISSION_META` set, not the
legacy registry. Severity casing is UPPERCASE in `OCV2_NODE_META`; lowercase it
before keyed CSS/JS lookups.
