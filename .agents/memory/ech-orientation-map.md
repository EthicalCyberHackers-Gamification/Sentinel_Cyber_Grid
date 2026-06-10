---
name: Orientation network map (Assignment 000)
description: How the presentation-only SOC network map for ?lab=mission-000 is gated, and why traffic-tier color is coupled to source trust.
---

The Assignment 000 orientation lab (`?lab=mission-000`) renders a beginner-readable,
zone-based SOC network map (4 trust zones, identity-rich nodes, animated traffic)
instead of the graded missions' file-grid ↔ topo surface.

## Gating (never branch on a mission id)

- `labIsOrientation()` keys on `def.report.choices` (only this dataset has it), AND
  the map needs `def.topo.zones` / `def.topo.mapReact`.
- `labRenderTopo()` dispatches to the orientation renderer only when both hold; the
  six graded missions fall through to the untouched `.lab-node` / `.lab-link` path.
- Scoped CSS only: `.lab-zone*` / `.lab-onode*` / `.lab-flow*` / `.lab-pulse*`.

The orientation map renders from stage 1 (orientation hides the file grid),
independent of the graded `stage>=3` files↔topo swap. Updates are driven by
`labOrientReact(event)` → `labOrientApply` (writes only in-memory `LAB.orient`),
not by the stage gate.

## Gotcha — whois/baseline timing controls when traffic turns red

A `traffic:'suspicious'` link is drawn orange (`watch`) by default and red (`alert`)
the moment `trust.source ∈ {offbaseline, suspicious, watched}`. So whichever
`mapReact` step first pushes the source to `offbaseline` is what flips the suspect's
traffic red.
**Why:** moving that escalation between steps (e.g. whois vs baseline) silently moves
the alarm earlier/later in the lesson even though nothing else changed.
**How to apply:** decide which investigation step should "trip" the red alarm, and put
the first `offbaseline` (or higher) source-trust there.

## Traffic directionality teaches "normal vs probing"

Normal/benign traffic (`calm` tier) animates TWO-WAY (request + response). Irregular
probing — a `traffic:'suspicious'` link — animates ONE-WAY INBOUND (source →
workstation) at BOTH the `watch` and `alert` tiers; only `calm` is two-way.
**Why:** to a beginner, unsolicited one-directional inbound contact reads as "someone
is reaching IN at us," which is the whole point of the lesson; making watch two-way
would blur normal vs probing.
**How to apply:** `labOrientPulse` keys direction on tier, and the suspicious link's
endpoints are ordered workstation-first/source-second so inbound = `b → a`. Keep that
ordering if you add probing links.

## Finite trust ladder

States: internal / service / external / knowngood / unverified / offbaseline /
suspicious / watched / monitored. There are more investigation tools than
intermediate states, so not every tool can yield a unique trust color — give some
tools non-trust visuals instead (the ports badge, grep `emphasizeSuspect`) and
reserve trust bumps for steps that should escalate.

## Invariant

Every orientation-map function reads/writes only `LAB.orient` + DOM — never XP,
persist, score, pin, or advance.
