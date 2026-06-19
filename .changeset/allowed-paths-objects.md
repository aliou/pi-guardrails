---
"@aliou/pi-guardrails": minor
---

Migrate `pathAccess.allowedPaths` from a flat `string[]` (trailing-slash convention) to an explicit `{ kind, path }` discriminated array.

- `file` grants match the exact path; `directory` grants match the directory and its descendants.
- Removes the implicit trailing-slash convention from config, storage, and runtime access matching.
- Fixes skill `baseDir` grants being matched as exact files instead of directory boundaries.
- Adds migration `010-allowed-paths-objects` to convert existing string entries; `009` made format-agnostic so it no longer re-runs on migrated configs.
- Settings UI `Allowed paths` editor now toggles kind per entry (Tab) instead of relying on trailing slashes.
- Regenerates `schema.json` with the new `AllowedPath` definition.
- Bumps `@aliou/pi-utils-settings` to `^0.17.0` and switches migrations to its built-in `Migration.message` field. Migration warnings now flow through `ConfigLoader.drainMessages()` instead of guardrails' manual `addPendingWarning` queue (which is retained only for non-migration warnings like invalid regex patterns). The `001` config-backup failure path drops to `console.error`.
