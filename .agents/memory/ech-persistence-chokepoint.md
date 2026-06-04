---
name: Persistence chokepoint (UI-only feature safety)
description: The single function any cosmetic/replay/overlay feature must avoid to stay side-effect-free.
---

# Persistence chokepoint

`saveProgress()` is the **single** persistence chokepoint: it writes the authoritative
`ech.progress.v1` localStorage blob **and** triggers the cloud-sync queue
(`queueCloudSync`, debounced, INSERT-once on `profiles`). `awardXP()` calls
`saveProgress()`.

**Rule:** any presentation-only feature (replay/spotlight tours, overlays, cosmetic
toasts) must reach **neither** `saveProgress()` **nor** `awardXP()`. That is the
necessary-and-sufficient condition for "zero writes to localStorage progress, the
sync queue, and Supabase." (Supabase writes only originate from the completion/XP
helpers in `backendSync`; general per-action analytics is a deliberate no-op.)

**Why:** proven by the Replay Safety Audit — the Replay Guide is side-effect-free
precisely because none of those are reachable from it; its only write is the inert,
never-read flag `ech.replayGuideUsed.v1`.

**How to apply:** to prove a UI feature is side-effect-free, trace reachability to
`saveProgress`/`awardXP` and grep its bodies for
`saveProgress|awardXP|queueCloudSync|supabase|fetch\(|trackXpEvent`.
**Caution:** the briefing-review path (`reviewBriefingCard`) and the first-run guided
briefing DO persist (one-time briefing XP) — they are onboarding, not replay; never
reuse them to build a "replay the briefing" feature.
