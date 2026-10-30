import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { createMock } from "@golevelup/ts-vitest";
import { vol } from "memfs";
import { assert, describe, expect, it, vi } from "vitest";
import guardrails from "../extensions/guardrails";
import pathAccess from "../extensions/path-access";
import permissionGate from "../extensions/permission-gate";
import { configLoader } from "../src/shared/config";
import { NOOP_THEME } from "./utils/theme";

vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  getSettingsListTheme: () => ({
    label: (text: string) => text,
    value: (text: string) => text,
    description: (text: string) => text,
    cursor: "> ",
    hint: (text: string) => text,
  }),
}));

describe("project settings controls", () => {
  it.each([
    false,
    true,
  ])("saves examples to an available scope when trusted=%s", async (trusted) => {
    const cwd = "/workspace";
    const projectPath = join(cwd, ".pi/extensions/guardrails.json");
    const globalPath = join(getAgentDir(), "extensions/guardrails.json");
    const projectContents = JSON.stringify({ enabled: true });
    vol.fromJSON({ [projectPath]: projectContents });
    const pi = createMock<ExtensionAPI>();
    await guardrails(pi);
    await configLoader.loadProject({ cwd, isProjectTrusted: () => trusted });
    await configLoader.save("memory", { pathAccess: { mode: "block" } });
    const ctx = createMock<ExtensionCommandContext>({
      cwd,
      hasUI: true,
      mode: "tui",
    });
    ctx.ui.custom.mockImplementation(async (factory) => {
      const done = vi.fn();
      const component = await factory(
        createMock(),
        NOOP_THEME,
        createMock(),
        done,
      );
      const rendered = component.render(120).join("\n");
      if (!trusted) {
        expect(rendered).toContain(
          "Project (.pi/extensions/guardrails.json) (project not trusted)",
        );
        expect(rendered).toContain("Use /trust and restart Pi");
        component.handleInput?.("\x1b[B");
        component.handleInput?.("\x1b[A");
      } else {
        expect(rendered).not.toContain("project not trusted");
      }
      component.handleInput?.("\r");
      component.handleInput?.(" ");
      component.handleInput?.("\x13");
      return done.mock.calls[0]?.[0];
    });
    const command = pi.registerCommand.mock.calls.find(
      ([name]) => name === "guardrails:examples",
    )?.[1];
    assert(command);
    await command.handler("", ctx);

    const saved = JSON.parse(
      await readFile(trusted ? projectPath : globalPath, "utf-8"),
    );
    expect(saved.policies.rules.length).toBeGreaterThan(0);
    if (!trusted)
      expect(await readFile(projectPath, "utf-8")).toBe(projectContents);
    expect(configLoader.getProjectState()).toBe(
      trusted ? "trusted" : "untrusted",
    );
    expect(configLoader.getConfig().pathAccess.mode).toBe("block");
  });

  it("preserves trusted project settings and session grants after onboarding", async () => {
    const cwd = "/workspace";
    vol.fromJSON({
      [join(cwd, ".pi/extensions/guardrails.json")]: JSON.stringify({
        enabled: false,
      }),
    });
    const pi = createMock<ExtensionAPI>();
    await guardrails(pi);
    await configLoader.loadProject({ cwd, isProjectTrusted: () => true });
    await configLoader.save("memory", { pathAccess: { mode: "block" } });
    const ctx = createMock<ExtensionCommandContext>({ cwd, hasUI: true });
    ctx.ui.custom.mockResolvedValue({
      completed: true,
      applyBuiltinDefaults: true,
      pathAccessEnabled: true,
    });
    const command = pi.registerCommand.mock.calls.find(
      ([name]) => name === "guardrails:onboarding",
    )?.[1];
    assert(command);

    await command.handler("", ctx);

    expect(configLoader.getProjectState()).toBe("trusted");
    expect(configLoader.getConfig().enabled).toBe(false);
    expect(configLoader.getConfig().pathAccess.mode).toBe("block");
    expect(configLoader.getRawConfig("global")?.onboarding?.completed).toBe(
      true,
    );
  });

  it("blocks editing on the Local settings tab in an untrusted project", async () => {
    const cwd = "/workspace";
    const pi = createMock<ExtensionAPI>();
    await guardrails(pi);
    await configLoader.loadProject({ cwd, isProjectTrusted: () => false });
    const ctx = createMock<ExtensionCommandContext>({
      cwd,
      hasUI: true,
      mode: "tui",
    });
    const save = vi.spyOn(configLoader, "save");
    ctx.ui.custom.mockImplementation(async (factory) => {
      const done = vi.fn();
      const component = await factory(
        createMock(),
        NOOP_THEME,
        createMock(),
        done,
      );
      component.handleInput?.("\t");
      const rendered = component.render(120).join("\n");
      expect(rendered).toContain("Project not trusted");
      expect(rendered).toContain(
        "Settings in /workspace/.pi/extensions/guardrails.json are ignored.",
      );
      expect(rendered).toContain("Use /trust and restart Pi to apply them.");
      component.handleInput?.("\r");
      component.handleInput?.("\x13");
      component.handleInput?.("\x1b");
      return done.mock.calls[0]?.[0];
    });
    const command = pi.registerCommand.mock.calls.find(
      ([name]) => name === "guardrails:settings",
    )?.[1];
    assert(command);
    await command.handler("", ctx);
    expect(ctx.ui.custom).toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
});

const features = [
  {
    name: "policies",
    setup: guardrails,
    toolName: "read",
    input: { path: ".env" },
  },
  {
    name: "pathAccess",
    setup: pathAccess,
    toolName: "read",
    input: { path: "/outside/secret.txt" },
  },
  {
    name: "permissionGate",
    setup: permissionGate,
    toolName: "bash",
    input: { command: "rm -rf /tmp/acme" },
  },
];

describe.each(features)("$name project trust", ({ setup, toolName, input }) => {
  it.each([
    false,
    true,
  ])("applies project config only when trusted=%s", async (trusted) => {
    const cwd = "/workspace";
    const projectPath = join(cwd, ".pi/extensions/guardrails.json");
    const projectContents = JSON.stringify({ enabled: false });
    vol.fromJSON({
      [join(getAgentDir(), "extensions/guardrails.json")]: JSON.stringify({
        enabled: true,
        onboarding: { completed: true },
        features: { policies: true, pathAccess: true, permissionGate: true },
        pathAccess: { mode: "block" },
      }),
      [projectPath]: projectContents,
      [join(cwd, ".env")]: "SECRET=value",
    });
    const pi = createMock<ExtensionAPI>();
    const ctx = createMock<ExtensionContext>({ cwd, hasUI: false });
    ctx.isProjectTrusted.mockReturnValue(trusted);

    await setup(pi);
    expect(configLoader.getConfig().enabled).toBe(true);
    expect(await readFile(projectPath, "utf-8")).toBe(projectContents);
    await configLoader.save("memory", {
      pathAccess: {
        allowedPaths: [{ kind: "file", path: "/tmp/session.txt" }],
      },
    });

    const handlers = pi.on.mock.calls as unknown as Array<
      [string, (event: unknown, context: ExtensionContext) => unknown]
    >;
    for (const [name, handler] of handlers) {
      if (name === "session_start")
        await handler({ type: "session_start" }, ctx);
    }

    expect(configLoader.getConfig().enabled).toBe(!trusted);
    expect(configLoader.getProjectState()).toBe(
      trusted ? "trusted" : "untrusted",
    );
    expect(configLoader.getConfig().pathAccess.allowedPaths).toContainEqual({
      kind: "file",
      path: "/tmp/session.txt",
    });
    if (!trusted)
      expect(await readFile(projectPath, "utf-8")).toBe(projectContents);

    const toolHandler = handlers.find(([name]) => name === "tool_call")?.[1];
    assert(toolHandler);
    const result = await toolHandler(
      { type: "tool_call", toolCallId: "test", toolName, input },
      ctx,
    );
    if (trusted) expect(result).toBeUndefined();
    else expect(result).toMatchObject({ block: true });
  });
});
