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

## Drag-to-resize shares this layer (widths via custom props)
Resizable side columns build on the same `ech.ui.v1` layer (width keys
`ocLeftW`/`ocRightW`, `simLeftW`/`simRightW`). Widths flow through CSS custom props
(`--oc-left-w`/`--oc-right-w` on `.ocv2-body`; `--sim-left-w`/`--sim-right-w` on
`.career-main`); the grid template references the var and the absolutely-positioned
divider handles read the same var so they auto-track the boundary.

**Rule:** one apply fn per screen (`applyOcColumns`/`applySimColumns`) is the sole
writer of the inline width vars, and it reads collapsed state from the **DOM class**
(`ocSideCollapsed`/`simSideCollapsed`), never the just-saved pref.
**Why:** the collapse click handler saves the collapse pref AFTER `setOc/SimColState`
toggles the class; reading the pref inside the apply fn would race and pick stale
collapse state. Reading the class (already toggled) makes save-ordering irrelevant.

**Rule (mobile-override asymmetry — the real gotcha):** the HOME narrow layout
(`@media max-width:900px`) sets the width vars to 220px, so it is var-overridable —
home MUST use a `matchMedia` listener and `removeProperty` the inline var on narrow
so the CSS default wins. The MISSION narrow layout (`@media max-width:1100px`) sets
`grid-template-columns: 1fr` literally, which overrides the var template entirely, so
the mission inline vars are simply **inert when stacked** — mission needs NO
matchMedia listener.
**How to apply:** before reusing this pattern on a new screen, check whether its
mobile rule overrides the var (→ needs listener+removeProperty) or the whole
template (→ vars inert, no listener). Clamp = per-side min + dynamic max
(`container − otherSide − centerMin`; mission also subtracts padding+gaps). Drag uses
delta `startW ± dx` so gap/padding never enter the math; window pointermove/up/cancel
listeners are added on drag start and all removed on the one `onUp`.
