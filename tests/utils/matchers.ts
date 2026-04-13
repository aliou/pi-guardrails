/**
 * Custom vitest matchers for Pi extension test harness.
 *
 * These matchers inspect the real `Extension` object produced by the
 * harness, not proxy-based mock state.
 */

import { expect } from "vitest";
import type { PiTestHarness } from "./pi-test-harness";

expect.extend({
  toHaveRegisteredTool(received: unknown, name: string) {
    const harness = received as PiTestHarness;
    const registered = harness.listRegisteredTools();
    const pass = registered.includes(name);

    return {
      pass,
      message: () =>
        pass
          ? `expected harness not to have registered tool "${name}"`
          : `expected harness to have registered tool "${name}", registered: [${registered.join(", ")}]`,
      actual: registered,
      expected: name,
    };
  },
  toHaveRegisteredCommand(received: unknown, name: string) {
    const harness = received as PiTestHarness;
    const registered = harness.listRegisteredCommands();
    const pass = registered.includes(name);

    return {
      pass,
      message: () =>
        pass
          ? `expected harness not to have registered command "${name}"`
          : `expected harness to have registered command "${name}", registered: [${registered.join(", ")}]`,
      actual: registered,
      expected: name,
    };
  },
});

declare module "vitest" {
  interface Assertion<T> {
    toHaveRegisteredTool(name: string): T;
    toHaveRegisteredCommand(name: string): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveRegisteredTool(name: string): void;
    toHaveRegisteredCommand(name: string): void;
  }
}
