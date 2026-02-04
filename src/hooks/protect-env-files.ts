import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";
import { expandGlob, hasGlobChars } from "../glob-expander";
import { type CompiledPattern, compileFilePatterns } from "../matching";
import { walkCommands, wordToString } from "../shell-utils";

/**
 * Prevents accessing .env files unless they match an allowed pattern.
 * Protects sensitive environment files from being accessed accidentally.
 *
 * Uses AST-based parsing for bash commands to extract file references,
 * with glob expansion via `fd` when args contain shell glob characters.
 */

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

async function isProtectedEnvFile(
  filePath: string,
  protectedPatterns: CompiledPattern[],
  allowedPatterns: CompiledPattern[],
  dirPatterns: CompiledPattern[],
  onlyBlockIfExists: boolean,
): Promise<boolean> {
  const isProtected = protectedPatterns.some((p) => p.test(filePath));
  if (!isProtected) return false;

  const isAllowed = allowedPatterns.some((p) => p.test(filePath));
  if (isAllowed) return false;

  // Check protected directories (if any configured)
  if (dirPatterns.length > 0) {
    const inProtectedDir = dirPatterns.some((p) => p.test(filePath));
    if (inProtectedDir) {
      return onlyBlockIfExists ? await fileExists(filePath) : true;
    }
  }

  return onlyBlockIfExists ? await fileExists(filePath) : true;
}

/**
 * Extract file references from a bash command using AST parsing.
 * Falls back to regex extraction on parse failure.
 */
async function extractBashFileTargets(command: string): Promise<string[]> {
  try {
    const { ast } = parse(command);
    const files: string[] = [];

    walkCommands(ast, (cmd) => {
      const words = (cmd.words ?? []).map(wordToString);
      // Skip command name (words[0]), check args for env file references
      for (let i = 1; i < words.length; i++) {
        const arg = words[i] as string;
        if (isEnvLikeReference(arg)) {
          files.push(arg);
        }
      }

      // Also check redirect targets
      for (const redir of cmd.redirects ?? []) {
        const target = wordToString(redir.target);
        if (isEnvLikeReference(target)) {
          files.push(target);
        }
      }
      return false;
    });

    // Expand globs
    const expanded: string[] = [];
    for (const file of files) {
      if (hasGlobChars(file)) {
        const matches = await expandGlob(file);
        if (matches.length > 0) {
          expanded.push(...matches);
        } else {
          // Expansion returned nothing -- could be fd not found or no matches.
          // Keep original as-is so pattern matching can still catch it.
          expanded.push(file);
        }
      } else {
        expanded.push(file);
      }
    }

    return expanded;
  } catch {
    // Fallback: regex extraction from raw string
    return extractEnvFilesRegex(command);
  }
}

/**
 * Check if a string looks like an env file reference.
 * Matches anything containing ".env" as a path component.
 */
function isEnvLikeReference(arg: string): boolean {
  // Must contain ".env" somewhere
  if (!arg.includes(".env") && !arg.includes(".dev.vars")) return false;
  // Skip flags
  if (arg.startsWith("-") && !arg.startsWith("-/") && !arg.startsWith("-."))
    return false;
  return true;
}

/**
 * Fallback regex extraction for env file references in bash commands.
 */
function extractEnvFilesRegex(command: string): string[] {
  const files: string[] = [];
  const envFileRegex =
    /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.env[^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;

  for (const match of command.matchAll(envFileRegex)) {
    const file = match[1];
    if (file) files.push(file);
  }

  return files;
}

interface ToolProtectionRule {
  tools: string[];
  extractTargets: (input: Record<string, unknown>) => Promise<string[]>;
  shouldBlock: (target: string) => Promise<boolean>;
  blockMessage: (target: string) => string;
}

export function setupProtectEnvFilesHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.protectEnvFiles) return;

  const protectedPatterns = compileFilePatterns(
    config.envFiles.protectedPatterns,
  );
  const allowedPatterns = compileFilePatterns(config.envFiles.allowedPatterns);
  const dirPatterns = compileFilePatterns(config.envFiles.protectedDirectories);

  const shouldBlock = (target: string) =>
    isProtectedEnvFile(
      target,
      protectedPatterns,
      allowedPatterns,
      dirPatterns,
      config.envFiles.onlyBlockIfExists,
    );

  const protectionRules: ToolProtectionRule[] = [
    {
      tools: config.envFiles.protectedTools.filter((t) =>
        ["read", "write", "edit", "grep", "find", "ls"].includes(t),
      ),
      extractTargets: async (input) => {
        const path = String(input.file_path ?? input.path ?? "");
        return path ? [path] : [];
      },
      shouldBlock,
      blockMessage: (target) =>
        config.envFiles.blockMessage.replace("{file}", target),
    },
    {
      tools: config.envFiles.protectedTools.includes("bash") ? ["bash"] : [],
      extractTargets: async (input) => {
        const command = String(input.command ?? "");
        return extractBashFileTargets(command);
      },
      shouldBlock,
      blockMessage: (target) =>
        `Command references protected file ${target}. ` +
        config.envFiles.blockMessage.replace("{file}", target),
    },
  ];

  // Build lookup: tool name -> rule
  const rulesByTool = new Map<string, ToolProtectionRule>();
  for (const rule of protectionRules) {
    for (const tool of rule.tools) {
      rulesByTool.set(tool, rule);
    }
  }

  pi.on("tool_call", async (event, ctx) => {
    const rule = rulesByTool.get(event.toolName);
    if (!rule) return;

    const targets = await rule.extractTargets(event.input);

    for (const target of targets) {
      if (await rule.shouldBlock(target)) {
        ctx.ui.notify(`Blocked access to protected file: ${target}`, "warning");

        const reason = rule.blockMessage(target);

        emitBlocked(pi, {
          feature: "protectEnvFiles",
          toolName: event.toolName,
          input: event.input,
          reason,
        });

        return { block: true, reason };
      }
    }
    return;
  });
}
