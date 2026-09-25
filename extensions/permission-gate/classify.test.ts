import type {
  BashToolCallEvent,
  EventBusController,
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  SessionShutdownEvent,
  SessionStartEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_CLASSIFY_CHECK_EVENT,
  GUARDRAILS_CLASSIFY_DECISION_EVENT,
  GUARDRAILS_CLASSIFY_REQUEST_EVENT,
  type GuardrailsClassifierRegistration,
  type GuardrailsClassifyCheckPayload,
  type GuardrailsClassifyRequestPayload,
} from "../../src/shared/events";
import permissionGate from "./index";

// No configured patterns: every command reaches the classifier stage as safe.
vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { permissionGate: true, policies: true, pathAccess: true },
      permissionGate: {
        patterns: [],
        useBuiltinMatchers: false,
        requireConfirmation: true,
        allowedPatterns: [],
        autoDenyPatterns: [],
      },
    })),
  },
}));

const CLASSIFIER: GuardrailsClassifierRegistration = {
  id: "echo-classifier",
  name: "Echo classifier",
};

const SAFE_EVENT = {
  type: "tool_call",
  toolCallId: "safe-call",
  toolName: "bash",
  input: { command: "ls -la" },
} satisfies BashToolCallEvent;

/**
 * Stand in for a classifier extension: answers the handshake, then replies to
 * every check with `reason` (or without it, to pass).
 */
function registerEchoClassifier(events: EventBusController, reason?: string) {
  events.on(GUARDRAILS_CLASSIFY_REQUEST_EVENT, (data) => {
    (data as GuardrailsClassifyRequestPayload).answer(CLASSIFIER);
  });
  events.on(GUARDRAILS_CLASSIFY_CHECK_EVENT, (data) => {
    const check = data as GuardrailsClassifyCheckPayload;
    events.emit(GUARDRAILS_CLASSIFY_DECISION_EVENT, {
      requestId: check.requestId,
      classifierId: CLASSIFIER.id,
      reason,
    });
  });
}

describe("permissionGate classifier escalation", () => {
  let events: EventBusController;
  let pi: DeepMocked<ExtensionAPI>;
  let ctx: DeepMocked<ExtensionContext>;

  function registeredHandlers<TEvent, TResult>(
    event: string,
  ): ExtensionHandler<TEvent, TResult>[] {
    const calls: unknown[][] = pi.on.mock.calls;
    const handlers = calls
      .filter(([registered]) => registered === event)
      .map(([, handler]) => handler as ExtensionHandler<TEvent, TResult>);
    assert(handlers.length > 0, `${event} handler is registered`);
    return handlers;
  }

  function registeredHandler<TEvent, TResult>(
    event: string,
  ): ExtensionHandler<TEvent, TResult> {
    return registeredHandlers<TEvent, TResult>(event)[0];
  }

  async function startSession() {
    const sessionStart = registeredHandler<SessionStartEvent, void>(
      "session_start",
    );
    await sessionStart(
      { type: "session_start", reason: "startup" },
      createMock<ExtensionContext>(),
    );
  }

  function runToolCall(event: ToolCallEvent = SAFE_EVENT) {
    const toolCall = registeredHandler<ToolCallEvent, ToolCallEventResult>(
      "tool_call",
    );
    return toolCall(event, ctx);
  }

  beforeEach(async () => {
    events = createEventBus();
    vi.spyOn(events, "emit");
    pi = createMock<ExtensionAPI>({ events });
    ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
      ui: {
        custom: vi.fn().mockResolvedValue(undefined),
        select: vi.fn().mockResolvedValue(undefined),
        notify: vi.fn(),
      },
      abort: vi.fn(),
    });
    await permissionGate(pi);
  });

  it("escalates a flagged command to the confirmation prompt and blocks on deny", async () => {
    registerEchoClassifier(events, "looks irreversible");
    await startSession();
    ctx.ui.custom.mockResolvedValue("deny");

    const result = await runToolCall();

    expect(ctx.ui.custom).toHaveBeenCalled();
    expect(result).toEqual({
      block: true,
      reason: "User denied dangerous command",
    });
  });

  it("allows a flagged command the user confirms", async () => {
    registerEchoClassifier(events, "looks irreversible");
    await startSession();
    ctx.ui.custom.mockResolvedValue("allow");

    await expect(runToolCall()).resolves.toBeUndefined();
  });

  it("does not prompt when the classifier passes", async () => {
    registerEchoClassifier(events);
    await startSession();

    await expect(runToolCall()).resolves.toBeUndefined();
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("does not emit checks when no classifier is registered", async () => {
    await startSession();

    await expect(runToolCall()).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_CLASSIFY_CHECK_EVENT,
      expect.anything(),
    );
  });

  it("does not emit checks before the session_start handshake", async () => {
    registerEchoClassifier(events, "looks irreversible");

    await expect(runToolCall()).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_CLASSIFY_CHECK_EVENT,
      expect.anything(),
    );
  });

  it("stops consulting classifiers after session shutdown", async () => {
    registerEchoClassifier(events, "looks irreversible");
    await startSession();
    vi.mocked(events.emit).mockClear();

    // Several handlers listen on session_shutdown; run all of them.
    for (const shutdown of registeredHandlers<SessionShutdownEvent, void>(
      "session_shutdown",
    )) {
      await shutdown(
        { type: "session_shutdown", reason: "quit" },
        createMock<ExtensionContext>(),
      );
    }

    await expect(runToolCall()).resolves.toBeUndefined();
    expect(events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_CLASSIFY_CHECK_EVENT,
      expect.anything(),
    );
  });
});
