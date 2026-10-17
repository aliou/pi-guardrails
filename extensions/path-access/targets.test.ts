import { join } from "node:path";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { isReadOnlyTool, targetsForTool } from "./targets";

describe("targetsForTool", () => {
  it("resolves direct file tool targets from cwd", async () => {
    await expect(
      targetsForTool("read", { path: "README.md" }, "/repo"),
    ).resolves.toEqual(["/repo/README.md"]);
  });

  it("extracts bash path candidates", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/README.md": "hello" });

    await expect(
      targetsForTool("bash", { command: "cat ./README.md" }, cwd),
    ).resolves.toEqual([join(cwd, "README.md")]);
  });

  it("extracts paths from PowerShell command strings", async () => {
    const path = "/home/user/.pi/agent/AGENTS.md";
    vol.fromJSON({ [path]: "# global" });

    await expect(
      targetsForTool(
        "bash",
        {
          command: `powershell -Command "Get-Content -Path '${path}' -TotalCount 1"`,
        },
        "/repo",
      ),
    ).resolves.toEqual([path]);
  });

  it("extracts paths from Python command strings", async () => {
    const path = "/home/user/.pi/agent/AGENTS.md";
    vol.fromJSON({ [path]: "# global" });

    await expect(
      targetsForTool(
        "bash",
        { command: `python3 -c 'open("${path}").read()'` },
        "/repo",
      ),
    ).resolves.toEqual([path]);
  });

  it("does not treat awk regexes as paths", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/test.txt": "aaa" });

    await expect(
      targetsForTool(
        "bash",
        { command: "awk '/aaa/{flag=1} flag{print}' ./test.txt" },
        cwd,
      ),
    ).resolves.toEqual([join(cwd, "test.txt")]);
  });

  it("ignores unrelated tools", async () => {
    await expect(
      targetsForTool("custom", { path: "README.md" }, "/repo"),
    ).resolves.toEqual([]);
  });
});

describe("isReadOnlyTool", () => {
  it("classifies read-only tools", () => {
    for (const tool of ["read", "grep", "find", "ls"]) {
      expect(isReadOnlyTool(tool)).toBe(true);
    }
  });

  it("never treats write-capable tools as read-only", () => {
    for (const tool of ["write", "edit", "bash", "custom"]) {
      expect(isReadOnlyTool(tool)).toBe(false);
    }
  });
});
