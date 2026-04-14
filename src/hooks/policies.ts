import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { parse } from "@aliou/sh";
import {
  DynamicBorder,
  type ExtensionAPI,
} from "@mariozechner/pi-coding-agent";
import { Container, Key, matchesKey, Spacer, Text } from "@mariozechner/pi-tui";
import type { PolicyRule, Protection, ResolvedConfig } from "../config";
import { configLoader } from "../config";
import { emitBlocked } from "../utils/events";
import { expandGlob, hasGlobChars } from "../utils/glob-expander";
import {
  type CompiledPattern,
  compileFilePatterns,
  normalizeFilePath,
} from "../utils/matching";
import {
  expandHomePath,
  extractGrantDirectory,
  isWithinLexicalBoundary,
  resolveFromCwd,
} from "../utils/path";
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

export function normalizeTargetForPolicy(
  filePath: string,
  cwd: string,
): string {
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

async function expandCandidate(
  candidate: string,
  cwd: string,
): Promise<string[]> {
  if (!hasGlobChars(candidate)) return [candidate];

  const matches = await expandGlob(candidate, { cwd });
  if (matches.length > 0) return matches;

  return [candidate];
}

/**
 * Extract path-like candidates from a bash command string.
 * Returns ALL path-like arguments (no policy filtering).
 * Used by both directoryAccess boundary checks and policy checks.
 */
export async function extractBashPathCandidates(
  command: string,
  cwd: string,
): Promise<string[]> {
  const targets = new Set<string>();

  const maybeAddTarget = async (candidate: string): Promise<void> => {
    if (!candidate || candidate.startsWith("-")) return;
    if (!maybePathLike(candidate)) return;

    const expanded = await expandCandidate(candidate, cwd);
    for (const file of expanded) {
      const normalized = normalizeTargetForPolicy(file, cwd);
      targets.add(normalized);
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

      const expanded = await expandCandidate(token, cwd);
      for (const file of expanded) {
        const normalized = normalizeTargetForPolicy(file, cwd);
        targets.add(normalized);
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

// ---- directoryAccess helpers ----

export function isBoundaryAllowed(
  target: string,
  cwd: string,
  additionalDirs: string[],
): boolean {
  if (isWithinLexicalBoundary(target, cwd)) return true;

  for (const dir of additionalDirs) {
    if (isWithinLexicalBoundary(target, dir)) return true;
  }

  return false;
}

function getRawAdditionalDirs(
  rawConfig: Record<string, unknown> | null,
): string[] {
  const da = rawConfig?.directoryAccess as Record<string, unknown> | undefined;
  return Array.isArray(da?.additionalDirs)
    ? (da?.additionalDirs as string[])
    : [];
}

/**
 * Add a directory to the session grant list (memory scope).
 * Merges with existing memory scope config instead of clobbering.
 */
async function allowDirectoryForSession(absTarget: string): Promise<void> {
  const grantDir = await extractGrantDirectory(absTarget);
  const rawMemory = (configLoader.getRawConfig("memory") ?? {}) as Record<
    string,
    unknown
  >;
  const existingDirs = getRawAdditionalDirs(rawMemory);

  if (existingDirs.includes(grantDir)) return;

  await configLoader.save("memory", {
    ...rawMemory,
    directoryAccess: {
      ...(rawMemory.directoryAccess as Record<string, unknown> | undefined),
      additionalDirs: [...existingDirs, grantDir],
    },
  });
}

/**
 * Add a directory to the project grant list (local scope).
 */
async function allowDirectoryForProject(absTarget: string): Promise<void> {
  const grantDir = await extractGrantDirectory(absTarget);
  const rawLocal = (configLoader.getRawConfig("local") ?? {}) as Record<
    string,
    unknown
  >;
  const existingDirs = getRawAdditionalDirs(rawLocal);

  if (existingDirs.includes(grantDir)) return;

  await configLoader.save("local", {
    ...rawLocal,
    directoryAccess: {
      ...(rawLocal.directoryAccess as Record<string, unknown> | undefined),
      additionalDirs: [...existingDirs, grantDir],
    },
  });
}

function createDirectoryAccessConfirmComponent(
  toolName: string,
  targetPath: string,
  cwd: string,
) {
  return (
    _tui: { terminal: { columns: number }; requestRender(): void },
    theme: {
      fg(color: string, text: string): string;
      bg(color: string, text: string): string;
      bold(text: string): string;
    },
    _kb: unknown,
    done: (
      result: "allow-once" | "allow-session" | "allow-project" | "deny",
    ) => void,
  ) => {
    const container = new Container();
    const border = (s: string) => theme.fg("warning", s);

    container.addChild(new DynamicBorder(border));
    container.addChild(
      new Text(
        theme.fg("warning", theme.bold("Outside Workspace Access")),
        1,
        0,
      ),
    );
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "text",
          `This ${toolName} targets a path outside the current working directory.`,
        ),
        1,
        0,
      ),
    );
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg("dim", `  Path: ${targetPath}`), 1, 0),
    );
    container.addChild(new Text(theme.fg("dim", `  Cwd:  ${cwd}`), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("text", "Allow access?"), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          "y/enter: allow once \u2022 s: session \u2022 p: project \u2022 n/esc: deny",
        ),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder(border));

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
          done("allow-once");
        } else if (data === "s" || data === "S") {
          done("allow-session");
        } else if (data === "p" || data === "P") {
          done("allow-project");
        } else if (
          matchesKey(data, Key.escape) ||
          data === "n" ||
          data === "N"
        ) {
          done("deny");
        }
      },
    };
  };
}

export function setupPoliciesHook(pi: ExtensionAPI, config: ResolvedConfig) {
  if (!config.features.policies && !config.features.directoryAccess) return;

  const compiledRules = config.features.policies
    ? compileRules(config.policies.rules)
    : [];

  pi.on("tool_call", async (event, ctx) => {
    const toolName = event.toolName;

    // Re-read directory access config on each invocation so settings changes take effect
    const liveConfig = configLoader.getConfig();
    const boundaryMode = liveConfig.directoryAccess.mode;
    const boundaryEnabled =
      liveConfig.features.directoryAccess && boundaryMode !== "allow";
    const boundaryAdditionalDirs = (
      liveConfig.directoryAccess.additionalDirs ?? []
    ).map((d) => resolveFromCwd(d, ctx.cwd));

    // Extract targets (shared between boundary and policy checks)
    let targets: string[] = [];
    if (["read", "write", "edit", "grep", "find", "ls"].includes(toolName)) {
      targets = extractPathTarget(event.input);
    } else if (toolName === "bash") {
      const command = String(event.input.command ?? "");
      targets = await extractBashPathCandidates(command, ctx.cwd);
    } else {
      return;
    }

    // ---- directoryAccess boundary check (before policies) ----
    if (boundaryEnabled) {
      for (const target of targets) {
        const normalizedTarget = normalizeTargetForPolicy(target, ctx.cwd);
        const absTarget = resolveFromCwd(normalizedTarget, ctx.cwd);

        if (isBoundaryAllowed(absTarget, ctx.cwd, boundaryAdditionalDirs)) {
          continue;
        }

        // Mode: block (or no UI fallback)
        if (boundaryMode === "block" || !ctx.hasUI) {
          const reason =
            boundaryMode === "block"
              ? `Access to ${normalizedTarget} is outside the current working directory and is blocked.`
              : `Access to ${normalizedTarget} is outside the current working directory and was blocked (no UI to confirm).`;
          emitBlocked(pi, {
            feature: "directoryAccess",
            toolName,
            input: event.input,
            reason,
          });
          return { block: true, reason };
        }

        // Mode: ask (has UI)
        type BoundaryResult =
          | "allow-once"
          | "allow-session"
          | "allow-project"
          | "deny";
        const result = await ctx.ui.custom<BoundaryResult>(
          createDirectoryAccessConfirmComponent(
            toolName,
            normalizedTarget,
            ctx.cwd,
          ),
        );

        if (result === "allow-session") {
          await allowDirectoryForSession(absTarget);
          continue;
        }

        if (result === "allow-project") {
          await allowDirectoryForProject(absTarget);
          continue;
        }

        // Default to deny: "allow-once" is explicit; anything else (undefined, cancel) blocks
        if (result !== "allow-once") {
          emitBlocked(pi, {
            feature: "directoryAccess",
            toolName,
            input: event.input,
            reason:
              result === "deny"
                ? "User denied access outside the current working directory"
                : "Access outside the current working directory was not confirmed",
            userDenied: result === "deny",
          });
          return {
            block: true,
            reason:
              result === "deny"
                ? "User denied access outside the current working directory"
                : "Access outside the current working directory was not confirmed",
          };
        }

        // "allow-once" -- continue without persistence
      }
    }

    // ---- existing policy checks (unchanged) ----
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
