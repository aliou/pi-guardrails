# pi-guardrails

Public Pi extension providing security hooks to prevent potentially dangerous operations. People could be using this, so consider backwards compatibility when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- pnpm 10.26.1
- Vitest for testing
- Biome for linting/formatting
- Changesets for versioning

## Scripts

```bash
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type check
pnpm lint         # Lint (runs on pre-commit)
pnpm format       # Format
pnpm changeset    # Create changeset for versioning
```

## Structure

```
src/
  core/               # Pure guardrail primitives, checks, path rules, shell parsing helpers
  shared/             # Pi-extension shared infra and adapters (config, events, matching, filesystem-backed helpers)
extensions/
  guardrails/         # Legacy Pi extension entry, hooks, commands, config, UI components
    hooks/            # Event hooks (policies, path access, permission gate)
    commands/         # Slash commands (settings UI, onboarding)
    components/       # UI components (pattern editor)
tests/
  utils/              # Test harness utilities (adapted from pi-harness)
    pi-test-harness.ts # Full extension loader with emitEvent() for hook testing
    load-extension.ts # Wrapper for Pi internal extension loader
    matchers.ts       # Custom vitest matchers (toHaveRegisteredTool, etc.)
```

## Conventions

- Tests live next to the code they test (`src/hooks/foo.test.ts`)
- Hook tests use `setupXxxHook()` directly with a mock `pi` and spy contexts from `tests/utils/pi-context.ts`, rather than loading the full extension (avoids `configLoader` side effects)
- The full `createPiTestHarness()` is available for testing commands and tools that go through the extension factory
- New hooks: follow patterns in `src/hooks/`
- Built-in dangerous command matching uses AST parsing via `@aliou/sh`; user-configured patterns use substring/regex matching
- File protection is policy-based (`features.policies`, `policies.rules`), not legacy `envFiles`
- Config migrations are predicate-based (`shouldRun`) using structural checks; do not rely on lexicographic version string comparisons
- Runtime code must only handle current config/core shapes. Old config shapes belong exclusively in migrations; do not add runtime compatibility branches for legacy config.
- `config.version` is a schema marker for debugging/inspection, not the package version
- Events emitted on the pi event bus for inter-extension communication are defined in `src/shared/events.ts`. Current public events are `guardrails:action:blocked`, `guardrails:risk:detected`, `guardrails:feature:request`, and `guardrails:feature:register`.

## Documentation

When adding, updating, or removing default policy rules, default permission gate patterns, or example presets:

- Update `schema.json` with `pnpm gen:schema` if config types changed.
- Update `README.md` if public behavior, commands, or discovery flow changed.
- Treat `src/shared/config/defaults.ts` and `extensions/guardrails/commands/settings/examples.ts` as the source of truth for defaults and presets.

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes
- `minor`: new features/hooks
- `major`: breaking changes
