---
name: Analyst Notebook navigation chrome (career-sim)
description: Presentation-only Focus mode + collapsible sections + status chips layered onto renderEvidencePanel; why the overlay exists and the ordering/keying rules that keep it safe.
---

The career-sim Analyst Notebook (`#simEvidence` / `renderEvidencePanel`) has a
presentation-only navigation/immersion layer: a case-file panel head
(`notebookPanelHeadHtml` — Focus / Expand-all / Collapse-all + `CASE #NNNN`),
collapsible sections, and uniform status chips. All wired by
`applyNotebookChrome(body, grew)` run AFTER `innerHTML`.

**Why Focus mode exists:** the right column markup in `index.html`
(`.career-col--right`) is a static `grid-template-rows: 1fr 1fr` that stacks
`#simEvidence` over `#simFeedback`, so the notebook is permanently ~half viewport
height. Focus mode adds `.career--nb-focus` on `#careerOps` and CSS lifts
`#simEvidence` into a `position:fixed` centered overlay (z-index 45) over a dim
backdrop (44). It does NOT restructure the grid.

**Rules that keep it safe / non-regressing:**
- Collapse state lives in transient `SIM.nbCollapsed` keyed by **section KIND**
  (not index/order), `SIM.focusNotebook` boolean. Reset clears both + removes the
  class. Nothing here touches `saveProgress`/`saveCareerState`/reducers.
- In the `caseFileNotebook` branch, run `applyNotebookChrome` BEFORE the scroll
  restore, or default/user collapses change content height after the scrollTop is
  already set and it snaps wrong (pairs with the renderEvidencePanel rebuild that
  already capture/restores `.sim-evidence-body.scrollTop`).
- Smart defaults: `NB_DEFAULT_COLLAPSED = {facts, casefile, hyp, reflect}` only.
  Anything interactive/active (objectives, evidence, comms, response, questions)
  defaults EXPANDED so first-reveal required work is never hidden.
- Focus overlay must stay BELOW the map/concept overlays (those are z-index
  1000–1200); Escape priority closes concept/map first, then notebook focus, then
  exits the mission.
- Right-aligning the head trio uses `:has()`: count keeps its existing
  `margin-left:auto`; when there is no count, status gets `margin-left:auto`;
  chevron only gets auto when there's neither count nor status. `:has()` is
  already relied on elsewhere in career-sim.css.

**How to apply:** any new notebook section is auto-picked-up by
`applyNotebookChrome` if it's a direct-child block with a recognized head class;
gate its default-collapsed/ status behavior in `NB_DEFAULT_COLLAPSED` /
`nbSectionStatus` by kind, never by mission id.
