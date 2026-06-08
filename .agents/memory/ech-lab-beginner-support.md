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
analyst feedback instead. On for internal mission-001, mission-002, and mission-003.

**Player label ≠ internal id (important):** the "Lab NNN" shown to players does NOT
match the internal `mission-NNN` id. Reconnaissance Detection is internal
`mission-003` but is shown as **Lab 001** — it is the FIRST assignment players
actually play. Map: Lab001=mission-003, Lab002=mission-006, Lab003=mission-001,
Lab004=mission-005, Lab005=mission-004, Lab006=mission-002. A prior pass applied
this tier to the wrong (locked) missions by trusting the id. Confirm against the
play-order label before editing. (replit.md's "mission-002 = Network Exposure" is
STALE — lab.js says mission-002 is Lateral Movement.)

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

INTERMEDIATE/ADVANCED tiers are future direction only; they would extend the same
`support` block with a `tier` field rather than new flags. (Note: there is no
`docs/ui-guidelines.md` in this artifact — docs live in `docs/MISSION_ENGINE_GUIDE.md`,
`docs/PHASE_A_BASELINE.md`, `docs/README.md`.)
