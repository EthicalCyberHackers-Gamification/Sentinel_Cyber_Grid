---
name: Shared Analyst Notebook render path
description: The career-sim evidence/notebook panel renders for every campaign mission, so new sections must be data-gated off out-of-scope missions
---

# Shared Analyst Notebook render path

`renderEvidencePanel()` (the "Analyst Notebook" panel in career-sim) is the SAME
render path for every campaign mission (M1–M4). Anything you add to it appears in
**all** of them, including Mission 1.

**Why:** a new "Active Investigation" feed was added unconditionally to this panel
and immediately leaked into Mission 1, which was explicitly out of scope ("no
Mission 1 changes"). It passed local checks (node --check / typecheck / unit tests)
but was caught in code review.

**How to apply:** gate any new notebook section behind a per-mission dataset flag on
`SIM.def` (e.g. `investigationFeed: true` on the M2–M4 defs) and have the section's
HTML builder return `''` when the flag is absent. Do NOT branch on a mission id, and
do NOT render the section unconditionally. Leaving the out-of-scope mission's dataset
untouched keeps its panel visibly identical. Detect cross-section state (e.g. a
"notebook updated" notice) once at this render chokepoint, not inside the HTML
builders, and make that detection a no-op when the flag is off.

**Full restructure (not just one section):** when one mission needs a wholly
different notebook (e.g. a `caseFileNotebook` flag swapping the panel for a
FACT/ASSESSMENT/REASON/UNKNOWNS/RECOMMENDATIONS case file + graded challenge cards),
branch at the TOP of `renderEvidencePanel()` on the flag and `host.innerHTML = …;
return;` with its own composition. Out-of-scope missions never reach the new code and
their shared tail is literally untouched — safer than threading conditionals through
the shared composition. Any sibling state writer (e.g. `setDiscoveryJudgment`) must
itself stay gated: resolve only defined items, require the triggering evidence to be
surfaced, validate input, and lock after the first write.

## Two-step Analyst Judgment Engine (now all four Intern missions)

All four Intern missions (`mission-001`..`004`) now set `caseFileNotebook: true`, so
every campaign mission branches into the case-file render path; the legacy notebook +
`evidence.reflection` tail is now DORMANT (reached by nothing in the campaign, not
deleted). The framing above of "M1-only / out-of-scope missions untouched" is historical.

Each `discoveryChallenges[]` entry is a TWO-STEP loop:
`{ id, evidenceId, short, weight, observation:{prompt,correct,options:[{id,label,feedback}]},
justification:{…} }`. The justification step renders (and is answerable) only AFTER the
observation is recorded; each step locks after its first pick. Challenges tie to
EXISTING evidence ids only — do not invent evidence. Feedback strings are distinct
per option and in-voice (Sarah Reyes), never a bare "Correct."

**Grading is half-credit per step** (`judgmentQualityOver` splits each challenge's
weight across the two steps). The critical invariant: `judgmentQualityVisible/All`
MUST return `null` when there are no valid challenges, so missions without challenges
(and the live meter before any finding surfaces) fall back to evidence-only
confidence/scoring. That null-fallback is what keeps the blend (0.75 evidence / 0.25
judgment) and the final score (`q*25 + accuracy*22 + jq*13`) reaching "Approved" on a
perfect run — grading is purely ADDITIVE, it never hard-blocks.

**Sole-writer order matters:** in `setDiscoveryJudgment` validate the option id (and the
per-step lock) BEFORE allocating `SIM.discoveryJudgments[id] = {}`, or invalid synthetic
events leave a stray empty object in state. No terminal hard-lock — only board/feed/
notebook surfaces gate on surfaced evidence; the terminal is always usable.

## Notebook attention/feedback cues (presentation-only)

The case-file notebook updates silently when a command surfaces evidence, so an
attention layer bridges terminal→notebook. Two non-obvious invariants:

- **Detect "what changed" by diffing transient trackers inside the render chokepoint,
  and reset them on mission open.** `renderEvidencePanel()` compares `SIM.evidence.size`
  and the live confidence against `SIM.nbEvidenceCount` / `SIM.nbConfidence` to fire a
  body-flash + auto-scroll and a meter-flash. **Why:** `surfaceEvidence()` does NOT
  render — command handlers render once after surfacing, so growth is only observable as
  a delta at the render call. These trackers MUST be reset in `openCareerMission()` or
  the flash/badge leaks across opens/replay (false-fires on a fresh open).
- **The terminal cue diffs evidence count before/after in BOTH command paths** —
  `simCmdRead` (M1 file/`cat` model) and `runCommandEntry` (M2–M4 command model) — and
  only prints when the count actually grows, so reruns/duplicate reveals don't double-fire.
  Gate the whole layer on `caseFileNotebook` so non-case-file missions are untouched.
- Auto-scroll is container-only (`.sim-evidence-body.scrollTo`, guarded) targeting the
  pending card for `newestEvidence()` (`data-ev` on the card), never the page; honour
  `prefers-reduced-motion` for scroll behaviour + pulse/flash animations.

## Notebook content-type visual identity (presentation-only)

Notebook type-identity/readability is driven by SHARED CSS modifier classes, not
per-mission code: `.sim-notebook-head--{evidence|risks|facts|hyp|questions|recs|
identify|response|judgment}` give each header a per-type accent + glyph
(`content:var(--nb-icon)`) + divider, and evidence cards weight by tier via
`.sim-ev-item--{key|notable|minor}` derived from the SAME `qualityWeight` expression
that prints the KEY/NOTABLE/MINOR label (so card weight can't drift from the label).

**Gotcha:** for the shipping Intern missions (all `caseFileNotebook`), the content
types the player must distinguish — facts / assessment / reasoning / unknowns /
recommendations — live INSIDE the CASE FILE block as `.sim-casefile-row--{fact|assess|
reason|unknown|rec}` rows, NOT as the standard-path FACTS/HYP/QUESTIONS/RECS sections
(those are dormant — see above). So readability/styling work on those content types
must target the case-file rows; the `.sim-notebook-head--{facts,hyp,…}` header types
only render on a (currently unused) standard-path mission.

**How to apply:** keep type identity in shared classes so both notebook paths benefit;
add no new animation in this layer (the reduced-motion media query precedes it); the
section left-rule uses `:has()` purely as enhancement, with the base border as fallback.

## Byte-for-byte invariant for unflagged missions

When a sub-variant of a render path is gated on a per-mission flag (e.g. a "simple
first-day" layout via `uiComplexityLevel:'simple'`), the UNFLAGGED branch must emit
the ORIGINAL template **verbatim** — write `if (flag) { newTemplate } else { original
template literally }`, never funnel both through a shared `${bodyInner}` interpolation.

**Why:** interpolating a shared body fragment at an indentation level injects extra
whitespace text nodes into the unflagged output, so the innerHTML is no longer
byte-identical to before. It renders the same visually, but it fails a stated
"unchanged missions render byte-for-byte" invariant and was flagged in code review.

**How to apply:** capture scroll/`prevBody` BEFORE the if/else, run shared tail
(`applyNotebookChrome`, grew-flash, dock sync) AFTER it; only the `host.innerHTML`
assignment differs per branch. Also: a flag-gated "simple" variant should hide
consequence surfaces (e.g. `#simDials`, `#simFeedback`) only until `SIM.decision` is
set — both decision paths (`chooseAction`, `submitRecommendation`) set `SIM.decision`
before the reveal calls, so reveal-on-decision is safe.
