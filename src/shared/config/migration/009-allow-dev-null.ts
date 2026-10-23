import type { GuardrailsConfig } from "../types";

export const version = "0.14.0";

const DEV_NULL = "/dev/null";

/**
 * Does an allowedPaths entry (legacy string or { kind, path } object) refer
 * to /dev/null? Format-agnostic so this migration does not re-run on configs
 * already migrated to the object form.
 */
function includesDevNull(allowedPaths: unknown[] | undefined): boolean {
  return (allowedPaths ?? []).some((entry) => {
    if (typeof entry === "string") return entry === DEV_NULL;
    if (entry && typeof entry === "object") {
      const obj = entry as { path?: unknown };
      return obj.path === DEV_NULL;
    }
    return false;
  });
}

/**
 * Adds the built-in /dev/null allowance to user configs that predate it.
 *
 * This migration is predicate-gated (composeMigrations re-evaluates it on
 * every load of every on-disk config), so its predicate must be as strict
 * as the write it performs:
 *
 * - No mode gate: block-mode users need the safe default just as much as
 *   ask-mode users (in block mode there is no prompt, so a missing
 *   /dev/null entry means every 2>/dev/null fails).
 * - `applyBuiltinDefaults: false` opts out of builtin defaults, and the
 *   loader seeding respects it, so the migration must not write the entry
 *   back into an opted-out file.
 * - Only configs that actually configure path access in a gating mode:
 *   a missing `pathAccess` key (or mode "allow") means the user never
 *   relied on the entry, and the loader seeding already covers them at
 *   runtime without touching their file.
 */
export function shouldRun(config: GuardrailsConfig): boolean {
  return (
    config.onboarding?.completed === true &&
    config.features?.pathAccess === true &&
    config.applyBuiltinDefaults !== false &&
    (config.pathAccess?.mode === "ask" ||
      config.pathAccess?.mode === "block") &&
    !includesDevNull(config.pathAccess?.allowedPaths)
  );
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  const pathAccess = migrated.pathAccess ?? {};
  const allowedPaths = pathAccess.allowedPaths ?? [];

  migrated.pathAccess = {
    ...pathAccess,
    allowedPaths: [...allowedPaths, { kind: "file", path: DEV_NULL }],
  };

  return migrated;
}
