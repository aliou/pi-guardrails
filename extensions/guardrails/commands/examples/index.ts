import {
  registerSettingsCommand,
  type SettingsSection,
} from "@aliou/pi-utils-settings";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { SettingItem } from "@earendil-works/pi-tui";
import type {
  GuardrailsConfig,
  ResolvedConfig,
} from "../../../../src/shared/config";
import { configLoader } from "../../../../src/shared/config";
import {
  appendDangerousPattern,
  appendPolicyRule,
  COMMAND_EXAMPLES,
  POLICY_EXAMPLES,
} from "../settings/examples";
import { ScopePickerSubmenu } from "../settings/scope-picker-submenu";

export function registerGuardrailsExamplesCommand(pi: ExtensionAPI): void {
  registerSettingsCommand<GuardrailsConfig, ResolvedConfig>(pi, {
    commandName: "guardrails:examples",
    commandDescription: "Apply guardrails example presets",
    title: "Guardrails Examples",
    configStore: configLoader,
    buildSections: () => [],
    extraTabs: [
      {
        id: "examples",
        label: "Examples",
        buildSections: ({
          enabledScopes,
          getDraftForScope,
          getRawForScope,
          setDraftForScope,
          theme,
        }): SettingsSection[] => {
          const policyItems: SettingItem[] = POLICY_EXAMPLES.map((example) => ({
            id: `examples.${example.rule.id}`,
            label: `  ${example.label}`,
            description: example.description,
            currentValue: "apply",
            submenu: (_val: string, submenuDone: (v?: string) => void) =>
              new ScopePickerSubmenu(
                theme,
                enabledScopes,
                (targetScope) => {
                  const baseConfig =
                    getDraftForScope(targetScope) ??
                    getRawForScope(targetScope) ??
                    null;
                  setDraftForScope(
                    targetScope,
                    appendPolicyRule(baseConfig, example.rule),
                  );
                },
                submenuDone,
              ),
          }));

          const commandItems: SettingItem[] = COMMAND_EXAMPLES.map(
            (example) => ({
              id: `examples.cmd.${example.pattern.pattern}`,
              label: `  ${example.label}`,
              description: example.description,
              currentValue: "add",
              submenu: (_val: string, submenuDone: (v?: string) => void) =>
                new ScopePickerSubmenu(
                  theme,
                  enabledScopes,
                  (targetScope) => {
                    const baseConfig =
                      getDraftForScope(targetScope) ??
                      getRawForScope(targetScope) ??
                      null;
                    setDraftForScope(
                      targetScope,
                      appendDangerousPattern(baseConfig, example.pattern),
                    );
                  },
                  submenuDone,
                ),
            }),
          );

          return [
            { label: "File policy presets", items: policyItems },
            { label: "Dangerous command presets", items: commandItems },
          ];
        },
      },
    ],
  });
}
