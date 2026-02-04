import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import type { GuardrailsConfig, ResolvedConfig } from "./config-schema";
import {
  backupConfig,
  CURRENT_VERSION,
  migrateV0,
  needsMigration,
} from "./migration";

const GLOBAL_CONFIG_PATH = resolve(getAgentDir(), "extensions/guardrails.json");
const PROJECT_CONFIG_PATH = resolve(
  process.cwd(),
  ".pi/extensions/guardrails.json",
);

const DEFAULT_CONFIG: ResolvedConfig = {
  version: CURRENT_VERSION,
  enabled: true,
  features: {
    preventBrew: false,
    preventPython: false,
    protectEnvFiles: true,
    permissionGate: true,
    enforcePackageManager: false,
  },
  packageManager: {
    selected: "npm",
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

class ConfigLoader {
  private globalConfig: GuardrailsConfig | null = null;
  private projectConfig: GuardrailsConfig | null = null;
  private resolved: ResolvedConfig | null = null;

  async load(): Promise<void> {
    this.globalConfig = await this.loadConfigFile(GLOBAL_CONFIG_PATH);
    this.projectConfig = await this.loadConfigFile(PROJECT_CONFIG_PATH);

    // Migrate v0 configs
    if (this.globalConfig && needsMigration(this.globalConfig)) {
      await this.migrateConfigFile(GLOBAL_CONFIG_PATH, this.globalConfig);
      this.globalConfig = await this.loadConfigFile(GLOBAL_CONFIG_PATH);
    }
    if (this.projectConfig && needsMigration(this.projectConfig)) {
      await this.migrateConfigFile(PROJECT_CONFIG_PATH, this.projectConfig);
      this.projectConfig = await this.loadConfigFile(PROJECT_CONFIG_PATH);
    }

    this.resolved = this.mergeConfigs();
  }

  private async migrateConfigFile(
    path: string,
    config: GuardrailsConfig,
  ): Promise<void> {
    await backupConfig(path);
    const migrated = migrateV0(config);
    try {
      await this.saveConfigFile(path, migrated);
    } catch {
      // Can't write -- use migrated version in memory only
    }
  }

  private async loadConfigFile(path: string): Promise<GuardrailsConfig | null> {
    try {
      const content = await readFile(path, "utf-8");
      return JSON.parse(content) as GuardrailsConfig;
    } catch {
      return null;
    }
  }

  private mergeConfigs(): ResolvedConfig {
    const merged = structuredClone(DEFAULT_CONFIG);

    if (this.globalConfig) {
      this.mergeInto(merged, this.globalConfig);
    }
    if (this.projectConfig) {
      this.mergeInto(merged, this.projectConfig);
    }

    // customPatterns replaces entire patterns array and disables
    // built-in structural matchers (user owns all matching)
    if (this.projectConfig?.permissionGate?.customPatterns) {
      merged.permissionGate.patterns =
        this.projectConfig.permissionGate.customPatterns;
      merged.permissionGate.useBuiltinMatchers = false;
    } else if (this.globalConfig?.permissionGate?.customPatterns) {
      merged.permissionGate.patterns =
        this.globalConfig.permissionGate.customPatterns;
      merged.permissionGate.useBuiltinMatchers = false;
    }

    return merged;
  }

  private mergeInto<TTarget extends object, TSource extends object>(
    target: TTarget,
    source: TSource,
  ): void {
    const t = target as Record<string, unknown>;
    const s = source as Record<string, unknown>;

    for (const key in s) {
      if (s[key] === undefined) continue;

      if (
        typeof s[key] === "object" &&
        !Array.isArray(s[key]) &&
        s[key] !== null
      ) {
        if (!t[key]) t[key] = {};
        this.mergeInto(t[key] as object, s[key] as object);
      } else {
        t[key] = s[key];
      }
    }
  }

  getConfig(): ResolvedConfig {
    if (!this.resolved) {
      throw new Error("Config not loaded. Call load() first.");
    }
    return this.resolved;
  }

  async saveGlobal(config: GuardrailsConfig): Promise<void> {
    await this.saveConfigFile(GLOBAL_CONFIG_PATH, config);
    await this.load();
  }

  async saveProject(config: GuardrailsConfig): Promise<void> {
    await this.saveConfigFile(PROJECT_CONFIG_PATH, config);
    await this.load();
  }

  private async saveConfigFile(
    path: string,
    config: GuardrailsConfig,
  ): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
  }

  hasGlobalConfig(): boolean {
    return this.globalConfig !== null;
  }

  hasProjectConfig(): boolean {
    return this.projectConfig !== null;
  }

  getGlobalConfig(): GuardrailsConfig {
    return this.globalConfig ?? {};
  }

  getProjectConfig(): GuardrailsConfig {
    return this.projectConfig ?? {};
  }
}

export const configLoader = new ConfigLoader();
