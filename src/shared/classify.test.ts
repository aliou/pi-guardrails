import {
  createEventBus,
  type EventBus,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createClassifyClient,
  GUARDRAILS_CLASSIFY_MAX_MISSES,
  GUARDRAILS_CLASSIFY_TIMEOUT_MS,
} from "./classify";
import {
  GUARDRAILS_CLASSIFY_CHECK_EVENT,
  GUARDRAILS_CLASSIFY_REQUEST_EVENT,
  type GuardrailsClassifierRegistration,
  type GuardrailsClassifyCheckPayload,
} from "./events";

const CLASSIFIER: GuardrailsClassifierRegistration = {
  id: "test-classifier",
  name: "Test classifier",
};
const ACTION = { kind: "command" as const, command: "ls -la", origin: "bash" };
const CWD = "/workspace";

function latestCheck(events: EventBus): GuardrailsClassifyCheckPayload {
  const calls = vi.mocked(events.emit).mock.calls;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    if (calls[i][0] === GUARDRAILS_CLASSIFY_CHECK_EVENT) {
      return calls[i][1] as GuardrailsClassifyCheckPayload;
    }
  }
  throw new Error("no check emitted");
}

function reply(events: EventBus, requestId: string, reason?: string): void {
  events.emit("guardrails:classify:decision", {
    requestId,
    classifierId: CLASSIFIER.id,
    reason,
  });
}

describe("classify client", () => {
  let events: EventBus;
  let pi: DeepMocked<ExtensionAPI>;

  beforeEach(() => {
    events = createEventBus();
    vi.spyOn(events, "emit");
    pi = createMock<ExtensionAPI>({ events });
  });

  it("registers classifiers through the request handshake", () => {
    const client = createClassifyClient(pi);

    expect(client.hasClassifiers()).toBe(false);
    client.requestClassifiers();
    expect(client.hasClassifiers()).toBe(false);

    latestRequest(events)?.(CLASSIFIER);
    expect(client.hasClassifiers()).toBe(true);
  });

  it("replaces the roster on every request", () => {
    const client = createClassifyClient(pi);

    client.requestClassifiers();
    latestRequest(events)?.(CLASSIFIER);
    expect(client.hasClassifiers()).toBe(true);

    // Second session: no classifier answers.
    client.requestClassifiers();
    expect(client.hasClassifiers()).toBe(false);
  });

  it("short-circuits without classifiers", async () => {
    const client = createClassifyClient(pi);

    const reason = await client.requestCheck({ action: ACTION, cwd: CWD });

    expect(reason).toBeUndefined();
    expect(events.emit).not.toHaveBeenCalledWith(
      GUARDRAILS_CLASSIFY_CHECK_EVENT,
      expect.anything(),
    );
  });

  it("resolves with the first flag reason", async () => {
    vi.useFakeTimers();
    try {
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);

      const check = client.requestCheck({ action: ACTION, cwd: CWD });
      const requestId = latestCheck(events).requestId;
      reply(events, requestId, "likely irreversible");

      await expect(check).resolves.toEqual({
        classifierId: CLASSIFIER.id,
        reason: "likely irreversible",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves undefined when the classifier passes", async () => {
    vi.useFakeTimers();
    try {
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);

      const check = client.requestCheck({ action: ACTION, cwd: CWD });
      reply(events, latestCheck(events).requestId);

      await expect(check).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails open on timeout and drops wedged classifiers", async () => {
    vi.useFakeTimers();
    try {
      const onDropped = vi.fn();
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);

      for (let i = 0; i < GUARDRAILS_CLASSIFY_MAX_MISSES; i += 1) {
        const check = client.requestCheck({
          action: ACTION,
          cwd: CWD,
          onDropped,
        });
        await vi.advanceTimersByTimeAsync(GUARDRAILS_CLASSIFY_TIMEOUT_MS);
        await expect(check).resolves.toBeUndefined();
      }

      expect(onDropped).toHaveBeenCalledWith(
        expect.objectContaining({ id: CLASSIFIER.id }),
      );
      expect(client.hasClassifiers()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes the action and cwd through in the check payload", async () => {
    vi.useFakeTimers();
    try {
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);

      const check = client.requestCheck({ action: ACTION, cwd: CWD });
      const payload = latestCheck(events);
      expect(payload).toEqual(
        expect.objectContaining({
          source: "guardrails",
          action: ACTION,
          cwd: CWD,
        }),
      );
      reply(events, payload.requestId);
      await check;
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts decisions again after a dispose and re-request", async () => {
    vi.useFakeTimers();
    try {
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);
      client.dispose();

      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);
      const check = client.requestCheck({ action: ACTION, cwd: CWD });
      reply(events, latestCheck(events).requestId, "still listening");

      await expect(check).resolves.toEqual({
        classifierId: CLASSIFIER.id,
        reason: "still listening",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores decisions for unknown request ids", async () => {
    vi.useFakeTimers();
    try {
      const client = createClassifyClient(pi);
      client.requestClassifiers();
      latestRequest(events)?.(CLASSIFIER);

      const check = client.requestCheck({ action: ACTION, cwd: CWD });
      events.emit("guardrails:classify:decision", {
        requestId: "stale-request",
        classifierId: CLASSIFIER.id,
        reason: "should be ignored",
      });
      const requestId = latestCheck(events).requestId;
      reply(events, requestId);

      await expect(check).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

function latestRequest(
  events: EventBus,
): ((r: GuardrailsClassifierRegistration) => void) | undefined {
  const calls = vi.mocked(events.emit).mock.calls;
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    if (calls[i][0] === GUARDRAILS_CLASSIFY_REQUEST_EVENT) {
      const payload = calls[i][1] as {
        answer: (r: GuardrailsClassifierRegistration) => void;
      };
      return payload.answer;
    }
  }
  return undefined;
}
