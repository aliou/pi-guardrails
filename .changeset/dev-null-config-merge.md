---
"@aliou/pi-guardrails": patch
---

fix(path-access): apply the built-in /dev/null default during config merge. The DEFAULT_CONFIG entry was discarded by the scope merge, so only the 009 migration (gated to ask mode) ever made /dev/null work; block-mode users had every `2>/dev/null` denied outright. The merge now seeds allowedPaths from the built-in defaults when `applyBuiltinDefaults` is true (mirroring policies.rules), user entries still layer on top and dedupe by `kind:path`, and migration 009 no longer skips block-mode configs.
