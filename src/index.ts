import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader } from "./config";
import { setupGuardrailsHooks } from "./hooks";
import { registerSettingsCommand } from "./settings-command";

/**
 * Guardrails Extension
 *
 * Security hooks to prevent potentially dangerous operations:
 * - prevent-brew: Blocks Homebrew commands (project uses Nix)
 * - protect-env-files: Prevents access to .env files (except .example/.sample/.test)
 * - permission-gate: Prompts for confirmation on dangerous commands
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
  registerSettingsCommand(pi);
}
