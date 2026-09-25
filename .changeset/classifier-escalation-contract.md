---
"@aliou/pi-guardrails": minor
---

Add an escalate-only classifier contract to the permission gate. External extensions can register over `guardrails:classify:request`, receive `guardrails:classify:check` for commands the deterministic rules pass, and reply with `guardrails:classify:decision`. A decision carrying a `reason` escalates the command into the standard confirmation prompt; classifiers cannot approve or suppress anything. Checks fail open on timeout, and a classifier that misses three checks in a row is dropped for the session.
