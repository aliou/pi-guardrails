---
"@aliou/pi-guardrails": patch
---

Fix permission gate bypass in RPC mode: deny-by-default when `ctx.ui.custom()` returns undefined, with fallback to `ctx.ui.select()`.
