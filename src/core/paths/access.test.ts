import { assert, describe, expect, it } from "vitest";
import {
  checkPathAccess,
  isPathAllowed,
  isProcessDevicePath,
  type PathAccessState,
} from "./access";

describe("isPathAllowed", () => {
  describe("when allowedPaths is empty", () => {
    it("returns false", () => {
      expect(isPathAllowed("/foo/bar", [])).toBe(false);
    });
  });

  describe("when entry is an exact file grant", () => {
    it.each([
      { desc: "matches the exact file", path: "/foo/bar", expected: true },
      {
        desc: "does not match a sibling file",
        path: "/foo/other",
        expected: false,
      },
      {
        desc: "does not match the containing directory",
        path: "/foo",
        expected: false,
      },
    ])("$desc", ({ path, expected }) => {
      expect(isPathAllowed(path, [{ kind: "file", path: "/foo/bar" }])).toBe(
        expected,
      );
    });
  });

  describe("when entry is a directory grant", () => {
    it.each([
      {
        desc: "matches the directory itself",
        path: "/foo/bar",
        expected: true,
      },
      { desc: "matches a direct child", path: "/foo/bar/baz", expected: true },
      {
        desc: "matches a grandchild",
        path: "/foo/bar/baz/qux",
        expected: true,
      },
      {
        desc: "does not match a prefix-collision path like /foo/barbaz",
        path: "/foo/barbaz",
        expected: false,
      },
    ])("$desc", ({ path, expected }) => {
      expect(
        isPathAllowed(path, [{ kind: "directory", path: "/foo/bar" }]),
      ).toBe(expected);
    });
  });

  describe("when allowedPaths has multiple entries", () => {
    it("returns true if any entry matches", () => {
      expect(
        isPathAllowed("/b", [
          { kind: "file", path: "/a" },
          { kind: "file", path: "/b" },
        ]),
      ).toBe(true);
    });

    it.each([
      { path: "/foo/file.ts", expected: true },
      { path: "/bar/anything", expected: true },
      { path: "/foo/other.ts", expected: false },
      { path: "/baz", expected: false },
    ])("with mixed file + directory grants, returns $expected for $path", ({
      path,
      expected,
    }) => {
      expect(
        isPathAllowed(path, [
          { kind: "file", path: "/foo/file.ts" },
          { kind: "directory", path: "/bar" },
        ]),
      ).toBe(expected);
    });
  });
});

describe("isProcessDevicePath", () => {
  it.each([
    "/dev/stdin",
    "/dev/stdout",
    "/dev/stderr",
    "/dev/tty",
    "/dev/fd/0",
    "/dev/fd/3",
    "/dev/fd/007",
  ])("classifies %s as bash-child process plumbing", (p) => {
    expect(isProcessDevicePath(p)).toBe(true);
  });

  it.each([
    "/dev/random",
    "/dev/urandom",
    "/dev/zero",
    "/dev/disk0",
    "/dev/tty0",
    "/dev/pts/0",
    "/dev/fd/",
    "/dev/fd/abc",
    "/dev/fd/-1",
    "/dev/fd/3/",
    "/dev/fd/3/extra",
    "/dev/stdinx",
    "/dev/stdout/x",
    "/etc/stdin",
  ])("does not classify %s as process plumbing", (p) => {
    expect(isProcessDevicePath(p)).toBe(false);
  });
});

describe("checkPathAccess", () => {
  const cwd = "/work/project";
  const base = (overrides: Partial<PathAccessState> = {}): PathAccessState => ({
    cwd,
    mode: "ask",
    allowedPaths: [],
    hasUI: true,
    ...overrides,
  });

  describe("when mode is allow", () => {
    it("always returns allow, even for paths outside cwd and without UI", () => {
      const state = base({ mode: "allow", hasUI: false, allowedPaths: [] });
      expect(checkPathAccess("/etc/hosts", "/etc/hosts", state).kind).toBe(
        "allow",
      );
      expect(checkPathAccess("/work/project/src", "src", state).kind).toBe(
        "allow",
      );
    });
  });

  describe("when path is inside cwd", () => {
    it.each([
      { mode: "block" as const },
      { mode: "ask" as const },
    ])("returns allow in $mode mode", ({ mode }) => {
      const state = base({ mode });
      expect(
        checkPathAccess("/work/project/src/file", "src/file", state).kind,
      ).toBe("allow");
    });

    it("returns allow when path equals cwd", () => {
      expect(checkPathAccess(cwd, ".", base({ mode: "ask" })).kind).toBe(
        "allow",
      );
    });
  });

  describe("when the path is a device file", () => {
    // The bash-origin device allowance lives in the path-access rule, not
    // in the core check: the same path reached through an in-process tool
    // is pi's own fd or terminal and must still be checked (rules.test.ts).
    it("treats device paths like any other outside-workspace path", () => {
      expect(
        checkPathAccess("/dev/tty", "/dev/tty", base({ mode: "ask" })).kind,
      ).toBe("ask");
      expect(
        checkPathAccess("/dev/fd/3", "/dev/fd/3", base({ mode: "block" })).kind,
      ).toBe("deny");
      expect(
        checkPathAccess("/dev/stdin", "/dev/stdin", base({ mode: "block" }))
          .kind,
      ).toBe("deny");
    });

    it("returns allow when a device path is explicitly in allowedPaths", () => {
      const state = base({
        mode: "block",
        allowedPaths: [{ kind: "file", path: "/dev/tty" }],
      });
      expect(checkPathAccess("/dev/tty", "/dev/tty", state).kind).toBe("allow");
    });
  });

  describe("when path is outside cwd and mode is block", () => {
    it("returns deny with the displayPath in the reason", () => {
      const state = base({ mode: "block" });
      const decision = checkPathAccess("/etc/hosts", "/etc/hosts", state);
      assert(decision.kind === "deny", "expected deny decision");
      expect(decision.reason).toContain("/etc/hosts");
    });

    it("returns allow when the path is in allowedPaths", () => {
      const state = base({
        mode: "block",
        allowedPaths: [{ kind: "file", path: "/etc/hosts" }],
      });
      expect(checkPathAccess("/etc/hosts", "/etc/hosts", state).kind).toBe(
        "allow",
      );
    });
  });

  describe("when path is outside cwd and mode is ask", () => {
    it("returns ask with displayPath when UI is available", () => {
      const state = base({ mode: "ask", hasUI: true });
      const decision = checkPathAccess("/etc/hosts", "/etc/hosts", state);
      assert(decision.kind === "ask", "expected ask decision");
      expect(decision.displayPath).toBe("/etc/hosts");
      expect(decision.absolutePath).toBe("/etc/hosts");
    });

    it("returns deny with a 'no UI' reason when UI is unavailable", () => {
      const state = base({ mode: "ask", hasUI: false });
      const decision = checkPathAccess("/etc/hosts", "/etc/hosts", state);
      assert(decision.kind === "deny", "expected deny decision");
      expect(decision.reason).toContain("no UI");
    });

    it("returns allow when the path is in allowedPaths (no prompt)", () => {
      const state = base({
        mode: "ask",
        allowedPaths: [{ kind: "file", path: "/etc/hosts" }],
      });
      expect(checkPathAccess("/etc/hosts", "/etc/hosts", state).kind).toBe(
        "allow",
      );
    });
  });
});
