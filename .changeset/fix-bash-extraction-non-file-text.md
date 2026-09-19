---
"@aliou/pi-guardrails": patch
---

Path extraction no longer treats non-file text as file access. Heredoc delimiters and here-strings (`cat <<'EOF'`) are skipped instead of surfacing the delimiter as a path, and tokens that collapse to the filesystem root (`cat //`) are dropped. Extracting around `#` comments written after `|`, `&&` or `||` depends on the operator-continuation parser fix in `@aliou/sh` (aliou/sh#24) and activates with the dependency bump on this branch.
