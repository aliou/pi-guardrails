import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../types";
import { run, shouldRun } from "./009-allow-dev-null";

function withPathAccess(pathAccess: Record<string, unknown>): GuardrailsConfig {
  return {
    onboarding: { completed: true },
    features: { pathAccess: true },
    pathAccess,
  } as unknown as GuardrailsConfig;
}

describe("009-allow-dev-null", () => {
  describe("shouldRun", () => {
    it("runs for ask-mode configs without /dev/null", () => {
      expect(shouldRun(withPathAccess({ mode: "ask", allowedPaths: [] }))).toBe(
        true,
      );
    });

    it("runs for block-mode configs without /dev/null", () => {
      expect(
        shouldRun(withPathAccess({ mode: "block", allowedPaths: [] })),
      ).toBe(true);
    });

    it("does not run when /dev/null is already allowed", () => {
      expect(
        shouldRun(
          withPathAccess({
            mode: "block",
            allowedPaths: [{ kind: "file", path: "/dev/null" }],
          }),
        ),
      ).toBe(false);
    });

    it("does not run before onboarding or without the feature enabled", () => {
      const noOnboarding = {
        features: { pathAccess: true },
        pathAccess: { mode: "block", allowedPaths: [] },
      } as unknown as GuardrailsConfig;
      expect(shouldRun(noOnboarding)).toBe(false);

      const featureOff = {
        onboarding: { completed: true },
        features: { pathAccess: false },
        pathAccess: { mode: "block", allowedPaths: [] },
      } as unknown as GuardrailsConfig;
      expect(shouldRun(featureOff)).toBe(false);
    });
  });

  describe("run", () => {
    it("appends /dev/null without touching existing entries", () => {
      const result = run(
        withPathAccess({
          mode: "block",
          allowedPaths: [{ kind: "directory", path: "/tmp/outside" }],
        }),
      );

      expect(result.pathAccess?.allowedPaths).toEqual([
        { kind: "directory", path: "/tmp/outside" },
        { kind: "file", path: "/dev/null" },
      ]);
      expect(result.pathAccess?.mode).toBe("block");
    });
  });
});
