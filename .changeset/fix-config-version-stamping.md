---
"@aliou/pi-guardrails": patch
---

Stamp guardrails config saves with the current schema version.

This prevents newly-created partial configs from being mistaken for legacy v0 configs on reload.
