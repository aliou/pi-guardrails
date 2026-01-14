import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Prevents accessing .env files unless they are suffixed with example, sample, or test.
 * This protects sensitive environment files from being accessed accidentally.
 *
 * Covers native tools: read, write, edit, bash, grep, find, ls
 */

const ENV_FILE_PATTERN = /\.env$/i;
const ALLOWED_SUFFIXES =
  /\.(example|sample|test)\.env$|\.env\.(example|sample|test)$/i;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(resolve(filePath));
    return true;
  } catch {
    return false;
  }
}

async function isProtectedEnvFile(filePath: string): Promise<boolean> {
  if (!ENV_FILE_PATTERN.test(filePath)) {
    return false;
  }

  if (ALLOWED_SUFFIXES.test(filePath)) {
    return false;
  }

  // Only block if file actually exists on disk
  return fileExists(filePath);
}

// -------------------------------------------------------------------
// Tool protection rule interface
// -------------------------------------------------------------------

interface ToolProtectionRule {
  /** Tool names this rule applies to */
  tools: string[];
  /** Extract paths/targets from tool input that need checking */
  extractTargets: (input: Record<string, unknown>) => string[];
  /** Check if a target should be blocked */
  shouldBlock: (target: string) => Promise<boolean>;
  /** Generate block message for a target */
  blockMessage: (target: string) => string;
}

// -------------------------------------------------------------------
// Protection rules
// -------------------------------------------------------------------

const protectionRules: ToolProtectionRule[] = [
  {
    // Tools that use path/file_path input parameter
    tools: ["read", "write", "edit", "grep", "find", "ls"],
    extractTargets: (input) => {
      const path = String(input.file_path ?? input.path ?? "");
      return path ? [path] : [];
    },
    shouldBlock: isProtectedEnvFile,
    blockMessage: (target) =>
      `Accessing ${target} is not allowed. Environment files containing secrets are protected. Only .env.example, .env.sample, or .env.test files can be accessed.`,
  },
  {
    // Bash needs to parse command string for .env references
    tools: ["bash"],
    extractTargets: (input) => {
      const command = String(input.command ?? "");
      const files: string[] = [];

      // Match .env file references in bash commands
      const envFileRegex =
        /(?:^|\s|[<>|;&"'`])([^\s<>|;&"'`]*\.env)(?:\s|$|[<>|;&"'`])/gi;

      for (const match of command.matchAll(envFileRegex)) {
        const file = match[1];
        if (file) {
          files.push(file);
        }
      }

      return files;
    },
    shouldBlock: isProtectedEnvFile,
    blockMessage: (target) =>
      `Command references protected file ${target}. Environment files containing secrets are protected. Only .env.example, .env.sample, or .env.test files can be accessed.`,
  },
];

// Build lookup: tool name -> rule
const rulesByTool = new Map<string, ToolProtectionRule>();
for (const rule of protectionRules) {
  for (const tool of rule.tools) {
    rulesByTool.set(tool, rule);
  }
}

// -------------------------------------------------------------------
// Hook
// -------------------------------------------------------------------

export function setupProtectEnvFilesHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    const rule = rulesByTool.get(event.toolName);
    if (!rule) return;

    const targets = rule.extractTargets(event.input);

    for (const target of targets) {
      if (await rule.shouldBlock(target)) {
        ctx.ui.notify(
          `Blocked access to protected .env file: ${target}`,
          "warning",
        );
        return {
          block: true,
          reason: rule.blockMessage(target),
        };
      }
    }
  });
}
