---
"pi-guardrails": patch
---

Add RPC-mode fallback to the path-access outside-path prompt. In RPC mode, `ctx.ui.custom()` resolves to `undefined`, so the prompt now falls back to a plain `ctx.ui.select()` with the same options as the TUI prompt, letting RPC users grant or deny access to paths outside the working directory.
