![banner](https://assets.aliou.me/github/aliou/pi-guardrails/banner.png)

# Guardrails

Guardrails adds safety checks to Pi so agents are less likely to read secrets, write protected files, access paths outside the workspace, or run dangerous shell commands by accident.

The package installs five Pi extensions:

- **guardrails** — file protection policies, settings, onboarding, and examples.
- **path-access** — controlling access outside the current workspace.
- **permission-gate** — confirming or blocking risky shell commands.
- **herdr** — reporting Guardrails approval prompts to Herdr.
- **program-status** — reporting Guardrails approval prompts to terminals that support the Program Status Protocol.

## Install

```bash
pi install npm:@aliou/pi-guardrails
```

## First run

After installing, run the onboarding command to choose a starting setup: `/guardrails:onboarding`. You can change everything later with `/guardrails:settings`.

[![Guardrails onboarding walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/onboarding.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/onboarding.mp4)

## Included extensions

### guardrails

Protects files like `.env`, private keys, local credentials, database dumps, or any project-specific path you do not want Pi to read or modify without clear intent. Rules respect the current working directory by default and are configurable in the settings UI.

[![Guardrails policies and settings walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/policies.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/policies.mp4)

Use `/guardrails:examples` to add common policy and command presets without replacing your existing config.

[![Guardrails examples command walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/examples.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/examples.mp4)

### path-access

Checks tool calls that target paths outside the current working directory. It can allow, block, or ask before Pi accesses files elsewhere on your machine; in ask mode, you can allow a file or a directory once, for the session, or always. By default, checks apply to both reads and writes outside the workspace, and "always" grants are saved to the project config — both are configurable through `/guardrails:settings`.

[![Guardrails path access prompt walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/path-access.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/path-access.mp4)

### permission-gate

Detects dangerous bash commands before they run — recursive deletes, privileged commands, disk formatting, broad permission changes, and any custom patterns you configure. You can allow once, allow for the session, deny, or decline and stop, which also aborts the current turn. Auto-deny patterns can set `terminate: true` to end the agent's turn after blocking, so it does not retry the blocked command.

Command, policy, and path checks also look inside command and process substitutions, so a risky call wrapped in `$(...)` is still caught.

[![Guardrails permission gate walkthrough](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/permission-gate.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/permission-gate.mp4)

### herdr

The included Herdr adapter reports active Guardrails approval prompts through Herdr's `herdr:blocked` event, so Herdr can show the Pi pane as blocked while a prompt waits for a decision. It has no configuration and no effect unless Herdr's Pi integration is active.

### program-status

Reports Guardrails approval prompts to terminals that support the [Program Status Protocol (OSC 7501)](https://www.superlogical.com/rex/docs/build/program-status), such as Rex. While a prompt is open, the terminal shows Pi as `blocked` instead of `working`; once the last prompt closes, it reports `working` again. It writes only when stdout is a terminal and can be disabled with `PI_PROGRAM_STATUS=0`.

[![Guardrails approval status in Rex](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/program-status.gif)](https://assets.aliou.me/github/aliou/pi-guardrails/v0.22.0/program-status.mp4)

## Decision delegation

Before permission-gate or path-access prompts you, other extensions can decide for you. If every registered delegate allows the action, it runs without a prompt; if any blocks it, it is blocked; anything else, including a timeout, falls back to the usual prompt. Each decision shows up under the tool call as a `[guardrails]` line.

The built-in classifier delegate uses Pi classifier models to judge whether a flagged action is in scope of what you asked. Enable it with `features.classifier` (Settings → Features → Classifier).

See [docs/decision-delegation.md](docs/decision-delegation.md) for the rules, the classifier, and how to write a delegate, with runnable examples in `examples/delegates/`.

## Extension events

Guardrails emits paired events on Pi's shared event bus: `guardrails:prompt:opened` when an interactive prompt starts waiting for input and `guardrails:prompt:closed` when it stops. Both carry the same `prompt.id` for correlation.

Decision delegation events are listed in [docs/decision-delegation.md](docs/decision-delegation.md#events).

## Configuration

Most configuration happens through the interactive settings UI (`/guardrails:settings`). Advanced users can edit the settings file directly:

- Global: `~/.pi/agent/extensions/guardrails.json`
- Project: `.pi/extensions/guardrails.json`

Project settings apply only after Pi trusts the folder (`/trust`, then restart Pi). Until then, untrusted project files are ignored and left unchanged, while global settings and built-in protections still apply. Set `pathAccess.alwaysScope` to `"global"` to save "always" path grants without trusting the project.

Saved files include a `$schema` field for editor autocomplete and validation; the schema is committed at [`schema.json`](schema.json).

## Similar but different

Pi is designed to make agent safety extensible. Guardrails focuses on deterministic, configurable file policies, path access control, and dangerous-command prompts. See [pi.dev/packages](https://pi.dev/packages) for the full registry.

Closest alternatives:

- [@gotgenes/pi-permission-system](https://pi.dev/packages/%40gotgenes/pi-permission-system): broad permission enforcement for Pi tool calls.
- [@vtstech/pi-security](https://pi.dev/packages/%40vtstech/pi-security): command, path, network, mode, and audit controls.
- [@casualjim/pi-heimdall](https://pi.dev/packages/%40casualjim/pi-heimdall): secret exposure guards, command policies, protected `.env` files, and a sandbox guard.
- [pi-sandbox](https://pi.dev/packages/pi-sandbox): OS-level sandboxing for bash, with allow/deny checks and prompts for file tools.
- [pi-container-sandbox](https://pi.dev/packages/pi-container-sandbox): runs read, write, edit, bash, and user bash operations inside a container session.

You can also make your own: start from the [Pi permission gate example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/permission-gate.ts) and ask Pi to customize it for your workflow.

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
