# Design-Complete Milestone — Stable Baseline

**Milestone tag:** `v0.4-design-complete`
**Status:** Design-complete, stable. This is the **pre-authentication baseline** —
captured before any authentication, user sign-up, or account-based persistence
work begins.

This document is a snapshot of the app as it stands today so there is a clear,
agreed reference point (and rollback target) before the next phase changes how
identity and persistence work. It is **documentation only** — no UI, scripts,
Supabase migrations, package files, or app logic were changed to produce it.

`v0.4-design-complete` is the **designated tag name for this milestone**. The
existing tags are `v0.1-baseline`, `v0.2-design-freeze`, and
`v0.3-infrastructure-stable`; `v0.4-design-complete` should be created to mark
this baseline (creating the git tag is a separate action — this document only
records the name):

```
v0.1-baseline → v0.2-design-freeze → v0.3-infrastructure-stable → v0.4-design-complete (new)
```

---

## 1. App purpose

The **Ethical CyberHackers Platform** (internally "CyberCorp SOC") is a
beginner-friendly, browser-based cybersecurity training game. The player is cast
as a **Blue Team SOC analyst** working an Intern → Junior SOC Analyst career arc,
completing guided, low-cognitive-load threat-hunting assignments.

Design pillars (unchanged at this milestone):

- **Single-device, no login.** Progress is local to the browser. There is no
  account system, no cross-device sync, and no auth.
- **Local-first.** The browser is authoritative; any cloud layer is optional and
  best-effort — the game is fully playable with the backend absent or down.
- **No punitive mechanics / no soft-locks.** One action, one reasoning prompt,
  one decision at a time. Reading or reasoning more always raises the score.

---

## 2. Stable features

The shipping product is `artifacts/ethical-cyberhackers-platform` (preview path
`/`). The following are stable and considered done at this milestone:

- **Operations Center home (OCV2).** A "CyberCorp Operations Center" landing
  screen with a three-panel layout: an alert/assignment queue, a Global
  Operations world map (equirectangular plate-carrée with region incident nodes),
  and a SOC comms / analyst roster panel. Presentation-only — derived entirely
  from existing progress state, re-rendered on every home-reveal path.
- **Operations / Mission Map.** A selection layer; node states (available /
  completed / locked) derived from completion flags. Locked nodes are still
  inspectable; their launch is gated.
- **Mission Briefing Room + guided onboarding.** A reusable briefing layer
  (review cards → readiness gate → launch sequence) and a guided, one-card-at-a-
  time onboarding with a non-blocking spotlight tour that auto-opens on a fresh
  mission and is skipped on resume.
- **Six playable assignments via the Progressive Lab** (see §3).
- **Investigation Board.** Players manually **pin** reviewed findings and
  **classify** each one's suspicion level (shared 4-level scale). Evidence
  Confidence is derived from pins.
- **Reasoning layer.** A "why does this matter" multiple-choice prompt between
  reading and classifying evidence; correct answers raise confidence, wrong
  answers retry with no penalty.
- **Two confidence meters.** Evidence Confidence (derived from pins) and a
  separate Analyst Confidence ("do you understand the case") that is recomputed,
  never incremented, so it is safe across reloads.
- **Reactive incident engines (beginner-safe, capped).** Event toasts (one major
  alert at a time), a Blue Team containment ladder (0→100%), adversary escalation
  (pressure capped at a moderate ceiling, threat monotonic), evidence-gated
  containment actions, reactive incident evolution beats, cinematic
  interruptions, and a derived persistent red-team panel.
- **Terminal behavior.** Command cards **load** a command into the terminal
  input (the player presses Enter to run); typed and card-loaded commands share
  one parser per assignment. Hover/keyboard-focus on any command card shows a
  concise command-knowledge tooltip.
- **Scorecards, analyst reputation & career ladder.** Each assignment ends with a
  scorecard and operational-assessment bullets; an `operationalHistory` career
  memory accumulates standing/traits/ratings; rank is derived from completed-
  mission count; the home derives a promotion % and readiness tier.
- **Replay / Briefing-Replay.** A presentation-only recap layer that chains
  briefing cards into a spotlight replay without persisting or awarding XP.
- **Audio/visual polish.** Looping background soundtrack (mute toggle), sound-
  free fx helpers, spatial ambiance, and a `prefers-reduced-motion` override on
  animation blocks.

---

## 3. Mission / Lab engine state

- The shipping experience for **all six missions** (`mission-001` … `mission-006`)
  is the terminal **Progressive Lab** (a 5-stage Linux-SOC workflow). Routing:
  `launchMissionFromMap()` sends any id in `LAB_MISSION_IDS` to `openLab()`.
- Lab mission data lives in `lab.js` (`LAB_MISSIONS`): `mission-001` and
  `mission-002` are defined inline; `mission-003`–`mission-006` are authored as
  separate ES modules under `lab.missions/` and spread in. The lab is wired into
  the host app via `configureLab()` hooks, and lab completion flows through
  `notifyLabComplete()` (sets the completion flag, awards the correct XP, guards
  the prerequisite chain, persists, and notifies — once per mission).
- The legacy non-lab mission engines and `GENERIC_MISSIONS` data
  (`missions.js`) remain in the codebase but are **bypassed for play**; for
  003–006 the generic block now effectively only supplies the quiz XP reward. It
  is retained, not active, and should not be treated as the live path.
- The separate `ops-center-prototype` artifact also contains experimental mission
  interiors (e.g. a SOC Console and an Evidence Holotable). These are
  **prototype-only** and are NOT part of the shipping mission engine (see §5).

---

## 4. Supabase / persistence status

**Local persistence (authoritative):**

- All durable gameplay state is stored in the browser's `localStorage` under
  `ech.progress.v1`, written through a single `saveProgress()` path and read back
  by the restore path. Restores are hardened against corrupt state (allowlist
  validation, numeric clamping, terminal-value forcing).
- This local contract is the source of truth for the entire game today.

**Supabase (optional, local-first cloud layer):**

- An optional cloud mirror exists (`lib/supabaseClient.js`, `lib/backendSync.js`).
  When `SUPABASE_URL` / `SUPABASE_ANON_KEY` are present it initializes a browser
  client **with no sign-in** (`persistSession:false`, `autoRefreshToken:false`);
  when unset it runs in "local-only mode". Every cloud call is best-effort —
  non-blocking, fire-and-forget, with errors swallowed/logged so they never throw
  into gameplay. The sync layer (`backendSync.js`) targets the current normalized
  tables (`profiles`, `missions`, `mission_attempts`, `xp_events`,
  `progress_snapshots`).
- The production schema is defined as SQL migrations in `supabase/migrations/`:
  `001_initial_game_schema.sql` (6 tables: `profiles`, `missions`,
  `student_progress`, `mission_attempts`, `xp_events`, `certificates`),
  `002_seed_missions.sql` (catalog seed), `003_server_triggers.sql`
  (SECURITY DEFINER rollup triggers), and `004_progress_snapshots.sql`
  (append-only snapshot store for cloud restore).
- **RLS is secure-by-default.** Using only the anon key, the browser can
  `SELECT` + `INSERT` (append-only ledgers) but **cannot `UPDATE`/`DELETE`** and
  cannot seed the read-only `missions` catalog.
- **Progression rollups are maintained server-side, no auth required.**
  `003_server_triggers.sql` adds `SECURITY DEFINER` triggers that run as the
  postgres role: an append-only `INSERT` into `mission_attempts` upserts the
  `student_progress` row and increments `profiles.missions_completed`, and an
  `INSERT` into `xp_events` increments `profiles.xp_total` / `trust_score`. So the
  browser keeps the rollups current **without ever needing `UPDATE` permission**.
  Dormant `auth.uid()` owner policies are also present in the schema for the
  future authenticated path.

> Note: `docs/SUPABASE_STATUS_REVIEW.md` is an earlier Phase-3B snapshot that
> reported the sync layer pointing at pre-migration table names ("Sync Delayed").
> The schema and migrations have since advanced (seed + triggers + snapshots).
> The invariant that matters for this milestone is unchanged: **the game is fully
> playable and authoritative locally regardless of cloud state.** Confirm the
> exact live sync wiring against the current code before relying on cloud writes.

---

## 5. Prototype vs. main-platform structure

The monorepo contains multiple artifacts; only one is the product:

- **Main platform (shipping):** `artifacts/ethical-cyberhackers-platform`. All
  future product work lands here. Core files: `index.html`, `script.js`,
  `style.css`, `missions.js`, plus the Progressive Lab (`lab.js`,
  `lab.missions/*`) and the optional cloud layer (`lib/*`).
- **Prototype (experiments only):** `artifacts/ops-center-prototype`. A sandbox
  for experiments (e.g. SOC Console / Evidence Holotable interiors). It is **not**
  the deployable product and features here are not "shipped".
- **Scaffolding (unused by this product):** an `api-server` artifact
  (Express/Drizzle/Postgres/Orval) and a `mockup-sandbox` design artifact exist
  from the workspace template. The game does not depend on them.

---

## 6. Known limitations

- **Single-device only.** No cross-device continuity; progress lives in one
  browser's `localStorage`.
- **No authentication / accounts.** There is no sign-up, login, or per-user
  identity.
- **Cloud identity is anonymous and not portable.** The cloud `profiles` row is
  keyed by a per-browser anonymous id and created INSERT-once; progression rollups
  are maintained server-side (see §4), but there is no account, so cloud state is
  **not portable across browsers or devices** and cannot be reclaimed after local
  storage is cleared. True cross-device continuity awaits the authenticated phase.
- **Cloud restore semantics.** Restore replays the **most-recent** snapshot (not
  the highest-progression one), and the append-only snapshot store can
  legitimately diverge from the normalized ledger.
- **Testing constraint.** End-to-end tests cannot prime `ech.progress.v1` from the
  harness (the harness writes the proxy-shell frame; the app reads its own nested-
  iframe storage) — resume/restore must be tested by driving the UI then
  reloading.

---

## 7. What must stay unchanged during the next phase

To keep `v0.4-design-complete` a clean rollback point, the next phase
(authentication / sign-up) should **add alongside** these surfaces, not rewrite
them:

- The four core shipping files: `index.html`, `script.js`, `style.css`,
  `missions.js` (UI and app logic).
- The Progressive Lab: `lab.js` and `lab.missions/*` (mission engine + data).
- The local-first persistence contract: the `ech.progress.v1` shape and the
  `saveProgress()` / restore path (it must remain authoritative and offline-safe).
- The optional cloud layer wiring (`lib/supabaseClient.js`, `lib/backendSync.js`)
  except where auth is deliberately introduced.
- The Supabase migrations/schema in `supabase/migrations/` and the package /
  workflow / build configuration.

Guiding rule: **local-first stays authoritative.** Auth and accounts are an
additive capability, not a replacement for offline play.

---

## 8. Next phase — authentication & user sign-up

The next milestone introduces optional **authentication, user sign-up, and
account-based persistence**, building on foundations already present:

- The schema already ships dormant `auth.uid()` owner RLS policies, so an
  authenticated user could securely upsert their own rows without relaxing the
  secure-by-default posture.
- On first sign-in, today's local `ech.progress.v1` progress should migrate into
  account-scoped rows; offline/local play must continue to work for signed-out
  users.

Open decisions for that phase (to be settled at its kickoff, not here):

- **Auth provider / approach** and how sign-in maps to a `profiles` row.
- **Writer identity** for normalized progression (authenticated owner vs.
  service-role writer) so profile totals and `student_progress` rollups can be
  maintained.
- **Local ↔ cloud reconciliation** rules: what becomes cloud-authoritative for a
  signed-in user vs. what stays local, and how to merge an existing local profile
  into a new account without data loss.

**Rollback:** if the auth phase needs to be reverted, return to the
`v0.4-design-complete` milestone.

---

_This file is a milestone marker. For deeper detail see `docs/architecture.md`,
`docs/missions.md`, `docs/ui-guidelines.md`, `docs/roadmap.md`,
`docs/changelog.md`, `docs/SUPABASE_SCHEMA.md`, and `docs/SUPABASE_STATUS_REVIEW.md`._
