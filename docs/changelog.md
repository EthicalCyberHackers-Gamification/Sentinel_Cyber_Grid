# Changelog — Milestone History

Compressed chronological history of completed milestones. Each entry is a one-line
summary; the **durable design** lives in the topic docs
([architecture.md](./architecture.md), [missions.md](./missions.md),
[ui-guidelines.md](./ui-guidelines.md)) — this file is "what shipped, in order",
not the reference manual.

All milestones are frontend-only, additive, and were verified (typecheck/`node
--check` clean, clean boot, architect review) unless noted.

| Milestone | Summary |
|-----------|---------|
| **24I — Mission Briefing Room** | Reusable briefing layer between selection and investigation: 3 review cards, readiness gate, launch sequence, +10 XP once. Data-driven via `MISSION_BRIEFINGS`. |
| **Evidence Prioritization + Investigation Board** | Students manually PIN + CLASSIFY findings (4-level `SUSPICION_LEVELS`); M1 confidence derived purely from pins; pinning suspicious file Critical gates M1 completion. |
| **25A — Focus Mode + Expandable Panels** | Manager chat feed, `body.focus-mode`, collapsible cards, Current Objective card, command grouping, sound-free fx helpers. |
| **25B — Guided Spotlight Mission Flow** | Guided briefing overlay (one card at a time) + non-blocking spotlight tour; auto-opens on fresh load, resume-safe via durable `missionLaunched`. |
| **25C — Cyber Missions Map** | 2D selection screen after sign-in; node states from `missionMapStatus`; locked nodes viewable, launch disabled. |
| **25D — Split-Screen Layout** | 70/30 active-mission split (superseded by 25E). |
| **25E — Three-Column Active Layout** | Current "mission-control workstation" layout: LEFT Mission Control / CENTER terminal / RIGHT Live Status; responsive. |
| **Command-on-click typing** | Clicking an M1 command types it into the terminal first, then runs it; cancel/flush-safe. |
| **Opt-in Guided Demo (M1)** | "Watch Demo First" walkthrough that clicks + types real commands and coaches each area; fully side-effect isolated (`suppressSave`/`demoRunning`). |
| **Background Soundtrack** | Looping MP3 via `@assets`, started on first user gesture, floating mute toggle. |
| **Post-completion UX** | Paced terminal output (shared reveal queue) + Next-Step guidance. |
| **26A — Contextual Event Toasts** | `EVENT_TOAST_TYPES` queue, one alert at a time, per-type durations; triggers across M1/M2. |
| **Adversary Presence (Stage 1)** | M1 "attacker active" red/blue toasts on top of 26A; throttled; resume-safe delayed intro. |
| **Blue Team Identity (Stage 2)** | Mission-keyed Blue Team defender engine: containment ladder 0→100%, status panel, feed; M1+M2 share one engine (`BLUE_TEAM_DOM`). |
| **Adversary Escalation (Stage 3)** | Attacker reacts to progress; `incidentPressure` capped at "Moderate", threat monotonic to "High"; idle watch; beginner-safe. |
| **Containment Actions (Stage 4, M1)** | Evidence-gated defensive actions raise containment / lower threat; THREAT CONTAINED completion banner; locked after win. |
| **Guided One-Clue-at-a-Time (M1)** | Files revealed one at a time (the `cat-*` cards); read → classify directly; single glowing "next" clue. |
| **27A — Investigative Reasoning (M1)** | Per-file reasoning MCQ between read and classify; separate Analyst Confidence meter (derived/idempotent); +25 XP bonus once. Suspicious file no longer self-labels. |
| **28B — Reactive Incident Evolution (M1)** | Decision schedules delayed `INCIDENT_EVOLUTION` beats + 4 reactive outcomes; ephemeral, cancel-safe. |
| **Readable Alerts + Manual Command Sync** | Toasts moved top-center, longer dwell, one-at-a-time; typed M1 commands drive progression at click parity; friendly errors. |
| **28C — Cinematic Incident Interruptions** | `showIncidentInterruption` layers dim/flicker/pulse AROUND major moments; mission-complete transition; teardown gap at M1→M2 handled. |
| **29A — Spatial Layout (Ops Center)** | Persistent `.ops-strip`, center-glow/cool-left/warm-right washes, environmental region pulses, ambient ops line; M3 "Monitoring". |
| **30A — Persistent Adversary Presence** | `.red-team-panel` with DERIVED state (no new persistence): 6 states, revealed goals, rotating movement lines, adapts to escalation/containment. |
| **31A — Mission 2 Pattern Parity** | M2 gains per-step reason→pin gameplay, M2 Analyst Confidence, 4-option Blue Team decision, network-themed Red Team, outcome tiers + scorecard rows. |
| **32A — Operations Career Entry** | `#moduleLanding` reframed as "CyberCorp Operations Center" (presentation-only): status strip, career track, manager + threat board; map relabeled "Operations Map". |
| **33A — Player Identity & Reputation** | Analyst reputation derived at render; only new persisted state is `operationalHistory` (career memory, upserted, capped); profile + Previous Operations + scorecard assessment. |
| **Phase 2 — Intern Career Vertical Slice** | Career-facing "Assignment"/"Operation" terminology, narrative continuity, living SOC threat board, promotion readiness — internal ids preserved. |
| **A3 — Reconnaissance Detection (mission-003)** | Full playable threat-hunting assignment mirroring A2 (`m3*`): netstat → whois → grep theme, CDN false lead, full engine/persistence/map unlock; shared 3-way helpers extended. |
| **Active Assignment Layout Fix** | No-zoom playable dashboards: page scrolls during play, bounded terminal, sticky objective, "Jump to Next Action" button on all 3 dashboards. |
| **35A — Command Preview + Manual Execution** | Command cards LOAD the command into the terminal input instead of running it; student presses Enter to execute. Reusable `loadCommandToTerminal`; M2/M3 inputs enabled + reverse-mapped (`keyForTypedCommand`) to the existing runners; friendly guidance on wrong/locked input; applies to A1/A2/A3. Demo decoupled to keep auto-run. |
| **35B — Command Knowledge Hover System** | Hover/keyboard-focus any command card (A1/A2/A3) for a concise learning tooltip: what it does, SOC use, what to look for, optional "More detail" (beginner explanation + advanced equivalent). Shared interactive tooltip placed beside the card (never over the terminal). Data in `COMMAND_KNOWLEDGE` (+ verb fallback); wired via `attachCommandTooltip`. M2/M3 locked cards switched from `disabled` to `aria-disabled` so they stay inspectable while still un-runnable. |
| **B0 — Supabase Backend Foundation** | Optional, **local-first** cloud mirror (no auth, no login): `lib/supabaseClient.js` (null client + "local-only mode" when env unset; anonymous `anon_<hex>` id; subtle dev status indicator — Local Only / Connected / Sync Delayed) + `lib/backendSync.js` (7 fire-and-forget sync fns + batched `trackGameEvent`). localStorage stays authoritative; every call is non-blocking, retry-once, never throws. Replayable attempts: start reuses an open attempt (resume-safe), restart abandons, complete is idempotent across both quiz + engine completion paths. Minimal hooks in `script.js` (boot/save/begin×3/complete/restart×3 + ~10 gameplay events). Schema in [SUPABASE_SCHEMA.md](./SUPABASE_SCHEMA.md). Tables not yet created → benign table-not-found until the schema SQL is run. |
