import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";

/**
 * Expand a leading tilde to the current user's home directory.
 * Preserves all other paths unchanged.
 */
export function expandHomePath(input: string): string {
  if (input === "~") {
    return homedir();
  }

  if (input.startsWith("~/")) {
    return join(homedir(), input.slice(2));
  }

  return input;
}

/**
 * Resolve a path relative to cwd, expanding ~ first.
 */
export function resolveFromCwd(input: string, cwd: string): string {
  return resolve(cwd, expandHomePath(input));
}

/**
 * Check if targetPath is inside rootPath (lexical check only, no realpath).
 * Returns true if targetPath equals rootPath or is a descendant.
 */
export function isWithinLexicalBoundary(
  targetPath: string,
  rootPath: string,
): boolean {
  const absTarget = resolve(targetPath);
  const absRoot = resolve(rootPath);
  const rel = relative(absRoot, absTarget);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Extract the directory portion for a grant.
 * If the path looks like a file (has a dot that indicates an extension),
 * return its parent dir. Otherwise return the path as-is (assume directory).
 *
 * Handles dotfiles like .env correctly by treating them as files.
 * A segment is considered a file if it contains a dot after the first
 * character (e.g. "file.ts", ".env.local") or is a dotfile with no
 * further dots (e.g. ".env", ".gitignore").
 */
export function extractGrantDirectory(absPath: string): string {
  const normalized = absPath.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop() ?? "";
  // Dotfile with no further dots (e.g. ".env") → file
  if (lastSegment.startsWith(".") && !lastSegment.slice(1).includes(".")) {
    return resolve(absPath, "..");
  }
  // Has a dot anywhere → likely a file with extension (e.g. "file.ts", ".env.local")
  if (lastSegment.includes(".")) {
    return resolve(absPath, "..");
  }
  // No dot → assume directory
  return absPath;
}
