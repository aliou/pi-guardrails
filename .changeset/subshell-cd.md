---
"@aliou/pi-guardrails": patch
---

Follow `cd` inside `( ... )` subshells and `{ ...; }` groups when resolving relative paths in bash commands. `(cd packages/dashboard && bun dev > ../../.pi/tmp/dev.log 2>&1 &)` now resolves the log path against `packages/dashboard`, so it no longer prompts for (or gets blocked on) a path outside the workspace. A `cd` inside a subshell still does not change the directory for commands after it; a `cd` inside a `{ ...; }` group does, as in bash.
