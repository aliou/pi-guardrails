import {
  buildSchemaUrl,
  ConfigLoader,
  type Scope,
} from "@aliou/pi-utils-settings";
import pkg from "../../../package.json" with { type: "json" };
import type { AllowedPath } from "../../core/paths/path";
import { DEFAULT_CONFIG } from "./defaults";
import { migrations } from "./migration";
import type { GuardrailsConfig, PolicyRule, ResolvedConfig } from "./types";

class GuardrailsConfigLoader extends ConfigLoader<
  GuardrailsConfig,
  ResolvedConfig
> {
  override async save(scope: Scope, config: GuardrailsConfig): Promise<void> {
    await super.save(scope, ensureConfigVersion(config));
  }
}

function ensureConfigVersion(config: GuardrailsConfig): GuardrailsConfig {
  if (typeof config.version === "string" && config.version.trim()) {
    return config;
  }
  return { ...config, version: pkg.version };
}

function mergePatternArrays<T extends { pattern: string }>(
  ...lists: (T[] | undefined)[]
): T[] {
  const merged = new Map<string, T>();
  for (const list of lists) {
    for (const entry of list ?? []) {
      merged.set(entry.pattern, entry);
    }
  }
  return [...merged.values()];
}

export function createGuardrailsConfigLoader(): GuardrailsConfigLoader {
  return new GuardrailsConfigLoader("guardrails", DEFAULT_CONFIG, {
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

      // Pattern arrays union across scopes by `pattern`; customPatterns
      // still replaces patterns wholesale.
      const customPatterns =
        memory?.permissionGate?.customPatterns ??
        local?.permissionGate?.customPatterns ??
        global?.permissionGate?.customPatterns;
      if (customPatterns) {
        resolved.permissionGate.patterns = customPatterns;
        resolved.permissionGate.useBuiltinMatchers = false;
      } else {
        resolved.permissionGate.patterns = mergePatternArrays(
          DEFAULT_CONFIG.permissionGate.patterns,
          global?.permissionGate?.patterns,
          local?.permissionGate?.patterns,
          memory?.permissionGate?.patterns,
        );
      }

      resolved.permissionGate.allowedPatterns = mergePatternArrays(
        global?.permissionGate?.allowedPatterns,
        local?.permissionGate?.allowedPatterns,
        memory?.permissionGate?.allowedPatterns,
      );

      resolved.permissionGate.autoDenyPatterns = mergePatternArrays(
        global?.permissionGate?.autoDenyPatterns,
        local?.permissionGate?.autoDenyPatterns,
        memory?.permissionGate?.autoDenyPatterns,
      );

      const mergedPaths = new Map<string, AllowedPath>();
      for (const paths of [
        global?.pathAccess?.allowedPaths,
        local?.pathAccess?.allowedPaths,
        memory?.pathAccess?.allowedPaths,
      ]) {
        for (const entry of paths ?? []) {
          if (!entry || typeof entry !== "object") continue;
          const path = typeof entry.path === "string" ? entry.path.trim() : "";
          if (!path) continue;
          const kind = entry.kind === "directory" ? "directory" : "file";
          mergedPaths.set(`${kind}:${path}`, { kind, path });
        }
      }
      resolved.pathAccess.allowedPaths = [...mergedPaths.values()];

      // alwaysScope: highest-priority scope wins (memory > local > global).
      // Invalid values are ignored so they cannot leak through the base
      // deep merge into the resolved config.
      const alwaysScope = [memory, local, global]
        .map((scope) => scope?.pathAccess?.alwaysScope)
        .find((value) => value === "local" || value === "global");
      resolved.pathAccess.alwaysScope = alwaysScope ?? "local";

      return resolved;
    },
  });
}

export const configLoader = createGuardrailsConfigLoader();
