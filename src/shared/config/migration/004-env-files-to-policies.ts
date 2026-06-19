import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  if (raw.envFiles !== undefined) return true;

  const features = raw.features as Record<string, unknown> | undefined;
  return features?.protectEnvFiles !== undefined;
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);
  const raw = migrated as Record<string, unknown>;
  const features = raw.features as Record<string, unknown> | undefined;
  const envFiles = raw.envFiles as Record<string, unknown> | undefined;
  if (features?.protectEnvFiles !== undefined) {
    features.policies = features.protectEnvFiles;
    delete features.protectEnvFiles;
  }

  if (envFiles) {
    const rule: Record<string, unknown> = {
      id: "secret-files",
      description: "Files containing secrets (migrated from envFiles)",
      protection: "noAccess",
    };

    if (envFiles.protectedPatterns) rule.patterns = envFiles.protectedPatterns;
    if (envFiles.allowedPatterns)
      rule.allowedPatterns = envFiles.allowedPatterns;
    if (envFiles.onlyBlockIfExists !== undefined) {
      rule.onlyIfExists = envFiles.onlyBlockIfExists;
    }
    if (typeof envFiles.blockMessage === "string") {
      rule.blockMessage = envFiles.blockMessage;
    }

    if (Array.isArray(envFiles.protectedDirectories)) {
      const dirs = envFiles.protectedDirectories as Array<
        Record<string, unknown>
      >;
      const patterns = Array.isArray(rule.patterns)
        ? ([...rule.patterns] as Array<Record<string, unknown>>)
        : [];

      for (const dir of dirs) {
        const dirPattern = dir.pattern;
        if (typeof dirPattern !== "string" || dirPattern.trim() === "") {
          continue;
        }

        const normalized = dirPattern.endsWith("/**")
          ? dirPattern
          : `${dirPattern}/**`;
        patterns.push({ pattern: normalized, regex: dir.regex });
      }

      if (patterns.length > 0) rule.patterns = patterns;
    }

    if (Array.isArray(envFiles.protectedTools)) {
      // protectedTools has no policies equivalent; the migrated secret-files
      // rule uses protection=noAccess. The deprecation note is surfaced via
      // the `message` factory exported below.
    }

    if (!Array.isArray(rule.patterns) || rule.patterns.length === 0) {
      rule.patterns = [
        { pattern: ".env" },
        { pattern: ".env.local" },
        { pattern: ".env.production" },
        { pattern: ".env.prod" },
        { pattern: ".dev.vars" },
      ];
    }

    raw.policies = { rules: [rule] };
    delete raw.envFiles;
  }

  raw.version = CURRENT_VERSION;
  return migrated as GuardrailsConfig;
}

/**
 * Message for the envFiles-to-policies migration. Only surface the
 * protectedTools deprecation note when the pre-migration config actually had
 * protectedTools set; return undefined otherwise so no message is queued.
 */
export function message(before: GuardrailsConfig): string | undefined {
  const envFiles = (before as Record<string, unknown>).envFiles as
    | Record<string, unknown>
    | undefined;
  if (!Array.isArray(envFiles?.protectedTools)) return undefined;
  return (
    "envFiles.protectedTools is deprecated and has no direct policies equivalent. " +
    "The migrated secret-files rule uses protection=noAccess."
  );
}
