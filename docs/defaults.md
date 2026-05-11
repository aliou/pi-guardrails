# Default configuration

Guardrails uses one shared config file for all split extensions: `guardrails.json`.

The default config is defined in [`src/shared/config/defaults.ts`](../src/shared/config/defaults.ts). Settings can be edited with `/guardrails:settings`.

## Features

| Setting | Default | Owner |
|---|---:|---|
| `features.policies` | `true` | `extensions/guardrails` |
| `features.permissionGate` | `true` | `extensions/permission-gate` |
| `features.pathAccess` | `false` | `extensions/path-access` |

## Policies

Policies block or limit file access. Policy rules are enforced by `extensions/guardrails`.

Default rules:

| ID | Protection | Enabled | Purpose |
|---|---|---:|---|
| `secret-files` | `noAccess` | yes | Blocks dotenv-like secret files. |
| `home-ssh` | `noAccess` | no | Blocks SSH config and private key paths. |
| `home-config` | `noAccess` | no | Blocks sensitive CLI config directories. |
| `home-gpg` | `noAccess` | no | Blocks GPG key/config paths. |

Home-directory patterns use `~`. Guardrails expands `~` before evaluating whether a file exists or should be blocked.

## Path access

Path access is enforced by `extensions/path-access`.

| Setting | Default |
|---|---|
| `features.pathAccess` | `false` |
| `pathAccess.mode` | `"ask"` |
| `pathAccess.allowedPaths` | `[]` |

Modes:

- `allow` — no path restrictions.
- `ask` — prompt before accessing paths outside the current working directory.
- `block` — deny outside-workspace access.

Allowed paths use a trailing-slash convention:

- `/path/to/file` — exact file.
- `/path/to/dir/` — directory and descendants.
- `~/...` — home-relative path.

In non-interactive mode, `ask` behaves like `block`.

## Permission gate

Permission gate is enforced by `extensions/permission-gate`.

| Setting | Default |
|---|---|
| `features.permissionGate` | `true` |
| `permissionGate.requireConfirmation` | `true` |
| `permissionGate.useBuiltinMatchers` | `true` |
| `permissionGate.allowedPatterns` | `[]` |
| `permissionGate.autoDenyPatterns` | `[]` |

Auto-deny patterns block commands immediately without dialog. Each pattern supports an optional `description` field that is surfaced as the block reason, helping the agent understand why the command was denied and adapt accordingly.

Example:

```jsonc
{
  "permissionGate": {
    "autoDenyPatterns": [
      {
        "pattern": "python -m venv",
        "description": "Use the project .venv instead of creating another virtualenv."
      }
    ]
  }
}
```

When no description is provided, a generic reason is returned.

Default dangerous patterns include:

| Pattern | Description |
|---|---|
| `rm -rf` | recursive force delete |
| `sudo` | superuser command |
| `dd of=` | disk write operation |
| `mkfs.` | filesystem format |
| `chmod -R 777` | insecure recursive permissions |
| `chown -R` | recursive ownership change |
| `doas` | privileged command execution |
| `pkexec` | privileged command execution |
| `shred` | secure file overwrite |
| `wipefs` | filesystem signature wipe |
| `blkdiscard` | block device discard |
| `fdisk` | disk partitioning |
| `parted` | disk partitioning |
| `docker run --privileged` | container with privileged mode |
