---
"@aliou/pi-guardrails": patch
---

Path extraction no longer treats non-file text as file access. Heredoc delimiters and here-strings (`cat <<'EOF'`) are skipped instead of surfacing the delimiter as a path; tokens that collapse to the filesystem root (`cat //`) are dropped; and `#` comments written after `|`, `&&` or `||` parse as the line continuations they are (via `@aliou/sh` 0.3.3, aliou/sh#24), so comment text and paths mentioned in it never surface as candidates or false policy blocks.
