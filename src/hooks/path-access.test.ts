import type {
  ExtensionAPI,
  ExtensionContext,
} from "@mariozechner/pi-coding-agent";
import { createEventBus } from "@mariozechner/pi-coding-agent";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEventContext } from "../../tests/utils/pi-context";
import type { ResolvedConfig } from "../config";
import { setupPathAccessHook } from "./path-access";

// ---------------------------------------------------------------------------
// configLoader mock — we control what `getConfig` returns and capture saves.
// ---------------------------------------------------------------------------

const mockState: {
  config: ResolvedConfig | null;
  raw: {
    global: Record<string, unknown> | null;
    local: Record<string, unknown> | null;
    memory: Record<string, unknown> | null;
  };
  saves: Array<{ scope: string; config: Record<string, unknown> }>;
} = {
  config: null,
  raw: { global: null, local: null, memory: null },
  saves: [],
};

vi.mock("../config", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    configLoader: {
      getConfig: () => mockState.config,
      getRawConfig: (scope: "global" | "local" | "memory") =>
        mockState.raw[scope],
      save: vi.fn(async (scope: string, config: Record<string, unknown>) => {
        mockState.saves.push({ scope, config });
      }),
    },
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  pathAccess: Partial<ResolvedConfig["pathAccess"]> = {},
): ResolvedConfig {
  return {
    version: "1",
    enabled: true,
    applyBuiltinDefaults: true,
    features: { policies: false, permissionGate: false, pathAccess: true },
    policies: { rules: [] },
    pathAccess: {
      mode: "ask",
      allowedPaths: [],
      alwaysScope: "local",
      ...pathAccess,
    },
    permissionGate: {
      patterns: [],
      useBuiltinMatchers: true,
      requireConfirmation: true,
      allowedPatterns: [],
      autoDenyPatterns: [],
      explainCommands: false,
      explainModel: null,
      explainTimeout: 5000,
    },
  };
}

type ToolCallHandler = (
  event: { type: "tool_call"; toolName: string; input: unknown },
  ctx: ExtensionContext,
) => Promise<{ block: true; reason: string } | undefined>;

function createMockPi() {
  const handlers: ToolCallHandler[] = [];
  const eventBus = createEventBus();

  const pi = {
    on(event: string, handler: ToolCallHandler) {
      if (event === "tool_call") handlers.push(handler);
    },
    events: eventBus,
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    emit: vi.fn(),
  } as unknown as ExtensionAPI;

  return {
    pi,
    getHandler(): ToolCallHandler {
      if (!handlers.length) throw new Error("No tool_call handler registered");
      return handlers[0];
    },
  };
}

function readEvent(absPath: string) {
  return {
    type: "tool_call" as const,
    toolName: "read",
    input: { file_path: absPath },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("path-access hook: alwaysScope persistence", () => {
  let handler: ToolCallHandler;

  beforeEach(() => {
    mockState.config = makeConfig();
    mockState.raw = { global: null, local: null, memory: null };
    mockState.saves = [];
    const handle = createMockPi();
    setupPathAccessHook(handle.pi);
    handler = handle.getHandler();
  });

  it("persists 'allow file always' to local by default", async () => {
    mockState.config = makeConfig({ alwaysScope: "local" });
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-file-always",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    const result = await handler(readEvent("/etc/hosts"), ctx);
    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("local");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: string[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual(["/etc/hosts"]);
  });

  it("persists 'allow file always' to global when alwaysScope is global", async () => {
    mockState.config = makeConfig({ alwaysScope: "global" });
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-file-always",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    const result = await handler(readEvent("/etc/hosts"), ctx);
    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("global");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: string[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual(["/etc/hosts"]);
  });

  it("persists 'allow directory always' to global when alwaysScope is global", async () => {
    mockState.config = makeConfig({ alwaysScope: "global" });
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-dir-always",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    const result = await handler(readEvent("/etc/passwd"), ctx);
    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("global");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: string[] };
    };
    // The grant is for the parent directory with trailing slash
    expect(saved.pathAccess.allowedPaths).toEqual(["/etc/"]);
  });

  it("session grants always go to memory regardless of alwaysScope", async () => {
    mockState.config = makeConfig({ alwaysScope: "global" });
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-file-session",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    const result = await handler(readEvent("/etc/hosts"), ctx);
    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("memory");
  });

  it("'allow once' does not persist anywhere", async () => {
    mockState.config = makeConfig({ alwaysScope: "global" });
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-file-once",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    const result = await handler(readEvent("/etc/hosts"), ctx);
    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(0);
  });

  it("preserves existing raw config when saving (does not clobber other fields)", async () => {
    mockState.config = makeConfig({ alwaysScope: "global" });
    mockState.raw.global = {
      features: { pathAccess: true },
      pathAccess: { mode: "ask", allowedPaths: ["~/existing/"] },
      // Some unrelated field that must not be lost.
      foo: "bar",
    };
    const ctx = createEventContext({
      cwd: "/work/project",
      hasUI: true,
      ui: {
        custom: vi.fn(
          async () => "allow-file-always",
        ) as ExtensionContext["ui"]["custom"],
      },
    });

    await handler(readEvent("/etc/hosts"), ctx);
    expect(mockState.saves).toHaveLength(1);
    const saved = mockState.saves[0].config as {
      foo: string;
      pathAccess: { mode: string; allowedPaths: string[] };
    };
    expect(saved.foo).toBe("bar");
    expect(saved.pathAccess.mode).toBe("ask");
    expect(saved.pathAccess.allowedPaths).toEqual([
      "~/existing/",
      "/etc/hosts",
    ]);
  });
});
