---
"@aliou/pi-guardrails": patch
---

Bump `@aliou/pi-utils-settings` to `^0.17.0` and switch migration warnings to its built-in `Migration.message` field.

- Migration warnings now flow through `ConfigLoader.drainMessages()` (drained and rendered in the `session_start` handler) instead of guardrails' manual `addPendingWarning` queue.
- The `001` config-backup failure path drops to `console.error` (it fires on an error path, not a successful run, so it cannot use the `message` field).
- Removes the now-unused `src/shared/warnings.ts` module. Invalid-regex handling in pattern compilation silently matches nothing for now (TODO: surface via `ctx.ui.notify` once compilation is pre-cached at setup).
