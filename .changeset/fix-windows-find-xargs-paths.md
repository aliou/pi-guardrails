---
"@aliou/pi-guardrails": patch
---

Fix bogus "Outside Workspace Access" prompts on Windows for `find <dir> \( ... \) | xargs grep ...` commands (#79). Escaped parens in find expressions produced a lone `\` token that resolved to the drive root (`D:\`) on Windows, and grep patterns passed through `xargs` were treated as paths. Requires @aliou/sh ^0.2.2, which fixes backslash escape tokenization.
