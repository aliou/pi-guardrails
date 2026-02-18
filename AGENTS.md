# pi-guardrails

Public Pi extension providing security hooks to prevent potentially dangerous operations. People could be using this, so consider backwards compatibility when making changes.

Pi is pre-1.0.0, so breaking changes can happen between Pi versions. This extension must stay up to date with Pi or things will break.

## Stack

- TypeScript (strict mode)
- pnpm 10.26.1
- Biome for linting/formatting
- Changesets for versioning

## Scripts

```bash
pnpm typecheck    # Type check
pnpm lint         # Lint (runs on pre-commit)
pnpm format       # Format
pnpm changeset    # Create changeset for versioning
```

## Structure

```
src/
  index.ts            # Extension entry, registers hooks and commands
  config.ts           # Configuration loading, schema, and defaults
  hooks/              # Event hooks (permission gate, env file protection)
  commands/           # Slash commands (settings UI)
  components/         # UI components (pattern editor)
  utils/              # Helpers (matching, glob expansion, migration, shell AST)
```

## Conventions

- New hooks: follow patterns in `src/hooks/`
- All command matching uses AST parsing via `@aliou/sh`
- Events emitted on the pi event bus for inter-extension communication

## Versioning

Uses changesets. Run `pnpm changeset` before committing user-facing changes.

- `patch`: bug fixes
- `minor`: new features/hooks
- `major`: breaking changes
