---
"@aliou/pi-guardrails": minor
---

Upgrade `@aliou/sh` to 0.3.1 and adapt the AST walker to its compound-redirect model.

**Fixed**

- **Heredoc command evasion** (permission gate): a dangerous command placed after a heredoc body (`cat <<EOF\n…\nEOF\nrm -rf …`) was folded into the heredoc command's words by `@aliou/sh` 0.2.x, so the structural matcher never saw it. 0.3.1 emits it as its own `SimpleCommand`, and the gate now matches it.
- **Compound-redirect extraction** (path access, guardrails targets): `@aliou/sh` 0.3.x attaches trailing redirects (`{ …; } > out`, `( … ) > out`, `while … done < in`, `if … fi > out`) to the compound node instead of an anonymous `SimpleCommand`. `walkCommands` now reports those redirects via an optional second callback argument, and both path extractors consume them — without this, upgrading would have silently stopped protecting compound-command redirect targets.
- **Fd-duplication noise**: `2>&1`, `3<&0`, `>&-` and friends target file descriptors, not files. New `isFdDuplicationRedirect` helper skips them during path extraction, so `echo hi 2>&1` no longer produces a bogus `./1` candidate. `&>`/`&>>` still resolve to a real file and are kept.

**Compatibility**

- `walkCommands` now passes `undefined` as the command for compound-redirect callbacks, so existing single-argument callbacks need a `cmd` guard before reading `cmd.words`.
