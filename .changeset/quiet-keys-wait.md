---
"@aliou/pi-guardrails": patch
---

Ignore keypresses that answer permission-gate and path-access prompts until input has been quiet for 1000ms, so keys typed into the editor just before a prompt appears (`y`, `d`, enter, `n`, ...) cannot approve or deny it. Every keypress restarts the period; scrolling still works. Configure with `prompts.inputGuardMs` (`0` disables).
