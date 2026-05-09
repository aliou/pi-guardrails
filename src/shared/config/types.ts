/**
 * Configuration schema for the guardrails extension.
 *
 * GuardrailsConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */
import type { GuardrailsFeatureId } from "../events";

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

export type PathAccessMode = "allow" | "ask" | "block";

export interface PathAccessConfig {
  mode?: PathAccessMode;
  allowedPaths?: string[];
}

export interface GuardrailsConfig {
  version?: string;
  enabled?: boolean;
  /** Deprecated-defaults bridge: when true, applies built-in policy defaults. */
  applyBuiltinDefaults?: boolean;
  onboarding?: {
    completed?: boolean;
    completedAt?: string;
    version?: string;
  };
  features?: Partial<Record<GuardrailsFeatureId, boolean>> & {
    // Deprecated. Kept only for migration.
    protectEnvFiles?: boolean;
  };
  policies?: {
    rules?: PolicyRule[];
  };
  pathAccess?: PathAccessConfig;
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
  };
}

export interface ResolvedConfig {
  version: string;
  enabled: boolean;
  applyBuiltinDefaults: boolean;
  features: Record<GuardrailsFeatureId, boolean>;
  policies: {
    rules: PolicyRule[];
  };
  pathAccess: {
    mode: PathAccessMode;
    allowedPaths: string[];
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
