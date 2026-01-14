import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { setupPermissionGateHook } from "./permission-gate";
import { setupPreventBrewHook } from "./prevent-brew";
import { setupProtectEnvFilesHook } from "./protect-env-files";

export function setupGuardrailsHooks(pi: ExtensionAPI) {
  setupPreventBrewHook(pi);
  setupProtectEnvFilesHook(pi);
  setupPermissionGateHook(pi);
}
