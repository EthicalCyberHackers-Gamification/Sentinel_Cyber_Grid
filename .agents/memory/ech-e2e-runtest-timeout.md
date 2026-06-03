---
name: ECH full-playthrough e2e exceeds runTest budget
description: Why a full multi-mission runTest playthrough times out, and how to verify changes instead.
---

# Full A1–A3 e2e via runTest exceeds the code_execution time cap

A `runTest` that plays the whole game (Assignments 1→2→3 to completion) runs long
enough to blow the `code_execution` 600s wrapper cap — the call returns a timeout
and its screenshots/output are lost, even though the testing subagent was driving
the app fine.

**Why:** the game is a long, heavily-guided multi-mission flow; one full playthrough
is far more browser steps than a typical e2e.

**How to apply:** don't attempt a single full-game runTest. Either scope tests to one
mission (or a few steps), or verify non-blocking/cosmetic changes via:
`node --check script.js` + artifact `typecheck` + an app-preview screenshot +
`refresh_all_logs` to confirm the browser console shows no uncaught errors. After the
safe-subset Supabase alignment the console should be **clean** on load (status pill
"Supabase Connected", only Vite messages) — the old `public.student_profiles`
table-not-found warning is gone and should NOT reappear. A clean driven session with
no error-level console output is strong evidence that newly-referenced functions
resolve and nothing throws during play.
