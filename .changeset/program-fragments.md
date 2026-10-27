---
"@aliou/pi-guardrails": patch
---

pathAccess: stop reporting math and string fragments from `node -e` / `python -c` code (like `/1.055`, `/package.json` from `p + "/package.json"`, or `/api/items` from `spec["paths"]["/api/items"]`) as top-level paths. Only quoted string literals count, and fragments glued to `+` concatenations or used as subscript keys are skipped.
