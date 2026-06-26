---
"@aliou/pi-guardrails": minor
---

Add a "decline and stop" option to the permission-gate prompt. Choosing it (press `s`, or select "Decline and stop" in the RPC fallback) blocks the dangerous command, emits a `guardrails:action:blocked` event with the new `user-stop` block source, and aborts the current agent turn so the assistant does not keep going.
