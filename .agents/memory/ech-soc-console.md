---
name: Live SOC Console interior (sc* prefix)
description: Prototype-only terminal+reactive-map mission interior, parallel to the holotable; routing, isolation, and the SVG className gotcha.
---

# Live SOC Console (ops-center-prototype, mission-003 slice)

A second mission interior in `ops-center-prototype` that runs **parallel** to the
holotable. Terminal-driven investigation over a reactive SVG network map:
`scan → netflow → procscan → intel → inspect/classify → contain → outcome`.
Built as a vertical slice on mission-003 (C2 Beacon) to validate the concept
before rolling out; the holotable stays the interior for every other mission.

## Conventions
- Prefix `sc*` mirrors the holotable's `ht*` (state, render, overlay, run-token).
  When extending, copy the `ht*` shape — same reset-on-open + run-token discipline.
- Data lives in a `console:{}` block on the mission inside `HOLOTABLE_MISSIONS`
  (nodes/infraLinks/threatLink/benignLink/reveal/nodeOf/out scripts). It reuses
  the mission's existing `artifacts`/`decisions`/`takeaway`. The holotable ignores
  this block entirely.
- **Routing switch:** a mission opens the console (not the holotable) iff its
  `HOLOTABLE_MISSIONS[id].console` exists. That single check in `launchWorkspace`
  (and the `?console=<id>` deep-link) is what keeps the two interiors isolated —
  to roll the console out to more missions, just add a `console` block to them.

## Gotcha — SVG elements have a read-only `className`
`svgEl.className = '...'` throws `Cannot set property className ... only a getter`
(it's an `SVGAnimatedString`). Use `svgEl.setAttribute('class', ...)`. `classList`
toggle/add/remove **is** fine on SVG; only the bare `.className =` assignment breaks.
**Why:** map links are `<line>` SVG nodes; toggling their state class via
`.className =` blew up `scApplyMapState`, and because the deep-link wrapped the open
in a silent `try/catch`, the screen just stayed on the ops-center with no error —
had to surface the catch to find it.
**How to apply:** for any SVG node state-class change, use `setAttribute('class')`
or `classList`, never `.className =`. And never leave a swallowing `catch` around
screen-open code during development — log it.
