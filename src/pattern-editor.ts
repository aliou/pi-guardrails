import type { Component, SettingsListTheme } from "@mariozechner/pi-tui";
import {
  Input,
  Key,
  matchesKey,
  truncateToWidth,
  visibleWidth,
} from "@mariozechner/pi-tui";

/**
 * A submenu component for editing an array of {pattern, description, regex?} objects.
 *
 * List mode: navigate, delete with 'd', add with 'a', edit with 'e'/Enter.
 * Form mode: three-field form (pattern + description + regex toggle),
 *            Tab to switch fields, Enter to submit, Escape to cancel.
 */

export interface PatternItem {
  pattern: string;
  description: string;
  regex?: boolean;
}

export interface PatternEditorOptions {
  label: string;
  items: PatternItem[];
  theme: SettingsListTheme;
  onSave: (items: PatternItem[]) => void;
  onDone: () => void;
  /** Context hint for the pattern field label. */
  context?: "file" | "command";
  maxVisible?: number;
}

type Field = "pattern" | "description" | "regex";

export class PatternEditor implements Component {
  private items: PatternItem[];
  private label: string;
  private theme: SettingsListTheme;
  private onSave: (items: PatternItem[]) => void;
  private onDone: () => void;
  private context: "file" | "command";
  private selectedIndex = 0;
  private maxVisible: number;
  private mode: "list" | "add" | "edit" = "list";
  private editIndex = -1;

  // Form state
  private patternInput: Input;
  private descriptionInput: Input;
  private activeField: Field = "pattern";
  private regexEnabled = false;

  constructor(options: PatternEditorOptions) {
    this.items = [...options.items];
    this.label = options.label;
    this.theme = options.theme;
    this.onSave = options.onSave;
    this.onDone = options.onDone;
    this.context = options.context ?? "command";
    this.maxVisible = options.maxVisible ?? 10;

    this.patternInput = new Input();
    this.descriptionInput = new Input();

    this.patternInput.onSubmit = () => this.submitOrSwitchField();
    this.patternInput.onEscape = () => this.cancelForm();

    this.descriptionInput.onSubmit = () => this.submitOrSwitchField();
    this.descriptionInput.onEscape = () => this.cancelForm();
  }

  private submitOrSwitchField() {
    // If on pattern field and it has content, move to description
    if (this.activeField === "pattern" && this.patternInput.getValue().trim()) {
      this.activeField = "description";
      return;
    }

    // If on description field, move to regex toggle
    if (this.activeField === "description") {
      this.activeField = "regex";
      return;
    }

    // If on regex field, submit
    this.submitForm();
  }

  private submitForm() {
    const pattern = this.patternInput.getValue().trim();
    const description = this.descriptionInput.getValue().trim();

    if (!pattern) {
      this.cancelForm();
      return;
    }

    const item: PatternItem = {
      pattern,
      description: description || pattern,
    };
    if (this.regexEnabled) {
      item.regex = true;
    }

    if (this.mode === "edit") {
      this.items[this.editIndex] = item;
    } else {
      this.items.push(item);
      this.selectedIndex = this.items.length - 1;
    }

    this.onSave([...this.items]);
    this.cancelForm();
  }

  private cancelForm() {
    this.mode = "list";
    this.editIndex = -1;
    this.activeField = "pattern";
    this.regexEnabled = false;
    this.patternInput.setValue("");
    this.descriptionInput.setValue("");
  }

  private startEdit() {
    if (this.items.length === 0) return;
    const item = this.items[this.selectedIndex];
    if (!item) return;
    this.editIndex = this.selectedIndex;
    this.mode = "edit";
    this.activeField = "pattern";
    this.patternInput.setValue(item.pattern);
    this.descriptionInput.setValue(item.description);
    this.regexEnabled = item.regex ?? false;
  }

  private deleteSelected() {
    if (this.items.length === 0) return;
    this.items.splice(this.selectedIndex, 1);
    if (this.selectedIndex >= this.items.length) {
      this.selectedIndex = Math.max(0, this.items.length - 1);
    }
    this.onSave([...this.items]);
  }

  invalidate() {}

  render(width: number): string[] {
    const lines: string[] = [];
    lines.push(this.theme.label(` ${this.label}`, true));
    lines.push("");

    if (this.mode === "add" || this.mode === "edit") {
      return [...lines, ...this.renderFormMode(width)];
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
        const regexTag = item.regex ? " [regex]" : "";
        const display = `${item.description} (${item.pattern})${regexTag}`;
        const text = this.theme.value(
          truncateToWidth(display, maxItemWidth, ""),
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

  private renderFormMode(width: number): string[] {
    const lines: string[] = [];
    const inputWidth = width - 4;
    const isEdit = this.mode === "edit";

    const patternActive = this.activeField === "pattern";
    const descActive = this.activeField === "description";
    const regexActive = this.activeField === "regex";

    // Title
    lines.push(this.theme.hint(isEdit ? "  Edit pattern:" : "  New pattern:"));
    lines.push("");

    // Pattern field
    const patternHint =
      this.context === "file" ? "(glob or regex)" : "(substring or regex)";
    const patternLabel = `  Pattern ${patternHint}:`;
    lines.push(
      patternActive
        ? this.theme.label(patternLabel, true)
        : this.theme.hint(patternLabel),
    );
    lines.push(`  ${this.patternInput.render(inputWidth).join("")}`);
    lines.push("");

    // Description field
    const descLabel = "  Description:";
    lines.push(
      descActive
        ? this.theme.label(descLabel, true)
        : this.theme.hint(descLabel),
    );
    lines.push(`  ${this.descriptionInput.render(inputWidth).join("")}`);
    lines.push("");

    // Regex toggle
    const regexLabel = "  Regex:";
    const regexValue = this.regexEnabled ? "on" : "off";
    const regexDisplay = `${regexLabel} ${regexValue}`;
    lines.push(
      regexActive
        ? this.theme.label(regexDisplay, true)
        : this.theme.hint(regexDisplay),
    );
    lines.push("");

    lines.push(
      this.theme.hint(
        "  Tab: switch field · Space: toggle regex · Enter: next/submit · Esc: cancel",
      ),
    );

    return lines;
  }

  handleInput(data: string) {
    if (this.mode === "add" || this.mode === "edit") {
      this.handleFormInput(data);
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
      this.activeField = "pattern";
      this.regexEnabled = false;
      this.patternInput.setValue("");
      this.descriptionInput.setValue("");
    } else if (data === "e" || data === "E" || matchesKey(data, Key.enter)) {
      this.startEdit();
    } else if (data === "d" || data === "D") {
      this.deleteSelected();
    } else if (matchesKey(data, Key.escape)) {
      this.onDone();
    }
  }

  private handleFormInput(data: string) {
    if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
      const fields: Field[] = ["pattern", "description", "regex"];
      const idx = fields.indexOf(this.activeField);
      const dir = matchesKey(data, Key.shift("tab")) ? -1 : 1;
      this.activeField = fields[
        (idx + dir + fields.length) % fields.length
      ] as Field;
      return;
    }

    if (matchesKey(data, Key.escape)) {
      this.cancelForm();
      return;
    }

    // Regex toggle: space toggles when on regex field
    if (this.activeField === "regex") {
      if (data === " " || matchesKey(data, Key.enter)) {
        this.regexEnabled = !this.regexEnabled;
      }
      // Enter on regex field submits if we already have a pattern
      if (matchesKey(data, Key.enter) && this.patternInput.getValue().trim()) {
        this.submitForm();
      }
      return;
    }

    // Delegate to active input
    const activeInput =
      this.activeField === "pattern"
        ? this.patternInput
        : this.descriptionInput;
    activeInput.handleInput(data);
  }
}
