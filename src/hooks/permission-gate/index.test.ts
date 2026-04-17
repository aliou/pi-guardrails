import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createEventBus } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEventContext } from "../../../tests/utils/pi-context";
import type { ResolvedConfig } from "../../config";
import { configLoader } from "../../config";
import { setupPermissionGateHook } from "./index";

// Mock configLoader so allow-session path doesn't throw.
vi.mock("../../config", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    configLoader: {
      getConfig: vi.fn(() => ({
        permissionGate: { allowedPatterns: [] },
      })),
      save: vi.fn(async () => {}),
    },
  };
});

// ---------------------------------------------------------------------------
// Constants — must match the production code's SELECT_* constants
// ---------------------------------------------------------------------------

const SELECT_ALLOW_ONCE = "Allow once";
const SELECT_ALLOW_SESSION = "Allow for session";
const SELECT_DENY = "Deny";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal config enabling the permission gate with defaults.
 * No custom patterns — relies on built-in structural matchers.
 */
function makeConfig(
  overrides: Partial<ResolvedConfig["permissionGate"]> = {},
): ResolvedConfig {
  return {
    version: "1",
    enabled: true,
    applyBuiltinDefaults: true,
    features: { policies: false, permissionGate: true, pathAccess: false },
    policies: { rules: [] },
    pathAccess: { mode: "ask", allowedPaths: [] },
    permissionGate: {
      patterns: [],
      useBuiltinMatchers: true,
      requireConfirmation: true,
      allowedPatterns: [],
      autoDenyPatterns: [],
      explainCommands: false,
      explainModel: null,
      explainTimeout: 5000,
      ...overrides,
    },
  };
}

type ToolCallHandler = (
  event: BashToolCallEvent,
  ctx: ExtensionContext,
) => Promise<{ block: true; reason: string } | undefined>;

/**
 * Create a mock ExtensionAPI that captures tool_call handler registrations.
 * Returns the mock and a function to retrieve the registered handler.
 */
function createMockPi() {
  const handlers: ToolCallHandler[] = [];
  const eventBus = createEventBus();

  const pi = {
    on(event: string, handler: ToolCallHandler) {
      if (event === "tool_call") {
        handlers.push(handler);
      }
    },
    events: eventBus,
    // Stubs for any other ExtensionAPI methods that might be called.
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    emit: vi.fn(),
  } as unknown as ExtensionAPI;

  return {
    pi,
    getHandler(): ToolCallHandler {
      if (handlers.length === 0) {
        throw new Error("No tool_call handler registered");
      }
      return handlers[0];
    },
  };
}

function bashEvent(command: string): BashToolCallEvent {
  return {
    type: "tool_call",
    toolCallId: "tc_test",
    toolName: "bash",
    input: { command },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("permission gate", () => {
  let handle: ReturnType<typeof createMockPi>;
  let handler: ToolCallHandler;

  beforeEach(() => {
    handle = createMockPi();
    setupPermissionGateHook(handle.pi, makeConfig());
    handler = handle.getHandler();
  });

  it("allows safe commands", async () => {
    const ctx = createEventContext({ hasUI: true });
    const result = await handler(bashEvent("echo hello"), ctx);
    expect(result).toBeUndefined();
  });

  it("blocks dangerous commands when user denies", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(async () => "deny") as ExtensionContext["ui"]["custom"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual({
      block: true,
      reason: "User denied dangerous command",
    });
  });

  it("allows dangerous commands when user explicitly allows", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(async () => "allow") as ExtensionContext["ui"]["custom"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toBeUndefined();
  });

  it("blocks when hasUI is false (print/RPC mode)", async () => {
    const ctx = createEventContext({ hasUI: false });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("blocks when ctx.ui.custom() returns undefined (RPC stub)", async () => {
    // This is the bug from issue #19: in RPC mode, ctx.ui.custom() returns
    // undefined. The permission gate only checks for "deny", so undefined
    // falls through and the command is silently allowed.
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(ctx.ui.select).toHaveBeenCalled();
  });

  it("blocks auto-deny patterns without prompting", async () => {
    const { pi, getHandler } = createMockPi();
    setupPermissionGateHook(
      pi,
      makeConfig({
        autoDenyPatterns: [{ pattern: "DROP TABLE" }],
      }),
    );
    const h = getHandler();
    const ctx = createEventContext({ hasUI: true });
    const result = await h(bashEvent("psql -c 'DROP TABLE users'"), ctx);
    expect(result).toEqual(expect.objectContaining({ block: true }));
    // Should not have prompted the user.
    expect(ctx.ui.custom).not.toHaveBeenCalled();
  });

  it("skips allowed patterns", async () => {
    const { pi, getHandler } = createMockPi();
    setupPermissionGateHook(
      pi,
      makeConfig({
        allowedPatterns: [{ pattern: "sudo echo" }],
      }),
    );
    const h = getHandler();
    const ctx = createEventContext({ hasUI: true });
    const result = await h(bashEvent("sudo echo hello"), ctx);
    expect(result).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // RPC mode: ctx.ui.select() fallback when ctx.ui.custom() returns undefined
  // ---------------------------------------------------------------------------

  it("falls back to select() when custom() returns undefined and allows on 'Allow once'", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => SELECT_ALLOW_ONCE,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toBeUndefined(); // not blocked → allowed
    expect(ctx.ui.select).toHaveBeenCalled();
  });

  it("falls back to select() when custom() returns undefined and allows-session on 'Allow for session'", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => SELECT_ALLOW_SESSION,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toBeUndefined(); // not blocked → allowed with session grant
    expect(ctx.ui.select).toHaveBeenCalled();
  });

  it("falls back to select() when custom() returns undefined and blocks on 'Deny'", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => SELECT_DENY,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual({
      block: true,
      reason: "User denied dangerous command",
    });
  });

  it("blocks when both custom() and select() return undefined", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual(expect.objectContaining({ block: true }));
    expect(ctx.ui.select).toHaveBeenCalled();
  });

  it("does not call select() when custom() returns a valid result", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(async () => "deny") as ExtensionContext["ui"]["custom"],
      },
    });
    await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(ctx.ui.select).not.toHaveBeenCalled();
  });

  it("blocks when select() returns an unrecognized string", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(async () => "maybe") as ExtensionContext["ui"]["select"],
      },
    });
    const result = await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(result).toEqual(expect.objectContaining({ block: true }));
  });

  it("saves session grant via configLoader when select() returns 'Allow for session'", async () => {
    const ctx = createEventContext({
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => undefined,
        ) as ExtensionContext["ui"]["custom"],
        select: vi.fn(
          async () => SELECT_ALLOW_SESSION,
        ) as ExtensionContext["ui"]["select"],
      },
    });
    await handler(bashEvent("sudo rm -rf /"), ctx);
    expect(configLoader.save).toHaveBeenCalledWith("memory", {
      permissionGate: {
        allowedPatterns: [{ pattern: "sudo rm -rf /" }],
      },
    });
  });
});
