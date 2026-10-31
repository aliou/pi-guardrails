---
"@aliou/pi-guardrails": minor
---

Add decision delegation: before permission-gate or path-access prompts, registered delegates can allow, block, or escalate the action (any block blocks, every delegate must allow, anything else prompts). Each decision is recorded as a `[guardrails]` session entry.
