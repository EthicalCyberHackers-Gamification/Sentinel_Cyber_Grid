---
name: Lab file-command coaching bypasses labGuide
description: Why auto-coaching after ls/cat/grep in the terminal lab must be wired in labFileCmd, not labGuide
---

In the progressive lab (`lab.js`), typed `ls`/`cat`/`less`/`grep` route to
`labFileCmd` and **return without ever calling `labGuide()`**. Only tool/pin
dispatch (`labDispatch`, `labPin`/`labPinCmd`) calls `labGuide()` at the end.

**Why:** that asymmetry is exactly why "after `ls` nothing prints" — `labGuide`
(and its beginner variant `labGuideV2`) only ever fire on the tool/pin path, so
any guidance that should follow a stage-1 file command has no hook unless you add
it inside `labFileCmd`.

**How to apply:** to coach/explain after a file command, call your coach at the
end of each of the `ls`/`cat`/`grep` branches in `labFileCmd` (gate it so it
only runs where intended). For tool/pin steps, hooking `labGuide` is enough.

The orientation tutorial (Assignment 000) is the live example: `labOrientationCoach()`
names the exact next command at every step, is called from BOTH the file-command
branches and the top of `labGuide`, and is gated on `labIsOrientation()`
(true only when `def.report.choices` is an array — i.e. mission-000 only), so the
six graded assignments and 001/002's command-free `labGuideV2` are untouched.
Command strings come from `def.tools[].cmd` (single source of truth); only plain
wording lives in `def.coach`. Presentation-only: never writes XP/progress/persist.
