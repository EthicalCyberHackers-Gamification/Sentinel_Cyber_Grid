# Replay Guide control (Task #5)

A small, calm **Replay Guide** button on each of the three mission dashboards
re-runs the Milestone 25B spotlight walkthrough for that assignment on demand.
Players who skipped or forgot the live, first-run guided tour can re-watch the
orientation at any time. The replay is **strictly UI-only**: it awards nothing,
changes no gameplay state, and writes nothing to the backend (one optional,
non-functional UI flag is the only permitted write).

## How it works

The 25B tour is not a single sequence function — its four phases live in
`IG_PHASES` (`commands → files → board → decision`) and normally fire reactively
during a live run, gated by `if (igEnabled) igShow(...)`.

The Replay Guide is a **self-contained sequencer** that reuses those phases'
copy/targets and the exact 25B visuals (`.ig-dim`, `.ig-spotlight-target`,
`.ig-coach`) but keeps **its own state**, separate from the live `igEnabled` /
`igShow` path so the two can never overlap:

- `startReplayGuide(missionId)` builds a plan of the phases whose targets are
  currently on screen (in the fixed 25B order), then walks them one at a time.
- Each step renders its own dim layer (`#rgDim`) and coach card (`#rgCoach`,
  positioned by the shared `positionCoach`) with a step counter and
  **Close** / **Next** (the last step's button reads **Done**).
- `rgVisibleTarget()` mirrors `igShow`'s `offsetParent === null` guard, so any
  phase whose target is missing or hidden is **skipped safely** — no dim layer
  is ever left stuck and clicks are never trapped (the dim is
  `pointer-events: none`).
- Cancellation: the **Close** button or the **Escape** key tears the replay down
  immediately via `endReplayGuide()`, leaving the dashboard exactly as it was.

### Independence from the live tour

- The replay **never flips `igEnabled`**, so a real gameplay action during a
  mid-mission replay cannot trigger a duplicate live spotlight.
- `igShow()` has a `if (rgActive) return;` guard: while a replay is on screen,
  any reactive live spotlight is cosmetically suppressed (this changes no
  gameplay state and does not touch `igEnabled`).
- `endGuidedRun()` (the central mission-exit teardown hub) also calls
  `endReplayGuide()`, so navigating away mid-replay can never leave a stuck dim.

## Button placement (per mission)

The button sits in the **Current Objective** header (`.objective-head`), grouped
with the existing "Jump to Next Action" button inside a new
`.objective-head-actions` wrapper. It is styled as a quiet/secondary control
(muted until hover) so it never competes with the cyan Jump button.

| Assignment | Objective card id     | Button id            |
| ---------- | --------------------- | -------------------- |
| 1          | `#currentObjective`   | `#replayGuideBtn`    |
| 2          | `#m2CurrentObjective` | `#m2ReplayGuideBtn`  |
| 3          | `#m3CurrentObjective` | `#m3ReplayGuideBtn`  |

It is a real `<button>` with a `title`, keyboard-focusable, with a visible
`:focus-visible` outline. It does not overlap the Music toggle, SOC Toolkit,
Exit, backend status pill, or the terminal input (it lives inside the command
panel's Current Objective card).

## Safety guarantees (what is guaranteed NOT to change)

- **No XP / score / attempts / evidence / command unlocks.** The sequencer only
  reads `IG_PHASES` targets and renders cosmetic overlays.
- **No Supabase / backend writes.** No sync or analytics call is made.
- **No progress localStorage mutation.** `ech.progress.v1` is never touched.
  The only write is an optional, best-effort, non-functional UI flag
  (`ech.replayGuideUsed.v1`), wrapped in `try/catch` so it can never throw or
  affect gameplay.
- **No interference with the live first-run tour** (see "Independence" above).
- **No trapped clicks / stuck overlays** — the dim is `pointer-events: none` and
  every exit path runs `endReplayGuide()`.

## Test matrix

For **each** of Assignments 1–3, in **each** state below, verify: the Replay
Guide button appears; clicking it launches the spotlight sequence; **Next**
advances and **Close**/**Escape** dismisses; the dashboard is left unchanged;
and there is no XP/score/attempt/evidence change, zero Supabase writes
(Network panel), and no console errors. Confirm `localStorage` is unchanged
apart from the optional `ech.replayGuideUsed.v1` flag.

| State            | Expected                                                                 |
| ---------------- | ------------------------------------------------------------------------ |
| Fresh            | Button visible; replay shows the phases whose targets are on screen.     |
| Mid-mission      | Replay shows currently-available phases (e.g. files unlocked); skips any hidden target. |
| After completion | Replay still runs over whatever targets remain visible; no re-completion side-effects. |
| After reload     | Button present and functional after a page refresh (resume path).        |

Edge cases:

- **No visible targets** → the sequencer ends cleanly with no overlay (the
  Current Objective card is essentially always visible, so at least the
  `commands` step normally shows).
- **Escape mid-step** and **Close mid-step** → immediate clean teardown.
- **Navigating away (map / overview / back / reset) mid-replay** → torn down via
  `endGuidedRun()`.

## Known limitations

- The replay only spotlights phases whose **targets are currently on screen**.
  Phases for not-yet-unlocked tools (e.g. the file-inspection commands before
  they unlock) are skipped rather than forced into view — this is intentional so
  the replay never fabricates UI state.
- It replays the calm 25B **spotlight** tour only. It does **not** replay the
  Mission Briefing Room cards or the opt-in M1 "Watch Demo" automated
  walkthrough (separate systems, out of scope).
- The optional `ech.replayGuideUsed.v1` flag is currently informational only and
  drives no behavior.

## Relevant code

- `artifacts/ethical-cyberhackers-platform/script.js` — replay sequencer
  (`RG_PHASE_ORDER`, `startReplayGuide`, `rgShowStep`, `rgRender`, `rgAdvance`,
  `rgTeardownVisual`, `endReplayGuide`), the `igShow` overlap guard, the
  `endGuidedRun` teardown hook, and the button wiring in init.
- `artifacts/ethical-cyberhackers-platform/index.html` — the `.replay-guide-btn`
  markup in each mission's `.objective-head`.
- `artifacts/ethical-cyberhackers-platform/style.css` — `.objective-head-actions`,
  `.replay-guide-btn`, and the `.rg-coach-*` footer styles.
