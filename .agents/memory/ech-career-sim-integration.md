---
name: Career simulator integration (prototype → shipping)
description: How the prototype career sim (sim.js) is ported into the shipping app as an isolated module, the boot/screen bridges, the CSS token sharing, the persistence routing, and the home chrome (resource bar + identity card).
---

# Career simulator integration (prototype → shipping)

The shipping app (`artifacts/ethical-cyberhackers-platform`) ports the prototype's
career-simulator gameplay (six resource meters + consequence engine, role/rank,
prototype mission interior) from `ops-center-prototype/sim.js` + `sim.css`, copied
in as `career-sim.js` + `career-sim.css` (isolated ES module, own scope; loaded
between `missions.js` and `script.js`). It coordinates with `script.js` ONLY via
`window` bridges + DOM + shared progress — no shared module scope.

## De-self-boot + re-hydrate ordering (non-obvious)
- `career-sim.js` must NOT self-boot on `DOMContentLoaded`. It exposes idempotent
  `window.echCareerInit`; `script.js boot()` calls it at the END of boot (after
  progress load + cloud reconcile).
- **Why it matters:** module eval order is missions → career-sim → script, all
  before `DOMContentLoaded`. So `let CAREER = loadCareerState()` at career-sim
  module-eval runs BEFORE script.js has loaded `ech.progress.v1`. The career state
  MUST be re-hydrated from `progress.career` inside `echCareerInit`/`simInit` (not
  trusted from module-eval), or the resource bar shows defaults instead of the save.

## Screen bridges
- Enter/exit the career interior through `window.echEnterCareerScreen` /
  `window.echExitCareerScreen` (defined in script.js). Exit routes through
  `showModuleLanding()` so the home re-renders via `renderOperationsCenter()` (the
  standing rule: every `#moduleLanding` reveal must re-render or it shows stale
  progress).
- career-sim keeps a fallback that toggles `#opsCenter`/`#careerOps` directly when
  the bridge is absent, so the module still runs standalone (tests/prototype).
- The `#careerOps` DOM scaffold is static in shipping `index.html` (career-sim
  populates the panels). Its global keydown/reset handlers were made null-safe via a
  `careerScreenOpen()` helper so a missing `#careerOps` can't throw.
- Hybrid intent: the shipping site header + footer stay visible above/below the
  career interior (do NOT full-screen it like the prototype did).

## CSS token sharing (saves re-investigation)
- `career-sim.css` (like all prototype-graduated CSS) uses the UNPREFIXED prototype
  palette (`--bg`, `--cyan`, `--green`, `--radius-*`, `--font-*`, …). Shipping's own
  `style.css` uses `--color-*` prefixed tokens — a mismatch you'd expect to require
  an alias block. It does NOT: `lab.css` (also graduated from the prototype) already
  defines the FULL unprefixed palette on `:root` globally and is loaded in shipping,
  so `career-sim.css` resolves every var for free. Any future prototype-graduated
  CSS inherits the palette via `lab.css` — don't add `--color-*` alias shims.

## Persistence (local-first, via the chokepoint)
- Career state lives in an additive `career` namespace inside `ech.progress.v1`,
  read/written ONLY through script.js bridges that call `saveProgress()` (the single
  chokepoint that also enqueues the best-effort Supabase mirror). career-sim's own
  `ocp.career.v1` localStorage key is replaced by these bridges in shipping (kept as
  a standalone fallback only).
- Old saves with no `career` key must load fine (career-sim applies defensive
  defaults when the raw sub-object is missing).

## Home chrome — resource bar + identity card (presentation-only)
- Two empty host elements in `index.html`: `<div class="sim-resbar">` at the top of
  `#moduleLanding` (above the OCV2 header) and `<div class="oc-identity"
  id="ocIdentity">` as the first child of `.ocv2-panel--right`. Both are filled at
  every home re-render: `renderOperationsCenter()` calls `renderIdentityPanel()` and
  the guarded bridge `window.echCareerRenderResourceBar?.()` right after `if(!home)return;`.
- The resource bar is rendered BY career-sim (`renderResourceBar`, exposed as
  `window.echCareerRenderResourceBar`); the identity card is rendered host-native by
  `renderIdentityPanel()` in script.js from a static `CYBERCORP_IDENTITY` const +
  `deriveCareerState()` + `MISSION_PLAY_ORDER`. Both ONLY touch DOM — no
  `saveProgress`/XP/unlock/cloud writes. Escape all dynamic strings (`escapeHtml`).
- Calling the resbar bridge before `echCareerInit()` may briefly paint module-eval
  default resources, but `echCareerInit()` rehydrates + rerenders immediately on
  boot and mission/deep-link launches init first — no final stale-state bug.

## Flexbox overlap gotcha (reusable)
- A flex child with `justify-content:flex-end` + `min-width:0` can shrink BELOW its
  content and overflow LEFT, painting over earlier siblings (symptom here: the
  authority list spilled over the first meter so "72" read as "12").
- **Fix:** pin the value cluster with `flex:0 0 auto; margin-left:auto` (so it never
  shrinks and stays right) and let the text block absorb the squeeze with
  `flex:0 1 auto; min-width:0; overflow:hidden`. `.sim-resbar-*` classes are shared
  by the home AND the mission interior, so the fix covers both.

## Role-source divergence (known, deferred — architect-noted)
- Identity card role/clearance/advancement DERIVE from host completion state
  (`deriveCareerState()` + completed-mission count — the authoritative career
  ladder). The resource-bar role comes from career-sim's `CAREER.currentRole`, which
  is promotion-DEFERRED (bumped only when its in-module promotion notice resolves).
- **Consequence:** after completions the two role labels can diverge until the
  career-sim promotion notice catches up. Left as-is in the chrome phase (faithful to
  the prototype's deferred-promotion UX); unify the role source if cross-chrome
  rank consistency is later required.
