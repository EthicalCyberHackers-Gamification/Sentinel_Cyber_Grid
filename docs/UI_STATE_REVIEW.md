# UI State Review — Guidance & Floating Controls

A per-assignment checklist of the **action**, **hint**, and **Current Objective**
for each interface state, plus the fixed bottom-right controls and their
no-overlap contract. Use this when adding states or controls so guidance never
points at a missing/hidden/wrong-state control.

> Authoritative source of truth is the code in
> `artifacts/ethical-cyberhackers-platform/script.js` (hints) and `style.css`
> (control layout). This doc summarizes the intended contract.

## Guidance contract

- **Hint == Current Objective.** `setHint` / `setM2Hint` / `setM3Hint` each call
  `setCurrentObjective`, so the hint string and the Current Objective panel always
  show the same text. Never set one without the other.
- **Every hint must name an action that exists in the current state.** Do not name
  a button by a label that changes with state (e.g. the M1 launch button is
  relabeled "Begin Investigation 🔒" while gated behind the Briefing Room).
- **No dead-ends.** A state with no forward command must still point somewhere
  real (scorecard, Operations Map, or the SOC Toolkit reference).

## Assignment 1 — Credential Phishing (`mission-001`)

| State | Action available | Hint / Current Objective |
| --- | --- | --- |
| Awaiting launch, briefing not reviewed | Open the Briefing Room | "Review the mission briefing first, then begin the investigation." |
| Awaiting launch, briefing reviewed | Click the (now unlocked) launch button | "Briefing reviewed — begin the investigation when you're ready." |
| Mission started | Run `pwd` | "Start by checking your current location." |
| Mid-sequence | Run the next command | Per-step `HINTS[key]` (points at the next command) |
| Command loaded into terminal | Press Enter | "Command loaded — press Enter to execute it." |
| Evidence ready | Submit finding | "You found suspicious behavior. Submit your finding to unlock the quiz." |
| Out of sequence | Use highlighted command | "Follow the mission path. Use the highlighted command next." |
| Complete | Review scorecard / next assignment | Completion summary (scorecard is visible below) |

**Note:** the awaiting-launch hint is computed by `m1AwaitingHint()` so it always
matches the Briefing Room gate state.

## Assignment 2 — Network Exposure Review (`mission-002`)

| State | Action available | Hint / Current Objective |
| --- | --- | --- |
| Briefing overview | Review briefing, then begin | Briefing screen copy (not the dashboard hint panel) |
| Mission started | Run first recon command | First in-mission `setM2Hint(...)` |
| Command loaded into terminal | Press Enter | "Command loaded — press Enter to execute it." |
| Analyst Review required | Answer the review question | `nextHint` ("…answer the Analyst Review below to make your call.") |
| Complete | Review scorecard | Completion `setM2Hint(...)` |

## Assignment 3 — Reconnaissance Detection (`mission-003`)

| State | Action available | Hint / Current Objective |
| --- | --- | --- |
| Briefing overview | Review briefing, then begin | Briefing screen copy (not the dashboard hint panel) |
| Mission started | Run first command | First in-mission `setM3Hint(...)` |
| Command loaded into terminal | Press Enter | "Command loaded — press Enter to execute it." |
| Analyst Review required | Answer the review question | `nextHint` ("…answer the Analyst Review below to make your call.") |
| Complete | Review scorecard | Completion `setM3Hint(...)` |

The "Command loaded — press Enter" guidance is emitted by the single
`loadCommandToTerminal()` chokepoint, which all three missions use when a command
card is clicked, so the behavior is identical across A1–A3.

## Fixed bottom-right floating controls

All are `position: fixed`, right-aligned, and stacked vertically so none overlap
and all stay clickable. The Music toggle anchors the very bottom of the corner.

| Control | Selector | Bottom (default) | Bottom (mission active) | z-index |
| --- | --- | --- | --- | --- |
| Music toggle | `.soundtrack-toggle` | 16px | 16px (56px on ≤900px) | 9999 |
| Focus / Exit bar | `.focus-control-bar` | hidden | 62px | 1200 |
| SOC Toolkit toggle | `.soc-toolkit-toggle` | 62px | 116px | 1250 |

- **Focus/Exit bar** is `display:none` unless `body.mission-running`, so on the
  Operations Center / non-mission screens only Music (16px) and the SOC Toolkit
  (62px) are present.
- During a mission the stack is Music (16px) → Focus bar (62px) → SOC Toolkit
  (116px), each ~34px tall with clearance between.
- The **SOC Toolkit panel/backdrop** sit at z-index 10001 / 10000 — above the
  always-on-top Music toggle (9999) — so an open panel is never pierced by the
  Music button.
- The scripted demo (`body.demo-active`) hides Music, the Focus bar, and the SOC
  Toolkit so they can't intercept the demo coach.

### Overlap checklist when adding a bottom-right control

1. Does it overlap Music (16px) at normal zoom? Stack it above instead.
2. Does it appear during missions? Account for the Focus bar at 62px.
3. Is its z-index below the Music toggle (9999)? If it must cover Music (e.g. a
   modal/backdrop), use ≥10000.
4. Re-check ≤900px (Focus bar goes full-width) and ≤640px (SOC Toolkit panel goes
   near-fullscreen).
