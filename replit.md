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

### Split-Screen Mission Control Layout (Milestone 25D)
A UX/immersion layer (no flow/logic changes, no new progress system) that reflows each
mission dashboard into a 70%/30% split DURING an active mission. Reuses the existing
`.dashboard` grid markup (M1 `#dashboard`, M2 `#mission2Dashboard`) and the same
`missionMapStatus` progress flags as the full map.
- **70/30 split gated on `body.mission-running`** (CSS block appended at END of `style.css`):
  `body.mission-running .dashboard{grid-template-columns:7fr 3fr}` with `.center-column`
  `order:1` (LEFT = terminal + commands), `.mission-panel` `order:2` (RIGHT = mission
  control), and `.xp-panel{display:none}` (the agent profile is folded away during play).
  Declutter: `body.mission-running .commands-panel .hint-panel{display:none}` (the relocated
  Current Objective supersedes the inline hint pill). Responsive `@media(max-width:900px)`
  stacks to one column with the terminal first (`.center-column{order:-1}`); placed AFTER the
  desktop rules so source order wins ties.
- **Compact "Mission Route" map** lives at the TOP of each `.mission-panel` `.panel-body`
  (`.mini-map-panel` with label "Mission Route" + an "Open Full Map" button —
  `#m1OpenFullMapBtn` / `#m2OpenFullMapBtn` — wired to `showMissionsMap()` in `boot()`). The
  map host `#m1MiniMap` / `#m2MiniMap` holds 3 `.mini-node[data-mission]` + 2
  `.mini-path[data-path="12"/"23"]`. `renderMiniMap(rootId, activeMissionId)` (after
  `renderMissionMapStates`, ~4410) toggles `.mini-node--available|completed|locked|active`
  (active = the panel's own mission) and `.mini-path--lit` from `missionMapStatus`;
  `renderAllMiniMaps()` refreshes both. Hooked into `showMissionsMap`, `openMission1Dashboard`,
  `showMission2Overview`, `completeMission`, the M2 quiz completion + `completeMissionEngine`,
  `resetMission`, `resetMission2`, and `boot()` (resetMissionEngine delegates to the resets).
- **Current Objective relocated** into the right control panel (`#currentObjective` M1,
  `#m2CurrentObjective` M2, both gain `.current-objective--control`); the originals were
  removed from the commands panels. IDs preserved so `setCurrentObjective` is unchanged.
- "Open Full Map" returns to the full `#missionsMap` via `showMissionsMap()` with NO progress
  loss (same handler as the existing "Back to Missions Map" buttons).

### Three-Column Active Investigation Layout (Milestone 25E)
A UX/immersion layer (no flow/logic changes, no new progress system) that reflows each
mission dashboard into a 3-column "mission-control workstation" DURING an active mission.
Reuses the SAME three existing grid children (M1 `#dashboard`, M2 `#mission2Dashboard`):
`.mission-panel` (LEFT), `.center-column` (CENTER), `.xp-panel` (RIGHT, repurposed). All
element IDs are preserved so every render fn + handler is unchanged. The 25E CSS block is
appended at the END of `style.css` (replaced the 25D block, ~6224+).
- **3-col split gated on `body.mission-running`**: `grid-template-columns:3fr 5fr 2fr` with
  `.mission-panel` `order:1` (LEFT "Mission Control"), `.center-column` `order:2` (CENTER
  terminal), `.xp-panel` `order:3` (RIGHT "Live Status"). The legacy 25A Focus-Mode rule
  `body.focus-mode .xp-panel{display:none}` is OVERRIDDEN during play
  (`body.mission-running.focus-mode .xp-panel{display:flex}`) — without this the right column
  vanishes because `beginMission`/`beginMission2` call `enterFocusMode()`.
- **RIGHT column dual-purpose**: the `.xp-panel` holds BOTH a `.agent-profile` wrapper (shown
  pre-mission) and a `.live-status` block (shown during active), toggled by
  `body.mission-running .xp-panel .agent-profile{display:none}` / `.live-status{display:block}`.
  The panel header has two titles `.xp-title-profile` ("AGENT PROFILE") + `.xp-title-status`
  ("LIVE STATUS"), toggled the same way. `.live-status` (default `display:none`) contains
  `#alertCenter`/`#threatMeter`/`#trustScore`/`#confidenceMeter`/`#investigationBoard`, an
  "Evidence Details" drawer wrapping `#evidencePanel`, the relocated `#m1HintBtn`
  (`.hint-request-btn--block`, M1 only — M2 has no hint button), and an "Available Tools"
  drawer wrapping `#toolsPanel`. M2 mirrors with `m2*` IDs.
- **CENTER column**: `#currentObjective`/`#m2CurrentObjective` (now `.current-objective--center`)
  relocated to the TOP of the commands `.panel-body`, above the command buttons. During play
  the inline `.hint-panel`, `.task-brief`, and `.commands-hint` in the commands panel are
  hidden (the Current Objective supersedes them), keeping the terminal dominant.
- **LEFT column**: the compact `.mini-map` (relabeled "Mission Control") becomes a LARGE
  VERTICAL route during active (`body.mission-running .mission-panel .mini-map` → column;
  nodes are full-width rows with bigger 40px dots, vertical `.mini-path` connectors). The
  active node pulses (`@keyframes miniNodePulse` cyan / `miniNodePulseGreen` for
  active+completed); honored by a `prefers-reduced-motion` override. `#courseProgress` was
  wrapped in a "Course Progress" `.collapsible focus-collapse` drawer; briefing/progress/
  tracker drawers already carry `.focus-collapse`, so Focus Mode auto-collapses all dense
  content during play.
- **Responsive**: desktop 3-col; tablet (≤1100px) the LEFT Mission Control spans full width
  on TOP (`grid-column:1/-1`) with terminal+Live-Status as 2 cols below, and the left map
  reverts to horizontal; mobile (≤700px) single column ordered terminal → mission control →
  live status.
- **JS touch**: only `pushManagerMessage` feed trim changed 5→3 (`script.js` ~6681); no
  render/flow logic changed. Verified e2e on M1 + M2 (3-col layout, big left map, center
  terminal, right Live Status visible under Focus Mode, pin→board/confidence update, Open
  Full Map back-nav).

### Command-on-click typing
When a player CLICKS an M1 command button, the command is first TYPED into the terminal
entry (`#terminalInput`, ~38ms/char) so it's visible before being sent, then executed.
`typeCommandIntoTerminal(command, onDone)` (after `runCommand`, ~`script.js` 4306) drives it,
with `cancelTerminalTyping` (no-op-safe) and `flushTerminalTyping` (a rapid second click flushes
the current command so none is dropped). The M1 click handler types then runs. `cancelTerminalTyping`
is called centrally in `endGuidedRun()` (covers every mission-exit: map/overview/back/reset) and in
`abortDemo` so a deferred `runCommand` can never fire off-screen after the student navigates away.

### Opt-in Guided Demo (Mission 1)
An OPT-IN walkthrough offered on the M1 guided "Mission Ready" screen (a "Watch
Demo First" button `#guidedDemoBtn`, M1 only — M2 unaffected). It launches a clean Mission 1
and TEACHES newbies the whole workstation: it both CLICKS command buttons (`demoClickCommand`
— a real `.click()` + a `.demo-press` flash, so the click-to-type animation plays) AND shows
MANUAL typing (`demoTypeCommand`, e.g. read-only `pwd`), runs REAL example commands (`ls` →
`pwd` → `cd documents`/`ls` → `cat finance_update.txt` → `cat suspicious_file.txt`), classifies
the suspicious file as Critical, and a pop-out (`#demoCoach`, reuses
`.ig-coach`/`.ig-dim`/`.ig-spotlight-target`) MOVES to and DESCRIBES each area (command center →
terminal → Current Objective → Live Status threat meter → Investigation Board → hint button →
decision actions), then fully resets and returns the student to the Mission Ready screen so they
do it themselves. The demo module lives at the bottom of `script.js` (~7390+): `DEMO_STEPS`
(15 steps), `m1KeyForCommand`, `demoClickCommand`, `demoTypeCommand`, `startDemo`,
`demoGo`/`demoNext`/`demoBack`, `renderDemoStep`, `showDemoCoach`, `positionDemoCoach`,
`teardownDemoCoach`, `abortDemo`, `endDemo`, `demoWait`/`clearDemoTimers`.
- **Progression commands use real clicks, not no-key `runCommand`**: `afterCommand(key)`
  early-returns on an empty key, so typed/no-key commands DON'T unlock/advance. The demo runs
  progression steps via `demoClickCommand` (real button click → `runCommand(cmd, key)` →
  `afterCommand` fires); only read-only commands (`pwd`) use `demoTypeCommand`.
- **No floating-control overlap (stuck-step fix)**: `startDemo` adds `body.demo-active` (removed
  in `abortDemo`) which CSS-hides the floating `.focus-control-bar` and `.soundtrack-toggle` —
  they previously overlapped and intercepted the coach's Next button (the demo got stuck at
  "Step 13 of 15"). The demo coach is also raised to `z-index:10000` (above the music toggle's
  9999) as a safety net.
- **Coach stays on-screen**: `positionCoach` (shared by the demo AND the live spotlight tour)
  clamps the tip's `top` within the viewport so its nav buttons never render off-screen when the
  target (e.g. decision actions) is scrolled near the viewport edge.
- **MANUAL step-through (not auto-advancing)**: the pop-out renders three controls —
  `.demo-coach-back` ("← Back", disabled on step 1), `.demo-coach-cancel` ("Cancel"), and
  `.demo-coach-next` ("Next →", or "Finish ✓" on the last step). The student drives the pace.
  `demoNext`/`demoBack` call `demoGo(ix)`, which clamps `ix`, runs each step's real action
  EXACTLY ONCE on forward navigation (tracked by `demoMaxRun`; the `while(demoMaxRun<ix)`
  loop never runs when going Back, so terminal output is never duplicated — cumulative
  terminal output can't be cleanly undone), then renders (deferred by `DEMO_ACTION_DELAY_MS`
  ≈450ms when an action ran so its DOM settles, else immediately). `clearDemoTimers()` in
  `demoGo` dedupes rapid clicks. Cancel → `endDemo`; Finish (`demoNext` on last step) →
  `endDemo`. Both restore the Mission Ready overlay with no soft-lock.
- **Side-effect isolation**: `suppressSave=true` during the demo (reuses the clear-progress
  flag) so nothing persists; `igEnabled=false` so the real spotlight never overlaps.
  `startDemo` snapshots `demoTrustSnapshot = trustScore` BEFORE mutating (because
  `resetMission()` does NOT reset trust — the auto-classify grants +5 trust that would
  otherwise leak into the real run).
- **Single teardown path**: `abortDemo()` (guarded by `if (!demoRunning) return`) is the only
  silent teardown — stops timers, removes the pop-out, `resetMission()`, restores
  `trustScore` from the snapshot, and sets `suppressSave=false` (fail-safe so persistence is
  never left stuck off). It is hooked into the TOP of `endGuidedRun()` (`if (demoRunning)
  abortDemo()`), so EVERY navigation/reset exit that already routes through `endGuidedRun`
  (showMissionsMap, backToModuleOverview, hideMission2Overview, backToMission2Overview,
  resetMission, resetMission2, enterModule resume) aborts the demo cleanly. `endDemo()` =
  `abortDemo()` + re-show the guided Ready overlay (Skip/Finish buttons call it).
- **No recursion**: `abortDemo` sets `demoRunning=false` BEFORE calling `resetMission()`, so
  the nested `resetMission → endGuidedRun → abortDemo` is a no-op. **No self-cancel**:
  `startDemo` calls `endGuidedRun()` (to tear down the briefing overlay) BEFORE setting
  `demoRunning=true`, otherwise the new `endGuidedRun` guard would abort the demo at startup.

### Background Soundtrack
A looping background soundtrack across the whole game (`script.js` ~56-130). The MP3 is
imported via Vite's `@assets` alias (`import soundtrackUrl from "@assets/…mp3"`) — resolves
to a served URL. NOT a seamless loop: when the track ENDS, a `SOUNDTRACK_BREAK_MS` (4s) break
elapses, then it restarts from `currentTime=0`, repeating for the whole session.
- `initSoundtrack()` lazily creates `new Audio(url)` (NOT in the DOM), `loop=false`,
  `volume=0.35`, with an `ended` listener that clears the prior break timer, schedules the
  restart, nulls the timer, and on restart-`play()` rejection drops `soundtrackStarted` so a
  later user gesture can recover playback. `startSoundtrack()` (guarded by `soundtrackStarted`)
  is called from `enterModule()` — the `#enterModuleBtn` click is the user gesture that
  satisfies browser autoplay policy.
- A floating mute toggle (`#soundtrackToggle`, `.soundtrack-toggle`, created in JS) flips
  `audio.muted` and its label "Music: On"/"Music: Off" (+`.is-muted`); unmuting also retries
  start if autoplay was blocked. CSS appended at the END of `style.css`.

### Post-completion UX (terminal pacing + Next Step guidance)
Six UX fixes (no flow/system changes). CSS appended at the END of `style.css`.
- **Paced terminal output**: OUTPUT lines reveal one at a time from ONE shared queue
  (`outputRevealQueue`, `TERMINAL_LINE_DELAY` 550ms) used by BOTH terminals.
  `queueTerminalReveal`/`revealNextTerminalLine` hide lines via `.term-pending` then
  unhide on a timer; `flushTerminalOutput` shows all pending at once;
  `clearTerminalOutputQueue` drops them. `printOutput`/`printBlankLine` queue; `printCommand`
  flushes first (M1 echoes instant). `printM2Line` treats `cmd` AND `prompt` classes as
  instant command echoes (the main M2 flow echoes with `m2-line--prompt`, demo with
  `m2-line--cmd`) and queues output/blank/info. Boot lines stay instant. Clicking either
  terminal (`#terminalOutput`/`#m2Terminal`, wired in `initTerminalInput`) flushes the queue
  (skip-to-end). `clearTerminal` + `resetMission2` clear the queue. `TERMINAL_TYPE_SPEED`=40
  (alias `TERMINAL_TYPE_MS`) is the per-char command typing speed.
- **employee_notes.txt feedback**: `pinReactionText` returns custom lines — correct (Helpful
  Supporting Evidence) → "Good. This note supports proper reporting behavior."; wrong →
  "Re-check this note. It supports reporting suspicious files, but it is not the main threat."
- **Next Step panel**: `buildNextStepHTML(missionId)` (suffix `M1`/`M2`) renders a panel at
  the TOP of each completion screen — "Open Mission Map" (primary, → `showMissionsMap`) +
  "Review Scorecard" (secondary, scrolls to `.scorecard`). Injected into `buildCompletionHTML`
  (M1) and the M2 scorecard; wired via `wireNextStepButtons` in `completeMission` /
  `renderM2Scorecard`.
- **Map button attention (FIX4)**: `setMapButtonsAttention(missionId,on)` toggles
  `.map-cta-attention` (pulse + "Next Step" ::after badge, `prefers-reduced-motion` honored)
  on the map back / "Open Full Map" buttons at completion; `clearAllMapButtonsAttention` clears
  both. Cleared in `showMissionsMap` and `resetMission`/`resetMission2`.
- **Completion clarity (FIX5)**: M2 `syncM2Buttons` disables command buttons when
  `mission2Complete` (re-enabled on restart since `resetMission2` clears the flag + calls
  `beginMission2`). On completion both missions set Current Objective `COMPLETION_OBJECTIVE`
  ("Mission complete. Open the Mission Map to continue.") and manager `COMPLETION_MANAGER`
  ("Good work. Return to the Mission Map to continue your training path.").

### Contextual Event Toast System (Milestone 26A)
A reusable, non-blocking notification layer (no flow/logic/progress changes) that surfaces
short status toasts at key mission events. Does NOT replace manager messages or the Current
Objective. The 26A module lives near the fx helpers in `script.js` (~7184); CSS appended at
the END of `style.css`.
- **API**: `showEventToast(title, message, type)` with `type` ∈ info|success|warning|danger|
  unlock (invalid types fall back to info). Toasts render top-right in `.event-toast-host`
  (fixed, `pointer-events:none` so the terminal is NEVER blocked), slide/fade in, stay
  `EVENT_TOAST_MS` (3500ms), then fade out (`EVENT_TOAST_FADE_MS` 350ms). Each `.event-toast`
  has `.event-toast-dot` + `.event-toast-body`(`.event-toast-title`/`.event-toast-msg`),
  `role=status` + `aria-atomic`, host `aria-live=polite`. Per-type accent colors; responsive
  ≤700px; `prefers-reduced-motion` honored.
- **Max-2 with a real QUEUE (architect fix)**: at most `EVENT_TOAST_MAX` (2) are visible;
  extras are ENQUEUED (`eventToastQueue`) and `renderEventToast` runs when a slot frees
  (each toast's fade-out decrements `eventToastVisible` then `pumpEventToasts()`), so a burst
  never truncates a toast's dwell time. Helpers: `ensureEventToastHost` (idempotent),
  `pumpEventToasts`, `renderEventToast`.
- **Triggers** (each tagged "Milestone 26A"): M1 — `beginMission` (Investigation Started/info),
  `handleM1FileRead` suspicious_file FIRST read only (Suspicious File/warning),
  `handlePinClassification` (Evidence Added/info + Evidence Classified success / Re-check
  Evidence warning — replaced old `fxToast`), `setThreatLevel` rise gated on
  `body.mission-running` (Threat Rising/danger — avoids restore-time spurious fire),
  `handleFindingAnswer` correct (Finding Submitted/success), `completeMission` (New
  Assignment/unlock), `updateManagerReaction` mission_completed (per-mission Mission
  Complete/success — replaced old `fxToast`). M2 — `beginMission2` (Investigation
  Started/info), `runM2Command` ping reachable (Host Reachable/success) + nmap (Services
  Found/info), `handleM2AnalystAnswer` correct (Analysis Correct/success).
- **First-run guards (architect fix)**: repeatable commands fire their toast once.
  `runM2Command` captures `firstPing`/`firstNmap` at the TOP (before the unlock chain mutates
  `m2UnlockedCmds`); `handleM1FileRead` snapshots `firstRead` before `m1FilesReviewed.add`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
