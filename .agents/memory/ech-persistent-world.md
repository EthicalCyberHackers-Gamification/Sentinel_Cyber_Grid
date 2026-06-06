---
name: Persistent operational world (prototype Phase 3)
description: How CyberCorp's "living world" continuity layer is modeled and the gating rule its mission-link edges must obey.
---

# Persistent operational world (ops-center-prototype)

The prototype's continuity/immersion layer (recurring employees, departments,
recurring adversary infrastructure, security bulletins, mission-to-mission
references) is **authored data surfaced read-only**, keyed on the existing
completed-mission mirror (`getMissionStates()`). It must never write localStorage
or add a persisted store — same invariant as all prototype work.

## Gating rule for mission-connection edges
A continuity edge that says "resembles infrastructure from OPS-XXX" must point to
a mission that is BOTH:
1. **earlier in `NODE_CHAIN`** than the current node, and
2. **the same threat actor/cluster** as the current node.

**Why:** if the linked mission is later in the chain, the reactive link can only
appear after a *later* mission completes (backwards), which defeats the "reward
memory of a prior op" intent. And linking across different actors produces
nonsense attribution (e.g. tying a Cobalt-Strike op back to a FIN-12 phishing op).

**How to apply:** the first op of any actor has no valid predecessor — give it NO
`connects` edge (e.g. APAC is the first Cobalt-Strike op). A small load-time guard
`console.warn`s if any `connects` points to a non-earlier `NODE_CHAIN` index.
