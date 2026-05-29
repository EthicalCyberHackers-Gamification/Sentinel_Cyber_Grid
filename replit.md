# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

Ethical CyberHackers Platform — a frontend-only browser cybersecurity training app
(`artifacts/ethical-cyberhackers-platform/`, preview path `/`) with two missions
(M1 = mission-001, M2 = mission-002).

### Mission Briefing Room (Milestone 24I)
A reusable layer between mission selection and investigation. Each mission shows 3
interactive briefing cards (Review Briefing → ✓ Reviewed), a Mission Readiness score
(0/3 → "Ready For Investigation"), a launch gate, per-card manager reactions, a "Begin
Investigation" launch sequence, +10 XP once per mission, and scorecard rows.
- Data-driven via `MISSION_BRIEFINGS` in `script.js` (~564). Shared helpers:
  `renderBriefingRoom`, `reviewBriefingCard`, `updateBriefingGate`, `showBriefingWarning`,
  `runBriefingLaunch`, `beginInvestigation`, `buildBriefingSummaryHTML`,
  `briefingReadinessPct` / `isBriefingComplete`.
- Launch buttons (`#beginMissionBtn` M1, `#m2BeginBtn` M2) stay clickable but carry
  `.begin-locked`; an early click fires the warning "Review all briefing materials before
  starting the assignment." instead of being disabled. M1 "continue" mode
  (`data-mode="continue"`) bypasses gating.
- Both briefing rooms render UNCONDITIONALLY at boot (`renderBriefingRoom` x2 before
  `restoreSavedProgress`), so the hosts are never empty on a clean session — restore
  returns early when nothing is saved. They also re-render on restore, on
  `showMission2Overview`, and on the M1 enter-module loader callback.
- State `briefingReviewed` (per-mission Sets) + one-time `briefingXpAwarded` are
  persisted; restore only accepts card IDs present in `MISSION_BRIEFINGS` (corrupt-state
  hardening) and readiness is clamped 0–100. Cleared in `resetMission` / `resetMission2`.
- NOTE: `script.js` is loaded as an ES module (`<script type="module">`), so its functions
  are NOT global — console-based test navigation won't work; drive M2 via the real
  "Continue to Mission 2" CTA (or prime `ech.progress.v1` with `mission1Complete:true`).

### Evidence Prioritization + Investigation Board
Students do not auto-receive evidence. They must manually PIN reviewed findings to an
Investigation Board and CLASSIFY each one's suspicion level (Normal Activity / Low
Suspicion / Helpful Supporting Evidence / Critical Threat Evidence).
- Core module lives near the top of `script.js` (after `renderConfidenceMeter`):
  `EVIDENCE_RATINGS`, `SUSPICION_LEVELS`, `investigationPins`, `pinnableFindings`,
  `pinXpAwarded`, plus `showPinPrompt` / `showClassificationPrompt` /
  `handlePinClassification` / `renderInvestigationBoard` / `buildInvestigationQualityHTML`.
- M1 Evidence Confidence is derived PURELY from pins (`recomputeConfidenceFromPins`);
  the finding submission no longer adds confidence on top.
- M1 gate: pinning `suspicious_file.txt` as Critical unlocks the decision/finding flow.
  Re-reading the suspicious file after a reload re-opens the gate via `canCompleteM1()`
  (resume-safe — no soft-lock).
- M2 keeps its command-based confidence and adds the pin contribution one-time on top.
- Pins, pinnable findings, and one-time XP guards are persisted (save/restore) and cleared
  on `resetMission` / `resetMission2`. Terminal directory context is NOT persisted (resets
  to `~` on resume by design).

### Mission Focus Mode + Expandable Panels (Milestone 25A)
A UX/immersion layer (no flow/logic changes) that declutters the mission dashboards.
The 25A module lives near the bottom of `script.js` (~6240+).
- **Manager chat feed**: `#managerText` / `#m2ManagerText` are `.manager-feed` containers
  of `.manager-bubble`. `pushManagerMessage(missionId, text)` appends a bubble (dedupes the
  consecutive repeat, trims to last 5, slide-in + panel flash). ALL manager writes route
  through it.
- **Focus Mode**: `body.focus-mode` hides `.xp-panel` + `#taskBrief` and collapses
  `.focus-collapse` cards; `body.mission-running` shows the floating `#focusControlBar`
  (toggle `#focusToggleBtn`). Helpers: `enterFocusMode` / `exitFocusMode` /
  `toggleFocusMode` / `setMissionRunning` / `updateFocusBar`. `setMissionRunning(true)` +
  `enterFocusMode()` fire on `beginMission` / `beginMission2`; `setMissionRunning(false)`
  on `resetMission` / `resetMission2` / `backToModuleOverview` / `backToMission2Overview` /
  `hideMission2Overview` / `showMission2Overview`.
  - RESUME-SAFE (25A architect fix): re-entering an in-progress mission re-asserts the bar.
    `beginMission2()` calls `setMissionRunning(true)`+`enterFocusMode()` BEFORE its
    `m2Started` early-return; `enterModule()` re-asserts them when
    `missionStarted && !missionComplete` (since `beginMission()`'s early guard would skip).
- **Collapsible cards**: generic `.collapsible` / `.is-collapsed` with `.collapsible-head`
  + `.collapsible-body`, a delegated click+keydown handler (`initCollapsibleCards`, wired in
  `boot()`), and a CSS `::after` chevron. Applied to briefing sections, briefing rooms,
  mission progress/status, progress tracker, and tools panels (M1+M2). Begin/launch CTAs are
  OUTSIDE `.focus-collapse` so collapsing never hides them.
- **Current Objective card** (`#currentObjective` / `#m2CurrentObjective`) mirrors the hint
  via `setCurrentObjective`, called from `setHint` / `setM2Hint`.
- **Command grouping**: M1 `renderButtons` groups buttons via `ensureGroup()` +
  `m1CommandCategory()` ("Inspect Files" for `cat-*`, else "Navigate"); M2 static buttons
  are wrapped in labeled `.cmd-group` divs (data-m2cmd selectors + `syncM2Buttons` unchanged).
- **Sound-free animations**: `fxFlash` / `fxToast` / `fxPulse*` helpers hooked into
  `awardXP` (toast + badge flash), `handlePinClassification` (board/confidence pulse +
  "Evidence Added" toast), `increaseTrustScore`, `setThreatLevel`, `unlockTool` (glow +
  toast), `updateManagerReaction` (mission_completed → "Mission Complete!" toast).

### Guided Spotlight Mission Flow (Milestone 25B)
A guided onboarding layer on top of the briefing room (no flow/logic changes). The 25B
module lives at the bottom of `script.js` (~6485+).
- **Guided briefing overlay** (`#guidedOverlay` / `.guided-overlay`): `startGuidedBriefing(missionId, startFn)`
  replaces the direct begin call on both Begin buttons (`#beginMissionBtn` M1, `#m2BeginBtn` M2).
  It dims the page and presents ONE briefing card at a time (3 per mission) with a Sarah
  Reyes lead-in (`GUIDED_BRIEFING_INTROS`), a "Briefing Step X of N" counter, and a
  "Got it — Next"/"Got it — Finish" button (`#guidedNextBtn`). `advanceGuidedStep` reuses
  `reviewBriefingCard` (marks reviewed + one-time XP + persist — never duplicates logic).
  Then a "Mission Ready" screen → "Launch Investigation" (`#guidedLaunchBtn`) → terminal
  launch lines ("Initializing analyst workstation...") via `runGuidedLaunch` → `finishGuidedLaunch`
  enables the spotlight (`igEnabled = true`) and calls the original `beginMission`/`beginMission2`.
- **Investigation spotlight tour** (non-blocking, dismissible): `IG_PHASES` walks
  commands → files (M1) → board → decision. `igShow` renders a light dim (`#igDim`,
  `pointer-events:none` so it NEVER blocks clicks), a glow ring on the target
  (`.ig-spotlight-target`), and a coach tip (`#igCoach`) with a "Got it" dismiss. Hooks:
  `ensureGroup` sets `group.dataset.cmdGroup`; `renderButtons` fires the files phase;
  `showPinPrompt` fires board; `showDecisionActions` fires decision. `igShow` defers via
  `igModalOpen` retry (bounded, max 40 / ~20s) while the alert modal or overlay is up.
- **Resume safety / teardown**: `startGuidedBriefing` skips the overlay if
  `missionStarted`/`m2Started` is already true. `igEnabled` is set ONLY at
  `finishGuidedLaunch` (never during restore). `endGuidedRun()` fully tears down DOM +
  state (cancels pending launch timers via `clearGuidedLaunchTimers`, unbinds the tracked
  spotlight target listener, clears `igPhasesShown`/`igPending`, nulls `guidedState`); it
  is called from `resetMission`, `resetMission2`, `backToModuleOverview`,
  `hideMission2Overview`, `backToMission2Overview`, and the `enterModule` resume path.
  `finishGuidedLaunch` is gated on a live `guidedState` so a stale launch timer can never
  resurrect a torn-down run.
- **Auto-open on mission load (25B fix)**: the overlay now opens AUTOMATICALLY when a
  fresh mission dashboard/overview loads — not just on a Begin click — so the student
  starts in the centered guided flow instead of the left sidebar. `enterModule`'s loader
  callback calls `startGuidedBriefing("mission-001", beginMission)` when
  `!missionStarted && !missionComplete`; `showMission2Overview` calls
  `startGuidedBriefing("mission-002", beginMission2)` when `!m2Started && !mission2Complete`.
  Each overlay step card shows a "Mission Briefing Room" heading (`.guided-room-title`).
  Launch lines are exactly "Initializing analyst workstation..." / "Loading file
  investigation tools..." / "Mission ready."; on launch the M1 Current Objective is set to
  "Open the documents folder and inspect the files." Console logs:
  `"Guided briefing overlay opened"` (on open) and
  `"Guided briefing complete. Investigation launched."` (on Launch click).
- **Resume-safe mid-mission reload (25B fix)**: `missionStarted`/`m2Started` are
  session-only (NOT persisted), so they can't gate "already started" across a reload. The
  fix adds a DURABLE per-mission flag `missionLaunched` (`{"mission-001","mission-002"}`),
  set true + `saveProgress()` at the end of `beginMission`/`beginMission2`, persisted in
  `saveProgress`, restored in `restoreSavedProgress`, and cleared in
  `resetMission`/`resetMission2`. `hasMissionProgress(missionId)` returns true when
  `missionLaunched[missionId]` is set OR any persisted investigation activity exists
  (completion flags, `evidenceLog`, `investigationPins`, `decisionTaken`, `m1FilesReviewed`,
  `m1Confidence`/`m2Confidence`) — the launched flag specifically covers a reload right
  after launch with zero activity yet. `startGuidedBriefing` skips the overlay and calls
  `startFn` directly (`beginMission`/`beginMission2`) when
  `alreadyStarted || hasMissionProgress(...)`. Since `missionStarted`/`m2Started` are false
  after reload, those begin functions run fully and RE-RENDER the live investigation view
  (hide briefing, show command buttons, re-enter Focus Mode) instead of soft-locking — so a
  mid-mission reload resumes straight into the investigation with NO re-onboarding overlay.
  XP/pins remain XP-once guarded. (Note: `m2UnlockedCmds`/`furthestSeqIndex` are still not
  persisted — a pre-existing limitation; resume restores the base command set plus persisted
  evidence/board, sufficient to continue.)

### Cyber Missions Map (Milestone 25C)
A 2D dark/cyber mission-SELECTION screen shown AFTER name entry + the simulation loader,
BEFORE the investigation. Pure selection layer — it reuses the existing progress state
(`missionComplete` / `mission2Complete`) and does NOT add a second progress system. The
25C module lives in `script.js` after `enterModule` (~4275+), with boot() wiring (~6421).
- **Flow**: `#moduleLanding` → Enter Module → `runSimulationLoader` → `showMissionsMap()`
  (NEW — `enterModule`'s loader callback now calls this instead of revealing M1 directly).
  Click a node → details panel + transmission update → "Launch Mission" → existing flow:
  M1 → `openMission1Dashboard()` (the OLD `enterModule` reveal body, extracted), M2 →
  `showMission2Overview()`, M3 → locked (no launch).
- **Node states** (`renderMissionMapStates` from `missionMapStatus`): M1 available|completed;
  M2 locked until M1 complete, then available|completed; M3 always locked/"Coming Soon".
  Path lines (`#mapPath12`/`#mapPath23`) light (`.map-path-line--lit`) when their target
  is reachable. Locked nodes stay CLICKABLE (to view their locked details) — only the
  Launch button is disabled. Data is `MISSION_MAP` in `script.js` (titles/role/threat/
  briefing/skills/transmission per mission).
- **Details + transmission**: `renderMissionDetails` rebuilds `#missionDetailsPanel` via
  innerHTML (Launch listener re-added each render — safe, old node is discarded);
  `renderMapTransmission` sets `#mapTransmissionText` (Sarah Reyes per-mission message,
  animated "TRANSMISSION ACTIVE" dot).
- **Back to Missions Map** buttons: `#m1MapBackBtn` (M1 dashboard header), `#m2MapBackBtn`
  (M2 dashboard header), `#m2OverviewMapBackBtn` (M2 overview) — all call `showMissionsMap()`
  with NO progress loss.
- **Single-active-screen invariant**: `showMissionsMap()` and `openMission1Dashboard()` hide
  all sibling screens before showing theirs; `showMission2Overview()` was updated (25C) to
  ALSO hide `#missionsMap` so launching M2 from the map never stacks screens.
- **Resume-safe**: `showMissionsMap()` calls `setMissionRunning(false)` + `endGuidedRun()`;
  `openMission1Dashboard()` defers to `startGuidedBriefing()` (which resumes via
  `hasMissionProgress`/`missionLaunched` rather than re-onboarding). Map markup is rendered
  statically in `index.html` (`#missionsMap`, hidden by default); states recompute on every
  `showMissionsMap()`. Responsive: side-by-side desktop, stacked on ≤900px (SVG paths hidden).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
