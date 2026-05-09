import { describe, expect, it } from "vitest";
import { createPermissionGateRule, matchesAnyCommandPattern } from "./rules";

describe("createPermissionGateRule", () => {
  it("passes file actions", async () => {
    const rule = createPermissionGateRule({
      patterns: [{ pattern: "rm -rf", description: "recursive delete" }],
      useBuiltinMatchers: false,
    });
    expect(rule.check({ kind: "file", path: "package.json" })).toEqual({
      kind: "pass",
    });
  });

  it("matches configured dangerous command patterns", async () => {
    const rule = createPermissionGateRule({
      patterns: [
        { pattern: "terraform destroy", description: "Destroy infra" },
      ],
      useBuiltinMatchers: false,
    });

    expect(
      rule.check({
        kind: "command",
        command: "terraform destroy -auto-approve",
      }),
    ).toEqual({
      kind: "match",
      reason: "Destroy infra",
      metadata: {
        command: "terraform destroy -auto-approve",
        description: "Destroy infra",
        pattern: "terraform destroy",
      },
    });
  });

  it("can use builtin dangerous command matchers", async () => {
    const rule = createPermissionGateRule({
      patterns: [],
      useBuiltinMatchers: true,
    });
    expect(
      rule.check({ kind: "command", command: "rm -rf dist" }),
    ).toMatchObject({ kind: "match" });
  });
});

describe("matchesAnyCommandPattern", () => {
  it("matches substring and regex command patterns", () => {
    expect(
      matchesAnyCommandPattern("npm publish --dry-run", [
        { pattern: "npm publish" },
      ]),
    ).toBe(true);
    expect(
      matchesAnyCommandPattern("DROP TABLE users", [
        { pattern: "^DROP TABLE", regex: true },
      ]),
    ).toBe(true);
    expect(
      matchesAnyCommandPattern("npm test", [{ pattern: "npm publish" }]),
    ).toBe(false);
  });
});
