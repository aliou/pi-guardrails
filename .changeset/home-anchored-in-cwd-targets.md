---
"@aliou/pi-guardrails": patch
---

Anchored policy patterns (`~/…`- or `/`-prefixed globs) are now matched against every equivalent spelling of a target — cwd-relative, `~/…`, and absolute — so a `~/…`-anchored rule holds regardless of where the session starts or how the tool input spelled the path. Previously, a target under `$HOME` that was also inside the session cwd was normalized to its cwd-relative form, and an anchored pattern never saw the home-anchored form.
