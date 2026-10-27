---
"@aliou/pi-guardrails": patch
---

The built-in `/dev/null` path-access allowance now applies by default instead of being dropped during config merge. Previously it only reached users via a config migration gated on `mode: "ask"`, so block-mode users had every `2>/dev/null` denied with no prompt. It is enabled whenever built-in defaults are on, layers under user-allowed paths, and is deduped by `kind:path`.
