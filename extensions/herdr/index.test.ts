import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPromptClosedPayload,
  createPromptOpenedPayload,
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
} from "../../src/shared/events";
import herdr from "./index";

const HERDR_BLOCKED_EVENT = "herdr:blocked";

const promptEvent = {
  feature: "permissionGate" as const,
  action: {
    kind: "command" as const,
    command: "dangerous-cmd",
    origin: "bash",
  },
  reason: "test danger",
  prompt: { kind: "permission" as const },
};

function registeredExtensionHandler(
  pi: DeepMocked<ExtensionAPI>,
  event: string,
) {
  const calls: unknown[][] = pi.on.mock.calls;
  return calls.find(([registeredEvent]) => registeredEvent === event)?.[1];
}

describe("herdr extension", () => {
  let pi: DeepMocked<ExtensionAPI>;
  let stopListening: Array<ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    const events = createEventBus();
    const on = events.on.bind(events);
    stopListening = [];
    vi.spyOn(events, "on").mockImplementation((channel, handler) => {
      const stop = vi.fn(on(channel, handler));
      stopListening.push(stop);
      return stop;
    });
    vi.spyOn(events, "emit");
    pi = createMock<ExtensionAPI>({ events });
    herdr(pi);
  });

  it("maps matching Guardrails prompt events to Herdr blocked state", () => {
    const opened = createPromptOpenedPayload(promptEvent);
    const closed = createPromptClosedPayload(opened);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(GUARDRAILS_PROMPT_CLOSED_EVENT, closed);

    expect(pi).toHaveEmitted(
      HERDR_BLOCKED_EVENT,
      expect.objectContaining({
        active: true,
        label: "Guardrails approval required",
      }),
    );
    expect(pi).toHaveEmitted(
      HERDR_BLOCKED_EVENT,
      expect.objectContaining({ active: false }),
    );
    expect(
      pi.events.emit.mock.calls.filter(
        ([event]) => event === HERDR_BLOCKED_EVENT,
      ),
    ).toHaveLength(2);
  });

  it("ignores missing, duplicate, and unmatched IDs", () => {
    const opened = createPromptOpenedPayload(promptEvent);
    const other = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, null);
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, {});
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(other),
    );
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );

    expect(pi).toHaveEmitted(
      HERDR_BLOCKED_EVENT,
      expect.objectContaining({ active: true }),
    );
    expect(pi).toHaveEmitted(
      HERDR_BLOCKED_EVENT,
      expect.objectContaining({ active: false }),
    );
    expect(
      pi.events.emit.mock.calls.filter(
        ([event]) => event === HERDR_BLOCKED_EVENT,
      ),
    ).toHaveLength(2);
  });

  it("balances active prompts and unsubscribes on shutdown", () => {
    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );
    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );

    const shutdown = registeredExtensionHandler(pi, "session_shutdown");
    assert(
      typeof shutdown === "function",
      "session_shutdown handler should be registered",
    );
    shutdown();

    expect(pi).toHaveEmitted(
      HERDR_BLOCKED_EVENT,
      expect.objectContaining({ active: false }),
    );
    expect(
      pi.events.emit.mock.calls.filter(
        ([event]) => event === HERDR_BLOCKED_EVENT,
      ),
    ).toHaveLength(4);
    expect(stopListening).toHaveLength(2);
    for (const stop of stopListening) {
      expect(stop).toHaveBeenCalledOnce();
    }

    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );
    expect(
      pi.events.emit.mock.calls.filter(
        ([event]) => event === HERDR_BLOCKED_EVENT,
      ),
    ).toHaveLength(4);
  });
});
