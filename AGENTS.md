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
  index.ts            # Extension entry, registers hooks and commands
  config.ts           # Configuration loading, schema, defaults, merge logic
  hooks/              # Event hooks (policies + permission gate)
  commands/           # Slash commands (settings UI, add-policy)
  components/         # UI components (pattern editor)
  lib/                # Vendored subagent executor core (Phase 1)
  utils/              # Helpers (matching, glob expansion, migration, shell AST)
tests/
  utils/              # Test harness utilities (adapted from pi-harness)
    pi-context.ts     # Spy-based ExtensionContext / UI context builders
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
- `config.version` is a schema marker for debugging/inspection, not the package version
- Events emitted on the pi event bus for inter-extension communication (`guardrails:blocked`, `guardrails:dangerous`)

## Documentation

When adding, updating, or removing default policy rules, default permission gate patterns, or example presets, you must also update the corresponding documentation files:

- [`docs/defaults.md`](docs/defaults.md) — mirrors `DEFAULT_CONFIG` in `src/config.ts`
- [`docs/examples.md`](docs/examples.md) — mirrors `POLICY_EXAMPLES` and `COMMAND_EXAMPLES` in `src/commands/settings-command.ts`

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes
- `minor`: new features/hooks
- `major`: breaking changes
