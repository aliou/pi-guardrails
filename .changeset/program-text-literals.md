---
"@aliou/pi-guardrails": patch
---

Extract only quoted string literals from interpreter code (`node -e`, `python -c`) instead of any path-shaped code token. Division results (`(c+0.055)/1.055`), string-concatenation fragments (`p + "/package.json"`), and dictionary keys (`spec["paths"]["/api/items"]`) no longer become outside-workspace prompts or blocks, while quoted file access in call position such as `open("/etc/passwd")` is still reported.
