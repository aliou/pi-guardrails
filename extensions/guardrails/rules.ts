import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Action, Rule } from "../../src/core";
import { expandHomePath } from "../../src/core/paths";
import type { PolicyRule, Protection } from "../../src/shared/config";
import {
  type CompiledPattern,
  compileFilePatterns,
  normalizeFilePath,
} from "../../src/shared/matching";

export type PolicyMeta = {
  ruleId: string;
  protection: Protection;
  path: string;
};

export type CompiledPolicy = {
  id: string;
  protection: Protection;
  patterns: CompiledPattern[];
  allowedPatterns: CompiledPattern[];
  onlyIfExists: boolean;
  blockMessage: string;
};

const DEFAULT_BLOCK_MESSAGES: Record<Protection, string> = {
  noAccess:
    "Accessing {file} is not allowed. This file is protected. Ask the user if changes are needed.",
  readOnly:
    "Writing to {file} is not allowed. This file is read-only. Use the read tool to inspect it instead.",
  none: "",
};

export const BLOCKED_TOOLS: Record<Protection, Set<string>> = {
  noAccess: new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]),
  readOnly: new Set(["write", "edit", "bash"]),
  none: new Set(),
};

export function compilePolicies(rules: PolicyRule[]): CompiledPolicy[] {
  return rules
    .filter((rule) => rule.enabled ?? true)
    .filter((rule) => rule.id.trim() && rule.patterns.length > 0)
    .map((rule) => ({
      id: rule.id,
      protection: rule.protection,
      patterns: compileFilePatterns(rule.patterns),
      allowedPatterns: compileFilePatterns(rule.allowedPatterns ?? []),
      onlyIfExists: rule.onlyIfExists ?? true,
      blockMessage:
        rule.blockMessage ?? DEFAULT_BLOCK_MESSAGES[rule.protection],
    }));
}

export function protectionRank(protection: Protection): number {
  if (protection === "noAccess") return 2;
  if (protection === "readOnly") return 1;
  return 0;
}

export function normalizeTarget(filePath: string, cwd: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) {
    return normalizeFilePath(filePath);
  }

  const expanded = expandHomePath(filePath);
  const absolute = resolve(cwd, expanded);
  const rel = relative(cwd, absolute);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return normalizeFilePath(rel || ".");
  }

  const normalizedHome = normalizeFilePath(expandHomePath("~"));
  const normalizedAbsolute = normalizeFilePath(absolute);

  if (normalizedAbsolute.startsWith(`${normalizedHome}/`)) {
    return normalizeFilePath(`~/${relative(expandHomePath("~"), absolute)}`);
  }

  return normalizeFilePath(absolute);
}

async function fileExists(filePath: string, cwd: string): Promise<boolean> {
  try {
    await stat(resolve(cwd, expandHomePath(filePath)));
    return true;
  } catch {
    return false;
  }
}

export function createPolicyRules(
  policies: CompiledPolicy[],
  cwd: string,
): Rule<PolicyMeta>[] {
  return policies.map((policy) => ({
    key: `policies.${policy.id}`,
    async check(action: Action) {
      if (action.kind !== "file") return { kind: "pass" };
      const path = normalizeTarget(action.path, cwd);
      if (!policy.patterns.some((pattern) => pattern.test(path))) {
        return { kind: "pass" };
      }
      if (policy.allowedPatterns.some((pattern) => pattern.test(path))) {
        return { kind: "pass" };
      }
      if (policy.onlyIfExists && !(await fileExists(path, cwd))) {
        return { kind: "pass" };
      }
      if (policy.protection === "none") return { kind: "pass" };
      return {
        kind: "match",
        reason: policy.blockMessage.replace("{file}", path),
        metadata: { ruleId: policy.id, protection: policy.protection, path },
      };
    },
  }));
}
