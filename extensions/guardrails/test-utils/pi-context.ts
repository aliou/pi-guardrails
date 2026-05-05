/**
 * Explicit spy-based context builders for Pi extension tests.
 *
 * Every function property is a `vi.fn()` with a sensible default. This makes
 * tests readable (you see exactly which properties exist) and keeps call
 * tracking / override ergonomics that deep proxy mocks provide, without the
 * hidden "any property access succeeds" footgun.
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUIContext,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import { vi } from "vitest";

/**
 * ReadonlySessionManager is not exported from pi-coding-agent's public API.
 * We reconstruct the type here as a Pick of SessionManager.
 */
type ReadonlySessionManager = Pick<
  SessionManager,
  | "getCwd"
  | "getSessionDir"
  | "getSessionId"
  | "getSessionFile"
  | "getLeafId"
  | "getLeafEntry"
  | "getEntry"
  | "getLabel"
  | "getBranch"
  | "getHeader"
  | "getEntries"
  | "getTree"
  | "getSessionName"
>;

// ---------------------------------------------------------------------------
// UI context
// ---------------------------------------------------------------------------

export type UIOverrides = Partial<ExtensionUIContext>;

function createUIContext(overrides: UIOverrides = {}): ExtensionUIContext {
  return {
    select: vi.fn(async () => undefined),
    confirm: vi.fn(async () => false),
    input: vi.fn(async () => undefined),
    notify: vi.fn(),
    custom: vi.fn(async () => undefined),
    onTerminalInput: vi.fn(() => () => {}),
    setStatus: vi.fn(),
    setWorkingMessage: vi.fn(),
    setWidget: vi.fn(),
    setFooter: vi.fn(),
    setHeader: vi.fn(),
    setTitle: vi.fn(),
    pasteToEditor: vi.fn(),
    setEditorText: vi.fn(),
    getEditorText: vi.fn(() => ""),
    editor: vi.fn(async () => undefined),
    setEditorComponent: vi.fn(),
    setToolsExpanded: vi.fn(),
    ...overrides,
  } as ExtensionUIContext;
}

// ---------------------------------------------------------------------------
// Command context
// ---------------------------------------------------------------------------

export interface CommandContextOverrides {
  cwd?: string;
  hasUI?: boolean;
  ui?: UIOverrides;
  sessionManager?: ReadonlySessionManager;
  modelRegistry?: ExtensionCommandContext["modelRegistry"];
  model?: ExtensionCommandContext["model"];
  isIdle?: () => boolean;
  abort?: () => void;
  hasPendingMessages?: () => boolean;
  shutdown?: () => void;
  getContextUsage?: () => undefined;
  compact?: () => void;
  getSystemPrompt?: () => string;
  waitForIdle?: () => Promise<void>;
  newSession?: ExtensionCommandContext["newSession"];
  fork?: ExtensionCommandContext["fork"];
  navigateTree?: ExtensionCommandContext["navigateTree"];
  switchSession?: ExtensionCommandContext["switchSession"];
  reload?: () => Promise<void>;
}

/**
 * Build an `ExtensionCommandContext` with every method as a spy.
 * Pass overrides for the properties your test cares about.
 */
export function createCommandContext(
  overrides: CommandContextOverrides = {},
): ExtensionCommandContext {
  const ui = createUIContext(overrides.ui);

  return {
    cwd: overrides.cwd ?? process.cwd(),
    hasUI: overrides.hasUI ?? true,
    ui,
    signal: undefined,
    sessionManager: overrides.sessionManager ?? stubSessionManager(),
    modelRegistry:
      overrides.modelRegistry ??
      ({} as ExtensionCommandContext["modelRegistry"]),
    model: overrides.model ?? undefined,
    isIdle: vi.fn(overrides.isIdle ?? (() => true)),
    abort: vi.fn(overrides.abort ?? (() => {})),
    hasPendingMessages: vi.fn(overrides.hasPendingMessages ?? (() => false)),
    shutdown: vi.fn(overrides.shutdown ?? (() => {})),
    getContextUsage: vi.fn(overrides.getContextUsage ?? (() => undefined)),
    compact: vi.fn(overrides.compact ?? (() => {})),
    getSystemPrompt: vi.fn(overrides.getSystemPrompt ?? (() => "")),
    waitForIdle: vi.fn(overrides.waitForIdle ?? (async () => {})),
    newSession: vi.fn(
      overrides.newSession ?? (async () => ({ cancelled: false })),
    ),
    fork: vi.fn(overrides.fork ?? (async () => ({ cancelled: false }))),
    navigateTree: vi.fn(
      overrides.navigateTree ?? (async () => ({ cancelled: false })),
    ),
    switchSession: vi.fn(
      overrides.switchSession ?? (async () => ({ cancelled: false })),
    ),
    reload: vi.fn(overrides.reload ?? (async () => {})),
  } as ExtensionCommandContext;
}

// ---------------------------------------------------------------------------
// Tool context
// ---------------------------------------------------------------------------

export interface ToolContextOverrides {
  cwd?: string;
}

type ToolContext = NonNullable<
  Parameters<Parameters<ExtensionAPI["registerTool"]>[0]["execute"]>[4]
>;

/**
 * Build a minimal tool execution context. Tools typically only need `cwd`.
 */
export function createToolContext(
  overrides: ToolContextOverrides = {},
): ToolContext {
  return {
    cwd: overrides.cwd ?? process.cwd(),
    signal: undefined,
  } as unknown as ToolContext;
}

// ---------------------------------------------------------------------------
// Event context (for tool_call / session_start handlers)
// ---------------------------------------------------------------------------

export interface EventContextOverrides {
  cwd?: string;
  hasUI?: boolean;
  ui?: UIOverrides;
  sessionManager?: ReadonlySessionManager;
}

/**
 * Build an `ExtensionContext` for event handlers (tool_call, session_start).
 * Lighter than command context — no session control methods.
 */
export function createEventContext(overrides: EventContextOverrides = {}) {
  const ui = createUIContext(overrides.ui);

  return {
    cwd: overrides.cwd ?? process.cwd(),
    hasUI: overrides.hasUI ?? true,
    ui,
    signal: undefined,
    sessionManager: overrides.sessionManager ?? stubSessionManager(),
    modelRegistry: {} as ExtensionCommandContext["modelRegistry"],
    model: undefined,
    isIdle: vi.fn(() => true),
    abort: vi.fn(),
    hasPendingMessages: vi.fn(() => false),
    shutdown: vi.fn(),
    getContextUsage: vi.fn(() => undefined),
    compact: vi.fn(),
    getSystemPrompt: vi.fn(() => ""),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Minimal stub for ReadonlySessionManager when the test does not interact
 * with session state at all. Every method is a vi.fn() returning a safe
 * default.
 */
function stubSessionManager(): ReadonlySessionManager {
  return {
    getCwd: vi.fn(() => process.cwd()),
    getSessionDir: vi.fn(() => ""),
    getSessionId: vi.fn(() => "stub-session-id"),
    getSessionFile: vi.fn(() => undefined),
    getLeafId: vi.fn(() => null),
    getLeafEntry: vi.fn(() => undefined),
    getEntry: vi.fn(() => undefined),
    getLabel: vi.fn(() => undefined),
    getBranch: vi.fn(() => []),
    getHeader: vi.fn(() => undefined),
    getEntries: vi.fn(() => []),
    getTree: vi.fn(() => []),
    getSessionName: vi.fn(() => undefined),
  } as unknown as ReadonlySessionManager;
}
