# pi-guardrails

Public Pi extension providing security hooks to prevent potentially dangerous operations. People could be using this, so consider backwards compatibility when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- pnpm 10.26.1
- Vitest for testing
- Biome for linting/formatting
- Changesets for versioning
- `@aliou/sh` for built-in dangerous command AST parsing

## Scripts

```bash
pnpm test             # Run tests
pnpm test:watch       # Run tests in watch mode
pnpm typecheck        # Type check
pnpm gen:schema       # Regenerate schema.json from config types
pnpm check:schema     # Verify schema.json is up to date
pnpm lint             # Lint (runs on pre-commit)
pnpm format           # Format
pnpm changeset        # Create changeset for versioning
pnpm version          # Bump versions from changesets
pnpm release          # Publish package from changesets
pnpm check:lockfile   # Verify pnpm-lock.yaml is in sync
```

## Structure

```
src/
  core/                   # Pure guardrail primitives, checks, path rules, shell parsing helpers
    commands/             # Built-in dangerous command detection
    paths/                # Path access rules and normalization
    shell/                # Shell argument parsing helpers
  shared/                 # Pi-extension shared infra and adapters
    config/               # Config loading, defaults, migrations
    events.ts             # Public event definitions and emitters
    matching.ts           # Pattern matching helpers
    paths/                # Bash path resolution utilities
extensions/
  guardrails/             # File protection policies, settings, onboarding, examples
    commands/             # Slash commands
      examples/           # Preset policy examples command
      onboarding/         # First-run onboarding command
      settings/           # Settings UI command and editors
    components/           # UI components (pattern editor, onboarding wizard)
    rules.ts              # Policy rule compilation and helpers
    targets.ts            # Target extraction for policy checks
    index.ts              # Registers policy hook, commands, and feature registration
  path-access/            # Workspace path access control
    dynamic-resources.ts  # Pi docs / skill path discovery
    grants.ts             # Session/persistent grant helpers
    prompt.ts             # Path access UI prompt
    rules.ts              # Path access rule
    targets.ts            # Path target extraction
    index.ts              # Registers path-access hook and feature registration
  permission-gate/        # Dangerous command confirmation
    grants.ts             # Session grant helpers
    prompt.ts             # Confirmation UI prompt
    rules.ts              # Permission gate rule and command matching
    index.ts              # Registers permission-gate hook and feature registration
tests/
  utils/                  # Test utilities (memfs setup, theme, tmpdir, vitest setup)
  vitest.setup.ts         # Global test setup
```

Each extension owns one Pi `tool_call` hook. Instead of a single guardrails hook, the package registers three independent extensions that communicate feature presence through the Pi event bus.

## Conventions

- Tests live next to the code they test (`src/core/check.test.ts`, `extensions/guardrails/rules.test.ts`, etc.).
- Prefer unit tests of `core`/`extension` helpers over loading the full extension factory. Use `memfs` for filesystem state.
- Hook tests can call the `setupXxxHook()` function from an extension's `index.ts` with a minimal mock `pi` object and `vi.fn()` spies for contexts.
- Built-in dangerous command matching uses AST parsing via `@aliou/sh`; user-configured patterns use substring/regex matching.
- File protection is policy-based (`features.policies`, `policies.rules`), not legacy `envFiles`.
- Config migrations are predicate-based (`shouldRun`) using structural checks; do not rely on lexicographic version string comparisons.
- Runtime code must only handle current config/core shapes. Old config shapes belong exclusively in migrations; do not add runtime compatibility branches for legacy config.
- `config.version` is a schema marker for debugging/inspection, not the package version.
- Events emitted on the pi event bus for inter-extension communication are defined in `src/shared/events.ts`. Current public events are `guardrails:action:blocked`, `guardrails:action:prompted`, `guardrails:risk:detected`, `guardrails:feature:request`, and `guardrails:feature:register`.

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
