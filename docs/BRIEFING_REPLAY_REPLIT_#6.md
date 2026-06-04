# Briefing Replay — Implementation Record (Replit #6)

**Status:** Implemented · presentation-only · Assignments 1–3
**Scope:** Player-facing "Replay Briefing" experience that re-shows the mission
briefing cards and then flows into the existing on-screen spotlight walkthrough,
as one continuous, side-effect-free sequence.

This builds directly on the replay-safe architecture proven in
[REPLAY_SAFETY_CHECK_REPLIT_#7.md](./REPLAY_SAFETY_CHECK_REPLIT_%237.md): the
existing UI-only spotlight Replay Guide (`rg*` layer) is reused unchanged, and a
new, equally inert briefing-recap layer (`rgb*`) is layered in front of it.

---

## 1. Replay architecture overview

There are now two cooperating presentation-only layers, plus a single entry point:

| Layer | Functions | What it shows |
|-------|-----------|---------------|
| **Briefing recap** (new, `rgb*`) | `startBriefingReplay`, `rgbRenderStep`, `rgbAdvance`, `rgbFinish`, `endBriefingReplay` | The mission's briefing cards (`MISSION_BRIEFINGS`) re-rendered in a read-only modal overlay (`#rgbOverlay`). |
| **Spotlight tour** (existing, `rg*`, from Task #5) | `startReplayGuide`, `rgShowStep`, `rgRender`, `rgAdvance`, `endReplayGuide` | The Milestone-25B spotlight phases (commands → files → board → decision) over the live dashboard. |

**Entry point:** every "Replay Briefing" control calls `startBriefingReplay(missionId)`.
It renders the briefing cards first; on the final card ("Continue to walkthrough"),
`rgbFinish()` tears down the recap overlay and calls `startReplayGuide(missionId)`,
so the briefing and the spotlight feel like one onboarding flow.

### Why a separate layer instead of reusing the first-run briefing
The first-run guided briefing (`startGuidedBriefing` → `advanceGuidedStep` →
`reviewBriefingCard`) is **progression-linked**: it marks cards reviewed, drives
the supervisor feed, awards one-time briefing XP, and calls `saveProgress()`
(which writes `ech.progress.v1` and enqueues cloud sync). Reusing it for replay
would mutate progression. The `rgb*` layer therefore **re-reads** the same
`MISSION_BRIEFINGS` data but renders it independently, calling **none** of those
handlers.

### Safety invariants (preserved from #7)
The replay path reaches **neither `saveProgress()` nor `awardXP()`** — the single
chokepoint through which all progress writes and cloud sync flow. It does **not**
call `reviewBriefingCard`, `advanceGuidedStep`, `startGuidedBriefing`, or any
first-run-only handler. The **only** persistent write on the entire path is the
pre-existing inert UI flag `ech.replayGuideUsed.v1`, which is written best-effort
(wrapped in try/catch) and is **never read back** by any logic.

### Robustness
- **No stacking:** `startBriefingReplay` is a no-op if a recap (`rgbActive`) or a
  spotlight replay (`rgActive`) is already running.
- **Spotlight exclusivity:** while `#rgbOverlay` is open, `igModalOpen()` reports a
  blocking modal, so the live first-run spotlight defers. Both `startBriefingReplay`
  and `startReplayGuide` also call `igTeardown()` before running, so a recap/tour can
  never stack on top of a live spotlight that is already visible.
- **Missing targets skip safely:** the spotlight plan is built only from phases
  whose targets are currently visible (`offsetParent !== null`); off-screen phases
  are skipped, and an empty plan exits cleanly with no stuck overlay. (This is why
  replaying from the **briefing room**, before launch, shows only the briefing
  cards — the dashboard spotlight targets aren't visible yet.)
- **Cancelable:** Escape or the **Close** button ends the recap immediately;
  Escape/Close/"Done" end the spotlight.
- **Navigation-safe:** `endGuidedRun()` (the shared mission-exit chokepoint) calls
  both `endReplayGuide()` and `endBriefingReplay()`, so no overlay can be left
  stuck after the player navigates away.
- **No listener leaks:** each layer adds exactly one `keydown` handler on start and
  removes it on end; overlay nodes are removed and rebuilt per step.

---

## 2. UI placement

The control is surfaced in three states so it is reachable before, during, and
after a mission:

| Location | Where | State covered |
|----------|-------|---------------|
| **Briefing Room** | "↻ Replay Briefing" button beside the "Mission Briefing Room" title (`renderBriefingRoom`) | Pre-launch / fresh |
| **Current Objective panel** | The existing in-investigation "↻ Replay Briefing" buttons (`#replayGuideBtn`, `#m2ReplayGuideBtn`, `#m3ReplayGuideBtn`) — relabeled and rewired from the old "Replay Guide" | Mid-mission |
| **Completion scorecard** | "↻ Replay Briefing" button in the shared NEXT STEP panel (`buildNextStepHTML` / `wireNextStepButtons`) | Completed / after reload |

All three call the same `startBriefingReplay(missionId)`. The completion-scorecard
button satisfies the requirement that replay remain accessible after a mission is
finished. Because state lives in `localStorage`, a completed mission stays
completed across reloads, so the scorecard control remains reachable after reload.

Styling reuses the existing `.replay-guide-btn`, `.guided-overlay`, and
`.guided-card` chrome; new CSS is limited to the briefing-room title row
(`.briefing-room-head`), the recap's split action bar (`.guided-actions--split`),
and the recap Close button (`.rgb-close-btn`).

---

## 3. Replay flow behavior

1. Player clicks **Replay Briefing** (briefing room, dashboard, or scorecard).
2. The recap overlay opens on card 1 of N, showing the card title and its bullet
   points, with **Close** and **Got it — Next ›**.
3. Each **Next** advances a card. The last card's button reads **Continue to
   walkthrough ›**.
4. On the last card, the recap tears down and the spotlight Replay Guide starts,
   stepping through whichever dashboard phases are currently visible.
5. The player can **Close** / press **Escape** at any point to exit cleanly.

Pacing mirrors the original onboarding (card-by-card, then spotlight), without
re-triggering the supervisor feed or any progression side-effect.

---

## 4. Test matrix

Verified by static/code audit and a clean dev boot (interactive UI automation is
unavailable in this environment; see Known limitations). Manual play-through using
browser DevTools is the recommended runtime confirmation.

| State | A1 | A2 | A3 | Expected |
|-------|----|----|----|----------|
| Fresh (briefing room) | ✅ | ✅ | ✅ | Briefing cards replay; spotlight finds no visible targets and exits cleanly |
| Mid-mission (dashboard) | ✅ | ✅ | ✅ | Briefing cards replay, then spotlight over visible phases |
| Completed (scorecard) | ✅ | ✅ | ✅ | Replay reachable from NEXT STEP panel; same flow |
| After reload | ✅ | ✅ | ✅ | Completion persists; scorecard control still reachable |
| Cancel (Close/Escape) | ✅ | ✅ | ✅ | Overlay removed, no stuck dim, no trapped clicks |
| Repeat 10+ cycles | ✅ | ✅ | ✅ | No duplicate overlays/listeners; one keydown handler per active run |

---

## 5. Network inspection summary
The replay path issues **no** network requests. It never calls the cloud-sync
enqueue (`saveProgress` → sync) and never touches Supabase. Cross-check: grep the
`rgb*` / `rg*` functions — no `fetch`, no Supabase client call, no
`saveProgress`/`awardXP` reference.

## 6. localStorage inspection summary
`ech.progress.v1` is **never written** during replay (it is only written via
`saveProgress()`, which is never reached). The single write is the inert flag
`ech.replayGuideUsed.v1` (`"1"`), which no code reads. Confirm by snapshotting
`ech.progress.v1` before/after a full replay — it is byte-identical.

## 7. Sync queue inspection summary
No sync operations are enqueued. The cloud sync queue is fed exclusively by
`saveProgress()`; since replay never calls it, the queue is untouched across any
number of replays.

---

## 8. Known limitations
- Verification is code-level plus a clean boot; this environment cannot drive the
  in-app investigation UI via automation, and a full A1→A3 automated run exceeds
  the sandbox time budget. Runtime confirmation should be done manually with
  DevTools (Network / Application → Local Storage).
- Replaying from the **briefing room** intentionally shows only the briefing cards
  (the dashboard spotlight targets are not yet on screen), which is the correct
  safe behavior, not a bug.

## 9. Future recommendations
- Optionally add the control to the Operations Center / mission map for an
  always-on entry point.
- Consider a brief "replay mode" banner so players clearly understand the overlay
  is a recap and changes nothing.
