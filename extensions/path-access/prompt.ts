import { homedir } from "node:os";
import {
  type Component,
  Container,
  Key,
  matchesKey,
  Spacer,
  Text,
  visibleWidth,
} from "@earendil-works/pi-tui";

// Grant result type from the UI prompt
export type PromptResult =
  | "allow-file-once"
  | "allow-dir-once"
  | "allow-file-session"
  | "allow-dir-session"
  | "allow-file-always"
  | "allow-dir-always"
  | "deny";

/**
 * Collapse home directory to ~ for display.
 */
function displayCwd(cwd: string): string {
  const home = homedir();
  if (cwd === home) return "~";
  if (cwd.startsWith(`${home}/`) || cwd.startsWith(`${home}\\`)) {
    return `~${cwd.slice(home.length)}`;
  }
  return cwd;
}

const MAX_COMMAND_DISPLAY_WIDTH = 500;
const ELLIPSIS = "…";

function truncateVisibleEnd(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (visibleWidth(text) <= maxWidth) return text;
  if (maxWidth <= visibleWidth(ELLIPSIS)) return ELLIPSIS;

  let result = "";
  for (const char of Array.from(text)) {
    if (visibleWidth(`${result}${char}${ELLIPSIS}`) > maxWidth) break;
    result += char;
  }

  return `${result}${ELLIPSIS}`;
}

function normalizeCommand(command: string): string {
  const collapsed = command
    .replace(/\r\n/g, "\n")
    .replace(/[\r\n]+/g, " ⏎ ")
    .replace(/\t+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

  let safe = "";
  for (const char of collapsed) {
    const code = char.charCodeAt(0);
    if (code === 0x1b) {
      safe += "␛";
    } else if (code <= 0x1f || code === 0x7f) {
      safe += "�";
    } else {
      safe += char;
    }
  }

  return safe;
}

interface CommandRow {
  text: string;
  truncated: boolean;
}

function collapsedCommandRow(
  command: string,
  contentWidth: number,
): CommandRow {
  const prefix = "  Command: ";
  if (visibleWidth(prefix) >= contentWidth) {
    return { text: truncateVisibleEnd(prefix, contentWidth), truncated: true };
  }

  const capped = truncateVisibleEnd(command, MAX_COMMAND_DISPLAY_WIDTH);
  const commandWidth = Math.max(0, contentWidth - visibleWidth(prefix));
  const text = `${prefix}${truncateVisibleEnd(capped, commandWidth)}`;

  return {
    text,
    truncated:
      visibleWidth(command) > MAX_COMMAND_DISPLAY_WIDTH ||
      visibleWidth(command) > commandWidth,
  };
}

function expandedCommandRow(command: string): string {
  return `  Command: ${command}`;
}

interface PromptOption {
  label: string;
  result: PromptResult;
}

const FILE_OPTIONS: PromptOption[] = [
  { label: "Allow once", result: "allow-file-once" },
  { label: "Allow file this session", result: "allow-file-session" },
  { label: "Allow file always", result: "allow-file-always" },
  { label: "Allow directory this session", result: "allow-dir-session" },
  { label: "Allow directory always", result: "allow-dir-always" },
  { label: "Deny", result: "deny" },
];

const DIR_OPTIONS: PromptOption[] = [
  { label: "Allow once", result: "allow-dir-once" },
  { label: "Allow directory this session", result: "allow-dir-session" },
  { label: "Allow directory always", result: "allow-dir-always" },
  { label: "Deny", result: "deny" },
];

const OPTION_INDENT = " ";
const OPTION_COLUMN_GAP = 4;

interface OptionLayout {
  rows: number[][];
  columnWidths: number[];
}

function naturalOptionWidth(option: PromptOption): number {
  return visibleWidth(option.label) + 2;
}

function oneColumnRows(options: PromptOption[]): number[][] {
  return options.map((_, index) => [index]);
}

function compactRows(options: PromptOption[]): number[][] {
  if (options.length === FILE_OPTIONS.length) return [[0], [1, 2], [3, 4], [5]];
  if (options.length === DIR_OPTIONS.length) return [[0], [1, 2], [3]];
  return oneColumnRows(options);
}

function optionColumnWidths(
  options: PromptOption[],
  rows: number[][],
): number[] {
  const widths: number[] = [];
  for (const row of rows) {
    for (let column = 0; column < row.length; column++) {
      const option = options[row[column]];
      if (!option) continue;
      widths[column] = Math.max(
        widths[column] ?? 0,
        naturalOptionWidth(option),
      );
    }
  }
  return widths;
}

function layoutWidth(layout: OptionLayout): number {
  const columnsWidth = layout.columnWidths.reduce(
    (sum, width) => sum + width,
    0,
  );
  const gapsWidth =
    Math.max(0, layout.columnWidths.length - 1) * OPTION_COLUMN_GAP;
  return visibleWidth(OPTION_INDENT) + columnsWidth + gapsWidth;
}

function createOptionLayout(
  options: PromptOption[],
  width: number,
): OptionLayout {
  const availableWidth = Math.max(1, width - visibleWidth(OPTION_INDENT));
  const compact = {
    rows: compactRows(options),
    columnWidths: optionColumnWidths(options, compactRows(options)),
  };

  if (
    compact.rows.some((row) => row.length > 1) &&
    layoutWidth(compact) <= width
  ) {
    return compact;
  }

  return {
    rows: oneColumnRows(options),
    columnWidths: [
      Math.min(
        availableWidth,
        Math.max(...options.map((option) => naturalOptionWidth(option))),
      ),
    ],
  };
}

/**
 * Build the confirmation UI component.
 * For directory-oriented tools (ls, find): only directory grant options.
 * For file tools and bash: both file and directory options.
 * Options rendered as highlighted tabs (selected = accent bg, unselected = dim),
 * navigable linearly with arrows/Tab/Shift+Tab.
 */
export function createPathAccessPromptComponent(
  toolName: string,
  displayPath: string,
  displayDir: string,
  cwd: string,
  showFileOptions: boolean,
  command?: string,
) {
  return (
    tui: { terminal: { columns: number }; requestRender(): void },
    theme: {
      fg(color: string, text: string): string;
      bg(color: string, text: string): string;
      bold(text: string): string;
    },
    _kb: unknown,
    done: (result: PromptResult) => void,
  ) => {
    const options = showFileOptions ? FILE_OPTIONS : DIR_OPTIONS;
    let selectedIndex = 0;
    let optionLayout = createOptionLayout(options, tui.terminal.columns);
    let commandExpanded = false;
    let commandCanExpand = false;

    const container = new Container();
    const border = (s: string) => theme.fg("warning", s);
    const cwdDisplay = displayCwd(cwd);
    const normalizedCommand = command ? normalizeCommand(command) : "";

    container.addChild(
      new Text(
        theme.fg("warning", theme.bold("Outside Workspace Access")),
        1,
        0,
      ),
    );
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg(
          "text",
          `\`${toolName}\` targets a path outside the working directory.`,
        ),
        1,
        0,
      ),
    );
    const commandLine = normalizedCommand
      ? new Text(theme.fg("dim", ""), 1, 0)
      : undefined;
    if (commandLine) {
      container.addChild(commandLine);
    }
    container.addChild(new Spacer(1));
    container.addChild(
      new Text(theme.fg("dim", `  Cwd:  ${cwdDisplay}`), 1, 0),
    );
    container.addChild(
      new Text(theme.fg("dim", `  Path: ${displayPath}`), 1, 0),
    );
    container.addChild(
      new Text(theme.fg("dim", `  Dir:  ${displayDir}`), 1, 0),
    );
    container.addChild(new Spacer(1));

    const optionGrid: Component = {
      render: (width: number) => {
        optionLayout = createOptionLayout(options, width);
        return optionLayout.rows.map((row) => {
          const cells = row.map((optionIndex, column) => {
            const option = options[optionIndex];
            const cellWidth = optionLayout.columnWidths[column] ?? 1;
            const labelWidth = Math.max(1, cellWidth - 2);
            const label = truncateVisibleEnd(option.label, labelWidth);
            const raw = ` ${label} `;
            const pad = Math.max(0, cellWidth - visibleWidth(raw));
            const styled =
              optionIndex === selectedIndex
                ? theme.bg("selectedBg", theme.fg("accent", raw))
                : theme.fg("dim", raw);

            return `${styled}${" ".repeat(pad)}`;
          });

          return `${OPTION_INDENT}${cells.join(" ".repeat(OPTION_COLUMN_GAP))}`;
        });
      },
      invalidate: () => {},
    };
    container.addChild(optionGrid);

    container.addChild(new Spacer(1));
    const footerLine = new Text("", 1, 0);
    container.addChild(footerLine);

    const requestRender = () => {
      tui.requestRender();
    };

    const moveLinear = (direction: number) => {
      selectedIndex =
        (selectedIndex + direction + options.length) % options.length;
      requestRender();
    };

    return {
      render: (width: number) => {
        const innerWidth = Math.max(1, width - 2);
        const contentWidth = Math.max(1, width - 4);
        const textContentWidth = Math.max(1, contentWidth - 2);
        if (commandLine) {
          const collapsed = collapsedCommandRow(
            normalizedCommand,
            textContentWidth,
          );
          commandCanExpand = collapsed.truncated;
          commandLine.setText(
            theme.fg(
              "dim",
              commandExpanded
                ? expandedCommandRow(normalizedCommand)
                : collapsed.text,
            ),
          );
        }
        const commandToggleHint = commandCanExpand
          ? commandExpanded
            ? " · x collapse command"
            : " · x expand command"
          : "";
        footerLine.setText(
          theme.fg(
            "dim",
            `←/→/↑/↓/Tab select · Enter select · Esc deny${commandToggleHint}`,
          ),
        );
        const raw = container.render(contentWidth);
        const top = border(`╭${"─".repeat(innerWidth)}╮`);
        const bottom = border(`╰${"─".repeat(innerWidth)}╯`);
        const left = border("│");
        const right = border("│");
        const lines = raw.map((line) => {
          const visible = visibleWidth(line);
          const pad = Math.max(0, contentWidth - visible);
          return `${left} ${line}${" ".repeat(pad)} ${right}`;
        });
        return [top, ...lines, bottom];
      },
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (
          matchesKey(data, Key.up) ||
          matchesKey(data, Key.left) ||
          data === "k" ||
          data === "h"
        ) {
          moveLinear(-1);
          return;
        }
        if (
          matchesKey(data, Key.down) ||
          matchesKey(data, Key.right) ||
          data === "j" ||
          data === "l"
        ) {
          moveLinear(1);
          return;
        }
        if (matchesKey(data, Key.shift("tab"))) {
          moveLinear(-1);
          return;
        }
        if (matchesKey(data, Key.tab)) {
          moveLinear(1);
          return;
        }
        if ((data === "x" || data === "X") && commandCanExpand) {
          commandExpanded = !commandExpanded;
          requestRender();
          return;
        }
        if (matchesKey(data, Key.enter)) {
          done(options[selectedIndex].result);
          return;
        }
        if (matchesKey(data, Key.escape)) {
          done("deny");
        }
      },
    };
  };
}
