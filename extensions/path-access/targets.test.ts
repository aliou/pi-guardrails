import { join } from "node:path";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { targetsForTool } from "./targets";

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

  it("filters configured ignored bash args", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/README.md": "hello" });

    await expect(
      targetsForTool(
        "bash",
        { command: "tool docs /library/id ./README.md" },
        cwd,
        [
          {
            command: "tool",
            subcommands: ["docs"],
            argPattern: "^/library/",
            regex: true,
          },
        ],
      ),
    ).resolves.toEqual([join(cwd, "README.md")]);
  });

  it("does not apply ignored bash args to direct file tools", async () => {
    await expect(
      targetsForTool("read", { path: "/library/id" }, "/repo", [
        { command: "read", argPattern: "^/library/", regex: true },
      ]),
    ).resolves.toEqual(["/library/id"]);
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
