import { homedir } from "node:os";
import {
  type AllowedPath,
  resolveFromCwd,
  toStorageGrant,
} from "../../src/core/paths";
import { configLoader } from "../../src/shared/config";

export type PendingPathGrant = {
  kind: "file" | "directory";
  storageGrant: AllowedPath;
  scope: "memory" | "local";
  absolutePath: string;
};

export function resolveAllowedPaths(
  allowedPaths: AllowedPath[],
  cwd: string,
): AllowedPath[] {
  return allowedPaths.map((entry) => ({
    kind: entry.kind,
    path: resolveFromCwd(entry.path, cwd),
  }));
}

export function pendingAllowedPaths(grants: PendingPathGrant[]): AllowedPath[] {
  return grants.map((grant) => ({
    kind: grant.kind,
    path: grant.absolutePath,
  }));
}

export function isGrantTooBroad(absPath: string): boolean {
  const normalized = absPath.replace(/[\\/]+$/, "");
  return normalized === "/" || normalized === homedir();
}

export function createPendingGrant(
  absolutePath: string,
  isDirectory: boolean,
  scope: "memory" | "local",
): PendingPathGrant {
  return {
    kind: isDirectory ? "directory" : "file",
    absolutePath,
    scope,
    storageGrant: toStorageGrant(absolutePath, isDirectory),
  };
}

export async function persistGrant(grant: PendingPathGrant): Promise<void> {
  const raw = (configLoader.getRawConfig(grant.scope) ?? {}) as Record<
    string,
    unknown
  >;
  const pathAccess = (raw.pathAccess ?? {}) as Record<string, unknown>;
  const existing = Array.isArray(pathAccess.allowedPaths)
    ? pathAccess.allowedPaths.filter(
        (entry): entry is AllowedPath =>
          typeof entry === "object" &&
          entry !== null &&
          (entry.kind === "file" || entry.kind === "directory") &&
          typeof (entry as { path?: unknown }).path === "string",
      )
    : [];

  const alreadyPresent = existing.some(
    (entry) =>
      entry.kind === grant.storageGrant.kind &&
      entry.path === grant.storageGrant.path,
  );
  if (alreadyPresent) return;

  await configLoader.save(grant.scope, {
    ...raw,
    pathAccess: {
      ...pathAccess,
      allowedPaths: [...existing, grant.storageGrant],
    },
  });
}
