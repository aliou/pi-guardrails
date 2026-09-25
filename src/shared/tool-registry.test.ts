import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createEventBus } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import {
  createToolRegistry,
  GUARDRAILS_REGISTER_TOOL_EVENT,
  GUARDRAILS_REQUEST_TOOLS_EVENT,
  type GuardrailsToolRegistration,
} from "./tool-registry";

function piWithBus() {
  const events = createEventBus();
  return { pi: { events } as unknown as ExtensionAPI, events };
}

const readTool: GuardrailsToolRegistration = {
  toolName: "read_symbol",
  resolveTargets: ({ input }) => ({
    kind: "files",
    access: "read",
    paths: [{ path: String(input.path) }],
  }),
};

describe("createToolRegistry", () => {
  it("leaves unknown tools unregistered", async () => {
    const { pi } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    await expect(registry.resolve("mystery", {}, "/repo")).resolves.toEqual({
      kind: "unregistered",
    });
  });

  it("accepts registrations emitted after guardrails loads", async () => {
    const { pi, events } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, readTool);

    await expect(
      registry.resolve("read_symbol", { path: "a.ts" }, "/repo"),
    ).resolves.toEqual({
      kind: "targets",
      targets: { kind: "files", access: "read", paths: [{ path: "a.ts" }] },
    });
  });

  it("collects registrations from extensions loaded earlier via the request handshake", () => {
    const { pi, events } = piWithBus();
    // An extension that loaded first re-emits whenever guardrails asks.
    events.on(GUARDRAILS_REQUEST_TOOLS_EVENT, () =>
      events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, readTool),
    );

    const registry = createToolRegistry(pi, "pathAccess");
    expect(registry.toolNames()).toEqual(["read_symbol"]);
  });

  it("never lets a registration override a built-in tool", async () => {
    const { pi, events } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, {
      toolName: "bash",
      resolveTargets: () => undefined,
    } satisfies GuardrailsToolRegistration);

    expect(registry.toolNames()).toEqual([]);
    await expect(
      registry.resolve("bash", { command: "cat .env" }, "/repo"),
    ).resolves.toEqual({ kind: "unregistered" });
  });

  it("only applies a registration to the features it lists", () => {
    const { pi, events } = piWithBus();
    const policies = createToolRegistry(pi, "policies");
    const gate = createToolRegistry(pi, "permissionGate");
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, {
      ...readTool,
      features: ["permissionGate"],
    });

    expect(policies.toolNames()).toEqual([]);
    expect(gate.toolNames()).toEqual(["read_symbol"]);
  });

  it("ignores malformed registrations", () => {
    const { pi, events } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    for (const payload of [
      null,
      "read_symbol",
      { toolName: "", resolveTargets: () => undefined },
      { toolName: "x" },
      { toolName: "x", resolveTargets: () => undefined, features: ["nope"] },
    ]) {
      events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, payload);
    }
    expect(registry.toolNames()).toEqual([]);
  });

  it("reports nothing to check when the resolver returns undefined", async () => {
    const { pi, events } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, {
      toolName: "status",
      resolveTargets: () => undefined,
    } satisfies GuardrailsToolRegistration);

    await expect(registry.resolve("status", {}, "/repo")).resolves.toEqual({
      kind: "none",
    });
  });

  it("fails closed when the resolver throws or returns a malformed value", async () => {
    const { pi, events } = piWithBus();
    const registry = createToolRegistry(pi, "policies");
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, {
      toolName: "throws",
      resolveTargets: () => {
        throw new Error("boom");
      },
    } satisfies GuardrailsToolRegistration);
    events.emit(GUARDRAILS_REGISTER_TOOL_EVENT, {
      toolName: "malformed",
      resolveTargets: () =>
        ({ kind: "files", access: "delete", paths: [] }) as never,
    } satisfies GuardrailsToolRegistration);

    await expect(
      registry.resolve("throws", {}, "/repo"),
    ).resolves.toMatchObject({
      kind: "error",
      reason: expect.stringContaining("boom"),
    });
    await expect(
      registry.resolve("malformed", {}, "/repo"),
    ).resolves.toMatchObject({ kind: "error" });
  });
});
