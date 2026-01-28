import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import type { GuardrailsConfig, ResolvedConfig } from "./config-schema";

const GLOBAL_CONFIG_PATH = resolve(
  homedir(),
  ".pi/agent/extensions/guardrails.json",
);
const PROJECT_CONFIG_PATH = resolve(
  process.cwd(),
  ".pi/extensions/guardrails.json",
);

const DEFAULT_CONFIG: ResolvedConfig = {
  enabled: true,
  features: {
    preventBrew: false,
    preventPython: false,
    protectEnvFiles: true,
    permissionGate: true,
  },
  envFiles: {
    protectedPatterns: ["\\.env$", "\\.env\\.local$"],
    allowedPatterns: [
      "\\.(example|sample|test)\\.env$",
      "\\.env\\.(example|sample|test)$",
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
      { pattern: "rm\\s+-rf", description: "recursive force delete" },
      { pattern: "\\bsudo\\b", description: "superuser command" },
      { pattern: ":\\s*\\|\\s*sh", description: "piped shell execution" },
      { pattern: "\\bdd\\s+if=", description: "disk write operation" },
      { pattern: "mkfs\\.", description: "filesystem format" },
      {
        pattern: "\\bchmod\\s+-R\\s+777",
        description: "insecure recursive permissions",
      },
      {
        pattern: "\\bchown\\s+-R",
        description: "recursive ownership change",
      },
    ],
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
    this.resolved = this.mergeConfigs();
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

    // customPatterns replaces entire patterns array
    if (this.projectConfig?.permissionGate?.customPatterns) {
      merged.permissionGate.patterns =
        this.projectConfig.permissionGate.customPatterns;
    } else if (this.globalConfig?.permissionGate?.customPatterns) {
      merged.permissionGate.patterns =
        this.globalConfig.permissionGate.customPatterns;
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
