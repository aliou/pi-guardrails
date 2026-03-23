/**
 * Config migration from v0 (no version field) to current format.
 *
 * v0 configs store patterns as plain strings (regex). The migration
 * converts them to PatternConfig objects with `regex: true` to preserve
 * existing behavior.
 */

import { copyFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
} from "../config";
import { pendingWarnings } from "./warnings";

/**
 * Config schema version.
 *
 * Keep this independent from package.json version.
 * Bump only when config schema/default migration markers change.
 */
export const CURRENT_VERSION = "0.9.0-20260323";

/**
 * Check if a config needs migration (no version field = v0).
 */
export function needsMigration(config: GuardrailsConfig): boolean {
  return config.version === undefined;
}

/**
 * Migrate a v0 config to the current format.
 * All string patterns become `{ pattern, regex: true }` to preserve behavior.
 */
export function migrateV0(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);

  // Migrate envFiles patterns
  if (migrated.envFiles) {
    if (migrated.envFiles.protectedPatterns) {
      migrated.envFiles.protectedPatterns = migrateStringArray(
        migrated.envFiles.protectedPatterns,
      );
    }
    if (migrated.envFiles.allowedPatterns) {
      migrated.envFiles.allowedPatterns = migrateStringArray(
        migrated.envFiles.allowedPatterns,
      );
    }
    if (migrated.envFiles.protectedDirectories) {
      migrated.envFiles.protectedDirectories = migrateStringArray(
        migrated.envFiles.protectedDirectories,
      );
    }
  }

  // Migrate permissionGate patterns
  if (migrated.permissionGate) {
    if (migrated.permissionGate.patterns) {
      migrated.permissionGate.patterns = migrateDangerousPatterns(
        migrated.permissionGate.patterns,
      );
    }
    if (migrated.permissionGate.customPatterns) {
      migrated.permissionGate.customPatterns = migrateDangerousPatterns(
        migrated.permissionGate.customPatterns,
      );
    }
    if (migrated.permissionGate.allowedPatterns) {
      migrated.permissionGate.allowedPatterns = migrateStringArray(
        migrated.permissionGate.allowedPatterns,
      );
    }
    if (migrated.permissionGate.autoDenyPatterns) {
      migrated.permissionGate.autoDenyPatterns = migrateStringArray(
        migrated.permissionGate.autoDenyPatterns,
      );
    }
  }

  migrated.version = CURRENT_VERSION;
  return migrated;
}

/**
 * Check if a config still uses deprecated envFiles/protectEnvFiles fields.
 */
export function needsEnvFilesToPoliciesMigration(
  config: GuardrailsConfig,
): boolean {
  const raw = config as Record<string, unknown>;
  if (raw.envFiles !== undefined) return true;

  const features = raw.features as Record<string, unknown> | undefined;
  return features?.protectEnvFiles !== undefined;
}

/**
 * Check if config needs applyBuiltinDefaults bridge migration.
 * This runs only for existing config files loaded by ConfigLoader.
 */
export function needsApplyBuiltinDefaultsMigration(
  config: GuardrailsConfig,
): boolean {
  return config.applyBuiltinDefaults === undefined;
}

/**
 * Bridge migration for defaults deprecation.
 * Existing config files get applyBuiltinDefaults=true to preserve behavior.
 */
export function migrateApplyBuiltinDefaults(
  config: GuardrailsConfig,
): GuardrailsConfig {
  const migrated = structuredClone(config);
  migrated.applyBuiltinDefaults = true;
  migrated.version = CURRENT_VERSION;

  pendingWarnings.push(
    "Guardrails config was migrated. `applyBuiltinDefaults` was set to `true` to preserve current behavior.\n" +
      "Built-in policy defaults will be deprecated in a future version. " +
      "Use /guardrails:settings -> Policies -> Apply defaults to store the current defaults in your global settings file (`~/.pi/agent/extensions/guardrails.json`).",
  );

  return migrated;
}

/**
 * Migrate deprecated envFiles/protectEnvFiles fields to policies.
 */
export function migrateEnvFilesToPolicies(
  config: GuardrailsConfig,
): GuardrailsConfig {
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

    if (envFiles.protectedPatterns) {
      rule.patterns = envFiles.protectedPatterns;
    }
    if (envFiles.allowedPatterns) {
      rule.allowedPatterns = envFiles.allowedPatterns;
    }
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

      if (patterns.length > 0) {
        rule.patterns = patterns;
      }
    }

    if (Array.isArray(envFiles.protectedTools)) {
      pendingWarnings.push(
        "[guardrails] envFiles.protectedTools is deprecated and has no direct policies equivalent. " +
          "The migrated secret-files rule uses protection=noAccess.",
      );
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
 * Migrate a string[] or PatternConfig[] to PatternConfig[] with regex: true.
 * Handles mixed arrays (some already migrated, some still strings).
 */
function migrateStringArray(
  items: (string | PatternConfig)[],
): PatternConfig[] {
  return items.map((item) => {
    if (typeof item === "string") {
      return { pattern: item, regex: true };
    }
    // Already a PatternConfig, ensure regex is set
    if (item.regex === undefined) {
      return { ...item, regex: true };
    }
    return item;
  });
}

/**
 * Migrate dangerous pattern arrays. Handles both legacy
 * `{ pattern: string, description: string }` and already-migrated formats.
 */
function migrateDangerousPatterns(
  items: (DangerousPattern | { pattern: string; description: string })[],
): DangerousPattern[] {
  return items.map((item) => {
    if ("regex" in item && item.regex !== undefined) {
      return item as DangerousPattern;
    }
    return { ...item, regex: true };
  });
}

/**
 * Back up a config file before migration.
 * Creates `<name>.v0.json` in the same directory.
 * Skips if backup already exists.
 */
export async function backupConfig(configPath: string): Promise<void> {
  const dir = dirname(configPath);
  const basename = configPath.split("/").pop() ?? "guardrails.json";
  const backupName = basename.replace(".json", ".v0.json");
  const backupPath = resolve(dir, backupName);

  try {
    await stat(backupPath);
    // Backup already exists, skip
  } catch {
    try {
      await copyFile(configPath, backupPath);
    } catch (err) {
      pendingWarnings.push(`guardrails: could not back up config: ${err}`);
    }
  }
}
