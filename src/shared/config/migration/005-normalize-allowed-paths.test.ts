import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../types";
import { run, shouldRun } from "./005-normalize-allowed-paths";

function withAllowedPaths(allowedPaths: unknown[]): GuardrailsConfig {
  return {
    pathAccess: { allowedPaths },
  } as unknown as GuardrailsConfig;
}

describe("005-normalize-allowed-paths", () => {
  describe("shouldRun", () => {
    it("runs when any entry is a legacy pattern object", () => {
      expect(
        shouldRun(withAllowedPaths(["/tmp/foo", { pattern: "/tmp/bar" }])),
      ).toBe(true);
    });

    it("does not run when entries are already allowed path objects", () => {
      expect(
        shouldRun(
          withAllowedPaths([
            { kind: "file", path: "/dev/null" },
            { kind: "directory", path: "/tmp" },
          ]),
        ),
      ).toBe(false);
    });

    it("does not run for malformed objects without patterns", () => {
      expect(
        shouldRun(withAllowedPaths([{ kind: "file" }, { path: 123 }])),
      ).toBe(false);
    });
  });

  describe("run", () => {
    it("preserves strings, legacy patterns, and current path objects", () => {
      const result = run(
        withAllowedPaths([
          " /tmp/a ",
          { pattern: "/tmp/b" },
          { kind: "file", path: "/dev/null" },
        ]),
      );

      expect(result.pathAccess?.allowedPaths).toEqual([
        "/tmp/a",
        "/tmp/b",
        "/dev/null",
      ]);
    });
  });
});
