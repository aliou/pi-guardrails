import type { Action, Rule } from "../../src/core";
import {
  checkPathAccess,
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
