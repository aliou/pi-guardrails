import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { drainPendingWarnings } from "../../src/shared/warnings";
import { registerGuardrailsOnboardingCommand } from "./commands/onboarding-command";
import { registerGuardrailsSettings } from "./commands/settings-command";
import { configLoader, globalConfigMigrations } from "./config";
import { setupGuardrailsHooks } from "./hooks";

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

      for (const migration of globalConfigMigrations) {
        if (migration.shouldRun(migrated)) {
          migrated = migration.run(migrated);
          changed = true;
        }
      }

      if (changed) {
        await configLoader.save("global", migrated);
        await configLoader.load();
      }
    }
  }

  let hooksRegistered = false;

  registerGuardrailsSettings(pi);

  const isSetupMissing = () =>
    !configLoader.hasConfig("global") && !configLoader.hasConfig("local");

  const maybeRegisterHooks = () => {
    if (hooksRegistered) return;
    const config = configLoader.getConfig();
    if (!config.enabled) return;
    setupGuardrailsHooks(pi, config);
    hooksRegistered = true;
  };

  if (isSetupMissing()) {
    registerGuardrailsOnboardingCommand(pi, maybeRegisterHooks);
  } else {
    maybeRegisterHooks();
  }

  pi.on("session_start", (_event, ctx) => {
    const warnings = drainPendingWarnings();
    if (warnings.length === 1) {
      ctx.ui.notify(warnings[0] as string, "warning");
    } else if (warnings.length > 1) {
      ctx.ui.notify(
        [
          "Guardrails warnings:",
          ...warnings.map((warning) => `- ${warning}`),
        ].join("\n"),
        "warning",
      );
    }

    if (!ctx.hasUI) {
      return;
    }

    if (isSetupMissing()) {
      ctx.ui.notify(
        "[Guardrails] setup pending. Run `/guardrails:onboarding` to choose recommended or minimal protection defaults.",
        "info",
      );
      return;
    }

    maybeRegisterHooks();
  });
}
