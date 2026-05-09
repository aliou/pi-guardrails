import {
  FuzzySelector,
  type SettingsTheme,
  Wizard,
} from "@aliou/pi-utils-settings";
import {
  type Component,
  Input,
  type SettingsListTheme,
} from "@earendil-works/pi-tui";
import type { PatternConfig } from "../../../../src/shared/config";
import { PatternEditor } from "../../components/pattern-editor";
import { type NewPolicyRuleDraft, toKebabCase } from "./utils";

type NewPolicyDraft = NewPolicyRuleDraft;

class PolicyNameStep implements Component {
  private readonly input = new Input();

  constructor(
    private readonly theme: SettingsListTheme,
    private readonly state: NewPolicyDraft,
    private readonly onComplete: () => void,
  ) {
    this.input.setValue(state.name);
    this.input.onSubmit = () => {
      const name = this.input.getValue().trim();
      if (!name) return;
      this.state.name = name;
      if (!this.state.id) {
        this.state.id = toKebabCase(name) || "policy";
      }
      this.onComplete();
    };
  }

  invalidate() {}

  render(width: number): string[] {
    return [
      this.theme.hint("  Step 1: Policy name"),
      "",
      ...this.input.render(Math.max(1, width - 2)).map((line) => ` ${line}`),
      "",
      this.theme.hint("  Example: Secret files"),
      this.theme.hint("  Enter to continue"),
    ];
  }

  handleInput(data: string): void {
    this.input.handleInput(data);
  }
}

class PolicyProtectionStep implements Component {
  private readonly selector: FuzzySelector;

  constructor(
    theme: SettingsListTheme,
    state: NewPolicyDraft,
    onComplete: () => void,
  ) {
    this.selector = new FuzzySelector({
      label: "Protection",
      items: ["noAccess", "readOnly", "none"],
      currentValue: state.protection,
      theme,
      onSelect: (value) => {
        if (value === "noAccess" || value === "readOnly" || value === "none") {
          state.protection = value;
          onComplete();
        }
      },
      onDone: () => {
        // Esc is handled by Wizard.
      },
    });
  }

  invalidate(): void {
    this.selector.invalidate?.();
  }

  render(width: number): string[] {
    return this.selector.render(width);
  }

  handleInput(data: string): void {
    this.selector.handleInput(data);
  }
}

class PolicyPatternsStep implements Component {
  private readonly editor: PatternEditor;

  constructor(
    theme: SettingsListTheme,
    state: NewPolicyDraft,
    onComplete: () => void,
  ) {
    this.editor = new PatternEditor({
      label: "Policy patterns",
      context: "file",
      theme,
      items: state.patterns.map((p) => ({
        pattern: p.pattern,
        description: p.pattern,
        regex: p.regex,
      })),
      onSave: (items) => {
        state.patterns = items
          .map((item) => {
            const pattern = item.pattern.trim();
            if (!pattern) return null;
            return {
              pattern,
              ...(item.regex ? { regex: true } : {}),
            };
          })
          .filter((item): item is PatternConfig => item !== null);
      },
      onDone: () => {
        if (state.patterns.length > 0) {
          onComplete();
        }
      },
    });
  }

  invalidate(): void {
    this.editor.invalidate?.();
  }

  render(width: number): string[] {
    return this.editor.render(width);
  }

  handleInput(data: string): void {
    this.editor.handleInput(data);
  }
}

class PolicyReviewStep implements Component {
  constructor(
    private readonly theme: SettingsListTheme,
    private readonly state: NewPolicyDraft,
  ) {}

  invalidate() {}

  render(_width: number): string[] {
    const patternPreview =
      this.state.patterns.length > 0
        ? this.state.patterns
            .slice(0, 3)
            .map((p) => `${p.pattern}${p.regex ? " [regex]" : ""}`)
            .join(", ")
        : "(none)";

    return [
      this.theme.hint("  Review"),
      "",
      this.theme.hint(`  Name: ${this.state.name || "(empty)"}`),
      this.theme.hint(`  ID: ${this.state.id || "(auto)"}`),
      this.theme.hint(`  Protection: ${this.state.protection}`),
      this.theme.hint(`  Patterns: ${this.state.patterns.length}`),
      this.theme.hint(`  ${patternPreview}`),
      "",
      this.theme.hint("  Ctrl+S: create + open editor · Esc: cancel"),
    ];
  }

  handleInput(_data: string): void {}
}

export class AddRuleSubmenu implements Component {
  private readonly wizard: Wizard;
  private activeEditor: Component | null = null;

  constructor(
    theme: SettingsTheme,
    onCreate: (draft: NewPolicyDraft) => number | null,
    openEditor: (index: number, done: (value?: string) => void) => Component,
    onDone: (value?: string) => void,
  ) {
    const state: NewPolicyDraft = {
      name: "",
      id: "",
      protection: "readOnly",
      patterns: [],
    };

    this.wizard = new Wizard({
      title: "Add policy",
      theme,
      steps: [
        {
          label: "Name",
          build: (ctx) =>
            new PolicyNameStep(theme, state, () => {
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Protection",
          build: (ctx) =>
            new PolicyProtectionStep(theme, state, () => {
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Patterns",
          build: (ctx) =>
            new PolicyPatternsStep(theme, state, () => {
              if (state.patterns.length === 0) {
                ctx.markIncomplete();
                return;
              }
              ctx.markComplete();
              ctx.goNext();
            }),
        },
        {
          label: "Review",
          build: (ctx) => {
            ctx.markComplete();
            return new PolicyReviewStep(theme, state);
          },
        },
      ],
      onComplete: () => {
        if (!state.name.trim() || state.patterns.length === 0) return;
        const index = onCreate(state);
        if (index === null) return;
        this.activeEditor = openEditor(index, (value) => {
          this.activeEditor = null;
          onDone(value);
        });
      },
      onCancel: () => onDone(),
      hintSuffix: "complete steps · Ctrl+S create",
      minContentHeight: 12,
    });
  }

  invalidate(): void {
    this.activeEditor?.invalidate?.();
    this.wizard.invalidate?.();
  }

  render(width: number): string[] {
    if (this.activeEditor) {
      return this.activeEditor.render(width);
    }
    return this.wizard.render(width);
  }

  handleInput(data: string): void {
    if (this.activeEditor) {
      this.activeEditor.handleInput?.(data);
      return;
    }
    this.wizard.handleInput(data);
  }
}
