import { bindProjectConfig } from "@aliou/pi-utils-settings";
import {
  type ExtensionAPI,
  isToolCallEventType,
} from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  createDelegateRoster,
  delegateDecision,
  dismissOnAbort,
  formatDuration,
  listResponders,
  type PromptRaceOutcome,
  promptWaitHint,
  racePrompt,
  registerDecisionEntryRenderer,
} from "../../src/shared/delegation";
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
import { isCommandAllowed, saveCommandSessionGrant } from "./grants";
import { createPermissionGateConfirmComponent } from "./prompt";
import {
  createPermissionGateRule,
  formatAutoDenyReason,
  matchCommandPattern,
} from "./rules";

type ConfirmResult = "allow" | "allow-session" | "deny" | "stop";

export default async function permissionGate(pi: ExtensionAPI) {
  await configLoader.load();
  bindProjectConfig(pi, configLoader);

  pi.events.on(GUARDRAILS_FEATURE_REQUEST_EVENT, () => {
    pi.events.emit(
      GUARDRAILS_FEATURE_REGISTER_EVENT,
      createFeatureRegisterPayload("permissionGate"),
    );
  });
  setupLegacyPromptEventAlias(pi, "permissionGate");
  registerDecisionEntryRenderer(pi);
  const delegates = createDelegateRoster(pi);

  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.permissionGate) return;
    if (
      !isToolCallEventType("bash", event) &&
      !isToolCallEventType("powershell", event)
    )
      return;

    const command = event.input.command;
    const toolName = event.toolName;
    const action = { kind: "command" as const, command, origin: toolName };
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
        context: { toolName, input: event.input },
      });

      return {
        block: true,
        reason,
        ...(autoDenyMatch.terminate ? { terminate: true } : {}),
      };
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
      context: { toolName, input: event.input },
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
        context: { toolName, input: event.input },
      });
      return { block: true, reason };
    }

    const delegated = await delegateDecision(
      pi,
      delegates,
      {
        feature: "permissionGate",
        action: safety.action,
        reason: safety.reason,
        metadata: safety.metadata,
        toolName,
        input: event.input,
      },
      ctx,
      { timeoutMs: config.delegation.timeoutMs },
    );
    if (delegated?.verdict === "allow") return;
    if (delegated?.verdict === "block") {
      const reason = `Blocked by decision delegate: ${delegated.reason}`;
      emitActionBlocked(pi, {
        feature: "permissionGate",
        action: safety.action,
        reason,
        block: {
          source: "delegate",
          metadata: { risk: safety.metadata, delegation: delegated },
        },
        context: { toolName, input: event.input },
      });
      return { block: true, reason };
    }

    const promptOpened = createPromptOpenedPayload({
      feature: "permissionGate",
      action: safety.action,
      reason: safety.reason,
      prompt: {
        kind: "permission",
        metadata: safety.metadata,
      },
      context: { toolName, input: event.input },
    });
    pi.events.emit(GUARDRAILS_PROMPT_OPENED_EVENT, promptOpened);

    const responders = listResponders(delegates);
    const timeoutMs = config.permissionGate.promptTimeoutMs;
    const askLocally = async (signal: AbortSignal): Promise<ConfirmResult> => {
      const customResult = await ctx.ui.custom<ConfirmResult>(
        dismissOnAbort(
          createPermissionGateConfirmComponent(command, safety.reason, {
            hint: promptWaitHint(responders, timeoutMs),
          }),
          signal,
          "deny",
        ),
        {
          blocked: {
            kind: "permission",
            message: "Guardrails approval required",
          },
        },
      );
      if (customResult !== undefined) return customResult;
      if (signal.aborted) return "deny";

      const indentedCommand = command.replace(/^/gm, "    ");
      const selection = await ctx.ui.select(
        `Dangerous command: ${safety.reason}\n\n${indentedCommand}`,
        ["Allow once", "Allow for session", "Deny", "Decline and stop"],
        { signal },
      );
      if (selection === "Allow once") return "allow";
      if (selection === "Allow for session") return "allow-session";
      if (selection === "Decline and stop") return "stop";
      return "deny";
    };

    let outcome: PromptRaceOutcome<ConfirmResult>;
    try {
      outcome = await racePrompt(
        responders,
        {
          feature: "permissionGate",
          action: safety.action,
          reason: safety.reason,
          metadata: safety.metadata,
          toolName: "bash",
          input: event.input,
          promptId: promptOpened.prompt.id,
          choices: ["allow", "deny"],
        },
        {
          cwd: ctx.cwd,
          sessionManager: ctx.sessionManager,
          modelRegistry: ctx.modelRegistry,
        },
        { timeoutMs, local: askLocally },
      );
    } finally {
      pi.events.emit(
        GUARDRAILS_PROMPT_CLOSED_EVENT,
        createPromptClosedPayload(promptOpened),
      );
    }

    if (outcome.by === "responder") {
      const { responder, response } = outcome;
      if (response.choice === "allow") {
        ctx.ui.notify(
          `Allowed by ${responder.name}: ${response.reason}`,
          "info",
        );
        return;
      }
      const reason = `Denied by ${responder.name}: ${response.reason}`;
      emitActionBlocked(pi, {
        feature: "permissionGate",
        action: safety.action,
        reason,
        block: {
          source: "responder",
          metadata: { risk: safety.metadata, responder },
        },
        context: { toolName: "bash", input: event.input },
      });
      return { block: true, reason };
    }

    if (outcome.by === "timeout") {
      const reason = `Dangerous command denied: no answer within ${formatDuration(timeoutMs)}`;
      ctx.ui.notify(reason, "warning");
      emitActionBlocked(pi, {
        feature: "permissionGate",
        action: safety.action,
        reason,
        block: { source: "timeout", metadata: safety.metadata },
        context: { toolName: "bash", input: event.input },
      });
      return { block: true, reason };
    }

    const result = outcome.result;
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
        context: { toolName, input: event.input },
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
      context: { toolName, input: event.input },
    });
    return { block: true, reason };
  });
}
