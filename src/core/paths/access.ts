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
 * Device files that are process plumbing for a *bash child*: its stdin,
 * stdout, stderr, controlling terminal, and open file descriptors. A bash
 * command cannot use them to reach user data the harness did not already
 * gate, so path-access skips them (issue #90).
 *
 * CAUTION: this is only safe for bash-origin targets. The same paths in the
 * pi process itself — reached through in-process tools like `read`, `write`,
 * or `edit` — are pi's own file descriptors and terminal: a write to
 * `/dev/fd/N` can truncate a file pi holds open, and `/dev/stdout` or
 * `/dev/tty` can inject into the TUI. Callers must gate on the target's
 * origin (see `extensions/path-access/rules.ts`); `checkPathAccess`
 * deliberately does NOT consult this set.
 *
 * This is the single source of truth for the built-in device allowance. It
 * applies regardless of `allowedPaths` and `applyBuiltinDefaults`.
 * `/dev/null` is deliberately NOT here: it is a config default
 * (`DEFAULT_CONFIG` `pathAccess.allowedPaths`) so users can inspect and opt
 * out of it via `applyBuiltinDefaults: false` (issue #89).
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
 * Whether an absolute path is bash-child process plumbing (see
 * `PROCESS_DEVICE_PATHS`). Only meaningful for bash-origin targets.
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
