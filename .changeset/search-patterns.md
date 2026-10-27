---
"@aliou/pi-guardrails": patch
---

pathAccess: stop treating grep/egrep/fgrep/rg search patterns that start with `/` (e.g. `grep -rn "/transition" tests`) as top-level paths. The first positional is the pattern, not a file; real path operands after it are still reported.
