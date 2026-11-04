import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/shared/config";
import {
  type GuardrailsDelegate,
  registerDelegate,
} from "../../src/shared/delegation";
import {
  GUARDRAILS_ACTION_BLOCKED_EVENT,
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
} from "../../src/shared/events";
import { NOOP_THEME } from "../../tests/utils/theme";
import permissionGate from "./index";

const state = { promptTimeoutMs: 0 };

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(
      () =>
        ({
          enabled: true,
          features: { permissionGate: true },
          delegation: { timeoutMs: 1000 },
          permissionGate: {
            patterns: [
              { pattern: "dangerous-cmd", description: "test danger" },
            ],
            useBuiltinMatchers: false,
            requireConfirmation: true,
            allowedPatterns: [],
            autoDenyPatterns: [],
            promptTimeoutMs: state.promptTimeoutMs,
          },
        }) as unknown as ResolvedConfig,
    ),
  },
}));

type Done = (result: string) => void;
type Factory = (tui: unknown, theme: unknown, kb: unknown, done: Done) => void;

/** A TUI custom() that renders the component and waits for it to close. */
function tuiCustom(answer?: string) {
  return vi.fn(
    (factory: Factory) =>
      new Promise<string>((resolve) => {
        factory(
          { terminal: { rows: 40, columns: 80 }, requestRender() {} },
          NOOP_THEME,
          {},
          resolve,
        );
        if (answer) queueMicrotask(() => resolve(answer));
      }),
  );
}

async function setup(delegate?: Partial<GuardrailsDelegate>) {
  const bus = createEventBus();
  const handlers = new Map<string, (...args: never[]) => unknown>();
  const pi = {
    events: bus,
    on: vi.fn((event: string, handler: (...args: never[]) => unknown) => {
      handlers.set(event, handler);
    }),
    appendEntry: vi.fn(),
    registerEntryRenderer: vi.fn(),
  } as unknown as ExtensionAPI;

  if (delegate) {
    registerDelegate(pi, { id: "test:slack", name: "slack", ...delegate });
  }
  await permissionGate(pi);

  const notify = vi.fn();
  const makeCtx = (ui: Record<string, unknown>) =>
    ({
      cwd: "/workspace",
      hasUI: true,
      signal: undefined,
      sessionManager: {},
      modelRegistry: {},
      ui: { notify, select: vi.fn(), setWidget: vi.fn(), ...ui },
      abort: vi.fn(),
    }) as unknown as ExtensionContext;

  const blocked = vi.fn();
  const opened = vi.fn();
  const closed = vi.fn();
  bus.on(GUARDRAILS_ACTION_BLOCKED_EVENT, blocked);
  bus.on(GUARDRAILS_PROMPT_OPENED_EVENT, opened);
  bus.on(GUARDRAILS_PROMPT_CLOSED_EVENT, closed);

  const toolCall = handlers.get("tool_call") as unknown as (
    event: ToolCallEvent,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
  const run = (ctx: ExtensionContext, command = "dangerous-cmd") =>
    toolCall(
      {
        type: "tool_call",
        toolCallId: "c1",
        toolName: "bash",
        input: { command },
      } as ToolCallEvent,
      ctx,
    );

  return { run, makeCtx, notify, blocked, opened, closed };
}

describe("permission gate prompt responders", () => {
  beforeEach(() => {
    state.promptTimeoutMs = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets a responder allow once while the local prompt is open", async () => {
    const respond = vi.fn(async () => ({
      choice: "allow" as const,
      reason: "approved by @jas",
    }));
    const { run, makeCtx, notify, opened, closed } = await setup({ respond });
    const custom = tuiCustom();

    await expect(run(makeCtx({ custom }))).resolves.toBeUndefined();

    expect(custom).toHaveBeenCalledOnce();
    const promptId = opened.mock.calls[0]?.[0].prompt.id;
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        promptId,
        feature: "permissionGate",
        action: expect.objectContaining({ command: "dangerous-cmd" }),
        choices: ["allow", "deny"],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(closed).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: { id: promptId } }),
    );
    expect(notify).toHaveBeenCalledWith(
      "Allowed by slack: approved by @jas",
      "info",
    );
  });

  it("blocks with the responder's reason when it denies", async () => {
    const { run, makeCtx, blocked } = await setup({
      respond: async () => ({ choice: "deny", reason: "not on prod" }),
    });

    await expect(run(makeCtx({ custom: tuiCustom() }))).resolves.toEqual({
      block: true,
      reason: "Denied by slack: not on prod",
    });
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ source: "responder" }),
      }),
    );
  });

  it("keeps the local answer and aborts the responder when the user answers first", async () => {
    let signal: AbortSignal | undefined;
    const { run, makeCtx } = await setup({
      respond: (_request, context) => {
        signal = context.signal;
        return new Promise(() => {});
      },
    });

    await expect(
      run(makeCtx({ custom: tuiCustom("deny") })),
    ).resolves.toMatchObject({
      block: true,
      reason: "User denied dangerous command",
    });
    expect(signal?.aborted).toBe(true);
  });

  it("does not run decide() for a responder-only delegate", async () => {
    const respond = vi.fn(() => undefined);
    const { run, makeCtx } = await setup({ respond });
    const custom = tuiCustom("allow");
    await expect(run(makeCtx({ custom }))).resolves.toBeUndefined();
    expect(respond).toHaveBeenCalledOnce();
  });

  it("dismisses the RPC select dialog when a responder answers", async () => {
    const { run, makeCtx } = await setup({
      respond: async () => ({ choice: "allow", reason: "ok" }),
    });
    const select = vi.fn(
      (_title: string, _options: string[], opts: { signal: AbortSignal }) =>
        new Promise<string | undefined>((resolve) => {
          opts.signal.addEventListener("abort", () => resolve(undefined));
        }),
    );

    await expect(
      run(makeCtx({ custom: vi.fn(async () => undefined), select })),
    ).resolves.toBeUndefined();
  });

  it("denies after promptTimeoutMs when nobody answers", async () => {
    vi.useFakeTimers();
    state.promptTimeoutMs = 300_000;
    const { run, makeCtx, blocked, notify } = await setup();

    const result = run(makeCtx({ custom: tuiCustom() }));
    await vi.advanceTimersByTimeAsync(300_000);

    await expect(result).resolves.toEqual({
      block: true,
      reason: "Dangerous command denied: no answer within 5m",
    });
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ source: "timeout" }),
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      "Dangerous command denied: no answer within 5m",
      "warning",
    );
  });
});
