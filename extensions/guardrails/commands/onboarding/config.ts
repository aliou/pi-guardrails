import {
  CURRENT_VERSION,
  type GuardrailsConfig,
} from "../../../../src/shared/config";
import { DEFAULT_CONFIG } from "../../../../src/shared/config/defaults";

export function buildOnboardedConfig(
  applyBuiltinDefaults: boolean,
  pathAccessEnabled?: boolean | null,
): GuardrailsConfig {
  const config: GuardrailsConfig = {
    version: CURRENT_VERSION,
    applyBuiltinDefaults,
    onboarding: {
      completed: true,
      completedAt: new Date().toISOString(),
      version: CURRENT_VERSION,
    },
  };
  if (pathAccessEnabled) {
    config.features = { ...config.features, pathAccess: true };
    config.pathAccess = {
      mode: "ask",
      allowedPaths: [...DEFAULT_CONFIG.pathAccess.allowedPaths],
    };
  }
  return config;
}

export function mergeOnboardingConfig(
  base: GuardrailsConfig | null,
  applyBuiltinDefaults: boolean,
  pathAccessEnabled?: boolean | null,
): GuardrailsConfig {
  const next = structuredClone(base ?? {});
  const onboarded = buildOnboardedConfig(
    applyBuiltinDefaults,
    pathAccessEnabled,
  );
  next.applyBuiltinDefaults = onboarded.applyBuiltinDefaults;
  next.version = onboarded.version;
  next.onboarding = onboarded.onboarding;
  if (onboarded.features?.pathAccess !== undefined) {
    next.features = {
      ...next.features,
      pathAccess: onboarded.features.pathAccess,
    };
  }
  if (onboarded.pathAccess) {
    next.pathAccess = onboarded.pathAccess;
  }
  return next;
}

export function isOnboardingPending(config: GuardrailsConfig | null): boolean {
  if (!config) return true;
  return config.onboarding?.completed !== true;
}
