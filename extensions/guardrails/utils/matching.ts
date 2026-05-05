/**
 * Pattern compilation for guardrails matching.
 *
 * Two contexts with different default semantics:
 * - File context: default is glob matching against filename.
 * - Command context: default is substring matching against raw command string.
 *
 * Both support `regex: true` for full regex matching.
 */

import { matchesGlob } from "node:path";
import type { PatternConfig } from "../config";
import { pendingWarnings } from "./warnings";

export interface CompiledPattern {
  test: (input: string) => boolean;
  source: PatternConfig;
}

/**
 * Normalize file paths before matching.
 * - Use forward slashes for cross-platform consistency.
 * - Drop leading "./" segments.
 * - Collapse duplicate slashes.
 */
export function normalizeFilePath(input: string): string {
  const normalized = input
    .replaceAll("\\", "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/\/{2,}/g, "/");
  return normalized;
}

/**
 * Compile a single pattern for file-context matching.
 * Default: glob matching.
 * - If pattern includes `/`, match full normalized relative path.
 * - Otherwise, match basename only (backward compatible).
 * regex: true -> full regex (case-insensitive) against normalized path.
 */
export function compileFilePattern(config: PatternConfig): CompiledPattern {
  if (config.regex) {
    try {
      const re = new RegExp(config.pattern, "i");
      return {
        test: (input) => re.test(normalizeFilePath(input)),
        source: config,
      };
    } catch {
      pendingWarnings.push(
        `Invalid regex in guardrails config: ${config.pattern}`,
      );
      return { test: () => false, source: config };
    }
  }

  const matchFullPath = config.pattern.includes("/");

  return {
    test: (input) => {
      const normalized = normalizeFilePath(input);
      const candidate = matchFullPath
        ? normalized
        : (normalized.split("/").pop() ?? normalized);

      return matchesGlob(candidate, config.pattern);
    },
    source: config,
  };
}

/**
 * Compile a single pattern for command-context matching.
 * Default: substring match against raw command string.
 * regex: true -> full regex against raw command string.
 */
export function compileCommandPattern(config: PatternConfig): CompiledPattern {
  if (config.regex) {
    try {
      const re = new RegExp(config.pattern);
      return { test: (input) => re.test(input), source: config };
    } catch {
      pendingWarnings.push(
        `Invalid regex in guardrails config: ${config.pattern}`,
      );
      return { test: () => false, source: config };
    }
  }

  return {
    test: (input) => input.includes(config.pattern),
    source: config,
  };
}

/**
 * Compile an array of patterns for file-context matching.
 */
export function compileFilePatterns(
  configs: PatternConfig[],
): CompiledPattern[] {
  return configs.map(compileFilePattern);
}

/**
 * Compile an array of patterns for command-context matching.
 */
export function compileCommandPatterns(
  configs: PatternConfig[],
): CompiledPattern[] {
  return configs.map(compileCommandPattern);
}
