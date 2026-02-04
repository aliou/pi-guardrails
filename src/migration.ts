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
} from "./config-schema";

export const CURRENT_VERSION = "0.6.0-20260204";

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
      console.warn(`guardrails: could not back up config: ${err}`);
    }
  }
}
