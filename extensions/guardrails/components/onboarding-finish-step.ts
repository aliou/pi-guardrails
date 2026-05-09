import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Key, Markdown, matchesKey } from "@earendil-works/pi-tui";
import type { OnboardingState } from "./onboarding-types";

export class OnboardingFinishStep implements Component {
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

    this.recapMarkdown.setText(defaultsPart + pathAccessPart);
    return [...this.recapMarkdown.render(Math.max(1, width)), ""];
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.enter)) {
      this.onFinish();
    }
  }
}
