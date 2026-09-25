import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  createFeatureRegisterPayload,
  createPromptClosedPayload,
  createPromptOpenedPayload,
  emitActionBlocked,
  emitRiskDetected,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
  GUARDRAILS_PROMPT_CLOSED_EVENT,
  GUARDRAILS_PROMPT_OPENED_EVENT,
  setupLegacyPromptEventAlias,
} from "../../src/shared/events";
import { createToolRegistry } from "../../src/shared/tool-registry";
import { isCommandAllowed, saveCommandSessionGrant } from "./grants";
import { createPermissionGateConfirmComponent } from "./prompt";
import {
  createPermissionGateRule,
  formatAutoDenyReason,
  matchCommandPattern,
} from "./rules";

export default async function permissionGate(pi: ExtensionAPI) {
  await configLoader.load();

  pi.events.on(GUARDRAILS_FEATURE_REQUEST_EVENT, () => {
    pi.events.emit(
      GUARDRAILS_FEATURE_REGISTER_EVENT,
      createFeatureRegisterPayload("permissionGate"),
    );
  });
  setupLegacyPromptEventAlias(pi, "permissionGate");
  const registry = createToolRegistry(pi, "permissionGate");

  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.permissionGate) return;

    const input = event.input as Record<string, unknown>;
    let command: string;
    if (isToolCallEventType("bash", event)) {
      command = event.input.command;
    } else {
      // Registered tools (src/shared/tool-registry.ts) with a command target
      // are gated like bash; file targets are not this feature's concern.
      const resolution = await registry.resolve(event.toolName, input, ctx.cwd);
      if (resolution.kind === "error") {
        return { block: true, reason: resolution.reason };
      }
      if (
        resolution.kind !== "targets" ||
        resolution.targets.kind !== "command"
      ) {
        return;
      }
      command = resolution.targets.command;
    }

    const action = {
      kind: "command" as const,
      command,
      origin: event.toolName,
    };
    if (isCommandAllowed(command)) return;

    const autoDenyMatch = matchCommandPattern(
      command,
      config.permissionGate.autoDenyPatterns,
    );

    if (autoDenyMatch) {
      const reason = formatAutoDenyReason(autoDenyMatch);

      emitActionBlocked(pi, {
        feature: "permissionGate",
        action,
        reason,
        block: { source: "permission", metadata: autoDenyMatch },
        context: { toolName: event.toolName, input },
      });

      return { block: true, reason };
    }

    const safety = await checkAction(action, [
      createPermissionGateRule({
        patterns: config.permissionGate.patterns,
        useBuiltinMatchers: config.permissionGate.useBuiltinMatchers,
      }),
    ]);
    if (safety.kind === "safe") return;

    emitRiskDetected(pi, {
      feature: "permissionGate",
      risk: safety,
      context: { toolName: event.toolName, input },
    });

    if (!config.permissionGate.requireConfirmation) {
      ctx.ui.notify(`Dangerous command detected: ${safety.reason}`, "warning");
      return;
    }

    if (!ctx.hasUI) {
      const reason = `Dangerous command blocked (no UI to confirm): ${safety.reason}`;
      emitActionBlocked(pi, {
        feature: "permissionGate",
        action: safety.action,
        reason,
        block: { source: "nonInteractive", metadata: safety.metadata },
        context: { toolName: event.toolName, input },
      });
      return { block: true, reason };
    }

    type ConfirmResult = "allow" | "allow-session" | "deny" | "stop";
    const promptOpened = createPromptOpenedPayload({
      feature: "permissionGate",
      action: safety.action,
      reason: safety.reason,
      prompt: {
        kind: "permission",
        metadata: safety.metadata,
      },
      context: { toolName: event.toolName, input },
    });
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, promptOpened);

    let result: ConfirmResult;
    try {
      const customResult = await ctx.ui.custom<ConfirmResult>(
        createPermissionGateConfirmComponent(command, safety.reason),
      );

      if (customResult === undefined) {
        const selection = await ctx.ui.select(
          `Dangerous command: ${safety.reason}`,
          ["Allow once", "Allow for session", "Deny", "Decline and stop"],
        );
        if (selection === "Allow once") result = "allow";
        else if (selection === "Allow for session") result = "allow-session";
        else if (selection === "Decline and stop") result = "stop";
        else result = "deny";
      } else {
        result = customResult;
      }
    } finally {
      pi.events.emit(
        GUARDRAILS_PROMPT_CLOSED_EVENT,
        createPromptClosedPayload(promptOpened),
      );
    }

    if (result === "allow") return;
    if (result === "allow-session") {
      await saveCommandSessionGrant(command);
      return;
    }

    if (result === "stop") {
      const reason = "User declined and stopped dangerous command";
      emitActionBlocked(pi, {
        feature: "permissionGate",
        action: safety.action,
        reason,
        block: { source: "user-stop", metadata: safety.metadata },
        context: { toolName: event.toolName, input },
      });
      ctx.abort();
      return { block: true, reason };
    }

    const reason = "User denied dangerous command";
    emitActionBlocked(pi, {
      feature: "permissionGate",
      action: safety.action,
      reason,
      block: { source: "user", metadata: safety.metadata },
      context: { toolName: event.toolName, input },
    });
    return { block: true, reason };
  });
}
