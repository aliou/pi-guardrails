import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  LsToolCallEvent,
  ReadToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
  type GuardrailsPromptOpenedPayload,
} from "../../src/shared/events";
import pathAccess from "./index";
import type { createPathAccessPromptComponent } from "./prompt";
import { DIR_OPTIONS, FILE_OPTIONS } from "./prompt";

const mockState: {
  pathAccess: {
    mode: "allow" | "ask" | "block";
    allowedPaths: never[];
    alwaysScope: "local" | "global";
  };
  saves: Array<{ scope: string; config: Record<string, unknown> }>;
} = {
  pathAccess: { mode: "ask", allowedPaths: [], alwaysScope: "local" },
  saves: [],
};

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { pathAccess: true },
      pathAccess: mockState.pathAccess,
    })),
    getRawConfig: vi.fn(() => null),
    save: vi.fn(async (scope: string, config: Record<string, unknown>) => {
      mockState.saves.push({ scope, config });
    }),
  },
}));

vi.mock("./dynamic-resources", () => ({
  piDocumentationPaths: vi.fn(() => []),
}));

vi.mock("./targets", () => ({
  targetsForTool: vi.fn(async () => ["/outside/secret.txt"]),
}));

const toolCall = {
  type: "tool_call",
  toolCallId: "test-call",
  toolName: "read",
  input: { path: "/outside/secret.txt" },
} satisfies ReadToolCallEvent;

const bashToolCall = {
  type: "tool_call",
  toolCallId: "test-call",
  toolName: "bash",
  input: { command: "cat /outside/secret.txt" },
} satisfies BashToolCallEvent;

const lsToolCall = {
  type: "tool_call",
  toolCallId: "test-call",
  toolName: "ls",
  input: { path: "/outside/secret.txt" },
} satisfies LsToolCallEvent;

type PathAccessPromptComponent = ReturnType<
  typeof createPathAccessPromptComponent
>;

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function renderPromptComponent(component: PathAccessPromptComponent): string {
  return component(
    { terminal: { columns: 100 }, requestRender: vi.fn() },
    theme,
    undefined,
    vi.fn(),
  )
    .render(100)
    .join("\n");
}

function emittedPromptOpened(pi: DeepMocked<ExtensionAPI>) {
  return pi.events.emit.mock.calls.find(
    ([event]) => event === GUARDRAILS_PROMPT_OPENED_EVENT,
  )?.[1] as GuardrailsPromptOpenedPayload | undefined;
}

function registeredExtensionHandler(
  pi: DeepMocked<ExtensionAPI>,
  event: string,
) {
  const calls: unknown[][] = pi.on.mock.calls;
  return calls.find(([registeredEvent]) => registeredEvent === event)?.[1];
}

describe("pathAccess extension hook", () => {
  beforeEach(() => {
    mockState.pathAccess = {
      mode: "ask",
      allowedPaths: [],
      alwaysScope: "local",
    };
    mockState.saves = [];
  });

  it("emits a correlated lifecycle around an outside-path prompt", async () => {
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-once");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    const opened = emittedPromptOpened(pi);
    assert(opened, "prompt opened event should be emitted");
    expect(pi).toHaveEmitted(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      expect.objectContaining({ prompt: { id: opened.prompt.id } }),
    );
  });

  it("closes the prompt when its UI throws", async () => {
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockRejectedValue(new Error("UI failed"));
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await expect(toolCallHandler(toolCall, ctx)).rejects.toThrow("UI failed");

    const opened = emittedPromptOpened(pi);
    assert(opened, "prompt opened event should be emitted");
    expect(pi).toHaveEmitted(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      expect.objectContaining({ prompt: { id: opened.prompt.id } }),
    );
  });

  it("shows the bash command in the outside-path prompt", async () => {
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-once");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(bashToolCall, ctx);

    const promptComponent = ctx.ui.custom.mock.calls[0]?.[0] as
      | PathAccessPromptComponent
      | undefined;
    assert(promptComponent, "path access prompt should be shown");
    expect(renderPromptComponent(promptComponent)).toContain(
      "Command: cat /outside/secret.txt",
    );
  });

  it("persists 'allow file always' to the local scope by default", async () => {
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-always");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("local");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: unknown[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "file", path: "/outside/secret.txt" },
    ]);
  });

  it("persists 'allow file always' to the global scope when alwaysScope is global", async () => {
    mockState.pathAccess.alwaysScope = "global";
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-always");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("global");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: unknown[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "file", path: "/outside/secret.txt" },
    ]);
  });

  it("persists 'allow directory always' to the global scope when alwaysScope is global", async () => {
    mockState.pathAccess.alwaysScope = "global";
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-dir-always");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("global");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: unknown[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "directory", path: "/outside" },
    ]);
  });

  it("persists session grants to memory regardless of alwaysScope", async () => {
    mockState.pathAccess.alwaysScope = "global";
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-session");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("memory");
  });

  it("does not persist 'allow once' grants", async () => {
    mockState.pathAccess.alwaysScope = "global";
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockResolvedValue("allow-file-once");
    await pathAccess(pi);

    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    await toolCallHandler(toolCall, ctx);

    expect(mockState.saves).toHaveLength(0);
  });
});

describe("pathAccess extension hook RPC fallback", () => {
  beforeEach(() => {
    mockState.pathAccess = {
      mode: "ask",
      allowedPaths: [],
      alwaysScope: "local",
    };
    mockState.saves = [];
  });

  function setup() {
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({
      cwd: "/workspace",
      hasUI: true,
      mode: "rpc",
    });
    ctx.ui.custom.mockResolvedValue(undefined);
    return { pi, ctx };
  }

  async function runHandler(
    pi: DeepMocked<ExtensionAPI>,
    ctx: DeepMocked<ExtensionContext>,
    event: unknown,
  ) {
    await pathAccess(pi);
    const toolCallHandler = registeredExtensionHandler(pi, "tool_call");
    assert(
      typeof toolCallHandler === "function",
      "tool_call handler should be registered",
    );
    return toolCallHandler(event as never, ctx);
  }

  it("falls back to ui.select with file options for file tools", async () => {
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue("Allow once");

    await runHandler(pi, ctx, toolCall);

    expect(ctx.ui.select).toHaveBeenCalledTimes(1);
    const [title, options] = ctx.ui.select.mock.calls[0] as [string, string[]];
    expect(title).toContain("/outside/secret.txt");
    expect(title).toContain("outside /workspace");
    expect(title).toContain("Directory grants apply to the parent directory");
    expect(options).toEqual(FILE_OPTIONS.map((option) => option.label));
  });

  it("falls back to ui.select with directory-only options for ls", async () => {
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue("Allow directory this session");

    await runHandler(pi, ctx, lsToolCall);

    expect(ctx.ui.select).toHaveBeenCalledTimes(1);
    const [title, options] = ctx.ui.select.mock.calls[0] as [string, string[]];
    expect(title).toContain("/outside/secret.txt");
    expect(title).not.toContain(
      "Directory grants apply to the parent directory",
    );
    expect(options).toEqual(DIR_OPTIONS.map((option) => option.label));
  });

  it.each([
    { label: "Allow once", saves: 0, blocked: false },
    { label: "Deny", saves: 0, blocked: true },
    { label: undefined, saves: 0, blocked: true },
  ])("maps selection %j to the expected result", async ({
    label,
    saves,
    blocked,
  }) => {
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue(label);

    const result = await runHandler(pi, ctx, toolCall);

    if (blocked) {
      expect(result).toEqual({
        block: true,
        reason: "User denied access outside working directory",
      });
    } else {
      expect(result).toBeUndefined();
    }
    expect(mockState.saves).toHaveLength(saves);
  });

  it("maps 'Allow directory always' to a parent-directory grant", async () => {
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue("Allow directory always");

    const result = await runHandler(pi, ctx, toolCall);

    expect(result).toBeUndefined();
    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("local");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: unknown[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "directory", path: "/outside" },
    ]);
  });

  it("persists fallback always grants to the configured scope", async () => {
    mockState.pathAccess.alwaysScope = "global";
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue("Allow file always");

    await runHandler(pi, ctx, toolCall);

    expect(mockState.saves).toHaveLength(1);
    expect(mockState.saves[0].scope).toBe("global");
    const saved = mockState.saves[0].config as {
      pathAccess: { allowedPaths: unknown[] };
    };
    expect(saved.pathAccess.allowedPaths).toEqual([
      { kind: "file", path: "/outside/secret.txt" },
    ]);
  });

  it("still emits the prompt lifecycle around the fallback", async () => {
    const { pi, ctx } = setup();
    ctx.ui.select.mockResolvedValue("Deny");

    await runHandler(pi, ctx, toolCall);

    const opened = emittedPromptOpened(pi);
    assert(opened, "prompt opened event should be emitted");
    expect(pi).toHaveEmitted(
      GUARDRAILS_PROMPT_CLOSED_EVENT,
      expect.objectContaining({ prompt: { id: opened.prompt.id } }),
    );
  });
});
