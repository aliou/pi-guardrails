---
"@aliou/pi-guardrails": minor
---

Add `guardrails:action:prompted` event that fires when guardrails shows an interactive prompt to the user, before the user has responded. This complements the existing `guardrails:action:blocked` (post-decision) and `guardrails:risk:detected` events.
