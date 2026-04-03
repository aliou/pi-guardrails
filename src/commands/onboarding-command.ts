import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { configLoader, type GuardrailsConfig } from "../config";
import {
  buildOnboardedConfig,
  createOnboardingWizard,
  isOnboardingPending,
  type OnboardingResult,
} from "./onboarding";

function mergeOnboarding(
  base: GuardrailsConfig | null,
  applyBuiltinDefaults: boolean,
): GuardrailsConfig {
  const next = structuredClone(base ?? {});
  const onboarded = buildOnboardedConfig(applyBuiltinDefaults);
  next.applyBuiltinDefaults = onboarded.applyBuiltinDefaults;
  next.version = onboarded.version;
  next.onboarding = onboarded.onboarding;
  return next;
}

export function registerGuardrailsOnboardingCommand(
  pi: ExtensionAPI,
  onCompleted?: () => void,
): void {
  pi.registerCommand("guardrails:onboarding", {
    description: "Run guardrails onboarding",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const globalConfig = configLoader.getRawConfig("global");
      if (!isOnboardingPending(globalConfig)) {
        ctx.ui.notify(
          "[Guardrails] onboarding already completed. Use /guardrails:settings to update behavior.",
          "info",
        );
        return;
      }

      const result = await ctx.ui.custom<OnboardingResult>(
        (_tui, theme, _keybindings, done) =>
          createOnboardingWizard(theme, done),
        { overlay: true },
      );

      if (!result.completed || result.applyBuiltinDefaults === null) {
        ctx.ui.notify("[Guardrails] onboarding cancelled.", "warning");
        return;
      }

      const merged = mergeOnboarding(globalConfig, result.applyBuiltinDefaults);
      await configLoader.save("global", merged);
      await configLoader.load();

      onCompleted?.();
      ctx.ui.notify("[Guardrails] onboarding completed.", "info");
    },
  });
}
