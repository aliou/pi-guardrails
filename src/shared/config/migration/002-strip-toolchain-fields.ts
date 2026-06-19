import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

const REMOVED_FEATURE_KEYS = [
  "preventBrew",
  "preventPython",
  "enforcePackageManager",
] as const;

export function shouldRun(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  const features = raw.features as Record<string, unknown> | undefined;
  if (features) {
    for (const key of REMOVED_FEATURE_KEYS) {
      if (key in features) return true;
    }
  }
  return "packageManager" in raw;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const cleaned = structuredClone(config) as Record<string, unknown>;
  const features = cleaned.features as Record<string, unknown> | undefined;
  if (features) {
    for (const key of REMOVED_FEATURE_KEYS) {
      delete features[key];
    }
  }
  delete cleaned.packageManager;
  cleaned.version = CURRENT_VERSION;
  return cleaned as GuardrailsConfig;
}
