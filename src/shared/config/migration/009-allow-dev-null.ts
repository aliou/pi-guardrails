import { addPendingWarning } from "../../warnings";
import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

const DEV_NULL = "/dev/null";

export function shouldRun(config: GuardrailsConfig): boolean {
  return (
    config.onboarding?.completed === true &&
    config.features?.pathAccess === true &&
    config.pathAccess?.mode === "ask" &&
    !config.pathAccess.allowedPaths?.includes(DEV_NULL)
  );
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  const pathAccess = migrated.pathAccess ?? {};
  const allowedPaths = pathAccess.allowedPaths ?? [];

  migrated.pathAccess = {
    ...pathAccess,
    allowedPaths: [...allowedPaths, DEV_NULL],
  };
  migrated.version = CURRENT_VERSION;

  addPendingWarning(
    "[guardrails] pathAccess.allowedPaths was migrated to allow /dev/null by default.",
  );

  return migrated;
}
