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
    command,
  );

  return component(
    { terminal: { columns: width }, requestRender: vi.fn() },
    theme,
    undefined,
    vi.fn(),
  ).render(width);
}

function createPrompt(width = 100, command = "cat /outside/secret.txt") {
  const done = vi.fn();
  const requestRender = vi.fn();
  const component = createPathAccessPromptComponent(
    "bash",
    "/outside/secret.txt",
    "/outside",
    "/workspace",
    true,
    command,
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
});
