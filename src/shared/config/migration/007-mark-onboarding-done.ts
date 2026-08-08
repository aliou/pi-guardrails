import pkg from "../../../../package.json" with { type: "json" };
import type { GuardrailsConfig } from "../types";

export const version = "0.12.0";

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
    version: migrated.onboarding?.version ?? pkg.version,
  };
  return migrated;
}
