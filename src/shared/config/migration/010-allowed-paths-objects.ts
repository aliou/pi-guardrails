import type { GuardrailsConfig } from "../types";
import { CURRENT_VERSION } from "./version";

/**
 * Migrate `pathAccess.allowedPaths` from the legacy flat `string[]` (where the
 * kind was inferred from a trailing `/`) to the explicit `{ kind, path }`
 * object form.
 *
 * - Strings ending in `/` become `{ kind: "directory", path }` (slash stripped).
 * - Other strings become `{ kind: "file", path }`.
 * - Entries already in object form are normalized (kind validated, trailing
 *   slash stripped from directory paths).
 *
 * Runtime code only handles the object form; this migration is the exclusive
 * owner of the legacy string shape.
 */
export function shouldRun(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  const pathAccess = raw.pathAccess as Record<string, unknown> | undefined;
  if (!Array.isArray(pathAccess?.allowedPaths)) return false;
  return pathAccess.allowedPaths.some((item) => typeof item === "string");
}

export function run(config: GuardrailsConfig): GuardrailsConfig {
  const migrated = structuredClone(config) as Record<string, unknown>;
  const pathAccess = migrated.pathAccess as Record<string, unknown> | undefined;
  if (pathAccess && Array.isArray(pathAccess.allowedPaths)) {
    pathAccess.allowedPaths = (pathAccess.allowedPaths as unknown[])
      .map((item) => toAllowedPath(item))
      .filter(
        (item): item is { kind: "file" | "directory"; path: string } =>
          item !== null,
      );
  }
  migrated.version = CURRENT_VERSION;
  return migrated as GuardrailsConfig;
}

function toAllowedPath(
  item: unknown,
): { kind: "file" | "directory"; path: string } | null {
  if (typeof item === "string") {
    const trimmed = item.trim();
    if (!trimmed) return null;
    if (trimmed.endsWith("/")) {
      return { kind: "directory", path: trimmed.slice(0, -1) };
    }
    return { kind: "file", path: trimmed };
  }

  if (item && typeof item === "object") {
    const obj = item as { kind?: unknown; path?: unknown };
    const path = typeof obj.path === "string" ? obj.path.trim() : "";
    if (!path) return null;
    if (obj.kind === "file" || obj.kind === "directory") {
      const cleanPath =
        obj.kind === "directory" && path.endsWith("/")
          ? path.slice(0, -1)
          : path;
      return { kind: obj.kind, path: cleanPath };
    }
  }

  return null;
}
