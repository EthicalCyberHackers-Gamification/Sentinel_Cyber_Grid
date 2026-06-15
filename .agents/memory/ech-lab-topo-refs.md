---
name: Lab topo node references must all be defined
description: Cloning/authoring a lab mission's topo block — the map renderer silently drops references to undefined nodes (no crash), so a missing node = a quietly broken map.
---

When authoring or cloning a Progressive Lab / orientation mission's `topo` block,
EVERY node id referenced by `seedNodes`, `topo.links[].a/.b`, and
`topo.mapReact[event].reveal/mask/unmask/trust` MUST be defined in `topo.nodes`.

**Why:** the map renderer guards missing endpoints (`if (!na || !nb) return`) and
ignores trust/reveal entries for unknown ids. A reference to an undefined node
therefore does NOT throw — the link/node is simply omitted and the map renders
incomplete. This is easy to miss when cloning an existing mission: forgetting to
copy the suspect (`source`) and benign-contrast (`cdn`) nodes produced a map that
looked fine at first glance (the suspect is masked until `grep` anyway) but never
revealed the core lesson. It cost an architect-found bug, not a runtime error.

**How to apply:** when you clone a proven mission as a structural template, copy
the FULL `topo.nodes` set, not just the ones you happened to edit. There is a
static guard — `tests/lab-topo-refs.test.js` (wired into `npm test`) — that fails
if any dataset references an undefined node id. Run `npm test` after touching any
`topo` block; do not rely on a fresh-load screenshot, since progressive reveals
mean the missing node may only surface several commands deep.
