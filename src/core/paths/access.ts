import { type AllowedPath, isWithinBoundary } from "./path";

export type PathDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; absolutePath: string; displayPath: string };

export interface PathAccessState {
  cwd: string;
  mode: "allow" | "ask" | "block";
  allowedPaths: AllowedPath[]; // already resolved to absolute
  hasUI: boolean;
}

/**
 * Check if an absolute path is covered by the allowedPaths list.
 *
 * `directory` grants match the directory itself and any descendant (boundary
 * match). `file` grants match the exact path only.
 */
export function isPathAllowed(
  absPath: string,
  allowedPaths: AllowedPath[],
): boolean {
  for (const entry of allowedPaths) {
    if (entry.kind === "directory") {
      if (isWithinBoundary(absPath, entry.path)) return true;
    } else {
      if (absPath === entry.path) return true;
    }
  }
  return false;
}

export function checkPathAccess(
  absolutePath: string,
  displayPath: string,
  state: PathAccessState,
): PathDecision {
  if (state.mode === "allow") return { kind: "allow" };

  if (isWithinBoundary(absolutePath, state.cwd)) return { kind: "allow" };

  if (isPathAllowed(absolutePath, state.allowedPaths)) return { kind: "allow" };

  if (state.mode === "block") {
    return {
      kind: "deny",
      reason: `Access to ${displayPath} is blocked (outside working directory).`,
    };
  }

  // mode === "ask"
  if (!state.hasUI) {
    return {
      kind: "deny",
      reason: `Access to ${displayPath} is blocked (outside working directory, no UI to confirm).`,
    };
  }

  return { kind: "ask", absolutePath, displayPath };
}
