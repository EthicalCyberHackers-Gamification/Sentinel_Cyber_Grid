# UI / UX Guidelines

Interface, layout, and styling decisions. See [architecture.md](./architecture.md)
for the underlying systems and [missions.md](./missions.md) for mission flow.

## Design language

Dark / cyber aesthetic driven by CSS custom-property tokens (colors, spacing,
radii, fonts — `--color-*`, `--gap-*`, `--radius-*`, `--font-mono`). New styling
should reuse these tokens, not hard-coded values.

## CSS conventions (important)

- **Append active-mission overrides at the END of `style.css`** — many rules rely
  on source-order winning specificity ties over the base rules.
- When a late rule interacts with the responsive blocks (e.g.
  `grid-template-rows`), **re-assert the responsive value inside the new media
  query**, or the late desktop rule clobbers the stacked mobile/tablet layout.
- Every animation block ships with a `prefers-reduced-motion` override.

## Active-mission dashboard layout

The dashboard reflows during active play (`body.mission-running`). The current
design is the **3-column "mission-control workstation" (Milestone 25E)**, reusing
the same three grid children for all missions (ids preserved so render fns are
unchanged):

- **LEFT `.mission-panel`** — "Mission Control": a large vertical route map
  (the active node pulses), plus collapsible briefing / progress / course-progress
  drawers.
- **CENTER `.center-column`** — the terminal + command buttons, with the sticky
  Current Objective on top. Kept dominant; inline hint/task-brief panels are hidden
  during play (the Current Objective supersedes them).
- **RIGHT `.xp-panel` / `.live-status`** — "Live Status": dual-purpose. Pre-mission
  it shows the agent profile; during play it shows alert center, threat/trust/
  confidence meters, the Investigation Board, the Red Team panel, and
  Evidence/Tools drawers. Toggled by `body.mission-running` (with a focus-mode
  override so it stays visible).

Responsive: desktop 3-col; tablet (≤1100px) Mission Control spans full width on
top; mobile (≤700px) single column ordered terminal → mission control → live
status. (Earlier 70/30 split-screen 25D and 25C map work were superseded by 25E.)

### Spatial polish (Milestone 29A)
Additive atmosphere on 25E: a persistent `.ops-strip` (live team/incident/threat/
containment chips + a rotating ambient line, shown only during play), subtle
center glow / cool-left / warm-right washes, and transient region pulses on
escalation/adversary/completion. Reads only from existing state.

## Focus Mode & collapsible cards (Milestone 25A)

`body.focus-mode` hides the agent profile + task brief and collapses
`.focus-collapse` cards; `body.mission-running` shows a floating
`#focusControlBar`. Generic `.collapsible` / `.is-collapsed` cards (delegated
click+keydown via `initCollapsibleCards`) with a CSS chevron. Begin/launch CTAs
stay OUTSIDE `.focus-collapse` so collapsing never hides them.

## Current Objective & Jump to Next Action

`#currentObjective` / `#m2CurrentObjective` / `#m3CurrentObjective` mirror the hint
via `setCurrentObjective`. During play the card is **sticky** at the top of the
center column. A **Jump to Next Action** button (`#jumpNextBtn` / `#m2JumpNextBtn` /
`#m3JumpNextBtn`, inside `.objective-head`) calls the read-only `jumpToNextAction()`
to scroll the lowest visible interactive prompt into view (falls back to the
command grid). See the layout fix below.

## No-zoom layout fix

Students used to have to zoom the browser out to play (which shrank the terminal
and hid the command input). Root cause: `body.mission-running .dashboard` set a
fixed `grid-template-rows: auto 1fr` on a `.dashboard` with `overflow:hidden`,
clipping tall content. **Fix:** during play the dashboard is `overflow:visible;
min-height:auto` so the PAGE scrolls; `.terminal-body` is bounded
(`min-height:260px; max-height:42vh`) with internal output scroll so the command
input is never pushed off-screen; the commands panel is `overflow:visible` so the
sticky objective anchors to the viewport; `@media (max-height:720px)` releases the
terminal cap for high-zoom/short viewports. (Durable rule recorded in agent memory
`ech-active-dashboard-viewport-lock.md`.)

## Terminal behavior

- **Command preview + manual execution (all 3 assignments)**: clicking a command
  card does NOT execute — it LOADS the command text into that assignment's
  terminal input via `loadCommandToTerminal(commandText, inputEl)`; the student
  reviews it and presses **Enter** to run. Cards remain as beginner support; the
  real execution always goes through the terminal input. Helper text under the
  cards reads "Click a command to load it into the terminal, then press Enter to
  run it."
- **One parser per assignment runs both typed and card-loaded commands.** M1 uses
  `runCommand`→`processCommand` (resolves keyless typed text to a key). M2/M3 use
  `submitM2TerminalInput`/`submitM3TerminalInput`, which reverse-map the typed
  text to a command key with `keyForTypedCommand(map, text)` (case/whitespace-
  insensitive against each command's `.cmd`) and then run the existing
  `runM2Command`/`runM3Command` path — so unlock chains, reasoning gates, pins,
  confidence, and persistence are untouched. Unrecognized/edited or still-locked
  commands get friendly in-terminal guidance instead of executing.
- **Terminal inputs**: `#terminalInput` (M1), `#m2TerminalInput`, `#m3TerminalInput`
  — all enabled and student-driven; Enter handlers wired in `initTerminalInput()`.
- **Paced output**: output lines reveal one at a time from a shared queue
  (`TERMINAL_LINE_DELAY`); command echoes are instant. Clicking the terminal
  flushes the queue (skip-to-end).
- **The opt-in M1 demo** still auto-runs: `demoClickCommand` is decoupled from the
  card click and types + runs directly (`typeCommandIntoTerminal` → `runCommand`),
  so the watch-me walkthrough is unaffected by the load-on-click change.

## Alerts, animations, sound

- **Event toasts** sit top-center above the terminal; one major alert at a time;
  per-type durations (`EVENT_TOAST_DURATIONS`).
- **Sound-free fx helpers** (`fxFlash` / `fxToast` / `fxPulse*`) hook XP awards,
  pin classification, trust/threat changes, tool unlocks, and completion.
- **Cinematic interruptions** layer a brief dim/flicker/pulse AROUND major moments
  (never blocking the alert).
- **Background soundtrack**: a looping MP3 (imported via Vite's `@assets` alias),
  started on the first user gesture (`enterModule`), with a floating mute toggle.
  Not a seamless loop — a short break elapses then it restarts.

## Operations Center home (Milestones 32A / 33A)

The entry screen (`#moduleLanding`) is a "CyberCorp Operations Center": a status
strip, a Career Track + Active Assignments column, a Sarah Reyes manager panel + a
living "Live Threat Status" board, and an Analyst Profile (reputation standing,
traits, ratings) + Previous Operations list. `renderOperationsCenter()` (which
calls `renderAnalystProfile()`) is **PRESENTATION-ONLY**, derives everything from
existing state, and must be called on EVERY home-reveal path
(boot/restore/clear/back-nav) or it shows stale progress (agent memory
`ech-landing-render.md`). The living board rows react to mission completion;
`#opsPromoText` and `analystCareerReadiness()` reflect the promotion arc.
