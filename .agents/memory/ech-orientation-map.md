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

`labOrientPulse` emits ONE travelling dot per call (animation budget — a busy map of
two-way streams was too noisy/heavy):
- `calm` / `benign` (normal traffic): a single REQUEST-direction dot (`a → b`).
- `watch` (suspect, pre-confirmation): a single ONE-WAY INBOUND dot (`b → a`).
- `alert` (confirmed probing): TWO staggered inbound dots (`b → a`, second delayed
  ~0.4·dur) so it reads as bursty repeated contact.
**Why:** to a beginner, unsolicited inbound contact reads as "someone is reaching IN at
us," which is the lesson; normal traffic flows outward as a request. Capping to a single
dot (alert excepted) keeps the SMIL load sane.
**How to apply:** the suspicious link's endpoints are ordered workstation-first /
source-second so inbound = `b → a`. Keep that ordering if you add probing links. Tier
also drives `dur` (alert fastest, benign slowest); `slowMo` multiplies `dur` ×2.6.

## Finite trust ladder

States: internal / service / external / knowngood / unverified / offbaseline /
suspicious / watched / monitored. There are more investigation tools than
intermediate states, so not every tool can yield a unique trust color — give some
tools non-trust visuals instead (the ports badge, grep `emphasizeSuspect`) and
reserve trust bumps for steps that should escalate.

## Invariant

Every orientation-map function reads/writes only `LAB.orient` + DOM — never XP,
persist, score, pin, or advance.
