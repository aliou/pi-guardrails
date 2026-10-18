import { join } from "node:path";
import { vol } from "memfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  candidateTargetForms,
  compilePolicies,
  createPolicyRules,
  normalizeTarget,
} from "./rules";
import { extractTargets } from "./targets";

function singleRule(
  cwd: string,
  policy: Parameters<typeof compilePolicies>[0][number],
) {
  const [rule] = createPolicyRules(compilePolicies([policy]), cwd);
  return rule;
}

describe("normalizeTarget", () => {
  it("prefers cwd-relative paths for targets inside cwd", () => {
    const cwd = "/repo";
    expect(normalizeTarget("/repo/config/locked.json", cwd)).toBe(
      "config/locked.json",
    );
  });
});

describe("candidateTargetForms", () => {
  const home = "/home/dev";
  const cwd = join(home, "work", "app");

  beforeEach(() => {
    vi.stubEnv("HOME", home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists cwd-relative, tilde, and absolute forms for an in-cwd under-$HOME target", () => {
    expect(candidateTargetForms("foo.txt", cwd)).toEqual([
      "foo.txt",
      "~/work/app/foo.txt",
      "/home/dev/work/app/foo.txt",
    ]);
  });

  it("lists tilde and absolute forms for an outside-cwd under-$HOME target", () => {
    expect(candidateTargetForms("~/work/other/foo.txt", cwd)).toEqual([
      "~/work/other/foo.txt",
      "/home/dev/work/other/foo.txt",
    ]);
  });

  it("lists only the absolute form outside the cwd and $HOME", () => {
    expect(candidateTargetForms("/etc/hosts", cwd)).toEqual(["/etc/hosts"]);
  });
});

describe("compilePolicies", () => {
  it("skips disabled and empty rules", () => {
    const policies = compilePolicies([
      {
        id: "disabled",
        name: "Disabled",
        enabled: false,
        patterns: [{ pattern: "*.env" }],
        protection: "noAccess",
      },
      { id: "empty", name: "Empty", patterns: [], protection: "noAccess" },
      {
        id: "active",
        name: "Active",
        patterns: [{ pattern: "*.env" }],
        protection: "readOnly",
      },
    ]);

    expect(policies.map((policy) => policy.id)).toEqual(["active"]);
  });
});

describe("createPolicyRules", () => {
  const cwd = "/repo";

  it("matches protected files and returns policy metadata", async () => {
    vol.fromJSON({ "/repo/.env": "SECRET=1" });
    const rule = singleRule(cwd, {
      id: "secrets",
      name: "Secrets",
      patterns: [{ pattern: ".env" }],
      protection: "noAccess",
    });

    await expect(
      rule.check({ kind: "file", path: join(cwd, ".env") }),
    ).resolves.toMatchObject({
      kind: "match",
      metadata: { ruleId: "secrets", protection: "noAccess", path: ".env" },
    });
  });

  it("passes allowed patterns", async () => {
    vol.fromJSON({ "/repo/.env.example": "SECRET=" });
    const rule = singleRule(cwd, {
      id: "secrets",
      name: "Secrets",
      patterns: [{ pattern: ".env*" }],
      allowedPatterns: [{ pattern: ".env.example" }],
      protection: "noAccess",
    });

    await expect(
      rule.check({ kind: "file", path: join(cwd, ".env.example") }),
    ).resolves.toEqual({ kind: "pass" });
  });

  it("passes missing files when onlyIfExists is true", async () => {
    const rule = singleRule(cwd, {
      id: "secrets",
      name: "Secrets",
      patterns: [{ pattern: ".env" }],
      protection: "noAccess",
    });

    await expect(
      rule.check({ kind: "file", path: join(cwd, ".env") }),
    ).resolves.toEqual({ kind: "pass" });
  });

  it("matches missing files when onlyIfExists is false", async () => {
    const rule = singleRule(cwd, {
      id: "secrets",
      name: "Secrets",
      patterns: [{ pattern: ".env" }],
      protection: "noAccess",
      onlyIfExists: false,
    });

    await expect(
      rule.check({ kind: "file", path: join(cwd, ".env") }),
    ).resolves.toMatchObject({ kind: "match" });
  });

  describe("respectCwd", () => {
    const home = "/home/dev";
    const cwd = join(home, "work", "app");

    beforeEach(() => {
      vi.stubEnv("HOME", home);
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    const treeRule = (respectCwd?: boolean) =>
      singleRule(cwd, {
        id: "ro-tree",
        patterns: [{ pattern: "~/work" }, { pattern: "~/work/**" }],
        protection: "readOnly",
        onlyIfExists: false,
        respectCwd,
      });

    it("does not match ~/ -spelled paths inside the cwd by default", async () => {
      await expect(
        treeRule().check({
          kind: "file",
          path: "~/work/app/foo.txt",
        }),
      ).resolves.toEqual({ kind: "pass" });
    });

    it("still matches ~/ -spelled paths outside the cwd", async () => {
      await expect(
        treeRule().check({ kind: "file", path: "~/work/other/foo.txt" }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("enforces anchored patterns inside the cwd when respectCwd is false", async () => {
      await expect(
        treeRule(false).check({
          kind: "file",
          path: "~/work/app/foo.txt",
        }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("matches /-anchored patterns against tilde-spelled under-$HOME targets outside the cwd", async () => {
      const rule = singleRule(cwd, {
        id: "confidential",
        patterns: [{ pattern: "/home/dev/confidential/**" }],
        protection: "noAccess",
        onlyIfExists: false,
      });

      await expect(
        rule.check({ kind: "file", path: "~/confidential/key.pem" }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("passes when an allowed pattern matches an alternate spelling", async () => {
      const rule = singleRule(cwd, {
        id: "ro-tree-allowed",
        patterns: [{ pattern: "/home/dev/work/**" }],
        allowedPatterns: [{ pattern: "~/work/app/public.txt" }],
        protection: "readOnly",
        onlyIfExists: false,
        respectCwd: false,
      });

      await expect(
        rule.check({ kind: "file", path: "public.txt" }),
      ).resolves.toEqual({ kind: "pass" });
    });

    it("extracts and blocks bash operands spelling an anchored target cwd-relatively", async () => {
      const piHome = join(home, ".pi");
      const policies = compilePolicies([
        {
          id: "auth",
          patterns: [{ pattern: "~/.pi/agent/auth.json" }],
          protection: "noAccess",
          respectCwd: false,
          onlyIfExists: false,
        },
      ]);

      const targets = await extractTargets(
        { toolName: "bash", input: { command: "cat agent/auth.json" } },
        piHome,
        policies,
      );
      expect(targets).toEqual([{ path: "agent/auth.json", unresolved: false }]);

      const [rule] = createPolicyRules(policies, piHome);
      await expect(
        rule.check({
          kind: "file",
          path: "agent/auth.json",
          unresolved: false,
        }),
      ).resolves.toMatchObject({ kind: "match", metadata: { ruleId: "auth" } });
    });

    it("enforces anchored patterns for cwd-relative spellings of in-cwd targets when respectCwd is false", async () => {
      await expect(
        treeRule(false).check({ kind: "file", path: "foo.txt" }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("enforces anchored patterns for absolute spellings of in-cwd targets when respectCwd is false", async () => {
      await expect(
        treeRule(false).check({ kind: "file", path: join(cwd, "foo.txt") }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("enforces anchored patterns when the session cwd is $HOME itself", async () => {
      const rule = singleRule(home, {
        id: "ro-tree",
        patterns: [{ pattern: "~/work" }, { pattern: "~/work/**" }],
        protection: "readOnly",
        onlyIfExists: false,
        respectCwd: false,
      });

      await expect(
        rule.check({ kind: "file", path: "work/app/foo.txt" }),
      ).resolves.toMatchObject({ kind: "match" });
    });

    it("still matches basename and regex patterns inside the cwd", async () => {
      const rule = singleRule(cwd, {
        id: "secrets-in-cwd",
        patterns: [
          { pattern: "~/work/**" },
          { pattern: ".env" },
          { pattern: "\\.pem$", regex: true },
        ],
        protection: "readOnly",
        onlyIfExists: false,
      });

      await expect(
        rule.check({ kind: "file", path: ".env" }),
      ).resolves.toMatchObject({ kind: "match" });
      await expect(
        rule.check({ kind: "file", path: "certs/server.pem" }),
      ).resolves.toMatchObject({ kind: "match" });
    });
  });

  it("matches unresolvable ($VAR) paths even with onlyIfExists true", async () => {
    // A path like `$SC/.env` can't be stat()'d (the real path is unknown), so
    // onlyIfExists must not be used to prove it doesn't exist. This is the
    // escape hatch that previously let `head "$SC/.env"` through.
    const rule = singleRule(cwd, {
      id: "secrets",
      name: "Secrets",
      patterns: [{ pattern: ".env" }],
      protection: "noAccess",
    });

    await expect(
      rule.check({ kind: "file", path: "$SC/.env", unresolved: true }),
    ).resolves.toMatchObject({ kind: "match" });
  });
});
