import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createMock } from "@golevelup/ts-vitest";
import { describe, expect, it, vi } from "vitest";
import { DELEGATION_ENTRY_TYPE } from "../../src/shared/delegation";
import guardrails from "./index";

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { policies: true },
    })),
    getRawConfig: vi.fn(() => null),
    drainMessages: vi.fn(() => []),
  },
}));
vi.mock("@aliou/pi-utils-settings", () => ({
  bindProjectConfig: vi.fn(),
}));
vi.mock("./commands/settings", () => ({
  registerGuardrailsSettings: vi.fn(),
}));
vi.mock("./commands/examples", () => ({
  registerGuardrailsExamplesCommand: vi.fn(),
}));
vi.mock("./commands/onboarding", () => ({
  registerGuardrailsOnboardingCommand: vi.fn(),
  isOnboardingPending: vi.fn(() => false),
}));

describe("guardrails entry", () => {
  it("registers the decision entry renderer exactly once", async () => {
    const pi = createMock<ExtensionAPI>();

    await guardrails(pi);

    expect(pi.registerEntryRenderer).toHaveBeenCalledTimes(1);
    expect(pi.registerEntryRenderer).toHaveBeenCalledWith(
      DELEGATION_ENTRY_TYPE,
      expect.any(Function),
    );
  });
});
