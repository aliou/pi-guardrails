import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  expandHomePath,
  extractGrantDirectory,
  isWithinLexicalBoundary,
  resolveFromCwd,
} from "./path";

describe("expandHomePath", () => {
  it("expands bare ~ to homedir", () => {
    expect(expandHomePath("~")).toMatch(/^\/Users\/|^\/home\//);
  });

  it("expands ~/foo to homedir/foo", () => {
    const result = expandHomePath("~/foo");
    expect(result).toMatch(/\/foo$/);
    expect(result.startsWith("~")).toBe(false);
  });

  it("leaves absolute paths unchanged", () => {
    expect(expandHomePath("/etc/hosts")).toBe("/etc/hosts");
  });

  it("leaves relative paths unchanged", () => {
    expect(expandHomePath("foo/bar")).toBe("foo/bar");
  });

  it("leaves ~ in the middle unchanged", () => {
    expect(expandHomePath("/foo~/bar")).toBe("/foo~/bar");
  });

  it("expands ~\\foo to homedir/foo (Windows backslash)", () => {
    const result = expandHomePath("~\\foo");
    expect(result).not.toContain("~");
    expect(result).toMatch(/foo$/);
  });
});

describe("resolveFromCwd", () => {
  it("resolves relative path against cwd", () => {
    expect(resolveFromCwd("src/index.ts", "/project")).toBe(
      "/project/src/index.ts",
    );
  });

  it("resolves absolute path as-is", () => {
    expect(resolveFromCwd("/etc/hosts", "/project")).toBe("/etc/hosts");
  });

  it("expands ~ then resolves against cwd", () => {
    const result = resolveFromCwd("~/code", "/project");
    expect(result).not.toContain("~");
    expect(result).toMatch(/\/code$/);
  });

  it("resolves .. correctly", () => {
    expect(resolveFromCwd("../outside/file.txt", "/project/src")).toBe(
      "/project/outside/file.txt",
    );
  });
});

describe("isWithinLexicalBoundary", () => {
  it("returns true for exact match", () => {
    expect(isWithinLexicalBoundary("/project", "/project")).toBe(true);
  });

  it("returns true for descendant", () => {
    expect(isWithinLexicalBoundary("/project/src/index.ts", "/project")).toBe(
      true,
    );
  });

  it("returns true for nested descendant", () => {
    expect(isWithinLexicalBoundary("/project/a/b/c/file.ts", "/project")).toBe(
      true,
    );
  });

  it("returns false for sibling", () => {
    expect(isWithinLexicalBoundary("/other", "/project")).toBe(false);
  });

  it("returns false for parent", () => {
    expect(isWithinLexicalBoundary("/", "/project")).toBe(false);
  });

  it("returns false for escape via ..", () => {
    // resolve("/project", "../../x") => resolves to something outside
    expect(isWithinLexicalBoundary("/other-project/file.ts", "/project")).toBe(
      false,
    );
  });

  it("handles foo/../bar (still inside)", () => {
    // resolve("/project/outside/../src/file.ts") => "/project/src/file.ts"
    const target = "/project/outside/../src/file.ts";
    expect(isWithinLexicalBoundary(target, "/project")).toBe(true);
  });

  it("handles ../../x (outside)", () => {
    const target = "/project/../../etc/hosts";
    expect(isWithinLexicalBoundary(target, "/project")).toBe(false);
  });

  it("returns true for cwd with trailing slash", () => {
    expect(isWithinLexicalBoundary("/project/file.ts", "/project/")).toBe(true);
  });

  it("returns false for prefix trick (no slash boundary)", () => {
    // /project2 should NOT be inside /project
    expect(isWithinLexicalBoundary("/project2/file.ts", "/project")).toBe(
      false,
    );
  });
});

describe("extractGrantDirectory", () => {
  it("returns parent for file with extension", async () => {
    const result = await extractGrantDirectory("/project/src/index.ts");
    expect(result).toBe("/project/src");
  });

  it("returns as-is for dot-prefixed segment with no further dots (.env) — heuristic", async () => {
    // .env doesn't exist on disk → heuristic treats single dot-prefix with no further dots as directory
    const result = await extractGrantDirectory("/project/.env");
    expect(result).toBe("/project/.env");
  });

  it("returns parent for dotfile with dots (.env.local)", async () => {
    const result = await extractGrantDirectory("/project/.env.local");
    expect(result).toBe("/project");
  });

  it("returns as-is for directory (no dot in last segment)", async () => {
    const result = await extractGrantDirectory("/project/src");
    expect(result).toBe("/project/src");
  });

  it("returns as-is for hidden directory (.git) — heuristic", async () => {
    // .git doesn't exist at this path → heuristic: single dot-prefix, no further dots → directory
    const result = await extractGrantDirectory("/project/.git");
    expect(result).toBe("/project/.git");
  });

  it("returns as-is for hidden directory (.ssh) — heuristic", async () => {
    const result = await extractGrantDirectory("/project/.ssh");
    expect(result).toBe("/project/.ssh");
  });

  it("returns parent for deeply nested file", async () => {
    const result = await extractGrantDirectory("/a/b/c/d/file.json");
    expect(result).toBe("/a/b/c/d");
  });

  it("handles Windows-style backslashes (normalizes to forward slashes)", async () => {
    const result = await extractGrantDirectory("C:\\project\\src\\file.ts");
    expect(result).not.toContain("\\");
  });

  it("uses stat for real files — returns parent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grant-test-"));
    const filePath = join(dir, "real-file.ts");
    await writeFile(filePath, "test");
    const result = await extractGrantDirectory(filePath);
    expect(result).toBe(dir);
    await rm(dir, { recursive: true });
  });

  it("uses stat for real directories — returns as-is", async () => {
    const dir = await mkdtemp(join(tmpdir(), "grant-test-"));
    const subDir = join(dir, ".git");
    await mkdir(subDir);
    const result = await extractGrantDirectory(subDir);
    expect(result).toBe(subDir);
    await rm(dir, { recursive: true });
  });
});
