import {
  ArrayEditor,
  getNestedValue,
  registerSettingsCommand,
  type SettingsSection,
  setNestedValue,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { configLoader } from "./config";
import type {
  DangerousPattern,
  GuardrailsConfig,
  PatternConfig,
  ResolvedConfig,
} from "./config-schema";
import { PatternEditor } from "./pattern-editor";

type FeatureKey = keyof ResolvedConfig["features"];

const FEATURE_UI: Record<FeatureKey, { label: string; description: string }> = {
  protectEnvFiles: {
    label: "Protect .env files",
    description: "Block access to .env files containing secrets",
  },
  permissionGate: {
    label: "Permission gate",
    description:
      "Prompt for confirmation on dangerous commands (rm -rf, sudo, etc.)",
  },
};

export function registerGuardrailsSettings(pi: ExtensionAPI): void {
  const settingsTheme = getSettingsListTheme();

  registerSettingsCommand<GuardrailsConfig, ResolvedConfig>(pi, {
    commandName: "guardrails:settings",
    title: "Guardrails Settings",
    configStore: configLoader,
    buildSections: (
      tabConfig: GuardrailsConfig | null,
      resolved: ResolvedConfig,
      { setDraft },
    ): SettingsSection[] => {
      // --- Helpers ---

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

      // --- Submenu factories ---

      function stringArraySubmenu(id: string, label: string) {
        return (_val: string, submenuDone: (v?: string) => void) => {
          const items =
            (getNestedValue(tabConfig ?? {}, id) as string[] | undefined) ??
            (getNestedValue(resolved, id) as string[]) ??
            [];
          let latest = [...items];
          return new ArrayEditor({
            label,
            items: [...items],
            theme: settingsTheme,
            onSave: (newItems) => {
              latest = newItems;
              applyDraft(id, newItems);
            },
            onDone: () => submenuDone(`${latest.length} items`),
          });
        };
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
              const configs: PatternConfig[] = newItems.map((p) => {
                const cfg: PatternConfig = { pattern: p.pattern };
                if (p.regex) cfg.regex = true;
                return cfg;
              });
              applyDraft(id, configs);
            },
            onDone: () => submenuDone(`${latestCount} items`),
          });
        };
      }

      // --- Sections ---

      const featureItems = (Object.keys(FEATURE_UI) as FeatureKey[]).map(
        (key) => ({
          id: `features.${key}`,
          label: FEATURE_UI[key].label,
          description: FEATURE_UI[key].description,
          currentValue:
            (tabConfig?.features?.[key] ?? resolved.features[key])
              ? "enabled"
              : "disabled",
          values: ["enabled", "disabled"],
        }),
      );

      return [
        { label: "Features", items: featureItems },
        {
          label: "Env Files",
          items: [
            {
              id: "envFiles.onlyBlockIfExists",
              label: "Only block existing files",
              description:
                "Only block .env file access if the file exists on disk",
              currentValue:
                (tabConfig?.envFiles?.onlyBlockIfExists ??
                resolved.envFiles.onlyBlockIfExists)
                  ? "on"
                  : "off",
              values: ["on", "off"],
            },
            {
              id: "envFiles.protectedPatterns",
              label: "Protected patterns",
              description: "Patterns for files to protect (e.g. .env.local)",
              currentValue: count("envFiles.protectedPatterns"),
              submenu: patternConfigSubmenu(
                "envFiles.protectedPatterns",
                "Protected Patterns",
                "file",
              ),
            },
            {
              id: "envFiles.allowedPatterns",
              label: "Allowed patterns",
              description: "Patterns for exceptions (e.g. .env.example)",
              currentValue: count("envFiles.allowedPatterns"),
              submenu: patternConfigSubmenu(
                "envFiles.allowedPatterns",
                "Allowed Patterns",
                "file",
              ),
            },
            {
              id: "envFiles.protectedDirectories",
              label: "Protected directories",
              description: "Patterns for directories to protect",
              currentValue: count("envFiles.protectedDirectories"),
              submenu: patternConfigSubmenu(
                "envFiles.protectedDirectories",
                "Protected Directories",
                "file",
              ),
            },
            {
              id: "envFiles.protectedTools",
              label: "Protected tools",
              description:
                "Tools to intercept (read, write, edit, bash, grep, find, ls)",
              currentValue: count("envFiles.protectedTools"),
              submenu: stringArraySubmenu(
                "envFiles.protectedTools",
                "Protected Tools",
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
          ],
        },
      ];
    },
  });
}
