---
name: Progressive lab teaching surfaces (hints, explain popups, tool kit)
description: How the Mission-001 training lab (lab.js) teaches — escalating answer-last hints, click-to-explain dock, the SOC Tool Kit modal, and the no-leak rules for both.
---

The progressive Mission-001 lab (`lab.js`, ops-center-prototype, `?lab=mission-001`)
teaches the student through several presentation-only surfaces. None of them may
run a command, mutate lab state, or write localStorage — the prototype is
in-memory only and progression is driven solely by typed terminal commands, file
clicks, and pinning.

## Objective-first framing (the steps live in HINT / Tool Kit, nowhere else)
The intro banner and the always-on objective bar (`LAB_OBJECTIVE`, per stage) must
state the assignment's GOAL and the teachable concept ("a message's wording can
lie, but its technical fingerprints cannot") — never the literal commands. Exact
commands belong only in HINT's final tier and the SOC Tool Kit.
**Why:** spelling out `cat ...`/`grep ...` in the banner/objective bar removes the
"figure it out" moment that makes the lab a teaching tool.
**How to apply:** keep `LAB_OBJECTIVE` and the boot banner command-free; the
input placeholder too ("press HINT if you're stuck", not "try `ls`").

## Gradual hints
A `hint` command + HINT button give context-aware, escalating hints keyed per
sub-goal to a **4-tier** array: orientation (frames the phase goal/approach, no
specifics) → conceptual nudge → directional push (names the tool, not the syntax)
→ exact command. `labHint()` reads `goal.tiers.length` dynamically (renders
"HINT n of N"), so tier counts can vary per sub-goal. The current sub-goal is
derived from live state; the tier escalates one step per call and resets when the
sub-goal changes.

**Rule — do not leak the exact command before the final tier.** Only the LAST tier
may contain a literal runnable command (or `pin all`, `submit report`, etc.).
**Why:** an architect review once failed because non-final tiers listed the exact
command words, collapsing the gradual progression for a beginner.
**How to apply:** never put a string matching a tool's `cmd` into any tier except
the last.

## Click-to-explain dock + SOC Tool Kit
Dock command buttons are teaching-first: clicking opens an explanation popup
(purpose + how-to + a "Load into terminal" button that only fills the input, never
submits). The bottom-of-left-column SOC TOOL KIT button opens a modal listing
every currently-unlocked command (it grows as stages unlock). HINT lives in the
same footer.

**Rule — these surfaces stay presentation-only.** "Load into terminal" sets
`input.value` and focuses; it must never submit or dispatch a run. The kit/explain
content is escaped before being injected as innerHTML (consistently escape every
interpolated name/cmd/purpose, even static ones, so it stays safe if content ever
becomes dynamic).

**Rule — bind backdrop/host listeners ONCE, not per open.** The modal host nodes
persist across opens; only their innerHTML is replaced. Close/load buttons live on
that fresh innerHTML so re-binding them each open is fine, but the backdrop
(host-level) click and the global Esc handler must be bound once at init.
**Why:** an architect review caught a listener leak — re-adding the host `mousedown`
handler on every open accumulated duplicate close handlers over a long session.
**How to apply:** put listeners for persistent nodes in `labInit`; only bind
listeners for freshly-rendered innerHTML inside the per-open render helper.
