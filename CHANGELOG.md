# @aliou/pi-guardrails

## 0.11.0

### Minor Changes

- 11e88c0: Fix dd pattern (if= to of=) and expand dangerous command detection

  Fixed the dd pattern to check for of= (output file) instead of if= (input file),
  as of= is the actual dangerous write operation. Also extracted dangerous command
  matchers to a separate module and added new patterns for:

  - Privilege escalation: doas, pkexec
  - Secure destruction: shred, wipefs, blkdiscard
  - Disk partitioning: fdisk, sfdisk, cfdisk, parted, sgdisk
  - Container escapes: docker/podman run with --privileged, --pid=host,
    --network=host, --userns=host, root mounts, docker socket mounts

  Improved existing matchers to handle long options like --recursive,
  --force, etc.

  Fixes #22

- ba06d72: Add path access feature: restrict tool access to current working directory with allow/ask/block modes. Grants can be file-level (exact match) or directory-level (trailing slash convention). Session grants persist in memory, project grants persist in local config.

### Patch Changes

- 2db56c2: Fix permission gate bypass in RPC mode: deny-by-default when `ctx.ui.custom()` returns undefined, with fallback to `ctx.ui.select()`.

## 0.10.0

### Minor Changes

- 6356335: Add command-based onboarding for new users.

  - add `/guardrails:onboarding` command and session-start hint when setup is pending
  - replace auto-open onboarding with explicit overlay flow
  - add onboarding completion marker for config compatibility and first-run state
  - improve onboarding wizard copy and defaults/recap UX

### Patch Changes

- 828c019: Fix dangerous command confirmation UI scrolling for long multi-line commands.
- 97597c2: Fix home-directory default policy rules so `~`-based patterns match correctly and expand to the current user's home directory during blocking and existence checks.

## 0.9.5

### Patch Changes

- da0f0b7: chore: update Pi peer and dev package versions to 0.61.0

  - update `@mariozechner/pi-agent-core`, `@mariozechner/pi-ai`, `@mariozechner/pi-coding-agent`, and `@mariozechner/pi-tui` to `0.61.0`
  - verify the extension against Pi 0.61.0 changelogs and docs
  - confirm no source-level migration was needed for namespaced keybinding ids or tool wrapper execute signatures

## 0.9.4

### Patch Changes

- d5047c5: fix: update `@aliou/pi-utils-settings` to 0.10.1 for nested wizard Ctrl+S handling

  - pulls in the `pi-utils-settings` fix that lets nested settings submenus receive `Ctrl+S` before the top-level settings screen intercepts save
  - fixes the add-policy flow so the review step can submit with `Ctrl+S`

## 0.9.3

### Patch Changes

- f20cce2: Add Homebrew and Docker secret command examples to the permission gate presets in the Examples tab.
- ae512a6: Add more policy and command examples in settings UI

  File policy presets:

  - SSH keys (_.pem, _\_rsa, \*\_ed25519)
  - AWS credentials (.aws/credentials, .aws/config)
  - Database files (_.db, _.sqlite, \*.sqlite3) - read-only
  - Kubernetes secrets (.kube/config, _kubeconfig_)
  - Certificates (_.crt, _.key, \*.p12)

  Dangerous command presets:

  - terraform apply/destroy
  - kubectl delete
  - docker system prune
  - git push --force
  - npm/yarn/pnpm publish
  - DROP DATABASE/TABLE

## 0.9.2

### Patch Changes

- 9cd0054: bump @aliou/pi-utils-settings to ^0.10.0 (local scope fix)

## 0.9.1

### Patch Changes

- a01452d: Fix policy file glob matching for nested paths like `drizzle/**/*.sql` by using native Node glob matching on normalized relative targets.

  This keeps basename matching for simple patterns (for backward compatibility), while allowing patterns with `/` to match full relative paths as users expect.

## 0.9.0

### Minor Changes

- 78f640d: Improve settings UX with guided policy creation and top-level examples tab.

  - Add a real wizard flow for creating a new policy in settings (name, protection, patterns, review), then open the policy editor.
  - Move policy examples into a dedicated top-level `Examples` tab using `extraTabs`.
  - Ask target scope each time an example is applied; do not persist last selected scope.
  - Upgrade `@aliou/pi-utils-settings` to `^0.8.0` to use `extraTabs` and combined settings theme support.
  - Keep pattern editor compact while preserving `Ctrl+R` regex toggle in form mode.

## 0.8.0

### Minor Changes

- e8eea2f: Redesign file protection from legacy `envFiles` to a new `policies` system with per-rule protection levels (`noAccess`, `readOnly`, `none`), add migration from old config fields, and replace the old env hook with a general policies hook.
- e762afc: Add opt-in LLM command explanations to the permission gate dialog with configurable model and timeout settings, plus graceful fallback when model resolution or explanation calls fail.

### Patch Changes

- e4a8438: Update docs and migration semantics for config schema versioning. Bump `@aliou/pi-utils-settings` to latest `0.5.x`, clarify fallback behavior in README/AGENTS, ignore `.pi/settings.json`, and ensure migrated configs write the current schema version without lexicographic version comparisons.
- d9f91cd: Harden permission-gate command explanation prompt handling, fix dangerous-pattern matching flow after successful AST parses, and improve policy enforcement by skipping empty rules and resolving onlyIfExists checks relative to session cwd. Also refresh README/AGENTS docs for the policies-based architecture.

## 0.7.7

### Patch Changes

- 0b5ab5b: Move `@mariozechner/pi-tui` to peer dependencies to avoid bundling the SDK alongside the extension.
- 3ea037a: Replace all `console.error`/`console.warn` calls with a module-level warnings queue. Warnings collected during config loading, migration, and pattern compilation are now drained and reported via `ctx.ui.notify` at `session_start`.

## 0.7.6

### Patch Changes

- 31ae8f0: mark pi SDK peer deps as optional to prevent koffi OOM in Gondolin VMs

## 0.7.5

### Patch Changes

- 6c5b699: Move to standalone repository

## 0.7.4

### Patch Changes

- Updated dependencies [7df01a2]
  - @aliou/pi-utils-settings@0.4.0

## 0.7.3

### Patch Changes

- 024c9a4: Fix false positives in permission gate when dangerous keywords appear inside command arguments (e.g. "sudo" in a git commit message). When structural AST matching succeeds, skip the redundant substring match on the raw command string.

## 0.7.2

### Patch Changes

- 9ba0cb9: Add "allow for session" option to permission gate confirmation dialog. Pressing `a` saves the command as an allowed pattern in the memory scope, bypassing future prompts for the same command in the current session.
- Updated dependencies [756552a]
  - @aliou/pi-utils-settings@0.3.0

## 0.7.1

### Patch Changes

- 2d9a958: update README documentation to match current implementation

## 0.7.0

### Minor Changes

- 7a3f659: Add memory scope for ephemeral settings overrides

## 0.6.2

### Patch Changes

- Updated dependencies [06e7e0c]
  - @aliou/pi-utils-settings@0.2.0

## 0.6.1

### Patch Changes

- 3471b6c: Explicitly add deps to root package.json
- d73dadb: Reorganize file structure: move commands to commands/, components to components/, utils to utils/. Merge config-schema types into config.ts.

## 0.6.0

### Minor Changes

- 29b61a5: Remove toolchain features (preventBrew, preventPython, enforcePackageManager) -- moved to @aliou/pi-toolchain. Replace custom config loader and settings UI with @aliou/pi-utils-settings.

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
