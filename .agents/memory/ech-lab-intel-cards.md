---
name: Lab intel cards (presentation-only training overlay)
description: How the Mission-001 lab map/rail "intel card" hover/focus/tap overlay is built and the touch+a11y traps it avoids.
---

# Lab intel cards (ops-center-prototype Mission-001 lab)

A presentation-only training overlay: every campaign-map node, every connection,
and every evidence-rail item opens a 3-part intel card (what it is / the analyst
technique that surfaced it / why it matters) on hover, keyboard-focus, or tap.

## Rules / gotchas

- **One shared card, `position: fixed`, appended to `document.body`, clamped to the
  viewport.** Anchoring to the trigger's `getBoundingClientRect()` and clamping
  left/top into `[m, vw-cw-m] / [m, vh-ch-m]` is what guarantees it never clips off
  the small map edge. Measure `offsetWidth/Height` *after* setting `hidden=false`.
  **Why:** the map area is tiny; per-element floating tooltips clip; one clamped
  surface is robust for mouse/keyboard/touch alike.

- **SVG `<line>` is a thin, mouse-only hit target.** For each connection add BOTH a
  focusable HTML midpoint `<button class="lab-link-mid">` (the keyboard/touch target,
  positioned at the link's % midpoint) AND a wide transparent `lab-link-hit` SVG line
  (stroke-width ~4, stroke transparent) so mouse-hover-anywhere-on-the-line works.
  The hit-line anchors the card to the visible marker.

- **Touch has no hover, and tapping a mutating control still mutates.** The rail item
  is a single `<button data-lab-pin>` whose click pins (state change). You can't nest
  a button, so wrap it in `.lab-ev-wrap` and add a *sibling* `.lab-ev-info` hotspot
  bound with `{click:true}` (which `stopPropagation`s) — the only touch-reliable way
  to read intel WITHOUT pinning. Map nodes/markers (no competing click action) just
  use `{click:true}` directly.
  **Why:** without the dedicated hotspot, touch users could only open rail intel by
  pinning, violating the presentation-only invariant.

- **Presentation-only invariant:** intel handlers must never call `labPin`,
  stage/node-state changes, `saveProgress`, or any network/storage write. `openLab`
  and `returnFromLab` call `labIntelHide()`. Dismissal = Esc + capture-phase scroll +
  outside `click` (exempt `.lab-node, .lab-link-mid, .lab-intel, [data-lab-pin],
  [data-lab-info]`).

- The map only renders at lab stage ≥ 3, so visual verification requires driving the
  lab to the SOC stage; there is no stage deep-link. Cosmetic verification fallback:
  `node --check lab.js` + `typecheck` + clean console.
