---
name: M1 vs M2/M3 command execution asymmetry
description: The two different command-execution architectures in the platform and what that means for any terminal/typed-input feature.
---

The three assignments execute commands two different ways, and this matters for
any feature that runs commands from the terminal input (typed or loaded).

- **M1 (mission-001) is text-parser-driven.** `runCommand(text, key)` →
  `processCommand(text, key)` interprets raw command strings (`pwd`, `ls`,
  `cd <dir>`, `cat <file>`) and resolves a keyless typed command to its button
  key itself, so typed and clicked commands advance identically.
- **M2/M3 (mission-002/003) are key-driven.** Cards/runners operate on a command
  KEY (e.g. `ip-addr`, `ping`, `nmap`, `review`), not the literal text. The
  literal command lives in `M2_COMMANDS[key].cmd` / `M3_COMMANDS[key].cmd`.

**Why this matters:** to execute *typed* terminal text in M2/M3 you must
reverse-map text → key against each map's `.cmd` field (see
`keyForTypedCommand`), then call the existing `runM2Command`/`runM3Command` so all
unlock chains, reasoning gates, pins, confidence, and persistence stay intact.
Do NOT re-implement M2/M3 execution from the text — always route back through the
key-based runner.

**How to apply:** any "type a command and run it" / terminal-input feature must
branch per mission: M1 = pass the text to `runCommand`; M2/M3 = resolve a key
first, then call the key runner. Also note the opt-in M1 demo (`demoClickCommand`)
must auto-run independently of the card click — card clicks now only LOAD the
command (Milestone 35A), so the demo types + runs directly rather than relying on
`btn.click()`.
