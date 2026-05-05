import {
  DynamicBorder,
  type ExtensionAPI,
  isToolCallEventType,
} from "@mariozechner/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";
import { checkDangerousCommand } from "../../../../src/core/commands";
import type { ResolvedConfig } from "../../config";
import { configLoader } from "../../config";
import { emitBlocked, emitDangerous } from "../../utils/events";
import { compileCommandPatterns } from "../../utils/matching";

/**
 * Permission gate that prompts user confirmation for dangerous commands.
 *
 * Built-in dangerous patterns are matched structurally via AST parsing.
 * User custom patterns use substring/regex matching on the raw string.
 * Allowed/auto-deny patterns match against the raw command string.
 */

interface MinimalTheme {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
}

interface NumberedWrappedRow {
  logicalLineNumber: number;
  rendered: string;
}

interface CommandViewportState {
  maxScrollOffset: number;
  pinnedRows: NumberedWrappedRow[];
  scrollWindowLines: number;
  scrollableRows: NumberedWrappedRow[];
}

const COMMAND_VIEWPORT_LINES = 12;

function buildNumberedWrappedLines(
  command: string,
  contentWidth: number,
  theme: Pick<MinimalTheme, "fg">,
): NumberedWrappedRow[] {
  const logicalLines = command.split("\n");
  const lineNumberWidth = Math.max(2, String(logicalLines.length).length);
  const prefixSpacing = 1;
  const textWidth = Math.max(1, contentWidth - lineNumberWidth - prefixSpacing);
  const rows: Array<{ logicalLineNumber: number; rendered: string }> = [];

  for (const [index, logicalLine] of logicalLines.entries()) {
    const lineNumber = index + 1;
    const wrapped = wrapTextWithAnsi(theme.fg("text", logicalLine), textWidth);
    const wrappedLines = wrapped.length > 0 ? wrapped : [""];
    const prefix = theme.fg(
      "dim",
      String(lineNumber).padStart(lineNumberWidth),
    );

    for (const line of wrappedLines) {
      rows.push({
        logicalLineNumber: lineNumber,
        rendered: `${prefix} ${line}`,
      });
    }
  }

  return rows;
}

function getCommandViewportState(
  command: string,
  contentWidth: number,
  theme: Pick<MinimalTheme, "fg">,
): CommandViewportState {
  const numberedRows = buildNumberedWrappedLines(command, contentWidth, theme);
  const pinnedRows = numberedRows.filter((row) => row.logicalLineNumber === 1);
  const scrollableRows = numberedRows.filter(
    (row) => row.logicalLineNumber !== 1,
  );
  const scrollWindowLines = Math.max(
    0,
    COMMAND_VIEWPORT_LINES - pinnedRows.length,
  );

  return {
    maxScrollOffset: Math.max(0, scrollableRows.length - scrollWindowLines),
    pinnedRows,
    scrollWindowLines,
    scrollableRows,
  };
}

function buildRightAlignedBorder(
  width: number,
  themeLine: (s: string) => string,
  label: string,
): string {
  const safeWidth = Math.max(1, width);
  const truncatedLabel = truncateToWidth(label, safeWidth);
  const remaining = safeWidth - visibleWidth(truncatedLabel);
  return themeLine("─".repeat(Math.max(0, remaining)) + truncatedLabel);
}

function createPermissionGateConfirmComponent(
  command: string,
  description: string,
) {
  return (
    tui: { terminal: { rows: number; columns: number }; requestRender(): void },
    theme: MinimalTheme,
    _kb: unknown,
    done: (result: "allow" | "allow-session" | "deny") => void,
  ) => {
    const container = new Container();
    const redBorder = (s: string) => theme.fg("error", s);
    const dimBorder = (s: string) => theme.fg("dim", s);
    let scrollOffset = 0;

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
    const commandTopBorder = new Text("", 0, 0);
    container.addChild(commandTopBorder);
    const commandText = new Text("", 1, 0);
    container.addChild(commandText);
    const commandBottomBorder = new Text("", 0, 0);
    container.addChild(commandBottomBorder);
    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("text", "Allow execution?"), 1, 0));
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "dim",
          "↑/↓ or j/k: scroll • y/enter: allow • a: session • n/esc: deny",
        ),
        1,
        0,
      ),
    );
    container.addChild(new DynamicBorder(redBorder));

    return {
      render: (width: number) => {
        const contentWidth = Math.max(1, width - 4);
        const {
          maxScrollOffset,
          pinnedRows,
          scrollWindowLines,
          scrollableRows,
        } = getCommandViewportState(command, contentWidth, theme);
        scrollOffset = Math.max(0, Math.min(scrollOffset, maxScrollOffset));

        const visibleScrollableRows = scrollableRows.slice(
          scrollOffset,
          scrollOffset + scrollWindowLines,
        );
        const visibleRows = [...pinnedRows, ...visibleScrollableRows];
        const linesBelow = Math.max(
          0,
          scrollableRows.length - (scrollOffset + visibleScrollableRows.length),
        );

        commandTopBorder.setText(
          buildRightAlignedBorder(
            width,
            dimBorder,
            scrollOffset > 0 ? `↑ ${scrollOffset} more` : "",
          ),
        );
        commandText.setText(visibleRows.map((row) => row.rendered).join("\n"));
        commandBottomBorder.setText(
          buildRightAlignedBorder(
            width,
            dimBorder,
            linesBelow > 0 ? `↓ ${linesBelow} more` : "",
          ),
        );
        return container.render(width);
      },
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        const contentWidth = Math.max(1, tui.terminal.columns - 4);
        const { maxScrollOffset } = getCommandViewportState(
          command,
          contentWidth,
          theme,
        );

        if (matchesKey(data, Key.up) || data === "k") {
          scrollOffset = Math.max(0, scrollOffset - 1);
          tui.requestRender();
        } else if (matchesKey(data, Key.down) || data === "j") {
          scrollOffset = Math.min(maxScrollOffset, scrollOffset + 1);
          tui.requestRender();
        } else if (
          matchesKey(data, Key.enter) ||
          data === "y" ||
          data === "Y"
        ) {
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
  };
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
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;

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
    const match = checkDangerousCommand({
      command,
      patterns: compiledPatterns,
      useBuiltinMatchers,
      fallbackPatterns,
    });
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

      // Fallback select options for RPC mode (ctx.ui.custom is unimplemented).
      const SELECT_ALLOW_ONCE = "Allow once";
      const SELECT_ALLOW_SESSION = "Allow for session";
      const SELECT_DENY = "Deny";
      const SELECT_OPTIONS = [
        SELECT_ALLOW_ONCE,
        SELECT_ALLOW_SESSION,
        SELECT_DENY,
      ] as const;

      let result = await ctx.ui.custom<ConfirmResult>(
        createPermissionGateConfirmComponent(command, description),
      );

      // Fallback: ctx.ui.custom() returns undefined in RPC/headless mode
      // (Pi's RPC runtime stubs it as `async custom() { return undefined; }`).
      // Fall back to ctx.ui.select() which works over the RPC protocol.
      // If select() also returns undefined/malformed, deny by default.
      if (result === undefined) {
        const selection = await ctx.ui.select(
          `Dangerous command: ${description}`,
          [...SELECT_OPTIONS],
        );
        if (selection === SELECT_ALLOW_ONCE) result = "allow";
        else if (selection === SELECT_ALLOW_SESSION) result = "allow-session";
        else result = "deny";
      }

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
