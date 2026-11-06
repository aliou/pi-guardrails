---
"@aliou/pi-guardrails": patch
---

Keep builtin dangerous-command matching working when shell parsing only partially recovers. `checkDangerousCommand` now parses with `recoverErrors` and runs the structural matchers on any recovered AST, while the raw fallback patterns keep running for every parse that did not come back clean — a recovered AST can only add detections, never replace the fallbacks. Together with `@aliou/sh` 0.4.1, dangerous commands cut short by an unterminated heredoc that bash still executes are structurally matched again.
