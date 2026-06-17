---
name: Command-brief tool keying (Guided Terminal)
description: Why the career-sim "new tool" command brief keys on the TYPED verb, not the command entry's canonical match[0].
---

# Command-brief tool keying (Guided Terminal)

The career-sim "command brief" (a Sarah-voiced overlay shown once before the
first use of a NEW terminal tool) keys both its CMD_BRIEF_LIBRARY lookup and its
persistence flag on the **typed** command's leading verb — NOT the matched
`def.commands[]` entry's `match[0]`.

**Why:** a single command entry can list aliases that belong to *different*
tools, e.g. `match: ['tail network_events.log', 'cat network_events.log', …]`.
`cat`/`less` are taught back in Mission 1; `tail` is the new tool. Keying on
`match[0]` ('tail') would fire the `tail` brief even when the player typed
`cat`, teaching the wrong tool. Keying on the typed verb fires the `tail` brief
only when they actually type `tail`, and stays silent for `cat`/`less` (known
verbs, absent from the library).

**How to apply:**
- Thread the raw typed command in: `maybeShowCommandBrief(c, typedCmd)`;
  `briefToolKey(typedCmd) = normalizeCmd(typedCmd).split(' ')[0]`.
- Persist via `setMissionFlag('cmdBrief:'+toolKey)` — outside CANON_FLAGS, so it
  is presentation-only and never feeds carry-flag / dynamicConditions logic.
- Gate on `def.commandBriefs` (a mission flag), never a mission id.
- Fade by rank: `activeRole().authorityLevel > COMMAND_BRIEF_MAX_LEVEL`; a
  rank-suppressed brief must NOT be marked seen (a junior re-run still teaches).
- One chokepoint `closeCommandBrief()` runs the stashed command on EVERY
  dismissal path (Run it / ✕ / backdrop / Esc) so a typed command is never
  dropped, and refocuses #simTermInput only if no concept/map overlay took over.
- Sits BEHIND the Decision Dock: `maybeShowCommandBrief` runs after
  `decisionLocked()` in simRunCommand, so a brief never pre-empts a pending call.
