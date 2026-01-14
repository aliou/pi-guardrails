import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Permission gate that prompts user confirmation for dangerous commands.
 * Blocks patterns like rm -rf, sudo, and piped shell execution.
 */

const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+-rf/, description: "recursive force delete" },
  { pattern: /\bsudo\b/, description: "superuser command" },
  { pattern: /:\s*\|\s*sh/, description: "piped shell execution" },
  { pattern: /\bdd\s+if=/, description: "disk write operation" },
  { pattern: /mkfs\./, description: "filesystem format" },
  {
    pattern: /\bchmod\s+-R\s+777/,
    description: "insecure recursive permissions",
  },
  { pattern: /\bchown\s+-R/, description: "recursive ownership change" },
];

export function setupPermissionGateHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    for (const { pattern, description } of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) {
        const truncatedCmd =
          command.length > 60 ? `${command.substring(0, 60)}...` : command;

        const proceed = await ctx.ui.confirm(
          "Dangerous Command Detected",
          `This command contains ${description}:\n\n${truncatedCmd}\n\nAllow execution?`,
        );

        if (!proceed) {
          return { block: true, reason: "User denied dangerous command" };
        }
        break;
      }
    }
  });
}
