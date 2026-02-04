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

export interface GuardrailsConfig {
  version?: string;
  enabled?: boolean;
  features?: {
    preventBrew?: boolean;
    preventPython?: boolean;
    protectEnvFiles?: boolean;
    permissionGate?: boolean;
    enforcePackageManager?: boolean;
  };
  packageManager?: {
    selected?: "bun" | "pnpm" | "npm";
  };
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
  };
}

export interface ResolvedConfig {
  version: string;
  enabled: boolean;
  features: {
    preventBrew: boolean;
    preventPython: boolean;
    protectEnvFiles: boolean;
    permissionGate: boolean;
    enforcePackageManager: boolean;
  };
  packageManager: {
    selected: "bun" | "pnpm" | "npm";
  };
  envFiles: {
    protectedPatterns: PatternConfig[];
    allowedPatterns: PatternConfig[];
    protectedDirectories: PatternConfig[];
    protectedTools: string[];
    onlyBlockIfExists: boolean;
    blockMessage: string;
  };
  permissionGate: {
    patterns: DangerousPattern[];
    /** When true, use hardcoded structural matchers for built-in patterns.
     *  Set to false when customPatterns replaces the defaults. */
    useBuiltinMatchers: boolean;
    requireConfirmation: boolean;
    allowedPatterns: PatternConfig[];
    autoDenyPatterns: PatternConfig[];
  };
}
