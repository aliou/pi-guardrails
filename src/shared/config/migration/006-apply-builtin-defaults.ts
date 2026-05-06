import { addPendingWarning } from "../../warnings";
import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  return config.applyBuiltinDefaults === undefined;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  migrated.applyBuiltinDefaults = true;
  migrated.version = CURRENT_VERSION;

  addPendingWarning(
    "Guardrails config was migrated. `applyBuiltinDefaults` was set to `true` to preserve current behavior.",
  );

  return migrated;
}
