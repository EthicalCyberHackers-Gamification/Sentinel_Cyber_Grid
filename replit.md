# Ethical CyberHackers Platform

A frontend-only, browser-based cybersecurity training game that casts the player as
a Blue Team SOC analyst working through guided, beginner-friendly threat-hunting
assignments.

## Product overview

- Lives at `artifacts/ethical-cyberhackers-platform/` (preview path `/`) inside a
  pnpm monorepo.
- **Frontend-only** — no backend, database, AI, or auth. All progress is stored in
  the browser's `localStorage` under the key `ech.progress.v1`.
- Three playable assignments: `mission-001` (Credential Phishing), `mission-002`
  (Network Exposure Review), `mission-003` (Reconnaissance Detection).
- The app is four files: `index.html`, `script.js`, `style.css`, and
  `missions.js` (mission data, imported by `script.js`). `script.js` is an **ES
  module** — its functions are NOT global.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Product: vanilla HTML/CSS/JS built with Vite, deployed as static assets
- _Monorepo scaffolding only (unused by this product): an `api-server` artifact
  using Express 5 / PostgreSQL + Drizzle / Zod / Orval._

## Run & operate

- App runs via the Replit workflow `artifacts/ethical-cyberhackers-platform: web`
  (restart it to apply changes / verify). Do not run `pnpm dev` at the repo root.
- `pnpm --filter @workspace/ethical-cyberhackers-platform run typecheck` — verify
  the artifact (use `typecheck`, not `build`).
- `node --check artifacts/ethical-cyberhackers-platform/script.js` — quick JS sanity check.

## Deployment

Static site published through Replit deployment (build, hosting, TLS, health checks
handled automatically). No data migration or env-var setup — state is
`localStorage`-only. See [docs/deployment.md](./docs/deployment.md).

## Documentation

Detailed docs live in [`/docs`](./docs):

- [docs/architecture.md](./docs/architecture.md) — system design: state &
  persistence model, evidence/pin system, confidence meters, reactive engines,
  shared "3-way" mission helpers, resume-safety pattern, key gotchas.
- [docs/missions.md](./docs/missions.md) — the three assignments, briefing room,
  guided onboarding, mission map, scorecards.
- [docs/ui-guidelines.md](./docs/ui-guidelines.md) — layout systems (focus mode,
  3-column, spatial), terminal behavior, alerts/animations/soundtrack, Operations
  Center home, CSS conventions.
- [docs/roadmap.md](./docs/roadmap.md) — career arc and natural next steps.
- [docs/deployment.md](./docs/deployment.md) — build, run, publish, env, testing notes.
- [docs/changelog.md](./docs/changelog.md) — compressed milestone history.

## User preferences

_Populate as the user states durable preferences worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and
  package details.
