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

- **prevent-brew**: Blocks Homebrew commands (project uses Nix)
- **protect-env-files**: Prevents access to `.env` files (except `.example`/`.sample`/`.test`)
- **permission-gate**: Prompts for confirmation on dangerous commands

## Hooks

### prevent-brew

Blocks bash commands that attempt to install packages using Homebrew. Notifies the user that the project uses Nix for package management.

Blocked patterns:
- `brew install`
- `brew cask install`
- `brew bundle`
- `brew upgrade`
- `brew reinstall`

### protect-env-files

Prevents accessing `.env` files that might contain secrets. Only allows access to safe variants:
- `.env.example`
- `.env.sample`
- `.env.test`
- `*.example.env`
- `*.sample.env`
- `*.test.env`

Covers tools: `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`

### permission-gate

Prompts user confirmation before executing dangerous commands:
- `rm -rf` (recursive force delete)
- `sudo` (superuser command)
- `: | sh` (piped shell execution)
- `dd if=` (disk write operation)
- `mkfs.` (filesystem format)
- `chmod -R 777` (insecure recursive permissions)
- `chown -R` (recursive ownership change)
