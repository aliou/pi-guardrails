import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../types";
import { run, shouldRun } from "./010-allowed-paths-objects";
import { CURRENT_VERSION } from "./version";

function withAllowedPaths(allowedPaths: unknown[]): GuardrailsConfig {
  return {
    pathAccess: { allowedPaths },
  } as unknown as GuardrailsConfig;
}

describe("010-allowed-paths-objects", () => {
  describe("shouldRun", () => {
    it("runs when any entry is a legacy string", () => {
      expect(
        shouldRun(withAllowedPaths(["/tmp/foo", { kind: "file", path: "/a" }])),
      ).toBe(true);
    });

    it("runs when all entries are legacy strings", () => {
      expect(shouldRun(withAllowedPaths(["/tmp/", "/dev/null"]))).toBe(true);
    });

    it("does not run when all entries are already objects", () => {
      expect(
        shouldRun(
          withAllowedPaths([
            { kind: "file", path: "/dev/null" },
            { kind: "directory", path: "/tmp" },
          ]),
        ),
      ).toBe(false);
    });

    it("does not run when allowedPaths is absent", () => {
      expect(shouldRun({} as GuardrailsConfig)).toBe(false);
    });

    it("does not run when allowedPaths is not an array", () => {
      expect(
        shouldRun({
          pathAccess: { allowedPaths: "nope" },
        } as unknown as GuardrailsConfig),
      ).toBe(false);
    });
  });

  describe("run", () => {
    it("converts trailing-slash strings to directory grants", () => {
      const result = run(withAllowedPaths(["/tmp/logs/"]));
      expect(result.pathAccess?.allowedPaths).toEqual([
        { kind: "directory", path: "/tmp/logs" },
      ]);
    });

    it("converts non-slash strings to file grants", () => {
      const result = run(withAllowedPaths(["/dev/null", "/etc/hosts"]));
      expect(result.pathAccess?.allowedPaths).toEqual([
        { kind: "file", path: "/dev/null" },
        { kind: "file", path: "/etc/hosts" },
      ]);
    });

    it("passes through valid objects, stripping stray trailing slashes on directories", () => {
      const result = run(
        withAllowedPaths([
          { kind: "file", path: "/a" },
          { kind: "directory", path: "/tmp/logs/" },
        ]),
      );
      expect(result.pathAccess?.allowedPaths).toEqual([
        { kind: "file", path: "/a" },
        { kind: "directory", path: "/tmp/logs" },
      ]);
    });

    it("drops entries with empty or invalid shapes", () => {
      const result = run(
        withAllowedPaths(["   ", { kind: "file" }, { kind: "x", path: "/y" }]),
      );
      expect(result.pathAccess?.allowedPaths).toEqual([]);
    });

    it("stamps the current config version", () => {
      const result = run(withAllowedPaths(["/dev/null"]));
      expect(result.version).toBe(CURRENT_VERSION);
    });

    it("leaves the rest of the config intact", () => {
      const config = {
        enabled: true,
        features: { pathAccess: true },
        pathAccess: { mode: "ask", allowedPaths: ["/tmp/"] },
      } as unknown as GuardrailsConfig;
      const result = run(config);
      expect(result.enabled).toBe(true);
      expect(result.features?.pathAccess).toBe(true);
      expect(result.pathAccess?.mode).toBe("ask");
    });
  });
});
