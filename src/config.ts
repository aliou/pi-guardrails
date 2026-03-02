/**
 * Configuration schema for the guardrails extension.
 *
 * GuardrailsConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */

/**
 * A pattern with explicit matching mode.
 * Default: glob for files, substring for commands.
 * regex: true means full regex matching.
 */
export interface PatternConfig {
  pattern: string;
  regex?: boolean;
}

/**
 * Permission gate pattern. When regex is false (default), the pattern
 * is matched as substring against the raw command string.
 * When regex is true, uses full regex against the raw string.
 */
export interface DangerousPattern extends PatternConfig {
  description: string;
}

/**
 * Protection level for a policy rule.
 */
export type Protection = "none" | "readOnly" | "noAccess";

/**
 * A named policy rule. Matches files by patterns and enforces a protection level.
 */
export interface PolicyRule {
  /** Stable identifier used for deduplication across scopes. */
  id: string;
  /** Optional display name for settings/UI. */
  name?: string;
  /** Human-readable description. */
  description?: string;
  /** File patterns to protect. */
  patterns: PatternConfig[];
  /** Optional exceptions. */
  allowedPatterns?: PatternConfig[];
  /** Protection level. */
  protection: Protection;
  /** Block only when file exists on disk. Default true. */
  onlyIfExists?: boolean;
  /** Message shown when blocked; supports {file} placeholder. */
  blockMessage?: string;
  /** Per-rule toggle. Default true. */
  enabled?: boolean;
}

export interface GuardrailsConfig {
  version?: string;
  enabled?: boolean;
  features?: {
    policies?: boolean;
    permissionGate?: boolean;
    // Deprecated. Kept only for migration.
    protectEnvFiles?: boolean;
  };
  policies?: {
    rules?: PolicyRule[];
  };
  // Deprecated. Kept only for migration.
  envFiles?: {
    protectedPatterns?: PatternConfig[];
    allowedPatterns?: PatternConfig[];
    protectedDirectories?: PatternConfig[];
    protectedTools?: string[];
    onlyBlockIfExists?: boolean;
    blockMessage?: string;
  };
  permissionGate?: {
    patterns?: DangerousPattern[];
    /** If set, replaces the default patterns entirely. */
    customPatterns?: DangerousPattern[];
    requireConfirmation?: boolean;
    allowedPatterns?: PatternConfig[];
    autoDenyPatterns?: PatternConfig[];
    explainCommands?: boolean;
    explainModel?: string;
    explainTimeout?: number;
  };
}

export interface ResolvedConfig {
  version: string;
  enabled: boolean;
  features: {
    policies: boolean;
    permissionGate: boolean;
  };
  policies: {
    rules: PolicyRule[];
  };
  permissionGate: {
    patterns: DangerousPattern[];
    /** When true, use hardcoded structural matchers for built-in patterns.
     *  Set to false when customPatterns replaces the defaults. */
    useBuiltinMatchers: boolean;
    requireConfirmation: boolean;
    allowedPatterns: PatternConfig[];
    autoDenyPatterns: PatternConfig[];
    explainCommands: boolean;
    explainModel: string | null;
    explainTimeout: number;
  };
}

import { ConfigLoader, type Migration } from "@aliou/pi-utils-settings";
import {
  backupConfig,
  CURRENT_VERSION,
  migrateEnvFilesToPolicies,
  migrateV0,
  needsEnvFilesToPoliciesMigration,
  needsMigration,
} from "./utils/migration";
import { pendingWarnings } from "./utils/warnings";

/**
 * Config fields removed in the toolchain extraction.
 * Old configs containing these are auto-cleaned on first load.
 */
const REMOVED_FEATURE_KEYS = [
  "preventBrew",
  "preventPython",
  "enforcePackageManager",
] as const;

function hasRemovedFields(config: GuardrailsConfig): boolean {
  const raw = config as Record<string, unknown>;
  const features = raw.features as Record<string, unknown> | undefined;
  if (features) {
    for (const key of REMOVED_FEATURE_KEYS) {
      if (key in features) return true;
    }
  }
  return "packageManager" in raw;
}

function stripRemovedFields(config: GuardrailsConfig): GuardrailsConfig {
  const cleaned = structuredClone(config) as Record<string, unknown>;
  const features = cleaned.features as Record<string, unknown> | undefined;
  if (features) {
    for (const key of REMOVED_FEATURE_KEYS) {
      delete features[key];
    }
  }
  delete cleaned.packageManager;
  cleaned.version = CURRENT_VERSION;
  return cleaned as GuardrailsConfig;
}

const migrations: Migration<GuardrailsConfig>[] = [
  {
    name: "v0-format-upgrade",
    shouldRun: (config) => needsMigration(config),
    run: async (config, filePath) => {
      await backupConfig(filePath);
      return migrateV0(config);
    },
  },
  {
    name: "strip-toolchain-fields",
    shouldRun: (config) => hasRemovedFields(config),
    run: (config) => {
      pendingWarnings.push(
        "[guardrails] preventBrew, preventPython, enforcePackageManager, and packageManager " +
          "have been removed from guardrails and moved to @aliou/pi-toolchain. " +
          "These fields will be stripped from your config.",
      );
      return stripRemovedFields(config);
    },
  },
  {
    name: "envFiles-to-policies",
    shouldRun: (config) => needsEnvFilesToPoliciesMigration(config),
    run: (config) => migrateEnvFilesToPolicies(config),
  },
];

const DEFAULT_CONFIG: ResolvedConfig = {
  version: CURRENT_VERSION,
  enabled: true,
  features: {
    policies: true,
    permissionGate: true,
  },
  policies: {
    rules: [
      {
        id: "secret-files",
        description: "Files containing secrets",
        patterns: [
          { pattern: ".env" },
          { pattern: ".env.local" },
          { pattern: ".env.production" },
          { pattern: ".env.prod" },
          { pattern: ".dev.vars" },
        ],
        allowedPatterns: [
          { pattern: "*.example.env" },
          { pattern: "*.sample.env" },
          { pattern: "*.test.env" },
          { pattern: ".env.example" },
          { pattern: ".env.sample" },
          { pattern: ".env.test" },
        ],
        protection: "noAccess",
        onlyIfExists: true,
        blockMessage:
          "Accessing {file} is not allowed. This file contains secrets. " +
          "Explain to the user why you want to access this file, and if changes are needed ask the user to make them.",
      },
    ],
  },
  permissionGate: {
    patterns: [
      { pattern: "rm -rf", description: "recursive force delete" },
      { pattern: "sudo", description: "superuser command" },
      { pattern: "dd if=", description: "disk write operation" },
      { pattern: "mkfs.", description: "filesystem format" },
      {
        pattern: "chmod -R 777",
        description: "insecure recursive permissions",
      },
      { pattern: "chown -R", description: "recursive ownership change" },
    ],
    useBuiltinMatchers: true,
    requireConfirmation: true,
    allowedPatterns: [],
    autoDenyPatterns: [],
    explainCommands: false,
    explainModel: null,
    explainTimeout: 5000,
  },
};

export const configLoader = new ConfigLoader<GuardrailsConfig, ResolvedConfig>(
  "guardrails",
  DEFAULT_CONFIG,
  {
    scopes: ["global", "local", "memory"],
    migrations,
    afterMerge: (resolved, global, local, memory) => {
      const ruleMap = new Map<string, PolicyRule>();

      for (const rule of DEFAULT_CONFIG.policies.rules) {
        ruleMap.set(rule.id, rule);
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

      // customPatterns replaces the entire patterns array and disables
      // built-in structural matchers (user owns all matching).
      // Priority: memory > local > global
      const customPatterns =
        memory?.permissionGate?.customPatterns ??
        local?.permissionGate?.customPatterns ??
        global?.permissionGate?.customPatterns;
      if (customPatterns) {
        resolved.permissionGate.patterns = customPatterns;
        resolved.permissionGate.useBuiltinMatchers = false;
      }
      return resolved;
    },
  },
);
