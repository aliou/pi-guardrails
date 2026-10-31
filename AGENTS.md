# pi-guardrails

Public Pi extension package providing security hooks for Pi: file protection policies, workspace path access control, dangerous-command confirmation, a classifier decision delegate, and Herdr and program-status (OSC 7501) prompt adapters. People depend on this, so treat the public API as backwards-compatibility-sensitive.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Commands

Uses pnpm. Package scripts are discoverable in `package.json`. In git worktrees, `.pre-commit-config.yaml` (a gitignored symlink created by the Nix dev shell) is missing, so commits there need `PRE_COMMIT_ALLOW_NO_CONFIG=1`.

## Conventions

- Built-in dangerous command matching uses AST parsing via `@aliou/sh`; user-configured patterns use substring/regex matching. Do not switch built-ins to pattern matching.
- File protection is policy-based (`features.policies`, `policies.rules`), not the legacy `envFiles` shape.
- Config migrations are predicate-based (`shouldRun`) using structural checks; never compare version strings lexically.
- Runtime code handles only current config/core shapes. Old shapes belong exclusively in migrations; do not add runtime compatibility branches for legacy config.
- `config.version` is a schema marker for debugging/inspection, not the package version.
- Events emitted on the Pi event bus for inter-extension communication are defined in `src/shared/events.ts`. Keep the public event contract backwards-compatible; `guardrails:action:prompted` exists only as a deprecated alias of `guardrails:prompt:opened`.

## Documentation triggers

- Adding, updating, or removing default policy rules, default permission gate patterns, or example presets: `src/shared/config/defaults.ts` and `extensions/guardrails/commands/settings/examples.ts` are the source of truth. Update `schema.json` with `pnpm gen:schema` if config types changed.
- Update `README.md` when public behavior, commands, or the discovery flow change.
- Read and update `docs/decision-delegation.md` when changing what reaches delegates, the delegate contract, or the classifier.
- Run `pnpm changeset` before committing user-facing changes: `patch` for bug fixes, `minor` for new features/hooks, `major` for breaking changes.
