---
name: M1 grep triage (file-model third skill)
description: Adding a triage/hunt tool to a file-model mission — why "classifiable" must decouple from "deep-read", and how evidence-surfacing stays non-graded.
---

# Mission 1 grep triage

Mission 1 (career-sim.js, file-model) gained `grep` as a third investigative skill
beside `ls`/`cat` to kill the "cat every file" monotony. The durable lessons:

## Decouple "classifiable" from "deep-read", or the tool is pointless
The classify UI and EVERY next-step / unknowns / scope-count line originally
filtered on `SIM.read.has(name)` (cat-only). But `classificationQuality()` scores
ALL files. So any triage tool that surfaces evidence WITHOUT a cat leaves those
files unclassifiable → a fully-scored run still forces a cat on all 7, defeating
the feature.

**Rule:** introduce ONE visibility predicate (`fileClassificationVisible(f)` =
deep-read OR its evidence surfaced) and route the classify grid AND all guidance
copy through it. Keep `SIM.read` semantically deep-read-only (do NOT mark grep
hits as read). Per-file "discovered" uses `some(evidenceIds in SIM.evidence)`;
mission-level completion (`allFileEvidenceSurfaced`) uses `every`.
**Why:** scoring measures all files; visibility/guidance must match how evidence
can now surface, or the UI and the grader disagree.

## Evidence-surfacing tool is NOT a new graded path
`grep` prints literal matches (presentation) and reuses the idempotent
`surfaceEvidence()` chokepoint — the SAME one `cat` uses. Grading stays solely in
`setDiscoveryJudgment` (notebook). No double-count because surface is guarded by
`SIM.evidence.has(id)`. Completion switched to evidence-based so the +7
thoroughness bonus is reachable via grep, agnostic to cat-vs-grep.

## Match precision: containment, not bidirectional substring
Evidence surfaces only when the searched needle CONTAINS an authored `grepTerms`
marker (`needle.includes(term)`), not bidirectional. Bidirectional made
`grep public` surface the roadmap marked "non-public" (term-includes-needle leak).
Real grep still PRINTS the non-public line; it just doesn't surface that evidence.
Soft-gated behind 2 deep reads (`SIM.read.size>=2`) as fading scaffolding.

## A presentation nudge earned during a hard-lock must defer to the unlock
The grep-unlock coaching is earned at the 2nd deep read — but that same read
usually surfaces a finding that hard-locks the terminal for Sarah's judgment, so
printing the "now type grep" cue right then points at a disabled input.
**Rule:** when a coaching nudge becomes due while `decisionLocked()`, latch a
transient `*Pending` flag instead of printing, and flush it from the single lock
chokepoint (`updateDecisionLock`, `if (!locked && pending) print()`), clearing the
flag inside the print fn so it fires exactly once. Reset the pending flag wherever
its sibling "shown once" flag resets (per-open), or a stale latch leaks across
mission opens.
**Why:** the lock chokepoint is the only place that reliably knows the line just
became usable; tying the cue to it keeps guidance and the actual input state in
sync. Safe because `updateDecisionLock` runs at the END of `syncDecisionDock`
(itself end of `renderEvidencePanel`) and `simPrint` only appends DOM — no
recursion.

## Verify cheaply
A standalone harness that parses the M1 `files`/`grepTerms` from source and
replays the match algorithm proves all evidence is grep-reachable and the
contractor "aha" (`grep ext-contractor-07`) shows release_notes + access_log but
surfaces only `ev_contractor_access` — far cheaper than a full A1→A3 e2e.
