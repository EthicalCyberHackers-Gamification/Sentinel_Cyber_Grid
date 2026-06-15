---
name: Campaign continuity ("the company remembers", M1–M4 arc)
description: How the cross-mission narrative-memory layer is structured in the career-sim, and the rules any future mission-continuity feature must follow.
---

# Campaign continuity — "the company remembers"

The career-sim (`career-sim.js` + pure `career-dynamic.js`) has a narrative-memory
layer that lets earlier missions visibly shape later ones, parallel to the
mechanical `dynamicConditions` engine. Three surfaces: adaptive supervisor lines
+ a growing company timeline (brief), working hypotheses/open questions
(notebook), and a Mission-4 capstone (campaign reveal + preview-only performance
review in the debrief).

## The rule for any new mission-continuity feature
1. **Pure logic → `career-dynamic.js`** (DOM-free, returns NEW objects, never
   mutates inputs; reuse `evalFlagExpr` for `{allOf,anyOf,noneOf}` flag gates).
   Rendering + state live in `career-sim.js`; styles in `career-sim.css`.
2. **Data-gated, additive.** A mission opts in via a per-mission `def.*` key
   (`supervisorMemory`, `notebook.{hypotheses,unknowns}`, `campaignReveal`,
   `performanceReview`). Absent the key → renders nothing → earlier/other
   missions are untouched (this is why M1 stays visibly unchanged).
3. **Presentation-only stays presentation-only.** These surfaces read state but
   must NOT touch scoring / resources / role / `completedMissions` / cloud-sync.
   The performance review *previews* the next `CAREER_ROLES` rank
   (authorityLevel+1) without persisting a promotion — promotion is deferred.

## The ONE new persisted write
`CAREER.companyHistory` (a `{missionId: outcomeRecord}` map) is the only new
persisted state. It is written via the idempotent `upsertCompanyHistory` from
`finalizeMission(ctx)` → `recordCompanyHistory(ctx)`, where `ctx` is the decision
context the completion call sites already hold (decision label/kind, verdict,
applied resource changes) — never reconstructed from the DOM. Keyed by
missionId, so a replay REPLACES (never duplicates) the entry → resume-safe.

**Why:** keeps the whole layer additive and reversible; everything except
companyHistory is derived at render time, so there is nothing to migrate or
corrupt.

## Silent-fail guard (do this every time you add data)
Flags referenced in `supervisorMemory[].when` must be SET somewhere
(`setFlag`/`setFlags` on an evidence/action/recommendation path), and every
evidence id in `notebook.hypotheses[].triggeredBy` / `unknowns[].resolvedBy`
must exist as a real `evidence[].id` in that mission — otherwise the branch is a
dead no-op that renders nothing with no error. Cross-check by grepping the set
flags / evidence ids against the referenced ones before shipping.

**How to apply:** when extending continuity to M5/M6 (or any mission), add the
per-mission `def.*` data, wire only through the existing pure fns + the single
companyHistory write, and run the flag/evidence-id resolution check.

## Gotcha: companyHistory only surfaces keys that are real mission ids
`companyTimeline()` iterates the mission `order` (`Object.keys(CAREER_MISSIONS)`)
and renders only `history[id]` for those ids. So a non-mission key written to
`companyHistory` (e.g. `'sideTrail:<id>'`) is **dead data** — it persists but
never renders, and keying any record by a real missionId risks polluting that
mission's timeline entry.

**Why:** this is why "Optional Side-Trails v1" did NOT use companyHistory for its
persistent record (the plan suggested it). A resolved side-trail instead persists
via two flat `setMissionFlag` keys and surfaces as a Case-Board map node + the
red-string timeline — never through companyHistory.

**How to apply:** only put real-mission-id-keyed outcome records in
companyHistory. For any other persistent presentation record, use flat
`CAREER.missionFlags` flags and render from there.
