import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  ReadToolCallEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_ACTION_BLOCKED_EVENT,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
} from "../../src/shared/events";
import permissionGate from "./index";

// Control the config the hook sees without touching the real config loader.
vi.mock("../../src/shared/config", () => {
  function makeConfig(overrides: Record<string, unknown> = {}) {
    return {
      enabled: true,
      features: { permissionGate: true, policies: true, pathAccess: true },
      permissionGate: {
        patterns: [{ pattern: "dangerous-cmd", description: "test danger" }],
        useBuiltinMatchers: false,
        requireConfirmation: true,
        allowedPatterns: [],
        autoDenyPatterns: [],
        ...overrides,
      },
    };
  }

  return {
    configLoader: {
      load: vi.fn().mockResolvedValue(undefined),
      getConfig: vi.fn(() => makeConfig()),
    },
  };
});

type ToolCallHandler = ExtensionHandler<ToolCallEvent, ToolCallEventResult>;

interface MockPi {
  events: { on: ReturnType<typeof vi.fn>; emit: ReturnType<typeof vi.fn> };
  on: ReturnType<typeof vi.fn>;
}

function createPi(): MockPi & { callHook: ToolCallHandler } {
  let hook: ToolCallHandler | undefined;
  const pi: MockPi = {
    events: { on: vi.fn(), emit: vi.fn() },
    on: vi.fn((event: string, handler: ToolCallHandler) => {
      if (event === "tool_call") hook = handler;
    }),
  };
  return {
    ...pi,
    callHook: (...args) => {
      if (!hook) throw new Error("tool_call hook not registered");
      return hook(...args);
    },
  };
}

function createCtx(overrides: Record<string, unknown> = {}) {
  return {
    hasUI: true,
    mode: "tui",
    ui: {
      custom: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn(),
    },
    abort: vi.fn(),
    ...overrides,
  } as unknown as ExtensionContext;
}

const DANGEROUS_EVENT = {
  toolName: "bash",
  input: { command: "dangerous-cmd" },
} as unknown as BashToolCallEvent;

describe("permissionGate extension hook", () => {
  it("registers the permissionGate feature on request", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const onCalls = pi.events.on.mock.calls;
    const requestHandler = onCalls.find(
      ([event]) => event === GUARDRAILS_FEATURE_REQUEST_EVENT,
    )?.[1] as ((...args: unknown[]) => void) | undefined;

    expect(requestHandler).toBeDefined();
    requestHandler?.();
    expect(pi.events.emit).toHaveBeenCalledWith(
      GUARDRAILS_FEATURE_REGISTER_EVENT,
      expect.objectContaining({
        feature: { id: "permissionGate" },
      }),
    );
  });

  it("returns undefined for safe commands", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const result = await pi.callHook(
      {
        toolName: "bash",
        input: { command: "echo hello" },
      } as BashToolCallEvent,
      createCtx(),
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined for non-bash tools", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const result = await pi.callHook(
      {
        toolName: "read",
        input: { command: "dangerous-cmd" },
      } as unknown as ReadToolCallEvent,
      createCtx(),
    );
    expect(result).toBeUndefined();
  });

  it("deny returns { block: true } without aborting the turn", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const ctx = createCtx({
      ui: { custom: vi.fn().mockResolvedValue("deny"), select: vi.fn() },
    });

    const result = await pi.callHook(DANGEROUS_EVENT, ctx);

    expect(result).toEqual({
      block: true,
      reason: "User denied dangerous command",
    });
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.events.emit).toHaveBeenCalledWith(
      GUARDRAILS_ACTION_BLOCKED_EVENT,
      expect.objectContaining({
        block: expect.objectContaining({ source: "user" }),
      }),
    );
  });

  it("stop calls ctx.abort() and returns { block: true } with user-stop source", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const ctx = createCtx({
      ui: { custom: vi.fn().mockResolvedValue("stop"), select: vi.fn() },
    });

    const result = await pi.callHook(DANGEROUS_EVENT, ctx);

    expect(result).toEqual({
      block: true,
      reason: "User declined and stopped dangerous command",
    });
    expect(ctx.abort).toHaveBeenCalledTimes(1);
    expect(pi.events.emit).toHaveBeenCalledWith(
      GUARDRAILS_ACTION_BLOCKED_EVENT,
      expect.objectContaining({
        block: expect.objectContaining({ source: "user-stop" }),
      }),
    );
  });

  it("allow once returns undefined and does not abort", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const ctx = createCtx({
      ui: { custom: vi.fn().mockResolvedValue("allow"), select: vi.fn() },
    });

    const result = await pi.callHook(DANGEROUS_EVENT, ctx);
    expect(result).toBeUndefined();
    expect(ctx.abort).not.toHaveBeenCalled();
  });

  it("RPC fallback exposes 'Decline and stop' and maps it to stop", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const select = vi.fn().mockResolvedValue("Decline and stop");
    const ctx = createCtx({
      ui: { custom: vi.fn().mockResolvedValue(undefined), select },
    });

    const result = await pi.callHook(DANGEROUS_EVENT, ctx);

    expect(select).toHaveBeenCalledWith(
      expect.stringContaining("test danger"),
      expect.arrayContaining([
        "Allow once",
        "Allow for session",
        "Deny",
        "Decline and stop",
      ]),
    );
    expect(result).toEqual({
      block: true,
      reason: "User declined and stopped dangerous command",
    });
    expect(ctx.abort).toHaveBeenCalledTimes(1);
  });

  it("non-interactive (no UI) blocks with nonInteractive source and does not abort", async () => {
    const pi = createPi();
    await permissionGate(pi as unknown as ExtensionAPI);

    const ctx = createCtx({ hasUI: false });
    const result = await pi.callHook(DANGEROUS_EVENT, ctx);

    expect(result).toEqual({
      block: true,
      reason: expect.stringContaining("no UI to confirm"),
    });
    expect(ctx.abort).not.toHaveBeenCalled();
    expect(pi.events.emit).toHaveBeenCalledWith(
      GUARDRAILS_ACTION_BLOCKED_EVENT,
      expect.objectContaining({
        block: expect.objectContaining({ source: "nonInteractive" }),
      }),
    );
  });
});
