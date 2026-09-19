---
"@aliou/pi-guardrails": patch
---

Stop blocking bash commands when a protected file name is passed as pure text. `echo`, `printf`, and `tr` take no file operands by their POSIX grammars, so `printf '%s\n' '.env'` or `echo .env` no longer trigger the protected-file policy. Actual file operands keep working: reading `.env` with `cat`, or redirecting to it (`printf … > .env`), stays blocked.
