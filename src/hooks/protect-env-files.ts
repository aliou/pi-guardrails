import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";

/**
 * Prevents accessing .env files unless they match an allowed pattern.
 * Protects sensitive environment files from being accessed accidentally.
 *
 * Covers configurable set of tools (default: read, write, edit, bash, grep, find, ls).
 */

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

function compilePatterns(patterns: string[]): RegExp[] {
  return patterns
    .map((p) => {
      try {
        return new RegExp(p, "i");
      } catch {
        console.error(`Invalid regex pattern in guardrails config: ${p}`);
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);
}

async function isProtectedEnvFile(
  filePath: string,
  config: ResolvedConfig,
): Promise<boolean> {
  const protectedRegexes = compilePatterns(config.envFiles.protectedPatterns);
  const isProtected = protectedRegexes.some((r) => r.test(filePath));
  if (!isProtected) return false;

  const allowedRegexes = compilePatterns(config.envFiles.allowedPatterns);
  const isAllowed = allowedRegexes.some((r) => r.test(filePath));
  if (isAllowed) return false;

  // Check protected directories (if any configured)
  if (config.envFiles.protectedDirectories.length > 0) {
    const dirRegexes = compilePatterns(config.envFiles.protectedDirectories);
    const inProtectedDir = dirRegexes.some((r) => r.test(filePath));
    if (inProtectedDir) {
      return config.envFiles.onlyBlockIfExists
        ? await fileExists(filePath)
        : true;
    }
  }

  return config.envFiles.onlyBlockIfExists ? await fileExists(filePath) : true;
}

interface ToolProtectionRule {
  tools: string[];
  extractTargets: (input: Record<string, unknown>) => string[];
  shouldBlock: (target: string) => Promise<boolean>;
  blockMessage: (target: string) => string;
}

export function setupProtectEnvFilesHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.protectEnvFiles) return;

  const protectionRules: ToolProtectionRule[] = [
    {
      tools: config.envFiles.protectedTools.filter((t) =>
        ["read", "write", "edit", "grep", "find", "ls"].includes(t),
      ),
      extractTargets: (input) => {
        const path = String(input.file_path ?? input.path ?? "");
        return path ? [path] : [];
      },
      shouldBlock: (target) => isProtectedEnvFile(target, config),
      blockMessage: (target) =>
        config.envFiles.blockMessage.replace("{file}", target),
    },
    {
      tools: config.envFiles.protectedTools.includes("bash") ? ["bash"] : [],
      extractTargets: (input) => {
        const command = String(input.command ?? "");
        const files: string[] = [];

        const envFileRegex =
          /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.env[^\s<>|;&"'`]*)(?:\s|$|[<>|;&"'`])/gi;

        for (const match of command.matchAll(envFileRegex)) {
          const file = match[1];
          if (file) files.push(file);
        }

        return files;
      },
      shouldBlock: (target) => isProtectedEnvFile(target, config),
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

    const targets = rule.extractTargets(event.input);

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
