import { ConfigLoader, type Migration } from "@aliou/pi-utils-settings";
import type { GuardrailsConfig, ResolvedConfig } from "./config-schema";
import {
  backupConfig,
  CURRENT_VERSION,
  migrateV0,
  needsMigration,
} from "./migration";

/**
 * Config fields removed in the toolchain extraction.
 * Old configs containing these are auto-cleaned on first load.
 */
const REMOVED_FEATURE_KEYS = [
  "preventBrew",
  "preventPython",
  "enforcePackageManager",
] as const;

const TOOLCHAIN_MIGRATION_VERSION = "0.7.0-20260204";

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
  cleaned.version = TOOLCHAIN_MIGRATION_VERSION;
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
      const version = (config as Record<string, unknown>).version as
        | string
        | undefined;
      if (!version || version < TOOLCHAIN_MIGRATION_VERSION) {
        console.error(
          "[guardrails] preventBrew, preventPython, enforcePackageManager, and packageManager " +
            "have been removed from guardrails and moved to @aliou/pi-toolchain. " +
            "These fields will be stripped from your config.",
        );
      }
      return stripRemovedFields(config);
    },
  },
];

const DEFAULT_CONFIG: ResolvedConfig = {
  version: CURRENT_VERSION,
  enabled: true,
  features: {
    protectEnvFiles: true,
    permissionGate: true,
  },
  envFiles: {
    protectedPatterns: [
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
    protectedDirectories: [],
    protectedTools: ["read", "write", "edit", "bash", "grep", "find", "ls"],
    onlyBlockIfExists: true,
    blockMessage:
      "Accessing {file} is not allowed. Environment files containing secrets are protected. " +
      "Explain to the user why you want to access this .env file, and if changes are needed ask the user to make them. " +
      "Only .env.example, .env.sample, or .env.test files can be accessed.",
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
  },
};

export const configLoader = new ConfigLoader<GuardrailsConfig, ResolvedConfig>(
  "guardrails",
  DEFAULT_CONFIG,
  {
    migrations,
    afterMerge: (resolved, global, project) => {
      // customPatterns replaces the entire patterns array and disables
      // built-in structural matchers (user owns all matching).
      if (project?.permissionGate?.customPatterns) {
        resolved.permissionGate.patterns =
          project.permissionGate.customPatterns;
        resolved.permissionGate.useBuiltinMatchers = false;
      } else if (global?.permissionGate?.customPatterns) {
        resolved.permissionGate.patterns = global.permissionGate.customPatterns;
        resolved.permissionGate.useBuiltinMatchers = false;
      }
      return resolved;
    },
  },
);
