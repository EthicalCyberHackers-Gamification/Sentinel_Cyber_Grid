---
name: CSS append-order vs media queries
description: Why appending a base CSS rule at the end of a stylesheet can silently break earlier responsive @media rules, and how to avoid it.
---

# CSS append-order beats earlier @media breakpoints

When you append a NON-media (base) rule at the END of a large stylesheet that
ALSO sets a property already controlled by earlier `@media` breakpoint rules, the
appended rule wins everywhere (same specificity, later source order) — including
inside the viewport ranges those breakpoints were meant to handle. The responsive
behavior silently regresses.

**Why:** CSS ties win by source order at equal specificity. A later base rule like
`body.mission-running .dashboard { grid-template-rows: auto 1fr; }` overrides an
earlier `@media (max-width:1100px){ ... grid-template-rows:auto; }` because the
base rule is declared later in the file, even though the media query "is more
specific" intuitively (it is not — media queries do not add specificity).

**How to apply:** When appending a base layout/grid override at the end of a
stylesheet (common in this repo's milestone-append convention), also re-assert the
property for each affected breakpoint AFTER the new base rule (e.g. duplicate the
`@media (max-width:1100px)` / `(max-width:700px)` override). Verify tablet/mobile
widths, not just desktop. Seen in the Ethical CyberHackers platform when the ops
strip added a dashboard `grid-template-rows` override that clobbered the stacked
mobile/tablet rows from an earlier milestone.
