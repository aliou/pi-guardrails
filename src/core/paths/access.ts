import { isWithinBoundary } from "./path";

export type PathDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; absolutePath: string; displayPath: string };

export interface PathAccessState {
  cwd: string;
  mode: "allow" | "ask" | "block";
  allowedPaths: string[]; // already resolved to absolute, with trailing / convention
  hasUI: boolean;
}

/**
 * Check if an absolute path is covered by the allowedPaths list.
 * - Entries ending in "/" are directory grants (boundary/prefix match).
 * - Entries without trailing "/" are exact file grants.
 */
export function isPathAllowed(
  absPath: string,
  allowedPaths: string[],
): boolean {
  for (const entry of allowedPaths) {
    if (entry.endsWith("/")) {
      const dirPath = entry.slice(0, -1);
      if (isWithinBoundary(absPath, dirPath)) return true;
    } else {
      if (absPath === entry) return true;
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
