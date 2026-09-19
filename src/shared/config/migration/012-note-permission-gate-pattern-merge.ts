import type { GuardrailsConfig } from "../types";

export const version = "0.19.0";

/**
 * Permission Gate pattern arrays (patterns, allowedPatterns, autoDenyPatterns)
 * no longer replace their global counterparts when set in a project config:
 * they are unioned across scopes by `pattern`. This migration changes nothing;
 * it only prints a one-time notice to configs that define any of these arrays
 * and therefore observe the behavior change.
 */
function isVersionBelow(v: string | undefined, target: string): boolean {
  const parse = (s: string) =>
    s.split(".").map((part) => Number.parseInt(part, 10) || 0);
  if (!v) return true; // no stamp: treat as older, notify
  const [aMaj, aMin, aPat] = parse(v);
  const [bMaj, bMin, bPat] = parse(target);
  return aMaj !== bMaj
    ? aMaj < bMaj
    : aMin !== bMin
      ? aMin < bMin
      : aPat < bPat;
}

export function shouldRun(config: GuardrailsConfig): boolean {
  if (!isVersionBelow(config.version, version)) return false;
  const gate = config.permissionGate;
  if (!gate) return false;
  return Boolean(
    gate.patterns?.length ??
      gate.allowedPatterns?.length ??
      gate.autoDenyPatterns?.length,
  );
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  return config;
}

export const message =
  "Permission Gate patterns, allowedPatterns, and autoDenyPatterns are now " +
  "merged across global and project configs instead of the project config " +
  "replacing global entries.";
