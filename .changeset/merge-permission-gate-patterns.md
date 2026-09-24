---
"@aliou/pi-guardrails": minor
---

Merge Permission Gate pattern arrays (`patterns`, `allowedPatterns`, `autoDenyPatterns`) across config scopes instead of a project config replacing global entries. Previously, defining one of these arrays in `.pi/extensions/guardrails.json` silently dropped every global pattern, including auto-deny rules. Affected configs print a one-time notice on next load.
