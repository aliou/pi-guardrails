import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

/**
 * A submenu component for editing string arrays inside a SettingsList.
 *
 * Modes:
 * - list: navigate items, delete with 'd', add with 'a', edit with 'e'/Enter
 * - add: text input for new item, confirm with Enter, cancel with Escape
 * - edit: text input pre-filled with current value, Enter saves, Escape cancels
 */

export interface ArrayEditorOptions {
  label: string;
  items: string[];
  theme: SettingsListTheme;
  onSave: (items: string[]) => void;
  onDone: () => void;
  /** Max visible items before scrolling */
  maxVisible?: number;
}

export class ArrayEditor implements Component {
  private items: string[];
  private label: string;
  private theme: SettingsListTheme;
  private onSave: (items: string[]) => void;
  private onDone: () => void;
  private selectedIndex = 0;
  private maxVisible: number;
  private mode: "list" | "add" | "edit" = "list";
  private input: Input;
  private editIndex = -1;

  constructor(options: ArrayEditorOptions) {
    this.items = [...options.items];
    this.label = options.label;
    this.theme = options.theme;
    this.onSave = options.onSave;
    this.onDone = options.onDone;
    this.maxVisible = options.maxVisible ?? 10;
    this.input = new Input();
    this.input.onSubmit = (value: string) => {
      if (this.mode === "edit") {
        this.submitEdit(value);
      } else {
        this.submitAdd(value);
      }
    };
    this.input.onEscape = () => {
      this.mode = "list";
      this.editIndex = -1;
    };
  }

  private submitAdd(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      this.mode = "list";
      return;
    }
    this.items.push(trimmed);
    this.selectedIndex = this.items.length - 1;
    this.save();
    this.mode = "list";
    this.input.setValue("");
  }

  private submitEdit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      // Empty value = cancel edit
      this.mode = "list";
      this.editIndex = -1;
      return;
    }
    this.items[this.editIndex] = trimmed;
    this.save();
    this.mode = "list";
    this.editIndex = -1;
    this.input.setValue("");
  }

  private deleteSelected() {
    if (this.items.length === 0) return;
    this.items.splice(this.selectedIndex, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.save();
  }

  private startEdit() {
    if (this.items.length === 0) return;
    this.editIndex = this.selectedIndex;
    this.mode = "edit";
    this.input.setValue(this.items[this.selectedIndex] as string);
  }

  private save() {
    this.onSave([...this.items]);
  }

  invalidate() {}

  render(width: number): string[] {
    const lines: string[] = [];

    // Header
    lines.push(this.theme.label(` ${this.label}`, true));
    lines.push("");

    if (this.mode === "add" || this.mode === "edit") {
      return [...lines, ...this.renderInputMode(width)];
    }

    return [...lines, ...this.renderListMode(width)];
  }

  private renderListMode(width: number): string[] {
    const lines: string[] = [];

    if (this.items.length === 0) {
      lines.push(this.theme.hint("  (empty)"));
    } else {
      const startIndex = Math.max(
        0,
        Math.min(
          this.selectedIndex - Math.floor(this.maxVisible / 2),
          this.items.length - this.maxVisible,
        ),
      );
      const endIndex = Math.min(
        startIndex + this.maxVisible,
        this.items.length,
      );

      for (let i = startIndex; i < endIndex; i++) {
        const item = this.items[i];
        if (!item) continue;
        const isSelected = i === this.selectedIndex;
        const prefix = isSelected ? this.theme.cursor : "  ";
        const prefixWidth = visibleWidth(prefix);
        const maxItemWidth = width - prefixWidth - 2;
        const text = this.theme.value(
          truncateToWidth(item, maxItemWidth, ""),
          isSelected,
        );
        lines.push(prefix + text);
      }

      if (startIndex > 0 || endIndex < this.items.length) {
        lines.push(
          this.theme.hint(`  (${this.selectedIndex + 1}/${this.items.length})`),
        );
      }
    }

    lines.push("");
    lines.push(
      this.theme.hint("  a: add · e/Enter: edit · d: delete · Esc: back"),
    );

    return lines;
  }

  private renderInputMode(width: number): string[] {
    const lines: string[] = [];
    const label = this.mode === "edit" ? "  Edit item:" : "  New item:";
    lines.push(this.theme.hint(label));
    lines.push(`  ${this.input.render(width - 4).join("")}`);
    lines.push("");
    lines.push(this.theme.hint("  Enter: confirm · Esc: cancel"));
    return lines;
  }

  handleInput(data: string) {
    if (this.mode === "add" || this.mode === "edit") {
      this.input.handleInput(data);
      return;
    }

    // List mode
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
      this.onDone();
    }
  }
}
