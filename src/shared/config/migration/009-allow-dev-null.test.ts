import { describe, expect, it } from "vitest";
import type { GuardrailsConfig } from "../types";
import { run, shouldRun } from "./009-allow-dev-null";

function withConfig(
  overrides: Record<string, unknown> = {},
  pathAccess: Record<string, unknown> | null = {
    mode: "ask",
    allowedPaths: [],
  },
): GuardrailsConfig {
  const config: Record<string, unknown> = {
    onboarding: { completed: true },
    features: { pathAccess: true },
    ...overrides,
  };
  if (pathAccess !== null) config.pathAccess = pathAccess;
  return config as unknown as GuardrailsConfig;
}

describe("009-allow-dev-null", () => {
  describe("shouldRun", () => {
    it.each([
      "ask",
      "block",
    ] as const)("runs for %s-mode configs without /dev/null", (mode) => {
      expect(shouldRun(withConfig({}, { mode, allowedPaths: [] }))).toBe(true);
    });

    it("does not run when /dev/null is already allowed", () => {
      expect(
        shouldRun(
          withConfig(
            {},
            {
              mode: "block",
              allowedPaths: [{ kind: "file", path: "/dev/null" }],
            },
          ),
        ),
      ).toBe(false);
    });

    it("does not run when applyBuiltinDefaults is false", () => {
      expect(shouldRun(withConfig({ applyBuiltinDefaults: false }))).toBe(
        false,
      );
    });

    it("does not run when pathAccess is not configured at all", () => {
      expect(shouldRun(withConfig({}, null))).toBe(false);
    });

    it.each([
      undefined,
      "allow",
    ])("does not run when mode is %s (no gating to fix)", (mode) => {
      expect(shouldRun(withConfig({}, { mode, allowedPaths: [] }))).toBe(false);
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
        withConfig(
          {},
          {
            mode: "block",
            allowedPaths: [{ kind: "directory", path: "/tmp/outside" }],
          },
        ) as GuardrailsConfig,
      );

      expect(result.pathAccess?.allowedPaths).toEqual([
        { kind: "directory", path: "/tmp/outside" },
        { kind: "file", path: "/dev/null" },
      ]);
      expect(result.pathAccess?.mode).toBe("block");
    });
  });
});
