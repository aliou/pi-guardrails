---
"@aliou/pi-guardrails": patch
---

Inspect executable command and process substitutions in built-in dangerous-command checks, file policies, and path-access extraction. Inner commands such as `echo "$(rm -rf ./scratch)"` and `echo "$(cat .env)"` now reach the existing checks without treating literal text or text-only command arguments as file access. Traversal is limited to executable nodes exposed by the shell parser; raw heredoc bodies and raw expansion operands remain out of scope.
