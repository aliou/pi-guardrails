import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  return (
    config.onboarding?.completed === undefined &&
    config.applyBuiltinDefaults !== undefined
  );
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  migrated.onboarding = {
    ...(migrated.onboarding ?? {}),
    completed: true,
    completedAt: migrated.onboarding?.completedAt ?? new Date().toISOString(),
    version: migrated.onboarding?.version ?? CURRENT_VERSION,
  };
  migrated.version = CURRENT_VERSION;
  return migrated;
}
