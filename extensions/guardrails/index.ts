import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import {
  createFeatureRequestPayload,
  emitActionBlocked,
  GUARDRAILS_FEATURE_REGISTER_EVENT,
  GUARDRAILS_FEATURE_REQUEST_EVENT,
  type GuardrailsFeatureId,
  type GuardrailsFeatureRegisterPayload,
} from "../../src/shared/events";
import {
  createToolRegistry,
  type ToolRegistry,
} from "../../src/shared/tool-registry";
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
import { type ExtractedTarget, extractTargets } from "./targets";

/**
 * Map a call to the built-in tool whose policy semantics apply and the
 * targets to check. Registered tools (see src/shared/tool-registry.ts) are
 * gated like `read` / `write` for file targets and like `bash` for command
 * targets. Returns `null` when there is nothing to check.
 */
async function policyView(
  registry: ToolRegistry,
  event: { toolName: string; input: Record<string, unknown> },
  cwd: string,
): Promise<
  | { kind: "check"; gatedAs: string; resolveTargets: TargetsFor }
  | { kind: "block"; reason: string }
  | null
> {
  const resolution = await registry.resolve(event.toolName, event.input, cwd);
  switch (resolution.kind) {
    case "unregistered":
      return {
        kind: "check",
        gatedAs: event.toolName,
        resolveTargets: (policies) => extractTargets(event, cwd, policies),
      };
    case "none":
      return null;
    case "error":
      return { kind: "block", reason: resolution.reason };
    case "targets": {
      const { targets } = resolution;
      if (targets.kind === "command") {
        return {
          kind: "check",
          gatedAs: "bash",
          resolveTargets: (policies) =>
            extractTargets(
              { toolName: "bash", input: { command: targets.command } },
              cwd,
              policies,
            ),
        };
      }
      const files: ExtractedTarget[] = targets.paths
        .filter((entry) => entry.path.trim() !== "")
        .map((entry) => ({ path: entry.path, unresolved: !!entry.unresolved }));
      return {
        kind: "check",
        gatedAs: targets.access === "read" ? "read" : "write",
        resolveTargets: async () => files,
      };
    }
  }
}

type TargetsFor = (
  policies: ReturnType<typeof compilePolicies>,
) => Promise<ExtractedTarget[]>;

function setupPolicyHook(pi: ExtensionAPI, registry: ToolRegistry): void {
  pi.on("tool_call", async (event, ctx) => {
    const config = configLoader.getConfig();
    if (!config.enabled || !config.features.policies) return;

    const input = event.input as Record<string, unknown>;
    const view = await policyView(
      registry,
      { toolName: event.toolName, input },
      ctx.cwd,
    );
    if (!view) return;
    if (view.kind === "block") {
      // Resolver failure: fail closed. No action-blocked event, because the
      // call has no file/command action that could be reported faithfully.
      return { block: true, reason: view.reason };
    }

    const policies = compilePolicies(config.policies.rules)
      .filter((policy) => BLOCKED_TOOLS[policy.protection].has(view.gatedAs))
      .sort(
        (a, b) => protectionRank(b.protection) - protectionRank(a.protection),
      );
    if (policies.length === 0) return;

    const targets = await view.resolveTargets(policies);
    const rules = createPolicyRules(policies, ctx.cwd);

    for (const target of targets) {
      const safety = await checkAction(
        {
          kind: "file",
          path: target.path,
          unresolved: target.unresolved,
          origin: event.toolName,
        },
        rules,
      );
      if (safety.kind === "safe") continue;

      emitActionBlocked(pi, {
        feature: "policies",
        action: safety.action,
        reason: safety.reason,
        block: { source: "policy", metadata: safety.metadata },
        context: { toolName: event.toolName, input },
      });
      return { block: true, reason: safety.reason };
    }
  });
}

export default async function guardrails(pi: ExtensionAPI) {
  await configLoader.load();

  const loadedFeatures = new Set<GuardrailsFeatureId>(["policies"]);

  pi.events.on(GUARDRAILS_FEATURE_REGISTER_EVENT, (data: unknown) => {
    const payload = data as GuardrailsFeatureRegisterPayload;
    loadedFeatures.add(payload.feature.id);
  });

  registerGuardrailsSettings(pi, {
    getLoadedFeatures: () => loadedFeatures,
  });

  registerGuardrailsExamplesCommand(pi);
  if (isOnboardingPending(configLoader.getRawConfig("global"))) {
    registerGuardrailsOnboardingCommand(pi);
  }
  setupPolicyHook(pi, createToolRegistry(pi, "policies"));

  pi.on("session_start", (_event, ctx) => {
    loadedFeatures.clear();
    loadedFeatures.add("policies");

    pi.events.emit(
      GUARDRAILS_FEATURE_REQUEST_EVENT,
      createFeatureRequestPayload(),
    );

    const warnings = configLoader.drainMessages();
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
