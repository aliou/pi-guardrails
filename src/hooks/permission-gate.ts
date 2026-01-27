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
import type { ResolvedConfig } from "../config-schema";
import { emitBlocked, emitDangerous } from "../events";

/**
 * Permission gate that prompts user confirmation for dangerous commands.
 * Patterns, confirmation behavior, allow/deny lists are all configurable.
 */

export function setupPermissionGateHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.permissionGate) return;

  // Compile patterns, skipping invalid regex
  const dangerousPatterns = config.permissionGate.patterns
    .map((p) => {
      try {
        return {
          pattern: new RegExp(p.pattern),
          description: p.description,
          rawPattern: p.pattern,
        };
      } catch {
        console.error(
          `Invalid regex in guardrails permission-gate config: ${p.pattern}`,
        );
        return null;
      }
    })
    .filter(
      (p): p is { pattern: RegExp; description: string; rawPattern: string } =>
        p !== null,
    );

  const allowedPatterns = config.permissionGate.allowedPatterns
    .map((p) => {
      try {
        return new RegExp(p);
      } catch {
        console.error(
          `Invalid regex in guardrails allowedPatterns config: ${p}`,
        );
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);

  const autoDenyPatterns = config.permissionGate.autoDenyPatterns
    .map((p) => {
      try {
        return new RegExp(p);
      } catch {
        console.error(
          `Invalid regex in guardrails autoDenyPatterns config: ${p}`,
        );
        return null;
      }
    })
    .filter((r): r is RegExp => r !== null);

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const command = String(event.input.command ?? "");

    // Check allowed patterns first (bypass)
    for (const pattern of allowedPatterns) {
      if (pattern.test(command)) return;
    }

    // Check auto-deny patterns
    for (const pattern of autoDenyPatterns) {
      if (pattern.test(command)) {
        ctx.ui.notify("Blocked dangerous command (auto-deny)", "error");

        const reason =
          "Command matched auto-deny pattern and was blocked automatically.";

        emitBlocked(pi, {
          feature: "permissionGate",
          toolName: "bash",
          input: event.input,
          reason,
        });

        return { block: true, reason };
      }
    }

    // Check dangerous patterns
    for (const { pattern, description, rawPattern } of dangerousPatterns) {
      if (pattern.test(command)) {
        // Emit dangerous event (presenter will play sound)
        emitDangerous(pi, { command, description, pattern: rawPattern });

        if (config.permissionGate.requireConfirmation) {
          const proceed = await ctx.ui.custom<boolean>(
            (_tui, theme, _kb, done) => {
              const container = new Container();
              const redBorder = (s: string) => theme.fg("error", s);

              container.addChild(new DynamicBorder(redBorder));
              container.addChild(
                new Text(
                  theme.fg("error", theme.bold("Dangerous Command Detected")),
                  1,
                  0,
                ),
              );
              container.addChild(new Spacer(1));
              container.addChild(
                new Text(
                  theme.fg("warning", `This command contains ${description}:`),
                  1,
                  0,
                ),
              );
              container.addChild(new Spacer(1));
              container.addChild(
                new DynamicBorder((s: string) => theme.fg("muted", s)),
              );
              const commandText = new Text("", 1, 0);
              container.addChild(commandText);
              container.addChild(
                new DynamicBorder((s: string) => theme.fg("muted", s)),
              );
              container.addChild(new Spacer(1));
              container.addChild(
                new Text(theme.fg("text", "Allow execution?"), 1, 0),
              );
              container.addChild(new Spacer(1));
              container.addChild(
                new Text(theme.fg("dim", "y/enter: allow • n/esc: deny"), 1, 0),
              );
              container.addChild(new DynamicBorder(redBorder));

              return {
                render: (width: number) => {
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
            emitBlocked(pi, {
              feature: "permissionGate",
              toolName: "bash",
              input: event.input,
              reason: "User denied dangerous command",
              userDenied: true,
            });

            return { block: true, reason: "User denied dangerous command" };
          }
        } else {
          // No confirmation required - just notify and allow
          ctx.ui.notify(
            `Dangerous command detected: ${description}`,
            "warning",
          );
        }

        break;
      }
    }
    return;
  });
}
