import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * Expand a leading tilde to the current user's home directory.
 * Preserves all other paths unchanged.
 */
export function expandHomePath(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/") || input.startsWith("~\\")) {
    return join(homedir(), input.slice(2));
  }

  return input;
}

/**
 * Resolve a basePath value to an absolute path.
 * Supports:
 *   - "." or "./" for current working directory
 *   - "../" for parent directories relative to cwd
 *   - "~" or "~/" for home directory
 *   - Absolute paths (returned as-is)
 *
 * Returns null if the path cannot be resolved.
 */
export function resolveBasePath(basePath: string, cwd: string): string | null {
  // Expand home directory first
  const expanded = expandHomePath(basePath);

  // If it's already absolute after home expansion, return it
  if (isAbsolute(expanded)) {
    return resolve(expanded);
  }

  // Otherwise, resolve relative to cwd
  return resolve(cwd, expanded);
}

/**
 * Check if a child path is inside a parent directory.
 */
export function isPathInside(parentDir: string, childPath: string): boolean {
  const resolvedParent = resolve(expandHomePath(parentDir));
  const resolvedChild = resolve(expandHomePath(childPath));
  const rel = relative(resolvedParent, resolvedChild);

  return !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}

/**
 * Check if a child path is inside any of the parent directories.
 * Returns true if the path is inside at least one parent directory.
 */
export function isPathInsideAny(
  basePaths: string[],
  cwd: string,
  childPath: string,
): boolean {
  for (const basePath of basePaths) {
    const resolvedBase = resolveBasePath(basePath, cwd);
    if (resolvedBase && isPathInside(resolvedBase, childPath)) {
      return true;
    }
  }

  return false;
}
