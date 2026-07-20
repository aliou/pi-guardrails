![banner](https://assets.aliou.me/github/aliou/pi-guardrails/banner.png)

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

[![Guardrails onboarding walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/onboarding.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/onboarding.mp4)

You can change everything later with:

```text
/guardrails:settings
```

## Included extensions

### guardrails

The `guardrails` extension owns file protection policies and the user-facing commands.

Use it to protect files like `.env`, private keys, local credentials, generated logs, database dumps, or any project-specific path you do not want Pi to read or modify without clear intent.

[![Guardrails policies and settings walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/policies.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/policies.mp4)

Useful commands:

```text
/guardrails:settings
/guardrails:onboarding
/guardrails:examples
```

### path-access

The `path-access` extension checks tool calls that target paths outside the current working directory.

It can allow, block, or ask before Pi accesses files elsewhere on your machine. In ask mode, you can allow one file or a directory once, for the session, or always.

Granted paths are stored in `pathAccess.allowedPaths` as explicit `{ kind, path }` entries: `file` matches the exact path, `directory` matches the directory and its descendants. Edit them through `/guardrails:settings` (Path Access → Allowed paths, Tab toggles file/directory) or directly in the settings file. Paths support `~/` for home. Existing configs using the legacy string form (trailing `/` for directories) are migrated automatically.

[![Guardrails path access prompt walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/path-access.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/path-access.mp4)

### permission-gate

The `permission-gate` extension detects dangerous bash commands before they run.

It catches built-in risky patterns like recursive deletes, privileged commands, disk formatting, broad permission changes, and configured custom patterns. You can allow once, allow for the session, deny, decline and stop (which also aborts the current turn), or configure auto-deny rules.

[![Guardrails permission gate walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/permission-gate.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/permission-gate.mp4)

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

[![Guardrails examples command walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/examples.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.12.0/examples.mp4)

The available presets live in [`extensions/guardrails/commands/settings/examples.ts`](extensions/guardrails/commands/settings/examples.ts).

## Similar but different

Pi is designed to make agent safety extensible. Guardrails focuses on deterministic, configurable file policies, outside-workspace path access, and dangerous-command prompts. Other packages tend to fall into two useful groups.

See [pi.dev/packages](https://pi.dev/packages) for the full registry of Pi extensions.

### Make one yourself!

If Guardrails or the alternatives below do not fit your needs, you can also make your own. Start from the [Pi permission gate example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts), then ask Pi to customize it for your workflow.

### Permission and policy gates

These packages add checks around tool calls before they run. They are closest to Guardrails when you want policy enforcement without changing where Pi executes.

- [@gotgenes/pi-permission-system](https://pi.dev/packages/%40gotgenes/pi-permission-system): broad permission enforcement for Pi tool calls.
- [@vtstech/pi-security](https://pi.dev/packages/%40vtstech/pi-security): command, path, network, mode, and audit controls.
- [pi-control](https://github.com/mcowger/pi-control/blob/main/README.md): location-scoped, action-based policies for tool calls, with allow, log, ask, and deny outcomes before execution.
- [@casualjim/pi-heimdall](https://pi.dev/packages/%40casualjim/pi-heimdall): secret exposure guards, command policies, protected `.env` files, and a sandbox guard.
- [pi-file-permissions](https://pi.dev/packages/pi-file-permissions): file-level permissions for read, write, edit, find, grep, and ls tools.
- [pi-secret-guard](https://pi.dev/packages/pi-secret-guard): focused protection against committing or pushing secrets to git.

### Sandboxes and containment

These packages reduce blast radius by running Pi, subagents, or tool calls inside a constrained environment. They can be a better fit when you want isolation first and prompts second.

- [Pi + Gondolin sandbox example](https://github.com/earendil-works/gondolin/blob/main/host/examples/pi-gondolin.ts): upstream example that runs Pi tools inside a Gondolin micro-VM.
- [pi-sandbox](https://pi.dev/packages/pi-sandbox): OS-level sandboxing for bash, with allow/deny checks and prompts for file tools.
- [pi-container-sandbox](https://pi.dev/packages/pi-container-sandbox): runs read, write, edit, bash, and user bash operations inside a Docker or Apple container session.
- [@alexanderfortin/pi-freestyle-sandbox](https://pi.dev/packages/%40alexanderfortin/pi-freestyle-sandbox): runs sandboxed subagents in Freestyle cloud VMs.
- [@the-agency/vmpi](https://pi.dev/packages/%40the-agency/vmpi): runs Pi inside a QEMU microVM with limited filesystem and network access.
- [pi-claude-sandbox](https://pi.dev/packages/pi-claude-sandbox): Claude-style OS sandboxing with interactive permission prompts.

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
