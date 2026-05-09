import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  createPendingGrant,
  isGrantTooBroad,
  pendingAllowedPaths,
  resolveAllowedPaths,
} from "./grants";

describe("path access grants", () => {
  it("resolves allowed paths relative to cwd", () => {
    expect(resolveAllowedPaths(["../shared", "logs/"], "/repo/app")).toEqual([
      "/repo/shared",
      "/repo/app/logs/",
    ]);
  });

  it("converts pending grants to absolute allowed paths", () => {
    expect(
      pendingAllowedPaths([
        {
          storagePath: "/tmp/file.txt",
          absolutePath: "/tmp/file.txt",
          scope: "memory",
        },
        {
          storagePath: "/tmp/logs/",
          absolutePath: "/tmp/logs",
          scope: "local",
        },
      ]),
    ).toEqual(["/tmp/file.txt", "/tmp/logs/"]);
  });

  it("rejects home grants as too broad", () => {
    expect(isGrantTooBroad(`${homedir()}/`)).toBe(true);
    expect(isGrantTooBroad(`${homedir()}/project`)).toBe(false);
  });

  it("creates pending grants with storage form", () => {
    expect(createPendingGrant("/tmp/logs", true, "local")).toEqual({
      absolutePath: "/tmp/logs",
      scope: "local",
      storagePath: "/tmp/logs/",
    });
  });
});
