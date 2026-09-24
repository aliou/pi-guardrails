---
"@aliou/pi-guardrails": minor
---

Add per-rule `respectCwd` option (default `true`) so path-tree `readOnly`/`noAccess` policies no longer neuter the session working directory. Location-anchored patterns (`~`- or `/`-prefixed globs like `~/work/**`) are skipped for targets inside the cwd, while basename globs, relative path globs, and regex patterns keep applying, so secrets stay protected everywhere. Set `respectCwd: false` on a rule to restore strict enforcement. Fixes #100.
