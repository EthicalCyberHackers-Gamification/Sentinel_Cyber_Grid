---
name: ECH active-dashboard viewport lock
description: Why mission dashboards clipped content / forced zoom-out during active play, and the rule for fixing layout there.
---

# Active-dashboard viewport lock (Ethical CyberHackers Platform)

In `artifacts/ethical-cyberhackers-platform`, during active play the body gets
`mission-running`. The `body.mission-running .dashboard` override sets
`grid-template-rows: auto 1fr` on a `.dashboard` whose BASE rule already has
`overflow:hidden; min-height:0`. Together these viewport-LOCK the grid and CLIP
anything tall (reasoning prompts, investigation board, decision panel, scorecard,
post-completion Next-Step CTA) — which made students zoom the browser out, shrinking
the terminal and hiding the command input.

**Rule:** any layout work on the active mission dashboards must let the DOCUMENT
scroll during active play (e.g. `body.mission-running .dashboard{overflow:visible;
min-height:auto}`), not trap content inside a fixed-height grid. The `1fr` row's
implicit minimum is `auto`, so short content still fills the viewport while tall
content extends and page-scrolls.

**Why:** the clip is invisible until a mission produces enough stacked content, so it
reads as "the terminal/command line disappeared" rather than "content overflowed".
Bounding the terminal (`.terminal-body` min/max-height with internal scroll) keeps the
command input on-screen instead of being pushed off by long output.

**How to apply:** when touching `style.css` for these dashboards, check the END-of-file
`body.mission-running` blocks first (appended overrides win on ties) and the base
`.dashboard` (overflow:hidden) + `.terminal-body` rules. Keep sticky elements'
ancestors at `overflow:visible` or `position:sticky` silently breaks.
