import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Expand a leading tilde to the current user's home directory.
 * Preserves all other paths unchanged.
 */
export function expandHomePath(input: string): string {
  if (input === "~") return homedir();
  if (input.startsWith("~/") || input.startsWith("~\\"))
    return join(homedir(), input.slice(2));
  return input;
}

export function resolveFromCwd(input: string, cwd: string): string {
  return resolve(cwd, expandHomePath(input));
}

/**
 * Lexical boundary check. Returns true if targetAbsPath equals rootAbsPath
 * or is a descendant. Both paths must already be resolved (absolute, no ..).
 * Does NOT resolve symlinks — this is a known limitation.
 */
export function isWithinBoundary(
  targetAbsPath: string,
  rootAbsPath: string,
): boolean {
  const rel = relative(rootAbsPath, targetAbsPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Format an absolute path for display:
 * - relative if inside cwd
 * - ~/... if under home
 * - absolute otherwise
 */
export function normalizeForDisplay(absPath: string, cwd: string): string {
  const home = homedir();
  const rel = relative(cwd, absPath);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel)))
    return rel || ".";
  if (
    absPath === home ||
    absPath.startsWith(`${home}/`) ||
    absPath.startsWith(`${home}\\`)
  ) {
    return `~${absPath.slice(home.length)}`;
  }
  return absPath;
}

/**
 * Convert an absolute path to storage form for config persistence.
 * Uses ~/ for home paths, absolute otherwise. Appends trailing / for directory grants.
 */
export function toStorageForm(absPath: string, isDirectory: boolean): string {
  const home = homedir();
  let stored: string;
  if (
    absPath === home ||
    absPath.startsWith(`${home}/`) ||
    absPath.startsWith(`${home}\\`)
  ) {
    stored = `~${absPath.slice(home.length)}`;
  } else {
    stored = absPath;
  }
  // Normalize separators to forward slash for storage
  stored = stored.replace(/\\/g, "/");
  if (isDirectory && !stored.endsWith("/")) stored += "/";
  if (!isDirectory && stored.endsWith("/")) stored = stored.slice(0, -1);
  return stored;
}
