import { parse } from "@aliou/sh";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked } from "../events";
import { walkCommands, wordToString } from "../shell-utils";

/**
 * Blocks all brew commands. Homebrew is not installed on this machine.
 *
 * Uses AST-based matching to avoid false positives where "brew" appears
 * in commit messages, grep patterns, or file paths.
 */

const BREW_PATTERN = /\bbrew\b/;

export function setupPreventBrewHook(pi: ExtensionAPI, config: ResolvedConfig) {
  if (!config.features.preventBrew) return;

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    let hasBrew = false;
    try {
      const { ast } = parse(command);
      walkCommands(ast, (cmd) => {
        const name = cmd.words?.[0] ? wordToString(cmd.words[0]) : undefined;
        if (name === "brew") {
          hasBrew = true;
          return true;
        }
        return false;
      });
    } catch {
      hasBrew = BREW_PATTERN.test(command);
    }

    if (hasBrew) {
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
