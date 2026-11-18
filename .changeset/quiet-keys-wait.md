---
"@aliou/pi-guardrails": minor
---

- Add a configurable quiet period before permission-gate and path-access prompts accept answers, preventing keys typed for the editor from accidentally approving, denying, or stopping an action.
- Restart the quiet period on every keypress while keeping prompt scrolling available. The default is 1000 ms; set `prompts.inputGuardMs` to `0` to disable it.
- Configure `prompts.inputGuardMs` directly in the Guardrails config, or open `/guardrails:settings` and use **Prompts → Input guard (ms)**.
