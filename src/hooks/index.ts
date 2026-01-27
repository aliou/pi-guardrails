import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { ResolvedConfig } from "../config-schema";
import { setupPermissionGateHook } from "./permission-gate";
import { setupPreventBrewHook } from "./prevent-brew";
import { setupPreventPythonHook } from "./prevent-python";
import { setupProtectEnvFilesHook } from "./protect-env-files";

export function setupGuardrailsHooks(pi: ExtensionAPI, config: ResolvedConfig) {
  setupPreventBrewHook(pi, config);
  setupPreventPythonHook(pi, config);
  setupProtectEnvFilesHook(pi, config);
  setupPermissionGateHook(pi, config);
}
