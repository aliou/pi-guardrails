import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPromptClosedPayload,
  createPromptOpenedPayload,
  GUARDRAILS_ACTION_PROMPTED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
  type GuardrailsActionPromptedPayload,
  setupLegacyPromptEventAlias,
} from "./events";

const promptEvent = {
  feature: "permissionGate" as const,
  action: {
    kind: "command" as const,
    command: "dangerous-cmd",
    origin: "bash",
  },
  reason: "test danger",
  prompt: {
    kind: "permission" as const,
    metadata: { pattern: "dangerous-cmd" },
  },
};

function registeredExtensionHandler(
  pi: DeepMocked<ExtensionAPI>,
  event: string,
) {
  const calls: unknown[][] = pi.on.mock.calls;
  return calls.find(([registeredEvent]) => registeredEvent === event)?.[1];
}

describe("prompt event payloads", () => {
  it("creates correlated opened and closed payloads", () => {
    const opened = createPromptOpenedPayload(promptEvent);
    const closed = createPromptClosedPayload(opened);

    expect(closed).toEqual(
      expect.objectContaining({
        source: "guardrails",
        feature: "permissionGate",
        prompt: { id: opened.prompt.id },
      }),
    );
  });

  it("creates a unique ID for each prompt", () => {
    const first = createPromptOpenedPayload(promptEvent);
    const second = createPromptOpenedPayload(promptEvent);

    expect(first.prompt.id).not.toBe(second.prompt.id);
  });
});

describe("setupLegacyPromptEventAlias", () => {
  let pi: DeepMocked<ExtensionAPI>;

  beforeEach(() => {
    const events = createEventBus();
    vi.spyOn(events, "emit");
    pi = createMock<ExtensionAPI>({ events });
  });

  it("forwards the old payload shape for the matching feature", () => {
    const opened = createPromptOpenedPayload(promptEvent);
    setupLegacyPromptEventAlias(pi, "permissionGate");

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);

    expect(pi).toHaveEmitted(
      GUARDRAILS_ACTION_PROMPTED_EVENT,
      expect.objectContaining({
        feature: "permissionGate",
        prompt: {
          kind: "permission",
          metadata: { pattern: "dangerous-cmd" },
        },
      }),
    );
    const legacyPayload = pi.events.emit.mock.calls.find(
      ([event]) => event === GUARDRAILS_ACTION_PROMPTED_EVENT,
    )?.[1] as GuardrailsActionPromptedPayload | undefined;
    assert(legacyPayload, "legacy prompt event should be emitted");
    expect(legacyPayload.prompt).not.toHaveProperty("id");
  });

  it("ignores prompts from another feature", () => {
    setupLegacyPromptEventAlias(pi, "pathAccess");

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, null);
    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );

    expect(pi.events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_ACTION_PROMPTED_EVENT,
      expect.anything(),
    );
  });

  it("unsubscribes on session shutdown", () => {
    setupLegacyPromptEventAlias(pi, "permissionGate");

    const shutdown = registeredExtensionHandler(pi, "session_shutdown");
    assert(
      typeof shutdown === "function",
      "session_shutdown handler should be registered",
    );
    shutdown();

    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );
    expect(pi.events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_ACTION_PROMPTED_EVENT,
      expect.anything(),
    );
  });
});
