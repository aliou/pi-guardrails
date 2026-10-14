---
"@aliou/pi-guardrails": patch
---

Show the command in the permission-gate RPC fallback. RPC clients only receive the `select` title, which named the danger ("Dangerous command: recursive force delete") but not the command, so users had to approve a command they could not see. The title now ends with the command, indented four spaces per line so Markdown clients render it as a code block.
