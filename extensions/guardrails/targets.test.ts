import { join } from "node:path";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { compilePolicies } from "./rules";
import { extractTargets } from "./targets";

describe("extractTargets", () => {
  it("returns direct file tool targets", async () => {
    await expect(
      extractTargets(
        { toolName: "read", input: { path: "config/locked.json" } },
        "/repo",
        [],
      ),
    ).resolves.toEqual(["config/locked.json"]);
  });

  it("extracts only bash targets matching configured policies", async () => {
    const cwd = "/repo";
    vol.fromJSON({
      "/repo/config/locked.json": "{}",
      "/repo/README.md": "hello",
    });
    const policies = compilePolicies([
      {
        id: "locked",
        name: "Locked",
        patterns: [{ pattern: "config/locked.json" }],
        protection: "readOnly",
      },
    ]);

    await expect(
      extractTargets(
        {
          toolName: "bash",
          input: { command: "cat README.md config/locked.json" },
        },
        cwd,
        policies,
      ),
    ).resolves.toEqual([join("config", "locked.json")]);
  });
});
