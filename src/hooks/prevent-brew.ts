import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

/**
 * Prevents bash tool calls that attempt to install packages using Homebrew.
 * Reminds the user that this project uses Nix for package management.
 */

const BREW_INSTALL_PATTERNS = [
  /\bbrew\s+install\b/,
  /\bbrew\s+cask\s+install\b/,
  /\bbrew\s+bundle\b/,
  /\bbrew\s+upgrade\b/,
  /\bbrew\s+reinstall\b/,
];

export function setupPreventBrewHook(pi: ExtensionAPI) {
  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    for (const pattern of BREW_INSTALL_PATTERNS) {
      if (pattern.test(command)) {
        ctx.ui.notify(
          "Blocked brew command. This project uses Nix for package management.",
          "warning",
        );
        return {
          block: true,
          reason:
            "Homebrew is not used in this project. Please use Nix for package management instead. Run packages via nix-shell or add them to the project's Nix configuration.",
        };
      }
    }
    return;
  });
}
