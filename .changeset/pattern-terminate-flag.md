---
"@aliou/pi-guardrails": minor
---

Add `terminate` pattern option for permission-gate auto-deny rules (pi >= 0.84.1). Patterns can set `terminate: true` so a blocked call ends the agent's turn instead of yielding back to the model, preventing retry loops (e.g. sleep-polling). The turn only ends when every finalized blocked result in the batch sets the flag.

Also bumps dev dependencies to `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` 1.4.0. Peer dependencies remain `"*"`.
