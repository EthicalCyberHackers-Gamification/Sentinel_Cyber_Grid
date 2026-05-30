---
name: Ethical CyberHackers Platform — session/teardown architecture
description: Non-obvious rules for the frontend-only training app (script.js ES module) — central teardown hub, autoplay gesture, and ephemeral-vs-persisted state.
---

## `endGuidedRun()` is the central teardown hub
Every navigation/reset exit in the app (showMissionsMap, backToModuleOverview,
hideMission2Overview, backToMission2Overview, resetMission, resetMission2, and the
enterModule resume path) routes through `endGuidedRun()`.
**Rule:** any NEW session-scoped feature that owns timers, overlays, or temporary
global-state mutations (e.g. the opt-in demo) must hook its teardown INTO
`endGuidedRun()` (or be called from it) so it cannot keep running off-screen after the
user navigates away.
**Why:** a feature that only tears down via its own completion path leaks timers and
can fire actions on the wrong screen / leave flags (`suppressSave`) stuck.
**How to apply:** add an idempotent, re-entrancy-guarded abort fn and call it from the
top of `endGuidedRun()`. Set the guard flag false BEFORE calling `resetMission()`
(which itself calls `endGuidedRun()`) to avoid recursion. In the feature's own start
fn, do the briefing-overlay teardown via `endGuidedRun()` BEFORE arming the feature
flag, or that same guard will self-cancel the feature at startup.

## `resetMission()` does NOT reset `trustScore`
`resetMission()` wipes M1 pins/XP/evidence/alert but leaves `trustScore` untouched.
Any temporary flow that mutates trust (e.g. demo auto-classify → +5) must
snapshot/restore `trustScore` itself to stay side-effect-neutral.

## Audio autoplay needs a user gesture
Background audio (`new Audio()`, not in the DOM) must be `.play()`-ed from a real user
gesture or the browser rejects it. The first reliable gesture is the "Enter Module"
click (`#enterModuleBtn` → `enterModule()`). On a rejected `play()`, drop the
"started" flag so a later gesture (e.g. a mute toggle) can recover playback.

## Vite `@assets` alias for attached media
This artifact's vite.config maps `@assets` → repo-root `attached_assets/`. Import media
as `import url from "@assets/<file>"` (returns a served URL). `attached_assets/` is NOT
served directly — never use it as a raw src/URL path.

## Ephemeral vs persisted session flags
`missionStarted`/`m2Started` are session-only (lost on reload); the durable resume
signal is `missionLaunched` (persisted) + `hasMissionProgress()`. Don't gate
"already started" logic on the session-only flags across reloads.
