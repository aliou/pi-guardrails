import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  emitBlocked,
  emitDangerous,
  GUARDRAILS_EXTENSIONS_REGISTER_EVENT,
  GUARDRAILS_EXTENSIONS_REQUEST_EVENT,
} from "../../src/shared/events";
import { isCommandAllowed, saveCommandSessionGrant } from "./grants";
import { createPermissionGateConfirmComponent } from "./prompt";
import { createPermissionGateRule, matchesAnyCommandPattern } from "./rules";

export default async function permissionGate(pi: ExtensionAPI) {
  await configLoader.load();

  pi.events.on(GUARDRAILS_EXTENSIONS_REQUEST_EVENT, () => {
    pi.events.emit(GUARDRAILS_EXTENSIONS_REGISTER_EVENT, {
      feature: "permissionGate",
    });
  });

  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.permissionGate) return;
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command;
    if (isCommandAllowed(command)) return;

    if (
      matchesAnyCommandPattern(command, config.permissionGate.autoDenyPatterns)
    ) {
      const reason =
        "Command matched auto-deny pattern and was blocked automatically.";
      emitBlocked(pi, {
        feature: "permissionGate",
        toolName: "bash",
        input: event.input,
        reason,
      });
      return { block: true, reason };
    }

    const safety = await checkAction(
      { kind: "command", command, origin: "bash" },
      [
        createPermissionGateRule({
          patterns: config.permissionGate.patterns,
          useBuiltinMatchers: config.permissionGate.useBuiltinMatchers,
        }),
      ],
    );
    if (safety.kind === "safe") return;

    emitDangerous(pi, {
      command,
      description: safety.reason,
      pattern: safety.metadata.pattern,
    });

    if (!config.permissionGate.requireConfirmation) {
      ctx.ui.notify(`Dangerous command detected: ${safety.reason}`, "warning");
      return;
    }

    if (!ctx.hasUI) {
      const reason = `Dangerous command blocked (no UI to confirm): ${safety.reason}`;
      emitBlocked(pi, {
        feature: "permissionGate",
        toolName: "bash",
        input: event.input,
        reason,
      });
      return { block: true, reason };
    }

    type ConfirmResult = "allow" | "allow-session" | "deny";
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
    emitBlocked(pi, {
      feature: "permissionGate",
      toolName: "bash",
      input: event.input,
      reason,
      userDenied: true,
    });
    return { block: true, reason };
  });
}
