import {
  createEventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import {
  afterEach,
  assert,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from "vitest";
import {
  createPromptClosedPayload,
  createPromptOpenedPayload,
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
} from "../../src/shared/events";
import programStatus from "./index";

const BLOCKED_REPORT =
  "\u001b]7501;state=blocked:app=pi:kind=permission:msg=R3VhcmRyYWlscyBhcHByb3ZhbCByZXF1aXJlZA==\u001b\\";
const WORKING_REPORT =
  "\u001b]7501;state=working:app=pi:msg=Zml4LWxvZ2luLXJlZGlyZWN0\u001b\\";

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

describe("program-status extension", () => {
  let pi: DeepMocked<ExtensionAPI>;
  let stopListening: Array<ReturnType<typeof vi.fn>>;
  let write: MockInstance<typeof process.stdout.write>;
  const originalIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    process.stdout.isTTY = true;
    vi.stubEnv("PI_PROGRAM_STATUS", undefined);
    write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

    const events = createEventBus();
    const on = events.on.bind(events);
    stopListening = [];
    vi.spyOn(events, "on").mockImplementation((channel, handler) => {
      const stop = vi.fn(on(channel, handler));
      stopListening.push(stop);
      return stop;
    });
    pi = createMock<ExtensionAPI>({ events });
    pi.getSessionName.mockReturnValue("fix-login-redirect");
    programStatus(pi);
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    write.mockRestore();
  });

  it("reports blocked while a prompt is open and restores working", () => {
    const opened = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );

    expect(write.mock.calls).toEqual([[BLOCKED_REPORT], [WORKING_REPORT]]);
  });

  it("reports once for overlapping prompts", () => {
    const first = createPromptOpenedPayload(promptEvent);
    const second = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, first);
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, second);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(first),
    );
    expect(write.mock.calls).toEqual([[BLOCKED_REPORT]]);

    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(second),
    );
    expect(write.mock.calls).toEqual([[BLOCKED_REPORT], [WORKING_REPORT]]);
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

    expect(write.mock.calls).toEqual([[BLOCKED_REPORT], [WORKING_REPORT]]);
  });

  it("omits the message when the session has no name", () => {
    pi.getSessionName.mockReturnValue(undefined);
    const opened = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );

    expect(write).toHaveBeenLastCalledWith(
      "\u001b]7501;state=working:app=pi\u001b\\",
    );
  });

  it("writes nothing when stdout is not a terminal", () => {
    process.stdout.isTTY = false;
    const opened = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );

    expect(write).not.toHaveBeenCalled();
  });

  it("writes nothing when PI_PROGRAM_STATUS is 0", () => {
    vi.stubEnv("PI_PROGRAM_STATUS", "0");
    const opened = createPromptOpenedPayload(promptEvent);

    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
    pi.events.emit(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      createPromptClosedPayload(opened),
    );

    expect(write).not.toHaveBeenCalled();
  });

  it("unsubscribes on shutdown", () => {
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

    expect(stopListening).toHaveLength(2);
    for (const stop of stopListening) {
      expect(stop).toHaveBeenCalledOnce();
    }

    pi.events.emit(
      GUARDRAILS_PROMPT_OPENED_EVENT,
      createPromptOpenedPayload(promptEvent),
    );
    expect(write.mock.calls).toEqual([[BLOCKED_REPORT]]);
  });
});
