---
"@aliou/pi-guardrails": patch
---

Fix secret-files (and other `onlyIfExists`) policies being bypassed when a bash
target path contains an unexpanded shell expansion such as `$VAR`, `${VAR}`,
`$(...)`, `$((...))`, or process substitution.

Previously, a command like `head "$SC/.env"` extracted the literal target
`$SC/.env`. The `.env` basename matched the policy, but the policy's
`onlyIfExists` check then `stat()`'d `<cwd>/$SC/.env` — a path that never
exists — and let the read through.

Target extraction now marks such paths as unresolved, and the policy check no
longer applies `onlyIfExists` to them: a path we can't resolve can't be used to
prove a file doesn't exist. This follows ShellCheck's stance that shell
indirection is "known to be unsolvable in the most general case" — unresolved
references are treated conservatively rather than optimistically.
