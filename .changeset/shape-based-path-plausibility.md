---
"@aliou/pi-guardrails": minor
---

path-access: filter non-path bash arguments by shape and filesystem
plausibility instead of per-command allow-lists.

Arguments that look like paths but are not (Context7 library IDs such as
`/websites/apisix`, Go package patterns like `./...`, URLs, `user@host:` remote
targets, `docker -v /src:/dst` volume specs) no longer trigger outside-workspace
prompts, for every CLI rather than an enumerated list.

The `awk`, `sed`, `grep`, `jq`, and `go` classifiers are removed as redundant.
Interpreter, `find`, and delimiter (`cut`/`sort`/`tr`) handling is unchanged.
