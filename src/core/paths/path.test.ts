import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  expandHomePath,
  isWithinBoundary,
  maybePathLike,
  normalizeForDisplay,
  resolveFromCwd,
  toStorageGrant,
} from "./path";

const HOME = homedir();

describe("expandHomePath", () => {
  it.each([
    { desc: "bare ~", input: "~", expected: HOME },
    { desc: "~/foo", input: "~/foo", expected: `${HOME}/foo` },
    {
      desc: "~\\foo (Windows tilde)",
      input: "~\\foo",
      expected: `${HOME}/foo`,
    },
    {
      desc: "an absolute path",
      input: "/absolute/path",
      expected: "/absolute/path",
    },
    {
      desc: "a relative path",
      input: "relative/path",
      expected: "relative/path",
    },
    { desc: "an empty string", input: "", expected: "" },
  ])("given $desc, returns the expanded path", ({ input, expected }) => {
    expect(expandHomePath(input)).toBe(expected);
  });
});

describe("resolveFromCwd", () => {
  const cwd = "/some/cwd";

  it.each([
    {
      desc: "a relative path",
      input: "sub/file",
      expected: "/some/cwd/sub/file",
    },
    { desc: "an absolute path", input: "/etc/hosts", expected: "/etc/hosts" },
    { desc: "a ~ path", input: "~/foo", expected: `${HOME}/foo` },
    { desc: "'.'", input: ".", expected: "/some/cwd" },
  ])("given $desc, resolves against cwd", ({ input, expected }) => {
    expect(resolveFromCwd(input, cwd)).toBe(expected);
  });
});

describe("isWithinBoundary", () => {
  it.each([
    {
      desc: "paths are identical",
      target: "/foo/bar",
      root: "/foo/bar",
      expected: true,
    },
    {
      desc: "target is a direct child",
      target: "/foo/bar/baz",
      root: "/foo/bar",
      expected: true,
    },
    {
      desc: "target is a grandchild",
      target: "/foo/bar/baz/qux",
      root: "/foo/bar",
      expected: true,
    },
    {
      desc: "target is a parent",
      target: "/foo",
      root: "/foo/bar",
      expected: false,
    },
    {
      desc: "target is a sibling",
      target: "/foo/other",
      root: "/foo/bar",
      expected: false,
    },
    {
      desc: "target shares a string prefix but is not a child (critical case)",
      target: "/foo/barbaz",
      root: "/foo/bar",
      expected: false,
    },
    {
      desc: "paths are completely unrelated",
      target: "/tmp",
      root: "/home/user",
      expected: false,
    },
  ])("when $desc, returns $expected", ({ target, root, expected }) => {
    expect(isWithinBoundary(target, root)).toBe(expected);
  });
});

describe("normalizeForDisplay", () => {
  const cwd = "/work/project";

  it.each([
    { desc: "path equals cwd", input: cwd, expected: "." },
    {
      desc: "path is a child of cwd",
      input: "/work/project/src/file.ts",
      expected: "src/file.ts",
    },
    {
      desc: "path is under home but not cwd",
      input: `${HOME}/config/file`,
      expected: "~/config/file",
    },
    {
      desc: "path is outside both cwd and home",
      input: "/etc/hosts",
      expected: "/etc/hosts",
    },
    { desc: "path is home itself", input: HOME, expected: "~" },
  ])("when $desc, returns $expected", ({ input, expected }) => {
    expect(normalizeForDisplay(input, cwd)).toBe(expected);
  });
});

describe("toStorageGrant", () => {
  it.each([
    {
      desc: "file under home",
      absPath: `${HOME}/code/file.ts`,
      isDirectory: false,
      expected: { kind: "file", path: "~/code/file.ts" },
    },
    {
      desc: "directory under home",
      absPath: `${HOME}/code`,
      isDirectory: true,
      expected: { kind: "directory", path: "~/code" },
    },
    {
      desc: "absolute file outside home",
      absPath: "/etc/hosts",
      isDirectory: false,
      expected: { kind: "file", path: "/etc/hosts" },
    },
    {
      desc: "absolute directory outside home",
      absPath: "/etc",
      isDirectory: true,
      expected: { kind: "directory", path: "/etc" },
    },
    {
      desc: "input has trailing slash but isDirectory=false",
      absPath: "/etc/hosts/",
      isDirectory: false,
      expected: { kind: "file", path: "/etc/hosts" },
    },
    {
      desc: "input uses Windows backslashes",
      absPath: "C:\\Users\\foo",
      isDirectory: false,
      expected: { kind: "file", path: "C:/Users/foo" },
    },
    {
      desc: "input is home itself with isDirectory=true",
      absPath: HOME,
      isDirectory: true,
      expected: { kind: "directory", path: "~" },
    },
  ])("when $desc, returns $expected", ({ absPath, isDirectory, expected }) => {
    expect(toStorageGrant(absPath, isDirectory)).toEqual(expected);
  });
});

describe("maybePathLike", () => {
  it.each([
    // --- True cases: structural path signals ---
    {
      desc: "absolute Unix path",
      input: "/etc/hosts",
      expected: true,
    },
    {
      desc: "relative path with /",
      input: "src/index.ts",
      expected: true,
    },
    {
      desc: "./ prefix",
      input: "./foo",
      expected: true,
    },
    {
      desc: "../ prefix",
      input: "../bar",
      expected: true,
    },
    {
      desc: "backslash path (Windows)",
      input: "foo\\bar",
      expected: true,
    },
    {
      desc: "Windows drive letter",
      input: "C:\\tmp",
      expected: true,
    },
    {
      desc: "Windows drive with forward slash",
      input: "C:/tmp",
      expected: true,
    },
    {
      desc: "tilde home path",
      input: "~/code",
      expected: true,
    },
    {
      desc: "MIME type (has / — safe false positive)",
      input: "application/json",
      expected: true,
    },
    {
      desc: "regular expression with braces (has / — safe false positive)",
      input: "/abc/{2,3}",
      expected: true,
    },
    // --- False cases: non-path tokens ---
    {
      desc: "empty string",
      input: "",
      expected: false,
    },
    {
      desc: "simple command name",
      input: "rm",
      expected: false,
    },
    {
      desc: "flag",
      input: "--force",
      expected: false,
    },
    {
      desc: "short flag",
      input: "-rf",
      expected: false,
    },
    {
      desc: "bare word",
      input: "build",
      expected: false,
    },
    {
      desc: "bare tilde (no slash)",
      input: "~",
      expected: false,
    },
    {
      desc: "version number",
      input: "3.14",
      expected: false,
    },
    {
      desc: "domain name",
      input: "example.com",
      expected: false,
    },
    {
      desc: "bare filename with extension",
      input: "README.md",
      expected: false,
    },
    {
      desc: "dotfile without slash",
      input: ".env",
      expected: false,
    },
  ])("when $desc, returns $expected", ({ input, expected }) => {
    expect(maybePathLike(input)).toBe(expected);
  });

  // maybePathLike is command-agnostic. Command-specific regex/code args are
  // filtered by extractBashPathCandidates before this fallback heuristic runs.
  it("treats awk-looking regex text as path-like without command context", () => {
    expect(maybePathLike("/aaa/{flag=1} flag{print}")).toBe(true);
  });
});
