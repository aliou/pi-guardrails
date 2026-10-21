---
"@aliou/pi-guardrails": patch
---

Resolve relative paths after `cd DIR && …` against DIR in path-access extraction (#135), so `cd packages/web && cat ../api/x` no longer reads as access outside the workspace. Only `&&` chains are followed, because only `&&` guarantees the next command runs in DIR; `;`, `||`, negation, subshells, pipelines, `cd -`, `cd "$VAR"`, and `CDPATH` lookups keep resolving against the session directory as before.
