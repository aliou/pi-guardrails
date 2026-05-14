---
"@aliou/pi-guardrails": minor
---

Split Guardrails into separate policy, path-access, and permission-gate extensions backed by shared config, generated JSON schema support, and refreshed README documentation.

Breaking: renamed public event bus events to `guardrails:action:blocked`, `guardrails:risk:detected`, `guardrails:feature:request`, and `guardrails:feature:register`. Blocked and risk events now use core `Action` and `Safety` payload shapes.
