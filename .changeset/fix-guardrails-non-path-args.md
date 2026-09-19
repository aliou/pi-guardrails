---
"@aliou/pi-guardrails": patch
---

Stop treating non-path bash arguments as file access. A protected file name passed as plain data (`printf '%s\n' '.env'`, a `grep`/`rg` search term, `echo`) no longer triggers the protected-file policy, while actual file operands (including redirects and reads nested in interpreter programs or `bash -c`) stay blocked.
