---
"@aliou/pi-guardrails": patch
---

path-access: allow bash commands to use their own standard streams and terminal (`/dev/stdin`, `/dev/stdout`, `/dev/stderr`, `/dev/tty`, `/dev/fd/0`–`/dev/fd/2`) without a prompt. Other `/dev/*` paths still follow the normal rules.
