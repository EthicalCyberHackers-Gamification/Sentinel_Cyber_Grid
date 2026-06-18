---
name: Terminal per-command output grouping
description: How career-sim terminal output is grouped under a left-accent container, and the invariant for non-command prints.
---

Each typed command's echo + all its result lines are wrapped in one container so a
single GREEN left accent line (CSS `.sim-term-group`) marks the whole unit. The three
terminal appenders route into the open group via a sink resolver; the command runner
opens a fresh group per command.

**Why:** players couldn't tell where one command's output ended and the next began;
the accent (same `border-left` pattern as the Decision Dock / continuity items) gives a
clean visual boundary. Presentation-only — no scoring/persistence/graded-write touched.

**How to apply:**
- The sink resolver must SELF-HEAL: if the open group is detached (by `clear` or a
  re-render), reset the pointer to null and fall back to the terminal root. Auto-scroll
  always targets the terminal root's scrollHeight, never the group.
- Any print that is NOT a typed command must close the group first, or it gets trapped
  inside the previous command's accent box. Known system/non-command sinks: the mission
  intro (reset on mission open), the post-decision "Logged with Sarah" handoff + the
  deferred grep-unlock / completion nudges (in the decision-lock chokepoint, only on the
  unlock/flush EDGES — never the lock edge, or in-command output escapes the group), and
  the action/recommendation submission lines (button clicks, not typed commands).
- Do NOT end the group on every decision-lock render: an in-command read can lock the
  dock mid-output, so closing on the lock edge would split that command's own lines.
- Grouping is terminal-wide (file-model M1 and command-model M2+) since the group opens
  in the shared command runner before dispatch — intended.
- Nesting file lines inside the group is safe for notebook mark-up/selection: those use
  recursive `querySelectorAll` on the terminal + `.closest(...)`, and the offset walker
  is scoped inside `.sim-file-text` — none assume direct children of the terminal root.
