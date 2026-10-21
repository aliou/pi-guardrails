---
"@aliou/pi-guardrails": minor
---

Classify parsed command arguments by role instead of matching raw command text. Search-pattern operands are no longer treated as filesystem paths, so `grep -rn "/transition" tests` (issue #134) and `grep -c 'a * 2 / 3' f.js` no longer trigger path-access prompts for paths that are actually grep patterns, while `grep -rn foo /` still reports the root scan.

Permission-gate custom and auto-deny patterns now match the command surface — each simple command minus fully quoted data arguments — so `grep -c 'a * 2 / 3' f.js` no longer false-positives "grep against /" style regexes, while `grep -rn foo /` still matches. Commands that fail to parse fall back to raw-string matching, and quoted interpreter or shell program text stays visible to content patterns.
