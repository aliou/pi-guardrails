import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  ReadToolCallEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { configLoader } from "../../src/shared/config";
import {
  GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT,
  GUARDRAILS_ACTION_PROMPTED_EVENT,
} from "../../src/shared/events";
import pathAccess from "./index";
import { targetsForTool } from "./targets";

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { permissionGate: true, policies: true, pathAccess: true },
      pathAccess: { mode: "ask", allowedPaths: [] },
    })),
  },
}));

vi.mock("./dynamic-resources", () => ({
  piDocumentationPaths: vi.fn(() => []),
}));
vi.mock("./grants", () => ({
  createPendingGrant: vi.fn(),
  isGrantTooBroad: vi.fn(() => false),
  pendingAllowedPaths: vi.fn(() => []),
  persistGrant: vi.fn(),
  resolveAllowedPaths: vi.fn(() => []),
}));
vi.mock("./targets", () => ({
  targetsForTool: vi.fn().mockResolvedValue(["/outside/file.txt"]),
}));

type ToolCallHandler = ExtensionHandler<ToolCallEvent, ToolCallEventResult>;

function createPi() {
  let hook: ToolCallHandler | undefined;
  const pi = {
    events: { on: vi.fn(), emit: vi.fn() },
    on: vi.fn((event: string, handler: ToolCallHandler) => {
      if (event === "tool_call") hook = handler;
    }),
  };

  return {
    ...pi,
    callHook: (...args: Parameters<ToolCallHandler>) => {
      if (!hook) throw new Error("tool_call hook not registered");
      return hook(...args);
    },
  };
}

function createCtx() {
  return {
    cwd: "/workspace",
    hasUI: true,
    ui: {
      custom: vi.fn().mockResolvedValue("allow-file-once"),
      notify: vi.fn(),
    },
  } as unknown as ExtensionContext;
}

const OUTSIDE_READ_EVENT = {
  toolName: "read",
  input: { path: "/outside/file.txt" },
} as ReadToolCallEvent;

describe("pathAccess extension hook", () => {
  it("emits the prompt lifecycle around an outside-path approval", async () => {
    vi.mocked(targetsForTool).mockResolvedValue(["/outside/file.txt"]);
    const pi = createPi();
    await pathAccess(pi as unknown as ExtensionAPI);

    const ctx = createCtx();
    const result = await pi.callHook(OUTSIDE_READ_EVENT, ctx);

    expect(configLoader.getConfig).toHaveBeenCalled();
    expect(targetsForTool).toHaveBeenCalled();
    expect(ctx.ui.custom).toHaveBeenCalled();
    expect(result).toBeUndefined();
    const eventNames = pi.events.emit.mock.calls.map(([event]) => event);
    expect(eventNames).toContain(GUARDRAILS_ACTION_PROMPTED_EVENT);
    expect(eventNames).toContain(GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT);
    expect(eventNames.indexOf(GUARDRAILS_ACTION_PROMPTED_EVENT)).toBeLessThan(
      eventNames.indexOf(GUARDRAILS_ACTION_PROMPT_RESOLVED_EVENT),
    );
  });
});
