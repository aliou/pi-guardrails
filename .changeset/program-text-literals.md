---
"@aliou/pi-guardrails": patch
---

Extract only quoted string literals from interpreter code (`node -e`, `python -c`) instead of any path-shaped code token. Division results (`(c+0.055)/1.055`), literals joined to a variable with `+` (`p + "/package.json"`), and subscript keys (`spec["paths"]["/api/items"]`) no longer become outside-workspace prompts or blocks. Quoted file access such as `open("/etc/passwd")` and array elements such as `["/etc/passwd"].map(read)` are still reported, and constant concatenations such as `open("/etc" + "/passwd")` are reported as the joined path.
