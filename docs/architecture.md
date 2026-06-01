# Architecture — Ethical CyberHackers Platform

System design and cross-cutting decisions for the frontend-only cybersecurity
training app (`artifacts/ethical-cyberhackers-platform/`, preview path `/`).

Related docs: [missions.md](./missions.md) · [ui-guidelines.md](./ui-guidelines.md) ·
[deployment.md](./deployment.md) · [roadmap.md](./roadmap.md) ·
[changelog.md](./changelog.md)

## App shape

- **Four files** carry the whole app: `index.html` (all screens, statically
  rendered and toggled), `script.js` (all logic), `style.css` (all styling), and
  `missions.js` (mission data/registry, imported by `script.js`).
- **No backend / AI / auth / routing.** All progress lives in `localStorage`
  under the key `ech.progress.v1`.
- **`script.js` is an ES module** (`<script type="module">`). Its functions are
  **NOT global** — console-based test navigation does not work. Drive the app
  through the real UI (or prime `ech.progress.v1`) instead.
- **Three assignments**, keyed everywhere by id: `mission-001` (M1/A1),
  `mission-002` (M2/A2), `mission-003` (M3/A3), with parallel `m1*`/`m2*`/`m3*`
  element-id, state, and function namespaces. See [missions.md](./missions.md).

## State & persistence model

- **Single save path**: `saveProgress()` serializes all durable state to
  `ech.progress.v1`; `restoreSavedProgress()` reads it back; `clearSavedProgress()`
  wipes it. Per-mission resets `resetMission` / `resetMission2` / `resetMission3`
  clear ONE mission's state.
- **Per-mission state vs career memory**: mission progress (pins, confidence,
  containment, completion flags) is cleared by that mission's reset.
  `operationalHistory` (analyst reputation) is **career memory** — only
  `clearSavedProgress()` clears it, never the per-mission resets.
- **Session-only vs durable flags**: `missionStarted` / `m2Started` / `m3Started`
  are session-only (NOT persisted), so they cannot gate "already started" across a
  reload. The durable resume flag is `missionLaunched[missionId]`
  (`{"mission-001","mission-002","mission-003"}`), saved at the end of each
  `beginMission*`. `hasMissionProgress(missionId)` returns true when
  `missionLaunched` is set OR any persisted activity exists (completion flags,
  evidence log, pins, decision, files reviewed, confidence) — this is what makes a
  mid-mission reload resume the live investigation instead of re-onboarding.
- **Corrupt-state hardening (apply to every restore)**: restores validate against
  allowlists (e.g. only accept pin/reasoning/briefing ids that exist in the data
  tables), clamp numeric values (confidence/containment/pressure 0–100), filter
  feeds to strings + cap length, and force terminal values (e.g. containment→100
  when the mission is complete). Never trust raw `localStorage`.

## Evidence & Investigation Board

Students do not auto-receive evidence — they **pin** reviewed findings and
**classify** each one's suspicion level.

- Data: `EVIDENCE_RATINGS` (per-mission correct levels), `SUSPICION_LEVELS`
  (the shared 4-level scale: Normal / Low / Helpful Supporting / Critical — there
  is **no 5th level**; new missions map their wording onto these four), runtime
  `investigationPins`, `pinnableFindings`, `pinXpAwarded`.
- Flow: `showPinPrompt` → `showClassificationPrompt` → `handlePinClassification`;
  rendered by `renderInvestigationBoard` / `buildInvestigationQualityHTML`.
- **M1 Evidence Confidence is derived purely from pins**
  (`recomputeConfidenceFromPins`). M2/M3 keep command-based confidence and add the
  pin contribution once on top.
- **M1 completion gate**: pinning `suspicious_file.txt` as Critical unlocks the
  decision/finding flow; `canCompleteM1()` re-opens the gate on resume (no soft-lock).

## Confidence meters (two independent tracks)

- **Evidence Confidence** — derived from pins (above).
- **Analyst Confidence** — a separate "do you understand the case" meter:
  M1 `m1AnalystScore` (DERIVED/idempotent via `recomputeM1AnalystScore`, level
  Low/Building/Strong/Ready), M2 `m2AnalystConfidence` (tiers
  Low/Building/Developing/Strong/Ready), M3 `m3AnalystConfidence`. Analyst scores
  are **recomputed**, never incremented, so they are safe across re-reads/reloads.

## Reasoning layer (one prompt at a time)

Between reading evidence and classifying it, the analyst answers a multiple-choice
"why does this matter" prompt. M1 uses `M1_REASONING` (`showM1ReasoningPrompt` /
`handleM1Reasoning`); M2 uses `M2_REASONING` (`renderM2Reasoning` /
`handleM2Reasoning`); M3 uses `M3_REASONING`. Correct → confidence bump + manager
confirm + advance to classification; wrong → gentle retry, no penalty.

## Reactive incident engines (additive layers, beginner-friendly)

All of these are scripted, frontend-only immersion layers — no real attacker, no
branching AI. They are **capped** so a beginner can never be punished into a
soft-lock.

- **Event toasts (`EVENT_TOAST_TYPES`, `EVENT_TOAST_DURATIONS`)**: one major alert
  at a time (`EVENT_TOAST_MAX = 1`), drained by `pumpEventToasts`. Per-type read
  durations. Host sits top-center above the terminal.
- **Blue Team identity (mission-keyed)**: the student is a Blue Team defender.
  State is keyed objects (`blueTeamContainment`/`blueTeamSteps`/`blueTeamRedActive`/
  `blueTeamFeeds`); `BLUE_TEAM_DOM` + `btDom`/`btMissionId` resolve per-mission
  element ids; every engine fn takes `missionId` first. A monotonic **containment
  ladder** (credited one-time `stepId`s) drives a 0→100% bar.
- **Adversary escalation (Stage 3)**: `triggerEscalationEvent` raises
  `incidentPressure[missionId]` (clamped to `ESCALATION_MAX` "Moderate" ceiling)
  and nudges threat up one notch (`raiseThreatOneStep`, monotonic).
  `containThreatActivity` relieves pressure. An idle watch escalates a stalled
  student; `noteInvestigationActivity()` resets it.
- **Containment actions (Stage 4, M1)**: `CONTAINMENT_ACTIONS` — defensive choices
  gated on collected evidence; correct actions raise containment / lower threat,
  the poor one only warns. Locked after completion.
- **Reactive incident evolution (28B, M1)**: data-driven `INCIDENT_EVOLUTION` beats
  scheduled after the Blue Team decision so the choice visibly changes what happens
  next. Ephemeral (not persisted).
- **Cinematic interruptions (28C)**: `showIncidentInterruption` layers a brief
  dim/pulse/flicker AROUND (never instead of) the toast for major moments only.
- **Persistent adversary presence (30A)**: a `.red-team-panel` whose state is
  **DERIVED at render** from already-persisted signals — no new persistence.

## Shared "3-way" mission helpers

When adding or touching a mission, these helpers MUST branch on the new mission id
or it silently routes to M1: `pushManagerMessage`, `setCurrentObjective`,
`renderAllMiniMaps`, `setMapButtonsAttention` / `clearAllMapButtonsAttention`,
`activeCinemaMission` / `activeTerminalOutput`, `buildOperationalAssessmentHTML`,
`updateOperationalReputation`, and `calculateAnalystBehavior` (counts missions done
/ containment / reasoning / critical pins / decisions across all missions).

## Resume-safety & teardown pattern

`endGuidedRun()` is the **central teardown hub** — every mission-exit path
(missions map, overview, back-nav, reset, demo-abort, resume) routes through it.
It cancels all pending timers (guided launch, escalation watch, analysis delays,
incident evolution/cinematic, adversary intro, terminal typing) and unbinds
listeners. **Rule:** any new delayed callback must be (a) tracked in a cancel-safe
timer, (b) torn down in `endGuidedRun()`, and (c) guarded so it bails if it would
fire off-screen (e.g. check the dashboard is visible + `mission-running` +
`missionStarted` + `!missionComplete` + `!demoRunning`).

## Mission map system

`MISSION_MAP` holds per-mission title/role/threat/briefing/skills/transmission.
`missionMapStatus(missionId)` computes available/completed/locked from
`missionComplete`/`mission2Complete`/`mission3Complete`. Renderers:
`renderMissionMapStates`, `renderMissionDetails`, `renderMapTransmission`,
`renderMiniMap`/`renderAllMiniMaps`. The map is a pure selection layer — it reuses
existing progress flags and adds no second progress system.

## Opt-in guided demo (M1 only) — side-effect isolation

The "Watch Demo First" walkthrough must never leak into the real run:
`suppressSave = true` (nothing persists), `igEnabled = false` (no spotlight
overlap), runtime engines guard on `demoRunning`, a trust snapshot is restored on
teardown, and `abortDemo()` is the single silent teardown (hooked into the top of
`endGuidedRun()`).

## Key gotchas

- **ES module** → functions are not global (see App shape).
- **CSS append-order**: most active-mission overrides are appended at the END of
  `style.css` and rely on source-order winning specificity ties. When adding a
  rule that interacts with the responsive blocks (e.g. `grid-template-rows`),
  re-assert the responsive value in the new media query or it clobbers them.
- **e2e localStorage frame mismatch**: the test harness `page.evaluate` writes to
  the proxy-shell frame, but the app reads its OWN nested-iframe localStorage. You
  CANNOT prime `ech.progress.v1` from the harness — test restore by driving the app
  UI and then reloading.
- **`jumpToNextAction` / boot wiring**: it is a hoisted top-level function; its
  `boot()` forEach wiring must not ship without the definition or boot throws a
  `ReferenceError`.
