/**
 * Test harness that loads extension factories using real Pi internals.
 *
 * Instead of deep proxy mocks, this uses:
 * - Real `createEventBus()` and `createExtensionRuntime()`
 * - Real `loadExtensionFromFactory()` so extensions register through the
 *   actual `ExtensionAPI` code path
 * - Explicit vi.fn() spies for context objects (see pi-context.ts)
 *
 * The harness exposes the loaded `Extension` object so matchers and tests
 * can inspect registered commands, tools, and event handlers directly.
 *
 * Context overrides (sessionManager, UI spies, etc.) are set at harness
 * creation time and apply to every command execution. Per-call overrides
 * passed to `execute()` merge on top when needed.
 *
 * A built-in `newSession` spy creates a real `SessionManager.inMemory()`
 * for each child session and exposes it via `getChildSessionManager()`.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Extension,
  ExtensionCommandContext,
  ExtensionFactory,
  ExtensionRuntime,
  RegisteredCommand,
  SessionManager,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";
import {
  createEventBus,
  createExtensionRuntime,
  SessionManager as SessionManagerClass,
} from "@mariozechner/pi-coding-agent";
import { vi } from "vitest";
import { loadExtensionFromFactory } from "./load-extension";
import {
  type CommandContextOverrides,
  createCommandContext,
  createEventContext,
  createToolContext,
  type EventContextOverrides,
} from "./pi-context";

export interface PiTestHarness {
  /** Working directory used by the harness. */
  cwd: string;
  /** The real Extension object produced by the factory. */
  extension: Extension;
  /**
   * The shared ExtensionRuntime. Action methods (setModel, setThinkingLevel,
   * etc.) are throwing stubs until replaced. Tests can assign vi.fn() spies
   * directly to patch them before emitting events.
   */
  runtime: ExtensionRuntime;
  /**
   * Built-in `newSession` spy. When a command calls `ctx.newSession()`,
   * this spy creates a real `SessionManager.inMemory()`, runs the
   * `setup()` callback on it, and returns `{ cancelled: false }`.
   */
  newSession: ExtensionCommandContext["newSession"];
  /**
   * Returns the `SessionManager` that was created for the most recent
   * child session (from the `newSession` spy), or `undefined` if no
   * child session has been created yet.
   */
  getChildSessionManager(): SessionManager | undefined;
  /** Look up a registered command by name and get an executor. */
  command(name: string): CommandHandle;
  /** Look up a registered tool by name and get an executor. */
  tool(name: string): ToolHandle;
  /**
   * Emit an event directly to the extension's registered handlers.
   * Returns the first non-undefined result (e.g., { block: true }).
   */
  emitEvent(
    eventName: string,
    event: unknown,
    ctxOverrides?: EventContextOverrides,
  ): Promise<unknown>;
  /** All registered command names. */
  listRegisteredCommands(): string[];
  /** All registered tool names. */
  listRegisteredTools(): string[];
}

export interface CommandHandle {
  registered: RegisteredCommand;
  execute(
    args?: string,
    overrides?: CommandContextOverrides,
  ): Promise<ExtensionCommandContext>;
}

export interface ToolHandle {
  /** The ToolDefinition that was registered (has execute, renderCall, etc). */
  registered: ToolDefinition;
  execute(params: Record<string, unknown>): Promise<unknown>;
}

export interface PiTestHarnessOptions {
  cwd?: string;
  extensionPath?: string;
  /**
   * Default context overrides applied to every command execution.
   * Per-call overrides passed to `execute()` merge on top, with UI
   * overrides deep-merged so harness-level and per-call spies coexist.
   */
  context?: CommandContextOverrides;
}

/**
 * Create a test harness that loads an extension factory through real Pi
 * internals. The returned harness lets you execute registered commands and
 * tools with spy-based contexts.
 *
 * Context overrides set here become defaults for all command executions.
 * The harness includes a built-in `newSession` spy that creates real
 * in-memory session managers for child sessions. Access the most recent
 * child via `getChildSessionManager()`.
 */
export async function createPiTestHarness(
  factory: ExtensionFactory,
  options: PiTestHarnessOptions = {},
): Promise<PiTestHarness> {
  const cwd = options.cwd ?? mkdtempSync(join(tmpdir(), "pi-test-cwd-"));
  const harnessContext = options.context ?? {};
  const eventBus = createEventBus();
  const runtime = createExtensionRuntime();

  const extension = await loadExtensionFromFactory(
    factory,
    cwd,
    eventBus,
    runtime,
    options.extensionPath ?? "<test-extension>",
  );

  // Built-in newSession spy: creates a real child SessionManager and runs
  // the setup callback, so tests can inspect entries written to the child.
  let childSm: SessionManager | undefined;
  const newSession = vi.fn(
    async (opts?: Parameters<ExtensionCommandContext["newSession"]>[0]) => {
      childSm = SessionManagerClass.inMemory();
      if (opts?.setup) {
        await opts.setup(childSm);
      }
      return { cancelled: false };
    },
  ) as unknown as ExtensionCommandContext["newSession"];

  let toolCallCounter = 0;

  function command(name: string): CommandHandle {
    const registered = extension.commands.get(name);
    if (!registered) {
      const available = [...extension.commands.keys()].join(", ");
      throw new Error(
        `Command "${name}" is not registered. Registered: [${available}]`,
      );
    }
    return {
      registered,
      async execute(
        args = "",
        overrides: CommandContextOverrides = {},
      ): Promise<ExtensionCommandContext> {
        const ctx = createCommandContext({
          cwd,
          newSession,
          ...harnessContext,
          ...overrides,
          // Deep-merge UI so harness-level and per-call spies coexist.
          ui: { ...harnessContext.ui, ...overrides.ui },
        });
        await registered.handler(args, ctx);
        return ctx;
      },
    };
  }

  function tool(name: string): ToolHandle {
    const entry = extension.tools.get(name);
    if (!entry) {
      const available = [...extension.tools.keys()].join(", ");
      throw new Error(
        `Tool "${name}" is not registered. Registered: [${available}]`,
      );
    }
    const definition = entry.definition;
    return {
      registered: definition,
      execute(params: Record<string, unknown>) {
        const id = `tc_${++toolCallCounter}`;
        const ctx = createToolContext({ cwd });
        return definition.execute(id, params, undefined, undefined, ctx);
      },
    };
  }

  async function emitEvent(
    eventName: string,
    event: unknown,
    ctxOverrides: EventContextOverrides = {},
  ): Promise<unknown> {
    const handlers = extension.handlers.get(eventName) ?? [];
    const ctx = createEventContext({ cwd, ...ctxOverrides });
    for (const handler of handlers) {
      const result = await handler(event, ctx);
      if (result !== undefined) return result;
    }
    return undefined;
  }

  return {
    cwd,
    extension,
    runtime,
    newSession,
    getChildSessionManager: () => childSm,
    command,
    tool,
    emitEvent,
    listRegisteredCommands: () => [...extension.commands.keys()],
    listRegisteredTools: () => [...extension.tools.keys()],
  };
}
