import { describe, expect, it } from "vitest";
import type { AllowedPath } from "../../src/core/paths";
import { createPathAccessRule } from "./rules";

const cwd = "/repo";
const state = (allowedPaths: AllowedPath[] = []) => ({
  cwd,
  mode: "block" as const,
  allowedPaths,
  hasUI: true,
});

describe("createPathAccessRule", () => {
  it("passes command actions", () => {
    const rule = createPathAccessRule(state());
    expect(rule.check({ kind: "command", command: "cat /tmp/a" })).toEqual({
      kind: "pass",
    });
  });

  it("passes files inside cwd", () => {
    const rule = createPathAccessRule(state());
    expect(rule.check({ kind: "file", path: "/repo/src/index.ts" })).toEqual({
      kind: "pass",
    });
  });

  it("matches outside files in block mode", () => {
    const rule = createPathAccessRule(state());
    expect(rule.check({ kind: "file", path: "/tmp/secret.txt" })).toMatchObject(
      {
        kind: "match",
        metadata: {
          absolutePath: "/tmp/secret.txt",
          displayPath: "/tmp/secret.txt",
        },
      },
    );
  });

  it("passes explicitly allowed outside paths", () => {
    const rule = createPathAccessRule(
      state([{ kind: "directory", path: "/tmp" }]),
    );
    expect(rule.check({ kind: "file", path: "/tmp/secret.txt" })).toEqual({
      kind: "pass",
    });
  });

  describe("process device paths", () => {
    it("passes bash-origin device paths without consulting the state", () => {
      const rule = createPathAccessRule(state()); // block mode
      for (const path of ["/dev/stdin", "/dev/tty", "/dev/fd/3"]) {
        expect(rule.check({ kind: "file", path, origin: "bash" })).toEqual({
          kind: "pass",
        });
      }
    });

    it("still checks device paths reached through in-process tools", () => {
      const rule = createPathAccessRule(state());
      for (const origin of ["read", "write", "edit", "grep", "find", "ls"]) {
        for (const path of ["/dev/fd/3", "/dev/tty"]) {
          expect(rule.check({ kind: "file", path, origin })).toMatchObject({
            kind: "match",
          });
        }
      }
    });

    it("checks device paths when no origin is known", () => {
      const rule = createPathAccessRule(state()); // block mode
      expect(rule.check({ kind: "file", path: "/dev/tty" })).toMatchObject({
        kind: "match",
      });
    });

    it("does not pass bash-origin paths outside the device set", () => {
      const rule = createPathAccessRule(state()); // block mode
      expect(
        rule.check({ kind: "file", path: "/dev/urandom", origin: "bash" }),
      ).toMatchObject({ kind: "match" });
    });
  });
});
