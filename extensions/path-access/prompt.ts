import { homedir } from "node:os";
import {
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

/**
 * Build the confirmation UI component.
 * For directory-oriented tools (ls, find): only directory grant options.
 * For file tools and bash: both file and directory options.
 * Options rendered as highlighted tabs (selected = accent bg, unselected = dim),
 * navigable with ←/→/Tab/Shift+Tab.
 */
export function createPathAccessPromptComponent(
  toolName: string,
  displayPath: string,
  displayDir: string,
  cwd: string,
  showFileOptions: boolean,
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

    const container = new Container();
    const border = (s: string) => theme.fg("warning", s);
    const cwdDisplay = displayCwd(cwd);

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

    // Dynamically rendered option lines
    const optionLines: Text[] = options.map(() => new Text("", 1, 0));
    for (const line of optionLines) {
      container.addChild(line);
    }

    container.addChild(new Spacer(1));
    container.addChild(
      new Text(
        theme.fg("dim", "↑/↓/Tab select · Enter select · Esc deny"),
        1,
        0,
      ),
    );

    const renderOptions = () => {
      for (let i = 0; i < options.length; i++) {
        const label = options[i].label;
        if (i === selectedIndex) {
          optionLines[i].setText(
            theme.bg("selectedBg", theme.fg("accent", ` ${label} `)),
          );
        } else {
          optionLines[i].setText(theme.fg("dim", ` ${label} `));
        }
      }
    };

    renderOptions();

    const moveSelection = (direction: number) => {
      selectedIndex =
        (selectedIndex + direction + options.length) % options.length;
      renderOptions();
      tui.requestRender();
    };

    return {
      render: (width: number) => {
        const innerWidth = Math.max(1, width - 2);
        const contentWidth = Math.max(1, width - 4);
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
          data === "k" ||
          matchesKey(data, Key.shift("tab"))
        ) {
          moveSelection(-1);
          return;
        }
        if (
          matchesKey(data, Key.down) ||
          data === "j" ||
          matchesKey(data, Key.tab)
        ) {
          moveSelection(1);
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
