---
"@aliou/pi-guardrails": minor
---

Add `pathAccess.applyTo` (`"all"` or `"write"`, default `"all"`) to control which operations the outside-workspace gate covers. With `"write"`, read-only tools (`read`, `grep`, `find`, `ls`) can access paths outside the project — skill files, configs — without a grant, while writes and bash commands are still gated. Also configurable through `/guardrails:settings` (Path Access → Applies to).
