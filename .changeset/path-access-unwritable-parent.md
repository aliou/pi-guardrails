---
"@aliou/pi-guardrails": patch
---

Stop reporting search text that starts with `/` as outside-workspace access (#134). A missing path whose parent exists but is not writable can be neither read nor created, so `grep -rn "/transition" tests`, `rg '/upload|413' backend`, or `pi -p '/skill:…'` no longer prompt (or block in subagents). Missing top-level entries stay reported when `/` is writable (running as root, Windows drive roots) and for commands run through `sudo`/`doas`/`su`/`pkexec`/`run0`.
