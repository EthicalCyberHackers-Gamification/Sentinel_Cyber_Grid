---
name: Live SOC Console interior (sc* prefix)
description: Prototype-only stage-aware investigation engine (terminal + per-incident center stage), parallel to the dormant holotable; routing, stages, and the SVG className gotcha.
---

# Live SOC Console (ops-center-prototype — stage-aware engine, all six missions)

The mission interior in `ops-center-prototype`. Terminal-driven investigation:
`scan → reveal cmds → inspect/classify → contain → outcome`. Started as a
mission-003 vertical slice, then **generalized into a stage-aware engine** that
now serves all six prototype missions (holotable code stays intact but **dormant**
— every mission with a `console:{}` block routes here, and all six have one).

## Stages — `cfg.stage` picks the center surface (default `network`)
- `network` — reactive SVG map (002/003/004/006). `scRenderMap`/`scApplyMapState`,
  driven by nodes/infraLinks/threatLink/benignLink + `flowCmd`/`focusCmd`.
- `mail` — phishing email analyzer (001). `scRenderMail` reads `cfg.mail{mailbox,
  from,fromNote,to,subject,received,body[]` w/ `{link}` token,`link{text,real},
  headers[]{k,v,bad}}`; header/link panels gate on `scRanCmds.has('headers'/'links')`.
- `auth` — sign-in timeline (005). `scRenderAuth` reads `cfg.auth{title,events[]
  {time,account,src,flagBy,sev:'bad'|'ok',result}}`; a row resolves only once
  `scRanCmds.has(ev.flagBy)`, else shows "analyzing…"; contained bad rows → "BLOCKED —".
- Dispatch: `scStageKind`→`scRenderStage`/`scApplyStageState`. Command runner is
  fully data-driven — `scToolFor(word)` matches typed first-word to `cfg.tools[].cmd`;
  dock/help/objectives/containLine all read from cfg, so reveal command **names
  differ per mission**.

## Config-correctness invariants (so contain can unlock)
- Every id in `mission.artifacts` must be covered **exactly once** across the
  `reveal{}` map, or `scAllRevealed()` never satisfies and contain stays locked.
- `intel` tools may declare `needs:'<revealKey>'`; the dock disables until met AND
  typed `intel` is gated in `scCmdIntel` (both paths must agree — fixed an asymmetry
  where typed intel bypassed the gate).

## Conventions
- Prefix `sc*` mirrors the holotable's `ht*` (state, render, overlay, run-token).
  When extending, copy the `ht*` shape — same reset-on-open + run-token discipline.
- Data lives in a `console:{}` block on the mission inside `HOLOTABLE_MISSIONS`.
  It reuses the mission's existing `artifacts`/`decisions`/`takeaway`. The holotable
  ignores this block entirely.
- **Routing switch:** a mission opens the console (not the holotable) iff its
  `HOLOTABLE_MISSIONS[id].console` exists — `console` takes precedence over the
  `holo` deep-link. That single check (and `?console=<id>`) keeps the interiors
  isolated. All six currently have a `console` block, so the holotable is dormant.

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
