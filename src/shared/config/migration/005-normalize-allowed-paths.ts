import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

export function shouldRun(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  const pathAccess = raw.pathAccess as Record<string, unknown> | undefined;
  if (!Array.isArray(pathAccess?.allowedPaths)) return false;
  return pathAccess.allowedPaths.some(
    (item) =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).pattern === "string",
  );
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config) as Record<string, unknown>;
  const pathAccess = migrated.pathAccess as Record<string, unknown> | undefined;
  if (!pathAccess) return migrated as GuardrailsConfig;

  pathAccess.allowedPaths = normalizeAllowedPaths(pathAccess.allowedPaths);
  migrated.version = CURRENT_VERSION;
  return migrated as GuardrailsConfig;
}

function normalizeAllowedPaths(items: unknown): string[] {
  if (!Array.isArray(items)) return [];

  const paths = new Set<string>();
  for (const item of items) {
    let path: string | null = null;
    if (typeof item === "string") {
      path = item;
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const pattern = obj.pattern;
      const objectPath = obj.path;
      if (typeof pattern === "string") path = pattern;
      else if (typeof objectPath === "string") path = objectPath;
    }

    const normalized = path?.trim();
    if (normalized) paths.add(normalized);
  }

  return [...paths];
}
