---
name: Hoverable locked command cards
description: Why M2/M3 locked command cards use aria-disabled instead of the disabled attribute
---

Native `disabled` buttons do NOT fire `mouseenter`/`mouseleave`/`focus` events and
are removed from the tab order, so any hover/focus tooltip (or other affordance)
attached to a locked card silently never shows.

**Rule:** to keep a "locked" command card inspectable (hover + keyboard focus) while
still preventing activation, lock it with `aria-disabled="true"` + a CSS class —
never the `disabled` attribute — and guard the click handler with
`if (el.getAttribute("aria-disabled") === "true") return;`.

**Why:** the Command Knowledge tooltip system must work on every command card across
all three assignments, including ones not yet unlocked. M1 sidesteps this (it only
renders unlocked cards), but M2/M3 render all cards up front and previously locked
them with `disabled`.

**How to apply:** if you reintroduce a `.disabled` check on M2/M3 command cards
(`.m2-cmd-btn`/`.m3-cmd-btn`), it will both break tooltips AND, because sync no
longer sets `.disabled = false`, leave unlocked cards stuck. Keep `aria-disabled`
as the single source of truth in the static markup, `syncM2Buttons`/`syncM3Buttons`,
and the reset paths. Also keep `pointer-events` ON for locked cards in CSS.
