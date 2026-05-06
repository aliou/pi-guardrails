import { ConfigLoader } from "@aliou/pi-utils-settings";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations, normalizeAllowedPaths } from "./migration";
import type { GuardrailsConfig, PolicyRule, ResolvedConfig } from "./types";

export const configLoader = new ConfigLoader<GuardrailsConfig, ResolvedConfig>(
  "guardrails",
  DEFAULT_CONFIG,
  {
    scopes: ["global", "local", "memory"],
    migrations,
    afterMerge: (resolved, global, local, memory) => {
      const ruleMap = new Map<string, PolicyRule>();

      if (resolved.applyBuiltinDefaults) {
        for (const rule of DEFAULT_CONFIG.policies.rules) {
          ruleMap.set(rule.id, rule);
        }
      }
      if (global?.policies?.rules) {
        for (const rule of global.policies.rules) {
          ruleMap.set(rule.id, rule);
        }
      }
      if (local?.policies?.rules) {
        for (const rule of local.policies.rules) {
          ruleMap.set(rule.id, rule);
        }
      }
      if (memory?.policies?.rules) {
        for (const rule of memory.policies.rules) {
          ruleMap.set(rule.id, rule);
        }
      }
      resolved.policies.rules = [...ruleMap.values()];

      const customPatterns =
        memory?.permissionGate?.customPatterns ??
        local?.permissionGate?.customPatterns ??
        global?.permissionGate?.customPatterns;
      if (customPatterns) {
        resolved.permissionGate.patterns = customPatterns;
        resolved.permissionGate.useBuiltinMatchers = false;
      }

      const mergedPaths = new Set<string>();
      for (const paths of [
        global?.pathAccess?.allowedPaths,
        local?.pathAccess?.allowedPaths,
        memory?.pathAccess?.allowedPaths,
      ]) {
        for (const p of normalizeAllowedPaths(paths)) mergedPaths.add(p);
      }
      resolved.pathAccess.allowedPaths = [...mergedPaths];

      return resolved;
    },
  },
);
