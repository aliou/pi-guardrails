import { getNestedValue, setNestedValue } from "@aliou/pi-utils-settings";
import type {
  GuardrailsConfig,
  PatternConfig,
  PolicyRule,
  Protection,
} from "../../../../src/shared/config";

export interface NewPolicyRuleDraft {
  name: string;
  id: string;
  protection: Protection;
  patterns: PatternConfig[];
}

export function toKebabCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function countItems(config: GuardrailsConfig, id: string): string {
  const val = (getNestedValue(config, id) as unknown[] | undefined) ?? [];
  return `${val.length} items`;
}

export function setConfigValue(
  config: GuardrailsConfig,
  id: string,
  value: unknown,
): GuardrailsConfig {
  const updated = structuredClone(config);
  setNestedValue(updated, id, value);
  return updated;
}

export function getPolicyRules(config: GuardrailsConfig): PolicyRule[] {
  return config.policies?.rules?.map((rule) => ({ ...rule })) ?? [];
}

export function setPolicyRules(
  config: GuardrailsConfig,
  rules: PolicyRule[],
): GuardrailsConfig {
  const updated = structuredClone(config);
  updated.policies = {
    ...(updated.policies ?? {}),
    rules,
  };
  return updated;
}

export function updatePolicyRule(
  config: GuardrailsConfig,
  index: number,
  updater: (rule: PolicyRule) => PolicyRule,
): GuardrailsConfig {
  const rules = getPolicyRules(config);
  const existing = rules[index];
  if (!existing) return config;
  rules[index] = updater(existing);
  return setPolicyRules(config, rules);
}

export function deletePolicyRule(
  config: GuardrailsConfig,
  index: number,
): GuardrailsConfig {
  const rules = getPolicyRules(config);
  if (!rules[index]) return config;
  rules.splice(index, 1);
  return setPolicyRules(config, rules);
}

export function addPolicyRuleDraft(
  config: GuardrailsConfig,
  draft: NewPolicyRuleDraft,
): { config: GuardrailsConfig; index: number | null } {
  const normalizedName = draft.name.trim();
  if (!normalizedName || draft.patterns.length === 0) {
    return { config, index: null };
  }

  const rules = getPolicyRules(config);
  const baseId = toKebabCase(draft.id || normalizedName) || "policy";
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
    patterns: draft.patterns,
    protection: draft.protection,
    onlyIfExists: true,
    enabled: true,
  });

  return { config: setPolicyRules(config, rules), index: rules.length - 1 };
}
