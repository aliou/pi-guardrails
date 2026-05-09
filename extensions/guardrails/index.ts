import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  emitBlocked,
  GUARDRAILS_EXTENSIONS_REGISTER_EVENT,
  GUARDRAILS_EXTENSIONS_REQUEST_EVENT,
  type GuardrailsExtensionsRegisterPayload,
  type GuardrailsFeatureId,
} from "../../src/shared/events";
import { drainPendingWarnings } from "../../src/shared/warnings";
import { registerGuardrailsExamplesCommand } from "./commands/examples";
import { registerGuardrailsOnboardingCommand } from "./commands/onboarding";
import { isOnboardingPending } from "./commands/onboarding/config";
import { registerGuardrailsSettings } from "./commands/settings";
import {
  BLOCKED_TOOLS,
  compilePolicies,
  createPolicyRules,
  protectionRank,
} from "./rules";
import { extractTargets } from "./targets";

function setupPolicyHook(pi: ExtensionAPI): void {
  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.policies) return;

    const policies = compilePolicies(config.policies.rules)
      .filter((policy) => BLOCKED_TOOLS[policy.protection].has(event.toolName))
      .sort(
        (a, b) => protectionRank(b.protection) - protectionRank(a.protection),
      );
    if (policies.length === 0) return;

    const input = event.input as Record<string, unknown>;
    const targets = await extractTargets(
      { toolName: event.toolName, input },
      ctx.cwd,
      policies,
    );
    const rules = createPolicyRules(policies, ctx.cwd);

    for (const target of targets) {
      const safety = await checkAction(
        { kind: "file", path: target, origin: event.toolName },
        rules,
      );
      if (safety.kind === "safe") continue;

      emitBlocked(pi, {
        feature: "policies",
        toolName: event.toolName,
        input,
        reason: safety.reason,
      });
      return { block: true, reason: safety.reason };
    }
  });
}

export default async function guardrails(pi: ExtensionAPI) {
  await configLoader.load();

  const loadedFeatures = new Set<GuardrailsFeatureId>(["policies"]);

  pi.events.on(GUARDRAILS_EXTENSIONS_REGISTER_EVENT, (data: unknown) => {
    const payload = data as GuardrailsExtensionsRegisterPayload;
    loadedFeatures.add(payload.feature);
  });

  registerGuardrailsSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  registerGuardrailsExamplesCommand(pi);
  if (isOnboardingPending(configLoader.getRawConfig("global"))) {
    registerGuardrailsOnboardingCommand(pi);
  }
  setupPolicyHook(pi);

  pi.on("session_start", (_event, ctx) => {
    loadedFeatures.clear();
    loadedFeatures.add("policies");

    pi.events.emit(GUARDRAILS_EXTENSIONS_REQUEST_EVENT, undefined);

    const warnings = drainPendingWarnings();
    if (warnings.length === 1) {
      ctx.ui.notify(warnings[0], "warning");
    } else if (warnings.length > 1) {
      ctx.ui.notify(
        [
          "Guardrails warnings:",
          ...warnings.map((warning) => `- ${warning}`),
        ].join("\n"),
        "warning",
      );
    }
  });
}
