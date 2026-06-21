# Phase 1B — Investigation Guidance (QA & validation record)

Task #154. A thin, **presentation-only** guidance layer over the **shared**
`career-sim.js` engine, built directly in the shipping app per the `replit.md`
preference.

> **Scope update (Mission 1 only).** Per a follow-up request, the new guidance
> bundle is now scoped to **Mission 1** via a dedicated per-mission flag
> `def.investigationGuidance` (set only on `mission-001`). Missions 2–4 keep their
> **pre-existing** "Active Investigation" state-summary feed exactly as before, but
> do **not** receive the new beginner overlay (stage bar, RECENT ACTIVITY log, or
> progressive UI focus). The flag is the single gate — nothing forks on a mission
> id. The implementation still extends the shared renderers; only the gating flag
> differs from the original "all four missions" plan.

## Hard invariants (held for every change)

- **Transient state only.** No new code writes `ech.progress.v1`. None of
  `saveProgress` / `awardXP` / `saveCareerState` (nor any `localStorage` write of
  the progress key) is called from the Phase 1B code paths. The activity feed and
  the stage attribute live entirely in the in-memory `SIM` object and the DOM.
- **No answer giveaways.** Every surface describes *what happened* or *where to
  look* — never which line is suspicious, the true classification, or the verdict.
- **Terminal-first preserved.** Reopen, focus, feed, stage bar, and progressive
  focus are all additive; the terminal flow is unchanged.
- **Shared surface, no mission-id forks.** Features extend the shared renderers
  (`renderEvidencePanel`, the brief, the File Reader, the notebook) and gate on
  `def.*` flags (`investigationFeed`, `files[].focus`, etc.), never on a mission id.

## What shipped

| Step | Feature | Gate | Notes |
| ---- | ------- | ---- | ----- |
| T-A | Workflow **Stage bar** (`#simStageBar`) | `def.investigationGuidance` (Mission 1 only) | Pure `stageState()` reader → 5 display stages (Briefing → Evidence Review → Analysis → Decision → Feedback) derived from `SIM.stage` + progress. Painted by `renderStageBar()` from the `renderEvidencePanel` chokepoint + `openCareerMission`. On M2–M4 `rows` stays null so the bar is hidden. Stage names only — explanation-free. |
| T-B | **Investigation Focus** line in the File Reader | `def.files[].focus` (generic fallback otherwise) | Authored attention-only prose (`--font-body`, not the mono file content) + optional `focusTerms` glossary chips. |
| T-C | **Evidence Reopen** chips in the notebook | file-model (`simFiles().length`) | Reopen an already-read file back into the File Reader via `data-reopen`; reuses the existing open path — surfaces **no new evidence**. |
| T-D | **Active Investigation Feed** (RECENT ACTIVITY log) | `def.investigationGuidance` (Mission 1 only) | Transient `SIM.feed` (reset on mission init); `emitFeed(kind,text)` dedupes-last and caps at 12 with **no render side-effect**. Emitted at shift start, file read/grep, command run, reveal-actions, decision submit. Only the **RECENT ACTIVITY log** is gated here — the pre-existing "Active Investigation" state summary (newest finding + comms + next step) stays on M2–M4 under `def.investigationFeed`. Generic, no interpretation. |
| T-E | **Hover definitions** on the Focus line | `def.files[].focusTerms` | Reuses `glossaryTermHtml`. Applied to **content-concept** vocab only (e.g. PII / PCI / material non-public) — never the four classification levels, to avoid leaking `trueClassification`. Kept off terminal lines. |
| T-F | **Progressive UI Focus** (minimal slice) | `#careerOps[data-stage]` | Desktop-only (`min-width:1101px`) **opacity-only** emphasis: gently dims the two genuinely-secondary panels (mission brief + feedback) at stages where they're not in play. The terminal and notebook are **never** dimmed; hover/focus restores full emphasis; neutralized on narrow layouts, in notebook-focus mode, and for collapsed rails. See deferral note below. |

## T-F scope decision (architect-reviewed)

The original plan framed T-F as a stage-driven **rearrangement** of the 3-column
mission shell. That shell is load-bearing for M1's file flow and M2–M4's
command/judgment/debrief flow, and it already carries collapse/resize
(`ech.ui.v1`), simple-mode, focus-mode, and mobile rules. An architect `plan`
pass recommended **not** shipping a reflow-based rearrangement without an
interactive M1–M4 playthrough (which is not possible in this environment — see
the gap below).

**Decision:** shipped the safest reversible slice — a `data-stage` attribute plus
subtle, opacity-only emphasis with no reflow, no hiding, and no pointer blocking.
The stronger stage-driven rearrangement (collapsing/reordering panels) is
**deferred** until a hands-on playthrough is available. This is documented inline
in `career-sim.css` next to the T-F block.

## Static validation performed (this environment)

- `node --check artifacts/ethical-cyberhackers-platform/career-sim.js` → **OK**.
- `pnpm --filter @workspace/ethical-cyberhackers-platform run typecheck` → **passes**.
- Forbidden-sink grep over the new code (`saveProgress|awardXP|saveCareerState|
  localStorage|setItem`) → **none**.
- Forbidden layout-primitive grep over the T-F CSS (`display:none|visibility:
  hidden|pointer-events:none|grid-template|order:|position:`) → **none**.
- Workflow `artifacts/ethical-cyberhackers-platform: web` restarted clean;
  home screen (`/`) renders; browser console clean (Vite HMR only).

## Validation gap — REQUIRES a human follow-up

This environment **cannot interactively play the missions or prime
`localStorage`** (the test harness can't reach the app iframe's storage, and
automated end-to-end play is disabled). The career-sim **interior** — where every
Phase 1B surface lives — is therefore only **statically** validated here. The
following must be confirmed by a person playing **M1 → M4** end-to-end:

1. **Stage bar** advances Briefing → Evidence Review → Analysis → Decision →
   Feedback as the player reads evidence, reveals actions, and submits — in
   **Mission 1**. Confirm it is **absent** on Missions 2–4.
2. **Investigation Focus** line appears when a file is opened (M1) with the
   authored text; generic fallback shows for files without authored `focus`.
3. **Reopen chips** re-pin the exact same file content with no duplicate evidence
   and no change to terminal history.
4. **Activity feed** (RECENT ACTIVITY log) logs events chronologically in
   **Mission 1**, with no answer text and no interpretation. Confirm Missions 2–4
   still show their pre-existing "Active Investigation" state summary but **no**
   RECENT ACTIVITY log.
5. **Hover definitions** show tooltips on the Focus terms; terminal output
   unchanged.
6. **Progressive UI Focus** subtly de-emphasizes the brief/feedback panels at the
   right stages on desktop, never hides the terminal or notebook, restores on
   hover/focus, and is fully inert on mobile / in notebook-focus mode.
7. **Invariant re-check after play:** progress (`ech.progress.v1`) is unchanged by
   any of these surfaces — i.e. browsing the feed, reopening files, or moving
   through stages awards no XP and writes no progress.
