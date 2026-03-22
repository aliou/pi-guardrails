import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { PolicyRule, Protection, ResolvedConfig } from "../config";
import { emitBlocked } from "../utils/events";
import { expandGlob, hasGlobChars } from "../utils/glob-expander";
import {
  type CompiledPattern,
  compileFilePatterns,
  normalizeFilePath,
} from "../utils/matching";
import { expandHomePath } from "../utils/path";
import { walkCommands, wordToString } from "../utils/shell-utils";
import { pendingWarnings } from "../utils/warnings";

const DEFAULT_BLOCK_MESSAGES: Record<Protection, string> = {
  noAccess:
    "Accessing {file} is not allowed. This file is protected. Ask the user if changes are needed.",
  readOnly:
    "Writing to {file} is not allowed. This file is read-only. Use the read tool to inspect it instead of bash commands like cat or ls.",
  none: "",
};

const BLOCKED_TOOLS: Record<Protection, Set<string>> = {
  noAccess: new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]),
  readOnly: new Set(["write", "edit", "bash"]),
  none: new Set(),
};

interface CompiledRule {
  id: string;
  protection: Protection;
  patterns: CompiledPattern[];
  allowedPatterns: CompiledPattern[];
  onlyIfExists: boolean;
  blockMessage: string;
  enabled: boolean;
}

async function fileExists(filePath: string, cwd: string): Promise<boolean> {
  try {
    await stat(resolvePolicyPath(filePath, cwd));
    return true;
  } catch {
    return false;
  }
}

function protectionRank(protection: Protection): number {
  switch (protection) {
    case "none":
      return 0;
    case "readOnly":
      return 1;
    case "noAccess":
      return 2;
  }
}

function compileRules(rules: PolicyRule[]): CompiledRule[] {
  const compiled: CompiledRule[] = [];

  for (const rule of rules) {
    const id = rule.id?.trim();
    if (!id) {
      pendingWarnings.push("[guardrails] skipping policy rule without id.");
      continue;
    }

    if (
      rule.protection !== "none" &&
      rule.protection !== "readOnly" &&
      rule.protection !== "noAccess"
    ) {
      pendingWarnings.push(
        `[guardrails] skipping policy rule "${id}": invalid protection.`,
      );
      continue;
    }

    const normalizedPatterns = (rule.patterns ?? []).filter(
      (pattern) => pattern.pattern.trim().length > 0,
    );
    if (normalizedPatterns.length === 0) {
      pendingWarnings.push(
        `[guardrails] skipping policy rule "${id}": missing non-empty patterns.`,
      );
      continue;
    }

    const normalizedAllowedPatterns = (rule.allowedPatterns ?? []).filter(
      (pattern) => pattern.pattern.trim().length > 0,
    );

    compiled.push({
      id,
      protection: rule.protection,
      patterns: compileFilePatterns(normalizedPatterns),
      allowedPatterns: compileFilePatterns(normalizedAllowedPatterns),
      onlyIfExists: rule.onlyIfExists ?? true,
      blockMessage:
        rule.blockMessage ?? DEFAULT_BLOCK_MESSAGES[rule.protection] ?? "",
      enabled: rule.enabled ?? true,
    });
  }

  return compiled;
}

function maybePathLike(token: string): boolean {
  return (
    token.includes("/") ||
    token.includes(".") ||
    token.startsWith("~") ||
    token.startsWith("./") ||
    token.startsWith("../")
  );
}

function normalizeTargetForPolicy(filePath: string, cwd: string): string {
  if (filePath === "~" || filePath.startsWith("~/")) {
    return normalizeFilePath(filePath);
  }

  const expanded = expandHomePath(filePath);
  const absolute = resolve(cwd, expanded);
  const rel = relative(cwd, absolute);
  const normalizedHome = normalizeFilePath(expandHomePath("~"));
  const normalizedAbsolute = normalizeFilePath(absolute);

  if (normalizedAbsolute.startsWith(`${normalizedHome}/`)) {
    return normalizeFilePath(`~/${relative(expandHomePath("~"), absolute)}`);
  }

  const candidate =
    rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : absolute;

  return normalizeFilePath(candidate);
}

function resolvePolicyPath(filePath: string, cwd: string): string {
  return resolve(cwd, expandHomePath(filePath));
}

function matchesAnyPolicyPattern(
  filePath: string,
  rules: CompiledRule[],
): boolean {
  return rules.some(
    (rule) =>
      rule.enabled && rule.patterns.some((pattern) => pattern.test(filePath)),
  );
}

async function expandCandidate(candidate: string): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];

  const matches = await expandGlob(candidate);
  if (matches.length > 0) return matches;

  return [candidate];
}

async function extractBashFileTargets(
  command: string,
  rules: CompiledRule[],
  cwd: string,
): Promise<string[]> {
  const targets = new Set<string>();

  const maybeAddTarget = async (candidate: string): Promise<void> => {
    if (!candidate || candidate.startsWith("-")) return;

    const expanded = await expandCandidate(candidate);
    for (const file of expanded) {
      const normalized = normalizeTargetForPolicy(file, cwd);
      if (matchesAnyPolicyPattern(normalized, rules)) {
        targets.add(normalized);
      }
    }
  };

  try {
    const { ast } = parse(command);
    const pending: Promise<void>[] = [];

    walkCommands(ast, (cmd) => {
      const words = (cmd.words ?? []).map(wordToString);
      for (let i = 1; i < words.length; i++) {
        const arg = words[i] as string;
        pending.push(maybeAddTarget(arg));
      }

      for (const redir of cmd.redirects ?? []) {
        const target = wordToString(redir.target);
        pending.push(maybeAddTarget(target));
      }

      return false;
    });

    await Promise.all(pending);

    return [...targets];
  } catch {
    const tokenRegex = /"([^"]+)"|'([^']+)'|`([^`]+)`|([^\s"'`<>|;&]+)/g;

    for (const match of command.matchAll(tokenRegex)) {
      const token = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      if (!token || token.startsWith("-") || !maybePathLike(token)) {
        continue;
      }

      const expanded = await expandCandidate(token);
      for (const file of expanded) {
        const normalized = normalizeTargetForPolicy(file, cwd);
        if (matchesAnyPolicyPattern(normalized, rules)) {
          targets.add(normalized);
        }
      }
    }

    return [...targets];
  }
}

async function getEffectiveProtection(
  filePath: string,
  compiledRules: CompiledRule[],
  cwd: string,
): Promise<{
  protection: Protection;
  blockMessage: string;
  ruleId: string;
} | null> {
  let bestMatch: {
    protection: Protection;
    blockMessage: string;
    ruleId: string;
    rank: number;
  } | null = null;

  for (const rule of compiledRules) {
    if (!rule.enabled) continue;

    const matched = rule.patterns.some((pattern) => pattern.test(filePath));
    if (!matched) continue;

    const allowed = rule.allowedPatterns.some((pattern) =>
      pattern.test(filePath),
    );
    if (allowed) continue;

    if (rule.onlyIfExists && !(await fileExists(filePath, cwd))) continue;

    const rank = protectionRank(rule.protection);
    if (!bestMatch || rank > bestMatch.rank) {
      bestMatch = {
        protection: rule.protection,
        blockMessage: rule.blockMessage,
        ruleId: rule.id,
        rank,
      };
    }
  }

  if (!bestMatch || bestMatch.protection === "none") return null;

  return {
    protection: bestMatch.protection,
    blockMessage: bestMatch.blockMessage,
    ruleId: bestMatch.ruleId,
  };
}

function extractPathTarget(input: Record<string, unknown>): string[] {
  const target = String(input.file_path ?? input.path ?? "").trim();
  return target ? [target] : [];
}

export function setupPoliciesHook(pi: ExtensionAPI, config: ResolvedConfig) {
  if (!config.features.policies) return;

  const compiledRules = compileRules(config.policies.rules);

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;
    let targets: string[] = [];

    if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) {
      targets = extractPathTarget(event.input);
    } else if (toolName === "bash") {
      const command = String(event.input.command ?? "");
      targets = await extractBashFileTargets(command, compiledRules, ctx.cwd);
    } else {
      return;
    }

    for (const target of targets) {
      const normalizedTarget = normalizeTargetForPolicy(target, ctx.cwd);

      const effective = await getEffectiveProtection(
        normalizedTarget,
        compiledRules,
        ctx.cwd,
      );
      if (!effective) continue;

      const blockedTools = BLOCKED_TOOLS[effective.protection];
      if (!blockedTools.has(toolName)) continue;

      ctx.ui.notify(
        `Blocked ${toolName} on protected file: ${normalizedTarget} (${effective.ruleId})`,
        "warning",
      );

      const reason = effective.blockMessage.replace("{file}", normalizedTarget);

      emitBlocked(pi, {
        feature: "policies",
        toolName,
        input: event.input,
        reason,
      });

      return { block: true, reason };
    }

    return;
  });
}
