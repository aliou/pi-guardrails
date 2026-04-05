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
 * Check if a child path is inside a parent directory.
 */
export function isPathInside(parentDir: string, childPath: string): boolean {
  const resolvedParent = resolve(expandHomePath(parentDir));
  const resolvedChild = resolve(expandHomePath(childPath));
  const rel = relative(resolvedParent, resolvedChild);

  return !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel);
}
