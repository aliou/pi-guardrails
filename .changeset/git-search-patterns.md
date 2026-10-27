---
"@aliou/pi-guardrails": patch
---

Stop treating `git grep` search patterns and `git log -L` / `git blame -L` line ranges as paths. `git grep -n "/transition" -- src` and `git log -L '/def foo/,/^def bar/:backend/x.py'` no longer prompt for (or get blocked on) a path at the top of the filesystem. The file named in a `git log -L` range, and every other argument, is still checked.
