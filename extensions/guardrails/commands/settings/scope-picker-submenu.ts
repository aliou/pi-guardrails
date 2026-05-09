import {
  type Component,
  Key,
  matchesKey,
  type SettingsListTheme,
} from "@earendil-works/pi-tui";

export class ScopePickerSubmenu implements Component {
  private selectedIndex = 0;

  constructor(
    private readonly theme: SettingsListTheme,
    private readonly scopes: Array<"global" | "local" | "memory">,
    private readonly onSelect: (scope: "global" | "local" | "memory") => void,
    private readonly onDone: (value?: string) => void,
  ) {}

  invalidate() {}

  render(_width: number): string[] {
    const lines: string[] = [
      this.theme.label(" Add example to scope", true),
      "",
      this.theme.hint("  Select target scope:"),
    ];

    for (let i = 0; i < this.scopes.length; i++) {
      const scope = this.scopes[i];
      if (!scope) continue;
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? this.theme.cursor : "  ";
      lines.push(`${prefix}${this.theme.value(scope, isSelected)}`);
    }

    lines.push("");
    lines.push(this.theme.hint("  Enter: apply · Esc: back"));
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.scopes.length - 1
          : this.selectedIndex - 1;
      return;
    }

    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex =
        this.selectedIndex === this.scopes.length - 1
          ? 0
          : this.selectedIndex + 1;
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const scope = this.scopes[this.selectedIndex];
      if (!scope) return;
      this.onSelect(scope);
      this.onDone(`applied to ${scope}`);
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.onDone();
    }
  }
}
