import { join } from "node:path";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { compilePolicies, createPolicyRules, normalizeTarget } from "./rules";

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
});
