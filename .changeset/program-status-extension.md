---
"@aliou/pi-guardrails": minor
---

Add a program-status extension that reports open Guardrails approval prompts as `blocked` to terminals that support the Program Status Protocol (OSC 7501), such as Rex. When the last prompt closes, it reports `working` again with the session name.
