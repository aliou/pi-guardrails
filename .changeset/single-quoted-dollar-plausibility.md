---
"@aliou/pi-guardrails": patch
---

Stop treating single-quoted `$` as an unexpanded shell reference in path-access extraction. A command such as `sed -n '/pat/,$p' file` no longer produces an outside-workspace candidate from the sed range, which removes false "Outside Workspace Access" prompts in interactive sessions and hard blocks in sessions without a UI. Whether a word contains an expansion is now decided from the AST word parts instead of the flattened token text, so real expansions (`"$HOME/x"`, `$(cmd)`, backticks) are still reported.
