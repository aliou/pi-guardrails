import type { GuardrailsConfig } from "../types";

export const version = "0.12.0";

export function shouldRun(config: GuardrailsConfig): boolean {
  return config.applyBuiltinDefaults === undefined;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  migrated.applyBuiltinDefaults = true;
  return migrated;
}
