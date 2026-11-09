---
"@aliou/pi-guardrails": minor
---

Let decision delegates answer open prompts: a delegate with a `respond(request, context)` method is asked while a permission-gate or path-access prompt is open, with the prompt ID and the exact command or resolved path, and the first answer wins (the local user, a delegate, or the timeout). `decide` is now optional, so a delegate can implement either or both. Add `permissionGate.promptTimeoutMs` and `pathAccess.promptTimeoutMs` to deny a prompt nobody answers in time (default 0, wait forever). Includes `examples/delegates/remote-approval.ts`.
