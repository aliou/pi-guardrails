import {
  type Component,
  Input,
  Key,
  matchesKey,
  type SettingsListTheme,
} from "@earendil-works/pi-tui";
import type { AllowedPath } from "../../../../src/core/paths";

type PathKind = "file" | "directory";

function kindLabel(kind: PathKind): string {
  return kind === "directory" ? "dir" : "file";
}

function isAllowedPath(value: unknown): value is AllowedPath {
  if (!value || typeof value !== "object") return false;
  const entry = value as { kind?: unknown; path?: unknown };
  return (
    (entry.kind === "file" || entry.kind === "directory") &&
    typeof entry.path === "string"
  );
}

export class PathListEditor implements Component {
  private readonly input = new Input();
  private items: AllowedPath[];
  private selectedIndex = 0;
  private mode: "list" | "add" | "edit" = "list";
  private editIndex = -1;
  private draftKind: PathKind = "file";

  constructor(
    private readonly options: {
      label: string;
      items: AllowedPath[];
      theme: SettingsListTheme;
      onSave: (items: AllowedPath[]) => void;
      onDone: () => void;
      maxVisible?: number;
    },
  ) {
    this.items = options.items.filter(isAllowedPath).map((item) => ({
      kind: item.kind,
      path: item.path,
    }));
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
        this.options.theme.hint(
          `  kind: ${kindLabel(this.draftKind)} (Tab to toggle file/dir)`,
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
        const kind = this.options.theme.hint(`[${kindLabel(item.kind)}]`);
        const value = this.options.theme.value(item.path, isSelected);
        lines.push(`${prefix}${kind} ${value}`);
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
      if (matchesKey(data, Key.tab)) {
        this.draftKind = this.draftKind === "file" ? "directory" : "file";
        return;
      }
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
      this.draftKind = "file";
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
    this.draftKind = item.kind;
    this.input.setValue(item.path);
  }

  private submit(): void {
    const path = this.input.getValue().trim();
    if (!path) {
      this.cancel();
      return;
    }

    const entry: AllowedPath = { kind: this.draftKind, path };

    if (this.mode === "edit") {
      this.items[this.editIndex] = entry;
    } else {
      this.items.push(entry);
      this.selectedIndex = this.items.length - 1;
    }
    this.items = dedupe(this.items);
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
    this.draftKind = "file";
    this.input.setValue("");
  }
}

function dedupe(items: AllowedPath[]): AllowedPath[] {
  const seen = new Set<string>();
  const result: AllowedPath[] = [];
  for (const item of items) {
    const key = `${item.kind}:${item.path}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
