import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGuardrailsSettings } from "./commands/settings-command";
import { configLoader } from "./config";
import { setupGuardrailsHooks } from "./hooks";

/**
 * Guardrails Extension
 *
 * Security hooks to prevent potentially dangerous operations:
 * - protect-env-files: Prevents access to .env files (except .example/.sample/.test)
 * - permission-gate: Prompts for confirmation on dangerous commands
 *
 * Toolchain features (preventBrew, preventPython, enforcePackageManager,
 * packageManager) have been moved to @aliou/pi-toolchain. Old configs
 * containing these fields are auto-migrated on first load.
 *
 * Configuration:
 * - Global: ~/.pi/agent/extensions/guardrails.json
 * - Project: .pi/extensions/guardrails.json
 * - Command: /guardrails:settings
 */
export default async function (pi: ExtensionAPI) {
  await configLoader.load();
  const config = configLoader.getConfig();

  if (!config.enabled) return;

  setupGuardrailsHooks(pi, config);
  registerGuardrailsSettings(pi);
}
