---
"@aliou/pi-guardrails": patch
---

Resolve relative paths in bash commands against `cd` targets instead of always the session working directory. `cd .pi && cat ../README.md` now reports the path the command actually reads, so monorepo workflows such as `cd frontend && pnpm build > ../.pi/build.log` no longer prompt for (or get blocked on) paths outside the workspace that the command never touches.

`cd` targets are tracked through sequential commands and `&&` chains. A `cd` inside a pipeline arm, subshell, command substitution, or function body only affects paths within that scope. Untrackable targets (`cd -`, variable or glob targets, bad arity) fall back to the previous session-cwd resolution.
