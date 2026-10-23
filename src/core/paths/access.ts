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
 * Device files that are process plumbing, not filesystem state. Redirecting
 * or reading these never touches user data, so prompting for them protects
 * nothing and only trains users to click through (issue #90).
 *
 * This is the single source of truth for the built-in device allowance; it
 * applies regardless of `allowedPaths` and `applyBuiltinDefaults`. `/dev/null`
 * is deliberately NOT here: it is a config default (`DEFAULT_CONFIG`
 * `pathAccess.allowedPaths`) so users can inspect and opt out of it via
 * `applyBuiltinDefaults: false` (issue #89).
 */
const PROCESS_DEVICE_PATHS = new Set([
  "/dev/stdin",
  "/dev/stdout",
  "/dev/stderr",
  "/dev/tty",
]);

/** `/dev/fd/N` — reopening a file descriptor by number, e.g. `cat /dev/fd/3`. */
const DEV_FD_PATTERN = /^\/dev\/fd\/\d+$/;

/**
 * Whether an absolute path is built-in process plumbing (see
 * `PROCESS_DEVICE_PATHS`): always allowed by `checkPathAccess`.
 */
export function isProcessDevicePath(absPath: string): boolean {
  return PROCESS_DEVICE_PATHS.has(absPath) || DEV_FD_PATTERN.test(absPath);
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

  // Process plumbing (/dev/stdin, /dev/tty, /dev/fd/N, ...) never names
  // user data: allow it before consulting mode or allowedPaths.
  if (isProcessDevicePath(absolutePath)) return { kind: "allow" };

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
