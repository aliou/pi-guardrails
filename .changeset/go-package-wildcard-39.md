---
"@aliou/pi-guardrails": patch
---

Fix go package wildcards (./...) incorrectly treated as file paths, blocking commands like `go test ./...`
