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

export interface PromptOption {
  label: string;
  result: PromptResult;
  /** Single-key shortcut that selects the option immediately. */
  key?: string;
}

export const FILE_OPTIONS: PromptOption[] = [
  { label: "Allow once", result: "allow-file-once", key: "o" },
  { label: "Allow file this session", result: "allow-file-session", key: "f" },
  { label: "Allow file always", result: "allow-file-always", key: "F" },
  {
    label: "Allow directory this session",
    result: "allow-dir-session",
    key: "d",
  },
  { label: "Allow directory always", result: "allow-dir-always", key: "D" },
  { label: "Deny", result: "deny" },
];

export const DIR_OPTIONS: PromptOption[] = [
  { label: "Allow once", result: "allow-dir-once", key: "o" },
  {
    label: "Allow directory this session",
    result: "allow-dir-session",
    key: "d",
  },
  { label: "Allow directory always", result: "allow-dir-always", key: "D" },
  { label: "Deny", result: "deny" },
];

/**
 * Options for the outside-path prompt for the given mode.
 * File tools and bash get file + directory options;
 * directory-oriented tools (ls, find) get directory-only options.
 * When the directory is not grantable (too broad, e.g. the filesystem root
 * or the home directory), directory grant options are omitted entirely.
 */
export function promptOptions(
  showFileOptions: boolean,
  dirGrantable = true,
  alwaysEnabled = true,
): (PromptOption & { disabled: boolean })[] {
  const options = showFileOptions ? FILE_OPTIONS : DIR_OPTIONS;
  return options
    .filter(
      (option) =>
        dirGrantable ||
        (option.result !== "allow-dir-session" &&
          option.result !== "allow-dir-always"),
    )
    .map((option) => ({
      ...option,
      disabled: !alwaysEnabled && option.result.endsWith("-always"),
    }));
}

const OPTION_INDENT = " ";

/**
 * Build the confirmation UI component.
 * For directory-oriented tools (ls, find): only directory grant options.
 * For file tools and bash: both file and directory options.
 * Options render one per row (selected = accent bg, unselected = dim),
 * navigable with arrows/Tab/Shift+Tab or selectable in one keypress via
 * the shortcut shown on each row.
 */
export function createPathAccessPromptComponent(
  toolName: string,
  displayPath: string,
  displayDir: string,
  cwd: string,
  showFileOptions: boolean,
  opts: {
    command?: string;
    dirGrantable?: boolean;
    alwaysEnabled?: boolean;
  } = {},
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
    const options = promptOptions(
      showFileOptions,
      opts.dirGrantable ?? true,
      opts.alwaysEnabled ?? true,
    );
    let selectedIndex = 0;
    let commandExpanded = false;
    let commandCanExpand = false;

    const container = new Container();
    const border = (s: string) => theme.fg("warning", s);
    const cwdDisplay = displayCwd(cwd);
    const normalizedCommand = opts.command
      ? normalizeCommand(opts.command)
      : "";

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

    const optionList: Component = {
      render: (width: number) => {
        const available = Math.max(1, width - visibleWidth(OPTION_INDENT));
        return options.map((option, index) => {
          const raw = ` ${option.key ?? " "} ${option.label}${option.disabled ? " (project not trusted)" : ""} `;
          const truncated = truncateVisibleEnd(raw, available);
          const styled =
            index === selectedIndex && !option.disabled
              ? theme.bg("selectedBg", theme.fg("accent", truncated))
              : theme.fg("dim", truncated);
          const pad = Math.max(0, available - visibleWidth(truncated));
          return `${OPTION_INDENT}${styled}${" ".repeat(pad)}`;
        });
      },
      invalidate: () => {},
    };
    container.addChild(optionList);
    if (options.some((option) => option.disabled)) {
      container.addChild(
        new Text(
          theme.fg(
            "dim",
            '"Always" grants are saved in this project\'s settings, which are ignored because this folder is not trusted. Use /trust and restart Pi to enable them.',
          ),
          1,
          0,
        ),
      );
    }

    container.addChild(new Spacer(1));
    const footerLine = new Text("", 1, 0);
    container.addChild(footerLine);

    const requestRender = () => {
      tui.requestRender();
    };

    const moveLinear = (direction: number) => {
      do {
        selectedIndex =
          (selectedIndex + direction + options.length) % options.length;
      } while (options[selectedIndex].disabled);
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
            ? "x collapse command"
            : "x expand command"
          : "";
        const shortcutHint = options
          .filter((option) => option.key && !option.disabled)
          .map((option) => option.key)
          .join("/");
        const hints = `↑/↓/Tab · Enter · ${shortcutHint} · Esc deny`;
        footerLine.setText(
          theme.fg(
            "dim",
            commandToggleHint ? `${hints}\n${commandToggleHint}` : hints,
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
        const shortcut = options.find(
          (option) => option.key === data && !option.disabled,
        );
        if (shortcut) {
          done(shortcut.result);
          return;
        }
        if (matchesKey(data, Key.enter) && !options[selectedIndex].disabled) {
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
