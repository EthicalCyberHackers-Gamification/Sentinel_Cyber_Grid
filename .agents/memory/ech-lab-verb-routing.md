---
name: Lab command verb routing (first-word)
description: The progressive lab terminal routes by the FIRST typed token; multi-word verb maps must key on that first word.
---

The progressive Mission-001 lab (`lab.js`, deep-link `?lab=mission-001` in
ops-center-prototype) parses commands by splitting on whitespace and routing on
`parts[0]` (the first word). Its `LAB_VERB` map therefore MUST be keyed by the
first word the player actually types — not by the internal action/tool name.

**Why:** the final action's dock cmd + objective + help text all say
`submit report`, but the verb map was keyed `report` (the tool key), so typing
`submit report` resolved `parts[0] = "submit"` → not found → a hard Stage-5
dead-end (scorecard unreachable). The dock button hit the same path.

**How to apply:** whenever you add or rename a multi-word lab command, key
`LAB_VERB` on the first token (`submit`→tool `report`, `quarantine`→`quar`,
`check`→`recips`, `inspect`→`login`, `review`→`alerts`, `contain`→`host`). After
any such change, dry-run every multi-word `cmd` in `LAB_TOOLS` through both the
typed path and the dock-click path (they share `labRun`).
