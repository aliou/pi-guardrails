import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

const REMOVED_PERMISSION_GATE_KEYS = [
  "explainCommands",
  "explainModel",
  "explainTimeout",
] as const;

export function shouldRun(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  const permissionGate = raw.permissionGate as
    | Record<string, unknown>
    | undefined;
  if (!permissionGate) return false;

  for (const key of REMOVED_PERMISSION_GATE_KEYS) {
    if (key in permissionGate) return true;
  }

  return false;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const cleaned = structuredClone(config) as Record<string, unknown>;
  const permissionGate = cleaned.permissionGate as
    | Record<string, unknown>
    | undefined;
  if (permissionGate) {
    for (const key of REMOVED_PERMISSION_GATE_KEYS) {
      delete permissionGate[key];
    }
  }
  cleaned.version = CURRENT_VERSION;
  return cleaned as GuardrailsConfig;
}
