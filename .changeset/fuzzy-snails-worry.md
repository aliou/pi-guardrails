---
"@aliou/pi-guardrails": patch
---

Fix home-directory default policy rules so `~`-based patterns match correctly and expand to the current user's home directory during blocking and existence checks.
