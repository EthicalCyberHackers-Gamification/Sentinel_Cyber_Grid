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

## `afterCommand(key)` early-returns on an empty key
Command progression (unlocking, gates, decision flow) only runs through
`afterCommand(key)`, which bails immediately when the key is falsy. So a command run
WITHOUT its button key (e.g. a bare `runCommand("cat x")` or a typed-only command) does
NOT advance mission state.
**How to apply:** to make a command actually progress the mission (in the demo or any
scripted flow), trigger the real button `.click()` (which passes the key) rather than
calling `runCommand` with no key. Reserve no-key/typed runs for read-only commands
(`pwd`).

## Guided coach/tour overlays must out-rank floating fixed UI
The app has floating fixed controls that sit very high: `.soundtrack-toggle`
(z-index 9999) and `.focus-control-bar` (z-index 1200), both bottom-right. A guided
pop-out (`.ig-coach`/`.demo-coach`) placed near the bottom-right was silently covered by
these, so its Next button received no clicks (demo got "stuck").
**How to apply:** any guided overlay must (a) be z-indexed ABOVE the toggle (≥10000) and
(b) ideally hide the distracting floating controls while active (the demo adds
`body.demo-active` to CSS-hide them). Also clamp the coach's `top`/`left` inside the
viewport (`positionCoach`) so its buttons never render off-screen when the target is
scrolled to an edge.

## "Max N visible" toast/notification UIs must QUEUE overflow, not truncate
A capped notification stack (e.g. the event-toast system, max 2 visible) must enqueue
extras and render them as visible slots free up — NOT remove the oldest on overflow.
**Why:** burst events are common (one user action can fire 3+ toasts at once, e.g.
pin+classify emits two and a threat-rise emits a third). Removing the oldest on overflow
makes the first toast vanish almost instantly, breaking the "visible ~Ns" guarantee.
**How to apply:** track a visible-count + a pending queue; on each toast's fade-out
completion, decrement and pump the queue. Each toast then gets its full dwell time.

## Re-runnable command toasts need a "first run" flag captured BEFORE the unlock chain
M2 command handler (`runM2Command`) unlocks the NEXT command early in the function, so by
the time later side-effect blocks run, the next command is already unlocked. To fire a
one-time toast for a repeatable command (ping/nmap stay clickable), capture the first-run
boolean (`key==="ping" && !m2UnlockedCmds.has("nmap")`) at the TOP, before the unlock
loop mutates `m2UnlockedCmds`. M1 file-read uses the same idea: snapshot
`!m1FilesReviewed.has(name)` before the `.add()`.

## One shared paced-reveal queue serves both M1 and M2 terminals
The terminal "type-out" effect reveals OUTPUT lines one at a time from a single global
queue (`outputRevealQueue`); both `#terminalOutput` (M1) and `#m2Terminal` (M2) feed it.
Command ECHO lines must show instantly (flush the queue first), only OUTPUT/blank/info
lines are paced.
**Why:** M1 echoes via `printCommand` (always instant), but M2's `printM2Line` decides by
CSS class — and the main M2 flow emits its echo with class `m2-line--prompt`, while the
demo path uses `m2-line--cmd`. A naive `cls.includes("cmd")` check missed the real M2
echoes and queued them as slow output.
**How to apply:** treat BOTH `cmd` and `prompt` classes as instant command echoes in
`printM2Line`. Any new terminal writer must flush before echoing a command, and clears
(`clearTerminal`, `resetMission2`) must drop the queue (`clearTerminalOutputQueue`).
Clicking either terminal flushes pending reveals (skip-to-end).
