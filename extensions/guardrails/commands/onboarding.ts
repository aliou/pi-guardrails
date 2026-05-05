import {
  getSettingsTheme,
  type SettingsTheme,
  Wizard,
} from "@aliou/pi-utils-settings";
import { getMarkdownTheme, type Theme } from "@mariozechner/pi-coding-agent";
import type { Component } from "@mariozechner/pi-tui";
import { Box, Key, Markdown, matchesKey, Text } from "@mariozechner/pi-tui";
import type { GuardrailsConfig } from "../config";
import { CURRENT_VERSION } from "../utils/migration";

interface OnboardingState {
  applyBuiltinDefaults: boolean | null;
  pathAccessEnabled: boolean | null;
}

export interface OnboardingResult {
  completed: boolean;
  applyBuiltinDefaults: boolean | null;
  pathAccessEnabled: boolean | null;
}

class IntroStep implements Component {
  private readonly introText = new Text("", 2, 0);

  constructor(private readonly onNext: () => void) {}

  invalidate() {
    this.introText.invalidate();
  }

  render(width: number): string[] {
    this.introText.setText(
      "Guardrails helps prevent accidental exposure of secrets and risky actions.\n\nIt gives you two protections:\n- Policies: file access rules (`noAccess` or `readOnly`)\n- Permission gate: confirmation before dangerous commands run\n\nYou are choosing the starting defaults now. You can change them later in `/guardrails:settings`.",
    );

    return [
      "  Welcome to Guardrails",
      "",
      ...this.introText.render(Math.max(1, width)),
    ];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      this.onNext();
    }
  }
}

class DefaultsChoiceStep implements Component {
  private selectedIndex = 0;
  private readonly settingsTheme: SettingsTheme;

  constructor(
    private readonly theme: Theme,
    private readonly state: OnboardingState,
    private readonly onSelect: () => void,
  ) {
    this.settingsTheme = getSettingsTheme(theme);
  }

  invalidate() {}

  render(width: number): string[] {
    const options = ["Recommended defaults", "Minimal setup"];
    const explanations = [
      [
        "Use built-ins for common safety needs:",
        "",
        "- Protect secret files like `.env`, `.env.local`, `.env.production`, and `.dev.vars`",
        "- Keep safe exceptions like `.env.example` and `*.sample.env`",
        "- Require confirmation before running dangerous commands like `rm -rf`, `sudo`, and `dd of=`",
      ].join("\n"),
      [
        "Start with no built-in file policy defaults.",
        "",
        "- Configure your own policies in `/guardrails:settings`",
        "- Browse policy and command examples in `/guardrails:settings`",
      ].join("\n"),
    ];

    const lines: string[] = [
      "  Pick how much built-in protection to start with.",
      "",
    ];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (!option) continue;
      const selected = i === this.selectedIndex;
      const prefix = selected ? this.settingsTheme.cursor : "  ";
      const label = this.settingsTheme.value(` ${option}`, selected);
      lines.push(`${prefix}${label}`);
    }

    lines.push("");

    const explanationBox = new Box(1, 0, (s: string) => s);
    explanationBox.addChild(
      new Markdown(
        explanations[this.selectedIndex] ?? "",
        0,
        0,
        getMarkdownTheme(),
        {
          color: (s: string) => this.theme.fg("text", s),
        },
      ),
    );

    lines.push(...explanationBox.render(Math.max(1, width)));

    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = this.selectedIndex === 0 ? 1 : 0;
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = this.selectedIndex === 1 ? 0 : 1;
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.state.applyBuiltinDefaults = this.selectedIndex === 0;
      this.onSelect();
    }
  }
}

class PathAccessStep implements Component {
  private selectedIndex = 0;
  private readonly settingsTheme: SettingsTheme;

  constructor(
    private readonly theme: Theme,
    private readonly state: OnboardingState,
    private readonly onSelect: () => void,
  ) {
    this.settingsTheme = getSettingsTheme(theme);
  }

  invalidate() {}

  render(width: number): string[] {
    const options = ["Ask before accessing outside files", "No restrictions"];
    const explanations = [
      [
        "When enabled, guardrails will prompt you before the agent accesses files outside the current working directory.",
        "",
        "- You can grant access per-file or per-directory",
        "- Grants can be session-only or permanent",
        "- In non-interactive mode, outside access is blocked",
      ].join("\n"),
      [
        "The agent can access any path on your system without prompting.",
        "",
        "- You can enable path access later in `/guardrails:settings`",
      ].join("\n"),
    ];

    const lines: string[] = [
      "  Restrict access to your project directory?",
      "",
    ];

    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      if (!option) continue;
      const selected = i === this.selectedIndex;
      const prefix = selected ? this.settingsTheme.cursor : "  ";
      const label = this.settingsTheme.value(` ${option}`, selected);
      lines.push(`${prefix}${label}`);
    }

    lines.push("");

    const explanationBox = new Box(1, 0, (s: string) => s);
    explanationBox.addChild(
      new Markdown(
        explanations[this.selectedIndex] ?? "",
        0,
        0,
        getMarkdownTheme(),
        {
          color: (s: string) => this.theme.fg("text", s),
        },
      ),
    );

    lines.push(...explanationBox.render(Math.max(1, width)));

    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex = this.selectedIndex === 0 ? 1 : 0;
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = this.selectedIndex === 1 ? 0 : 1;
      return;
    }

    if (matchesKey(data, Key.enter)) {
      this.state.pathAccessEnabled = this.selectedIndex === 0;
      this.onSelect();
    }
  }
}

class FinishStep implements Component {
  private readonly recapMarkdown = new Markdown("", 2, 0, getMarkdownTheme());

  constructor(
    private readonly state: OnboardingState,
    private readonly onFinish: () => void,
  ) {}

  invalidate() {
    this.recapMarkdown.invalidate();
  }

  render(width: number): string[] {
    const defaultsPart =
      this.state.applyBuiltinDefaults === true
        ? [
            "You selected **Recommended defaults**.",
            "",
            "Guardrails will start with built-in protection, including:",
            "- secret files like `.env`, `.env.local`, `.env.production`, `.dev.vars`",
            "- safe exceptions like `.env.example` and `*.sample.env`",
            "- confirmation before running dangerous commands like `rm -rf`, `sudo`, `dd of=`",
          ].join("\n")
        : [
            "You selected **Minimal setup**.",
            "",
            "No built-in file policy defaults will be applied.",
            "",
            "You can configure policies later with `/guardrails:settings`.",
          ].join("\n");

    const pathAccessPart = this.state.pathAccessEnabled
      ? "\n\n**Path access**: enabled (ask mode). The agent will prompt before accessing files outside the working directory."
      : "\n\n**Path access**: disabled. No path restrictions.";

    const content = defaultsPart + pathAccessPart;

    this.recapMarkdown.setText(content);
    return [...this.recapMarkdown.render(Math.max(1, width)), ""];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      this.onFinish();
    }
  }
}

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
          return new IntroStep(() => {
            ctx.markComplete();
            ctx.goNext();
          });
        },
      },
      {
        label: "Defaults",
        build: (ctx) =>
          new DefaultsChoiceStep(theme, state, () => {
            ctx.markComplete();
            ctx.goNext();
          }),
      },
      {
        label: "Path access",
        build: (ctx) =>
          new PathAccessStep(theme, state, () => {
            ctx.markComplete();
            ctx.goNext();
          }),
      },
      {
        label: "Recap",
        build: (ctx) =>
          new FinishStep(state, () => {
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

export function buildOnboardedConfig(
  applyBuiltinDefaults: boolean,
  pathAccessEnabled?: boolean | null,
): GuardrailsConfig {
  const config: GuardrailsConfig = {
    version: CURRENT_VERSION,
    applyBuiltinDefaults,
    onboarding: {
      completed: true,
      completedAt: new Date().toISOString(),
      version: CURRENT_VERSION,
    },
  };
  if (pathAccessEnabled) {
    config.features = { ...config.features, pathAccess: true };
    config.pathAccess = { mode: "ask" };
  }
  return config;
}

export function isOnboardingPending(config: GuardrailsConfig | null): boolean {
  if (!config) return true;
  return config.onboarding?.completed !== true;
}
