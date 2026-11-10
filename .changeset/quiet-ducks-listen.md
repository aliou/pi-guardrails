---
"@aliou/pi-guardrails": patch
---

Register the `guardrails:decision` entry renderer from the guardrails entry only, instead of from both the path-access and permission-gate entries. Removes the duplicate renderer registration that name-conflict checks flag.
