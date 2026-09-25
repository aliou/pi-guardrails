---
"@aliou/pi-guardrails": minor
---

Let other extensions opt their custom tools into guardrails gating (#99). An extension emits `guardrails:register-tool` on Pi's event bus with a `resolveTargets` function that maps a call to file targets (`access: "read" | "write"`) or a shell command; policies, permission gate, and path access then check it exactly like the equivalent built-in tool. Guardrails emits `guardrails:request-tools` on load so extensions loaded earlier can re-register. Resolver failures block the call, and built-in tool names cannot be re-registered.
