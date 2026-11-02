---
"@aliou/pi-guardrails": minor
---

Approval prompts report `blocked` program status. The permission-gate confirmation and the path-access prompt now report pi as blocked on user input (OSC 7501, kind `permission`) through the `blocked` option of `ctx.ui.custom()` (pi >= 1.5.0), so terminals that support program status, such as Rex, show blocked instead of working while an approval waits.
