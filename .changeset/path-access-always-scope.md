---
"@aliou/pi-guardrails": minor
---

Add `pathAccess.alwaysScope` option (`"local"` | `"global"`, default `"local"`) controlling where "Allow … always" grants from the path-access prompt are persisted. The default keeps the current behavior of writing grants to the project config; set it to `"global"` to save grants to the user-wide config (`~/.pi/agent/extensions/guardrails.json`) so they apply in every project. Session grants still go to memory and "allow once" grants are never persisted. Also configurable via `/guardrails:settings` under Path Access → Always-grant scope.
