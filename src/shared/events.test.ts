import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
  GUARDRAILS_ACTION_PROMPTED_EVENT,
  withActionPromptLifecycle,
} from "./events";

const promptEvent = {
  feature: "permissionGate" as const,
  action: {
    kind: "command" as const,
    command: "dangerous-cmd",
    origin: "bash",
  },
  reason: "test danger",
  prompt: { kind: "permission" as const },
  context: { toolName: "bash", input: { command: "dangerous-cmd" } },
};

function createPi() {
  return {
    events: { emit: vi.fn() },
  } as unknown as ExtensionAPI;
}

describe("withActionPromptLifecycle", () => {
  it("emits prompted before awaiting and resolved after the prompt returns", async () => {
    const pi = createPi();
    let resolvePrompt: ((value: "allow") => void) | undefined;
    const prompt = new Promise<"allow">((resolve) => {
      resolvePrompt = resolve;
    });

    const resultPromise = withActionPromptLifecycle(
      pi,
      promptEvent,
      () => prompt,
    );

    expect(pi.events.emit).toHaveBeenCalledTimes(1);
    expect(pi.events.emit).toHaveBeenNthCalledWith(
      1,
      GUARDRAILS_ACTION_PROMPTED_EVENT,
      expect.objectContaining(promptEvent),
    );

    resolvePrompt?.("allow");
    await expect(resultPromise).resolves.toBe("allow");

    expect(pi.events.emit).toHaveBeenNthCalledWith(
      2,
      GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
      expect.objectContaining(promptEvent),
    );
  });

  it("emits resolved when the prompt throws", async () => {
    const pi = createPi();

    await expect(
      withActionPromptLifecycle(pi, promptEvent, async () => {
        throw new Error("prompt failed");
      }),
    ).rejects.toThrow("prompt failed");

    expect(pi.events.emit).toHaveBeenLastCalledWith(
      GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
      expect.objectContaining(promptEvent),
    );
  });
});
