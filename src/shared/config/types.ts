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
  /** When a blocked call matches this pattern, hint the agent to end its turn instead of retrying (pi >= 0.84.1). Only used by consumers that block on match. */
  terminate?: boolean;
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
  /**
   * Skip location-anchored patterns (`~`- or `/`-prefixed globs) for targets
   * inside the session's cwd. Basename globs, relative path globs, and regex
   * patterns still apply. Default true.
   */
  respectCwd?: boolean;
  /** Message shown when blocked; supports {file} placeholder. */
  blockMessage?: string;
  /** Per-rule toggle. Default true. */
  enabled?: boolean;
}

export type PathAccessMode = "allow" | "ask" | "block";

/**
 * Where "Allow … always" grants from the prompt are persisted.
 * - `local`: project config (`{project}/.pi/extensions/guardrails.json`).
 * - `global`: user-wide config (`~/.pi/agent/extensions/guardrails.json`),
 *   so the same grant applies in every project.
 */
export type PathAccessAlwaysScope = "local" | "global";

/**
 * Which operations the outside-workspace gate applies to.
 * - `all`: gate every tool call that touches a path outside cwd (default).
 * - `write`: gate only writes. Read-only tools (`read`, `grep`, `find`, `ls`)
 *   pass freely, so skill/config files outside the project stay readable.
 *   Bash commands are still gated: a command can write.
 */
export type PathAccessApplyTo = "all" | "write";

export interface PathAccessConfig {
  mode?: PathAccessMode;
  /** Which operations the gate applies to. Default: "all". */
  applyTo?: PathAccessApplyTo;
  /**
   * Paths always allowed, regardless of cwd. Each entry carries an explicit
   * `kind`: `file` matches the exact path, `directory` matches the directory
   * and its descendants.
   */
  allowedPaths?: AllowedPath[];
  /** Config scope used when the user picks "Allow … always" in the prompt. Default: "local". */
  alwaysScope?: PathAccessAlwaysScope;
}

/**
 * How the built-in classifier delegate uses its models.
 * - `fallback`: try models in order; the first one that answers decides.
 * - `random`: like fallback, starting from a random model each time.
 * - `consensus`: ask every model; any block blocks, all must allow to allow,
 *   anything else asks you.
 */
export type ClassifierStrategy = "fallback" | "random" | "consensus";

export interface DelegationConfig {
  /** How long delegates get to decide before the action escalates to you, in milliseconds. Default: 10000. */
  timeoutMs?: number;
}

export interface ClassifierConfig {
  /**
   * Classifier models as `provider/model` (e.g. `typesafe/jev-latest`).
   * The first `/` separates the provider from the model id.
   */
  models?: string[];
  /** How to use several models. Default: "fallback". */
  strategy?: ClassifierStrategy;
}

export interface GuardrailsConfig {
  /** JSON Schema URL for editor autocomplete and validation. Added automatically when Guardrails writes the file. */
  $schema?: string;
  /** Package semver marker for migration/debugging. */
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
    /** Package semver marker stored when onboarding completed. */
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
  /** Settings for delegating would-be prompts to registered decision delegates. */
  delegation?: DelegationConfig;
  /** Built-in classifier delegate. Enable with `features.classifier`. */
  classifier?: ClassifierConfig;
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
    applyTo: PathAccessApplyTo;
    allowedPaths: AllowedPath[];
    alwaysScope: PathAccessAlwaysScope;
  };
  delegation: {
    timeoutMs: number;
  };
  classifier: {
    models: string[];
    strategy: ClassifierStrategy;
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
