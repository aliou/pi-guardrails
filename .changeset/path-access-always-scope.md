---
"@aliou/pi-guardrails": minor
---

Add `pathAccess.alwaysScope` option to control where "Allow … always" grants
from the path-access prompt are persisted. Defaults to `"local"` (the project
config, current behavior). Set it to `"global"` to save grants to the user-wide
config so they apply in every project.

Configurable via the settings UI under Path Access → "Always-grant scope".
