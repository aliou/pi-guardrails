# Guardrails

Security hooks to prevent potentially dangerous operations.

## Demo

<video src="https://assets.aliou.me/pi-extensions/2026-01-26-guardrails-demo.mp4" controls playsinline muted></video>

## Installation

```bash
pi install npm:@aliou/pi-guardrails
```

Or from git:

```bash
pi install git:github.com/aliou/pi-guardrails
```

## Features

- **protect-env-files**: Prevents access to `.env` files (except `.example`/`.sample`/`.test`)
- **permission-gate**: Prompts for confirmation on dangerous commands

All hooks use structural shell parsing via `@aliou/sh` to avoid false positives from keywords inside commit messages, grep patterns, heredocs, or file paths. On parse failure, each hook falls back to regex matching (previous behavior).

> **Migration note**: The `preventBrew`, `preventPython`, `enforcePackageManager`, and `packageManager` fields have been removed from guardrails and moved to the [`@aliou/pi-toolchain`](https://github.com/aliou/pi-toolchain) extension. Old configs containing these fields are auto-cleaned on first load with a one-time warning. Install `@aliou/pi-toolchain` and configure `.pi/extensions/toolchain.json` instead.

## Configuration

Configuration is loaded from two optional JSON files, merged in order (project overrides global):

- **Global**: `~/.pi/agent/extensions/guardrails.json`
- **Project**: `.pi/extensions/guardrails.json`

### Settings Command

Run `/guardrails:settings` to open an interactive settings UI with two tabs:
- **Local**: edit project-scoped config (`.pi/extensions/guardrails.json`)
- **Global**: edit global config (`~/.pi/agent/extensions/guardrails.json`)

Use `Tab` / `Shift+Tab` to switch tabs. Boolean settings can be toggled directly.

### Migration from v0

Configs without a `version` field are automatically migrated on first load. The migration:
- Backs up the original as `guardrails.v0.json`
- Converts all string patterns to `{ pattern, regex: true }` to preserve behavior
- Adds a `version` field

### Configuration Schema

```json
{
  "enabled": true,
  "features": {
    "protectEnvFiles": true,
    "permissionGate": true
  },
  "envFiles": {
    "protectedPatterns": [
      { "pattern": ".env" },
      { "pattern": ".env.local" },
      { "pattern": ".env.production" },
      { "pattern": ".env.prod" },
      { "pattern": ".dev.vars" }
    ],
    "allowedPatterns": [
      { "pattern": ".env.example" },
      { "pattern": ".env.sample" },
      { "pattern": ".env.test" },
      { "pattern": "*.example.env" },
      { "pattern": "*.sample.env" },
      { "pattern": "*.test.env" }
    ],
    "protectedDirectories": [],
    "protectedTools": ["read", "write", "edit", "bash", "grep", "find", "ls"],
    "onlyBlockIfExists": true,
    "blockMessage": "Accessing {file} is not allowed. ..."
  },
  "permissionGate": {
    "patterns": [
      { "pattern": "rm -rf", "description": "recursive force delete" },
      { "pattern": "sudo", "description": "superuser command" }
    ],
    "customPatterns": [],
    "requireConfirmation": true,
    "allowedPatterns": [],
    "autoDenyPatterns": []
  }
}
```

All fields are optional. Missing fields use defaults shown above. The default patterns listed here may change between versions. Check the source code or run `/guardrails:settings` to see the current defaults and update them to your liking.

### Pattern Format

Patterns support two modes controlled by the `regex` flag:

**File patterns** (envFiles section):
- Default (`regex` omitted or `false`): glob matching against the filename. `*` matches any non-`/` chars, `?` matches a single char. Example: `.env.*` matches `.env.local`, `.env.production`.
- `regex: true`: full regex (case-insensitive) against the full path. Example: `{ "pattern": "\\.env$", "regex": true }`.

**Command patterns** (permissionGate section):
- Default (`regex` omitted or `false`): substring matching against the raw command string. Example: `"rm -rf"` matches any command containing `rm -rf`.
- `regex: true`: full regex against the raw command string. Example: `{ "pattern": "rm\\s+-rf", "regex": true }`.

Built-in dangerous command patterns (`rm -rf`, `sudo`, `dd if=`, `mkfs.*`, `chmod -R 777`, `chown -R`) are matched structurally via AST parsing, independent of the pattern format.

### Configuration Details

#### `features`

| Key | Default | Description |
|---|---|---|
| `protectEnvFiles` | `true` | Block access to `.env` files containing secrets |
| `permissionGate` | `true` | Prompt for confirmation on dangerous commands |

#### `envFiles`

| Key | Default | Description |
|---|---|---|
| `protectedPatterns` | `[".env", ".env.local", ...]` | Patterns for files to protect (glob by default) |
| `allowedPatterns` | `[".env.example", "*.example.env", ...]` | Patterns for allowed exceptions |
| `protectedDirectories` | `[]` | Patterns for directories to protect |
| `protectedTools` | `["read", "write", "edit", "bash", "grep", "find", "ls"]` | Tools to intercept |
| `onlyBlockIfExists` | `true` | Only block if the file exists on disk |
| `blockMessage` | See defaults | Message shown when blocked. Supports `{file}` placeholder |

#### `permissionGate`

| Key | Default | Description |
|---|---|---|
| `patterns` | See defaults | Array of `{ pattern, description }` for dangerous commands |
| `customPatterns` | Not set | If set, replaces `patterns` entirely |
| `requireConfirmation` | `true` | Show confirmation dialog (if `false`, just warns) |
| `allowedPatterns` | `[]` | Patterns that bypass the gate |
| `autoDenyPatterns` | `[]` | Patterns that are blocked immediately without dialog |

### Examples

Add a custom dangerous command pattern (substring match):

```json
{
  "permissionGate": {
    "patterns": [
      { "pattern": "rm -rf", "description": "recursive force delete" },
      { "pattern": "sudo", "description": "superuser command" },
      { "pattern": "docker system prune", "description": "docker system prune" }
    ]
  }
}
```

Add a regex-based pattern:

```json
{
  "permissionGate": {
    "patterns": [
      { "pattern": "rm\\s+-rf\\s+/(?!tmp)", "description": "rm -rf outside /tmp", "regex": true }
    ]
  }
}
```

Protect env files with glob patterns:

```json
{
  "envFiles": {
    "protectedPatterns": [
      { "pattern": ".env" },
      { "pattern": ".env.*" },
      { "pattern": ".dev.vars" }
    ]
  }
}
```

## Events

The extension emits events on the pi event bus for inter-extension communication.

### `guardrails:blocked`

Emitted when a tool call is blocked by any guardrail.

```typescript
interface GuardrailsBlockedEvent {
  feature: "protectEnvFiles" | "permissionGate";
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

The [presenter extension](https://github.com/aliou/pi-extensions/tree/main/extensions/presenter) listens for `guardrails:dangerous` events and plays a notification sound.

## Hooks

### protect-env-files

Prevents accessing `.env` files that might contain secrets. Only allows access to safe variants like `.env.example`, `.env.sample`, `.env.test`.

Shell globs (e.g. `.env*`) are expanded via `fd` to check if any expanded path matches a protected pattern.

Covers tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls` (configurable).

### permission-gate

Prompts user confirmation before executing dangerous commands:
- `rm -rf` (recursive force delete)
- `sudo` (superuser command)
- `dd if=` (disk write operation)
- `mkfs.` (filesystem format)
- `chmod -R 777` (insecure recursive permissions)
- `chown -R` (recursive ownership change)

Built-in patterns are matched structurally (AST-based). Custom patterns use substring or regex matching. Supports allow-lists and auto-deny lists.
