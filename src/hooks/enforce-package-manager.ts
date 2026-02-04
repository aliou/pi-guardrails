import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";
import { walkCommands, wordToString } from "../shell-utils";

/**
 * Enforces using a specific Node package manager (bun, pnpm, or npm).
 * Blocks commands using non-selected package managers.
 *
 * Uses AST-based matching to avoid false positives where package manager
 * names appear in URLs (npm.pkg.github.com), file paths, or grep patterns.
 */

type PackageManager = "bun" | "pnpm" | "npm";

const MANAGERS = new Set<string>(["bun", "pnpm", "npm"]);

interface ManagerInfo {
  name: string;
  installCmd: string;
  addCmd: string;
  runCmd: string;
}

const MANAGER_INFO: Record<PackageManager, ManagerInfo> = {
  bun: {
    name: "bun",
    installCmd: "bun install",
    addCmd: "bun add <package>",
    runCmd: "bun run <script>",
  },
  pnpm: {
    name: "pnpm",
    installCmd: "pnpm install",
    addCmd: "pnpm add <package>",
    runCmd: "pnpm run <script>",
  },
  npm: {
    name: "npm",
    installCmd: "npm install",
    addCmd: "npm install <package>",
    runCmd: "npm run <script>",
  },
};

// Fallback regex patterns for parse failures
const MANAGER_PATTERNS: Record<PackageManager, RegExp> = {
  bun: /\bbun\b/,
  pnpm: /\bpnpm\b/,
  npm: /\bnpm\b/,
};

export function setupEnforcePackageManagerHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.enforcePackageManager) return;

  const selectedManager = config.packageManager.selected;
  const selected = MANAGER_INFO[selectedManager];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    let blockedName: string | null = null;

    try {
      const { ast } = parse(command);
      walkCommands(ast, (cmd) => {
        const name = cmd.words?.[0] ? wordToString(cmd.words[0]) : undefined;
        if (name && MANAGERS.has(name) && name !== selectedManager) {
          blockedName = name;
          return true;
        }
        return false;
      });
    } catch {
      // Fallback to regex
      for (const manager of MANAGERS) {
        if (manager === selectedManager) continue;
        if (MANAGER_PATTERNS[manager as PackageManager].test(command)) {
          blockedName = manager;
          break;
        }
      }
    }

    if (blockedName) {
      const blocked = MANAGER_INFO[blockedName as PackageManager];
      ctx.ui.notify(
        `Blocked ${blocked.name} command. Use ${selected.name} instead.`,
        "warning",
      );

      const reason =
        `This project uses ${selected.name} as its package manager. ` +
        `Use ${selected.name} instead of ${blocked.name}. ` +
        `Run \`${selected.installCmd}\` to install dependencies, ` +
        `\`${selected.addCmd}\` to add packages, ` +
        `and \`${selected.runCmd}\` to run scripts.`;

      emitBlocked(pi, {
        feature: "enforcePackageManager",
        toolName: "bash",
        input: event.input,
        reason,
      });

      return { block: true, reason };
    }

    return;
  });
}
