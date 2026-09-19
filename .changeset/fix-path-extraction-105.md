---
"@aliou/pi-guardrails": patch
---

Fix false "Outside Workspace Access" prompts from bash path extraction: comments the parser rejects no longer mangle into garbage candidates in the fallback, heredoc delimiters are no longer extracted as redirect targets, tokens that only resolve to the filesystem root (like a `//` pattern) are suppressed unless the root was written explicitly, argv of remote executions (`ssh`, `kubectl exec/attach/debug`) is no longer treated as local paths, and URL path fragments inside interpreter program text are recognized as string data.
