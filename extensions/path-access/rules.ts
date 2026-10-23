import type { Action, Rule } from "../../src/core";
import {
  checkPathAccess,
  isProcessDevicePath,
  normalizeForDisplay,
  type PathAccessState,
} from "../../src/core/paths";

export type PathAccessMeta = {
  absolutePath: string;
  displayPath: string;
};

export function createPathAccessRule(
  state: PathAccessState,
): Rule<PathAccessMeta> {
  return {
    key: "path-access.outside-workspace",
    check(action: Action) {
      if (action.kind !== "file") return { kind: "pass" };
      // Process plumbing (/dev/stdin, /dev/tty, /dev/fd/N, ...) is skipped
      // only for bash-origin targets: a bash child's fds and terminal are
      // its own, set up by the harness. The same paths reached through
      // in-process tools (read/write/edit/grep/find/ls) are pi's own fds
      // and the TUI — a write can truncate a file pi holds open or inject
      // into the terminal — so those still go through the normal check.
      if (action.origin === "bash" && isProcessDevicePath(action.path)) {
        return { kind: "pass" };
      }
      const displayPath = normalizeForDisplay(action.path, state.cwd);
      const decision = checkPathAccess(action.path, displayPath, state);
      if (decision.kind === "allow") return { kind: "pass" };

      return {
        kind: "match",
        reason:
          decision.kind === "deny"
            ? decision.reason
            : `Access to ${displayPath} requires confirmation.`,
        metadata: {
          absolutePath: action.path,
          displayPath,
        },
      };
    },
  };
}
