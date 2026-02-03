# @aliou/pi-guardrails

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
