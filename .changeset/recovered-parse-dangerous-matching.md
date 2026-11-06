---
"@aliou/pi-guardrails": patch
---

Keep builtin dangerous-command matching working when shell parsing fails or only partially recovers. `checkDangerousCommand` now parses with `recoverErrors` and runs the structural matchers on any recovered AST (for example commands cut short by an unterminated `if` or, once `@aliou/sh` preserves them, an unterminated heredoc that bash still executes), while the raw fallback patterns keep running for every parse that did not come back clean — a recovered AST can only add detections, never replace the fallbacks. The default permission-gate patterns gain `rm -r -f` and `rm --recursive` so split-flag and long-flag recursive-delete spellings stay covered while parsing is degraded.
