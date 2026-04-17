import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  expandHomePath,
  isWithinBoundary,
  normalizeForDisplay,
  resolveFromCwd,
  toStorageForm,
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

describe("toStorageForm", () => {
  it.each([
    {
      desc: "file under home",
      absPath: `${HOME}/code/file.ts`,
      isDirectory: false,
      expected: "~/code/file.ts",
    },
    {
      desc: "directory under home",
      absPath: `${HOME}/code`,
      isDirectory: true,
      expected: "~/code/",
    },
    {
      desc: "absolute file outside home",
      absPath: "/etc/hosts",
      isDirectory: false,
      expected: "/etc/hosts",
    },
    {
      desc: "absolute directory outside home",
      absPath: "/etc",
      isDirectory: true,
      expected: "/etc/",
    },
    {
      desc: "input has trailing slash but isDirectory=false",
      absPath: "/etc/hosts/",
      isDirectory: false,
      expected: "/etc/hosts",
    },
    {
      desc: "input uses Windows backslashes",
      absPath: "C:\\Users\\foo",
      isDirectory: false,
      expected: "C:/Users/foo",
    },
    {
      desc: "input is home itself with isDirectory=true",
      absPath: HOME,
      isDirectory: true,
      expected: "~/",
    },
  ])("when $desc, returns $expected", ({ absPath, isDirectory, expected }) => {
    expect(toStorageForm(absPath, isDirectory)).toBe(expected);
  });
});
