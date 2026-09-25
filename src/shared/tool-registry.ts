import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { GuardrailsFeatureId } from "./events";

/**
 * Tool registration protocol: lets other extensions opt their custom tools
 * into guardrails gating over the shared `pi.events` bus, without depending
 * on this package (#99).
 *
 * An extension emits {@link GUARDRAILS_REGISTER_TOOL_EVENT} with a
 * {@link GuardrailsToolRegistration}. Guardrails emits
 * {@link GUARDRAILS_REQUEST_TOOLS_EVENT} when it loads; extensions that loaded
 * earlier listen for it and re-emit their registrations, so load order does
 * not matter.
 */
export const GUARDRAILS_REGISTER_TOOL_EVENT = "guardrails:register-tool";
export const GUARDRAILS_REQUEST_TOOLS_EVENT = "guardrails:request-tools";

/** Built-in tools keep their hardcoded handling and cannot be re-registered. */
export const BUILTIN_TOOL_NAMES: ReadonlySet<string> = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "find",
  "ls",
]);

export interface GuardrailsToolFileTarget {
  /** Absolute, cwd-relative, or `~`-prefixed path, as for built-in tools. */
  path: string;
  /** True when the path contains an unexpanded expansion (`$VAR`, …). */
  unresolved?: boolean;
}

/**
 * What a tool call touches.
 *
 * - `command`: a shell command, gated exactly like `bash` (permission gate,
 *   policy target extraction, path access).
 * - `files`: explicit paths. `access: "read"` is gated like `read` (only
 *   `noAccess` policies apply); `access: "write"` like `write`/`edit`
 *   (`noAccess` and `readOnly`).
 */
export type GuardrailsToolTargets =
  | { kind: "command"; command: string }
  | {
      kind: "files";
      access: "read" | "write";
      paths: GuardrailsToolFileTarget[];
    };

export interface GuardrailsToolResolverArgs {
  toolName: string;
  input: Record<string, unknown>;
  cwd: string;
}

/**
 * Return the targets of one call, or `undefined` when the call touches
 * nothing guardrails should check (e.g. a list/status action).
 */
export type GuardrailsToolResolver = (
  args: GuardrailsToolResolverArgs,
) =>
  | GuardrailsToolTargets
  | undefined
  | Promise<GuardrailsToolTargets | undefined>;

export interface GuardrailsToolRegistration {
  toolName: string;
  resolveTargets: GuardrailsToolResolver;
  /** Guardrails features that should gate this tool. Defaults to all. */
  features?: GuardrailsFeatureId[];
}

export interface GuardrailsRequestToolsPayload {
  source: "guardrails";
  timestamp: string;
}

/**
 * Outcome of resolving a call for one feature:
 * - `unregistered`: no registration applies; the feature keeps its built-in
 *   behavior (which ignores unknown tools).
 * - `none`: registered, but the resolver reported nothing to check.
 * - `targets`: registered targets to check.
 * - `error`: the resolver threw or returned a malformed value. Callers must
 *   block (fail closed).
 */
export type ToolResolution =
  | { kind: "unregistered" }
  | { kind: "none" }
  | { kind: "targets"; targets: GuardrailsToolTargets }
  | { kind: "error"; reason: string };

export interface ToolRegistry {
  resolve(
    toolName: string,
    input: Record<string, unknown>,
    cwd: string,
  ): Promise<ToolResolution>;
  /** Registered tool names (for diagnostics and tests). */
  toolNames(): string[];
}

const FEATURE_IDS: ReadonlySet<string> = new Set([
  "policies",
  "permissionGate",
  "pathAccess",
]);

function parseRegistration(data: unknown): GuardrailsToolRegistration | null {
  if (!data || typeof data !== "object") return null;
  const candidate = data as Partial<GuardrailsToolRegistration>;
  if (
    typeof candidate.toolName !== "string" ||
    candidate.toolName.trim() === "" ||
    typeof candidate.resolveTargets !== "function"
  ) {
    return null;
  }
  if (
    candidate.features !== undefined &&
    (!Array.isArray(candidate.features) ||
      !candidate.features.every(
        (feature) => typeof feature === "string" && FEATURE_IDS.has(feature),
      ))
  ) {
    return null;
  }
  return candidate as GuardrailsToolRegistration;
}

function isValidTargets(value: unknown): value is GuardrailsToolTargets {
  if (!value || typeof value !== "object") return false;
  const targets = value as Record<string, unknown>;
  if (targets.kind === "command") return typeof targets.command === "string";
  if (targets.kind !== "files") return false;
  if (targets.access !== "read" && targets.access !== "write") return false;
  return (
    Array.isArray(targets.paths) &&
    targets.paths.every(
      (entry) =>
        !!entry &&
        typeof entry === "object" &&
        typeof (entry as GuardrailsToolFileTarget).path === "string" &&
        ((entry as GuardrailsToolFileTarget).unresolved === undefined ||
          typeof (entry as GuardrailsToolFileTarget).unresolved === "boolean"),
    )
  );
}

/**
 * Create one feature's view of the registry: listens for registrations that
 * apply to `feature`, then asks already-loaded extensions to (re-)register.
 * Call once per feature during extension setup.
 */
export function createToolRegistry(
  pi: ExtensionAPI,
  feature: GuardrailsFeatureId,
): ToolRegistry {
  const registrations = new Map<string, GuardrailsToolRegistration>();

  pi.events.on(GUARDRAILS_REGISTER_TOOL_EVENT, (data: unknown) => {
    const registration = parseRegistration(data);
    if (!registration) return;
    if (BUILTIN_TOOL_NAMES.has(registration.toolName)) return;
    if (registration.features && !registration.features.includes(feature)) {
      return;
    }
    registrations.set(registration.toolName, registration);
  });

  pi.events.emit(GUARDRAILS_REQUEST_TOOLS_EVENT, {
    source: "guardrails",
    timestamp: new Date().toISOString(),
  } satisfies GuardrailsRequestToolsPayload);

  return {
    async resolve(toolName, input, cwd) {
      if (BUILTIN_TOOL_NAMES.has(toolName)) return { kind: "unregistered" };
      const registration = registrations.get(toolName);
      if (!registration) return { kind: "unregistered" };

      let result: unknown;
      try {
        result = await registration.resolveTargets({ toolName, input, cwd });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          kind: "error",
          reason: `Guardrails could not check ${toolName}: target resolver failed (${message}).`,
        };
      }
      if (result === undefined) return { kind: "none" };
      if (!isValidTargets(result)) {
        return {
          kind: "error",
          reason: `Guardrails could not check ${toolName}: target resolver returned an invalid value.`,
        };
      }
      return { kind: "targets", targets: result };
    },
    toolNames() {
      return [...registrations.keys()].sort();
    },
  };
}
