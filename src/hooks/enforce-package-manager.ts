import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";

/**
 * Enforces using a specific Node package manager (bun, pnpm, or npm).
 * Blocks commands using non-selected package managers.
 */

const BUN_PATTERN = /\bbun\b/;
const PNPM_PATTERN = /\bpnpm\b/;
const NPM_PATTERN = /\bnpm\b/;

type PackageManager = "bun" | "pnpm" | "npm";

interface ManagerInfo {
  pattern: RegExp;
  name: string;
  installCmd: string;
  addCmd: string;
  runCmd: string;
}

const MANAGER_INFO: Record<PackageManager, ManagerInfo> = {
  bun: {
    pattern: BUN_PATTERN,
    name: "bun",
    installCmd: "bun install",
    addCmd: "bun add <package>",
    runCmd: "bun run <script>",
  },
  pnpm: {
    pattern: PNPM_PATTERN,
    name: "pnpm",
    installCmd: "pnpm install",
    addCmd: "pnpm add <package>",
    runCmd: "pnpm run <script>",
  },
  npm: {
    pattern: NPM_PATTERN,
    name: "npm",
    installCmd: "npm install",
    addCmd: "npm install <package>",
    runCmd: "npm run <script>",
  },
};

export function setupEnforcePackageManagerHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.enforcePackageManager) return;

  const selectedManager = config.packageManager.selected;
  const selected = MANAGER_INFO[selectedManager];

  // Get all managers that should be blocked (all except the selected one)
  const blockedManagers = (
    Object.keys(MANAGER_INFO) as PackageManager[]
  ).filter((m) => m !== selectedManager);

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    for (const blockedManager of blockedManagers) {
      const blocked = MANAGER_INFO[blockedManager];

      if (blocked.pattern.test(command)) {
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
    }

    return;
  });
}
