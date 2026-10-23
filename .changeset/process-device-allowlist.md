---
"@aliou/pi-guardrails": minor
---

feat(path-access): always allow process device files. `/dev/stdin`, `/dev/stdout`, `/dev/stderr`, `/dev/tty`, and `/dev/fd/N` are process plumbing rather than filesystem access, so they are now allowed without a prompt in every mode, independent of `allowedPaths`. `/dev/null` stays a config default (opt-out via `applyBuiltinDefaults: false`); other device files such as `/dev/urandom` still follow the normal outside-workspace rules. Also locks down fd-duplication redirects (`>&2`, `2>&1 | head`) with regression coverage.
