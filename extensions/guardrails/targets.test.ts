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

  it("extracts redirect targets attached to compound commands", async () => {
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

    // @aliou/sh ≤0.2.2 surfaced compound trailing redirects as an anonymous
    // SimpleCommand; 0.3.x attaches them to the compound node. Either way the
    // target must still surface.
    for (const command of [
      "{ echo hi; } > .env",
      "( echo hi ) > .env",
      "if true; then echo hi; fi > .env",
    ]) {
      await expect(
        extractTargets({ toolName: "bash", input: { command } }, cwd, policies),
      ).resolves.toEqual([{ path: ".env", unresolved: false }]);
    }
  });

  it("does not extract file-descriptor duplication targets", async () => {
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

    for (const command of [
      "echo hi 2>&1",
      "echo hi 1>&2",
      "echo hi 3>&-",
      "cat .env 3<&0",
    ]) {
      const result = await extractTargets(
        { toolName: "bash", input: { command } },
        cwd,
        policies,
      );
      // Only the .env in `cat .env 3<&0` matches; `0`/`1`/`-` never become
      // targets.
      if (command.startsWith("cat")) {
        expect(result).toEqual([{ path: ".env", unresolved: false }]);
      } else {
        expect(result).toEqual([]);
      }
    }
  });

  describe("protected names passed as text-only argv", () => {
    const cwd = "/repo";
    const policies = () =>
      compilePolicies([
        {
          id: "secret-files",
          name: "Secret Files",
          patterns: [{ pattern: ".env" }],
          protection: "noAccess",
        },
      ]);

    it("does not treat a printf argument as a file target", async () => {
      vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
      await expect(
        extractTargets(
          { toolName: "bash", input: { command: "printf '%s\\n' '.env'" } },
          cwd,
          policies(),
        ),
      ).resolves.toEqual([]);
    });

    it("does not treat an echoed string as a file target", async () => {
      vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
      await expect(
        extractTargets(
          { toolName: "bash", input: { command: "echo .env | wc -c" } },
          cwd,
          policies(),
        ),
      ).resolves.toEqual([]);
    });

    it("still blocks reading .env as a file operand", async () => {
      vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
      await expect(
        extractTargets(
          { toolName: "bash", input: { command: "cat .env" } },
          cwd,
          policies(),
        ),
      ).resolves.toEqual([{ path: ".env", unresolved: false }]);
    });

    it("still blocks writing .env through a redirect on a text-only command", async () => {
      vol.fromJSON({ "/repo/.env": "TOKEN=secret" });
      await expect(
        extractTargets(
          { toolName: "bash", input: { command: "printf '%s\\n' x > .env" } },
          cwd,
          policies(),
        ),
      ).resolves.toEqual([{ path: ".env", unresolved: false }]);
    });
  });
});
