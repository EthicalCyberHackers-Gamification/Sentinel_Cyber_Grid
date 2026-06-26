---
name: Annotated command Readout (M2 "tells")
description: Mission-2-only presentation layer that highlights output "tells" and consolidates the ▸/? lines into one coached Analyst Readout card.
---

# Annotated command Readout — "The Readout" (career-sim command-model missions)

Presentation-only layer gated strictly on a per-mission def flag
`annotatedReadout: true` (set ONLY on the mission-002 def). When on,
`runCommandEntry` lights up authored `tells` substrings inside the raw terminal
output and replaces the scattered `▸observation`/`?question` lines with one
`renderReadoutNote(c)` card (kicker + observation + question + on-demand 3-tier
"Why does this matter?" depth bar reading `evLayers`). When off, output and the
▸/? path are byte-identical to before — that's how M1/M3/M4 stay untouched.

**Tells match RAW pre-escape output text.** `buildTellHtml` is a longest-first
forward-scan tokenizer: it sorts tells by descending `str.length`
(`normalizeTells`), walks the string, and on a match emits `<mark class="sim-tell">`
with `mapEsc(str)` for the matched slice (and `mapEsc` for every non-matched char).
So authored tells must be exact substrings of the literal `output` strings, NOT of
the escaped HTML. `mapEsc` escapes `& < > "` but NOT apostrophe — safe because the
result lands in element text (innerHTML), never inside a single-quoted attribute.

**Why:** the tells layer feeds `simPrintTell` which uses `innerHTML` (vs `simPrint`'s
`textContent`); any dynamic text must go through `mapEsc` or it's an injection path.

**How to apply / gotchas:**
- First tell in each command's array is the "primary" → gets `sim-tell--key` (pulses
  once). Pick the single most-diagnostic token as element 0.
- A future object-form tell `{str, kind}` has its `kind` whitelisted
  (`/^[a-z0-9-]+$/i`) before becoming a CSS class — don't drop that guard.
- Card always renders in readout mode even if a command has no tells (output just
  prints unhighlighted); all M2 commands reveal an evidence id that EXISTS in the M2
  evidence array, so the depth bar always has layers to show.
- Editing per-command data by matching `reveals: ['ev_*']` is NOT always unique
  across missions (e.g. `ev_policy` is shared) — disambiguate with the output line
  above it.
- No scoring/persistence: surfaceEvidence / investigationConfidence / completion
  logic call sequence is unchanged; the helpers only build DOM + toggle attrs.
