import { describe, expect, it } from "vitest";
import {
  createPermissionGateRule,
  formatAutoDenyReason,
  matchCommandPattern,
  matchesAnyCommandPattern,
} from "./rules";

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

describe("matchCommandPattern", () => {
  it("returns the matched PatternConfig", () => {
    const patterns = [{ pattern: "npm publish" }, { pattern: "rm -rf" }];
    expect(matchCommandPattern("npm publish --dry-run", patterns)).toBe(
      patterns[0],
    );
  });

  it("returns the matching regex pattern", () => {
    const patterns = [{ pattern: "^DROP TABLE", regex: true }];
    expect(matchCommandPattern("DROP TABLE users", patterns)).toBe(patterns[0]);
  });

  it("returns null when no pattern matches", () => {
    expect(
      matchCommandPattern("npm test", [{ pattern: "npm publish" }]),
    ).toBeNull();
  });

  it("preserves description on the returned pattern", () => {
    const patterns = [
      {
        pattern: "python -m venv",
        description: "Use the project .venv instead",
      },
    ];
    const result = matchCommandPattern("python -m venv .venv", patterns);
    expect(result).not.toBeNull();
    expect(result?.description).toBe("Use the project .venv instead");
  });
});

describe("formatAutoDenyReason", () => {
  it("uses description when present", () => {
    expect(
      formatAutoDenyReason({
        pattern: "python -m venv",
        description: "Use the project .venv instead",
      }),
    ).toBe("Command auto-denied: Use the project .venv instead");
  });

  it("falls back to generic reason when description is missing", () => {
    expect(formatAutoDenyReason({ pattern: "python -m venv" })).toBe(
      "Command matched auto-deny pattern and was blocked automatically.",
    );
  });

  it("falls back when description is empty string", () => {
    expect(
      formatAutoDenyReason({ pattern: "python -m venv", description: "" }),
    ).toBe("Command matched auto-deny pattern and was blocked automatically.");
  });

  it("falls back when description is whitespace-only", () => {
    expect(
      formatAutoDenyReason({ pattern: "python -m venv", description: "  " }),
    ).toBe("Command matched auto-deny pattern and was blocked automatically.");
  });
});
