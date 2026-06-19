import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createPendingGrant,
  isGrantTooBroad,
  pendingAllowedPaths,
  resolveAllowedPaths,
} from "./grants";

describe("path access grants", () => {
  it("resolves allowed paths relative to cwd, preserving kind", () => {
    expect(
      resolveAllowedPaths(
        [
          { kind: "directory", path: "../shared" },
          { kind: "directory", path: "logs" },
        ],
        "/repo/app",
      ),
    ).toEqual([
      { kind: "directory", path: "/repo/shared" },
      { kind: "directory", path: "/repo/app/logs" },
    ]);
  });

  it("converts pending grants to absolute allowed paths", () => {
    expect(
      pendingAllowedPaths([
        {
          kind: "file",
          storageGrant: { kind: "file", path: "/tmp/file.txt" },
          absolutePath: "/tmp/file.txt",
          scope: "memory",
        },
        {
          kind: "directory",
          storageGrant: { kind: "directory", path: "/tmp/logs" },
          absolutePath: "/tmp/logs",
          scope: "local",
        },
      ]),
    ).toEqual([
      { kind: "file", path: "/tmp/file.txt" },
      { kind: "directory", path: "/tmp/logs" },
    ]);
  });

  it("rejects home grants as too broad", () => {
    expect(isGrantTooBroad(`${homedir()}/`)).toBe(true);
    expect(isGrantTooBroad(`${homedir()}/project`)).toBe(false);
  });

  it("creates pending grants with a storage grant", () => {
    expect(createPendingGrant("/tmp/logs", true, "local")).toEqual({
      kind: "directory",
      absolutePath: "/tmp/logs",
      scope: "local",
      storageGrant: { kind: "directory", path: "/tmp/logs" },
    });
  });
});
