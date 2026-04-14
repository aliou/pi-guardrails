import { stat } from "node:fs/promises";
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
 * If the path exists on disk and is a directory, return it as-is.
 * If it exists and is a file, return its parent dir.
 * If it doesn't exist, fall back to a heuristic: paths with an extension
 * dot (that is not a leading dot) are treated as files; everything else
 * is assumed to be a directory.
 */
export async function extractGrantDirectory(absPath: string): Promise<string> {
  // Check the filesystem first — the ground truth
  try {
    const s = await stat(absPath);
    return s.isDirectory() ? absPath : resolve(absPath, "..");
  } catch {
    // Path doesn't exist — fall back to heuristic
  }

  const normalized = absPath.replace(/\\/g, "/");
  const lastSegment = normalized.split("/").pop() ?? "";

  // Has an extension dot that is not the leading dot: "file.ts", ".env.local"
  // but NOT ".git", ".ssh", ".vscode" (single dot-prefix, no further dots)
  const afterLeadingDot = lastSegment.startsWith(".")
    ? lastSegment.slice(1)
    : lastSegment;
  if (afterLeadingDot.includes(".")) {
    return resolve(absPath, "..");
  }

  // No extension dot (or single dot-prefix with no further dots): assume directory
  return absPath;
}
