---
"@aliou/pi-guardrails": minor
---

Add directory access feature: restrict file access to the current working directory

New `directoryAccess` feature with three modes:
- `block` — always deny access outside the working directory
- `ask` — prompt with options: allow once, allow for session, allow for project, or deny
- `allow` — no directory restrictions (feature disabled)

Configuration:
- `features.directoryAccess` — enable/disable the feature
- `directoryAccess.mode` — block/ask/allow
- `directoryAccess.additionalDirs` — extra directory roots that are always allowed (supports `~` expansion, merged across scopes)

The directory access check runs before policy checks. A file inside the working directory can still be blocked by policy rules.

Other changes:
- Refactored bash path extraction to return all path candidates (decoupled from policy matching, filters by `maybePathLike`)
- Fixed glob expansion to use `ctx.cwd` instead of `process.cwd()`
- Fixed hook config stale-cache bug: allowed patterns, auto-deny patterns, additional dirs, and permission gate settings are now re-read from config on each `tool_call` so settings changes take effect immediately
- Added onboarding step for directory access mode selection
- Added directory access settings section in `/guardrails:settings`
- Added migration for existing users (feature disabled by default to preserve existing behavior)
- Bumped config schema version to 0.11.0
- Added unit tests for path utils, migration, and policies (56 tests)
