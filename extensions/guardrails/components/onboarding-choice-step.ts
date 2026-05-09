import { getSettingsTheme, type SettingsTheme } from "@aliou/pi-utils-settings";
import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Box, Key, Markdown, matchesKey } from "@earendil-works/pi-tui";
import type { OnboardingState } from "./onboarding-types";

abstract class OnboardingChoiceStep implements Component {
  private selectedIndex = 0;
  private readonly settingsTheme: SettingsTheme;

  protected constructor(
    private readonly theme: Theme,
    private readonly onSelect: (selectedIndex: number) => void,
  ) {
    this.settingsTheme = getSettingsTheme(theme);
  }

  invalidate() {}

  protected abstract getTitle(): string;
  protected abstract getOptions(): string[];
  protected abstract getExplanations(): string[];

  render(width: number): string[] {
    const options = this.getOptions();
    const explanations = this.getExplanations();
    const lines: string[] = [`  ${this.getTitle()}`, ""];

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
      this.onSelect(this.selectedIndex);
    }
  }
}

export class OnboardingDefaultsChoiceStep extends OnboardingChoiceStep {
  constructor(state: OnboardingState, theme: Theme, onSelect: () => void) {
    super(theme, (selectedIndex) => {
      state.applyBuiltinDefaults = selectedIndex === 0;
      onSelect();
    });
  }

  protected getTitle(): string {
    return "Pick how much built-in protection to start with.";
  }

  protected getOptions(): string[] {
    return ["Recommended defaults", "Minimal setup"];
  }

  protected getExplanations(): string[] {
    return [
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
  }
}

export class OnboardingPathAccessStep extends OnboardingChoiceStep {
  constructor(state: OnboardingState, theme: Theme, onSelect: () => void) {
    super(theme, (selectedIndex) => {
      state.pathAccessEnabled = selectedIndex === 0;
      onSelect();
    });
  }

  protected getTitle(): string {
    return "Restrict access to your project directory?";
  }

  protected getOptions(): string[] {
    return ["Ask before accessing outside files", "No restrictions"];
  }

  protected getExplanations(): string[] {
    return [
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
  }
}
