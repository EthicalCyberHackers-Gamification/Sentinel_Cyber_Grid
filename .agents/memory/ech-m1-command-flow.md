---
name: M1 command-unlock flow change checklist
description: Cross-cutting things to re-verify whenever Mission 1's command/file unlock flow changes in the Ethical CyberHackers Platform.
---

When changing how Mission 1 (mission-001) reveals/unlocks command or file buttons,
two collaborators silently depend on the old behavior and must be re-checked:

1. **The opt-in demo** walks a CURATED path that jumps ahead (e.g. opens
   finance/suspicious without classifying the earlier files). If you gate file
   reveals on prior classification, the demo's `cat` buttons won't exist, and
   reading a rated file would pop the guided classify prompt mid-demo.
   - Guard per-file guided behavior with `!demoRunning`.
   - Let the demo reveal needed buttons on demand (`demoClickCommand`).

2. **Resume** is fragile because `unlockedKeys` (and `m2UnlockedCmds`/
   `furthestSeqIndex`) are NOT persisted and `currentDir` resets to `~`. After a
   reload the player re-runs cd/ls to rebuild the command set. Make any new
   guided chain resume-safe: re-reading an already-correctly-classified file
   should walk the chain forward rather than soft-lock.

**Why:** both broke (or nearly broke) during the "one-clue-at-a-time" M1 rework —
the demo because file cards reveal one at a time now, and resume because the
unlock chain isn't durable.

**How to apply:** before finishing any M1 unlock/flow change, mentally (or via
e2e) run: a fresh play, a mid-mission reload, and the "Watch Demo First" path.
