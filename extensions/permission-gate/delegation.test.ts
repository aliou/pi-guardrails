import {
  createEventBus,
  type ExtensionAPI,
  type ExtensionContext,
  type ToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResolvedConfig } from "../../src/shared/config";
import {
  DELEGATION_ENTRY_TYPE,
  type GuardrailsDelegate,
  registerDelegate,
} from "../../src/shared/delegation";
import { GUARDRAILS_ACTION_BLOCKED_EVENT } from "../../src/shared/events";
import permissionGate from "./index";

const state: { autoDeny: string[]; requireConfirmation: boolean } = {
  autoDeny: [],
  requireConfirmation: true,
};

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
            requireConfirmation: state.requireConfirmation,
            allowedPatterns: [],
            autoDenyPatterns: state.autoDeny.map((pattern) => ({ pattern })),
          },
        }) as unknown as ResolvedConfig,
    ),
  },
}));

async function setup(decide?: GuardrailsDelegate["decide"]) {
  const bus = createEventBus();
  const handlers = new Map<string, (...args: never[]) => unknown>();
  const appendEntry = vi.fn();
  const pi = {
    events: bus,
    on: vi.fn((event: string, handler: (...args: never[]) => unknown) => {
      handlers.set(event, handler);
    }),
    appendEntry,
    registerEntryRenderer: vi.fn(),
  } as unknown as ExtensionAPI;

  const decideSpy = vi.fn(decide ?? (() => undefined));
  if (decide) {
    registerDelegate(pi, { id: "test", name: "test", decide: decideSpy });
  }
  await permissionGate(pi);

  const custom = vi.fn(async () => "allow");
  const ctx = {
    cwd: "/workspace",
    hasUI: true,
    signal: undefined,
    sessionManager: {},
    modelRegistry: {},
    ui: { custom, notify: vi.fn(), select: vi.fn(), setWidget: vi.fn() },
    abort: vi.fn(),
  } as unknown as ExtensionContext;

  const blocked = vi.fn();
  bus.on(GUARDRAILS_ACTION_BLOCKED_EVENT, blocked);

  const toolCall = handlers.get("tool_call") as unknown as (
    event: ToolCallEvent,
    ctx: ExtensionContext,
  ) => Promise<unknown>;
  const run = (command: string, context: ExtensionContext = ctx) =>
    toolCall(
      {
        type: "tool_call",
        toolCallId: "c1",
        toolName: "bash",
        input: { command },
      } as ToolCallEvent,
      context,
    );

  return { run, ctx, custom, appendEntry, blocked, decideSpy };
}

describe("permission gate delegation", () => {
  beforeEach(() => {
    state.autoDeny = [];
    state.requireConfirmation = true;
  });

  it("prompts as before when no delegate is registered", async () => {
    const { run, custom, appendEntry } = await setup();
    await expect(run("dangerous-cmd")).resolves.toBeUndefined();
    expect(custom).toHaveBeenCalledOnce();
    expect(appendEntry).not.toHaveBeenCalled();
  });

  it("skips the prompt when delegates allow, and records the decision", async () => {
    const { run, custom, appendEntry, decideSpy } = await setup(() => ({
      verdict: "allow",
      reason: "in scope",
    }));

    await expect(run("dangerous-cmd")).resolves.toBeUndefined();

    expect(custom).not.toHaveBeenCalled();
    expect(decideSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "permissionGate",
        reason: "test danger",
        action: expect.objectContaining({ command: "dangerous-cmd" }),
      }),
      expect.objectContaining({ cwd: "/workspace" }),
    );
    expect(appendEntry).toHaveBeenCalledWith(
      DELEGATION_ENTRY_TYPE,
      expect.objectContaining({ verdict: "allow" }),
    );
  });

  it("blocks without prompting when a delegate blocks", async () => {
    const { run, custom, blocked } = await setup(() => ({
      verdict: "block",
      reason: "out of scope",
    }));

    await expect(run("dangerous-cmd")).resolves.toEqual({
      block: true,
      reason: "Blocked by decision delegate: test: out of scope",
    });
    expect(custom).not.toHaveBeenCalled();
    expect(blocked).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: "permissionGate",
        block: expect.objectContaining({ source: "delegate" }),
      }),
    );
  });

  it("prompts when a delegate asks, after recording the decision", async () => {
    const { run, custom, appendEntry } = await setup(() => ({
      verdict: "ask",
      reason: "destructive",
    }));
    await run("dangerous-cmd");
    expect(appendEntry).toHaveBeenCalledWith(
      DELEGATION_ENTRY_TYPE,
      expect.objectContaining({ verdict: "ask" }),
    );
    expect(custom).toHaveBeenCalledOnce();
  });

  it("never consults delegates for safe commands", async () => {
    const { run, decideSpy } = await setup(() => ({
      verdict: "block",
      reason: "x",
    }));
    await expect(run("ls")).resolves.toBeUndefined();
    expect(decideSpy).not.toHaveBeenCalled();
  });

  it("never consults delegates for auto-denied commands", async () => {
    state.autoDeny = ["dangerous-cmd"];
    const { run, decideSpy } = await setup(() => ({
      verdict: "allow",
      reason: "x",
    }));
    await expect(run("dangerous-cmd")).resolves.toMatchObject({ block: true });
    expect(decideSpy).not.toHaveBeenCalled();
  });

  it("never consults delegates when confirmation is off (nothing would prompt)", async () => {
    state.requireConfirmation = false;
    const { run, decideSpy } = await setup(() => ({
      verdict: "block",
      reason: "x",
    }));
    await expect(run("dangerous-cmd")).resolves.toBeUndefined();
    expect(decideSpy).not.toHaveBeenCalled();
  });

  it("delegates in RPC mode, then falls back to the select dialog on ask", async () => {
    const { run, ctx, decideSpy } = await setup(() => ({
      verdict: "ask",
      reason: "unclear",
    }));
    const select = vi.fn(async () => "Allow once");
    const rpcCtx = {
      ...ctx,
      mode: "rpc",
      hasUI: true,
      ui: { ...ctx.ui, custom: vi.fn(async () => undefined), select },
    } as unknown as ExtensionContext;

    await expect(run("dangerous-cmd", rpcCtx)).resolves.toBeUndefined();
    expect(decideSpy).toHaveBeenCalledOnce();
    expect(select).toHaveBeenCalledOnce();
  });

  it("allows in RPC mode without any dialog when delegates allow", async () => {
    const { run, ctx } = await setup(() => ({
      verdict: "allow",
      reason: "ok",
    }));
    const select = vi.fn();
    const custom = vi.fn();
    const rpcCtx = {
      ...ctx,
      mode: "rpc",
      hasUI: true,
      ui: { ...ctx.ui, custom, select },
    } as unknown as ExtensionContext;

    await expect(run("dangerous-cmd", rpcCtx)).resolves.toBeUndefined();
    expect(custom).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
  });

  it("never consults delegates in print/JSON mode (no UI: it blocks instead of prompting)", async () => {
    const { run, ctx, decideSpy } = await setup(() => ({
      verdict: "allow",
      reason: "x",
    }));
    await expect(
      run("dangerous-cmd", { ...ctx, hasUI: false } as ExtensionContext),
    ).resolves.toMatchObject({ block: true });
    expect(decideSpy).not.toHaveBeenCalled();
  });
});
