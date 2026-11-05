---
"@aliou/pi-guardrails": patch
---

Fix builtin dangerous-command matching silently dropping arguments quoted with ANSI-C (`$'...'`) or locale (`$"..."`) strings after the `@aliou/sh` 0.4.0 AST change, and detect expansions hidden inside locale strings, extglob patterns, and expanding heredoc bodies during substitution traversal.
