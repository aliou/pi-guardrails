![banner](https://assets.aliou.me/pi-extensions/banners/pi-guardrails.png)

# Guardrails

Guardrails adds safety checks to Pi so agents are less likely to read secrets, write protected files, access paths outside the workspace, or run dangerous shell commands by accident.

This package installs three Pi extensions:

- **guardrails** for file protection policies, settings, onboarding, and examples.
- **path-access** for controlling access outside the current workspace.
- **permission-gate** for confirming or blocking risky shell commands.

## Install

```bash
pi install npm:@aliou/pi-guardrails
```

## First run

After installing, run the onboarding command to choose a starting setup:

```text
/guardrails:onboarding
```

<!-- TODO: replace with final onboarding GIF. -->

![Guardrails onboarding walkthrough](https://assets.aliou.me/pi-extensions/demos/guardrails/v0.12.0/onboarding.gif)

You can change everything later with:

```text
/guardrails:settings
```

## Included extensions

### guardrails

The `guardrails` extension owns file protection policies and the user-facing commands.

Use it to protect files like `.env`, private keys, local credentials, generated logs, database dumps, or any project-specific path you do not want Pi to read or modify without clear intent.

<!-- TODO: replace with final policies/settings GIF. -->

![Guardrails policies and settings walkthrough](https://assets.aliou.me/pi-extensions/demos/guardrails/v0.12.0/policies.gif)

Useful commands:

```text
/guardrails:settings
/guardrails:onboarding
/guardrails:examples
```

### path-access

The `path-access` extension checks tool calls that target paths outside the current working directory.

It can allow, block, or ask before Pi accesses files elsewhere on your machine. In ask mode, you can allow one file or a directory once, for the session, or always.

<!-- TODO: replace with final path-access GIF. -->

![Guardrails path access prompt walkthrough](https://assets.aliou.me/pi-extensions/demos/guardrails/v0.12.0/path-access.gif)

### permission-gate

The `permission-gate` extension detects dangerous bash commands before they run.

It catches built-in risky patterns like recursive deletes, privileged commands, disk formatting, broad permission changes, and configured custom patterns. You can allow once, allow for the session, deny, or configure auto-deny rules.

<!-- TODO: replace with final permission-gate GIF. -->

![Guardrails permission gate walkthrough](https://assets.aliou.me/pi-extensions/demos/guardrails/v0.12.0/permission-gate.gif)

## Configuration

Most configuration should happen through the interactive settings UI:

```text
/guardrails:settings
```

Advanced users can edit the settings file directly:

- Global: `~/.pi/agent/extensions/guardrails.json`
- Project: `.pi/extensions/guardrails.json`

Guardrails writes a `$schema` field to saved settings files, so modern editors provide autocomplete and validation. The generated schema is committed at [`schema.json`](schema.json).

## Examples

Use the examples command to add common policy and command presets without replacing your existing config:

```text
/guardrails:examples
```

<!-- TODO: replace with final examples GIF. -->

![Guardrails examples command walkthrough](https://assets.aliou.me/pi-extensions/demos/guardrails/v0.12.0/examples.gif)

The available presets live in [`extensions/guardrails/commands/settings/examples.ts`](extensions/guardrails/commands/settings/examples.ts).

## Development

```bash
pnpm test         # Run tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type check
pnpm lint         # Lint
pnpm format       # Format
pnpm gen:schema   # Regenerate schema.json
pnpm check:schema # Verify schema.json is current
```
