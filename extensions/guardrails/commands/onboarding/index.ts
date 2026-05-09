import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { configLoader } from "../../../../src/shared/config";
import {
  createOnboardingWizard,
  type OnboardingResult,
} from "../../components/onboarding-wizard";
import { isOnboardingPending, mergeOnboardingConfig } from "./config";

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

      const merged = mergeOnboardingConfig(
        globalConfig,
        result.applyBuiltinDefaults,
        result.pathAccessEnabled,
      );
      await configLoader.save("global", merged);
      await configLoader.load();

      onCompleted?.();
      ctx.ui.notify("[Guardrails] onboarding completed.", "info");
    },
  });
}
