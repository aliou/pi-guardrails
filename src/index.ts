import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { registerGuardrailsSettings } from "./commands/settings-command";
import { configLoader, type GuardrailsConfig } from "./config";
import { setupGuardrailsHooks } from "./hooks";
import { CURRENT_VERSION } from "./utils/migration";
import { pendingWarnings } from "./utils/warnings";

/**
 * Guardrails Extension
 *
 * Security hooks to prevent potentially dangerous operations:
 * - policies: File access policies with per-rule protection levels
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

  // First-run bootstrap: create global settings file with explicit
  // applyBuiltinDefaults=false (no warning, no migration path).
  if (!configLoader.hasConfig("global")) {
    const bootstrap: GuardrailsConfig = {
      version: CURRENT_VERSION,
      applyBuiltinDefaults: false,
    };
    await configLoader.save("global", bootstrap);
  }

  const config = configLoader.getConfig();

  if (!config.enabled) return;

  setupGuardrailsHooks(pi, config);
  registerGuardrailsSettings(pi);

  pi.on("session_start", (_event, ctx) => {
    for (const warning of pendingWarnings.splice(0)) {
      ctx.ui.notify(warning, "warning");
    }
  });
}
