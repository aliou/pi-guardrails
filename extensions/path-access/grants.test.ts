import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { vol } from "memfs";
import { describe, expect, it } from "vitest";
import { configLoader } from "../../src/shared/config";
import {
  createPendingGrant,
  isGrantTooBroad,
  pendingAllowedPaths,
  persistGrant,
  resolveAllowedPaths,
} from "./grants";

describe("path access grants", () => {
  it.each([
    { trusted: false, scope: "local" },
    { trusted: true, scope: "local" },
    { trusted: false, scope: "global" },
    { trusted: false, scope: "memory" },
  ] as const)("persists $scope grants only to available scopes when trusted=$trusted", async ({
    trusted,
    scope,
  }) => {
    const cwd = "/workspace";
    const projectPath = join(cwd, ".pi/extensions/guardrails.json");
    const contents = JSON.stringify({ enabled: true });
    vol.fromJSON({ [projectPath]: contents });
    await configLoader.load();
    await configLoader.loadProject({ cwd, isProjectTrusted: () => trusted });
    const grant = createPendingGrant("/tmp/outside.txt", false, scope);

    if (scope === "local" && !trusted) {
      await expect(persistGrant(grant)).rejects.toThrow(
        "Project settings are not trusted",
      );
      expect(await readFile(projectPath, "utf-8")).toBe(contents);
      return;
    }

    await persistGrant(grant);
    expect(configLoader.getConfig().pathAccess.allowedPaths).toContainEqual(
      grant.storageGrant,
    );
    if (scope !== "memory") {
      const path =
        scope === "local"
          ? projectPath
          : join(getAgentDir(), "extensions/guardrails.json");
      const saved = JSON.parse(await readFile(path, "utf-8"));
      expect(saved.pathAccess.allowedPaths).toContainEqual(grant.storageGrant);
    }
    if (!trusted) expect(await readFile(projectPath, "utf-8")).toBe(contents);
  });
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

  it("rejects filesystem root grants as too broad", () => {
    expect(isGrantTooBroad("/")).toBe(true);
    expect(isGrantTooBroad("//")).toBe(true);
    expect(isGrantTooBroad("/etc")).toBe(false);
  });

  it("creates pending grants with a storage grant", () => {
    expect(createPendingGrant("/tmp/logs", true, "local")).toEqual({
      kind: "directory",
      absolutePath: "/tmp/logs",
      scope: "local",
      storageGrant: { kind: "directory", path: "/tmp/logs" },
    });
  });

  it("creates pending grants for the global scope", () => {
    expect(createPendingGrant("/tmp/logs", true, "global")).toEqual({
      kind: "directory",
      absolutePath: "/tmp/logs",
      scope: "global",
      storageGrant: { kind: "directory", path: "/tmp/logs" },
    });
  });
});
