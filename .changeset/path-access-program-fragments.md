---
"@aliou/pi-guardrails": patch
---

Stop reporting math and string fragments inside `node -e` / `python -c` programs as outside-workspace access (#136). Fragments such as `/1.055`, `"/package.json"`, or `"/api/items"` are dropped when no writable ancestor could hold them. Program paths that exist, or that the program could create under a writable directory (for example `/tmp/new/dir`), are still reported.
