import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  const features = config.features as Record<string, unknown> | undefined;
  if (features) {
    for (const value of Object.values(features)) {
      if (value === "enabled" || value === "disabled") return true;
    }
  }

  const requiresConfirmation = config.permissionGate
    ?.requireConfirmation as unknown;
  if (requiresConfirmation === "on" || requiresConfirmation === "off") {
    return true;
  }

  return false;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config) as Record<string, unknown>;
  let changed = false;

  const features = migrated.features as Record<string, unknown> | undefined;
  if (features) {
    for (const [key, value] of Object.entries(features)) {
      if (value === "enabled" || value === "disabled") {
        features[key] = value === "enabled";
        changed = true;
      }
    }
  }

  const permissionGate = migrated.permissionGate as
    | Record<string, unknown>
    | undefined;
  if (
    permissionGate &&
    (permissionGate.requireConfirmation === "on" ||
      permissionGate.requireConfirmation === "off")
  ) {
    permissionGate.requireConfirmation =
      permissionGate.requireConfirmation === "on";
    changed = true;
  }

  if (changed) {
    migrated.version = CURRENT_VERSION;
  }

  return migrated as GuardrailsConfig;
}
