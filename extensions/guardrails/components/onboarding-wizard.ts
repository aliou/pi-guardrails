import { Wizard } from "@aliou/pi-utils-settings";
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Key, matchesKey } from "@earendil-works/pi-tui";
import {
  OnboardingDefaultsChoiceStep,
  OnboardingPathAccessStep,
} from "./onboarding-choice-step";
import { OnboardingFinishStep } from "./onboarding-finish-step";
import { OnboardingIntroStep } from "./onboarding-intro-step";
import type { OnboardingResult, OnboardingState } from "./onboarding-types";

export type { OnboardingResult } from "./onboarding-types";

export function createOnboardingWizard(
  theme: Theme,
  done: (result: OnboardingResult) => void,
): Component {
  const state: OnboardingState = {
    applyBuiltinDefaults: null,
    pathAccessEnabled: null,
  };

  let markWelcomeComplete: (() => void) | null = null;
  let settled = false;

  const finalize = (result: OnboardingResult) => {
    if (settled) return;
    settled = true;
    done(result);
  };

  const wizard = new Wizard({
    title: "Guardrails onboarding",
    theme,
    steps: [
      {
        label: "Welcome",
        build: (ctx) => {
          markWelcomeComplete = ctx.markComplete;
          return new OnboardingIntroStep(() => {
            ctx.markComplete();
            ctx.goNext();
          });
        },
      },
      {
        label: "Defaults",
        build: (ctx) =>
          new OnboardingDefaultsChoiceStep(state, theme, () => {
            ctx.markComplete();
            ctx.goNext();
          }),
      },
      {
        label: "Path access",
        build: (ctx) =>
          new OnboardingPathAccessStep(state, theme, () => {
            ctx.markComplete();
            ctx.goNext();
          }),
      },
      {
        label: "Recap",
        build: (ctx) =>
          new OnboardingFinishStep(state, () => {
            if (state.applyBuiltinDefaults === null) return;
            ctx.markComplete();
            finalize({
              completed: true,
              applyBuiltinDefaults: state.applyBuiltinDefaults,
              pathAccessEnabled: state.pathAccessEnabled,
            });
          }),
      },
    ],
    onComplete: () => {
      if (state.applyBuiltinDefaults === null) {
        finalize({
          completed: false,
          applyBuiltinDefaults: null,
          pathAccessEnabled: null,
        });
        return;
      }
      finalize({
        completed: true,
        applyBuiltinDefaults: state.applyBuiltinDefaults,
        pathAccessEnabled: state.pathAccessEnabled,
      });
    },
    onCancel: () =>
      finalize({
        completed: false,
        applyBuiltinDefaults: null,
        pathAccessEnabled: null,
      }),
    hintSuffix: "Enter select/continue",
    minContentHeight: 12,
  });

  return {
    render: (width) => wizard.render(width),
    invalidate: () => wizard.invalidate(),
    handleInput: (data: string) => {
      if (
        matchesKey(data, Key.tab) &&
        wizard.getActiveIndex() === 0 &&
        markWelcomeComplete
      ) {
        markWelcomeComplete();
      }
      wizard.handleInput(data);
    },
  };
}
