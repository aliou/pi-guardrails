import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { checkAction } from "../../src/core";
import { configLoader } from "../../src/shared/config";
import { emitBlocked } from "../../src/shared/events";
import {
  BLOCKED_TOOLS,
  compilePolicies,
  createPolicyRules,
  protectionRank,
} from "./rules";
import { extractTargets } from "./targets";

export default async function policies(pi: ExtensionAPI) {
  await configLoader.load();

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
