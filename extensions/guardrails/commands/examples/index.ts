import { join } from "node:path";
import {
  getSettingsTheme,
  type Scope,
  type SettingsTheme,
  Wizard,
} from "@aliou/pi-utils-settings";
import {
  type ExtensionAPI,
  getAgentDir,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { Key, matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { GuardrailsConfig } from "../../../../src/shared/config";
import { configLoader } from "../../../../src/shared/config";
import {
  appendDangerousPattern,
  appendPolicyRule,
  COMMAND_EXAMPLES,
  POLICY_EXAMPLES,
} from "../settings/examples";

type ExampleScope = Extract<Scope, "local" | "global">;

type ExamplesState = {
  scope: ExampleScope | null;
  policyIndexes: Set<number>;
  commandIndexes: Set<number>;
};

type ExamplesResult =
  | { applied: false }
  | { applied: true; state: ExamplesState };

const EXAMPLES_CONTENT_HEIGHT = 19;
const PRESET_LIST_HEADER_LINES = 3;
const PRESET_DESCRIPTION_LINES = 4;
const PRESET_LIST_HEIGHT = Math.floor(
  (EXAMPLES_CONTENT_HEIGHT -
    PRESET_LIST_HEADER_LINES -
    PRESET_DESCRIPTION_LINES) /
    2,
);

function padStepLines(lines: string[]): string[] {
  while (lines.length < EXAMPLES_CONTENT_HEIGHT) lines.push("");
  return lines;
}

function wrapText(text: string, width: number, indent = "  "): string[] {
  const max = Math.max(20, width - indent.length);
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > max && current) {
      lines.push(`${indent}${current}`);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(`${indent}${current}`);
  return lines;
}

function scopeLabel(scope: ExampleScope): string {
  if (scope === "local") return "Project";
  return "System";
}

function scopePath(scope: ExampleScope): string {
  if (scope === "local") return ".pi/extensions/guardrails.json";
  return join(getAgentDir(), "extensions", "guardrails.json");
}

class ExamplesWelcomeStep implements Component {
  private selectedIndex = 0;

  constructor(
    private readonly theme: SettingsTheme,
    private readonly state: ExamplesState,
    private readonly scopes: ExampleScope[],
    private readonly onSelect: () => void,
  ) {
    const currentIndex = state.scope ? scopes.indexOf(state.scope) : -1;
    this.selectedIndex = Math.max(0, currentIndex);
  }

  invalidate() {}

  render(width: number): string[] {
    const lines = [
      ...wrapText(
        "Example presets help you quickly add common guardrails. File policy presets add named rules for protected files, such as dotenv files, SSH keys, database files, and certificates.",
        width,
      ),
      "",
      ...wrapText(
        "Dangerous command presets add command patterns that require confirmation, such as terraform destroy or npm publish.",
        width,
      ),
      "",
      ...wrapText(
        "This command adds selected presets to one config scope. It does not replace existing config.",
        width,
      ),
      "",
      this.theme.label("  Save examples to", true),
    ];

    for (let index = 0; index < this.scopes.length; index++) {
      const scope = this.scopes[index];
      if (!scope) continue;
      const selected = index === this.selectedIndex;
      const prefix = selected ? this.theme.cursor : "  ";
      lines.push(
        `${prefix}${this.theme.value(scopeLabel(scope), selected)} ${this.theme.hint(`(${scopePath(scope)})`)}`,
      );
    }

    return padStepLines(lines);
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex =
        (this.selectedIndex - 1 + this.scopes.length) % this.scopes.length;
    } else if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = (this.selectedIndex + 1) % this.scopes.length;
    } else if (matchesKey(data, Key.enter)) {
      this.state.scope = this.scopes[this.selectedIndex] ?? null;
      this.onSelect();
      return;
    }
    this.state.scope = this.scopes[this.selectedIndex] ?? null;
  }
}

type PresetListItem = { checked: boolean; label: string; description: string };

function renderPresetList(options: {
  title: string;
  items: PresetListItem[];
  selectedIndex: number;
  scrollOffset: number;
  theme: SettingsTheme;
  width: number;
}): string[] {
  const { title, items, selectedIndex, scrollOffset, theme, width } = options;
  const end = Math.min(items.length, scrollOffset + PRESET_LIST_HEIGHT);
  const selectedItem = items[selectedIndex];
  const lines = [
    theme.label(`  ${title}`, true),
    theme.hint(
      `  ${items.filter((item) => item.checked).length} selected · Showing ${scrollOffset + 1}-${end} of ${items.length}`,
    ),
    "",
  ];

  for (let index = scrollOffset; index < end; index++) {
    const item = items[index];
    if (!item) continue;
    const selected = index === selectedIndex;
    const prefix = selected ? theme.cursor : "  ";
    const mark = item.checked ? "[x]" : "[ ]";
    const labelWidth = Math.max(1, width - 6 - item.label.length);
    lines.push(
      `${prefix}${mark} ${theme.value(item.label, selected)}`,
      theme.hint(`      ${truncateToWidth(item.description, labelWidth)}`),
    );
  }

  while (lines.length < EXAMPLES_CONTENT_HEIGHT - PRESET_DESCRIPTION_LINES) {
    lines.push("");
  }

  const descriptionLines = selectedItem
    ? wrapText(selectedItem.description, width, "  ").slice(0, 2)
    : [];
  while (descriptionLines.length < PRESET_DESCRIPTION_LINES - 2) {
    descriptionLines.push("  ");
  }

  lines.push(
    "",
    theme.label("  Description", true),
    ...descriptionLines.map((line) => theme.hint(line)),
  );
  return padStepLines(lines);
}

class PolicyPresetsStep implements Component {
  private selectedIndex = 0;
  private scrollOffset = 0;

  constructor(
    private readonly theme: SettingsTheme,
    private readonly state: ExamplesState,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    return this.renderMultiSelect(
      "File policy presets",
      POLICY_EXAMPLES.map((example, index) => ({
        checked: this.state.policyIndexes.has(index),
        label: example.label,
        description: example.description,
      })),
      width,
    );
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex =
        (this.selectedIndex - 1 + POLICY_EXAMPLES.length) %
        POLICY_EXAMPLES.length;
      this.ensureVisible(POLICY_EXAMPLES.length);
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = (this.selectedIndex + 1) % POLICY_EXAMPLES.length;
      this.ensureVisible(POLICY_EXAMPLES.length);
      return;
    }
    if (data === " " || matchesKey(data, Key.enter)) {
      if (this.state.policyIndexes.has(this.selectedIndex)) {
        this.state.policyIndexes.delete(this.selectedIndex);
      } else {
        this.state.policyIndexes.add(this.selectedIndex);
      }
    }
  }

  private renderMultiSelect(
    title: string,
    items: PresetListItem[],
    width: number,
  ): string[] {
    return renderPresetList({
      title,
      items,
      selectedIndex: this.selectedIndex,
      scrollOffset: this.scrollOffset,
      theme: this.theme,
      width,
    });
  }

  private ensureVisible(count: number): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    if (this.selectedIndex >= this.scrollOffset + PRESET_LIST_HEIGHT) {
      this.scrollOffset = this.selectedIndex - PRESET_LIST_HEIGHT + 1;
    }
    this.scrollOffset = Math.max(
      0,
      Math.min(this.scrollOffset, Math.max(0, count - PRESET_LIST_HEIGHT)),
    );
  }
}

class CommandPresetsStep implements Component {
  private selectedIndex = 0;
  private scrollOffset = 0;

  constructor(
    private readonly theme: SettingsTheme,
    private readonly state: ExamplesState,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    const items = COMMAND_EXAMPLES.map((example, index) => ({
      checked: this.state.commandIndexes.has(index),
      label: example.label,
      description: example.description,
    }));
    return renderPresetList({
      title: "Dangerous command presets",
      items,
      selectedIndex: this.selectedIndex,
      scrollOffset: this.scrollOffset,
      theme: this.theme,
      width,
    });
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || data === "k") {
      this.selectedIndex =
        (this.selectedIndex - 1 + COMMAND_EXAMPLES.length) %
        COMMAND_EXAMPLES.length;
      this.ensureVisible(COMMAND_EXAMPLES.length);
      return;
    }
    if (matchesKey(data, Key.down) || data === "j") {
      this.selectedIndex = (this.selectedIndex + 1) % COMMAND_EXAMPLES.length;
      this.ensureVisible(COMMAND_EXAMPLES.length);
      return;
    }
    if (data === " " || matchesKey(data, Key.enter)) {
      if (this.state.commandIndexes.has(this.selectedIndex)) {
        this.state.commandIndexes.delete(this.selectedIndex);
      } else {
        this.state.commandIndexes.add(this.selectedIndex);
      }
    }
  }

  private ensureVisible(count: number): void {
    if (this.selectedIndex < this.scrollOffset) {
      this.scrollOffset = this.selectedIndex;
    }
    if (this.selectedIndex >= this.scrollOffset + PRESET_LIST_HEIGHT) {
      this.scrollOffset = this.selectedIndex - PRESET_LIST_HEIGHT + 1;
    }
    this.scrollOffset = Math.max(
      0,
      Math.min(this.scrollOffset, Math.max(0, count - PRESET_LIST_HEIGHT)),
    );
  }
}

class ExamplesReviewStep implements Component {
  constructor(
    private readonly theme: SettingsTheme,
    private readonly state: ExamplesState,
  ) {}

  invalidate() {}

  render(width: number): string[] {
    const selectedPolicies = [...this.state.policyIndexes]
      .sort((a, b) => a - b)
      .map((index) => POLICY_EXAMPLES[index])
      .filter((item): item is (typeof POLICY_EXAMPLES)[number] =>
        Boolean(item),
      );
    const selectedCommands = [...this.state.commandIndexes]
      .sort((a, b) => a - b)
      .map((index) => COMMAND_EXAMPLES[index])
      .filter((item): item is (typeof COMMAND_EXAMPLES)[number] =>
        Boolean(item),
      );

    const lines = [
      "  Review selected presets.",
      "",
      this.theme.hint(
        `  Scope: ${this.state.scope ? `${scopeLabel(this.state.scope)} (${scopePath(this.state.scope)})` : "not selected"}`,
      ),
      this.theme.hint(`  File policies: ${selectedPolicies.length}`),
      ...selectedPolicies.flatMap((example) =>
        wrapText(
          `- ${example.label}: ${example.rule.protection}`,
          width,
          "    ",
        ),
      ),
      this.theme.hint(`  Dangerous commands: ${selectedCommands.length}`),
      ...selectedCommands.flatMap((example) =>
        wrapText(
          `- ${example.label}: ${example.pattern.pattern}`,
          width,
          "    ",
        ),
      ),
    ];

    if (
      !this.state.scope ||
      selectedPolicies.length + selectedCommands.length === 0
    ) {
      lines.push(
        "",
        this.theme.hint(
          "  Select a scope and at least one preset before submitting.",
        ),
      );
    }

    return padStepLines(lines);
  }

  handleInput(): void {}
}

function createExamplesWizard(
  theme: Theme,
  scopes: ExampleScope[],
  done: (result: ExamplesResult) => void,
): Component {
  const settingsTheme = getSettingsTheme(theme);
  const state: ExamplesState = {
    scope: scopes[0] ?? null,
    policyIndexes: new Set(),
    commandIndexes: new Set(),
  };

  const apply = () => {
    if (!state.scope) {
      done({ applied: false });
      return;
    }
    if (state.policyIndexes.size + state.commandIndexes.size === 0) {
      done({ applied: false });
      return;
    }
    done({ applied: true, state });
  };

  return new Wizard({
    title: "Guardrails examples",
    theme,
    steps: [
      {
        label: "Welcome",
        build: (ctx) => {
          ctx.markComplete();
          return new ExamplesWelcomeStep(settingsTheme, state, scopes, () => {
            ctx.markComplete();
            ctx.goNext();
          });
        },
      },
      {
        label: "Files",
        build: (ctx) => {
          ctx.markComplete();
          return new PolicyPresetsStep(settingsTheme, state);
        },
      },
      {
        label: "Commands",
        build: (ctx) => {
          ctx.markComplete();
          return new CommandPresetsStep(settingsTheme, state);
        },
      },
      {
        label: "Review",
        build: (ctx) => {
          ctx.markComplete();
          return new ExamplesReviewStep(settingsTheme, state);
        },
      },
    ],
    onComplete: apply,
    onCancel: () => done({ applied: false }),
    minContentHeight: EXAMPLES_CONTENT_HEIGHT,
  });
}

function getExampleScopes(): ExampleScope[] {
  const enabled = new Set(configLoader.getEnabledScopes());
  return (["local", "global"] as ExampleScope[]).filter((scope) =>
    enabled.has(scope),
  );
}

async function applyExample(
  result: Extract<ExamplesResult, { applied: true }>,
) {
  if (!result.state.scope) return;
  const scope = result.state.scope;
  const baseConfig = configLoader.getRawConfig(scope) ?? null;
  let updated: GuardrailsConfig = structuredClone(baseConfig ?? {});

  for (const index of [...result.state.policyIndexes].sort((a, b) => a - b)) {
    const example = POLICY_EXAMPLES[index];
    if (example) updated = appendPolicyRule(updated, example.rule);
  }
  for (const index of [...result.state.commandIndexes].sort((a, b) => a - b)) {
    const example = COMMAND_EXAMPLES[index];
    if (example) updated = appendDangerousPattern(updated, example.pattern);
  }

  await configLoader.save(scope, updated);
  await configLoader.load();
}

export function registerGuardrailsExamplesCommand(pi: ExtensionAPI): void {
  pi.registerCommand("guardrails:examples", {
    description: "Apply guardrails example presets",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) return;

      const scopes = getExampleScopes();
      if (scopes.length === 0) {
        ctx.ui.notify("[Guardrails] no config scopes available.", "error");
        return;
      }

      const result = await ctx.ui.custom<ExamplesResult>(
        (_tui, theme: Theme, _keybindings, done) =>
          createExamplesWizard(theme, scopes, done),
        { overlay: true },
      );

      if (!result.applied) {
        ctx.ui.notify("[Guardrails] no examples applied.", "warning");
        return;
      }

      await applyExample(result);
      ctx.ui.notify(
        `[Guardrails] examples applied to ${result.state.scope}.`,
        "info",
      );
    },
  });
}
