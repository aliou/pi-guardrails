import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { setupPermissionGateHook } from "./permission-gate";
import { setupProtectEnvFilesHook } from "./protect-env-files";

export function setupGuardrailsHooks(pi: ExtensionAPI, config: ResolvedConfig) {
  setupProtectEnvFilesHook(pi, config);
  setupPermissionGateHook(pi, config);
}
