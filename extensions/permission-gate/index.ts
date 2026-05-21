import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  createFeatureRegisterPayload,
  emitActionBlocked,
  emitActionPrompted,
  emitRiskDetected,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
} from "../../src/shared/events";
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

  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.permissionGate) return;
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    const action = { kind: "command" as const, command, origin: "bash" };
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
        context: { toolName: "bash", input: event.input },
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
      context: { toolName: "bash", input: event.input },
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
        context: { toolName: "bash", input: event.input },
      });
      return { block: true, reason };
    }

    type ConfirmResult = "allow" | "allow-session" | "deny";
    emitActionPrompted(pi, {
      feature: "permissionGate",
      action: safety.action,
      reason: safety.reason,
      prompt: {
        kind: "permission",
        metadata: safety.metadata,
      },
      context: { toolName: "bash", input: event.input },
    });

    let result = await ctx.ui.custom<ConfirmResult>(
      createPermissionGateConfirmComponent(command, safety.reason),
    );

    if (result === undefined) {
      const selection = await ctx.ui.select(
        `Dangerous command: ${safety.reason}`,
        ["Allow once", "Allow for session", "Deny"],
      );
      if (selection === "Allow once") result = "allow";
      else if (selection === "Allow for session") result = "allow-session";
      else result = "deny";
    }

    if (result === "allow") return;
    if (result === "allow-session") {
      await saveCommandSessionGrant(command);
      return;
    }

    const reason = "User denied dangerous command";
    emitActionBlocked(pi, {
      feature: "permissionGate",
      action: safety.action,
      reason,
      block: { source: "user", metadata: safety.metadata },
      context: { toolName: "bash", input: event.input },
    });
    return { block: true, reason };
  });
}
