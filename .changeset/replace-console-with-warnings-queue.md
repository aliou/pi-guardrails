---
"@aliou/pi-guardrails": patch
---

Replace all `console.error`/`console.warn` calls with a module-level warnings queue. Warnings collected during config loading, migration, and pattern compilation are now drained and reported via `ctx.ui.notify` at `session_start`.
