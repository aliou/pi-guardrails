import { copyFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type {
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
} from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  return config.version === undefined;
}

export async function run(
  config: GuardrailsConfig,
  filePath: string,
): Promise<GuardrailsConfig> {
  await backupConfig(filePath);
  return migrateV0(config);
}

function migrateV0(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config);

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

function migrateStringArray(
  items: (string | PatternConfig)[],
): PatternConfig[] {
  return items.map((item) => {
    if (typeof item === "string") return { pattern: item, regex: true };
    if (item.regex === undefined) return { ...item, regex: true };
    return item;
  });
}

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

async function backupConfig(configPath: string): Promise<void> {
  const dir = dirname(configPath);
  const basename = configPath.split("/").pop() ?? "guardrails.json";
  const backupName = basename.replace(".json", ".v0.json");
  const backupPath = resolve(dir, backupName);

  try {
    await stat(backupPath);
  } catch {
    try {
      await copyFile(configPath, backupPath);
    } catch (err) {
      console.error(`[guardrails] could not back up config: ${err}`);
    }
  }
}
