---
name: Ops Center V2 three-panel layout
description: Architecture and key decisions for the graduated three-panel ops center that replaced the card-based #moduleLanding layout.
---

# Ops Center V2 — Three-Panel Layout

## What it is
`#moduleLanding` was replaced with a full-height three-panel layout (alert queue left, world map center, SOC comms right), graduated from the prototype at `/ops-center/`. The prototype at `artifacts/ops-center-prototype/` remains unchanged.

## Key files changed
- `artifacts/ethical-cyberhackers-platform/index.html` — `#moduleLanding` section replaced; `ocv2-screen` class added
- `artifacts/ethical-cyberhackers-platform/style.css` — `ocv2-*` CSS block appended at end
- `artifacts/ethical-cyberhackers-platform/script.js` — `OCV2_INCIDENTS`, `OCV2_TICKER_IOCS`, `OCV2_INTEL_ITEMS`, `OCV2_INITIAL_COMMS` constants; `initOcv2()`, `renderOcPanelV2()`, `showOcv2IncidentCard()`, `hideOcv2IncidentCard()` functions; call to `renderOcPanelV2()` at end of `renderOperationsCenter()`

## Backward compat pattern
All IDs previously in the visible card (`opsPromoBar`, `opsAssign1`, `opsManagerMsg`, `opsProfileName`, `opsHistoryList`, etc.) live in `.ocv2-compat-hidden` (`display:none`) so existing `renderOperationsCenter()` / `renderAnalystProfile()` still run without modification.

## Node → mission mapping
- EMEA (`#ocv2NodeEmea`) = `mission-001` (CRITICAL)
- APAC (`#ocv2NodeApac`) = `mission-002` (HIGH)
- NA-EAST (`#ocv2NodeNaEast`) = `mission-003` (HIGH)
- LATAM / MENA / SEA = decorative only (`ocv2-node--deco`, `pointer-events:none`)

## Init guard
`ocv2Initialized` (bool) ensures `initOcv2()` wires event listeners exactly once even though `renderOcPanelV2()` / `renderOperationsCenter()` are called on every return to the home screen.

## Why: `launchMissionFromMap()` is the launch point
Click node → `showOcv2IncidentCard()` → "Launch Investigation" button → `launchMissionFromMap(missionId)`. This reuses the existing M1/M2/M3 entry flow with no duplication.

## Why: `module-landing.ocv2-screen` override
`.module-landing` normally centers a card with padding. The override sets `flex:1; min-height:0; display:flex; flex-direction:column; padding:0; overflow:hidden; animation:none` so the three-panel body fills the viewport below the site header.
