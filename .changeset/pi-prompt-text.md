---
"@aliou/pi-guardrails": patch
---

Treat the prompt passed to a nested `pi` command as text. `pi -p '/skill:workflow-standard do nothing'` no longer reports `/skill:workflow-standard do nothing` as an outside-workspace path. `@file` arguments, values of path options such as `--extension` and `--session`, and subcommands like `pi install <source>` are still checked.
