---
"@aliou/pi-guardrails": patch
---

Resolve relative paths in bash commands against `cd` targets instead of always the session working directory. `cd .pi && cat ../README.md` now reports the path the command actually reads, so monorepo workflows such as `cd frontend && pnpm build > ../.pi/build.log` no longer prompt for (or get blocked on) paths outside the workspace that the command never touches.

`cd` targets are tracked through sequential commands and `&&` chains. A `cd` inside a pipeline arm, subshell, background statement, coproc, command substitution, or function body only affects paths within that scope. Targets that cannot be tracked or do not exist (`cd -`, variable or glob targets, missing directories) fall back to the session-cwd resolution. A `cd` with more than one operand fails in bash, so it leaves the tracked directory unchanged.
