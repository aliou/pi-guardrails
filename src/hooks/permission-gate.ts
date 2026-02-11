import { parse } from "@aliou/sh";
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
import type { DangerousPattern, ResolvedConfig } from "../config";
import { configLoader } from "../config";
import { emitBlocked, emitDangerous } from "../utils/events";
import {
  type CompiledPattern,
  compileCommandPatterns,
} from "../utils/matching";
import { walkCommands, wordToString } from "../utils/shell-utils";

/**
 * Permission gate that prompts user confirmation for dangerous commands.
 *
 * Built-in dangerous patterns are matched structurally via AST parsing.
 * User custom patterns use substring/regex matching on the raw string.
 * Allowed/auto-deny patterns match against the raw command string.
 */

/**
 * Structural matcher for a built-in dangerous command.
 * Returns a description if matched, undefined otherwise.
 */
type StructuralMatcher = (words: string[]) => string | undefined;

/**
 * Built-in dangerous command matchers. These check the parsed command
 * structure instead of regex against the raw string.
 */
const BUILTIN_MATCHERS: StructuralMatcher[] = [
  // rm -rf
  (words) => {
    if (words[0] !== "rm") return undefined;
    const hasRF = words.some(
      (w) =>
        w === "-rf" ||
        w === "-fr" ||
        (w.startsWith("-") && w.includes("r") && w.includes("f")),
    );
    return hasRF ? "recursive force delete" : undefined;
  },
  // sudo
  (words) => (words[0] === "sudo" ? "superuser command" : undefined),
  // dd if=
  (words) => {
    if (words[0] !== "dd") return undefined;
    return words.some((w) => w.startsWith("if="))
      ? "disk write operation"
      : undefined;
  },
  // mkfs.*
  (words) => (words[0]?.startsWith("mkfs.") ? "filesystem format" : undefined),
  // chmod -R 777
  (words) => {
    if (words[0] !== "chmod") return undefined;
    return words.includes("-R") && words.includes("777")
      ? "insecure recursive permissions"
      : undefined;
  },
  // chown -R
  (words) => {
    if (words[0] !== "chown") return undefined;
    return words.includes("-R") ? "recursive ownership change" : undefined;
  },
];

interface DangerMatch {
  description: string;
  pattern: string;
}

/**
 * Check a parsed command against built-in structural matchers.
 */
function checkBuiltinDangerous(words: string[]): DangerMatch | undefined {
  if (words.length === 0) return undefined;
  for (const matcher of BUILTIN_MATCHERS) {
    const desc = matcher(words);
    if (desc) return { description: desc, pattern: "(structural)" };
  }
  return undefined;
}

/**
 * Check a command string against dangerous patterns.
 *
 * When useBuiltinMatchers is true (default patterns): tries structural AST
 * matching first, falls back to substring match on parse failure.
 *
 * When useBuiltinMatchers is false (customPatterns replaced defaults): skips
 * structural matchers entirely, uses compiled patterns (substring/regex)
 * against the raw command string.
 */
function findDangerousMatch(
  command: string,
  compiledPatterns: CompiledPattern[],
  useBuiltinMatchers: boolean,
  fallbackPatterns: DangerousPattern[],
): DangerMatch | undefined {
  if (useBuiltinMatchers) {
    // Try structural matching first
    try {
      const { ast } = parse(command);
      let match: DangerMatch | undefined;
      walkCommands(ast, (cmd) => {
        const words = (cmd.words ?? []).map(wordToString);
        const result = checkBuiltinDangerous(words);
        if (result) {
          match = result;
          return true;
        }
        return false;
      });
      // Structural matching succeeded -- return result (even if no match).
      // Do NOT fall through to compiled patterns which do raw substring
      // matching and would false-positive on e.g. "sudo" inside a quoted
      // commit message argument.
      return match;
    } catch {
      // Parse failed -- fall back to substring matching on raw string
      for (const p of fallbackPatterns) {
        if (command.includes(p.pattern)) {
          return { description: p.description, pattern: p.pattern };
        }
      }
    }
  }

  // Check compiled patterns (substring/regex on raw string).
  // Only reached when customPatterns replaces defaults (useBuiltinMatchers
  // is false) or when the structural parse failed and no fallback matched.
  for (const cp of compiledPatterns) {
    if (cp.test(command)) {
      const src = cp.source as DangerousPattern;
      return { description: src.description, pattern: src.pattern };
    }
  }

  return undefined;
}

export function setupPermissionGateHook(
  pi: ExtensionAPI,
  config: ResolvedConfig,
) {
  if (!config.features.permissionGate) return;

  // Compile all configured patterns for substring/regex matching.
  // When useBuiltinMatchers is true (defaults), these act as a supplement
  // to the structural matchers. When false (customPatterns), these are the
  // only matching path.
  const compiledPatterns = compileCommandPatterns(
    config.permissionGate.patterns,
  );
  const { useBuiltinMatchers } = config.permissionGate;
  const fallbackPatterns = config.permissionGate.patterns;

  const allowedPatterns = compileCommandPatterns(
    config.permissionGate.allowedPatterns,
  );
  const autoDenyPatterns = compileCommandPatterns(
    config.permissionGate.autoDenyPatterns,
  );

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

    // Check dangerous patterns (structural + compiled)
    const match = findDangerousMatch(
      command,
      compiledPatterns,
      useBuiltinMatchers,
      fallbackPatterns,
    );
    if (!match) return;

    const { description, pattern: rawPattern } = match;

    // Emit dangerous event (presenter will play sound)
    emitDangerous(pi, { command, description, pattern: rawPattern });

    if (config.permissionGate.requireConfirmation) {
      // In print/RPC mode, block by default (safe fallback)
      if (!ctx.hasUI) {
        const reason = `Dangerous command blocked (no UI to confirm): ${description}`;
        emitBlocked(pi, {
          feature: "permissionGate",
          toolName: "bash",
          input: event.input,
          reason,
        });
        return { block: true, reason };
      }

      type ConfirmResult = "allow" | "allow-session" | "deny";

      const result = await ctx.ui.custom<ConfirmResult>(
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
            new Text(
              theme.fg(
                "dim",
                "y/enter: allow • a: allow for session • n/esc: deny",
              ),
              1,
              0,
            ),
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
              if (matchesKey(data, Key.enter) || data === "y" || data === "Y") {
                done("allow");
              } else if (data === "a" || data === "A") {
                done("allow-session");
              } else if (
                matchesKey(data, Key.escape) ||
                data === "n" ||
                data === "N"
              ) {
                done("deny");
              }
            },
          };
        },
      );

      if (result === "allow-session") {
        // Save command as allowed in memory scope (session-only).
        // Spread the resolved allowed patterns and append the new one.
        const resolved = configLoader.getConfig();
        await configLoader.save("memory", {
          permissionGate: {
            allowedPatterns: [
              ...resolved.permissionGate.allowedPatterns,
              { pattern: command },
            ],
          },
        });

        // Update the local cache so it takes effect immediately
        allowedPatterns.push(...compileCommandPatterns([{ pattern: command }]));
      }

      if (result === "deny") {
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
      ctx.ui.notify(`Dangerous command detected: ${description}`, "warning");
    }

    return;
  });
}
