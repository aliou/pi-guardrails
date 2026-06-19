import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

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

export function shouldRun(config: GuardrailsConfig): boolean {
  return (
    config.onboarding?.completed === true &&
    config.features?.pathAccess === true &&
    config.pathAccess?.mode === "ask" &&
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
  migrated.version = CURRENT_VERSION;

  return migrated;
}
