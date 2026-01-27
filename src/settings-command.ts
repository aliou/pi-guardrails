import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getSettingsListTheme } from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { ArrayEditor } from "./array-editor";
import { configLoader } from "./config";
import type { GuardrailsConfig } from "./config-schema";
import { PatternEditor } from "./pattern-editor";
import { SectionedSettings, type SettingsSection } from "./sectioned-settings";

type Tab = "local" | "global";

export function registerSettingsCommand(pi: ExtensionAPI): void {
  pi.registerCommand("guardrails:settings", {
    description: "Configure guardrails (local/global)",
    handler: async (_args, ctx) => {
      let activeTab: Tab = configLoader.hasProjectConfig() ? "local" : "global";

      await ctx.ui.custom((tui, theme, _kb, done) => {
        let settings: SectionedSettings | null = null;
        const settingsTheme = getSettingsListTheme();

        // --- Helpers ---

        function getTabConfig(): GuardrailsConfig {
          return activeTab === "local"
            ? configLoader.getProjectConfig()
            : configLoader.getGlobalConfig();
        }

        async function saveTabConfig(
          tab: Tab,
          config: GuardrailsConfig,
        ): Promise<boolean> {
          try {
            if (tab === "local") {
              await configLoader.saveProject(config);
            } else {
              await configLoader.saveGlobal(config);
            }
            ctx.ui.notify(`guardrails: saved to ${tab} config`, "info");
            return true;
          } catch (error) {
            ctx.ui.notify(`guardrails: failed to save: ${error}`, "error");
            return false;
          }
        }

        function setNestedValue(
          config: GuardrailsConfig,
          id: string,
          value: unknown,
        ): void {
          const parts = id.split(".");
          // biome-ignore lint/suspicious/noExplicitAny: dynamic config path traversal
          let target: any = config;
          for (let i = 0; i < parts.length - 1; i++) {
            const key = parts[i] as string;
            if (!target[key]) target[key] = {};
            target = target[key];
          }
          target[parts[parts.length - 1] as string] = value;
        }

        function getNestedValue(config: GuardrailsConfig, id: string): unknown {
          const parts = id.split(".");
          // biome-ignore lint/suspicious/noExplicitAny: dynamic config path traversal
          let target: any = config;
          for (const part of parts) {
            if (target == null) return undefined;
            target = target[part];
          }
          return target;
        }

        function formatCount(id: string): string {
          const config = getTabConfig();
          const resolved = configLoader.getConfig();
          const val =
            (getNestedValue(config, id) as unknown[] | undefined) ??
            (getNestedValue(resolved, id) as unknown[]) ??
            [];
          return `${val.length} items`;
        }

        // --- Submenu factories ---

        function stringArraySubmenu(
          id: string,
          label: string,
        ): (
          currentValue: string,
          done: (selectedValue?: string) => void,
        ) => ArrayEditor {
          return (_currentValue, submenuDone) => {
            const config = getTabConfig();
            const resolved = configLoader.getConfig();
            const currentItems =
              (getNestedValue(config, id) as string[] | undefined) ??
              (getNestedValue(resolved, id) as string[]) ??
              [];

            return new ArrayEditor({
              label,
              items: [...currentItems],
              theme: settingsTheme,
              onSave: (items) => {
                const updated: GuardrailsConfig = structuredClone(config);
                setNestedValue(updated, id, items);
                void saveTabConfig(activeTab, updated).then((ok) => {
                  if (ok) tui.requestRender();
                });
              },
              onDone: () => {
                submenuDone(formatCount(id));
                settings = buildSettings(activeTab);
                tui.requestRender();
              },
            });
          };
        }

        function patternArraySubmenu(
          id: string,
          label: string,
        ): (
          currentValue: string,
          done: (selectedValue?: string) => void,
        ) => PatternEditor {
          return (_currentValue, submenuDone) => {
            const config = getTabConfig();
            const resolved = configLoader.getConfig();
            const currentPatterns =
              (getNestedValue(config, id) as
                | Array<{ pattern: string; description: string }>
                | undefined) ??
              (getNestedValue(resolved, id) as Array<{
                pattern: string;
                description: string;
              }>) ??
              [];

            return new PatternEditor({
              label,
              items: [...currentPatterns],
              theme: settingsTheme,
              onSave: (patterns) => {
                const updated: GuardrailsConfig = structuredClone(config);
                setNestedValue(updated, id, patterns);
                void saveTabConfig(activeTab, updated).then((ok) => {
                  if (ok) tui.requestRender();
                });
              },
              onDone: () => {
                submenuDone(formatCount(id));
                settings = buildSettings(activeTab);
                tui.requestRender();
              },
            });
          };
        }

        // --- Build sections ---

        function buildSettings(tab: Tab): SectionedSettings {
          const config =
            tab === "local"
              ? configLoader.getProjectConfig()
              : configLoader.getGlobalConfig();
          const resolved = configLoader.getConfig();

          const sections: SettingsSection[] = [
            {
              label: "Features",
              items: [
                {
                  id: "features.preventBrew",
                  label: "Prevent Homebrew",
                  description: "Block brew commands",
                  currentValue:
                    (config.features?.preventBrew ??
                    resolved.features.preventBrew)
                      ? "enabled"
                      : "disabled",
                  values: ["enabled", "disabled"],
                },
                {
                  id: "features.protectEnvFiles",
                  label: "Protect .env files",
                  description: "Block access to .env files containing secrets",
                  currentValue:
                    (config.features?.protectEnvFiles ??
                    resolved.features.protectEnvFiles)
                      ? "enabled"
                      : "disabled",
                  values: ["enabled", "disabled"],
                },
                {
                  id: "features.permissionGate",
                  label: "Permission gate",
                  description:
                    "Prompt for confirmation on dangerous commands (rm -rf, sudo, etc.)",
                  currentValue:
                    (config.features?.permissionGate ??
                    resolved.features.permissionGate)
                      ? "enabled"
                      : "disabled",
                  values: ["enabled", "disabled"],
                },
              ],
            },
            {
              label: "Env Files",
              items: [
                {
                  id: "envFiles.onlyBlockIfExists",
                  label: "Only block existing files",
                  description:
                    "Only block .env file access if the file exists on disk",
                  currentValue:
                    (config.envFiles?.onlyBlockIfExists ??
                    resolved.envFiles.onlyBlockIfExists)
                      ? "on"
                      : "off",
                  values: ["on", "off"],
                },
                {
                  id: "envFiles.protectedPatterns",
                  label: "Protected patterns",
                  description:
                    "Regex patterns for files to protect (e.g. \\.env$)",
                  currentValue: formatCount("envFiles.protectedPatterns"),
                  submenu: stringArraySubmenu(
                    "envFiles.protectedPatterns",
                    "Protected Patterns",
                  ),
                },
                {
                  id: "envFiles.allowedPatterns",
                  label: "Allowed patterns",
                  description:
                    "Regex patterns for exceptions (e.g. \\.env\\.example$)",
                  currentValue: formatCount("envFiles.allowedPatterns"),
                  submenu: stringArraySubmenu(
                    "envFiles.allowedPatterns",
                    "Allowed Patterns",
                  ),
                },
                {
                  id: "envFiles.protectedDirectories",
                  label: "Protected directories",
                  description: "Regex patterns for directories to protect",
                  currentValue: formatCount("envFiles.protectedDirectories"),
                  submenu: stringArraySubmenu(
                    "envFiles.protectedDirectories",
                    "Protected Directories",
                  ),
                },
                {
                  id: "envFiles.protectedTools",
                  label: "Protected tools",
                  description:
                    "Tools to intercept (read, write, edit, bash, grep, find, ls)",
                  currentValue: formatCount("envFiles.protectedTools"),
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
                    (config.permissionGate?.requireConfirmation ??
                    resolved.permissionGate.requireConfirmation)
                      ? "on"
                      : "off",
                  values: ["on", "off"],
                },
                {
                  id: "permissionGate.patterns",
                  label: "Dangerous patterns",
                  description:
                    "Command patterns that trigger the permission gate",
                  currentValue: formatCount("permissionGate.patterns"),
                  submenu: patternArraySubmenu(
                    "permissionGate.patterns",
                    "Dangerous Patterns",
                  ),
                },
                {
                  id: "permissionGate.allowedPatterns",
                  label: "Allowed commands",
                  description:
                    "Regex patterns that bypass the permission gate entirely",
                  currentValue: formatCount("permissionGate.allowedPatterns"),
                  submenu: stringArraySubmenu(
                    "permissionGate.allowedPatterns",
                    "Allowed Commands",
                  ),
                },
                {
                  id: "permissionGate.autoDenyPatterns",
                  label: "Auto-deny patterns",
                  description:
                    "Regex patterns that are blocked immediately without dialog",
                  currentValue: formatCount("permissionGate.autoDenyPatterns"),
                  submenu: stringArraySubmenu(
                    "permissionGate.autoDenyPatterns",
                    "Auto-Deny Patterns",
                  ),
                },
              ],
            },
          ];

          return new SectionedSettings(
            sections,
            15,
            settingsTheme,
            (id, newValue) => {
              void handleSettingChange(tab, id, newValue);
            },
            () => done(undefined),
            { enableSearch: true },
          );
        }

        // --- Change handler ---

        async function handleSettingChange(
          tab: Tab,
          id: string,
          newValue: string,
        ): Promise<void> {
          const config =
            tab === "local"
              ? configLoader.getProjectConfig()
              : configLoader.getGlobalConfig();
          const updated: GuardrailsConfig = structuredClone(config);

          // Boolean toggles only - array saves handled by submenus
          if (
            newValue === "enabled" ||
            newValue === "disabled" ||
            newValue === "on" ||
            newValue === "off"
          ) {
            const boolVal = newValue === "enabled" || newValue === "on";
            setNestedValue(updated, id, boolVal);

            const ok = await saveTabConfig(tab, updated);
            if (ok) {
              settings = buildSettings(activeTab);
              tui.requestRender();
            }
          }
        }

        // --- Tab rendering ---

        function renderTabs(): string[] {
          const localLabel =
            activeTab === "local"
              ? theme.bg("selectedBg", theme.fg("accent", " Local "))
              : theme.fg("dim", " Local ");
          const globalLabel =
            activeTab === "global"
              ? theme.bg("selectedBg", theme.fg("accent", " Global "))
              : theme.fg("dim", " Global ");

          return ["", `  ${localLabel}  ${globalLabel}`, ""];
        }

        function handleTabSwitch(data: string): boolean {
          if (matchesKey(data, Key.tab) || matchesKey(data, Key.shift("tab"))) {
            activeTab = activeTab === "local" ? "global" : "local";
            settings = buildSettings(activeTab);
            tui.requestRender();
            return true;
          }
          return false;
        }

        // --- Init ---

        settings = buildSettings(activeTab);

        return {
          render(width: number) {
            const lines: string[] = [];
            lines.push(theme.fg("accent", theme.bold("Guardrails Settings")));
            lines.push(...renderTabs());
            lines.push(...(settings?.render(width) ?? []));
            return lines;
          },
          invalidate() {
            settings?.invalidate?.();
          },
          handleInput(data: string) {
            // Don't switch tabs when a submenu is active (it needs Tab)
            if (!settings?.hasActiveSubmenu() && handleTabSwitch(data)) return;
            settings?.handleInput?.(data);
            tui.requestRender();
          },
        };
      });
    },
  });
}
