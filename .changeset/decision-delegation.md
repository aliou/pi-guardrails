---
"@aliou/pi-guardrails": minor
---

Add decision delegation: before permission-gate or path-access prompts, registered delegates can allow, block, or escalate the action (any block blocks, every delegate must allow, anything else prompts). Each decision is recorded as a `[guardrails]` session entry. Includes a built-in classifier delegate (`features.classifier`) that uses Pi classifier models with fallback, random, or consensus strategies.
