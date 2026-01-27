# @aliou/pi-guardrails

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
