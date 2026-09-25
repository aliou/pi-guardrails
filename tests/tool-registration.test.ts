import type {
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  ToolCallEvent,
  ToolCallEventResult,
} from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { createMock } from "@golevelup/ts-vitest";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import guardrails from "../extensions/guardrails/index";
import pathAccess from "../extensions/path-access/index";
import permissionGate from "../extensions/permission-gate/index";
import {
  GUARDRAILS_REGISTER_TOOL_EVENT,
  GUARDRAILS_REQUEST_TOOLS_EVENT,
  type GuardrailsToolRegistration,
} from "../src/shared/tool-registry";

// End-to-end check of the tool registration protocol (#99): a custom tool
// registered over the real Pi event bus is gated by all three features the
// same way as its built-in equivalent.

vi.mock("../src/shared/config", () => {
  const config = {
    enabled: true,
    features: { policies: true, permissionGate: true, pathAccess: true },
    policies: {
      rules: [
        {
          id: "secrets",
          name: "Secrets",
          patterns: [{ pattern: ".env" }],
          protection: "noAccess",
        },
        {
          id: "locked",
          name: "Locked",
          patterns: [{ pattern: "locked.json" }],
          protection: "readOnly",
        },
      ],
    },
    permissionGate: {
      patterns: [{ pattern: "dangerous-cmd", description: "test danger" }],
      useBuiltinMatchers: false,
      requireConfirmation: true,
      allowedPatterns: [],
      autoDenyPatterns: [],
    },
    pathAccess: { mode: "block", allowedPaths: [] },
  };
  return {
    configLoader: {
      load: vi.fn(async () => undefined),
      getConfig: vi.fn(() => config),
      getRawConfig: vi.fn(() => ({ onboarding: { completed: true } })),
      drainMessages: vi.fn(() => []),
    },
  };
});

vi.mock("../extensions/path-access/dynamic-resources", () => ({
  piDocumentationPaths: vi.fn(() => []),
}));

type ToolCallHandler = ExtensionHandler<ToolCallEvent, ToolCallEventResult>;

const CWD = "/repo";

const registrations: GuardrailsToolRegistration[] = [
  {
    toolName: "read_symbol",
    resolveTargets: ({ input }) => ({
      kind: "files",
      access: "read",
      paths: [{ path: String(input.path ?? "") }],
    }),
  },
  {
    toolName: "structural_replace",
    resolveTargets: ({ input }) =>
      input.apply === true
        ? {
            kind: "files",
            access: "write",
            paths: (input.paths as string[]).map((path) => ({ path })),
          }
        : {
            kind: "files",
            access: "read",
            paths: (input.paths as string[]).map((path) => ({ path })),
          },
  },
  {
    toolName: "process",
    resolveTargets: ({ input }) =>
      input.action === "start"
        ? { kind: "command", command: String(input.command) }
        : undefined,
  },
  {
    toolName: "broken",
    resolveTargets: () => {
      throw new Error("resolver bug");
    },
  },
];

async function loadGuardrails(order: "extension-first" | "guardrails-first") {
  const pi = createMock<ExtensionAPI>();
  const bus = createEventBus();
  Object.assign(pi, { events: bus });

  const register = () => {
    for (const registration of registrations) {
      bus.emit(GUARDRAILS_REGISTER_TOOL_EVENT, registration);
    }
  };
  if (order === "extension-first") {
    bus.on(GUARDRAILS_REQUEST_TOOLS_EVENT, register);
  }

  await guardrails(pi);
  await pathAccess(pi);
  await permissionGate(pi);
  if (order === "guardrails-first") register();

  const handlers = (pi.on.mock.calls as unknown[][])
    .filter(([event]) => event === "tool_call")
    .map(([, handler]) => handler as ToolCallHandler);
  expect(handlers).toHaveLength(3);

  const ctx = createMock<ExtensionContext>({
    cwd: CWD,
    hasUI: false,
    mode: "print",
    ui: { notify: vi.fn() },
  });

  return async (toolName: string, input: Record<string, unknown>) => {
    const event = {
      type: "tool_call",
      toolCallId: "call",
      toolName,
      input,
    } as ToolCallEvent;
    for (const handler of handlers) {
      const result = await handler(event, ctx);
      if (result?.block) return result;
    }
    return undefined;
  };
}

describe.each([
  "extension-first",
  "guardrails-first",
] as const)("tool registration protocol (%s)", (order) => {
  beforeEach(() => {
    vol.fromJSON({
      "/repo/.env": "TOKEN=secret",
      "/repo/locked.json": "{}",
      "/repo/src/a.ts": "export const a = 1;",
    });
  });

  it("applies noAccess policies to registered read tools", async () => {
    const call = await loadGuardrails(order);
    await expect(call("read_symbol", { path: ".env" })).resolves.toMatchObject(
      { block: true },
    );
    await expect(
      call("read_symbol", { path: "src/a.ts" }),
    ).resolves.toBeUndefined();
  });

  it("applies readOnly policies only to registered write access", async () => {
    const call = await loadGuardrails(order);
    await expect(
      call("structural_replace", { paths: ["locked.json"], apply: false }),
    ).resolves.toBeUndefined();
    await expect(
      call("structural_replace", { paths: ["locked.json"], apply: true }),
    ).resolves.toMatchObject({ block: true });
  });

  it("gates registered command targets like bash", async () => {
    const call = await loadGuardrails(order);
    // Permission gate: dangerous pattern, no UI to confirm.
    await expect(
      call("process", { action: "start", command: "dangerous-cmd" }),
    ).resolves.toMatchObject({ block: true });
    // Policies: bash-style target extraction finds the protected file.
    await expect(
      call("process", { action: "start", command: "cat .env" }),
    ).resolves.toMatchObject({ block: true });
    // Nothing to check for non-command actions.
    await expect(call("process", { action: "list" })).resolves.toBeUndefined();
  });

  it("applies path access to registered file targets", async () => {
    const call = await loadGuardrails(order);
    await expect(
      call("read_symbol", { path: "/outside/secret.ts" }),
    ).resolves.toMatchObject({ block: true });
  });

  it("fails closed when a registered resolver throws", async () => {
    const call = await loadGuardrails(order);
    await expect(call("broken", {})).resolves.toMatchObject({
      block: true,
      reason: expect.stringContaining("resolver bug"),
    });
  });

  it("leaves unregistered tools and built-ins unchanged", async () => {
    const call = await loadGuardrails(order);
    await expect(call("unknown_tool", { path: ".env" })).resolves.toBeUndefined();
    await expect(call("read", { path: ".env" })).resolves.toMatchObject({
      block: true,
    });
  });
});
