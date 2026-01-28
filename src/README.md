# Guardrails

Security hooks to prevent potentially dangerous operations.

## Demo

<video src="https://assets.aliou.me/pi-extensions/2026-01-26-guardrails-demo.mp4" controls playsinline muted></video>

## Installation

Install via the pi-extensions package:

```bash
pi install git:github.com/aliou/pi-extensions
```

Or selectively in your `settings.json`:

```json
{
  "packages": [
    {
      "source": "git:github.com/aliou/pi-extensions",
      "extensions": ["extensions/guardrails"]
    }
  ]
}
```

Or from npm:

```bash
pi install npm:@aliou/pi-guardrails
```

## Features

- **prevent-brew**: Blocks Homebrew commands (disabled by default)
- **prevent-python**: Blocks Python/pip/poetry commands, suggests uv instead (disabled by default)
- **protect-env-files**: Prevents access to `.env` files (except `.example`/`.sample`/`.test`)
- **permission-gate**: Prompts for confirmation on dangerous commands
- **enforce-package-manager**: Enforces a specific Node package manager (npm, pnpm, or bun) (disabled by default)

## Configuration

Configuration is loaded from two optional JSON files, merged in order (project overrides global):

- **Global**: `~/.pi/agent/extensions/guardrails.json`
- **Project**: `.pi/extensions/guardrails.json`

### Settings Command

Run `/guardrails:settings` to open an interactive settings UI with two tabs:
- **Local**: edit project-scoped config (`.pi/extensions/guardrails.json`)
- **Global**: edit global config (`~/.pi/agent/extensions/guardrails.json`)

Use `Tab` / `Shift+Tab` to switch tabs. Boolean settings can be toggled directly. Array/object settings (patterns, tools) require manual JSON editing.

### Configuration Schema

```json
{
  "enabled": true,
  "features": {
    "preventBrew": false,
    "preventPython": false,
    "protectEnvFiles": true,
    "permissionGate": true,
    "enforcePackageManager": false
  },
  "packageManager": {
    "selected": "npm"
  },
  "envFiles": {
    "protectedPatterns": ["\\.env$", "\\.env\\.local$"],
    "allowedPatterns": [
      "\\.(example|sample|test)\\.env$",
      "\\.env\\.(example|sample|test)$"
    ],
    "protectedDirectories": [],
    "protectedTools": ["read", "write", "edit", "bash", "grep", "find", "ls"],
    "onlyBlockIfExists": true,
    "blockMessage": "Accessing {file} is not allowed. ..."
  },
  "permissionGate": {
    "patterns": [
      { "pattern": "rm\\s+-rf", "description": "recursive force delete" }
    ],
    "customPatterns": [],
    "requireConfirmation": true,
    "allowedPatterns": [],
    "autoDenyPatterns": []
  }
}
```

All fields are optional. Missing fields use defaults shown above.

### Configuration Details

#### `features`

| Key | Default | Description |
|---|---|---|
| `preventBrew` | `false` | Block Homebrew install/upgrade commands |
| `preventPython` | `false` | Block python/pip/poetry commands (use uv instead) |
| `protectEnvFiles` | `true` | Block access to `.env` files containing secrets |
| `permissionGate` | `true` | Prompt for confirmation on dangerous commands |
| `enforcePackageManager` | `false` | Enforce a specific Node package manager |

#### `packageManager`

| Key | Default | Description |
|---|---|---|
| `selected` | `"npm"` | Package manager to enforce: `"npm"`, `"pnpm"`, or `"bun"` |

#### `envFiles`

| Key | Default | Description |
|---|---|---|
| `protectedPatterns` | `["\\.env$", "\\.env\\.local$"]` | Regex patterns for files to protect |
| `allowedPatterns` | `["\\.(example\|sample\|test)\\.env$", ...]` | Regex patterns for allowed exceptions |
| `protectedDirectories` | `[]` | Regex patterns for directories to protect |
| `protectedTools` | `["read", "write", "edit", "bash", "grep", "find", "ls"]` | Tools to intercept |
| `onlyBlockIfExists` | `true` | Only block if the file exists on disk |
| `blockMessage` | See defaults | Message shown when blocked. Supports `{file}` placeholder |

#### `permissionGate`

| Key | Default | Description |
|---|---|---|
| `patterns` | See defaults | Array of `{ pattern, description }` for dangerous commands |
| `customPatterns` | Not set | If set, replaces `patterns` entirely |
| `requireConfirmation` | `true` | Show confirmation dialog (if `false`, just warns) |
| `allowedPatterns` | `[]` | Regex patterns that bypass the gate |
| `autoDenyPatterns` | `[]` | Regex patterns that are blocked immediately without dialog |

### Examples

Enable `prevent-brew` for a project using Nix:

```json
{
  "features": {
    "preventBrew": true
  }
}
```

Add a custom dangerous command pattern:

```json
{
  "permissionGate": {
    "patterns": [
      { "pattern": "rm\\s+-rf", "description": "recursive force delete" },
      { "pattern": "\\bsudo\\b", "description": "superuser command" },
      { "pattern": "docker\\s+system\\s+prune", "description": "docker system prune" }
    ]
  }
}
```

Auto-deny certain commands:

```json
{
  "permissionGate": {
    "autoDenyPatterns": ["rm\\s+-rf\\s+/(?!tmp)"]
  }
}
```

Enforce pnpm as the package manager:

```json
{
  "features": {
    "enforcePackageManager": true
  },
  "packageManager": {
    "selected": "pnpm"
  }
}
```

## Events

The extension emits events on the pi event bus for inter-extension communication.

### `guardrails:blocked`

Emitted when a tool call is blocked by any guardrail.

```typescript
interface GuardrailsBlockedEvent {
  feature: "preventBrew" | "preventPython" | "protectEnvFiles" | "permissionGate" | "enforcePackageManager";
  toolName: string;
  input: Record<string, unknown>;
  reason: string;
  userDenied?: boolean;
}
```

### `guardrails:dangerous`

Emitted when a dangerous command is detected (before the confirmation dialog).

```typescript
interface GuardrailsDangerousEvent {
  command: string;
  description: string;
  pattern: string;
}
```

The [presenter extension](../presenter) listens for `guardrails:dangerous` events and plays a notification sound.

## Hooks

### prevent-brew

Blocks bash commands that attempt to install packages using Homebrew. Disabled by default. Enable via config if your project uses Nix.

Blocked patterns:
- `brew install`
- `brew cask install`
- `brew bundle`
- `brew upgrade`
- `brew reinstall`

### prevent-python

Blocks bash commands that use Python tooling directly. Disabled by default. Enable if your project uses uv for Python management.

Blocked patterns:
- `python`, `python3`
- `pip`, `pip3`
- `poetry`
- `pyenv`
- `virtualenv`, `venv`

### protect-env-files

Prevents accessing `.env` files that might contain secrets. Only allows access to safe variants:
- `.env.example`
- `.env.sample`
- `.env.test`
- `*.example.env`
- `*.sample.env`
- `*.test.env`

Covers tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls` (configurable).

### permission-gate

Prompts user confirmation before executing dangerous commands:
- `rm -rf` (recursive force delete)
- `sudo` (superuser command)
- `: | sh` (piped shell execution)
- `dd if=` (disk write operation)
- `mkfs.` (filesystem format)
- `chmod -R 777` (insecure recursive permissions)
- `chown -R` (recursive ownership change)

All patterns are configurable. Supports allow-lists and auto-deny lists.

### enforce-package-manager

Enforces using a specific Node package manager. Disabled by default. When enabled, blocks commands using non-selected package managers.

Configure via `packageManager.selected`:
- `"npm"` (default)
- `"pnpm"`
- `"bun"`

Example: If `selected` is `"pnpm"`, running `npm install` or `bun add` will be blocked with a message instructing the agent to use `pnpm` instead.
