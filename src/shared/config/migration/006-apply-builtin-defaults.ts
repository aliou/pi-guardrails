import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  return config.applyBuiltinDefaults === undefined;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  migrated.applyBuiltinDefaults = true;
  migrated.version = CURRENT_VERSION;

  return migrated;
}
