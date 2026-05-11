import type { Action, Rule } from "../../src/core";
import { checkDangerousCommand } from "../../src/core/commands";
import type { DangerousPattern, PatternConfig } from "../../src/shared/config";
import { compileCommandPatterns } from "../../src/shared/matching";

export type PermissionGateMeta = {
  command: string;
  description: string;
  pattern: string;
};

export type PermissionGateRuleOptions = {
  patterns: DangerousPattern[];
  useBuiltinMatchers: boolean;
};

export function createPermissionGateRule({
  patterns,
  useBuiltinMatchers,
}: PermissionGateRuleOptions): Rule<PermissionGateMeta> {
  const compiledPatterns = compileCommandPatterns(patterns);

  return {
    key: "permission-gate.dangerous-command",
    check(action: Action) {
      if (action.kind !== "command") return { kind: "pass" };

      const match = checkDangerousCommand({
        command: action.command,
        patterns: compiledPatterns,
        useBuiltinMatchers,
        fallbackPatterns: patterns,
      });
      if (!match) return { kind: "pass" };

      return {
        kind: "match",
        reason: match.description,
        metadata: {
          command: action.command,
          description: match.description,
          pattern: match.pattern,
        },
      };
    },
  };
}

export function matchCommandPattern(
  command: string,
  patterns: PatternConfig[],
): PatternConfig | null {
  const compiled = compileCommandPatterns(patterns);
  for (let i = 0; i < compiled.length; i++) {
    if (compiled[i].test(command)) return patterns[i];
  }
  return null;
}

export function matchesAnyCommandPattern(
  command: string,
  patterns: PatternConfig[],
): boolean {
  return matchCommandPattern(command, patterns) !== null;
}

export function formatAutoDenyReason(pattern: PatternConfig): string {
  const description = pattern.description?.trim();
  return description
    ? `Command auto-denied: ${description}`
    : "Command matched auto-deny pattern and was blocked automatically.";
}
