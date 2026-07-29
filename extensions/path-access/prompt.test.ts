import { describe, expect, it } from "vitest";
import { createPathAccessPromptComponent } from "./prompt";

describe("createPathAccessPromptComponent", () => {
  it("should render command when provided", () => {
    const mockTui = {
      terminal: { columns: 80 },
      requestRender: () => {},
    };
    const mockTheme = {
      fg: (color: string, text: string) => text,
      bg: (color: string, text: string) => text,
      bold: (text: string) => text,
    };
    const mockDone = () => {};

    const component = createPathAccessPromptComponent(
      "read",
      "/outside/file.txt",
      "/outside",
      "/workspace",
      true,
      "read /outside/file.txt",
    );

    const result = component(mockTui, mockTheme, {}, mockDone);
    const rendered = result.render(80);

    // Check that the command is included in the rendered output
    expect(rendered.join("\n")).toContain("Command:");
    expect(rendered.join("\n")).toContain("read /outside/file.txt");
  });

  it("should not render command section when not provided", () => {
    const mockTui = {
      terminal: { columns: 80 },
      requestRender: () => {},
    };
    const mockTheme = {
      fg: (color: string, text: string) => text,
      bg: (color: string, text: string) => text,
      bold: (text: string) => text,
    };
    const mockDone = () => {};

    const component = createPathAccessPromptComponent(
      "read",
      "/outside/file.txt",
      "/outside",
      "/workspace",
      true,
      undefined,
    );

    const result = component(mockTui, mockTheme, {}, mockDone);
    const rendered = result.render(80);

    // Check that there's no command section when command is not provided
    const fullOutput = rendered.join("\n");
    expect(fullOutput).toContain("Outside Workspace Access");
    expect(fullOutput).toContain("Cwd:");
    expect(fullOutput).toContain("Path:");
  });
});