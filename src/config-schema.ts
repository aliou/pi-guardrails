/**
 * Configuration schema for the guardrails extension.
 *
 * GuardrailsConfig is the user-facing schema (all fields optional).
 * ResolvedConfig is the internal schema (all fields required, defaults applied).
 */

export interface GuardrailsConfig {
  enabled?: boolean;
  features?: {
    preventBrew?: boolean;
    protectEnvFiles?: boolean;
    permissionGate?: boolean;
  };
  envFiles?: {
    protectedPatterns?: string[];
    allowedPatterns?: string[];
    protectedDirectories?: string[];
    protectedTools?: string[];
    onlyBlockIfExists?: boolean;
    blockMessage?: string;
  };
  permissionGate?: {
    patterns?: Array<{ pattern: string; description: string }>;
    /** If set, replaces the default patterns entirely. */
    customPatterns?: Array<{ pattern: string; description: string }>;
    requireConfirmation?: boolean;
    allowedPatterns?: string[];
    autoDenyPatterns?: string[];
  };
}

export interface ResolvedConfig {
  enabled: boolean;
  features: {
    preventBrew: boolean;
    protectEnvFiles: boolean;
    permissionGate: boolean;
  };
  envFiles: {
    protectedPatterns: string[];
    allowedPatterns: string[];
    protectedDirectories: string[];
    protectedTools: string[];
    onlyBlockIfExists: boolean;
    blockMessage: string;
  };
  permissionGate: {
    patterns: Array<{ pattern: string; description: string }>;
    requireConfirmation: boolean;
    allowedPatterns: string[];
    autoDenyPatterns: string[];
  };
}
