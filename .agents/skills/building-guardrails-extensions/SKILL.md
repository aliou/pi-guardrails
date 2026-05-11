---
name: building-guardrails-extensions
description: "Builds new pi-guardrails feature extensions using the core/shared split. Use when adding guardrails features such as zones, policy engines, path controls, permission gates, or new Pi hooks in this repository."
---

# Building Guardrails Extensions

Use this when adding a new feature extension to `@aliou/pi-guardrails`.

## Architecture rules

- Put Pi-free primitives in `src/core` only when they are generic and reusable.
- Put shared Pi-extension infrastructure in `src/shared` only when multiple extensions need it.
- Put feature-specific rules, metadata, UI, prompts, and config interpretation in `extensions/<feature>`.
- Keep runtime code on the current config shape only. Legacy shapes belong in migrations.
- Keep event payload compatibility unless explicitly changing the public event contract.
- All split extensions share one config file: `guardrails.json` via `src/shared/config/loader.ts`.

## Extension shape

Create:

```text
extensions/<feature>/
  index.ts        # Pi adapter: load config, register hooks/events/commands
  rules.ts        # Rule<TMeta> factories and feature-specific metadata
  targets.ts      # Tool input -> Action targets, if needed
  prompt.ts       # UI prompt, if needed
  grants.ts       # Persisted/session grants, if needed
```

Do not add feature-specific metadata to `src/shared`.

## Core rule pattern

Use core typed rules:

```ts
import type { Action, Rule } from "../../src/core";

export type ZonesMeta = {
  zoneId: string;
  path: string;
};

export function createZonesRule(): Rule<ZonesMeta> {
  return {
    key: "zones.access",
    check(action: Action) {
      if (action.kind !== "file") return { kind: "pass" };
      return {
        kind: "match",
        reason: "Zone policy blocks this access.",
        metadata: { zoneId: "workspace", path: action.path },
      };
    },
  };
}
```

Rules must return `{ kind: "pass" }` or `{ kind: "match", reason, metadata }`. Metadata and reason are required. Use `TMeta = null` only when there is truly no metadata.

## Adapter pattern

In `extensions/<feature>/index.ts`:

1. Read `configLoader.getConfig()` inside hooks, not once at startup.
2. Exit early when `!config.enabled` or feature flag is false.
3. Convert Pi events/tool inputs into core `Action`s.
4. Call `checkAction()` with feature rules.
5. Emit existing shared events if blocking/dangerous behavior matches current contracts.
6. Register loaded feature status through shared events when useful for settings UI.

## Config pattern

For a new feature such as issue #29 zones:

- Add current config types in `src/shared/config/types.ts`.
- Add defaults in `src/shared/config/defaults.ts`.
- Add `features.<feature>` using `GuardrailsFeatureId` if it is user-toggleable.
- Add a migration only if persisted config keys or old shapes need conversion.
- Do not add runtime branches for old config shapes.

Hypothetical zones config should stay feature-owned at runtime:

```json
{
  "features": { "zones": true },
  "zones": [
    {
      "id": "workspace",
      "path": "~/workspace",
      "bash": "safe-only",
      "files": "readOnly"
    }
  ],
  "zonesDefault": { "bash": "block", "files": "noAccess" }
}
```

For zones, keep CWD priority semantics in the zones feature, not in shared path helpers, unless it becomes generally reusable.

## Target extraction

Reuse existing helpers before adding new parsing:

- Bash/path candidates: `src/shared/paths`.
- Shell AST helpers: `src/core/shell`.
- Path normalization/access primitives: `src/core/paths`.
- Matching helpers: `src/shared/matching`.

If a feature must inspect bash paths, add a feature `targets.ts` that converts tool calls into file actions or feature-specific targets.

## Settings and commands

- Primary guardrails settings live under `extensions/guardrails/commands/settings`.
- Feature UI belongs with its feature unless it is a cross-feature settings command.
- Use `registerSettingsCommand` for settings screens only.
- Use direct `pi.registerCommand` plus `Wizard` for guided flows.
- Do not put example/preset workflows in settings tabs unless they are truly settings.

## Tests

Add focused tests next to the feature:

```text
extensions/<feature>/rules.test.ts
extensions/<feature>/targets.test.ts
extensions/<feature>/grants.test.ts  # if grants exist
```

Prefer pure rule/target tests over full extension harness tests. Use hook-level tests only when Pi event integration is the behavior under test.

## Documentation

When adding or changing defaults, permission patterns, or presets:

- Update `schema.json` with `pnpm gen:schema` if config types changed.
- Update `README.md` if commands, feature flags, or public behavior changes.
- Treat `src/shared/config/defaults.ts` and `extensions/guardrails/commands/settings/examples.ts` as the source of truth for defaults and presets.

Add a changeset for user-facing behavior before release.
