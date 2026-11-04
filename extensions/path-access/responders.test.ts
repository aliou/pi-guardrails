import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type GuardrailsDelegate,
  registerDelegate,
} from "../../src/shared/delegation";
import { GUARDRAILS_ACTION_BLOCKED_EVENT } from "../../src/shared/events";
import { NOOP_THEME } from "../../tests/utils/theme";
import pathAccess from "./index";

const state = { promptTimeoutMs: 0 };

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn(async () => undefined),
    getProjectState: vi.fn(() => "trusted"),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { pathAccess: true },
      delegation: { timeoutMs: 1000 },
      pathAccess: {
        mode: "ask",
        applyTo: "all",
        allowedPaths: [],
        alwaysScope: "local",
        promptTimeoutMs: state.promptTimeoutMs,
      },
    })),
    getRawConfig: vi.fn(() => null),
    save: vi.fn(async () => undefined),
  },
}));

vi.mock("./dynamic-resources", () => ({
  piDocumentationPaths: vi.fn(() => []),
}));

vi.mock("./targets", () => ({
  targetsForTool: vi.fn(async () => ["/outside/a.txt", "/outside/b.txt"]),
  isReadOnlyTool: vi.fn(() => true),
}));

type Factory = (
  tui: unknown,
  theme: unknown,
  kb: unknown,
  done: (result: string) => void,
) => void;

/** A TUI custom() where nobody is at the keyboard: it only closes when dismissed. */
const awayCustom = () =>
  vi.fn(
    (factory: Factory) =>
      new Promise<string>((resolve) => {
        factory(
          { terminal: { columns: 80 }, requestRender() {} },
          NOOP_THEME,
          {},
          resolve,
        );
      }),
  );

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

  await pathAccess(pi);
  if (delegate) {
    registerDelegate(pi, { id: "test:slack", name: "slack", ...delegate });
  }

  const custom = awayCustom();
  const notify = vi.fn();
  const ctx = {
    cwd: "/workspace",
    hasUI: true,
    mode: "tui",
    signal: undefined,
    sessionManager: {},
    modelRegistry: {},
    ui: { custom, notify, select: vi.fn(), setWidget: vi.fn() },
  } as unknown as ExtensionContext;

  const blocked = vi.fn();
  bus.on(GUARDRAILS_ACTION_BLOCKED_EVENT, blocked);

  const toolCall = handlers.get("tool_call") as unknown as (
    event: ToolCallEvent,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
  const run = () =>
    toolCall(
      {
        type: "tool_call",
        toolCallId: "c1",
        toolName: "read",
        input: { path: "/outside/a.txt" },
      } as ToolCallEvent,
      ctx,
    );

  return { run, custom, notify, blocked };
}

describe("path access prompt responders", () => {
  beforeEach(() => {
    state.promptTimeoutMs = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks responders about each prompted path with its resolved path", async () => {
    const respond = vi.fn(async () => ({
      choice: "allow" as const,
      reason: "ok",
    }));
    const { run, custom } = await setup({ respond });

    await expect(run()).resolves.toBeUndefined();

    expect(custom).toHaveBeenCalledTimes(2);
    expect(respond).toHaveBeenCalledTimes(2);
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "pathAccess",
        action: expect.objectContaining({ path: "/outside/b.txt" }),
        promptId: expect.any(String),
        choices: ["allow", "deny"],
      }),
      expect.anything(),
    );
  });

  it("blocks the tool call when a responder denies", async () => {
    const { run, blocked } = await setup({
      respond: async () => ({ choice: "deny", reason: "not that file" }),
    });

    await expect(run()).resolves.toEqual({
      block: true,
      reason: "Denied by slack: not that file",
    });
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ source: "responder" }),
      }),
    );
  });

  it("denies after promptTimeoutMs when nobody answers", async () => {
    vi.useFakeTimers();
    state.promptTimeoutMs = 60_000;
    const { run, blocked } = await setup();

    const result = run();
    await vi.advanceTimersByTimeAsync(60_000);

    await expect(result).resolves.toEqual({
      block: true,
      reason: "Access outside working directory denied: no answer within 1m",
    });
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        block: expect.objectContaining({ source: "timeout" }),
      }),
    );
  });
});
