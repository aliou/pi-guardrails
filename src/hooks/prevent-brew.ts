import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";

/**
 * Blocks all brew commands. Homebrew is not installed on this machine.
 */

const BREW_PATTERN = /\bbrew\b/;

export function setupPreventBrewHook(pi: ExtensionAPI, config: ResolvedConfig) {
  if (!config.features.preventBrew) return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    if (BREW_PATTERN.test(command)) {
      ctx.ui.notify(
        "Blocked brew command. Homebrew is not installed.",
        "warning",
      );

      const reason =
        "Homebrew is not installed on this machine. " +
        "Use Nix for package management instead. " +
        "Run packages via nix-shell or add them to the project's Nix configuration.";

      emitBlocked(pi, {
        feature: "preventBrew",
        toolName: "bash",
        input: event.input,
        reason,
      });

      return { block: true, reason };
    }
    return;
  });
}
