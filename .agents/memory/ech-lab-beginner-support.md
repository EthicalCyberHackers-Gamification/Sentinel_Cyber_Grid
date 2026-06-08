---
name: Early-beginner lab support model (001 & 002)
description: The per-mission gate and invariants for the lab's investigation-support UI (suspicion/question panel, analyst feedback, command-free coaching).
---

# Early-beginner support model (lab)

A per-mission support tier that reframes the lab from "follow the command list" to
"answer the investigative question." Gated by a `support: { beginner: true }` block
on a mission's `lab.js` dataset, read through the single helper `labSupportV2()`.

**Why:** beginners blind-follow an ordered command dock instead of reasoning. The
tier hides the dock's command list and surfaces suspicion/question + post-command
analyst feedback instead. Currently on for 001/002 only.

**How to apply / invariants:**
- Branch every beginner-tier behavior on `labSupportV2()`, NEVER on a mission id —
  the gate is the flag, so it stays reversible and per-mission. (Adding the flag to
  another dataset is all it takes to opt that mission in.)
- The tier is presentation-only: it must not touch scoring/XP/persistence/stage
  transitions/evidence/maps/CyberCorp identity/containment/progression/command
  parser. If a beginner-tier idea needs any of those, it does not belong here.
- The HINT ladder is the ONLY path to a literal command in this tier — the
  auto-coach and objective bar must never name a command/tool unsolicited.
- `framing[stage]` is now consumed in three places (stage-entry terminal print, the
  persistent support panel, and the objective bar). Panel + print overlap is
  intentional (panel persists, print scrolls away) — do not "dedupe" it.

INTERMEDIATE/ADVANCED tiers are future direction only (see `docs/ui-guidelines.md`);
they would extend the same `support` block with a `tier` field rather than new flags.
