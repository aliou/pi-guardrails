import {
  type ConfigStore,
  getNestedValue,
  registerSettingsCommand,
  type Scope,
  SettingsDetailEditor,
  type SettingsDetailField,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
  Component,
  SettingItem,
  SettingsListTheme,
} from "@earendil-works/pi-tui";
import type {
  AllowedPath,
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
  PolicyRule,
  ResolvedConfig,
} from "../../../../src/shared/config";
import { configLoader } from "../../../../src/shared/config";
import type { GuardrailsFeatureId } from "../../../../src/shared/events";
import { PatternEditor } from "../../components/pattern-editor";
import { AddRuleSubmenu } from "./add-rule-wizard";
import { PathListEditor } from "./path-list-editor";
import {
  addPolicyRuleDraft,
  countItems,
  deletePolicyRule,
  getPolicyRules as getPolicyRulesFromConfig,
  type NewPolicyRuleDraft,
  setConfigValue,
  updatePolicyRule,
} from "./utils";

const FEATURE_UI: Record<
  GuardrailsFeatureId,
  { label: string; description: string }
> = {
  policies: {
    label: "Policies",
    description: "Block or limit file access using named policy rules",
  },
  permissionGate: {
    label: "Permission gate",
    description:
      "Prompt for confirmation on dangerous commands (rm -rf, sudo, etc.)",
  },
  pathAccess: {
    label: "Path access",
    description: "Restrict tool access to the current working directory",
  },
};

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

export interface RegisterGuardrailsSettingsOptions {
  getLoadedFeatures?: () => ReadonlySet<GuardrailsFeatureId>;
}

function createSettingsConfigStore(): ConfigStore<
  GuardrailsConfig,
  ResolvedConfig
> {
  return {
    save: (scope, config) => configLoader.save(scope, config),
    getConfig: () => configLoader.getConfig(),
    getRawConfig: (scope) => configLoader.getRawConfig(scope),
    hasScope: (scope) => configLoader.hasScope(scope),
    hasConfig: (scope) => configLoader.hasConfig(scope),
    getEnabledScopes: () => {
      const enabled = new Set(configLoader.getEnabledScopes());
      return (["memory", "local", "global"] as Scope[]).filter((scope) =>
        enabled.has(scope),
      );
    },
  };
}

export function registerGuardrailsSettings(
  pi: ExtensionAPI,
  options: RegisterGuardrailsSettingsOptions = {},
): void {
  registerSettingsCommand<GuardrailsConfig, ResolvedConfig>(pi, {
    commandName: "guardrails:settings",
    title: "Guardrails Settings",
    configStore: createSettingsConfigStore(),
    buildSections: (
      tabConfig: GuardrailsConfig | null,
      resolved: ResolvedConfig,
      { setDraft, theme, scope },
    ): SettingsSection[] => {
      const settingsTheme = theme;
      let scopedConfig = structuredClone(tabConfig ?? {}) as GuardrailsConfig;

      function commitDraft(next: GuardrailsConfig): void {
        scopedConfig = next;
        setDraft(structuredClone(next));
      }

      function count(id: string): string {
        return countItems(scopedConfig, id);
      }

      function applyDraft(id: string, value: unknown): void {
        commitDraft(setConfigValue(scopedConfig, id, value));
      }

      function getPolicyRules(): PolicyRule[] {
        return getPolicyRulesFromConfig(scopedConfig);
      }

      function updateRule(
        index: number,
        updater: (rule: PolicyRule) => PolicyRule,
      ): void {
        commitDraft(updatePolicyRule(scopedConfig, index, updater));
      }

      function deleteRule(index: number): void {
        commitDraft(deletePolicyRule(scopedConfig, index));
      }

      function addRule(draft: NewPolicyRuleDraft): number | null {
        const result = addPolicyRuleDraft(scopedConfig, draft);
        commitDraft(result.config);
        return result.index;
      }

      function patternSubmenu(
        id: string,
        label: string,
        context?: "file" | "command",
      ) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const items =
            (getNestedValue(scopedConfig, id) as
              | DangerousPattern[]
              | undefined) ?? [];
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

      function pathListSubmenu(id: string, label: string) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const value = getNestedValue(scopedConfig, id);
          const items = Array.isArray(value)
            ? value.filter(
                (entry): entry is AllowedPath =>
                  typeof entry === "object" &&
                  entry !== null &&
                  (entry.kind === "file" || entry.kind === "directory") &&
                  typeof entry.path === "string",
              )
            : [];
          let latestCount = items.length;
          return new PathListEditor({
            label,
            items,
            theme: settingsTheme,
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
            (getNestedValue(scopedConfig, id) as PatternConfig[] | undefined) ??
            [];
          const items = currentItems.map((p) => ({
            pattern: p.pattern,
            description: p.description?.trim() || p.pattern,
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
                  const description = p.description.trim();
                  if (description && description !== pattern) {
                    cfg.description = description;
                  }
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

      const loadedFeatures = options.getLoadedFeatures?.();
      const featureItems: SettingItem[] = (
        Object.keys(FEATURE_UI) as GuardrailsFeatureId[]
      )
        .filter((key) => key !== "policies")
        .map((key): SettingItem => {
          const scopedValue = scopedConfig.features?.[key];
          const effectiveValue = resolved.features[key];
          const loaded = loadedFeatures?.has(key) ?? true;
          return {
            id: `features.${key}`,
            label: FEATURE_UI[key].label,
            description: loaded
              ? FEATURE_UI[key].description
              : `${FEATURE_UI[key].description} (Not loaded by Pi)`,
            currentValue: loaded
              ? scopedValue === undefined
                ? `inherited: ${effectiveValue ? "enabled" : "disabled"}`
                : scopedValue
                  ? "enabled"
                  : "disabled"
              : "unavailable",
            values: loaded ? ["enabled", "disabled"] : [],
          };
        });

      if (scope === "global") {
        featureItems.push({
          id: "onboarding.completed",
          label: "Onboarding status",
          description:
            "Reset to pending to re-run onboarding (takes effect after reload)",
          currentValue:
            scopedConfig.onboarding?.completed === true
              ? "completed"
              : "pending",
          values: ["completed", "pending"],
        });
      }

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
            scopedConfig.features?.policies === undefined
              ? `inherited: ${resolved.features.policies ? "enabled" : "disabled"}`
              : scopedConfig.features.policies
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
        description: "Open wizard to create policy",
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
          label: "Path Access",
          items: [
            {
              id: "pathAccess.mode",
              label: "Mode",
              description:
                "allow: no restrictions, ask: prompt for outside paths, block: deny all outside paths",
              currentValue:
                scopedConfig.pathAccess?.mode ??
                `inherited: ${resolved.pathAccess.mode}`,
              values: ["allow", "ask", "block"],
            },
            {
              id: "pathAccess.allowedPaths",
              label: "Allowed paths",
              description:
                "Paths always allowed outside cwd. Each entry is { kind, path }: file matches exactly, directory matches the tree. Supports ~/",
              currentValue: count("pathAccess.allowedPaths"),
              submenu: pathListSubmenu(
                "pathAccess.allowedPaths",
                "Allowed Paths",
              ),
            },
          ],
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
                scopedConfig.permissionGate?.requireConfirmation === undefined
                  ? `inherited: ${resolved.permissionGate.requireConfirmation ? "on" : "off"}`
                  : scopedConfig.permissionGate.requireConfirmation
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
          ],
        },
      ];
    },

    onSettingChange: (id, newValue, config) => {
      const updated = structuredClone(config);

      if (id.startsWith("features.")) {
        const featureKey = id.slice("features.".length);
        updated.features = {
          ...updated.features,
          [featureKey]: newValue === "enabled",
        };
        return updated;
      }

      if (id === "permissionGate.requireConfirmation") {
        updated.permissionGate = {
          ...updated.permissionGate,
          requireConfirmation: newValue === "on",
        };
        return updated;
      }

      if (id === "onboarding.completed") {
        updated.onboarding = {
          ...updated.onboarding,
          completed: newValue === "completed",
          completedAt:
            newValue === "completed"
              ? (updated.onboarding?.completedAt ?? new Date().toISOString())
              : undefined,
          version:
            newValue === "completed" ? updated.onboarding?.version : undefined,
        };
        return updated;
      }

      // Fall through to default string storage for enums (pathAccess.mode, etc.)
      return null;
    },
  });
}
