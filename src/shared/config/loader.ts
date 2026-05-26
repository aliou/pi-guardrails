import { buildSchemaUrl, ConfigLoader } from "@aliou/pi-utils-settings";
import pkg from "../../../package.json" with { type: "json" };
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type {
  GuardrailsConfig,
  IgnoredBashArgRule,
  PolicyRule,
  ResolvedConfig,
} from "./types";

export const configLoader = new ConfigLoader<GuardrailsConfig, ResolvedConfig>(
  "guardrails",
  DEFAULT_CONFIG,
  {
    scopes: ["global", "local", "memory"],
    migrations,
    schemaUrl: buildSchemaUrl(pkg.name, pkg.version),
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
        for (const path of paths ?? []) {
          const trimmed = path.trim();
          if (trimmed) mergedPaths.add(trimmed);
        }
      }
      resolved.pathAccess.allowedPaths = [...mergedPaths];

      const ignoredBashArgs = new Map<string, IgnoredBashArgRule>();
      for (const rules of [
        global?.pathAccess?.ignoredBashArgs,
        local?.pathAccess?.ignoredBashArgs,
        memory?.pathAccess?.ignoredBashArgs,
      ]) {
        for (const rule of rules ?? []) {
          const command = String(rule.command ?? "").trim();
          const argPattern = String(rule.argPattern ?? "").trim();
          if (!command || !argPattern) continue;
          const normalized = { ...rule, command, argPattern };
          ignoredBashArgs.set(JSON.stringify(normalized), normalized);
        }
      }
      resolved.pathAccess.ignoredBashArgs = [...ignoredBashArgs.values()];

      return resolved;
    },
  },
);
