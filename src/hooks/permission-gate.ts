import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

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
        const proceed = await ctx.ui.custom<boolean>(
          (_tui, theme, _kb, done) => {
            const container = new Container();

            // Red border styling
            const redBorder = (s: string) => theme.fg("error", s);

            // Top border
            container.addChild(new DynamicBorder(redBorder));

            // Title
            container.addChild(
              new Text(
                theme.fg("error", theme.bold("Dangerous Command Detected")),
                1,
                0,
              ),
            );
            container.addChild(new Spacer(1));

            // Description
            container.addChild(
              new Text(
                theme.fg("warning", `This command contains ${description}:`),
                1,
                0,
              ),
            );
            container.addChild(new Spacer(1));

            // Full command with border
            container.addChild(
              new DynamicBorder((s: string) => theme.fg("muted", s)),
            );
            const commandText = new Text("", 1, 0);
            container.addChild(commandText);
            container.addChild(
              new DynamicBorder((s: string) => theme.fg("muted", s)),
            );
            container.addChild(new Spacer(1));

            // Prompt
            container.addChild(
              new Text(theme.fg("text", "Allow execution?"), 1, 0),
            );
            container.addChild(new Spacer(1));

            // Help text
            container.addChild(
              new Text(theme.fg("dim", "y/enter: allow • n/esc: deny"), 1, 0),
            );

            // Bottom border
            container.addChild(new DynamicBorder(redBorder));

            return {
              render: (width: number) => {
                // Update command text with proper wrapping for current width
                const wrappedCommand = wrapTextWithAnsi(
                  theme.fg("text", command),
                  width - 4,
                ).join("\n");
                commandText.setText(wrappedCommand);
                return container.render(width);
              },
              invalidate: () => container.invalidate(),
              handleInput: (data: string) => {
                if (
                  matchesKey(data, Key.enter) ||
                  data === "y" ||
                  data === "Y"
                ) {
                  done(true);
                } else if (
                  matchesKey(data, Key.escape) ||
                  data === "n" ||
                  data === "N"
                ) {
                  done(false);
                }
              },
            };
          },
        );

        if (!proceed) {
          return { block: true, reason: "User denied dangerous command" };
        }
        break;
      }
    }
    return;
  });
}
