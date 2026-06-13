---
name: oc.js home flavor drifts from sim.js missions
description: The prototype Operations Center home authors all its incident/atmosphere data independently of the actual missions, so it silently goes stale when storylines change.
---

# oc.js home flavor is decoupled from sim.js missions

The prototype home Operations Center (`artifacts/ops-center-prototype/oc.js`)
hand-authors its incident cards (`INCIDENTS`) AND every atmospheric layer —
`OP_CONTEXT`, `INITIAL_ALERTS`/`ROLLING_ALERTS`, `INTEL_UPDATES`,
`INITIAL_COMMS`/`ROLLING_COMMS`, `TICKER_IOCS`, `SECURITY_BULLETINS`,
`THREAT_ACTORS`, `WORLD_CONTINUITY` — with **no** link to the real missions in
`sim.js`. Nothing derives from the mission defs.

**Why:** because there is no shared source of truth, changing a mission's
storyline in `sim.js` leaves all of the above describing the *old* storyline.
A partial fix (cards only) leaves the feed/ticker/comms/continuity contradicting
the cards.

**How to apply:** when sim.js mission content changes, sweep *all* of the oc.js
data structures above together, not just the cards. Then grep for cross-card
references where one card/flavor item describes another op by `opId` (e.g. a
MENA card sentence describing what "OPS-001" was) — these are the easiest stale
lines to miss because a card-by-card read won't surface them. A reliable final
check is `rg "OPS-00N"` plus a retired-keyword grep over the home section only
(roughly the top of the file, above the legacy holotable `MISSIONS`).

Out of scope by default: the legacy holotable/console `MISSIONS` interiors
(~lines 780-1230) and the LIVE SOC CONSOLE / lab vertical slice are deep-link
only (`?console=`/`?lab=`) and bypassed by the career nodes, so they can carry an
old storyline without affecting the home.
