import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  ReadToolCallEvent,
} from "@earendil-works/pi-coding-agent";
import { createMock, type DeepMocked } from "@golevelup/ts-vitest";
import { assert, describe, expect, it, vi } from "vitest";
import {
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
  type GuardrailsPromptOpenedPayload,
} from "../../src/shared/events";
import pathAccess from "./index";
import type { createPathAccessPromptComponent } from "./prompt";

vi.mock("../../src/shared/config", () => ({
  configLoader: {
    load: vi.fn(async () => undefined),
    getConfig: vi.fn(() => ({
      enabled: true,
      features: { pathAccess: true },
      pathAccess: { mode: "ask", allowedPaths: [] },
    })),
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
});
