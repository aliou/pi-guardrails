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
    ).resolves.toEqual([{ path: "config/locked.json", unresolved: false }]);
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
    ).resolves.toEqual([
      { path: join("config", "locked.json"), unresolved: false },
    ]);
  });

  it("flags bash targets built from shell variables as unresolved", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
    const policies = compilePolicies([
      {
        id: "secret-files",
        name: "Secret Files",
        patterns: [{ pattern: ".env" }],
        protection: "noAccess",
      },
    ]);

    // `head "$SC/.env"` — the `.env` basename still matches the policy even
    // though the leading segment is an unexpanded `$SC`.
    await expect(
      extractTargets(
        { toolName: "bash", input: { command: 'head -c 60 "$SC/.env"' } },
        cwd,
        policies,
      ),
    ).resolves.toEqual([{ path: "$SC/.env", unresolved: true }]);
  });

  it("ignores assignment words and still flags a later command's variable path", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
    const policies = compilePolicies([
      {
        id: "secret-files",
        name: "Secret Files",
        patterns: [{ pattern: ".env" }],
        protection: "noAccess",
      },
    ]);

    // `SC=...; head "$SC/.env"` — the leading assignment yields no target, but
    // the `.env` in the later command is still flagged as unresolved.
    await expect(
      extractTargets(
        {
          toolName: "bash",
          input: { command: 'SC="/srv/project"; head -c 60 "$SC/.env"' },
        },
        cwd,
        policies,
      ),
    ).resolves.toEqual([{ path: "$SC/.env", unresolved: true }]);
  });

  it("treats literal bash targets as resolved", async () => {
    const cwd = "/repo";
    vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
    const policies = compilePolicies([
      {
        id: "secret-files",
        name: "Secret Files",
        patterns: [{ pattern: ".env" }],
        protection: "noAccess",
      },
    ]);

    await expect(
      extractTargets(
        { toolName: "bash", input: { command: "head -c 60 .env" } },
        cwd,
        policies,
      ),
    ).resolves.toEqual([{ path: ".env", unresolved: false }]);
  });
});
