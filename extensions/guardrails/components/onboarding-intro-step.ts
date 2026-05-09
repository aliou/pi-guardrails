import type { Component } from "@earendil-works/pi-tui";
import { Key, matchesKey, Text } from "@earendil-works/pi-tui";

export class OnboardingIntroStep implements Component {
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
