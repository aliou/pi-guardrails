import { homedir } from "node:os";
import { resolveFromCwd, toStorageForm } from "../../src/core/paths";
import { configLoader } from "../../src/shared/config";

export type PendingPathGrant = {
  storagePath: string;
  scope: "memory" | "local";
  absolutePath: string;
};

export function resolveAllowedPaths(
  allowedPaths: string[],
  cwd: string,
): string[] {
  return allowedPaths.map((path) => {
    const isDir = path.endsWith("/");
    const resolved = resolveFromCwd(isDir ? path.slice(0, -1) : path, cwd);
    return isDir ? `${resolved}/` : resolved;
  });
}

export function pendingAllowedPaths(grants: PendingPathGrant[]): string[] {
  return grants.map((grant) =>
    grant.storagePath.endsWith("/")
      ? `${grant.absolutePath}/`
      : grant.absolutePath,
  );
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
    absolutePath,
    scope,
    storagePath: toStorageForm(absolutePath, isDirectory),
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
        (path): path is string => typeof path === "string",
      )
    : [];

  if (existing.includes(grant.storagePath)) return;

  await configLoader.save(grant.scope, {
    ...raw,
    pathAccess: {
      ...pathAccess,
      allowedPaths: [...existing, grant.storagePath],
    },
  });
}
