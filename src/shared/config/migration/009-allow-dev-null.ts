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
 * The mode gate is deliberately absent: this writes a safe default, which
 * block-mode users need just as much as ask-mode users (in block mode there
 * is no prompt, so a missing /dev/null entry means every 2>/dev/null fails).
 * The loader also seeds the default at merge time (issue #89), so this
 * migration only matters for configs saved before that fix shipped.
 */
export function shouldRun(config: GuardrailsConfig): boolean {
  return (
    config.onboarding?.completed === true &&
    config.features?.pathAccess === true &&
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
