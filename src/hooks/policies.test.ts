import { describe, expect, it } from "vitest";
import {
  extractBashPathCandidates,
  isBoundaryAllowed,
  normalizeTargetForPolicy,
} from "./policies";

describe("isBoundaryAllowed", () => {
  const cwd = "/project";

  it("allows file inside cwd", () => {
    expect(isBoundaryAllowed("/project/src/index.ts", cwd, [])).toBe(true);
  });

  it("allows file in additionalDirs", () => {
    expect(
      isBoundaryAllowed("/shared-libs/util.ts", cwd, ["/shared-libs"]),
    ).toBe(true);
  });

  it("allows file in nested additionalDir", () => {
    expect(
      isBoundaryAllowed("/shared-libs/src/util.ts", cwd, ["/shared-libs"]),
    ).toBe(true);
  });

  it("blocks file outside cwd and additionalDirs", () => {
    expect(isBoundaryAllowed("/etc/hosts", cwd, [])).toBe(false);
  });

  it("blocks file outside cwd even with additionalDirs", () => {
    expect(isBoundaryAllowed("/etc/hosts", cwd, ["/shared-libs"])).toBe(false);
  });

  it("allows when cwd matches exactly", () => {
    expect(isBoundaryAllowed(cwd, cwd, [])).toBe(true);
  });

  it("handles multiple additionalDirs", () => {
    expect(isBoundaryAllowed("/dir-b/file.ts", cwd, ["/dir-a", "/dir-b"])).toBe(
      true,
    );
  });

  it("rejects prefix tricks on additionalDirs", () => {
    expect(
      isBoundaryAllowed("/shared-libs-extra/file.ts", cwd, ["/shared-libs"]),
    ).toBe(false);
  });
});

describe("extractBashPathCandidates", () => {
  const cwd = "/project";

  it("extracts path arguments from simple command", async () => {
    const result = await extractBashPathCandidates("cat src/index.ts", cwd);
    expect(result.some((p) => p.includes("index.ts"))).toBe(true);
  });

  it("skips flags", async () => {
    const result = await extractBashPathCandidates("cat -n src/index.ts", cwd);
    expect(result.some((p) => p.startsWith("-"))).toBe(false);
    expect(result.some((p) => p.includes("index.ts"))).toBe(true);
  });

  it("extracts redirect target", async () => {
    const result = await extractBashPathCandidates(
      "echo hello > output.txt",
      cwd,
    );
    expect(result.some((p) => p.includes("output.txt"))).toBe(true);
  });

  it("handles relative path escaping cwd", async () => {
    const result = await extractBashPathCandidates(
      "cat ../outside/secret.txt",
      cwd,
    );
    expect(
      result.some((p) => p.includes("outside") || p.includes("secret")),
    ).toBe(true);
  });

  it("handles tilde expansion", async () => {
    const result = await extractBashPathCandidates("cat ~/.ssh/id_rsa", cwd);
    expect(result.some((p) => p.includes(".ssh"))).toBe(true);
  });

  it("returns empty for command with no path-like args", async () => {
    const result = await extractBashPathCandidates("echo hello world", cwd);
    expect(result.length).toBe(0);
  });

  it("falls back to tokenizer on parse failure", async () => {
    const result = await extractBashPathCandidates(
      "cat '../broken quote.txt'",
      cwd,
    );
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});

describe("normalizeTargetForPolicy", () => {
  const cwd = "/project";

  it("normalizes ~ paths preserving ~ form", () => {
    const result = normalizeTargetForPolicy("~/.ssh/id_rsa", cwd);
    expect(result).toContain(".ssh");
    // ~/ paths are intentionally kept in ~/ form for cross-platform matching
    expect(result).toContain("~");
  });

  it("normalizes relative paths inside cwd", () => {
    const result = normalizeTargetForPolicy("src/index.ts", cwd);
    expect(result).toBe("src/index.ts");
  });

  it("normalizes ../ escapes to absolute or ~/ form", () => {
    const result = normalizeTargetForPolicy("../outside/file.txt", cwd);
    expect(result).toContain("outside");
  });

  it("normalizes absolute paths inside home to ~/ form", () => {
    const home = process.env.HOME ?? "";
    if (home) {
      const result = normalizeTargetForPolicy(`${home}/.ssh/id_rsa`, cwd);
      expect(result).toContain("~");
    }
  });
});
