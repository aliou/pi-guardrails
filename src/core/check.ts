import type { Action, Decision, PermissionState, Rule, Safety } from "./types";

export async function checkAction<TMeta = null>(
  action: Action,
  rules: readonly Rule<TMeta>[],
): Promise<Safety<TMeta>> {
  for (const rule of rules) {
    const result = await rule.check(action);

    if (result.kind === "match") {
      return {
        kind: "dangerous",
        action,
        key: rule.key,
        reason: result.reason,
        metadata: result.metadata,
      };
    }
  }

  return { kind: "safe" };
}

export function resolveDecision<TMeta = null>(
  safety: Safety<TMeta>,
  permissionState: PermissionState,
): Decision<TMeta> {
  if (safety.kind === "safe") return { kind: "allow" };

  switch (permissionState) {
    case "granted":
      return { kind: "allow" };
    case "denied":
      return { kind: "deny", reason: safety.reason };
    case "prompt":
      return { kind: "prompt", risk: safety };
  }
}
