import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config";
import { setupPathAccessHook } from "./path-access";
import { setupPermissionGateHook } from "./permission-gate";
import { setupPoliciesHook } from "./policies";

export function setupGuardrailsHooks(pi: ExtensionAPI, config: ResolvedConfig) {
  setupPathAccessHook(pi); // boundary check — runs first
  setupPoliciesHook(pi, config); // policy rules — runs second
  setupPermissionGateHook(pi, config); // dangerous commands — runs third
}
