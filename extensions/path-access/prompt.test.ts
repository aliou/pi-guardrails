import { describe, expect, it, vi } from "vitest";
import { createPathAccessPromptComponent } from "./prompt";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function renderPrompt(command?: string, width = 100): string[] {
  const component = createPathAccessPromptComponent(
    "bash",
    "/outside/secret.txt",
    "/outside",
    "/workspace",
    true,
    { command },
  );

  return component(
    { terminal: { columns: width }, requestRender: vi.fn() },
    theme,
    undefined,
    vi.fn(),
  ).render(width);
}

function createPrompt(
  width = 100,
  command?: string,
  opts: { showFileOptions?: boolean; dirGrantable?: boolean } = {},
) {
  const done = vi.fn();
  const requestRender = vi.fn();
  const component = createPathAccessPromptComponent(
    opts.showFileOptions === false ? "ls" : "bash",
    "/outside/secret.txt",
    "/outside",
    "/workspace",
    opts.showFileOptions !== false,
    { command, dirGrantable: opts.dirGrantable },
  );
  const prompt = component(
    { terminal: { columns: width }, requestRender },
    theme,
    undefined,
    done,
  );

  prompt.render(width);
  return { done, prompt, requestRender };
}

describe("createPathAccessPromptComponent", () => {
  it("shows the command when provided", () => {
    expect(renderPrompt("cat /outside/secret.txt").join("\n")).toContain(
      "Command: cat /outside/secret.txt",
    );
  });

  it("omits the command row when not provided", () => {
    expect(renderPrompt().join("\n")).not.toContain("Command:");
  });

  it("truncates long commands to fit the prompt width", () => {
    const lines = renderPrompt(
      "cat /outside/very/long/path/that/keeps/going/target.txt",
      48,
    );
    const commandLine = lines.find((line) => line.includes("Command:"));

    expect(commandLine).toContain("…");
    expect(commandLine).not.toContain("target.txt");
  });

  it("shows the command expand shortcut only when truncated", () => {
    expect(
      renderPrompt("cat /outside/secret.txt", 100).join("\n"),
    ).not.toContain("expand command");

    expect(
      renderPrompt(
        "cat /outside/very/long/path/that/keeps/going/target.txt",
        48,
      ).join("\n"),
    ).toContain("x expand command");
  });

  it("expands truncated commands into wrapped full text", () => {
    const command =
      "python -c 'print(1)' && cat /outside/very/long/path/that/keeps/going/target.txt";
    const { prompt } = createPrompt(88, command);

    expect(prompt.render(88).join("\n")).not.toContain("target.txt");
    prompt.handleInput?.("x");

    const expanded = prompt.render(88).join("\n");
    expect(expanded).toContain("target.txt");
    expect(expanded).toContain("x collapse command");
  });

  it("collapses multi-line commands to a single row", () => {
    const lines = renderPrompt("printf 'a'\ncat\t/outside/secret.txt");
    const commandLines = lines.filter((line) => line.includes("Command:"));

    expect(commandLines).toHaveLength(1);
    expect(commandLines[0]).toContain("printf 'a' ⏎ cat /outside/secret.txt");
  });

  it("escapes terminal control characters in commands", () => {
    const lines = renderPrompt("printf '\u001B]52;c;bad\u0007'");
    const commandLine = lines.find((line) => line.includes("Command:"));

    expect(commandLine).toContain("␛]52;c;bad�");
    expect(commandLine).not.toContain("\u001B");
    expect(commandLine).not.toContain("\u0007");
  });

  it("renders one option per row with its shortcut", () => {
    const lines = renderPrompt("cat /outside/secret.txt", 100);
    const optionLines = lines.filter(
      (line) => line.includes("Allow") || line.includes("Deny"),
    );

    expect(optionLines.map((line) => line.replace(/│/g, "").trim())).toEqual([
      "o Allow once",
      "f Allow file this session",
      "F Allow file always",
      "d Allow directory this session",
      "D Allow directory always",
      "Deny",
    ]);
  });

  it("renders one option per row when narrow", () => {
    const lines = renderPrompt("cat /outside/secret.txt", 48);
    const fileRow = lines.find((line) =>
      line.includes("Allow file this session"),
    );

    expect(fileRow).not.toContain("Allow file always");
  });

  it("omits directory grants when the directory is not grantable", () => {
    const { prompt } = createPrompt(100, "cat /secret.txt", {
      dirGrantable: false,
    });
    const lines = prompt.render(100).join("\n");

    expect(lines).toContain("Allow once");
    expect(lines).toContain("Allow file this session");
    expect(lines).toContain("Deny");
    expect(lines).not.toContain("Allow directory");
  });

  it("reduces to allow-once and deny for an ungrantable directory target", () => {
    const { prompt } = createPrompt(100, undefined, {
      showFileOptions: false,
      dirGrantable: false,
    });
    const lines = prompt.render(100).join("\n");

    expect(lines).toContain("Allow once");
    expect(lines).toContain("Deny");
    expect(lines).not.toContain("Allow directory");
  });

  it.each([
    { key: "o", result: "allow-file-once" },
    { key: "f", result: "allow-file-session" },
    { key: "F", result: "allow-file-always" },
    { key: "d", result: "allow-dir-session" },
    { key: "D", result: "allow-dir-always" },
  ])("selects $result with the $key shortcut", ({ key, result }) => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.(key);

    expect(done).toHaveBeenCalledWith(result);
  });

  it("ignores shortcuts for omitted directory grants", () => {
    const { done, prompt } = createPrompt(100, "ls /", {
      dirGrantable: false,
    });

    prompt.handleInput?.("d");
    prompt.handleInput?.("D");

    expect(done).not.toHaveBeenCalled();
  });

  it("keeps tab navigation linear", () => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.("\t");
    prompt.handleInput?.("\r");

    expect(done).toHaveBeenCalledWith("allow-file-session");
  });

  it("moves right to the next option", () => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.("\x1b[C");
    prompt.handleInput?.("\r");

    expect(done).toHaveBeenCalledWith("allow-file-session");
  });

  it("moves left to the previous option", () => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.("\x1b[D");
    prompt.handleInput?.("\r");

    expect(done).toHaveBeenCalledWith("deny");
  });

  it("moves down to the next option", () => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.("\x1b[B");
    prompt.handleInput?.("\r");

    expect(done).toHaveBeenCalledWith("allow-file-session");
  });

  it("moves up to the previous option", () => {
    const { done, prompt } = createPrompt();

    prompt.handleInput?.("\x1b[A");
    prompt.handleInput?.("\r");

    expect(done).toHaveBeenCalledWith("deny");
  });
});
