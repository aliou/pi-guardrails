import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dismissOnAbort,
  formatDuration,
  isPromptResponse,
  promptWaitHint,
  racePrompt,
} from "./respond";
import type {
  DelegationContext,
  GuardrailsDelegate,
  PromptResponseRequest,
} from "./types";

const request: PromptResponseRequest = {
  feature: "permissionGate",
  action: { kind: "command", command: "rm -rf build", origin: "bash" },
  reason: "recursive force delete",
  toolName: "bash",
  input: { command: "rm -rf build" },
  promptId: "prompt-1",
  choices: ["allow", "deny"],
};

const ctx = {
  cwd: "/workspace",
  sessionManager: {},
  modelRegistry: {},
} as unknown as Omit<DelegationContext, "signal">;

function responder(
  respond: GuardrailsDelegate["respond"],
  name = "remote",
): GuardrailsDelegate {
  return { id: `test:${name}`, name, respond };
}

/** A local prompt that only settles when dismissed, like a user who is away. */
function awayFromKeyboard(onSignal?: (signal: AbortSignal) => void) {
  return (signal: AbortSignal) =>
    new Promise<string>((resolve) => {
      onSignal?.(signal);
      signal.addEventListener("abort", () => resolve("dismissed"), {
        once: true,
      });
    });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("racePrompt", () => {
  it("returns the local answer when nobody else answers", async () => {
    const outcome = await racePrompt([], request, ctx, {
      timeoutMs: 0,
      local: async () => "allow",
    });
    expect(outcome).toMatchObject({ by: "local", result: "allow" });
  });

  it("lets a responder answer while the local prompt is open, and dismisses it", async () => {
    let localSignal: AbortSignal | undefined;
    const respond = vi.fn(async () => ({
      choice: "allow" as const,
      reason: "approved remotely",
    }));

    const outcome = await racePrompt([responder(respond)], request, ctx, {
      timeoutMs: 0,
      local: awayFromKeyboard((signal) => {
        localSignal = signal;
      }),
    });

    expect(outcome).toMatchObject({
      by: "responder",
      responder: { id: "test:remote", name: "remote" },
      response: { choice: "allow", reason: "approved remotely" },
    });
    expect(localSignal?.aborted).toBe(true);
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId: "prompt-1",
        action: expect.objectContaining({ command: "rm -rf build" }),
        choices: ["allow", "deny"],
      }),
      expect.objectContaining({ cwd: "/workspace" }),
    );
  });

  it("aborts responders once the local user answers", async () => {
    let responderSignal: AbortSignal | undefined;
    const pending = responder((_request, context) => {
      responderSignal = context.signal;
      return new Promise(() => {});
    });

    const outcome = await racePrompt([pending], request, ctx, {
      timeoutMs: 0,
      local: async () => "deny",
    });

    expect(outcome).toMatchObject({ by: "local", result: "deny" });
    expect(responderSignal?.aborted).toBe(true);
  });

  it("ignores responders that abstain, throw, or answer an unknown choice", async () => {
    const outcome = await racePrompt(
      [
        responder(() => undefined, "abstains"),
        responder(() => {
          throw new Error("transport is down");
        }, "throws"),
        responder(async () => Promise.reject(new Error("rejected")), "rejects"),
        responder(
          () =>
            ({ choice: "allow-session", reason: "x" }) as unknown as {
              choice: "allow";
              reason: string;
            },
          "malformed",
        ),
      ],
      request,
      ctx,
      {
        timeoutMs: 0,
        local: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return "allow";
        },
      },
    );
    expect(outcome).toMatchObject({ by: "local", result: "allow" });
  });

  it("only accepts the choices the prompt offers", async () => {
    const outcome = await racePrompt(
      [responder(async () => ({ choice: "allow", reason: "ok" }))],
      { ...request, choices: ["deny"] },
      ctx,
      {
        timeoutMs: 0,
        local: async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return "local";
        },
      },
    );
    expect(outcome.by).toBe("local");
  });

  it("times out when nobody answers, dismissing the prompt and aborting responders", async () => {
    vi.useFakeTimers();
    let responderSignal: AbortSignal | undefined;
    let localSignal: AbortSignal | undefined;
    const race = racePrompt(
      [
        responder((_request, context) => {
          responderSignal = context.signal;
          return new Promise(() => {});
        }),
      ],
      request,
      ctx,
      {
        timeoutMs: 300_000,
        local: awayFromKeyboard((signal) => {
          localSignal = signal;
        }),
      },
    );

    await vi.advanceTimersByTimeAsync(300_000);
    await expect(race).resolves.toMatchObject({ by: "timeout" });
    expect(localSignal?.aborted).toBe(true);
    expect(responderSignal?.aborted).toBe(true);
  });

  it("waits forever when the timeout is 0", async () => {
    vi.useFakeTimers();
    let settled = false;
    let answer: (value: string) => void = () => {};
    const race = racePrompt([], request, ctx, {
      timeoutMs: 0,
      local: () =>
        new Promise<string>((resolve) => {
          answer = resolve;
        }),
    }).then((outcome) => {
      settled = true;
      return outcome;
    });

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(settled).toBe(false);
    answer("allow");
    await expect(race).resolves.toMatchObject({ by: "local", result: "allow" });
  });

  it("rethrows a failing local prompt", async () => {
    await expect(
      racePrompt([], request, ctx, {
        timeoutMs: 0,
        local: async () => {
          throw new Error("ui crashed");
        },
      }),
    ).rejects.toThrow("ui crashed");
  });
});

describe("dismissOnAbort", () => {
  it("closes the component with the given value once the signal aborts", async () => {
    const controller = new AbortController();
    const done = vi.fn();
    const factory = vi.fn(() => "component");
    const wrapped = dismissOnAbort(factory, controller.signal, "deny");

    expect(wrapped(null, null, null, done)).toBe("component");
    controller.abort();
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("deny");
  });

  it("does not close twice after the user answered", async () => {
    const controller = new AbortController();
    const done = vi.fn();
    let close: (result: string) => void = () => {};
    const wrapped = dismissOnAbort(
      (_tui: null, _theme: null, _kb: null, d: (result: string) => void) => {
        close = d;
      },
      controller.signal,
      "deny",
    );

    wrapped(null, null, null, done);
    close("allow");
    controller.abort();
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith("allow");
  });
});

describe("isPromptResponse", () => {
  it("accepts a choice the prompt offers with a reason", () => {
    expect(isPromptResponse({ choice: "deny", reason: "no" }, ["deny"])).toBe(
      true,
    );
  });

  it.each([
    undefined,
    null,
    "allow",
    { choice: "allow" },
    { choice: "maybe", reason: "x" },
  ])("rejects %j", (value) => {
    expect(isPromptResponse(value, ["allow", "deny"])).toBe(false);
  });
});

describe("promptWaitHint", () => {
  it("is empty without responders or a timeout", () => {
    expect(promptWaitHint([], 0)).toBeUndefined();
  });

  it("names responders and the timeout", () => {
    expect(promptWaitHint([{ name: "approver" }], 300_000)).toBe(
      "Also waiting on approver; the first answer wins. Denied after 5m without an answer.",
    );
  });
});

describe("formatDuration", () => {
  it.each([
    [45_000, "45s"],
    [300_000, "5m"],
    [150_000, "2m 30s"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
