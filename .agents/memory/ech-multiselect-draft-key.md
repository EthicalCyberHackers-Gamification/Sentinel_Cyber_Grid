---
name: Multi-select draft key
description: career-sim SIM.discoveryDrafts (multi-select "flag everything" beat) keys by challenge STRING id, not the object — passing ch silently fails with no throw.
---

The multi-select discovery beat (Mission 1 `ch_manifest`, "flag everything too
sensitive to ship") stores its transient draft in
`SIM.discoveryDrafts[challengeId][step]`, keyed by the challenge **string id**
(e.g. `"ch_manifest"`).

`toggleDiscoveryDraft(challengeId, ...)` (the write) and the rendered chips
(`data-challenge="${ch.id}"`) both use the string id. But
`discoveryStepHtml(ch, step, label)` receives the challenge **object**. Its
`cfg.multi` branch must read the draft via `discoveryDraft(ch.id, step)`.

**Why:** passing the object — `discoveryDraft(ch, step)` — keys
`SIM.discoveryDrafts[<object>]`, which JS coerces to the literal string
`"[object Object]"`. That never matches the write key and never throws, so the
read silently returns `[]`. Symptom: chips never gain `is-on`, the SEND button's
count stays 0 (disabled), and the player is hard-stuck with NO console error.
The draft itself updates fine — only the render read is blind. This is what made
the bug so confusing: instrumentation showed the draft array growing correctly
and `renderEvidencePanel()` returning "OK", yet the UI never reflected it.

**How to apply:** any read/write of `SIM.discoveryDrafts` must use the string
`ch.id`, never the challenge object. Whenever a render helper takes the full
challenge object but a storage helper takes the id, this object-vs-id slip fails
silently — verify the actual KEY used, not just that "the render ran without
throwing".
