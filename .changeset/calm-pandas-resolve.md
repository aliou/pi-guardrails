---
"@aliou/pi-guardrails": minor
---

Add a `guardrails:action:prompt-resolved` event that pairs with `guardrails:action:prompted`, allowing status integrations to detect when Guardrails no longer needs human input. Include an optional Herdr adapter that uses the lifecycle pair to show approval prompts as blocked in Herdr's Agents overview.
