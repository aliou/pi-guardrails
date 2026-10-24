---
"@aliou/pi-guardrails": patch
---

Stop path access from throwing on Oh My Pi's `before_agent_start` event, which has no `systemPromptOptions`. The extension now skips the skill path grants when the field is missing.
