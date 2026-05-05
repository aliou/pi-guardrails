import type { Action, Decision, PermissionState, Rule, Safety } from "./types";

export async function checkAction(
  action: Action,
  rules: readonly Rule[],
): Promise<Safety> {
  for (const rule of rules) {
    if (await rule.check(action)) {
      return {
        kind: "dangerous",
        action,
        key: rule.key,
        reason: rule.reason,
      };
    }
  }

  return { kind: "safe" };
}

export function resolveDecision(
  safety: Safety,
  permissionState: PermissionState,
): Decision {
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
