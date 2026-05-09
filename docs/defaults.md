# Default Configuration

These are the built-in defaults that ship with guardrails. Rules marked as disabled are included but inactive by default — enable them in your config or via `/guardrails:settings`.

Source: [`src/config.ts`](../src/config.ts)


Home-directory defaults use `~` in patterns. During policy evaluation, guardrails expands `~` to the current user's home directory before checking whether a file exists or should be blocked.
## Default Policy Rules

### `secret-files` — Files containing secrets

Blocks access to dotenv files and similar secret-bearing files.

| Protection | Only if exists |
|------------|---------------|
| `noAccess` | yes           |

**Patterns:**

| Pattern            | Type |
|--------------------|------|
| `.env`             | glob |
| `.env.local`       | glob |
| `.env.production`  | glob |
| `.env.prod`        | glob |
| `.dev.vars`        | glob |

**Allowed exceptions:**

| Pattern            | Type |
|--------------------|------|
| `*.example.env`    | glob |
| `*.sample.env`     | glob |
| `*.test.env`       | glob |
| `.env.example`     | glob |
| `.env.sample`      | glob |
| `.env.test`        | glob |

---

### `home-ssh` — SSH directory and keys

Blocks access to SSH configuration, private keys, and related files. Disabled by default.

| Protection | Only if exists | Enabled by default |
|------------|---------------|-------------------|
| `noAccess` | yes           | no                |

**Patterns:**

| Pattern               | Type |
|-----------------------|------|
| `~/.ssh/**`          | glob |
| `~/.ssh/*_rsa`       | glob |
| `~/.ssh/*_ed25519`   | glob |
| `~/.ssh/*.pem`       | glob |

**Allowed exceptions:**

| Pattern  | Type |
|----------|------|
| `~/.ssh/*.pub` | glob |

---

### `home-config` — Sensitive user configuration directories

Blocks access to a small set of known sensitive config directories that commonly store credentials, tokens, or encrypted material. Disabled by default — enable it if these tools are installed and you want to protect them.

| Protection | Only if exists | Enabled by default |
|------------|---------------|-------------------|
| `noAccess` | yes           | no                |

**Patterns:**

| Pattern               | Type |
|-----------------------|------|
| `~/.config/gh/**`     | glob |
| `~/.config/gcloud/**` | glob |
| `~/.config/op/**`     | glob |
| `~/.config/sops/**`   | glob |

---

### `home-gpg` — GPG keys and configuration

Blocks access to GPG/GnuPG private keys, keyrings, and configuration. Disabled by default.

| Protection | Only if exists | Enabled by default |
|------------|---------------|-------------------|
| `noAccess` | yes           | no                |

**Patterns:**

| Pattern            | Type |
|--------------------|------|
| `~/.gnupg/**`       | glob |
| `~/*.gpg`           | glob |
| `~/.gpg-agent.conf` | glob |

---

## Path Access

| Setting | Default |
|---|---|
| `features.pathAccess` | `false` |
| `pathAccess.mode` | `"ask"` |
| `pathAccess.allowedPaths` | `[]` |
| `pathAccess.alwaysScope` | `"local"` |

Modes:
- `allow` — no path restrictions
- `ask` — prompt when accessing paths outside working directory
- `block` — deny all access outside working directory

Allowed paths use trailing-slash convention:
- `/path/to/file` — exact file match
- `/path/to/dir/` — directory and all descendants
- Supports `~/` for home directory

Always-scope:
- `local` — "Allow … always" grants are saved to the project config (default; current behavior)
- `global` — "Allow … always" grants are saved to the user-wide config and apply in every project

Limitations:
- Bash path extraction is best-effort (AST-based heuristics). Tokens like `application/json` may trigger false-positive prompts.
- Symlinks are not resolved. Lexical path comparison only.
- In non-interactive mode (--print), `ask` mode degrades to `block`.

---

## Default Permission Gate Patterns

These commands are detected using AST-based structural matching for accuracy.

| Pattern         | Description                    |
|-----------------|--------------------------------|
| `rm -rf`        | Recursive force delete         |
| `sudo`          | Superuser command              |
| `dd of=`        | Disk write operation           |
| `mkfs.`         | Filesystem format              |
| `chmod -R 777`  | Insecure recursive permissions |
| `chown -R`      | Recursive ownership change     |
