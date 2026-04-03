import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { isOnboardingPending } from "./commands/onboarding";
import { registerGuardrailsOnboardingCommand } from "./commands/onboarding-command";
import { registerGuardrailsSettings } from "./commands/settings-command";
import { configLoader } from "./config";
import { setupGuardrailsHooks } from "./hooks";
import {
  migrateApplyBuiltinDefaults,
  migrateMarkOnboardingDone,
  needsApplyBuiltinDefaultsMigration,
  needsOnboardingDoneMigration,
} from "./utils/migration";
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

  const hasGlobalConfig = configLoader.hasConfig("global");

  if (hasGlobalConfig) {
    const globalConfig = configLoader.getRawConfig("global");
    if (globalConfig) {
      let migrated = globalConfig;
      let changed = false;

      if (needsApplyBuiltinDefaultsMigration(migrated)) {
        migrated = migrateApplyBuiltinDefaults(migrated);
        changed = true;
      }

      if (needsOnboardingDoneMigration(migrated)) {
        migrated = migrateMarkOnboardingDone(migrated);
        changed = true;
      }

      if (changed) {
        await configLoader.save("global", migrated);
        await configLoader.load();
      }
    }
  }

  let hooksRegistered = false;

  registerGuardrailsSettings(pi);

  const maybeRegisterHooks = () => {
    if (hooksRegistered) return;
    const config = configLoader.getConfig();
    if (!config.enabled) return;
    setupGuardrailsHooks(pi, config);
    hooksRegistered = true;
  };

  if (isOnboardingPending(configLoader.getRawConfig("global"))) {
    registerGuardrailsOnboardingCommand(pi, maybeRegisterHooks);
  } else {
    maybeRegisterHooks();
  }

  pi.on("session_start", (_event, ctx) => {
    for (const warning of pendingWarnings.splice(0)) {
      ctx.ui.notify(warning, "warning");
    }

    if (!ctx.hasUI) {
      return;
    }

    if (isOnboardingPending(configLoader.getRawConfig("global"))) {
      ctx.ui.notify(
        "[Guardrails] setup pending. Run `/guardrails:onboarding` to choose recommended or minimal protection defaults.",
        "info",
      );
      return;
    }

    maybeRegisterHooks();
  });
}
