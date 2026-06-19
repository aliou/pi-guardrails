/**
 * Configuration schema for the guardrails extension.
 *
 * GuardrailsConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */
import type { GuardrailsFeatureId } from "../events";

/**
 * A path grant with an explicit kind. Re-exported from the core path module so
 * config consumers can import it from one place.
 */
export type { AllowedPath } from "../../core/paths/path";

import type { AllowedPath } from "../../core/paths/path";

/**
 * A pattern with explicit matching mode.
 * Default: glob for files, substring for commands.
 * regex: true means full regex matching.
 */
export interface PatternConfig {
  pattern: string;
  /** Optional description surfaced to the agent when the pattern triggers (e.g. auto-deny reason). */
  description?: string;
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
  /**
   * Paths always allowed, regardless of cwd. Each entry carries an explicit
   * `kind`: `file` matches the exact path, `directory` matches the directory
   * and its descendants.
   */
  allowedPaths?: AllowedPath[];
}

export interface GuardrailsConfig {
  /** JSON Schema URL for editor autocomplete and validation. Added automatically when Guardrails writes the file. */
  $schema?: string;
  /** Internal config schema marker for migration/debugging. Not tied to the package version. */
  version?: string;
  /** Enable or disable all Guardrails checks. */
  enabled?: boolean;
  /** When true, include Guardrails built-in policy rules before user rules are merged. */
  applyBuiltinDefaults?: boolean;
  /** Tracks whether the setup wizard has been completed. Usually managed by Guardrails. */
  onboarding?: {
    /** Whether onboarding is complete. */
    completed?: boolean;
    /** ISO timestamp for when onboarding completed. */
    completedAt?: string;
    /** Guardrails config schema marker used when onboarding completed. */
    version?: string;
  };
  /** Enable or disable individual Guardrails feature extensions. */
  features?: Partial<Record<GuardrailsFeatureId, boolean>> & {
    // Deprecated. Kept only for migration.
    protectEnvFiles?: boolean;
  };
  /** File protection policies. */
  policies?: {
    /** Named policy rules. Rules with the same id override earlier rules across scopes. */
    rules?: PolicyRule[];
  };
  /** Outside-workspace path access settings. */
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
  /** Dangerous bash command detection and confirmation settings. */
  permissionGate?: {
    /** Additional dangerous command patterns. */
    patterns?: DangerousPattern[];
    /** If set, replaces the default dangerous command patterns entirely. */
    customPatterns?: DangerousPattern[];
    /** When true, prompt before running dangerous commands. When false, only warn. */
    requireConfirmation?: boolean;
    /** Command patterns that bypass dangerous command prompts. */
    allowedPatterns?: PatternConfig[];
    /** Command patterns that are always blocked without prompting. */
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
    allowedPaths: AllowedPath[];
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
