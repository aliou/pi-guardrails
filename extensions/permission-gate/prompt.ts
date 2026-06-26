import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";

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

export function createPermissionGateConfirmComponent(
  command: string,
  description: string,
) {
  return (
    tui: { terminal: { rows: number; columns: number }; requestRender(): void },
    theme: MinimalTheme,
    _kb: unknown,
    done: (result: "allow" | "allow-session" | "deny" | "stop") => void,
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
          "↑/↓ or j/k: scroll • y/enter: allow • a: session • n/esc: deny • s: decline & stop",
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
        } else if (data === "s" || data === "S") {
          done("stop");
        }
      },
    };
  };
}
