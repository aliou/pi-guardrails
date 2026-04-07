/**
 * Shared confirmation UI components for guardrails.
 *
 * Used by permissionGate and policies with askConfirmation enabled.
 */

import {
  DynamicBorder,
  getMarkdownTheme,
  type KeybindingsManager,
  type Theme,
} from "@mariozechner/pi-coding-agent";
import {
  Box,
  Container,
  Key,
  Markdown,
  matchesKey,
  Spacer,
  Text,
  type TUI,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@mariozechner/pi-tui";

export type ConfirmResult = "allow" | "allow-session" | "deny";

interface Explanation {
  text: string;
  modelName: string;
  modelId: string;
  provider: string;
}

interface ConfirmationOptions {
  title: string;
  subtitle?: string;
  detailText: string;
  explanation?: Explanation | null;
  promptText: string;
  borderColor?: "error" | "warning";
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
  theme: Pick<Theme, "fg">,
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
  theme: Pick<Theme, "fg">,
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

/**
 * Create a confirmation UI handler for dangerous actions.
 * Returns a factory function compatible with ctx.ui.custom()
 */
export function createConfirmationUI(options: ConfirmationOptions) {
  const {
    title,
    subtitle,
    detailText,
    explanation,
    promptText,
    borderColor = "error",
  } = options;

  return (
    tui: TUI,
    theme: Theme,
    _kb: KeybindingsManager,
    done: (result: ConfirmResult) => void,
  ) => {
    const container = new Container();
    const borderFn =
      borderColor === "error"
        ? (s: string) => theme.fg("error", s)
        : (s: string) => theme.fg("warning", s);
    const dimBorder = (s: string) => theme.fg("dim", s);
    let scrollOffset = 0;

    if (explanation) {
      const explanationBox = new Box(1, 1, (s: string) =>
        theme.bg("customMessageBg", s),
      );
      explanationBox.addChild(
        new Text(
          theme.fg(
            "accent",
            theme.bold(
              `Model explanation (${explanation.modelName} / ${explanation.modelId} / ${explanation.provider})`,
            ),
          ),
          0,
          0,
        ),
      );
      explanationBox.addChild(new Spacer(1));
      explanationBox.addChild(
        new Markdown(explanation.text, 0, 0, getMarkdownTheme(), {
          color: (s: string) => theme.fg("text", s),
        }),
      );
      container.addChild(explanationBox);
    }

    container.addChild(new DynamicBorder(borderFn));
    container.addChild(
      new Text(theme.fg(borderColor, theme.bold(title)), 1, 0),
    );

    if (subtitle) {
      container.addChild(new Spacer(1));
      container.addChild(new Text(theme.fg("warning", subtitle), 1, 0));
    }

    container.addChild(new Spacer(1));

    const commandTopBorder = new Text("", 0, 0);
    container.addChild(commandTopBorder);
    const commandText = new Text("", 1, 0);
    container.addChild(commandText);
    const commandBottomBorder = new Text("", 0, 0);
    container.addChild(commandBottomBorder);

    container.addChild(new Spacer(1));
    container.addChild(new Text(theme.fg("text", promptText), 1, 0));
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
    container.addChild(new DynamicBorder(borderFn));

    return {
      render: (width: number) => {
        const contentWidth = Math.max(1, width - 4);
        const {
          maxScrollOffset,
          pinnedRows,
          scrollWindowLines,
          scrollableRows,
        } = getCommandViewportState(detailText, contentWidth, theme);
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
          detailText,
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
