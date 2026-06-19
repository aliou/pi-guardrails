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
});
