---
"@aliou/pi-guardrails": minor
---

feat(path-access): always allow process device files for bash commands. `/dev/stdin`, `/dev/stdout`, `/dev/stderr`, `/dev/tty`, and `/dev/fd/N` are process plumbing for a bash child, so they are allowed without a prompt, independent of `allowedPaths`. The allowance is restricted to bash-origin targets: reached through in-process tools (read/write/edit/grep/find/ls) these paths are Pi's own open files and terminal, so they still prompt or block. `/dev/null` stays a config default (opt-out via `applyBuiltinDefaults: false`); other device files such as `/dev/urandom` still follow the normal outside-workspace rules. Also locks down fd-duplication redirects (`>&2`, `2>&1 | head`) with regression coverage.
