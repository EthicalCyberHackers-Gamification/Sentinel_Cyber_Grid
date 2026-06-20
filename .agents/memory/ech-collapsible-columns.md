---
name: Collapsible side columns (home + mission)
description: Presentation-only collapse/expand of the left/right columns on the OC home and the active mission screen; where the state classes must live and the [hidden] gotcha.
---

# Collapsible side columns

Presentation-only widen-the-center feature. Layout-only prefs are stored under a
**separate** localStorage key `ech.ui.v1` (never `ech.progress.v1`); the key const
is declared independently in both `script.js` and `career-sim.js` (separate ES
module scopes, no collision).

## Collapse-state classes must sit on never-rebuilt containers
**Rule:** put the collapse classes on containers that re-render does NOT replace —
home: `.ocv2-body` + `#ocv2PanelLeft`/`#ocv2PanelRight`; mission: `.career-main` +
`#simColLeft`/`#simColRight`. The always-visible re-open toggle must also live on
those stable wrappers (the mission right toggle is a grid `auto` row above the
inner panels).
**Why:** career-sim re-renders inner panels via `innerHTML`; anything placed
inside a rebuilt panel (state class or toggle button) gets wiped on the next pass.
**How to apply:** restore persisted state at a render-independent entry point
(home: end of `initOcv2`; mission: top of `enterCareerScreen` via
`applySimColPrefs`), not inside the per-panel render.

## Mobile neutralization must exclude `[hidden]`
**Rule:** the `@media (max-width:1100px)` rule that re-reveals collapsed content
(`.career-col--*.is-collapsed > :not(.sim-col-toggle) { display:flex !important }`)
must also exclude `[hidden]` (`:not([hidden])`).
**Why:** without it, `!important` overrides `.sim-panel--feedback[hidden]{display:none}`
and force-shows the feedback/debrief panel before the first decision — a content
leak on narrow viewports when the right column is persisted collapsed.
**How to apply:** any "force-show on mobile" rule that uses `!important` on a column
whose children include app-`[hidden]` panels needs the `:not([hidden])` guard.
