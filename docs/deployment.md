# Deployment & Environment

How the Ethical CyberHackers Platform is built, run, and shipped. See
[architecture.md](./architecture.md) for how the app itself is structured.

## What this app is

A **frontend-only** browser app — no backend, database, AI, or auth. It is a
Vite-built static site living in the pnpm monorepo at
`artifacts/ethical-cyberhackers-platform/`, served at preview path `/`.

All user progress is stored client-side in `localStorage` under the key
`ech.progress.v1`. There is nothing server-side to provision; deploying is shipping
static assets.

> **Note on monorepo scaffolding:** the repo also contains an `api-server`
> artifact (Express/Drizzle/Postgres/Orval) from the workspace template. The ECH
> platform does **not** use it — ignore the DB/codegen commands when working on
> this product.

## Run & operate

Apps run via Replit **workflows**, not root-level `pnpm dev`:

- `artifacts/ethical-cyberhackers-platform: web` — the dev server workflow (restart
  this to apply changes / verify the app).
- Verify a build with `pnpm --filter @workspace/ethical-cyberhackers-platform run typecheck`
  (use `typecheck`, not `build` — `build` needs workflow-provided `PORT`/`BASE_PATH`).
- Quick JS sanity check: `node --check artifacts/ethical-cyberhackers-platform/script.js`.

The dev server binds to the `PORT` env var the workflow assigns and allows all
hosts (the preview is a proxied iframe). Asset URLs use the artifact base path
(`import.meta.env.BASE_URL`), never root-relative `/...` paths.

## Building & publishing

- The artifact builds to static assets via Vite.
- Publish through Replit deployment (static hosting) — Replit handles build,
  hosting, TLS, and health checks. Published URLs are exposed over HTTPS on the
  domains in `$REPLIT_DOMAINS` and route through the shared proxy automatically.
- Because state is `localStorage`-only, there is no data migration or env-var
  configuration step for production.

## Assets

The background soundtrack MP3 is imported via Vite's `@assets` alias
(`import soundtrackUrl from "@assets/…mp3"`), which resolves to a served URL — keep
new media in the asset pipeline rather than referencing raw paths.

## Testing notes

- e2e runs against the live preview through the shared proxy
  (`$REPLIT_DEV_DOMAIN/`).
- **Cannot prime `localStorage` from the test harness** — `page.evaluate` writes to
  the proxy-shell frame, but the app reads its OWN nested-iframe storage. Test
  resume/restore by driving the app UI and reloading. (See
  [architecture.md](./architecture.md#key-gotchas).)
