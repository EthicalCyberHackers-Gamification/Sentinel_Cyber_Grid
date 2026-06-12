---
name: Node tests for DOM-coupled vanilla JS
description: How to write node-runnable tests for this app when script.js can't be imported under node.
---

# Node-runnable tests for the ECH game

`script.js` is an ES module that runs DOM init at import time (touches
`document`, registers listeners). It therefore **cannot be imported under
node** — doing so throws. `missions.js` and other pure-data/helper modules
**can** be imported (no DOM).

**Rule:** to unit-test logic that currently lives inside DOM functions in
`script.js`, extract the pure decision into a sibling, DOM-free module (e.g.
`uiLabels.js`) that both `script.js` and the test import. Then the test
asserts real runtime behavior, not source text.

**Why:** a pure source-grep test (regex over `script.js`) can false-pass on
dead/commented/unreached code and is brittle to var-name/formatting changes.
Runtime assertions on an extracted helper are meaningful and stable.

**How to apply:**
- Keep the extracted strings/behavior **identical** to what was inlined (don't
  change user-facing labels while refactoring for testability).
- `script.js` imports siblings Vite-root-absolute (`from "/uiLabels.js"`);
  node tests import them relatively (`from "../uiLabels.js"`). Both resolve.
- Pair the runtime test with a light grep that the helper is actually *wired*
  in `script.js`, so it can't silently become orphaned dead code.
- runTest is disabled — make tests `node`-runnable and expose them via the
  artifact `package.json` `"test"` script (chained `node tests/*.js`).
- A full A1→A3 playthrough via the DOM is not viable here (see
  ech-e2e-runtest-timeout); prefer small pure-logic + data-shape smoke tests.

**Alternative (no extraction, no jsdom):** for a DOM-coupled module that uses
**no import/export** and exposes its API via `window.*` (e.g. the prototype's
`sim.js`/`oc.js`), drive the *whole* engine loop under node by `vm.runInContext`
of the file source PLUS an appended hook string that re-exports module-scoped
`let`/`const` internals onto `globalThis` (getters keep reassigned `let`s live).
Stub only what the flow touches: `document.getElementById/createElement` →
cached fake nodes with an `innerHTML` setter + no-op `appendChild`, a Map-backed
`localStorage`, `window.location.search`, no-op `setTimeout`. Render output is
ignored — you assert on the exposed state (resources/flags/verdict), and the
render fns still run so they'd throw if broken. jsdom is NOT installed; don't add
it (lockfile churn). Keep the harness in `/tmp` so it isn't committed.
