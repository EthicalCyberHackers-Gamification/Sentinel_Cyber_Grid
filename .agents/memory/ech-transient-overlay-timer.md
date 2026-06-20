---
name: Transient overlay timer clobbering
description: Auto-dismiss/transient UI overlays must remove their own captured element, not re-query a shared id, or a newer instance gets killed by an older timer.
---

Transient, auto-dismissing overlays (toasts, cues, coach popups) that schedule
their own removal must act on the *captured element reference* they created
(`el.remove()` after checking `el.parentNode`), NOT a global by-id remove like
`document.getElementById('theId')`.

**Why:** the career-sim "mission complete" toast reuses a single id. If a second
mission completes within the dismiss window, the OLD timer firing a by-id remove
deletes the NEW toast (premature dismissal). Run-token guards alone don't fix it
because the global remove still targets whatever currently holds the id.

**How to apply:** capture `el` + `token = SIM.runToken` at creation; in the
timeout, bail if `!el.parentNode`, else `el.remove()` (token mismatch = stale,
remove just this one). Keep the global by-id helper ONLY for the open/return
cleanup of the *currently active* overlay. Generalizes to any transient overlay
in this codebase (term-load cue, briefing/spotlight layers).
