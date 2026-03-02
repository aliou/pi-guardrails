import {
  getNestedValue,
  registerSettingsCommand,
  SettingsDetailEditor,
  type SettingsDetailField,
  type SettingsSection,
  setNestedValue,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import {
  type Component,
  Input,
  type SettingItem,
  type SettingsListTheme,
} from "@mariozechner/pi-tui";
import { PatternEditor } from "../components/pattern-editor";
import type {
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
  PolicyRule,
  ResolvedConfig,
} from "../config";
import { configLoader } from "../config";

type FeatureKey = keyof ResolvedConfig["features"];

const FEATURE_UI: Record<FeatureKey, { label: string; description: string }> = {
  policies: {
    label: "Policies",
    description: "Block or limit file access using named policy rules",
  },
  permissionGate: {
    label: "Permission gate",
    description:
      "Prompt for confirmation on dangerous commands (rm -rf, sudo, etc.)",
  },
};

function toKebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

class AddRuleSubmenu implements Component {
  private readonly onCreate: (name: string) => number | null;
  private readonly openEditor: (
    index: number,
    done: (value?: string) => void,
  ) => Component;
  private readonly onDone: (value?: string) => void;
  private readonly theme: SettingsListTheme;
  private readonly nameInput = new Input();
  private activeEditor: Component | null = null;

  constructor(
    theme: SettingsListTheme,
    onCreate: (name: string) => number | null,
    openEditor: (index: number, done: (value?: string) => void) => Component,
    onDone: (value?: string) => void,
  ) {
    this.theme = theme;
    this.onCreate = onCreate;
    this.openEditor = openEditor;
    this.onDone = onDone;

    this.nameInput.onSubmit = () => {
      const name = this.nameInput.getValue().trim();
      if (!name) return;
      const index = this.onCreate(name);
      if (index === null) return;
      this.activeEditor = this.openEditor(index, (value) => {
        this.activeEditor = null;
        this.onDone(value);
      });
    };
    this.nameInput.onEscape = () => this.onDone();
  }

  invalidate() {
    this.activeEditor?.invalidate?.();
  }

  render(width: number): string[] {
    if (this.activeEditor) {
      return this.activeEditor.render(width);
    }

    return [
      this.theme.label(" + Add policy", true),
      "",
      this.theme.hint("  Enter policy name:"),
      ...this.nameInput.render(width - 2).map((line) => ` ${line}`),
      "",
      this.theme.hint("  Enter: create + edit · Esc: back"),
    ];
  }

  handleInput(data: string): void {
    if (this.activeEditor) {
      this.activeEditor.handleInput?.(data);
      return;
    }

    this.nameInput.handleInput(data);
  }
}

function createPolicyRuleEditor(options: {
  index: number;
  theme: SettingsListTheme;
  getRule: () => PolicyRule | undefined;
  updateRule: (updater: (rule: PolicyRule) => PolicyRule) => void;
  deleteRule: () => void;
  onDone: (value?: string) => void;
}): SettingsDetailEditor {
  const { index, theme, getRule, updateRule, deleteRule, onDone } = options;

  const fields: SettingsDetailField[] = [
    {
      id: "name",
      type: "text",
      label: "Name",
      description: "Display name shown in settings",
      getValue: () => getRule()?.name?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, name: next || undefined }));
      },
      emptyValueText: "(uses id)",
    },
    {
      id: "id",
      type: "text",
      label: "ID",
      description: "Stable identifier used for overrides across scopes",
      getValue: () => getRule()?.id ?? "",
      setValue: (value) => {
        const next = value.trim();
        if (!next) return;
        updateRule((rule) => ({ ...rule, id: next }));
      },
    },
    {
      id: "description",
      type: "text",
      label: "Description",
      description: "Human-readable explanation",
      getValue: () => getRule()?.description?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, description: next || undefined }));
      },
      emptyValueText: "(empty)",
    },
    {
      id: "protection",
      type: "enum",
      label: "Protection",
      description: "noAccess | readOnly | none",
      getValue: () => getRule()?.protection ?? "readOnly",
      setValue: (value) => {
        if (value !== "noAccess" && value !== "readOnly" && value !== "none") {
          return;
        }
        updateRule((rule) => ({ ...rule, protection: value }));
      },
      options: ["noAccess", "readOnly", "none"],
    },
    {
      id: "enabled",
      type: "boolean",
      label: "Enabled",
      description: "Turn this policy on/off",
      getValue: () => getRule()?.enabled !== false,
      setValue: (value) => {
        updateRule((rule) => ({ ...rule, enabled: value }));
      },
      trueLabel: "on",
      falseLabel: "off",
    },
    {
      id: "onlyIfExists",
      type: "boolean",
      label: "Only if exists",
      description: "Only block when file exists on disk",
      getValue: () => getRule()?.onlyIfExists !== false,
      setValue: (value) => {
        updateRule((rule) => ({ ...rule, onlyIfExists: value }));
      },
      trueLabel: "on",
      falseLabel: "off",
    },
    {
      id: "patterns",
      type: "submenu",
      label: "Patterns",
      description: "Files protected by this policy",
      getValue: () => `${getRule()?.patterns?.length ?? 0} items`,
      submenu: (done) => {
        const rule = getRule();
        const items = (rule?.patterns ?? []).map((p) => ({
          pattern: p.pattern,
          description: p.pattern,
          regex: p.regex,
        }));

        return new PatternEditor({
          label: "Policy patterns",
          items,
          theme,
          context: "file",
          onSave: (newItems) => {
            const patterns: PatternConfig[] = newItems
              .map((p) => {
                const pattern = p.pattern.trim();
                if (!pattern) return null;
                return { pattern, ...(p.regex ? { regex: true } : {}) };
              })
              .filter((item): item is PatternConfig => item !== null);

            updateRule((current) => ({ ...current, patterns }));
          },
          onDone: () => done(`${getRule()?.patterns?.length ?? 0} items`),
        });
      },
    },
    {
      id: "allowedPatterns",
      type: "submenu",
      label: "Allowed patterns",
      description: "Exceptions",
      getValue: () => `${getRule()?.allowedPatterns?.length ?? 0} items`,
      submenu: (done) => {
        const rule = getRule();
        const items = (rule?.allowedPatterns ?? []).map((p) => ({
          pattern: p.pattern,
          description: p.pattern,
          regex: p.regex,
        }));

        return new PatternEditor({
          label: "Policy allowed patterns",
          items,
          theme,
          context: "file",
          onSave: (newItems) => {
            const patterns: PatternConfig[] = newItems
              .map((p) => {
                const pattern = p.pattern.trim();
                if (!pattern) return null;
                return { pattern, ...(p.regex ? { regex: true } : {}) };
              })
              .filter((item): item is PatternConfig => item !== null);

            updateRule((current) => ({
              ...current,
              allowedPatterns: patterns.length > 0 ? patterns : undefined,
            }));
          },
          onDone: () =>
            done(`${getRule()?.allowedPatterns?.length ?? 0} items`),
        });
      },
    },
    {
      id: "blockMessage",
      type: "text",
      label: "Block message",
      description: "Custom block message ({file} supported)",
      getValue: () => getRule()?.blockMessage?.trim() || "",
      setValue: (value) => {
        const next = value.trim();
        updateRule((rule) => ({ ...rule, blockMessage: next || undefined }));
      },
      emptyValueText: "(default)",
    },
    {
      id: "delete",
      type: "action",
      label: "Delete rule",
      description: "Remove this rule",
      getValue: () => "danger",
      onConfirm: () => {
        deleteRule();
      },
      confirmMessage: "Delete this rule? This cannot be undone.",
    },
  ];

  return new SettingsDetailEditor({
    title: () => {
      const rule = getRule();
      const title = rule?.name?.trim() || rule?.id || `Policy ${index + 1}`;
      return `Policy: ${title}`;
    },
    fields,
    theme,
    onDone,
    getDoneSummary: () => {
      const rule = getRule();
      if (!rule) return "deleted";
      return `${rule.protection}, ${rule.enabled === false ? "disabled" : "enabled"}`;
    },
  });
}

export function registerGuardrailsSettings(pi: ExtensionAPI): void {
  registerSettingsCommand<GuardrailsConfig, ResolvedConfig>(pi, {
    commandName: "guardrails:settings",
    title: "Guardrails Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: GuardrailsConfig | null,
      resolved: ResolvedConfig,
      { setDraft },
    ): SettingsSection[] => {
      const settingsTheme = getSettingsListTheme();

      function count(id: string): string {
        const val =
          (getNestedValue(tabConfig ?? {}, id) as unknown[] | undefined) ??
          (getNestedValue(resolved, id) as unknown[]) ??
          [];
        return `${val.length} items`;
      }

      function applyDraft(id: string, value: unknown): void {
        const updated = structuredClone(tabConfig ?? {}) as GuardrailsConfig;
        setNestedValue(updated, id, value);
        setDraft(updated);
      }

      function getPolicyRules(): PolicyRule[] {
        return (
          tabConfig?.policies?.rules?.map((r) => ({ ...r })) ??
          resolved.policies.rules.map((r) => ({ ...r }))
        );
      }

      function setPolicyRules(rules: PolicyRule[]): void {
        const updated = structuredClone(tabConfig ?? {}) as GuardrailsConfig;
        updated.policies = {
          ...(updated.policies ?? {}),
          rules,
        };
        setDraft(updated);
      }

      function updateRule(
        index: number,
        updater: (rule: PolicyRule) => PolicyRule,
      ): void {
        const rules = getPolicyRules();
        const existing = rules[index];
        if (!existing) return;
        rules[index] = updater(existing);
        setPolicyRules(rules);
      }

      function deleteRule(index: number): void {
        const rules = getPolicyRules();
        if (!rules[index]) return;
        rules.splice(index, 1);
        setPolicyRules(rules);
      }

      function addRule(name: string): number | null {
        const normalizedName = name.trim();
        if (!normalizedName) return null;

        const rules = getPolicyRules();
        const baseId = toKebabCase(normalizedName) || "policy";
        const existingIds = new Set(rules.map((rule) => rule.id));

        let id = baseId;
        let i = 2;
        while (existingIds.has(id)) {
          id = `${baseId}-${i}`;
          i++;
        }

        rules.push({
          id,
          name: normalizedName,
          description: "",
          patterns: [{ pattern: "" }],
          protection: "readOnly",
          onlyIfExists: true,
          enabled: true,
        });
        setPolicyRules(rules);
        return rules.length - 1;
      }

      function patternSubmenu(
        id: string,
        label: string,
        context?: "file" | "command",
      ) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const items =
            (getNestedValue(tabConfig ?? {}, id) as
              | DangerousPattern[]
              | undefined) ??
            (getNestedValue(resolved, id) as DangerousPattern[]) ??
            [];
          let latestCount = items.length;
          return new PatternEditor({
            label,
            items: [...items],
            theme: settingsTheme,
            context,
            onSave: (newItems) => {
              latestCount = newItems.length;
              applyDraft(id, newItems);
            },
            onDone: () => submenuDone(`${latestCount} items`),
          });
        };
      }

      function patternConfigSubmenu(
        id: string,
        label: string,
        context?: "file" | "command",
      ) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const currentItems =
            (getNestedValue(tabConfig ?? {}, id) as
              | PatternConfig[]
              | undefined) ??
            (getNestedValue(resolved, id) as PatternConfig[]) ??
            [];
          const items = currentItems.map((p) => ({
            pattern: p.pattern,
            description: p.pattern,
            regex: p.regex,
          }));
          let latestCount = items.length;
          return new PatternEditor({
            label,
            items,
            theme: settingsTheme,
            context,
            onSave: (newItems) => {
              latestCount = newItems.length;
              const configs: PatternConfig[] = newItems
                .map((p) => {
                  const pattern = p.pattern.trim();
                  if (!pattern) return null;
                  const cfg: PatternConfig = { pattern };
                  if (p.regex) cfg.regex = true;
                  return cfg;
                })
                .filter((item): item is PatternConfig => item !== null);
              applyDraft(id, configs);
            },
            onDone: () => submenuDone(`${latestCount} items`),
          });
        };
      }

      function getExplainModel(): string {
        const model = tabConfig?.permissionGate?.explainModel;
        if (model !== undefined) return model;
        return resolved.permissionGate.explainModel ?? "";
      }

      function getExplainTimeout(): number {
        return (
          tabConfig?.permissionGate?.explainTimeout ??
          resolved.permissionGate.explainTimeout
        );
      }

      const featureItems = (Object.keys(FEATURE_UI) as FeatureKey[])
        .filter((key) => key !== "policies")
        .map((key) => ({
          id: `features.${key}`,
          label: FEATURE_UI[key].label,
          description: FEATURE_UI[key].description,
          currentValue:
            (tabConfig?.features?.[key] ?? resolved.features[key])
              ? "enabled"
              : "disabled",
          values: ["enabled", "disabled"],
        }));

      const policyRules = getPolicyRules();

      const openPolicyEditor = (
        index: number,
        submenuDone: (v?: string) => void,
      ): Component =>
        createPolicyRuleEditor({
          index,
          theme: settingsTheme,
          getRule: () => getPolicyRules()[index],
          updateRule: (updater) => updateRule(index, updater),
          deleteRule: () => deleteRule(index),
          onDone: submenuDone,
        });

      const policyItems: SettingItem[] = [
        {
          id: "features.policies",
          label: "  Enabled",
          description: FEATURE_UI.policies.description,
          currentValue:
            (tabConfig?.features?.policies ?? resolved.features.policies)
              ? "enabled"
              : "disabled",
          values: ["enabled", "disabled"],
        },
        ...policyRules.map((rule, index) => {
          const label = rule.name?.trim() || rule.id || `Policy ${index + 1}`;
          return {
            id: `policies.rules.${index}`,
            label: `  ${label}`,
            description: rule.description?.trim() || "No description",
            currentValue: `${rule.protection}, ${rule.enabled === false ? "disabled" : "enabled"}`,
            submenu: (_val: string, submenuDone: (v?: string) => void) =>
              openPolicyEditor(index, submenuDone),
          };
        }),
      ];

      policyItems.push({
        id: "policies.addRule",
        label: "  + Add policy",
        description: "Create policy, then open editor",
        currentValue: "",
        submenu: (_val: string, submenuDone: (v?: string) => void) =>
          new AddRuleSubmenu(
            settingsTheme,
            addRule,
            (index, done) => openPolicyEditor(index, done),
            submenuDone,
          ),
      });

      return [
        { label: "Features", items: featureItems },
        {
          label: `Policies (${policyRules.length})`,
          items: policyItems,
        },
        {
          label: "Permission Gate",
          items: [
            {
              id: "permissionGate.requireConfirmation",
              label: "Require confirmation",
              description:
                "Show confirmation dialog for dangerous commands (if off, just warns)",
              currentValue:
                (tabConfig?.permissionGate?.requireConfirmation ??
                resolved.permissionGate.requireConfirmation)
                  ? "on"
                  : "off",
              values: ["on", "off"],
            },
            {
              id: "permissionGate.patterns",
              label: "Dangerous patterns",
              description: "Command patterns that trigger the permission gate",
              currentValue: count("permissionGate.patterns"),
              submenu: patternSubmenu(
                "permissionGate.patterns",
                "Dangerous Patterns",
                "command",
              ),
            },
            {
              id: "permissionGate.allowedPatterns",
              label: "Allowed commands",
              description: "Patterns that bypass the permission gate entirely",
              currentValue: count("permissionGate.allowedPatterns"),
              submenu: patternConfigSubmenu(
                "permissionGate.allowedPatterns",
                "Allowed Commands",
                "command",
              ),
            },
            {
              id: "permissionGate.autoDenyPatterns",
              label: "Auto-deny patterns",
              description:
                "Patterns that block commands immediately without dialog",
              currentValue: count("permissionGate.autoDenyPatterns"),
              submenu: patternConfigSubmenu(
                "permissionGate.autoDenyPatterns",
                "Auto-Deny Patterns",
                "command",
              ),
            },
            {
              id: "permissionGate.explainCommands",
              label: "Explain commands",
              description:
                "Call an LLM to explain dangerous commands in the confirmation dialog",
              currentValue:
                (tabConfig?.permissionGate?.explainCommands ??
                resolved.permissionGate.explainCommands)
                  ? "on"
                  : "off",
              values: ["on", "off"],
            },
            {
              id: "permissionGate.explainModel",
              label: "Explain model",
              description: "Model spec in provider/model-id format",
              currentValue: getExplainModel() || "(not set)",
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new SettingsDetailEditor({
                  title: "Explain Commands: Model",
                  theme: settingsTheme,
                  onDone: submenuDone,
                  getDoneSummary: () => getExplainModel() || "(not set)",
                  fields: [
                    {
                      id: "permissionGate.explainModel",
                      type: "text",
                      label: "Model",
                      description: "Format: provider/model-id",
                      getValue: getExplainModel,
                      setValue: (value) => {
                        const model = value.trim();
                        applyDraft(
                          "permissionGate.explainModel",
                          model || undefined,
                        );
                      },
                      emptyValueText: "(not set)",
                    },
                  ],
                }),
            },
            {
              id: "permissionGate.explainTimeout",
              label: "Explain timeout",
              description: "Timeout for LLM explanation in milliseconds",
              currentValue: `${getExplainTimeout()}ms`,
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new SettingsDetailEditor({
                  title: "Explain Commands: Timeout",
                  theme: settingsTheme,
                  onDone: submenuDone,
                  getDoneSummary: () => `${getExplainTimeout()}ms`,
                  fields: [
                    {
                      id: "permissionGate.explainTimeout",
                      type: "text",
                      label: "Timeout (ms)",
                      description: "Abort explanation call after this many ms",
                      getValue: () => String(getExplainTimeout()),
                      setValue: (value) => {
                        const parsed = Number.parseInt(value.trim(), 10);
                        if (Number.isNaN(parsed) || parsed < 1) return;
                        applyDraft("permissionGate.explainTimeout", parsed);
                      },
                    },
                  ],
                }),
            },
          ],
        },
      ];
    },
  });
}
