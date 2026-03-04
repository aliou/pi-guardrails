# @aliou/pi-guardrails

## 0.8.0

### Minor Changes

- e8eea2f: Redesign file protection from legacy `envFiles` to a new `policies` system with per-rule protection levels (`noAccess`, `readOnly`, `none`), add migration from old config fields, and replace the old env hook with a general policies hook.
- e762afc: Add opt-in LLM command explanations to the permission gate dialog with configurable model and timeout settings, plus graceful fallback when model resolution or explanation calls fail.

### Patch Changes

- e4a8438: Update docs and migration semantics for config schema versioning. Bump `@aliou/pi-utils-settings` to latest `0.5.x`, clarify fallback behavior in README/AGENTS, ignore `.pi/settings.json`, and ensure migrated configs write the current schema version without lexicographic version comparisons.
- d9f91cd: Harden permission-gate command explanation prompt handling, fix dangerous-pattern matching flow after successful AST parses, and improve policy enforcement by skipping empty rules and resolving onlyIfExists checks relative to session cwd. Also refresh README/AGENTS docs for the policies-based architecture.

## 0.7.7

### Patch Changes

- 0b5ab5b: Move `@mariozechner/pi-tui` to peer dependencies to avoid bundling the SDK alongside the extension.
- 3ea037a: Replace all `console.error`/`console.warn` calls with a module-level warnings queue. Warnings collected during config loading, migration, and pattern compilation are now drained and reported via `ctx.ui.notify` at `session_start`.

## 0.7.6

### Patch Changes

- 31ae8f0: mark pi SDK peer deps as optional to prevent koffi OOM in Gondolin VMs

## 0.7.5

### Patch Changes

- 6c5b699: Move to standalone repository

## 0.7.4

### Patch Changes

- Updated dependencies [7df01a2]
  - @aliou/pi-utils-settings@0.4.0

## 0.7.3

### Patch Changes

- 024c9a4: Fix false positives in permission gate when dangerous keywords appear inside command arguments (e.g. "sudo" in a git commit message). When structural AST matching succeeds, skip the redundant substring match on the raw command string.

## 0.7.2

### Patch Changes

- 9ba0cb9: Add "allow for session" option to permission gate confirmation dialog. Pressing `a` saves the command as an allowed pattern in the memory scope, bypassing future prompts for the same command in the current session.
- Updated dependencies [756552a]
  - @aliou/pi-utils-settings@0.3.0

## 0.7.1

### Patch Changes

- 2d9a958: update README documentation to match current implementation

## 0.7.0

### Minor Changes

- 7a3f659: Add memory scope for ephemeral settings overrides

## 0.6.2

### Patch Changes

- Updated dependencies [06e7e0c]
  - @aliou/pi-utils-settings@0.2.0

## 0.6.1

### Patch Changes

- 3471b6c: Explicitly add deps to root package.json
- d73dadb: Reorganize file structure: move commands to commands/, components to components/, utils to utils/. Merge config-schema types into config.ts.

## 0.6.0

### Minor Changes

- 29b61a5: Remove toolchain features (preventBrew, preventPython, enforcePackageManager) -- moved to @aliou/pi-toolchain. Replace custom config loader and settings UI with @aliou/pi-utils-settings.

## 0.5.4

### Patch Changes

- b5c4cd1: Update demo video and image URLs for the Pi package browser.

## 0.5.3

### Patch Changes

- dccbf2d: Add preview video to package.json for the pi package browser.

## 0.5.2

### Patch Changes

- 7736c67: Update pi peerDependencies to 0.51.0. Reorder tool execute parameters to match new signature.

## 0.5.1

### Patch Changes

- a1638b9: Add .env.production, .env.prod and .dev.vars to default protected patterns

## 0.5.0

### Minor Changes

- cb97920: Add enforce-package-manager guardrail

  - New `enforcePackageManager` feature (disabled by default)
  - Supports npm, pnpm, and bun (npm is default)
  - Blocks commands using non-selected package managers
  - Configurable via `packageManager.selected` setting
  - Also documents the existing `preventPython` feature

## 0.4.1

### Patch Changes

- dcaa485: Type-safe feature settings: derive settings UI items from a typed record keyed by config feature keys. Adding a new feature without updating the settings UI now causes a type error.

## 0.4.0

### Minor Changes

- 9916f1f: Add preventPython guardrail to block Python tools.

  - Block python, python3, pip, pip3, poetry, pyenv, virtualenv, and venv commands.
  - Recommend using uv for Python package management instead.
  - Disabled by default, configurable via settings.
  - Provides helpful guidance on using uv as a replacement.

## 0.3.0

### Minor Changes

- fe26e11: Configurable rules, settings UI, and event-based architecture.

  - Config system with global (~/.pi/agent/extensions/guardrails.json) and project (.pi/extensions/guardrails.json) scoped files.
  - /guardrails:settings command with sectioned tabbed UI (Local/Global).
  - All hooks configurable: feature toggles, patterns, allow/deny lists.
  - Emit guardrails:blocked and guardrails:dangerous events (presenter handles sound/notifications).
  - Array and pattern editors with add, edit, and delete support.
  - preventBrew disabled by default.

## 0.2.1

### Patch Changes

- c267b5b: Bump to Pi v0.50.0.

## 0.2.0

### Minor Changes

- ce481f5: Initial release of guardrails extension. Security hooks to prevent potentially dangerous operations: blocks Homebrew commands, protects .env files, prompts for confirmation on dangerous commands.
