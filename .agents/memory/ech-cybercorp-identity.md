---
name: CyberCorp organizational identity layer (prototype)
description: How the ops-center-prototype frames player employment/role/supervisor and per-incident org context; what surfaces it touches.
---

# CyberCorp identity layer (ops-center-prototype only)

Phase 1 immersion layer added to `ops-center-prototype` (NOT the shipping
`ethical-cyberhackers-platform` — graduation is a separate future task).
Presentation/data only — in-memory, never touches localStorage or gameplay.

## Single sources of truth (oc.js, top of file before INCIDENTS)
- `CYBERCORP_IDENTITY` — who the player is: employer/division/role/supervisor
  (Sarah Reyes, SOC Lead — keep this name, NOT "Reynolds")/clearance/analyst handle.
- `OP_CONTEXT` keyed by **operation ID** (e.g. `OPS-2026-001`), not the INCIDENTS
  key (`emea`/`apac`/...). Holds `{dept, ticket, reportedBy}`. Use `opContext(opId)`.
  **Why keyed by opId:** the holotable (`ht*`) and SOC console (`sc*`) headers read
  from `HOLOTABLE_MISSIONS` mission objects (which expose `.opId`), a different
  object than `INCIDENTS`. opId is the only stable join key across both.

## Surfaces wired
- Ops Center identity panel: `#ocIdentity` div (top of right `.oc-panel--right`),
  rendered by `renderIdentityPanel()` called from `init()`.
- Pre-mission briefing on the incident card: `#incidentBriefing` para +
  `#incidentDept`/`#incidentTicket` meta rows, populated in `showIncidentCard()`.
- Mission headers: `#htContext` (holotable) / `#scContext` (SOC console) spans,
  populated in `openHolotable`/`openSocConsole` via `opContext(mission.opId)`.
  The lab header (mission-001, static, no dynamic ids — driven by lab.js) gets a
  hardcoded `.sc-context` line instead.

## Recurring cast for continuity
- Supervisor: Sarah Reyes (already the existing comms persona).
- Employee: **J. Okafor (Finance)** — reports the OPS-001 phishing wave, then is
  the most-targeted account in OPS-005 (woven into `emea`/`mena` INCIDENTS desc).
