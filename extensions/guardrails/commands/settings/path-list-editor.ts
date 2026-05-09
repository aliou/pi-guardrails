import {
  type Component,
  Input,
  Key,
  matchesKey,
  type SettingsListTheme,
} from "@earendil-works/pi-tui";

export class PathListEditor implements Component {
  private readonly input = new Input();
  private items: string[];
  private selectedIndex = 0;
  private mode: "list" | "add" | "edit" = "list";
  private editIndex = -1;

  constructor(
    private readonly options: {
      label: string;
      items: string[];
      theme: SettingsListTheme;
      onSave: (items: string[]) => void;
      onDone: () => void;
      maxVisible?: number;
    },
  ) {
    this.items = [...options.items];
    this.input.onSubmit = () => this.submit();
    this.input.onEscape = () => this.cancel();
  }

  invalidate() {}

  render(width: number): string[] {
    const lines = [
      this.options.theme.label(` ${this.options.label}`, true),
      "",
    ];
    if (this.mode === "add" || this.mode === "edit") {
      lines.push(
        this.options.theme.hint(
          this.mode === "edit" ? "  Edit path:" : "  New path:",
        ),
        "",
        ...this.input.render(Math.max(1, width - 4)).map((line) => `  ${line}`),
        "",
        this.options.theme.hint("  Enter: save · Esc: cancel"),
      );
      return lines;
    }

    if (this.items.length === 0) {
      lines.push(this.options.theme.hint("  (empty)"));
    } else {
      const maxVisible = this.options.maxVisible ?? 10;
      const startIndex = Math.max(
        0,
        Math.min(
          this.selectedIndex - Math.floor(maxVisible / 2),
          this.items.length - maxVisible,
        ),
      );
      const endIndex = Math.min(startIndex + maxVisible, this.items.length);
      for (let i = startIndex; i < endIndex; i++) {
        const item = this.items[i];
        if (!item) continue;
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? this.options.theme.cursor : "  ";
        lines.push(prefix + this.options.theme.value(item, isSelected));
      }
      if (startIndex > 0 || endIndex < this.items.length) {
        lines.push(
          this.options.theme.hint(
            `  (${this.selectedIndex + 1}/${this.items.length})`,
          ),
        );
      }
    }

    lines.push("");
    lines.push(
      this.options.theme.hint(
        "  a: add · e/Enter: edit · d: delete · Esc: back",
      ),
    );
    return lines;
  }

  handleInput(data: string): void {
    if (this.mode === "add" || this.mode === "edit") {
      this.input.handleInput(data);
      return;
    }

    if (matchesKey(data, Key.up) || data === "k") {
      if (this.items.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === 0
          ? this.items.length - 1
          : this.selectedIndex - 1;
    } else if (matchesKey(data, Key.down) || data === "j") {
      if (this.items.length === 0) return;
      this.selectedIndex =
        this.selectedIndex === this.items.length - 1
          ? 0
          : this.selectedIndex + 1;
    } else if (data === "a" || data === "A") {
      this.mode = "add";
      this.input.setValue("");
    } else if (data === "e" || data === "E" || matchesKey(data, Key.enter)) {
      this.startEdit();
    } else if (data === "d" || data === "D") {
      this.deleteSelected();
    } else if (matchesKey(data, Key.escape)) {
      this.options.onDone();
    }
  }

  private startEdit(): void {
    const item = this.items[this.selectedIndex];
    if (!item) return;
    this.mode = "edit";
    this.editIndex = this.selectedIndex;
    this.input.setValue(item);
  }

  private submit(): void {
    const path = this.input.getValue().trim();
    if (!path) {
      this.cancel();
      return;
    }

    if (this.mode === "edit") {
      this.items[this.editIndex] = path;
    } else {
      this.items.push(path);
      this.selectedIndex = this.items.length - 1;
    }
    this.items = [...new Set(this.items)];
    this.options.onSave([...this.items]);
    this.cancel();
  }

  private deleteSelected(): void {
    if (this.items.length === 0) return;
    this.items.splice(this.selectedIndex, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.options.onSave([...this.items]);
  }

  private cancel(): void {
    this.mode = "list";
    this.editIndex = -1;
    this.input.setValue("");
  }
}
