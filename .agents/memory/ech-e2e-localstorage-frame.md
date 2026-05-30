---
name: e2e localStorage frame mismatch
description: Why priming localStorage in the e2e harness fails to test saved-progress restore, and how to test restore correctly.
---

# e2e restore tests can't prime localStorage from `page.evaluate`

The app runs inside the Replit preview's **nested iframe**, but the test harness's
`page.evaluate(localStorage.setItem(...))` writes to the **proxy-shell top frame**.
They are different origins with different localStorage. Symptom: the test reads its
own value back (`getItem` non-null) yet the app ignores it on reload — even
pre-existing restore signals (e.g. XP) stay at defaults, because the app reads its
OWN frame's empty localStorage.

**Why:** seen while verifying ECH Milestone 33A persistence. A primed
`cyber_intern_progress` object was present (length 376) after reload but `#opsAnalystXp`
stayed at the default. Not a code bug — a frame/origin split.

**How to apply:** never test saved-progress restore by priming localStorage from the
harness. Instead drive persistence THROUGH the app UI (enter name → start shift →
reload) so the app writes to its own frame, then assert restored values + zero console
errors. Reserve localStorage-priming only for asserting a value is reachable, not for
exercising the app's restore path.
