---
"@aliou/pi-guardrails": patch
---

Fix path-access filtering for interpreter arguments so API-style paths passed to scripts are not treated as outside-workspace filesystem access while inline interpreter code remains guarded.
