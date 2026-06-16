---
name: Analyst Notebook re-render resets scroll
description: career-sim renderEvidencePanel() rebuilds the whole notebook on every interaction; the scroll container is recreated, so scroll must be captured+restored or the panel snaps to top.
---

# Notebook scroll across re-render

`renderEvidencePanel()` (career-sim.js) replaces `#simEvidence` innerHTML in
full on EVERY interaction (it's called from ~15 sites: every
`setDiscoveryJudgment`, action/recommendation submit, classify, identify,
markup, finding-commit, bet, power use). The actual scroll container is the
inner **`.sim-evidence-body`** (`overflow-y:auto`, `flex:1 1 auto`,
`min-height:0`) — and a freshly-built one starts at `scrollTop:0`.

**Rule:** any path that rebuilds this panel must capture the previous
`.sim-evidence-body.scrollTop` before the rebuild and restore it after, EXCEPT
when you intentionally pull focus to new content (the caseFileNotebook branch
scrolls to the newest pending finding only when evidence COUNT grew).
**Why:** without restore, submitting a comms reply (adds no evidence) snaps the
notebook to the top every time — the user-visible "page jumps to top on submit"
bug.
**How to apply:** the scroll container is keyed by CLASS `.sim-evidence-body` —
there is NO `#simEvidenceBody` id, so `getElementById('simEvidenceBody')` is
always null; use `host.querySelector('.sim-evidence-body')`. `focus()` inside
the panel must pass `{preventScroll:true}` or it re-introduces the jump.
