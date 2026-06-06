---
name: OCV2 severity casing mismatch
description: OCV2_NODE_META severity is UPPERCASE but node CSS classes / lookup maps are lowercase — normalize before any keyed lookup.
---

# OCV2 severity casing mismatch

`OCV2_NODE_META[missionId].severity` (and the incident card's `data-severity`)
are **UPPERCASE** strings: `"CRITICAL"`, `"HIGH"`, `"MEDIUM"`, `"LOW"`.

But the map node CSS classes (`.ocv2-node--critical`, `--high`, …) and any
JS object used to key off severity (e.g. a pitch/color lookup) are **lowercase**.

**Why:** A keyed lookup like `pitches[meta.severity]` silently misses (returns
`undefined` → falls to a default) because `pitches["CRITICAL"]` ≠ `pitches.critical`.
This bit the Ops Center select-sound migration — every node played the fallback
tone until the severity was lowercased.

**How to apply:** When mapping `meta.severity` into anything keyed (sound pitch,
color, etc.), normalize first: `String(severity || "").toLowerCase()`. The
node's own CSS class is already lowercase in the HTML, so CSS selectors are fine —
this only bites JS lookups.
