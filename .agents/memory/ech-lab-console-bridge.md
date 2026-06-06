---
name: oc.js ↔ lab.js cross-module bridge
description: How the Operations Center (oc.js) triggers the isolated progressive lab (lab.js) given they are separate ES modules.
---

`oc.js` (Operations Center) and `lab.js` (the progressive Mission-001 lab) are
separate `<script type="module">` files in ops-center-prototype with NO shared
scope — neither imports the other. To let the Ops Center open the lab on a mission
launch, `lab.js` publishes a deliberate entry point on `window`
(`window.openMission001Lab = openLab`) inside its init, and `launchWorkspace()` in
`oc.js` calls it (with a deep-link fallback if the hook is missing).

**Why:** module isolation was the whole point of the lab (build it without
disturbing the console/holotable). A `window` hook bridges the boundary without
import coupling; load-order is safe because both register on DOMContentLoaded and a
user click can't occur before both modules have run.

**How to apply:** any future "Ops Center opens an isolated interior" wiring (e.g.
extending the lab to other missions) should follow the same pattern — expose a
`window.*` entry point from the interior module + an early-return branch in
`launchWorkspace` BEFORE the console/holotable routing — rather than merging the
modules or importing across them.
