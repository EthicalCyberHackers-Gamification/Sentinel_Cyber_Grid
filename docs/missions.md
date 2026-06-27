# Missions & Course Structure

The campaign assignments and the shared mission scaffolding. See
[architecture.md](./architecture.md) for the systems these missions plug into and
[ui-guidelines.md](./ui-guidelines.md) for how the dashboards are laid out.

> **History note — read this first.** An earlier version of this file described
> three missions hard-wired into `script.js` (`runM2Command`, `m3Terminal`,
> `M2_REASONING`, `beginMission3`, …). **That engine has been superseded.** The
> shipping gameplay now runs through the **Career Simulator** (`career-sim.js`) for
> assignments 1–4 and the **Progressive Lab** (`lab.js`) for assignments 5–6.
> `script.js` survives as the *host shell* (Operations Center home, mission map,
> the launch chokepoint, canonical metadata). Its old per-mission engines are still
> in the file but are a dead fallback — the map routes around them. If you came here
> from an older GitHub snapshot showing "3 simplified missions", that snapshot is
> just the stale doc, not the current game.

## Career arc

An **Intern → Junior SOC Analyst → SOC Analyst** vertical slice. The campaign is
**six assignments** in a fixed order (`MISSION_PLAY_ORDER`, in `mission-order.js`),
grouped into three role tracks (`COURSE_GROUPS` in `script.js`):

- **Cybersecurity Intern** — assignments 1–4
- **Junior SOC Analyst** — assignment 5
- **SOC Analyst** — assignment 6

Career-facing copy says "Assignment" / "Operation"; internal ids stay
`mission-00N`. The Operations Center home and scorecards derive the player's rank,
a promotion %, and a readiness tier from progress. See [roadmap.md](./roadmap.md)
for the forward arc.

Canonical per-mission metadata — title, severity, region, difficulty, duration,
objective, skills — lives in **`COURSE_MISSION_META` (`script.js`)**. That is the
single source of truth for display titles and severities; do not trust older
hardcoded labels elsewhere in the codebase.

## Which engine runs each assignment

`launchMissionFromMap()` (the one launch chokepoint in `script.js`) routes:

1. If the **Career Simulator** has a definition for the mission
   (`window.echCareerHasMission`) → `window.openCareerMission(missionId)`.
   This covers **assignments 1–4** (`CAREER_MISSIONS` in `career-sim.js`).
2. Else if the mission has a **lab dataset** (`LAB_MISSION_IDS`) → `openLab(missionId)`.
   This covers **assignments 5–6** (`lab.js`, datasets under `lab.missions/`).
3. The legacy per-mission branches further down in `script.js` are only reached
   when neither of the above handles the mission — i.e. never, for shipping content.

| Assignment | Engine | Source |
| ---------- | ------ | ------ |
| 1–4 | Career Simulator | `career-sim.js` → `CAREER_MISSIONS` |
| 5–6 | Progressive Lab | `lab.js` → `lab.missions/mission-005.js`, `mission-006.js` |
| host | Operations Center home, mission map, launch, metadata | `script.js` |

## The six assignments

From `COURSE_MISSION_META`:

| # | id | Title | Severity | Region | Tier | Engine |
| - | -- | ----- | -------- | ------ | ---- | ------ |
| 1 | `mission-001` | Protect Sensitive Information | HIGH | EMEA | Beginner | Career Sim |
| 2 | `mission-002` | Investigate Network Assets | MEDIUM | APAC | Beginner | Career Sim |
| 3 | `mission-003` | Investigate Suspicious Authentication Activity | HIGH | NA-EAST | Intermediate | Career Sim |
| 4 | `mission-004` | Investigate a Data Exfiltration Incident | CRITICAL | LATAM | Intermediate | Career Sim |
| 5 | `mission-005` | Account Takeover Investigation | MEDIUM | MENA | Intermediate | Prog. Lab |
| 6 | `mission-006` | Anomalous Scan Triage | LOW | SEA | Advanced | Prog. Lab |

**Themes:**

- **Assignment 1 — Protect Sensitive Information.** Review an outbound release
  package a contractor assembled, classify the sensitive data inside (PII, regulated
  PCI records, confidential pricing), and decide whether it can safely leave
  CyberCorp. The flagship, most-instrumented mission and the only **file-model**
  assignment (see below).
- **Assignment 2 — Investigate Network Assets.** Map the office subnet, compare it
  to the approved asset inventory, and find the device that doesn't belong.
- **Assignment 3 — Investigate Suspicious Authentication Activity.** Reconstruct a
  login timeline (e.g. 47 failed logins in 7 minutes from one external address) and
  decide whether the Finance account was really taken over.
- **Assignment 4 — Investigate a Data Exfiltration Incident.** Trace how customer
  data left the network and tie the four cases together as one adversary campaign.
- **Assignment 5 — Account Takeover Investigation** and **Assignment 6 — Anomalous
  Scan Triage** run in the Progressive Lab.

## The Career Simulator engine (assignments 1–4)

Each mission is a structured data object in `CAREER_MISSIONS` (`career-sim.js`);
`openCareerMission(missionId)` opens it and **one engine renders all four**. There
are two interaction models:

- **File-model** (assignment 1 only): the player surfaces evidence by reading
  case files. `investigationComplete()` is true once all file evidence is surfaced.
- **Command-model** (assignments 2–4): the player runs terminal commands
  (`simRunCommand`); each mission declares its own `core` commands.
  `investigationComplete()` is true once all `core` commands have been run.

Shared surfaces — one code path, gated per-mission by config flags so missions stay
independent (see the memory notes / `architecture.md`):

- **Analyst Notebook** (`renderEvidencePanel`) — the shared judgment surface for all
  four missions, framed as a live comms thread with supervisor **Sarah Reyes**. Each
  evidence item is judged in two steps: an *observation* then a *justification*.
- **Decision Dock** — a shared, **non-blocking** dock with up to three prioritized
  modes: the graded call (a **determination** via chips for assignments 2–4, or a
  **classification** for assignment 1), a reconsideration prompt, and a finding
  draft. Recording a pick never ends the mission.
- **Case Board** (assignment 1) — a passive, self-building evidence board.
- **Handling actions / decision stage** — once the investigation is complete, the
  engine reveals the mission-ending response actions. Players **cannot jump to them
  early**: for command-model missions, typing `decide`/`actions` (or pressing the
  dock's forward button) before `investigationComplete()` is refused with guidance
  to keep investigating.
- **3-gauge performance bar** — three composite red / yellow / green pointer gauges
  sit over six underlying resources that drive the verdict.
- **Mission intro cutscene** — a short, presentation-only intro plays on every
  launch.

**Completion & scoring.** Completion runs through a fixed chain —
`finalizeMission()` → `window.echCareerComplete()` → `notifyLabComplete()` (sets the
mission flag, awards XP, saves) → `notifyAssignmentComplete()` (cloud sync, comms,
attempt close) — so each mission finalizes once regardless of which completion path
fired. The verdict tier is skill-driven; the gauges move via resource deltas.
Progress persists through `saveProgress()` to `localStorage` (`ech.progress.v1`) and
the optional Supabase mirror.

**Cross-mission memory.** Earlier choices carry forward: `career-dynamic.js`
reshapes a later mission's framing/evidence (non-mutating, computed once on open),
and a "the company remembers" continuity layer records campaign history. These are
presentation-only and never alter scoring.

## The Progressive Lab (assignments 5–6)

Assignments 5–6 run in the terminal-first **Progressive Lab** (`lab.js`), with
per-file datasets under `lab.missions/`. Commands route on the **first typed word**.
The lab shares the host's launch gate and completion-prerequisite guards with the
Career Simulator, and persists through the same `localStorage` progress key.

## Scorecards & career memory

Each mission ends with a scorecard / operational assessment. Completion updates the
persisted career memory (rank, reputation, campaign history) that the Operations
Center home reads back to render promotion progress and continuity flavor. See the
Operations Center section in [ui-guidelines.md](./ui-guidelines.md).
